"""Relevé des prix avec un vrai navigateur (Playwright), sur ta machine.

Le navigateur garde un profil (dossier profil-navigateur/) : tu y choisis une fois
tes drives et acceptes les cookies (commande `profil`), les relevés suivants
réutilisent ces réglages. Lent volontairement (pause entre deux pages).
"""
import json
import random
import time
from datetime import datetime
from pathlib import Path

from extraction import ean_depuis_url, nombre_prix, page_bloquee, prix_depuis_html

ICI = Path(__file__).resolve().parent
PROFIL_DEFAUT = ICI / "profil-navigateur"
CONFIG_DEFAUT = ICI / "donnees" / "enseignes.json"

# Repère des candidats prix dans la page, pour la commande `calibrer`.
JS_CANDIDATS = r"""
() => {
  const chemin = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 5; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(s + "#" + e.id); break; }
      const cls = [...e.classList].filter(c => !/\d{3,}/.test(c)).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
    }
    return parts.join(" > ");
  };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 3) continue;
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (t.length > 30 || !/\d\s*[,.€]\s*\d{2}|\d\s*€/.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    out.push({ texte: t, selecteur: chemin(el), taille: parseFloat(getComputedStyle(el).fontSize), y: Math.round(r.top) });
  }
  return out.sort((a, b) => b.taille - a.taille || a.y - b.y).slice(0, 15);
}
"""


def lire_config(chemin=CONFIG_DEFAUT):
    return json.loads(Path(chemin).read_text(encoding="utf-8"))


def _contexte(p, profil, visible, chrome, executable):
    # Sans ces réglages, le navigateur s'annonce comme « piloté par un programme » et les
    # anti-robots le bloquent d'office. Il reste un navigateur ordinaire, à ton nom, à ton rythme.
    options = dict(headless=not visible, locale="fr-FR", timezone_id="Europe/Paris",
                   viewport={"width": 1280, "height": 900},
                   args=["--disable-blink-features=AutomationControlled"],
                   ignore_default_args=["--enable-automation"])
    if chrome:
        options["channel"] = "chrome"
    elif executable:
        options["executable_path"] = executable
    ctx = p.chromium.launch_persistent_context(str(profil), **options)
    ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return ctx


def ordre_de_passage(produits, graine=None):
    """Mélange puis alterne les enseignes, pour ne jamais enchaîner un même site."""
    rnd = random.Random(graine)
    par_enseigne = {}
    for pr in produits:
        par_enseigne.setdefault(pr[1], []).append(pr)
    for liste in par_enseigne.values():
        rnd.shuffle(liste)
    ordre, files = [], list(par_enseigne.values())
    while any(files):
        for f in files:
            if f:
                ordre.append(f.pop())
    return ordre


def relever_page(page, url, selecteur=None):
    """Ouvre une page produit et rend (prix, prix_barre, statut, origine, ean)."""
    reponse = page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)  # le prix est souvent injecté par le script de la page
    html = page.content()
    res = prix_depuis_html(html)
    ean = res["ean"] or ean_depuis_url(url)
    if res["prix"] is None and selecteur:
        try:
            prix = nombre_prix(page.locator(selecteur).first.inner_text(timeout=5000))
        except Exception:
            prix = None
        if prix is not None:
            return prix, None, "ok", "selecteur", ean
    if res["prix"] is not None:
        return res["prix"], res["prix_barre"], "ok", res["source"], ean
    statut_http = reponse.status if reponse else None
    return None, None, ("bloque" if page_bloquee(html, statut_http) else "introuvable"), None, ean


