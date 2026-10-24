#!/usr/bin/env python3
"""Veille des prix Mr Cooook : liste unifiée, correspondances, relevés et comparatif.

Réunit trois sources de besoins (recettes Mr Cooook, liste permanente, liste de courses
exportée) en une liste d'ingrédients, et relie chaque ingrédient à des produits précis
par enseigne (table de correspondance). Tout est stocké dans une base SQLite locale.
Les commandes importer, liste et manquants n'utilisent que la bibliothèque standard ;
profil, calibrer et releve ont besoin de Playwright (voir README).
"""
import argparse
import csv
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent
RECETTES_DEFAUT = RACINE / "js" / "recettes.js"
PERMANENTE_DEFAUT = ICI / "donnees" / "liste_permanente.csv"
CORRESPONDANCES_DEFAUT = ICI / "donnees" / "correspondances.csv"
BASE_DEFAUT = ICI / "veille.sqlite"
CONFIG_ENSEIGNES = ICI / "donnees" / "enseignes.json"
EXTERNES_DEFAUT = ICI / "donnees" / "releves_externes.csv"
VILLES_PROCHES = ["pessac", "merignac", "talence", "bordeaux", "gradignan", "begles", "villenave-d'ornon", "canejan", "cestas"]

# grandfrais et marche : sans prix en ligne, gardés pour des relevés manuels plus tard
ENSEIGNES = ["auchan", "carrefour", "leclerc", "intermarche", "joybuy", "amazon", "grandfrais", "marche"]
# unité saisie -> (unité de base, facteur)
UNITES = {"g": ("g", 1), "kg": ("g", 1000), "ml": ("ml", 1), "cl": ("ml", 10), "l": ("ml", 1000),
          "piece": ("pièce", 1), "pièce": ("pièce", 1), "pieces": ("pièce", 1), "pièces": ("pièce", 1)}

SCHEMA = """
CREATE TABLE IF NOT EXISTS ingredients (cle TEXT PRIMARY KEY, nom TEXT NOT NULL, rayon TEXT);
CREATE TABLE IF NOT EXISTS besoins (
  id INTEGER PRIMARY KEY, cle TEXT NOT NULL REFERENCES ingredients(cle),
  source TEXT NOT NULL, ref TEXT, quantite REAL, unite TEXT);
CREATE TABLE IF NOT EXISTS produits (
  id INTEGER PRIMARY KEY, cle TEXT NOT NULL REFERENCES ingredients(cle),
  enseigne TEXT NOT NULL, libelle TEXT, url TEXT NOT NULL,
  contenance REAL, unite TEXT, prix_cible REAL, actif INTEGER NOT NULL DEFAULT 1,
  UNIQUE (enseigne, url));
-- remplie à l'étape 2 (relevés automatiques) ; jamais vidée par un import
CREATE TABLE IF NOT EXISTS releves (
  id INTEGER PRIMARY KEY, produit_id INTEGER NOT NULL REFERENCES produits(id),
  date TEXT NOT NULL, prix REAL, prix_barre REAL, statut TEXT NOT NULL, origine TEXT);
"""


# ---------- Normalisation ----------
def cle_ingredient(nom):
    """Clé de rapprochement : minuscules, sans accents ni ligatures, espaces réduits."""
    t = nom.strip().lower().replace("œ", "oe").replace("æ", "ae").replace("’", "'")
    t = "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t)


def quantite_de_base(quantite, unite):
    """(quantité, unité saisie) -> (quantité, unité de base g / ml / pièce). Lève ValueError si inconnue."""
    u = (unite or "").strip().lower()
    if u not in UNITES:
        raise ValueError("unité inconnue : %r" % unite)
    base, facteur = UNITES[u]
    return float(quantite) * facteur, base


