import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from selection import charger_criteres, classer, contient_mot, motif_interdit, valeur_nutrition

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

    def test_valeur_nutrition(self):
        self.assertEqual(valeur_nutrition({"nutriscore_score": -5}), 46)
        self.assertIsNone(valeur_nutrition({}))

    def test_classement_nutrition(self):
        # B coûte plus cher au kilo mais est bien meilleur : il gagne au rapport nutrition / prix.
        a = {"nom": "A", "prix_unite": "10", "off": {"nutriscore_score": 20}}   # 21 / 10 = 2,1
        b = {"nom": "B", "prix_unite": "12", "off": {"nutriscore_score": 0}}    # 41 / 12 = 3,4
        mode, gardes, _ = classer([a, b], CRITERES)
        self.assertEqual(mode, "nutrition")
        self.assertEqual([g["nom"] for g in gardes], ["B", "A"])

    def test_repli_prix_kilo_et_label(self):
        a = {"nom": "A", "prix_unite": "10", "off": {"nutriscore_score": 0}}
        b = {"nom": "B bio", "prix_unite": "10.3", "off": {}}                     # nutrition inconnue
        c = {"nom": "C nestle", "marque": "NESTLE", "prix_unite": "1"}
        mode, gardes, exclus = classer([a, b, c], CRITERES)
        self.assertEqual(mode, "prix_kg")
        self.assertEqual([g["nom"] for g in gardes], ["B bio", "A"])  # 3 % plus cher, mais bio
        self.assertEqual(exclus[0]["exclu"], "marque nestle")


if __name__ == "__main__":
    unittest.main()
