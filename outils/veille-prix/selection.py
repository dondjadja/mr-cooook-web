"""Choix du meilleur produit pour un besoin (« pâtes », « chips »…) parmi les catégories aspirées.

1. retire les interdits (marques, ingrédients : donnees/criteres.json) ;
2. classe au meilleur rapport nutrition / prix au kilo, la nutrition venant du Nutri-Score
   d'Open Food Facts (base ouverte, lue par code-barres, sans clé) ;
3. si la nutrition manque pour un seul des produits comparés, classe au prix au kilo ou au litre ;
4. les labels (bio, origine France) départagent deux produits à moins de 5 % d'écart.

    python3 selection.py chips              # tous les exports du jour le plus récent par enseigne
    python3 selection.py "pates" --sans-reseau
"""
import argparse
import csv
import datetime
import json
import re
import time
import unicodedata
import urllib.request
from pathlib import Path

from sources_ouvertes import ouvrir_https

ICI = Path(__file__).resolve().parent
CRITERES = ICI / "donnees" / "criteres.json"
CACHE_OFF = ICI / "donnees" / "cache_off.json"
URL_OFF = "https://world.openfoodfacts.org/api/v2/product/{}.json?fields=" \
          "brands,brands_tags,nutriscore_score,nutriscore_grade,ingredients_analysis_tags,labels_tags,origins_tags"
AGENT = "mr-cooook-veille-prix/1.0 (usage personnel)"


def sans_accents(texte):
    return unicodedata.normalize("NFKD", str(texte or "")).encode("ascii", "ignore").decode().lower()


def contient_mot(texte, mot):
    """« lion » trouve « Céréales LION » mais pas « Lionel »."""
    return re.search(r"(?<![a-z0-9])" + re.escape(sans_accents(mot)) + r"(?![a-z0-9])", sans_accents(texte)) is not None


def charger_criteres(chemin=CRITERES):
    return json.loads(Path(chemin).read_text(encoding="utf-8"))


def motif_interdit(produit, criteres, off=None):
    """Raison de l'exclusion (« marque nestle », « huile de palme »), sinon None."""
    off = off or {}
    marques = " ".join([produit.get("marque") or "", produit.get("nom") or "", off.get("brands") or "",
                        " ".join(off.get("brands_tags") or [])])
    for m in criteres.get("interdits_marques", []):
        if contient_mot(marques, m):
            return f"marque {m}"
    if "en:palm-oil" in (off.get("ingredients_analysis_tags") or []):
        return "huile de palme"
    for ing in criteres.get("interdits_ingredients", []):
        if contient_mot(produit.get("nom"), ing):
            return ing
    return None


def valeur_nutrition(off):
    """Points Nutri-Score (bénéfices − malus, de −15 à 40, plus bas = meilleur) → valeur de 1 à 56, plus haut = meilleur."""
    score = (off or {}).get("nutriscore_score")
    return None if score is None else 41 - float(score)


def labels(produit, off=None):
    off = off or {}
    tags = (off.get("labels_tags") or []) + (off.get("origins_tags") or [])
    trouves = []
    if contient_mot(produit.get("nom"), "bio") or "en:organic" in tags:
        trouves.append("bio")
    if any(t in tags for t in ("en:france", "en:made-in-france", "fr:origine-france")) \
            or contient_mot(produit.get("nom"), "origine france"):
        trouves.append("origine france")
    return trouves


def classer(candidats, criteres):
    """candidats : [{nom, marque, prix_unite, unite, magasin, off}] → (mode, gardés triés, exclus).
    mode « nutrition » si tous les gardés ont un Nutri-Score, sinon « prix_kg »."""
    gardes, exclus = [], []
    for c in candidats:
        raison = motif_interdit(c, criteres, c.get("off"))
        if raison:
            exclus.append({**c, "exclu": raison})
        elif c.get("prix_unite") not in (None, ""):
            v = valeur_nutrition(c.get("off"))
            gardes.append({**c, "prix_unite": float(c["prix_unite"]), "nutrition": v, "labels": labels(c, c.get("off")),
                           "ratio": None if v is None else round(v / float(c["prix_unite"]), 2)})
    mode = "nutrition" if gardes and all(g["nutrition"] is not None for g in gardes) else "prix_kg"
    # Score à maximiser ; les labels départagent deux produits à moins de « ecart_label » (5 %).
    for g in gardes:
        base = g["ratio"] if mode == "nutrition" else 1 / g["prix_unite"]
        g["score"] = base * (1 + criteres.get("ecart_label", 0.05) * len(g["labels"]))
    gardes.sort(key=lambda g: -g["score"])
    return mode, gardes, exclus


# --- Open Food Facts (réseau, avec cache) ------------------------------------------------------

_freine = [False]


