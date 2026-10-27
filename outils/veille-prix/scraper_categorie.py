"""Aspire une catégorie entière d'une enseigne (nom, prix, prix barré, unité, marque, dispo, URL, image),
au drive le plus proche de Pessac (choisi et vérifié avant la première page, voir magasins.py).

    python3 scraper_categorie.py --enseigne carrefour --categorie epicerie-salee --max 50
    python3 scraper_categorie.py --enseigne auchan --url https://www.auchan.fr/epicerie-salee/ca-n06
    ... --invisible      # une fois que le mode visible passe

Données embarquées dans la page d'abord, affichage en dernier recours.
Sauvegarde ligne par ligne dans exports/ : rien n'est perdu si ça plante.
Écran anti-robot (DataDome, Cloudflare, captcha) : arrêt immédiat, rien n'est contourné.
"""
import argparse
import csv
import html as html_lib
import json
import random
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import magasins
from extraction import nombre_prix, page_bloquee
from releve import PROFIL_DEFAUT

ICI = Path(__file__).resolve().parent
COLONNES = ["nom", "prix", "prix_barre", "promo", "prix_unite", "unite", "marque", "disponible", "ean", "url", "image",
            "magasin"]

FURTIF = """
Object.defineProperty(navigator, 'webdriver', {get: () => false});
Object.defineProperty(navigator, 'languages', {get: () => ['fr-FR', 'fr', 'en-US', 'en']});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
window.chrome = window.chrome || {runtime: {}};
"""
BOUTONS_COOKIES = ["Tout accepter", "Accepter tout", "Accepter et fermer", "Accepter", "J'accepte"]


def pause(mini=1.8, maxi=4.5):
    time.sleep(random.uniform(mini, maxi))


def decoder_payload(texte):
    """Les pages Nuxt aplatissent leurs données : chaque valeur renvoie à une case du tableau."""
    cases = json.loads(texte)

    def lire(i):
        v = cases[i]
        if isinstance(v, dict):
            return {k: lire(x) for k, x in v.items()}
        if isinstance(v, list):
            return [lire(x) for x in v]
        return v
    return lire(0)


def lignes_produits(donnees):
    """Une ligne CSV par produit de la page décodée."""
    lignes = []
    for prod in donnees.get("data") or []:
        a = prod.get("attributes") or {}
        offres = [o for par_ean in (a.get("offers") or {}).values() for o in par_ean.values()]
        if not offres:
            continue
        o = offres[0].get("attributes") or {}
        prix = o.get("price") or {}
        promo = o.get("promotion") or {}
        args = promo.get("messageArgs") or {}
        barre = args.get("initialPrice") if promo.get("isPrixBarre") else None
        images = (a.get("images") or {}).get("paths") or []
        lignes.append({
            "nom": a.get("title"),
            "prix": prix.get("price"),
            "prix_barre": barre,
            "promo": promo.get("label") or "",
            "prix_unite": prix.get("perUnit"),
            "unite": (prix.get("unitOfMeasure") or "").lower(),
            "marque": a.get("brand"),
            "disponible": bool((o.get("availability") or {}).get("purchasable")),
            "ean": a.get("ean"),
            "url": f"https://www.carrefour.fr/p/{a.get('slug')}-{a.get('ean')}",
            "image": images[0].replace("FORMAT", "540x540") if images else "",
        })
    return lignes


