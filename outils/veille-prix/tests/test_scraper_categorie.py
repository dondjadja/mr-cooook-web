import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scraper_categorie import decoder_payload, lignes_produits


class TestScraperCategorie(unittest.TestCase):
    def test_payload_aplati(self):
        self.assertEqual(decoder_payload(json.dumps([{"a": 1, "b": 2}, "x", [3], 7])), {"a": "x", "b": [7]})

    def test_ligne_produit_avec_prix_barre(self):
        donnees = {"data": [{"attributes": {
            "title": "Riz basmati", "brand": "TAUREAU AILE", "slug": "riz-basmati", "ean": "123",
            "images": {"paths": ["https://img/p_FORMAT/a.jpeg"]},
            "offers": {"123": {"0261": {"attributes": {
                "availability": {"purchasable": True},
                "price": {"price": 2.5, "perUnit": 2.5, "unitOfMeasure": "KG"},
                "promotion": {"label": "-20 %", "isPrixBarre": True, "messageArgs": {"initialPrice": 3.1}}}}}}}}],
            "links": {}}
        (l,) = lignes_produits(donnees)
        self.assertEqual((l["prix"], l["prix_barre"], l["unite"], l["disponible"]), (2.5, 3.1, "kg", True))
        self.assertEqual(l["url"], "https://www.carrefour.fr/p/riz-basmati-123")
        self.assertEqual(l["image"], "https://img/p_540x540/a.jpeg")

    def test_produit_sans_offre_ignore(self):
        self.assertEqual(lignes_produits({"data": [{"attributes": {"title": "x", "offers": {}}}]}), [])


if __name__ == "__main__":
    unittest.main()