def lire_off(ean, cache, ouvrir=ouvrir_https):
    """Fiche Open Food Facts d'un code-barres ; {} si inconnue. Gardée dans le cache pour ne pas redemander."""
    if not ean:
        return {}
    if ean in cache:
        return cache[ean]
    if _freine[0]:
        return {}
    req = urllib.request.Request(URL_OFF.format(ean), headers={"User-Agent": AGENT})
    try:
        with ouvrir(req, timeout=20) as r:
            donnees = json.load(r)
        fiche = (donnees.get("product") or {}) if donnees.get("status") == 1 else {}
    except Exception as e:  # réseau absent, code inconnu (404) : on retombe sur le prix au kilo
        if getattr(e, "code", None) == 429:  # « trop de demandes » : on arrête pour ce lancement, le cache reprendra
            _freine[0] = True
            print("  Open Food Facts demande de ralentir : suite au prochain lancement.")
        else:
            print(f"  Open Food Facts {ean} : {e}")
        return {}
    cache[ean] = fiche
    time.sleep(3)  # Open Food Facts limite le nombre de fiches lues par minute
    return fiche


def derniers_exports(dossier=ICI / "exports"):
    """L'export le plus récent de chaque enseigne et catégorie (nom : enseigne_categorie_date.csv)."""
    choisis = {}
    for f in sorted(dossier.glob("*_*_????-??-??.csv")):
        if f.stem.startswith("selection_"):
            continue
        enseigne, categorie, _ = f.stem.rsplit("_", 2) if f.stem.count("_") >= 2 else (f.stem, "", "")
        choisis[(enseigne, categorie)] = f
    return list(choisis.values())


def candidats_pour(besoin, fichiers):
    mots = [m for m in sans_accents(besoin).split() if m]
    sortie = []
    for f in fichiers:
        enseigne = f.stem.split("_")[0]
        for ligne in csv.DictReader(f.open(encoding="utf-8")):
            if ligne.get("disponible") == "False":
                continue
            if all(contient_mot(ligne.get("nom"), m) or m in sans_accents(ligne.get("nom")) for m in mots):
                sortie.append({**ligne, "enseigne": enseigne})
    return sortie


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("besoin", help="mots à chercher dans le nom du produit, ex. « chips »")
    ap.add_argument("fichiers", nargs="*", type=Path, help="exports CSV (défaut : les plus récents)")
    ap.add_argument("--sans-reseau", action="store_true", help="ne pas interroger Open Food Facts")
    ap.add_argument("--top", type=int, default=10)
    a = ap.parse_args()

    criteres = charger_criteres()
    cands = candidats_pour(a.besoin, a.fichiers or derniers_exports())
    cache = json.loads(CACHE_OFF.read_text()) if CACHE_OFF.exists() else {}
    for c in cands:
        c["off"] = cache.get(c.get("ean"), {}) if a.sans_reseau else lire_off(c.get("ean"), cache)
    if not a.sans_reseau:
        CACHE_OFF.write_text(json.dumps(cache, ensure_ascii=False, indent=1))

    mode, gardes, exclus = classer(cands, criteres)
    print(f"\n{len(cands)} produits « {a.besoin} », {len(exclus)} exclus — classement : "
          + ("rapport nutrition / prix au kilo" if mode == "nutrition" else "prix au kilo (nutrition incomplète)"))
    for i, g in enumerate(gardes[: a.top], 1):
        ns = (g["off"].get("nutriscore_grade") or "?").upper()
        print(f"{i:>2}. {g['prix_unite']:>6.2f} €/{g.get('unite') or '?':<2} Nutri {ns}  {g['enseigne']:<9} "
              f"{g['nom'][:60]}{'  [' + ', '.join(g['labels']) + ']' if g['labels'] else ''}")
    for e in exclus:
        print(f"    exclu ({e['exclu']}) : {e['enseigne']} {e['nom'][:60]}")

    sortie = ICI / "exports" / f"selection_{sans_accents(a.besoin).replace(' ', '-')}_{datetime.date.today()}.csv"
    with sortie.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rang", "enseigne", "nom", "marque", "prix", "prix_unite", "unite", "nutriscore", "ratio",
                    "labels", "exclu", "url"])
        for i, g in enumerate(gardes, 1):
            w.writerow([i, g["enseigne"], g["nom"], g.get("marque"), g.get("prix"), g["prix_unite"], g.get("unite"),
                        g["off"].get("nutriscore_grade") or "", g["ratio"] or "", " ; ".join(g["labels"]), "", g.get("url")])
        for e in exclus:
            w.writerow(["", e["enseigne"], e["nom"], e.get("marque"), e.get("prix"), e.get("prix_unite"),
                        e.get("unite"), "", "", "", e["exclu"], e.get("url")])
    print(f"\n→ {sortie.relative_to(ICI)}  (mode : {mode})")


if __name__ == "__main__":
    main()