def prix_par_unite(prix, contenance, unite):
    """Prix ramené au kg, au litre ou à la pièce : (valeur, libellé)."""
    q, base = quantite_de_base(contenance, unite)
    if q <= 0:
        raise ValueError("contenance nulle")
    if base == "pièce":
        return prix / q, "€/pièce"
    return prix * 1000 / q, "€/kg" if base == "g" else "€/L"


# ---------- Lecture des sources ----------
RE_RECETTE = re.compile(r'^\s{4}id:\s*"([^"]+)"', re.M)
RE_INGREDIENT = re.compile(
    r'\{\s*nom:\s*"([^"]+)",\s*quantite:\s*([\d.]+),\s*unite:\s*"([^"]+)",\s*rayon:\s*"([^"]+)"\s*\}')
RE_PLACARD = re.compile(r"const PLACARD_FIXE\s*=\s*\[(.*?)\];", re.S)


def lire_recettes(chemin):
    """Ingrédients de js/recettes.js : [(nom, quantite, unite, rayon, id_recette)], puis le placard fixe."""
    texte = Path(chemin).read_text(encoding="utf-8")
    debuts = [(m.start(), m.group(1)) for m in RE_RECETTE.finditer(texte)]
    lignes = []
    for m in RE_INGREDIENT.finditer(texte):
        recette = next((rid for pos, rid in reversed(debuts) if pos < m.start()), None)
        lignes.append((m.group(1), float(m.group(2)), m.group(3), m.group(4), recette))
    placard = []
    m = RE_PLACARD.search(texte)
    if m:
        placard = re.findall(r'"([^"]+)"', m.group(1))
    return lignes, placard


def lire_csv(chemin):
    chemin = Path(chemin)
    if not chemin.exists():
        return []
    with chemin.open(encoding="utf-8", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in ligne.items() if k}
                for ligne in csv.DictReader(f) if any((v or "").strip() for v in ligne.values())]


RE_COURSES = re.compile(r"^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?(?:×\d+\s+)?(.+?)\s*$")


def lire_courses(chemin):
    """Liste de courses exportée (texte ou Markdown à cases) : un article par ligne."""
    noms = []
    for ligne in Path(chemin).read_text(encoding="utf-8").splitlines():
        if not ligne.strip() or ligne.lstrip().startswith("#"):
            continue
        m = RE_COURSES.match(ligne)
        if m and m.group(1):
            noms.append(m.group(1))
    return noms


def nombre(texte, defaut=None):
    texte = (texte or "").replace(",", ".").strip()
    return float(texte) if texte else defaut


# ---------- Base ----------
def ouvrir(chemin):
    con = sqlite3.connect(str(chemin))
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    # base créée à l'étape 1 : colonne ajoutée à l'étape 2
    if "ean" not in [c[1] for c in con.execute("PRAGMA table_info(produits)")]:
        con.execute("ALTER TABLE produits ADD COLUMN ean TEXT")
    return con