def lancer(con, config, profil=PROFIL_DEFAUT, visible=True, chrome=False, executable=None,
           enseigne=None, maximum=None, pause=(4, 12), ecrire=print, manuel=False, attendre=input):
    """Relève les produits actifs et enregistre un relevé par produit. Rend {enseigne: {statut: n}}.
    En mode manuel, une page anti-robot attend que tu la résolves dans la fenêtre, puis est relue une fois."""
    from playwright.sync_api import sync_playwright

    requete = "SELECT id, enseigne, url, libelle FROM produits WHERE actif = 1"
    params = []
    if enseigne:
        requete += " AND enseigne = ?"
        params.append(enseigne)
    produits = [pr for pr in con.execute(requete, params).fetchall()
                if config.get(pr[1], {}).get("releve", True)]
    ordre = ordre_de_passage(produits)[: maximum or None]
    bilan = {}
    if not ordre:
        ecrire("Aucun produit à relever (vérifie correspondances.csv puis lance `importer`).")
        return bilan
    with sync_playwright() as p:
        ctx = _contexte(p, profil, visible, chrome, executable)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        for i, (pid, ens, url, libelle) in enumerate(ordre, start=1):
            selecteur = config.get(ens, {}).get("selecteur_prix") or None
            try:
                prix, barre, statut, origine, ean = relever_page(page, url, selecteur)
                if statut == "bloque" and manuel and visible:
                    attendre("%s affiche un écran anti-robot : résous-le dans la fenêtre, puis appuie sur Entrée ici… " % ens)
                    prix, barre, statut, origine, ean = relever_page(page, url, selecteur)
            except Exception as err:  # délai dépassé, site injoignable…
                prix, barre, statut, origine, ean = None, None, "erreur", type(err).__name__, None
            with con:
                con.execute("INSERT INTO releves (produit_id, date, prix, prix_barre, statut, origine) VALUES (?, ?, ?, ?, ?, ?)",
                            (pid, datetime.now().isoformat(timespec="seconds"), prix, barre, statut, origine))
                if ean:
                    con.execute("UPDATE produits SET ean = COALESCE(ean, ?) WHERE id = ?", (ean, pid))
            bilan.setdefault(ens, {}).setdefault(statut, 0)
            bilan[ens][statut] += 1
            ecrire("[%d/%d] %-11s %-8s %s  %s" % (i, len(ordre), ens, statut,
                                                  ("%.2f €" % prix) if prix is not None else "—", libelle or url))
            if i < len(ordre):
                time.sleep(random.uniform(*pause))
        ctx.close()
    return bilan


def ouvrir_profil(config, profil=PROFIL_DEFAUT, chrome=False, executable=None, attendre=input, exemples=None):
    """Ouvre chaque site dans le navigateur du profil pour choisir son drive et accepter les cookies.
    `exemples` : {enseigne: url d'un produit suivi}, ouvert à la place de l'accueil, car c'est sur les
    pages produit que l'anti-robot se déclenche : le résoudre là le fait accepter pour les relevés suivants."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        ctx = _contexte(p, profil, True, chrome, executable)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        premiere = True
        for ens, c in config.items():
            if not c.get("releve", True) or not c.get("accueil"):
                continue
            onglet = page if premiere else ctx.new_page()
            premiere = False
            try:
                onglet.goto((exemples or {}).get(ens) or c["accueil"], wait_until="domcontentloaded", timeout=45000)
            except Exception:
                pass
        attendre("Dans chaque onglet : accepte les cookies, choisis ton magasin, résous les « je ne suis pas un robot ». "
                 "Puis appuie sur Entrée ici… ")
        ctx.close()


def calibrer(url, profil=PROFIL_DEFAUT, chrome=False, executable=None, ecrire=print):
    """Montre ce que la page expose : données structurées, et les textes qui ressemblent à un prix."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        ctx = _contexte(p, profil, True, chrome, executable)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(4000)
        html = page.content()
        res = prix_depuis_html(html)
        ecrire("Titre : %s" % res["titre"])
        ecrire("Prix lu automatiquement : %s (source : %s)" % (res["prix"], res["source"] or "aucune"))
        ecrire("Page anti-robot détectée : %s" % ("oui" if page_bloquee(html) and res["prix"] is None else "non"))
        ecrire("Candidats (copie cette liste à Claude) :")
        for c in page.evaluate(JS_CANDIDATS):
            ecrire("  %-14s taille %4.1f  %s" % (c["texte"], c["taille"], c["selecteur"]))
        ctx.close()
