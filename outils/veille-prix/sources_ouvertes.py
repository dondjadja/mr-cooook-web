"""Prix venant d'ailleurs que les relevés : base ouverte Open Prices, et fichier de prix trouvés
à la main ou par Claude (captures, recherches web).

Open Prices (Open Food Facts) publie sous licence ouverte des prix relevés par des bénévoles,
interrogeables par code-barres : https://prices.openfoodfacts.org/api/docs
"""
import csv
import json
import urllib.parse
import urllib.request
from pathlib import Path

URL_OPEN_PRICES = "https://prices.openfoodfacts.org/api/v1/prices"
# nom d'enseigne tel qu'il apparaît dans OpenStreetMap (minuscules, sans accents) -> nos codes
MARQUES = {"leclerc": "leclerc", "carrefour": "carrefour", "auchan": "auchan", "intermarche": "intermarche",
           "intermarché": "intermarche", "grand frais": "grandfrais"}


def enseigne_osm(lieu):
    """Code d'enseigne à partir du lieu Open Prices (marque ou nom OpenStreetMap), sinon None."""
    texte = " ".join(str((lieu or {}).get(k) or "") for k in ("osm_brand", "osm_name")).lower()
    return next((code for nom, code in MARQUES.items() if nom in texte), None)


def lire_open_prices(donnees):
    """Réponse JSON de l'API -> [{ean, enseigne, prix, prix_barre, date, ville}] (enseignes connues seulement)."""
    sortie = []
    for p in (donnees or {}).get("items", []):
        ens = enseigne_osm(p.get("location"))
        if ens is None or p.get("price") is None or (p.get("currency") or "EUR") != "EUR":
            continue
        sortie.append({"ean": p.get("product_code"), "enseigne": ens, "prix": float(p["price"]),
                       "prix_barre": p.get("price_without_discount"), "date": p.get("date"),
                       "ville": (p.get("location") or {}).get("osm_address_city")})
    return sortie


def interroger_open_prices(ean, taille=50, ouvrir=urllib.request.urlopen):
    """Derniers prix connus pour un code-barres (réseau requis : à lancer sur ta machine)."""
    url = URL_OPEN_PRICES + "?" + urllib.parse.urlencode({"product_code": ean, "order_by": "-date", "size": taille})
    req = urllib.request.Request(url, headers={"User-Agent": "veille-prix-perso (Mr Cooook)"})
    with ouvrir(req, timeout=30) as r:
        return lire_open_prices(json.loads(r.read().decode("utf-8")))


def lire_releves_externes(chemin):
    """Fichier donnees/releves_externes.csv : date,ingredient,enseigne,prix,prix_barre,source."""
    chemin = Path(chemin)
    if not chemin.exists():
        return []
    with chemin.open(encoding="utf-8", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in l.items() if k} for l in csv.DictReader(f)
                if any((v or "").strip() for v in l.values())]