def importer(con, recettes=None, permanente=None, correspondances=None, courses=None):
    """Reconstruit besoins et produits depuis les sources ; renvoie la liste des avertissements.
    Les relevés sont conservés : un produit garde son id tant que (enseigne, url) ne change pas."""
    alertes = []

    def ingredient(nom, rayon=None):
        cle = cle_ingredient(nom)
        con.execute("INSERT INTO ingredients (cle, nom, rayon) VALUES (?, ?, ?) "
                    "ON CONFLICT(cle) DO UPDATE SET rayon = COALESCE(ingredients.rayon, excluded.rayon)",
                    (cle, nom.strip(), rayon or None))
        return cle

    with con:
        con.execute("DELETE FROM besoins")
        if recettes:
            lignes, placard = lire_recettes(recettes)
            for nom, q, unite, rayon, rid in lignes:
                con.execute("INSERT INTO besoins (cle, source, ref, quantite, unite) VALUES (?, 'recette', ?, ?, ?)",
                            (ingredient(nom, rayon), rid, q, unite))
            for nom in placard:
                con.execute("INSERT INTO besoins (cle, source, ref) VALUES (?, 'placard', 'PLACARD_FIXE')",
                            (ingredient(nom),))
        for i, l in enumerate(lire_csv(permanente) if permanente else [], start=2):
            if not l.get("nom"):
                alertes.append("liste permanente, ligne %d : nom manquant" % i)
                continue
            con.execute("INSERT INTO besoins (cle, source, ref, quantite, unite) VALUES (?, 'permanente', ?, ?, ?)",
                        (ingredient(l["nom"], l.get("rayon")), l.get("note") or None,
                         nombre(l.get("quantite")), l.get("unite") or None))
        for nom in (lire_courses(courses) if courses else []):
            con.execute("INSERT INTO besoins (cle, source) VALUES (?, 'courses')", (ingredient(nom),))

        vus = set()
        for i, l in enumerate(lire_csv(correspondances) if correspondances else [], start=2):
            ou = "correspondances, ligne %d" % i
            enseigne = cle_ingredient(l.get("enseigne", "")).replace(" ", "")
            if enseigne not in ENSEIGNES:
                alertes.append("%s : enseigne inconnue %r (attendu : %s)" % (ou, l.get("enseigne"), ", ".join(ENSEIGNES)))
                continue
            if not l.get("ingredient") or not l.get("url"):
                alertes.append("%s : ingredient et url sont obligatoires" % ou)
                continue
            try:
                contenance = nombre(l.get("contenance"))
                if contenance is not None:
                    quantite_de_base(contenance, l.get("unite"))
                prix_cible = nombre(l.get("prix_cible"))
            except ValueError as err:
                alertes.append("%s : %s" % (ou, err))
                continue
            cle = cle_ingredient(l["ingredient"])
            if not con.execute("SELECT 1 FROM besoins WHERE cle = ?", (cle,)).fetchone():
                alertes.append("%s : %r n'est dans aucune liste (gardé quand même)" % (ou, l["ingredient"]))
            ingredient(l["ingredient"])
            con.execute(
                "INSERT INTO produits (cle, enseigne, libelle, url, contenance, unite, prix_cible, actif) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(enseigne, url) DO UPDATE SET "
                "cle = excluded.cle, libelle = excluded.libelle, contenance = excluded.contenance, "
                "unite = excluded.unite, prix_cible = excluded.prix_cible, actif = 1",
                (cle, enseigne, l.get("libelle") or None, l["url"], contenance, l.get("unite") or None, prix_cible))
            vus.add((enseigne, l["url"]))
        # produit retiré du CSV : désactivé, pas supprimé (son historique de relevés reste) ;
        # les produits créés par `saisir` (sans page web) ne viennent pas du CSV et restent actifs
        for pid, enseigne, url in con.execute("SELECT id, enseigne, url FROM produits WHERE actif = 1").fetchall():
            if (enseigne, url) not in vus and not url.startswith("manuel:"):
                con.execute("UPDATE produits SET actif = 0 WHERE id = ?", (pid,))
        # ingrédient qui n'est plus nulle part (ni besoin, ni produit) : retiré
        con.execute("DELETE FROM ingredients WHERE cle NOT IN (SELECT cle FROM besoins) "
                    "AND cle NOT IN (SELECT cle FROM produits)")
    return alertes


