"""Tests des sources de prix hors relevé : Open Prices et fichier de prix trouvés ailleurs."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import sources_ouvertes as so  # noqa: E402
import veille_prix as vp  # noqa: E402

REPONSE = {"items": [
    {"product_code": "3119070055104", "price": 0.97, "currency": "EUR", "date": "2026-10-10", "price_without_discount": None,
     "location": {"osm_brand": "Carrefour", "osm_name": "Carrefour Market", "osm_address_city": "Pessac"}},
    {"product_code": "3119070055104", "price": 0.89, "currency": "EUR", "date": "2026-10-12",
     "location": {"osm_brand": "Auchan", "osm_name": "Auchan", "osm_address_city": "Lille"}},
    {"product_code": "3119070055104", "price": 1.2, "currency": "EUR", "date": "2026-10-01",
     "location": {"osm_brand": None, "osm_name": "Épicerie du coin", "osm_address_city": "Pessac"}}]}


def base():
    d = Path(tempfile.mkdtemp())
    (d / "c.csv").write_text(
        "ingredient,enseigne,libelle,url,contenance,unite,prix_cible\n"
        "limonade,carrefour,Ogeu,https://www.carrefour.fr/p/soda-sans-sucres-ogeu-3119070055104,1.5,l,\n"
        "limonade,auchan,Ogeu,https://www.auchan.fr/x/pr-C1,1.5,l,\n", encoding="utf-8")
    con = vp.ouvrir(":memory:")
    vp.importer(con, correspondances=d / "c.csv")
    return con, d


class OpenPrices(unittest.TestCase):
    def test_lecture_garde_les_enseignes_connues(self):
        res = so.lire_open_prices(REPONSE)
        self.assertEqual([(r["enseigne"], r["prix"], r["ville"]) for r in res],
                         [("carrefour", 0.97, "Pessac"), ("auchan", 0.89, "Lille")])

    def test_import_limite_aux_villes_proches_et_sans_doublon(self):
        con, _ = base()
        faux = lambda ean: so.lire_open_prices(REPONSE)  # noqa: E731
        ajoutes, _ = vp.importer_open_prices(con, interroger=faux)
        self.assertEqual(ajoutes, 1)  # Carrefour Pessac ; Auchan Lille écarté
        self.assertEqual(vp.importer_open_prices(con, interroger=faux)[0], 0)
        ajoutes, _ = vp.importer_open_prices(con, villes=None, interroger=faux)
        self.assertEqual(ajoutes, 1)  # Auchan Lille, toute la France

    def test_reseau_absent(self):
        con, _ = base()
        def panne(ean):
            raise OSError("pas de réseau")
        ajoutes, messages = vp.importer_open_prices(con, interroger=panne)
        self.assertEqual(ajoutes, 0)
        self.assertIn("injoignable", messages[0])


class Externes(unittest.TestCase):
    def test_import_rattache_et_dedoublonne(self):
        con, d = base()
        (d / "e.csv").write_text("date,ingredient,enseigne,prix,prix_barre,source\n"
                                 "2026-10-24,limonade,carrefour,0.99,,recherche web\n"
                                 "2026-10-24,limonade,lidl,0.5,,x\n", encoding="utf-8")
        alertes = vp.importer_externes(con, d / "e.csv") + vp.importer_externes(con, d / "e.csv")
        self.assertEqual(con.execute("SELECT prix, origine, date FROM releves").fetchall(),
                         [(0.99, "recherche web", "2026-10-24T12:00:00")])
        self.assertTrue(alertes and all("lidl" in a for a in alertes))

    def test_fichier_du_depot(self):
        con = vp.ouvrir(":memory:")
        vp.importer(con, vp.RECETTES_DEFAUT, vp.PERMANENTE_DEFAUT, vp.CORRESPONDANCES_DEFAUT)
        self.assertEqual(vp.importer_externes(con, vp.EXTERNES_DEFAUT), [])
        self.assertEqual(con.execute("SELECT COUNT(*) FROM releves").fetchone()[0], 4)


if __name__ == "__main__":
    unittest.main()
