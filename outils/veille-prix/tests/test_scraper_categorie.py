import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import magasins
from scraper_categorie import decoder_payload, lignes_auchan, lignes_produits, suivante_auchan


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

    def test_vignette_auchan(self):
        html = ('<article itemscope class="product-thumbnail" data-id="1"><a href="/lays-chips/pr-C1">'
                '<meta itemprop="image" content="https://cdn/x.jpg?a=1&amp;b=2">'
                '<p class="product-thumbnail__description" itemprop="name description"><strong itemprop="brand">LAY\'S</strong>'
                ' Chips barbecue</p><span class="product-attribute" aria-label="Contenance : 135g">135g</span>'
                '<span data-x="1">8,59€ / kg</span></a><span class="product-discount-label">-50% sur le 2ème</span>'
                '<meta itemprop="price" content="1.16"><meta itemprop="availability" content="https://schema.org/InStock">'
                '</article><article class="product-thumbnail" data-list="KAMINO-Category-top"><a href="/pub/pr-C2">'
                '<meta itemprop="price" content="9.99"></a></article>'
                '<a aria-label="Aller sur la page suivante" href="?page=2">')
        (l,) = lignes_auchan(html)
        self.assertEqual((l["nom"], l["prix"], l["prix_unite"], l["unite"], l["marque"]),
                         ("LAY'S Chips barbecue 135g", 1.16, 8.59, "kg", "LAY'S"))
        self.assertEqual((l["promo"], l["disponible"], l["image"]), ("-50% sur le 2ème", True, "https://cdn/x.jpg?a=1&b=2"))
        self.assertEqual(suivante_auchan(html, "https://www.auchan.fr/epicerie-salee/ca-n06"),
                         "https://www.auchan.fr/epicerie-salee/ca-n06?page=2")


class TestMagasins(unittest.TestCase):
    def test_drive_le_plus_proche_distances_en_texte(self):
        liste = [{"ref": "a", "distance": "0.21", "driveTypes": {"1": "pieton"}},
                 {"ref": "b", "distance": "10.5", "driveTypes": {"2": "drive"}},
                 {"ref": "c", "distance": "1.89", "driveTypes": {"3": "drive"}}]
        self.assertEqual(magasins.plus_proche(liste, magasins.carrefour_est_drive)["ref"], "c")
        self.assertIsNone(magasins.plus_proche(liste[:1], magasins.carrefour_est_drive))

    def test_cartes_auchan(self):
        cartes = [{"i": -1, "texte": "Drive Auchan Drive Pessac 33600 Pessac dès Mardi 27 octobre 08:30 2.44 km Infos"},
                  {"i": 0, "texte": "Drive Auchan Drive Supermarché Robinson 33700 Mérignac dès Mardi 5.16 km Choisir"},
                  {"i": 1, "texte": "Livraison à domicile Pessac dès Mardi Choisir"}]
        self.assertEqual(magasins.auchan_cartes(cartes), [
            {"i": -1, "distance": 2.44, "nom": "Auchan Drive Pessac"},
            {"i": 0, "distance": 5.16, "nom": "Auchan Drive Supermarché Robinson"}])


if __name__ == "__main__":
    unittest.main()