def _texte(fragment):
    return re.sub(r"\s+", " ", html_lib.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


def lignes_auchan(html):
    """Vignettes produit d'une page catégorie Auchan (hors carrousels publicitaires)."""
    lignes = []
    for art in re.findall(r"<article[^>]*product-thumbnail[\s\S]*?</article>", html):
        ouverture = art[: art.index(">")]
        if "data-list=" in ouverture:
            continue
        lien = re.search(r'href="(/[^"]+/pr-[^"]+)"', art)
        prix = re.search(r'itemprop="price" content="([\d.]+)"', art)
        if not (lien and prix):
            continue
        marque = re.search(r'<strong itemprop="brand">([\s\S]*?)</strong>', art)
        desc = re.search(r'itemprop="name description">([\s\S]*?)</p>', art)
        contenance = re.search(r'aria-label="Contenance : ([^"]+)"', art)
        unite = re.search(r">\s*([\d,]+)\s*€\s*/\s*([a-zA-Z]+)\s*<", art)
        barre = re.search(r'class="[^"]*(?:product-price--old|crossed|strikethrough)[^"]*"[^>]*>([^<]+)<', art)
        promos = [_texte(x) for x in re.findall(r'class="product-discount-label">([\s\S]*?)</span>', art)]
        promos += [_texte(x) + " cagnottés" for x in re.findall(r'product-discount--sticker">([\s\S]*?)</span>', art)]
        image = re.search(r'itemprop="image" content="([^"]+)"', art)
        nom = _texte(desc.group(1)) if desc else ""
        if contenance:
            nom = f"{nom} {contenance.group(1).strip()}"
        lignes.append({
            "nom": nom,
            "prix": float(prix.group(1)),
            "prix_barre": nombre_prix(barre.group(1)) if barre else None,
            "promo": " ; ".join(promos),
            "prix_unite": nombre_prix(unite.group(1)) if unite else None,
            "unite": unite.group(2).lower() if unite else "",
            "marque": _texte(marque.group(1)) if marque else "",
            "disponible": "schema.org/InStock" in art,
            "ean": "",
            "url": "https://www.auchan.fr" + lien.group(1),
            "image": html_lib.unescape(image.group(1)) if image else "",
        })
    return lignes


def suivante_auchan(html, url):
    m = re.search(r'aria-label="Aller sur la page suivante" href="([^"]+)"', html)
    return urljoin(url, html_lib.unescape(m.group(1))) if m else None


def _objets_leclerc(x):
    if isinstance(x, dict):
        if "sLibelleLigne1" in x and "nrPVUnitaireTTC" in x:
            yield x
        for v in x.values():
            yield from _objets_leclerc(v)
    elif isinstance(x, list):
        for v in x:
            yield from _objets_leclerc(v)


def lignes_leclerc(html):
    """Produits d'un rayon Leclerc Drive : données du bloc « pnlElementProduit » (hors carrousels promo)."""
    m = re.search(r"initOptions\('[^']*pnlElementProduit',", html)
    if not m:
        return []
    donnees, _ = json.JSONDecoder().raw_decode(html[m.end():])
    lignes, vus = [], set()
    for p in _objets_leclerc(donnees.get("objContenu")):
        if p.get("sType") != "Produit" or p["sId"] in vus:
            continue
        vus.add(p["sId"])
        promo = nombre_prix(p.get("sPrixPromo") or "")
        unite = re.search(r"/\s*(\w+)", p.get("sPrixParUniteDeMesure") or "")
        offres = [html_lib.unescape(t) for t in (p.get("sTexteLogoBRII"), p.get("sTexteLogoTel")) if t]
        lignes.append({
            "nom": html_lib.unescape(f"{p['sLibelleLigne1'].strip()} {p.get('sLibelleLigne2') or ''}").strip(),
            "prix": promo if promo else p["nrPVUnitaireTTC"],
            "prix_barre": p["nrPVUnitaireTTC"] if promo else None,
            "promo": " ; ".join(offres),
            "prix_unite": p.get("nrPVParUniteDeMesureTTC"),
            "unite": unite.group(1).lower() if unite else "",
            "marque": "",
            "disponible": p.get("eDisponibilite") == 0 and (p.get("iQteDisponible") or 0) > 0,
            "ean": "",
            "url": p.get("sUrlPageProduit") or "",
            "image": p.get("sUrlVignetteProduit") or "",
        })
    return lignes


# Épicerie salée chez Leclerc : pas de page unique, on enchaîne ses rayons (mêmes numéros dans tous les drives).
RAYONS_LECLERC = ["rayon-284424-Aperitifs-et-Chips.aspx", "rayon-284421-Pates-Riz-Purees-Feculents.aspx",
                  "rayon-284425-Assaisonnements-et-Condiments.aspx", "rayon-284422-Conserves-de-legumes.aspx",
                  "rayon-303866-Conserves-de-poisson-et-viande.aspx", "rayon-288378-Bouillons-Fonds-et-Sauces.aspx",
                  "rayon-284423-Plats-cuisines.aspx", "rayon-284426-Soupes-et-Croutons.aspx"]


def suivante_leclerc(url):
    base, _, rayon = url.split("?")[0].rpartition("/")
    i = RAYONS_LECLERC.index(rayon) if rayon in RAYONS_LECLERC else len(RAYONS_LECLERC)
    return f"{base}/{RAYONS_LECLERC[i + 1]}" if i + 1 < len(RAYONS_LECLERC) else None


def _lire_leclerc(page, url):
    lignes = lignes_leclerc(page.content())
    return (lignes or None), suivante_leclerc(url)


def _lire_carrefour(page, url):
    etat = page.evaluate("() => window.__INITIAL_STATE__ || null")
    if not etat or not etat.get("routeData"):
        return None, None
    donnees = decoder_payload(etat["routeData"])
    nxt = (donnees.get("links") or {}).get("next")
    return lignes_produits(donnees), (f"https://www.carrefour.fr{nxt}" if nxt else None)


def _lire_auchan(page, url):
    html = page.content()
    lignes = lignes_auchan(html)
    return (lignes or None), suivante_auchan(html, url)


# Pour chaque enseigne : accueil (pour choisir le magasin), catégories connues, lecteur de page.
ENSEIGNES = {
    "carrefour": {"accueil": "https://www.carrefour.fr/",
                  "categories": {"epicerie-salee": "https://www.carrefour.fr/r/epicerie-salee",
                                 "oeufs": "https://www.carrefour.fr/r/cremerie/oeufs",
                                 "boucherie": "https://www.carrefour.fr/r/viandes-et-poissons/boucherie",
                                 "volaille": "https://www.carrefour.fr/r/viandes-et-poissons/volaille-et-rotisserie"},
                  "lire": _lire_carrefour},
    "auchan": {"accueil": "https://www.auchan.fr/ogeu-boisson-limonade-sans-sucres/pr-C1836712",
               "categories": {"epicerie-salee": "https://www.auchan.fr/epicerie-salee/ca-n06",
                              "oeufs": "https://www.auchan.fr/oeufs-produits-laitiers/cremerie-oeufs-laits/oeufs/ca-n010103",
                              "boucherie": "https://www.auchan.fr/boucherie-volaille-poissonnerie/boucherie/ca-n0201",
                              "volaille": "https://www.auchan.fr/boucherie-volaille-poissonnerie/volaille-lapin/ca-n0202"},
               "lire": _lire_auchan},
    # Adresse relative : complétée par l'adresse du drive choisi (magasins.choisir_leclerc → base).
    "leclerc": {"accueil": "https://www.leclercdrive.fr/",
                "categories": {"epicerie-salee": RAYONS_LECLERC[0]},
                "lire": _lire_leclerc},
}


def _cookies(page):
    for texte in BOUTONS_COOKIES:
        bouton = page.get_by_role("button", name=texte, exact=True)
        try:
            if bouton.count() and bouton.first.is_visible():
                bouton.first.click()
                pause()
                return
        except Exception:
            pass


def aspirer(enseigne, url, maxi, sortie, visible=True, profil=PROFIL_DEFAUT, ecrire=print):
    from playwright.sync_api import sync_playwright

    fiche = ENSEIGNES[enseigne]
    bilan = {"produits": 0, "pages": 0, "blocage": None, "magasin": None}
    nouveau = not sortie.exists()
    with sync_playwright() as p, open(sortie, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLONNES)
        if nouveau:
            w.writeheader()
        ctx = p.chromium.launch_persistent_context(
            str(profil), headless=not visible, locale="fr-FR", timezone_id="Europe/Paris",
            viewport={"width": 1920, "height": 1080},
            args=["--disable-blink-features=AutomationControlled"], ignore_default_args=["--enable-automation"])
        ctx.add_init_script(FURTIF)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        rep = page.goto(fiche["accueil"], wait_until="domcontentloaded", timeout=60000)
        pause()
        if page_bloquee(page.content(), rep.status if rep else None):
            bilan["blocage"] = f"écran anti-robot sur {fiche['accueil']}"
        else:
            _cookies(page)
            mag = magasins.CHOIX[enseigne](page)
            bilan["magasin"] = mag
            etiquette = f"{mag['nom']} ({mag['distance']:.1f} km)"
            ecrire(f"magasin : {etiquette}")
            if mag.get("base"):
                url = urljoin(mag["base"], url)
        suivante = None if bilan["blocage"] else url
        while suivante and bilan["produits"] < maxi:
            pause(3, 5)
            rep = page.goto(suivante, wait_until="domcontentloaded", timeout=60000)
            pause()
            if page_bloquee(page.content(), rep.status if rep else None):
                bilan["blocage"] = f"écran anti-robot sur {suivante}"
                break
            _cookies(page)
            lignes, nxt = fiche["lire"](page, suivante)
            if lignes is None:
                bilan["blocage"] = f"données produits absentes sur {suivante}"
                break
            for ligne in lignes[: maxi - bilan["produits"]]:
                w.writerow({**ligne, "magasin": etiquette})
                bilan["produits"] += 1
            f.flush()
            bilan["pages"] += 1
            ecrire(f"page {bilan['pages']} : {bilan['produits']} produits")
            suivante = nxt
        ctx.close()
    return bilan


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--enseigne", choices=sorted(ENSEIGNES), required=True)
    ap.add_argument("--categorie", default="epicerie-salee")
    ap.add_argument("--url", help="page catégorie de départ, à la place de --categorie")
    ap.add_argument("--max", type=int, default=50)
    ap.add_argument("--invisible", action="store_true", help="sans fenêtre, seulement si le mode visible passe")
    ap.add_argument("--sortie", type=Path)
    a = ap.parse_args(argv)
    url = a.url or ENSEIGNES[a.enseigne]["categories"].get(a.categorie)
    if not url:
        ap.error(f"catégorie inconnue pour {a.enseigne} : donne son adresse avec --url")
    nom = a.categorie if not a.url else a.url.rstrip("/").rsplit("/", 1)[-1]
    sortie = a.sortie or ICI / "exports" / f"{a.enseigne}_{nom}_{datetime.now():%Y-%m-%d}.csv"
    sortie.parent.mkdir(exist_ok=True)
    b = aspirer(a.enseigne, url, a.max, sortie, visible=not a.invisible)
    print(f"\n{b['produits']} produits, {b['pages']} pages → {sortie}")
    if b["blocage"]:
        print(f"⛔ Arrêt : {b['blocage']}. Options : mode manuel (profil), réessayer plus tard, "
              "proxy résidentiel ou service de déblocage (non branchés : à décider).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
