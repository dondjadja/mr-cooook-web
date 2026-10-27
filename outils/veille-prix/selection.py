"""Les 3 meilleures références pour un besoin (« œufs », « chips »…) parmi les catégories aspirées.

1. retire les interdits (marques, ingrédients : donnees/criteres.json) ;
2. note chaque produit sur 100 : prix au kilo, avis des agents Tom Cooks / Prends un fruit / Joff Turner
   (donnees/grilles_agents.json), Nutri-Score, France, label, bio — poids dans criteres.json ;
   un critère sans donnée est retiré et son poids réparti sur les autres ;
3. garde les 3 meilleures notes. Nutrition et ingrédients : Open Food Facts (par code-barres, sans clé).

    python3 selection.py chips
    python3 selection.py --liste            # chaque produit de donnees/liste_permanente.csv
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
GRILLES = ICI / "donnees" / "grilles_agents.json"
URL_OFF = "https://world.openfoodfacts.org/api/v2/product/{}.json?fields=" \
          "brands,brands_tags,nutriscore_score,nutriscore_grade,ingredients_analysis_tags,labels_tags,origins_tags," \
          "ingredients_text_fr,ingredients_text,additives_tags,nova_group,nutriments"
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


NUTRI = {"a": 1.0, "b": 0.75, "c": 0.5, "d": 0.25, "e": 0.0}


def charger_grilles(chemin=GRILLES):
    g = json.loads(Path(chemin).read_text(encoding="utf-8"))
    return {k: v for k, v in g.items() if not k.startswith("_")}


def _trouve(produit, off, mots):
    """Un des mots est dans le nom, ou (mot « xx:… ») dans les tags labels / origines d'Open Food Facts."""
    tags = (off.get("labels_tags") or []) + (off.get("origins_tags") or [])
    return any(m in tags if ":" in m else contient_mot(produit.get("nom"), m) for m in mots)


def regle_s_applique(regle, produit, off):
    nom = produit.get("nom")
    if "*" not in regle["famille"] and not any(contient_mot(nom, f) for f in regle["famille"]):
        return False
    si = regle.get("si", {})
    ingredients = sans_accents(off.get("ingredients_text_fr") or off.get("ingredients_text"))
    tests = {
        "nom": lambda v: any(contient_mot(nom, m) for m in v),
        "nom_sans": lambda v: not any(contient_mot(nom, m) for m in v),
        "ingredients": lambda v: any(sans_accents(m) in ingredients for m in v),
        "additifs": lambda v: any(a in (off.get("additives_tags") or []) for a in v),
        "labels": lambda v: any(l in (off.get("labels_tags") or []) for l in v),
        "origines": lambda v: _trouve(produit, off, v),
        "nova": lambda v: off.get("nova_group") in v,
        "sucres_min": lambda v: float((off.get("nutriments") or {}).get("sugars_100g", -1)) > v,
    }
    return all(tests[cle](val) for cle, val in si.items())


def note_agent(regles, produit, off):
    """(note de -3 à +3, règles appliquées) ; note None si l'agent n'a aucun avis sur ce produit."""
    appliquees = [r for r in regles if regle_s_applique(r, produit, off)]
    if not appliquees:
        return None, []
    return max(-3, min(3, sum(r["pts"] for r in appliquees))), appliquees


def bien_etre(produit, off, regle):
    """Œufs et viandes : de 0 (cage) à 1 (Label Rouge) ; None pour les autres produits ou sans information."""
    if not regle or not any(contient_mot(produit.get("nom"), f) for f in regle["familles"]):
        return None
    return next((note for mots, note in regle["niveaux"] if _trouve(produit, off, mots)), None)


def criteres_produit(produit, criteres, grilles, prix_min):
    """Chaque critère ramené de 0 à 1 (None = pas de donnée, critère retiré pour ce produit)."""
    off = produit.get("off") or {}
    tags = (off.get("labels_tags") or []) + (off.get("origins_tags") or [])
    c = {"prix": prix_min / produit["prix_unite"] if prix_min and produit.get("prix_unite") else None,
         "nutriscore": NUTRI.get((off.get("nutriscore_grade") or "").lower()),
         "france": 1.0 if _trouve(produit, off, criteres["mots_france"]) else 0.0,
         "label": 1.0 if _trouve(produit, off, criteres["labels_qualite"]) else 0.0,
         "bio": 1.0 if contient_mot(produit.get("nom"), "bio") or "en:organic" in tags else 0.0}
    c["bien_etre"] = bien_etre(produit, off, criteres.get("bien_etre"))
    details = {}
    for agent, regles in grilles.items():
        n, appliquees = note_agent(regles, produit, off)
        c["agent_" + agent] = None if n is None else (n + 3) / 6
        if appliquees:
            details[agent] = f"{n:+d} : " + " ; ".join(r["dit"] for r in appliquees)
    return c, details