def saisir(con, ingredient, enseigne, prix, prix_barre=None, contenance=None, unite=None, date=None, origine="manuel"):
    """Prix noté à la main (site bloqué, Grand Frais, marché) : rattaché au produit suivi de cette
    enseigne, ou à un produit « manuel » créé pour l'occasion. Rend un message à afficher."""
    from datetime import datetime
    cle, enseigne = cle_ingredient(ingredient), cle_ingredient(enseigne).replace(" ", "")
    if enseigne not in ENSEIGNES:
        raise ValueError("enseigne inconnue %r (attendu : %s)" % (enseigne, ", ".join(ENSEIGNES)))
    if contenance is not None:
        quantite_de_base(contenance, unite)
    with con:
        ligne = con.execute("SELECT id, libelle FROM produits WHERE cle = ? AND enseigne = ? AND actif = 1 ORDER BY id",
                            (cle, enseigne)).fetchone()
        if ligne:
            pid, libelle = ligne
        else:
            con.execute("INSERT INTO ingredients (cle, nom) VALUES (?, ?) ON CONFLICT(cle) DO NOTHING", (cle, ingredient.strip()))
            url = "manuel:%s:%s" % (enseigne, cle)
            con.execute("INSERT INTO produits (cle, enseigne, libelle, url, contenance, unite, actif) VALUES (?, ?, ?, ?, ?, ?, 1) "
                        "ON CONFLICT(enseigne, url) DO UPDATE SET actif = 1, contenance = COALESCE(excluded.contenance, contenance), "
                        "unite = COALESCE(excluded.unite, unite)",
                        (cle, enseigne, ingredient.strip() + " (saisi à la main)", url, contenance, unite))
            pid, libelle = con.execute("SELECT id, libelle FROM produits WHERE enseigne = ? AND url = ?", (enseigne, url)).fetchone()
        date = date or datetime.now().isoformat(timespec="seconds")
        if con.execute("SELECT 1 FROM releves WHERE produit_id = ? AND date = ? AND prix = ?", (pid, date, prix)).fetchone():
            return "%.2f € déjà noté pour %s (%s) à cette date." % (prix, libelle or ingredient, enseigne)
        con.execute("INSERT INTO releves (produit_id, date, prix, prix_barre, statut, origine) VALUES (?, ?, ?, ?, 'ok', ?)",
                    (pid, date, prix, prix_barre, origine))
    return "%.2f € noté pour %s (%s)." % (prix, libelle or ingredient, enseigne)


def importer_externes(con, chemin):
    """Charge donnees/releves_externes.csv (prix vus sur une capture, une recherche web…). Rend les avertissements."""
    from sources_ouvertes import lire_releves_externes
    alertes = []
    for i, l in enumerate(lire_releves_externes(chemin), start=2):
        try:
            date = l.get("date") or None
            if date and len(date) == 10:
                date += "T12:00:00"
            saisir(con, l["ingredient"], l["enseigne"], nombre(l["prix"]), nombre(l.get("prix_barre")),
                   date=date, origine=l.get("source") or "externe")
        except (KeyError, TypeError, ValueError) as err:
            alertes.append("relevés externes, ligne %d : %s" % (i, err))
    return alertes


def importer_open_prices(con, villes=VILLES_PROCHES, interroger=None):
    """Interroge Open Prices pour chaque code-barres connu et enregistre les prix des enseignes suivies,
    relevés dans les villes proches (villes=None : toute la France). Rend (nb ajoutés, messages)."""
    from extraction import ean_depuis_url
    from sources_ouvertes import interroger_open_prices
    interroger = interroger or interroger_open_prices
    eans = {}
    for cle, ean, url in con.execute("SELECT cle, ean, url FROM produits WHERE actif = 1"):
        e = ean or ean_depuis_url(url)
        if e:
            eans.setdefault(e, cle)
    ajoutes, messages = 0, []
    for ean, cle in sorted(eans.items()):
        try:
            prix = interroger(ean)
        except Exception as err:
            messages.append("%s : Open Prices injoignable (%s)" % (ean, type(err).__name__))
            continue
        nom = con.execute("SELECT nom FROM ingredients WHERE cle = ?", (cle,)).fetchone()[0]
        for p in prix:
            ville = cle_ingredient(p.get("ville") or "")
            if villes is not None and ville not in villes:
                continue
            if not con.execute("SELECT 1 FROM produits WHERE cle = ? AND enseigne = ? AND actif = 1", (cle, p["enseigne"])).fetchone():
                continue  # enseigne non suivie pour cet ingrédient
            avant = con.execute("SELECT COUNT(*) FROM releves").fetchone()[0]
            saisir(con, nom, p["enseigne"], p["prix"], p["prix_barre"], date=(p["date"] or "")[:10] + "T00:00:00",
                   origine="openprices:%s" % (p.get("ville") or "?"))
            ajoutes += con.execute("SELECT COUNT(*) FROM releves").fetchone()[0] - avant
        messages.append("%s (%s) : %d prix trouvés" % (ean, nom, len(prix)))
    return ajoutes, messages


