import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from selection import charger_criteres, charger_grilles, classer, contient_mot, motif_interdit, note_agent

CRITERES = charger_criteres()


class TestSelection(unittest.TestCase):
    def test_mot_entier(self):
        self.assertTrue(contient_mot("Céréales LION caramel", "lion"))
        self.assertFalse(contient_mot("Biscuits Lionel", "lion"))
        self.assertTrue(contient_mot("Café NESCAFÉ", "nescafe"))

    def test_interdits(self):
        self.assertEqual(motif_interdit({"nom": "Purée", "marque": "MOUSLINE"}, CRITERES), "marque mousline")
        self.assertEqual(motif_interdit({"nom": "Pâte à tartiner"}, CRITERES,
                                        {"ingredients_analysis_tags": ["en:palm-oil"]}), "huile de palme")
        self.assertEqual(motif_interdit({"nom": "Riz", "marque": "X"}, CRITERES, {"brands": "Nestlé"}), "marque nestle")
        self.assertIsNone(motif_interdit({"nom": "Chips nature", "marque": "LAY'S"}, CRITERES))

    def test_agent_sans_avis(self):
        grilles = charger_grilles()
        self.assertEqual(note_agent(grilles["prendsunfruit"], {"nom": "12 oeufs plein air"}, {})[0], None)
        self.assertEqual(note_agent(grilles["tomcooks"], {"nom": "6 oeufs cage code 3"}, {})[0], -3)
        self.assertEqual(note_agent(grilles["joffturner"], {"nom": "Jambon"}, {"additives_tags": ["en:e250"]})[0], -3)

    def test_oeufs(self):
        # Produits fictifs. Prix 70, Tom 15, Nutri 10, France 20, Label 10, Bio 15 ; les deux autres agents sans avis.
        bio = {"nom": "6 oeufs bio France", "prix_unite": "0.47", "unite": "piece", "off": {"nutriscore_grade": "a"}}
        cage = {"nom": "12 oeufs cage France", "prix_unite": "0.25", "unite": "piece", "off": {"nutriscore_grade": "a"}}
        nestle = {"nom": "Oeufs", "marque": "NESTLE", "prix_unite": "0.10", "unite": "piece"}
        gardes, exclus = classer([bio, cage, nestle], CRITERES)
        notes = {g["nom"]: g["note"] for g in gardes}
        # cage : prix 1×70 + Tom 0 + Nutri 10 + France 20 = 100/140 ; bio : 0,53×70 + 12,5 + 10 + 20 + 15 = 94,7/140 ≈ 67,7
        self.assertAlmostEqual(notes["12 oeufs cage France"], 71.4, places=1)
        self.assertAlmostEqual(notes["6 oeufs bio France"], 67.7, places=1)
        self.assertEqual(exclus[0]["exclu"], "marque nestle")


if __name__ == "__main__":
    unittest.main()