def classer(candidats, criteres, grilles=None):
    """candidats : [{nom, marque, prix_unite, unite, enseigne, off}] → (gardés triés par note /100, exclus).
    Le prix se compare entre produits de même unité (kg, l, pièce) : le moins cher vaut 1, deux fois plus cher 0,5."""
    grilles = charger_grilles() if grilles is None else grilles
    gardes, exclus = [], []
    for c in candidats:
        raison = motif_interdit(c, criteres, c.get("off"))
        if raison:
            exclus.append({**c, "exclu": raison})
        else:
            pu = c.get("prix_unite")
            gardes.append({**c, "prix_unite": float(pu) if pu not in (None, "") else None})
    prix_min = {}
    for g in gardes:
        if g["prix_unite"]:
            u = g.get("unite") or ""
            prix_min[u] = min(prix_min.get(u, g["prix_unite"]), g["prix_unite"])
    poids = criteres["poids"]
    for g in gardes:
        g["criteres"], g["avis"] = criteres_produit(g, criteres, grilles, prix_min.get(g.get("unite") or ""))
        presents = {k: v for k, v in g["criteres"].items() if v is not None and k in poids}
        total = sum(poids[k] for k in presents)
        g["note"] = round(100 * sum(poids[k] * v for k, v in presents.items()) / total, 1) if total else 0
    gardes.sort(key=lambda g: -g["note"])
    return gardes, exclus


# --- Open Food Facts (réseau, avec cache) ------------------------------------------------------

_freine = [False]


def lire_off(ean, cache, ouvrir=ouvrir_https):
    """Fiche Open Food Facts d'un code-barres ; {} si inconnue. Gardée dans le cache pour ne pas redemander."""
    if not ean:
        return {}
    if ean in cache and cache[ean].get("_v") == 2:
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
    n = fiche.get("nutriments") or {}
    fiche["nutriments"] = {k: n[k] for k in ("sugars_100g", "salt_100g") if k in n}
    cache[ean] = {**fiche, "_v": 2}
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


ORDRE = ["prix", "bien_etre", "agent_tomcooks", "agent_prendsunfruit", "agent_joffturner", "nutriscore", "france", "label", "bio"]


def top(besoin, fichiers, criteres, cache, sans_reseau, nb=3):
    cands = candidats_pour(besoin, fichiers)
    for c in cands:
        c["off"] = cache.get(c.get("ean"), {}) if sans_reseau else lire_off(c.get("ean"), cache)
    gardes, exclus = classer(cands, criteres)
    print(f"\n■ {besoin} : {len(cands)} produits, {len(exclus)} exclus")
    for i, g in enumerate(gardes[:nb], 1):
        prix = f"{g['prix_unite']:.2f} €/{g.get('unite') or '?'}" if g["prix_unite"] else "prix ?"
        print(f"  {i}. {g['note']:>5.1f}/100  {prix:<12} {g['enseigne']:<9} {g['nom'][:60]}")
        for agent, avis in g["avis"].items():
            print(f"       {agent} {avis[:110]}")
    for e in exclus:
        print(f"     exclu ({e['exclu']}) : {e['enseigne']} {e['nom'][:60]}")
    return gardes, exclus


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("besoin", nargs="?", help="mots à chercher dans le nom du produit, ex. « chips »")
    ap.add_argument("fichiers", nargs="*", type=Path, help="exports CSV (défaut : les plus récents)")
    ap.add_argument("--liste", action="store_true", help="chaque produit de donnees/liste_permanente.csv")
    ap.add_argument("--sans-reseau", action="store_true", help="ne pas interroger Open Food Facts")
    ap.add_argument("--top", type=int, default=3)
    a = ap.parse_args()
    if not a.besoin and not a.liste:
        ap.error("donne un besoin (ex. chips) ou --liste")

    criteres = charger_criteres()
    fichiers = a.fichiers or derniers_exports()
    besoins = [l["nom"] for l in csv.DictReader((ICI / "donnees" / "liste_permanente.csv").open(encoding="utf-8"))] \
        if a.liste else [a.besoin]
    cache = json.loads(CACHE_OFF.read_text()) if CACHE_OFF.exists() else {}
    lignes = []
    for besoin in besoins:
        gardes, exclus = top(besoin, fichiers, criteres, cache, a.sans_reseau, a.top)
        for i, g in enumerate(gardes, 1):
            lignes.append([besoin, i, g["note"], g["enseigne"], g["nom"], g.get("marque"), g.get("prix"), g["prix_unite"],
                           g.get("unite")] + ["" if g["criteres"].get(k) is None else round(g["criteres"][k], 2) for k in ORDRE]
                          + [" | ".join(f"{k} {v}" for k, v in g["avis"].items()), "", g.get("url")])
        for e in exclus:
            lignes.append([besoin, "", "", e["enseigne"], e["nom"], e.get("marque"), e.get("prix"), e.get("prix_unite"),
                           e.get("unite")] + [""] * len(ORDRE) + ["", e["exclu"], e.get("url")])
    if not a.sans_reseau:
        CACHE_OFF.write_text(json.dumps(cache, ensure_ascii=False, indent=1))

    nom = "liste" if a.liste else sans_accents(a.besoin).strip().replace(" ", "-")
    sortie = ICI / "exports" / f"selection_{nom}_{datetime.date.today()}.csv"
    with sortie.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["besoin", "rang", "note", "enseigne", "nom", "marque", "prix", "prix_unite", "unite"] + ORDRE
                   + ["avis_agents", "exclu", "url"])
        w.writerows(lignes)
    print(f"\n→ {sortie.relative_to(ICI)}")


if __name__ == "__main__":
    main()
