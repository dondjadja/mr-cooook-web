"""Tests de l'étape 2 : extraction du prix, comparatif, relevé sur des pages locales."""
import functools
import http.server
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import extraction as ex  # noqa: E402
import rapport  # noqa: E402
import veille_prix as vp  # noqa: E402

PAGE_JSONLD = """<html><head><title>Chorizo Fort Saint Azay 225g</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"BreadcrumbList"},
 {"@type":"Product","name":"Chorizo","gtin13":"3250391234567",
  "offers":{"@type":"Offer","price":"1.89","priceCurrency":"EUR",
            "priceSpecification":[{"@type":"UnitPriceSpecification","priceType":"https://schema.org/StrikethroughPrice","price":2.29}]}}]}
</script></head><body>1,89 €</body></html>"""
PAGE_META = '<html><head><meta property="product:price:amount" content="0.95"></head><body></body></html>'
PAGE_ROBOT = "<html><head><title>Accès refusé</title></head><body><iframe src='https://geo.captcha-delivery.com/'></iframe>DataDome</body></html>"
PAGE_VIDE = "<html><head><title>Produit</title></head><body><span class='prix'>3,79 €</span></body></html>"


class Extraction(unittest.TestCase):
    def test_nombre_prix(self):
        self.assertEqual(ex.nombre_prix("1,89 €"), 1.89)
        self.assertEqual(ex.nombre_prix("1€89"), 1.89)
        self.assertEqual(ex.nombre_prix("Prix : 12.5"), 12.5)
        self.assertEqual(ex.nombre_prix(3), 3.0)
        self.assertIsNone(ex.nombre_prix("épuisé"))

    def test_jsonld_avec_prix_barre_et_ean(self):
        r = ex.prix_depuis_html(PAGE_JSONLD)
        self.assertEqual((r["prix"], r["prix_barre"], r["source"], r["ean"]), (1.89, 2.29, "jsonld", "3250391234567"))

    def test_meta(self):
        self.assertEqual(ex.prix_depuis_html(PAGE_META)["prix"], 0.95)

    def test_rien_de_structure(self):
        self.assertIsNone(ex.prix_depuis_html(PAGE_VIDE)["prix"])

    def test_blocage(self):
        self.assertTrue(ex.page_bloquee(PAGE_ROBOT))
        self.assertTrue(ex.page_bloquee("<html></html>", 403))
        self.assertFalse(ex.page_bloquee(PAGE_VIDE, 200))

    def test_blocage_deguise_en_page_normale(self):
        joybuy = "<html><head><title>403 Interdit | Joybuy</title></head><body>Interruption temporaire du service</body></html>"
        self.assertTrue(ex.page_bloquee(joybuy, 200))

    def test_ean_depuis_url(self):
        self.assertEqual(ex.ean_depuis_url("https://www.carrefour.fr/p/limonade-authentique-ogeu-3119070064359"), "3119070064359")
        self.assertIsNone(ex.ean_depuis_url("https://www.auchan.fr/ogeu-boisson-limonade-sans-sucres/pr-C1836712"))


def base_exemple():
    con = vp.ouvrir(":memory:")
    for cle, nom in [("sauce huitre", "sauce huître"), ("limonade", "limonade")]:
        con.execute("INSERT INTO ingredients (cle, nom) VALUES (?, ?)", (cle, nom))
    produits = [(1, "sauce huitre", "joybuy", "Lee Kum Kee 907 g", "https://j/1", 907, "g"),
                (2, "sauce huitre", "leclerc", "Sauce huître 510 g", "https://l/2", 510, "g"),
                (3, "limonade", "auchan", "Ogeu 1,5 L", "https://a/3", 1.5, "l"),
                (4, "limonade", "leclerc", "Ogeu 1,5 L", "https://l/4", 1.5, "l")]
    con.executemany("INSERT INTO produits (id, cle, enseigne, libelle, url, contenance, unite) VALUES (?, ?, ?, ?, ?, ?, ?)", produits)
    releves = [(1, "2026-10-20T10:00:00", 4.79, "ok"), (2, "2026-10-20T10:01:00", 3.10, "ok"),
               (3, "2026-10-17T10:00:00", 1.10, "ok"), (3, "2026-10-20T10:02:00", 0.95, "ok"),
               (4, "2026-10-20T10:03:00", None, "bloque")]
    con.executemany("INSERT INTO releves (produit_id, date, prix, statut) VALUES (?, ?, ?, ?)", releves)
    return con


CONFIG = {"joybuy": {"frais": 3.99, "seuil_gratuite": 29}, "leclerc": {"frais": 0}, "auchan": {"frais": 0}}