def liste_unifiee(con):
    """Une ligne par ingrédient : nom, rayon, sources, nombre de recettes, enseignes reliées."""
    return con.execute("""
      SELECT i.nom, COALESCE(i.rayon, ''),
             (SELECT GROUP_CONCAT(DISTINCT b.source) FROM besoins b WHERE b.cle = i.cle),
             (SELECT COUNT(DISTINCT b.ref) FROM besoins b WHERE b.cle = i.cle AND b.source = 'recette'),
             (SELECT GROUP_CONCAT(DISTINCT p.enseigne) FROM produits p WHERE p.cle = i.cle AND p.actif = 1)
      FROM ingredients i
      WHERE EXISTS (SELECT 1 FROM besoins b WHERE b.cle = i.cle)
      ORDER BY 4 DESC, i.nom""").fetchall()


# ---------- Ligne de commande ----------
def afficher_tableau(lignes, entetes):
    lignes = [[("" if v is None else str(v)) for v in l] for l in lignes]
    largeurs = [max(len(x) for x in col) for col in zip(entetes, *lignes)]
    for l in [entetes, ["-" * n for n in largeurs]] + lignes:
        print("  ".join(v.ljust(n) for v, n in zip(l, largeurs)).rstrip())


def main(argv=None):
    p = argparse.ArgumentParser(description="Veille des prix Mr Cooook")
    p.add_argument("--base", default=str(BASE_DEFAUT), help="fichier SQLite (défaut : %(default)s)")
    sp = p.add_subparsers(dest="commande", required=True)
    imp = sp.add_parser("importer", help="lit les sources et met la base à jour")
    imp.add_argument("--recettes", default=str(RECETTES_DEFAUT))
    imp.add_argument("--permanente", default=str(PERMANENTE_DEFAUT))
    imp.add_argument("--correspondances", default=str(CORRESPONDANCES_DEFAUT))
    imp.add_argument("--courses", help="liste de courses exportée (.txt ou .md), optionnelle")
    imp.add_argument("--externes", default=str(EXTERNES_DEFAUT), help="prix trouvés ailleurs (captures, recherches)")
    op = sp.add_parser("openprices", help="récupère les prix de la base ouverte Open Prices (par code-barres)")
    op.add_argument("--toute-la-france", action="store_true", help="ne pas se limiter aux villes autour de Pessac")
    sp.add_parser("liste", help="liste unifiée des ingrédients et enseignes reliées")
    sp.add_parser("manquants", help="ingrédients encore reliés à aucun produit")
    nav = argparse.ArgumentParser(add_help=False)
    nav.add_argument("--config", default=str(CONFIG_ENSEIGNES))
    nav.add_argument("--profil", default=str(ICI / "profil-navigateur"), help="dossier du profil navigateur")
    nav.add_argument("--chrome", action="store_true", help="utiliser Google Chrome installé plutôt que Chromium")
    nav.add_argument("--navigateur", help="chemin d'un exécutable Chromium précis")
    sp.add_parser("profil", parents=[nav], help="ouvre les sites pour choisir tes drives (une fois)")
    cal = sp.add_parser("calibrer", parents=[nav], help="montre ce qu'une page produit expose comme prix")
    cal.add_argument("url")
    rel = sp.add_parser("releve", parents=[nav], help="relève les prix de tous les produits actifs")
    rel.add_argument("--invisible", action="store_true", help="navigateur caché (plus souvent bloqué)")
    rel.add_argument("--enseigne", choices=ENSEIGNES)
    rel.add_argument("--max", type=int, help="nombre maximum de pages (pour un essai)")
    rel.add_argument("--manuel", action="store_true", help="s'arrêter sur un écran anti-robot pour le résoudre à la main")
    sai = sp.add_parser("saisir", help="note un prix à la main (site bloqué, Grand Frais, marché)")
    sai.add_argument("ingredient")
    sai.add_argument("enseigne", choices=ENSEIGNES)
    sai.add_argument("prix", type=lambda x: float(x.replace(",", ".")))
    sai.add_argument("--barre", type=lambda x: float(x.replace(",", ".")), help="prix barré affiché, s'il y en a un")
    sai.add_argument("--contenance", type=lambda x: float(x.replace(",", ".")), help="pour un produit sans page (marché)")
    sai.add_argument("--unite", choices=sorted(set(UNITES)))
    rap = sp.add_parser("rapport", parents=[nav], help="écrit le comparatif HTML")
    rap.add_argument("--sortie", default=str(ICI / "rapport.html"))
    a = p.parse_args(argv)

    con = ouvrir(a.base)
    if a.commande in ("profil", "calibrer", "releve"):
        try:
            import releve
        except ImportError:
            print("Playwright manque : pip install playwright puis playwright install chromium", file=sys.stderr)
            return 2
        config = releve.lire_config(a.config)
        opts = dict(profil=a.profil, chrome=a.chrome, executable=a.navigateur)
        if a.commande == "profil":
            exemples = dict(con.execute("SELECT enseigne, MIN(url) FROM produits WHERE actif = 1 GROUP BY enseigne"))
            releve.ouvrir_profil(config, exemples=exemples, **opts)
        elif a.commande == "calibrer":
            releve.calibrer(a.url, **opts)
        else:
            bilan = releve.lancer(con, config, visible=not a.invisible, enseigne=a.enseigne, maximum=a.max,
                                  manuel=a.manuel, **opts)
            for ens, compte in sorted(bilan.items()):
                print("%-11s %s" % (ens, ", ".join("%s %d" % kv for kv in sorted(compte.items()))))
        return 0
    if a.commande == "openprices":
        ajoutes, messages = importer_open_prices(con, villes=None if a.toute_la_france else VILLES_PROCHES)
        for m in messages:
            print(m)
        print("%d prix ajoutés." % ajoutes)
        return 0
    if a.commande == "saisir":
        try:
            print(saisir(con, a.ingredient, a.enseigne, a.prix, a.barre, a.contenance, a.unite))
        except ValueError as err:
            print("⚠ %s" % err, file=sys.stderr)
            return 1
        return 0
    if a.commande == "rapport":
        import json
        import rapport
        config = json.loads(Path(a.config).read_text(encoding="utf-8"))
        Path(a.sortie).write_text(rapport.generer_html(rapport.lignes_rapport(con), config), encoding="utf-8")
        print("Rapport écrit : %s" % a.sortie)
        return 0
    if a.commande == "importer":
        alertes = importer(con, a.recettes, a.permanente, a.correspondances, a.courses)
        alertes += importer_externes(con, a.externes)
        n_ing = con.execute("SELECT COUNT(*) FROM ingredients").fetchone()[0]
        n_prod = con.execute("SELECT COUNT(*) FROM produits WHERE actif = 1").fetchone()[0]
        print("%d ingrédients, %d produits reliés." % (n_ing, n_prod))
        for x in alertes:
            print("⚠ " + x, file=sys.stderr)
        return 0
    lignes = liste_unifiee(con)
    if a.commande == "manquants":
        lignes = [l for l in lignes if not l[4]]
        print("%d ingrédients sans produit relié (les plus utilisés d'abord) :" % len(lignes))
    afficher_tableau(lignes, ["ingrédient", "rayon", "sources", "recettes", "enseignes"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
