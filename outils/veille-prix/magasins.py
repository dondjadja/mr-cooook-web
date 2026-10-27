"""Choix du drive le plus proche de Pessac, enregistré dans le profil du navigateur.

Chaque enseigne : interroge son outil « trouver un magasin » depuis la page (avec les cookies
du profil), garde les drives, prend le plus proche, l'enregistre comme un clic, puis vérifie.
"""
import json

PESSAC = (44.8067, -0.6311)

JS_FETCH = """async ([u, m, b]) => { const r = await fetch(u, {method: m, body: b,
    headers: {'x-requested-with': 'XMLHttpRequest', accept: 'application/json', 'content-type': 'application/json'}});
    return [r.status, await r.text()] }"""


def plus_proche(magasins, est_drive, distance=lambda m: m.get("distance")):
    """Le drive le plus proche dans une liste ; None s'il n'y en a aucun (distances parfois en texte)."""
    drives = [m for m in magasins if est_drive(m) and distance(m) not in (None, "")]
    return min(drives, key=lambda m: float(distance(m))) if drives else None


def _fetch(page, url, methode="GET", corps=None):
    statut, texte = page.evaluate(JS_FETCH, [url, methode, corps])
    return statut, texte


# --- Carrefour -------------------------------------------------------------------------------

def carrefour_est_drive(m):
    return "drive" in (m.get("driveTypes") or {}).values()


def carrefour_actif(page):
    st = page.evaluate("() => window.__INITIAL_STATE__?.pinia?.offline?.offlineStore || null") or {}
    return st.get("ref")


def choisir_carrefour(page):
    lat, lng = PESSAC
    _, texte = _fetch(page, f"https://www.carrefour.fr/geoloc?lat={lat}&lng={lng}&page=1&limit=40&modes%5B%5D=picking")
    m = plus_proche(json.loads(texte)["data"]["stores"], carrefour_est_drive)
    if not m:
        raise RuntimeError("aucun drive Carrefour trouvé près de Pessac")
    if str(carrefour_actif(page)) not in (str(m["ref"]), str(m["id"])):
        _fetch(page, f"https://www.carrefour.fr/set-store/{m['ref']}")
        page.reload(wait_until="domcontentloaded")
    return {"nom": f"Carrefour {m['name']}", "ref": m["ref"], "ville": m["address"]["city"], "distance": float(m["distance"])}


# --- Auchan ----------------------------------------------------------------------------------
# Pas d'API publique simple : on passe par la fenêtre « Choisir un drive » du site, comme à la main.

JS_CARTES_AUCHAN = r"""() => {
  // Chaque carte de la liste : son texte, et l'index de son bouton « Choisir » (absent pour le drive déjà choisi).
  const boutons = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Choisir');
  const cartes = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !/^\s*[\d.,]+\s*km\s*$/.test(el.textContent)) continue;
    let c = el; for (let k = 0; k < 8 && c && !/\d{5}/.test(c.innerText); k++) c = c.parentElement;
    if (c) cartes.add(c);
  }
  return [...cartes].map(c => ({i: boutons.findIndex(b => c.contains(b)), texte: c.innerText.replace(/\s+/g, ' ')}));
}"""


def auchan_cartes(cartes):
    """Cartes « Drive » de la fenêtre Auchan → [{i, nom, distance}]."""
    import re
    out = []
    for c in cartes:
        m = re.match(r"Drive (.+?) \d{5} .*?([\d.,]+) km", c["texte"])
        if m:
            out.append({"i": c["i"], "distance": float(m.group(2).replace(",", ".")), "nom": m.group(1).strip()})
    return out


def auchan_actif(page):
    lien = page.get_by_text("Retrait:").first
    try:
        return page.locator("header, body").first.evaluate(
            "() => { const t = document.body.innerText; const m = t.match(/Retrait:\\s*\\n?\\s*([^\\n]+)/); return m ? m[1].trim() : null }")
    except Exception:
        return None


def choisir_auchan(page):
    actif = auchan_actif(page)
    if page.get_by_text("Afficher le prix").count():
        page.get_by_text("Afficher le prix").first.click()
    else:
        page.get_by_text(actif).first.click()
        page.get_by_text("Changer de magasin").first.click()
    page.wait_for_timeout(2500)
    champ = page.get_by_label("Code postal, ville ...")
    champ.click()
    champ.fill("")
    page.keyboard.type("33600", delay=120)
    page.wait_for_timeout(2500)
    page.locator("li, [role=option]").filter(has_text="Pessac").first.click()
    page.wait_for_timeout(4000)
    page.get_by_role("button", name="Drive", exact=True).click()
    page.wait_for_timeout(3000)
    m = plus_proche(auchan_cartes(page.evaluate(JS_CARTES_AUCHAN)), lambda c: True)
    if not m:
        raise RuntimeError("aucun drive Auchan trouvé près de Pessac")
    if m["nom"] != actif and m["i"] >= 0:
        page.locator("button").filter(has_text="Choisir").filter(has_not_text="mode").nth(m["i"]).click()
        page.wait_for_timeout(5000)
    else:
        page.keyboard.press("Escape")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    nouveau = auchan_actif(page)
    if nouveau != m["nom"]:
        raise RuntimeError(f"Auchan : magasin actif « {nouveau} » au lieu de « {m['nom']} »")
    return {"nom": m["nom"], "ref": "", "ville": "", "distance": m["distance"]}


# --- Leclerc ---------------------------------------------------------------------------------
# Le magasin est inscrit dans l'adresse des pages (magasin-233301-…) : rien à enregistrer, il suffit
# de trouver le drive le plus proche et de partir de son adresse.

def leclerc_base(url_site):
    """https://fd5-courses…/magasin-233301-233301-villenave-dornon.aspx → …/magasin-233301-233301-villenave-dornon/"""
    return url_site[: -len(".aspx")] + "/" if url_site.endswith(".aspx") else url_site.rstrip("/") + "/"


def choisir_leclerc(page):
    lat, lng = PESSAC
    statut, texte = page.evaluate("async u => { const r = await fetch(u); return [r.status, await r.text()] }",
        "https://api-recherchemagasins.leclercdrive.fr/API_RechercheMagasins/api/v1/MapPoint/nearby"
        f"?latitude={lat}&longitude={lng}&postalCode=33600")
    m = plus_proche(json.loads(texte)["points"], lambda p: p.get("serviceType") == "drive" and p.get("state") == 0)
    if not m:
        raise RuntimeError("aucun drive Leclerc trouvé près de Pessac")
    return {"nom": f"Leclerc Drive {m['name']}", "ref": m["noPL"], "ville": m["name"],
            "distance": float(m["distance"]), "base": leclerc_base(m["urlSiteCourse"])}


CHOIX = {"carrefour": choisir_carrefour, "auchan": choisir_auchan, "leclerc": choisir_leclerc}