class Comparatif(unittest.TestCase):
    def setUp(self):
        self.lignes = rapport.lignes_rapport(base_exemple())

    def test_dernier_prix_variation_et_etat(self):
        auchan = next(l for l in self.lignes if l["enseigne"] == "auchan")
        self.assertEqual(auchan["prix"], 0.95)
        self.assertAlmostEqual(auchan["variation"], (0.95 - 1.10) / 1.10)
        self.assertAlmostEqual(auchan["unitaire"], 0.95 / 1.5)
        leclerc = next(l for l in self.lignes if l["url"] == "https://l/4")
        self.assertEqual((leclerc["prix"], leclerc["statut"]), (None, "bloque"))

    def test_moins_cher_au_kilo_pas_au_paquet(self):
        # Joybuy 4,79 € / 907 g = 5,28 €/kg ; Leclerc 3,10 € / 510 g = 6,08 €/kg
        self.assertEqual(rapport.meilleures_offres(self.lignes)["sauce huître"]["enseigne"], "joybuy")

    def test_panier_evite_des_frais_qui_coutent_plus_que_l_ecart(self):
        # Joybuy est moins cher au kilo, mais 4,79 + 3,99 de frais > 3,10 chez Leclerc
        p = rapport.panier_optimal(self.lignes, CONFIG)
        self.assertEqual(sorted(c["enseigne"] for c in p["commandes"]), ["auchan", "leclerc"])
        self.assertEqual(p["total"], round(3.10 + 0.95, 2))

    def test_panier_garde_les_frais_sans_alternative(self):
        lignes = [l for l in self.lignes if l["url"] != "https://l/2"]
        p = rapport.panier_optimal(lignes, CONFIG)
        joybuy = next(c for c in p["commandes"] if c["enseigne"] == "joybuy")
        self.assertEqual((joybuy["sous_total"], joybuy["frais"], joybuy["manque"]), (4.79, 3.99, 24.21))
        self.assertEqual(p["total"], round(4.79 + 3.99 + 0.95, 2))

    def test_html_complet(self):
        lignes = [l for l in self.lignes if l["url"] != "https://l/2"]
        page = rapport.generer_html(lignes, CONFIG)
        self.assertIn("Comparatif des prix", page)
        self.assertIn("bloqué (anti-robot)", page)
        self.assertIn("il manque 24,21 €", page)

    def test_ordre_alterne_les_enseignes(self):
        produits = [(i, e, "u%d" % i, "") for i, e in enumerate(["a", "a", "a", "b", "b", "c"])]
        ordre = [p[1] for p in releve_module().ordre_de_passage(produits, graine=1)]
        self.assertEqual(sorted(ordre), sorted(p[1] for p in produits))
        self.assertTrue(all(x != y for x, y in zip(ordre, ordre[1:3])))


class Saisie(unittest.TestCase):
    def setUp(self):
        self.con = base_exemple()

    def test_prix_rattache_au_produit_suivi(self):
        vp.saisir(self.con, "Sauce huître", "joybuy", 4.79, date="2026-10-23T12:00:00")
        l = next(l for l in rapport.lignes_rapport(self.con) if l["url"] == "https://j/1")
        self.assertEqual((l["prix"], l["date"]), (4.79, "2026-10-23T12:00:00"))

    def test_produit_sans_page_cree_et_garde_a_l_import(self):
        vp.saisir(self.con, "oignons", "marche", 2.5, contenance=1, unite="kg")
        vp.saisir(self.con, "oignons", "marche", 2.2, contenance=1, unite="kg")
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM produits WHERE enseigne = 'marche'").fetchone()[0], 1)
        d = Path(tempfile.mkdtemp())
        (d / "c.csv").write_text("ingredient,enseigne,libelle,url,contenance,unite,prix_cible\n", encoding="utf-8")
        vp.importer(self.con, correspondances=d / "c.csv")
        l = next(l for l in rapport.lignes_rapport(self.con) if l["enseigne"] == "marche")
        self.assertEqual((l["prix"], l["unitaire"], l["unite_lib"]), (2.2, 2.2, "€/kg"))

    def test_enseigne_inconnue(self):
        with self.assertRaises(ValueError):
            vp.saisir(self.con, "riz", "lidl", 1.0)


def releve_module():
    import releve
    return releve


def navigateur_disponible():
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    return True


@unittest.skipUnless(navigateur_disponible(), "Playwright non installé")
class ReleveNavigateur(unittest.TestCase):
    """Relevé complet contre des pages servies en local (pas d'accès aux vrais sites)."""

    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        (self.dossier / "jsonld.html").write_text(PAGE_JSONLD, encoding="utf-8")
        (self.dossier / "robot.html").write_text(PAGE_ROBOT, encoding="utf-8")
        (self.dossier / "vide.html").write_text(PAGE_VIDE, encoding="utf-8")
        gestion = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(self.dossier))
        gestion.log_message = lambda *a: None
        self.serveur = http.server.ThreadingHTTPServer(("127.0.0.1", 0), gestion)
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.addCleanup(self.serveur.shutdown)

    def test_releve_complet(self):
        base = "http://127.0.0.1:%d/" % self.serveur.server_port
        con = vp.ouvrir(":memory:")
        con.execute("INSERT INTO ingredients (cle, nom) VALUES ('x', 'x')")
        con.executemany("INSERT INTO produits (cle, enseigne, url) VALUES ('x', ?, ?)",
                        [("leclerc", base + "jsonld.html"), ("carrefour", base + "robot.html"), ("auchan", base + "vide.html")])
        config = {"auchan": {"selecteur_prix": "span.prix"}}
        bilan = releve_module().lancer(con, config, profil=self.dossier / "profil", visible=False,
                                       executable=os.environ.get("VEILLE_CHROMIUM"), pause=(0, 0), ecrire=lambda *_: None)
        self.assertEqual(bilan, {"leclerc": {"ok": 1}, "carrefour": {"bloque": 1}, "auchan": {"ok": 1}})
        prix = dict(con.execute("SELECT p.enseigne, r.prix FROM releves r JOIN produits p ON p.id = r.produit_id"))
        self.assertEqual(prix, {"leclerc": 1.89, "carrefour": None, "auchan": 3.79})
        self.assertEqual(con.execute("SELECT ean FROM produits WHERE enseigne = 'leclerc'").fetchone()[0], "3250391234567")


if __name__ == "__main__":
    unittest.main()
