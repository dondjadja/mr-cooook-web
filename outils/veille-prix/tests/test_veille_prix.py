"""Tests de l'étape 1 : python3 -m unittest discover -s tests (depuis outils/veille-prix)."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import veille_prix as vp  # noqa: E402

RECETTES_TEST = '''
const PLACARD_FIXE = ["riz", "œufs"];
const RECETTES_V1 = [
  {
    id: "wok",
    nom: "Wok",
    ingredients: [
      { nom: "Riz", quantite: 400, unite: "g", rayon: "épicerie" },
      { nom: "gingembre", quantite: 30, unite: "g", rayon: "fruits et légumes" }
    ],
    garnitures: [
      { nom: "Piment séché", cout_gout: 1, cout_nutrition: 0, cout_prix: 0 }
    ]
  },
  {
    id: "omelette",
    ingredients: [
      { nom: "œufs", quantite: 10, unite: "pièce", rayon: "crèmerie" }
    ]
  }
];
'''


class Normalisation(unittest.TestCase):
    def test_cle_ignore_casse_accents_ligatures(self):
        self.assertEqual(vp.cle_ingredient("  Œufs  Frais "), "oeufs frais")
        self.assertEqual(vp.cle_ingredient("Bœuf"), vp.cle_ingredient("boeuf"))
        self.assertEqual(vp.cle_ingredient("épinards"), "epinards")

    def test_quantite_de_base(self):
        self.assertEqual(vp.quantite_de_base(1.5, "kg"), (1500, "g"))
        self.assertEqual(vp.quantite_de_base(75, "cl"), (750, "ml"))
        self.assertEqual(vp.quantite_de_base(6, "pièces"), (6, "pièce"))
        with self.assertRaises(ValueError):
            vp.quantite_de_base(1, "boîte")

    def test_prix_par_unite(self):
        self.assertEqual(vp.prix_par_unite(2.0, 500, "g"), (4.0, "€/kg"))
        self.assertEqual(vp.prix_par_unite(3.0, 75, "cl"), (4.0, "€/L"))
        self.assertEqual(vp.prix_par_unite(3.0, 12, "pièce"), (0.25, "€/pièce"))


class Sources(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())

    def ecrire(self, nom, texte):
        chemin = self.dossier / nom
        chemin.write_text(texte, encoding="utf-8")
        return chemin

    def test_lire_recettes_ignore_les_garnitures(self):
        lignes, placard = vp.lire_recettes(self.ecrire("r.js", RECETTES_TEST))
        self.assertEqual([(l[0], l[4]) for l in lignes], [("Riz", "wok"), ("gingembre", "wok"), ("œufs", "omelette")])
        self.assertEqual(placard, ["riz", "œufs"])

    def test_lire_vraies_recettes_du_repo(self):
        lignes, placard = vp.lire_recettes(vp.RECETTES_DEFAUT)
        self.assertGreater(len(lignes), 0)
        self.assertTrue(all(l[4] for l in lignes), "chaque ingrédient doit être rattaché à une recette")
        self.assertEqual(len(placard), 10)

    def test_lire_courses_markdown(self):
        chemin = self.ecrire("c.md", "## Courses\n\n### Frais\n- [ ] ×2 Riz\n- [x] lait\nbeurre\n")
        self.assertEqual(vp.lire_courses(chemin), ["Riz", "lait", "beurre"])


class Import(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.recettes = self.dossier / "r.js"
        self.recettes.write_text(RECETTES_TEST, encoding="utf-8")
        self.permanente = self.dossier / "p.csv"
        self.permanente.write_text("nom,quantite,unite,rayon,note\ncafé moulu,250,g,épicerie,\n", encoding="utf-8")
        self.corr = self.dossier / "c.csv"
        self.con = vp.ouvrir(":memory:")

    def importer(self, lignes_corr):
        self.corr.write_text("ingredient,enseigne,libelle,url,contenance,unite,prix_cible\n" + lignes_corr,
                             encoding="utf-8")
        return vp.importer(self.con, self.recettes, self.permanente, self.corr)

    def test_fusion_des_sources(self):
        alertes = self.importer("riz,Carrefour,Riz long 1 kg,https://ex/riz,1,kg,1.5\n")
        self.assertEqual(alertes, [])
        lignes = {l[0]: l for l in vp.liste_unifiee(self.con)}
        self.assertEqual(set(lignes), {"Riz", "gingembre", "œufs", "café moulu"})
        self.assertEqual(set(lignes["Riz"][2].split(",")), {"recette", "placard"})
        self.assertEqual(lignes["Riz"][4], "carrefour")
        self.assertIsNone(lignes["gingembre"][4])

    def test_lignes_invalides_signalees(self):
        alertes = self.importer("riz,Lidl,x,https://ex/1,1,kg,\n"
                                "riz,auchan,x,,1,kg,\n"
                                "riz,auchan,x,https://ex/2,1,boîte,\n"
                                "chocolat,joybuy,x,https://ex/3,100,g,\n")
        self.assertEqual(len(alertes), 4)
        self.assertIn("enseigne inconnue", alertes[0])
        self.assertIn("obligatoires", alertes[1])
        self.assertIn("unité inconnue", alertes[2])
        self.assertIn("aucune liste", alertes[3])

    def test_reimport_garde_l_historique(self):
        self.importer("riz,carrefour,Riz,https://ex/riz,1,kg,\n")
        pid = self.con.execute("SELECT id FROM produits").fetchone()[0]
        self.con.execute("INSERT INTO releves (produit_id, date, prix, statut) VALUES (?, '2026-10-20', 1.9, 'ok')", (pid,))
        self.importer("riz,carrefour,Riz basmati,https://ex/riz,1,kg,1.8\n")
        self.assertEqual(self.con.execute("SELECT id, libelle FROM produits").fetchall(), [(pid, "Riz basmati")])
        self.importer("")  # produit retiré du CSV : désactivé, relevé conservé
        self.assertEqual(self.con.execute("SELECT actif FROM produits").fetchone()[0], 0)
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM releves").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
