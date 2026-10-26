"""Aspire une catégorie entière de Carrefour (nom, prix, prix barré, unité, marque, dispo, URL, image).

    python3 scraper_categorie.py https://www.carrefour.fr/r/epicerie-salee --max 50
    python3 scraper_categorie.py URL --max 200 --invisible      # une fois que le mode visible passe

Les produits sont lus dans les données que la page embarque (window.__INITIAL_STATE__),
pas dans l'affichage. Sauvegarde ligne par ligne dans exports/ : rien n'est perdu si ça plante.
Écran anti-robot (DataDome, Cloudflare, captcha) : arrêt immédiat, rien n'est contourné.
"""
import argparse
import csv
import json
import random
import time
from datetime import datetime
from pathlib import Path

from extraction import page_bloquee
from releve import PROFIL_DEFAUT

ICI = Path(__file__).resolve().parent
COLONNES = ["nom", "prix", "prix_barre", "promo", "prix_unite", "unite", "marque", "disponible", "ean", "url", "image"]

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


def _payload(page):
    etat = page.evaluate("() => window.__INITIAL_STATE__ || null")
    if not etat or not etat.get("routeData"):
        return None
    return decoder_payload(etat["routeData"])


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


def aspirer(url, maxi, sortie, visible=True, profil=PROFIL_DEFAUT, ecrire=print):
    from playwright.sync_api import sync_playwright

    bilan = {"produits": 0, "pages": 0, "blocage": None}
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
        suivante = url
        while suivante and bilan["produits"] < maxi:
            rep = page.goto(suivante, wait_until="domcontentloaded", timeout=60000)
            pause()
            if page_bloquee(page.content(), rep.status if rep else None):
                bilan["blocage"] = f"écran anti-robot sur {suivante}"
                break
            _cookies(page)
            donnees = _payload(page)
            if donnees is None:
                bilan["blocage"] = f"données produits absentes sur {suivante}"
                break
            for ligne in lignes_produits(donnees)[: maxi - bilan["produits"]]:
                w.writerow(ligne)
                bilan["produits"] += 1
            f.flush()
            bilan["pages"] += 1
            ecrire(f"page {bilan['pages']} : {bilan['produits']} produits")
            nxt = (donnees.get("links") or {}).get("next")
            suivante = f"https://www.carrefour.fr{nxt}" if nxt else None
            if suivante and bilan["produits"] < maxi:
                pause(3, 5)
        ctx.close()
    return bilan


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--max", type=int, default=50)
    ap.add_argument("--invisible", action="store_true", help="sans fenêtre, seulement si le mode visible passe")
    ap.add_argument("--sortie", type=Path)
    a = ap.parse_args(argv)
    sortie = a.sortie or ICI / "exports" / f"carrefour_{a.url.rstrip('/').rsplit('/', 1)[-1]}_{datetime.now():%Y-%m-%d}.csv"
    sortie.parent.mkdir(exist_ok=True)
    b = aspirer(a.url, a.max, sortie, visible=not a.invisible)
    print(f"\n{b['produits']} produits, {b['pages']} pages → {sortie}")
    if b["blocage"]:
        print(f"⛔ Arrêt : {b['blocage']}. Options : mode manuel (profil), réessayer plus tard, "
              "proxy résidentiel ou service de déblocage (non branchés : à décider).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
