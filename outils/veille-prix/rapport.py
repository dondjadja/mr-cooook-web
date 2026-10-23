"""Comparatif des prix : dernier prix par produit, panier le moins cher livraison comprise, rapport HTML."""
import html
from collections import Counter
from datetime import datetime

from veille_prix import prix_par_unite


def lignes_rapport(con):
    """Une ligne par produit actif : dernier prix valable, prix précédent, état du dernier passage."""
    produits = con.execute("""
      SELECT p.id, i.nom, p.enseigne, p.libelle, p.url, p.contenance, p.unite, p.prix_cible
      FROM produits p JOIN ingredients i ON i.cle = p.cle
      WHERE p.actif = 1 ORDER BY i.nom, p.enseigne""").fetchall()
    lignes = []
    for pid, nom, ens, libelle, url, contenance, unite, cible in produits:
        releves = con.execute("SELECT date, prix, prix_barre, statut FROM releves WHERE produit_id = ? "
                              "ORDER BY date DESC, id DESC", (pid,)).fetchall()
        ok = [r for r in releves if r[3] == "ok" and r[1] is not None]
        l = {"ingredient": nom, "enseigne": ens, "libelle": libelle or "", "url": url, "prix_cible": cible,
             "prix": None, "prix_barre": None, "date": None, "unitaire": None, "unite_lib": None,
             "precedent": None, "variation": None,
             "statut": releves[0][3] if releves else "jamais", "date_statut": releves[0][0] if releves else None}
        if ok:
            l.update(date=ok[0][0], prix=ok[0][1], prix_barre=ok[0][2])
            if contenance and unite:
                try:
                    l["unitaire"], l["unite_lib"] = prix_par_unite(ok[0][1], contenance, unite)
                except ValueError:
                    pass
            if len(ok) > 1:
                l["precedent"] = ok[1][1]
                l["variation"] = (ok[0][1] - ok[1][1]) / ok[1][1] if ok[1][1] else None
        lignes.append(l)
    return lignes


def meilleures_offres(lignes):
    """Pour chaque ingrédient, l'offre la moins chère à l'unité (kg, L ou pièce).
    Si les enseignes n'utilisent pas la même unité, on compare dans l'unité la plus fréquente."""
    par_ing = {}
    for l in lignes:
        if l["prix"] is not None:
            par_ing.setdefault(l["ingredient"], []).append(l)
    choix = {}
    for ing, offres in par_ing.items():
        avec_unite = [o for o in offres if o["unitaire"] is not None]
        if avec_unite:
            unite = Counter(o["unite_lib"] for o in avec_unite).most_common(1)[0][0]
            comparables = [o for o in avec_unite if o["unite_lib"] == unite]
            meilleure = min(comparables, key=lambda o: o["unitaire"])
            choix[ing] = dict(meilleure, unites_melangees=len({o["unite_lib"] for o in avec_unite}) > 1)
        else:
            choix[ing] = dict(min(offres, key=lambda o: o["prix"]), unites_melangees=False)
    return choix


def frais(config, enseigne, sous_total):
    c = config.get(enseigne, {})
    seuil = c.get("seuil_gratuite")
    if seuil is not None and sous_total >= seuil:
        return 0.0
    return float(c.get("frais", 0) or 0)


def panier_optimal(lignes, config):
    """Chaque ingrédient chez l'enseigne la moins chère à l'unité (1 paquet), puis frais de livraison.
    Une commande qui paie des frais est abandonnée si ses articles coûtent moins cher ailleurs, frais compris."""
    groupes = {}
    for ing, o in sorted(meilleures_offres(lignes).items()):
        groupes.setdefault(o["enseigne"], []).append(o)
    autres = {}
    for l in lignes:
        if l["prix"] is not None:
            autres.setdefault(l["ingredient"], []).append(l)
    for ens in sorted(groupes, key=lambda e: -frais(config, e, sum(o["prix"] for o in groupes[e]))):
        offres = groupes.get(ens)
        if not offres:
            continue
        if frais(config, ens, sum(o["prix"] for o in offres)) == 0:
            continue
        repli = {}
        for o in offres:
            choix = [a for a in autres[o["ingredient"]] if a["enseigne"] != ens]
            if not choix:
                break
            repli[o["ingredient"]] = dict(min(choix, key=lambda a: a["prix"]), unites_melangees=False)
        else:
            essai = {e: list(v) for e, v in groupes.items() if e != ens}
            for a in repli.values():
                essai.setdefault(a["enseigne"], []).append(a)
            avant = sum(sum(o["prix"] for o in v) + frais(config, e, sum(o["prix"] for o in v)) for e, v in groupes.items())
            apres = sum(sum(o["prix"] for o in v) + frais(config, e, sum(o["prix"] for o in v)) for e, v in essai.items())
            if apres < avant:
                groupes = essai
    commandes = []
    for ens, offres in sorted(groupes.items()):
        st = round(sum(o["prix"] for o in offres), 2)
        f = frais(config, ens, st)
        seuil = config.get(ens, {}).get("seuil_gratuite")
        commandes.append({"enseigne": ens, "offres": offres, "sous_total": st, "frais": f,
                          "manque": round(seuil - st, 2) if seuil is not None and f else None})
    return {"commandes": commandes, "total": round(sum(c["sous_total"] + c["frais"] for c in commandes), 2)}


def paniers_par_enseigne(lignes, config):
    """Tout acheter chez une seule enseigne : ce qu'elle couvre et combien ça coûte."""
    tous = {l["ingredient"] for l in lignes if l["prix"] is not None}
    res = []
    for ens in sorted({l["enseigne"] for l in lignes}):
        offres = {}
        for l in lignes:
            if l["enseigne"] == ens and l["prix"] is not None:
                if l["ingredient"] not in offres or l["prix"] < offres[l["ingredient"]]["prix"]:
                    offres[l["ingredient"]] = l
        st = round(sum(o["prix"] for o in offres.values()), 2)
        if offres:
            res.append({"enseigne": ens, "couverts": len(offres), "sur": len(tous), "sous_total": st,
                        "frais": frais(config, ens, st)})
    return res


# ---------- HTML ----------
NOMS = {"leclerc": "Leclerc", "carrefour": "Carrefour", "auchan": "Auchan", "intermarche": "Intermarché",
        "joybuy": "Joybuy", "amazon": "Amazon", "grandfrais": "Grand Frais", "marche": "Marché"}
STATUTS = {"ok": "à jour", "bloque": "bloqué (anti-robot)", "introuvable": "prix introuvable",
           "erreur": "erreur", "jamais": "pas encore relevé"}


def _e(x):
    return html.escape("" if x is None else str(x))


def _euros(x):
    return "—" if x is None else ("%.2f €" % x).replace(".", ",")


def _jour(iso):
    return datetime.fromisoformat(iso).strftime("%d/%m %H:%M") if iso else "—"


def generer_html(lignes, config, maintenant=None):
    maintenant = maintenant or datetime.now()
    panier, seuls = panier_optimal(lignes, config), paniers_par_enseigne(lignes, config)
    meilleures = meilleures_offres(lignes)
    problemes = [l for l in lignes if l["statut"] not in ("ok",)]
    avec_prix = sum(1 for l in lignes if l["prix"] is not None)

    cmd = []
    for c in panier["commandes"]:
        detail = "".join("<li>%s <span class='mut'>%s</span> <b>%s</b></li>" % (_e(o["ingredient"]), _e(o["libelle"]), _euros(o["prix"]))
                         for o in c["offres"])
        alerte = ""
        if c["manque"]:
            alerte = "<p class='att'>Livraison %s : il manque %s pour qu'elle soit offerte.</p>" % (_euros(c["frais"]), _euros(c["manque"]))
        cmd.append("<div class='carte'><h3>%s <span class='mut'>%s + %s de frais</span></h3><ul>%s</ul>%s</div>"
                   % (_e(NOMS.get(c["enseigne"], c["enseigne"])), _euros(c["sous_total"]), _euros(c["frais"]), detail, alerte))

    seul = "".join("<tr><td>%s</td><td class='num'>%d / %d</td><td class='num'>%s</td><td class='num'>%s</td></tr>"
                   % (_e(NOMS.get(s["enseigne"], s["enseigne"])), s["couverts"], s["sur"], _euros(s["sous_total"]), _euros(s["frais"]))
                   for s in seuls)

    rangs = []
    for l in lignes:
        best = meilleures.get(l["ingredient"])
        est_best = best is not None and best["url"] == l["url"]
        var = ""
        if l["variation"] is not None and abs(l["variation"]) >= 0.005:
            var = "<span class='%s'>%+.0f %%</span>" % ("baisse" if l["variation"] < 0 else "hausse", 100 * l["variation"])
        promo = " <span class='promo'>barré %s</span>" % _euros(l["prix_barre"]) if l["prix_barre"] else ""
        unitaire = "%s %s" % (("%.2f" % l["unitaire"]).replace(".", ","), l["unite_lib"]) if l["unitaire"] is not None else "—"
        etat = "" if l["statut"] == "ok" else "<span class='etat'>%s</span>" % _e(STATUTS.get(l["statut"], l["statut"]))
        rangs.append("<tr class='%s'><td>%s</td><td>%s</td><td><a href='%s'>%s</a></td><td class='num'>%s%s</td>"
                     "<td class='num'>%s</td><td class='num'>%s</td><td>%s %s</td></tr>"
                     % ("best" if est_best else "", _e(l["ingredient"]), _e(NOMS.get(l["enseigne"], l["enseigne"])),
                        _e(l["url"]), _e(l["libelle"] or "page produit"), _euros(l["prix"]), promo, unitaire, var,
                        _jour(l["date"]), etat))

    blocages = Counter(l["enseigne"] for l in problemes if l["statut"] in ("bloque", "erreur", "introuvable"))
    bloc_txt = ", ".join("%s : %d" % (NOMS.get(e, e), n) for e, n in blocages.most_common()) or "aucun"

    return """<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Comparatif des prix</title>
<style>
:root{--bg:#f4f6f2;--surface:#fff;--line:#d9dfd5;--fg:#1d2620;--mut:#5d6b61;--accent:#2e6a4c;--soft:#e2eee6;--warn:#9a5a00;--warn-soft:#fbf0dc;--down:#2e6a4c;--up:#a33a2c}
@media (prefers-color-scheme:dark){:root{--bg:#121815;--surface:#1a221d;--line:#2c3730;--fg:#e5ebe6;--mut:#9aa89e;--accent:#7cc49d;--soft:#1f3528;--warn:#e3b061;--warn-soft:#33291a;--down:#7cc49d;--up:#ef8a7c;color-scheme:dark}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,sans-serif;margin:0;padding:24px max(16px,4vw)}
main{max-width:1100px;margin:0 auto;display:grid;gap:22px}h1{margin:0;font-size:1.8rem}h2{margin:0 0 8px;font-size:1.15rem}h3{margin:0 0 6px;font-size:1rem}
.mut{color:var(--mut);font-weight:400}.resume{display:flex;flex-wrap:wrap;gap:10px}.resume div{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
.resume b{display:block;font-size:1.4rem;font-variant-numeric:tabular-nums}.grille{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.carte{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px}.carte ul{margin:0;padding-left:18px}
.att{background:var(--warn-soft);color:var(--warn);border-radius:6px;padding:6px 10px;margin:8px 0 0}.total{font-size:1.2rem;font-weight:700}
.table{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px}table{border-collapse:collapse;width:100%%;min-width:760px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}tr.best td{background:var(--soft)}tr.best td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
a{color:var(--accent)}.baisse{color:var(--down);font-weight:700}.hausse{color:var(--up);font-weight:700}.promo{color:var(--warn);font-size:12px}
.etat{background:var(--warn-soft);color:var(--warn);border-radius:10px;padding:1px 8px;font-size:12px;white-space:nowrap}
</style></head><body><main>
<header><h1>Comparatif des prix</h1><p class="mut">Généré le %s. Fond vert : l'offre la moins chère au kilo, au litre ou à la pièce.</p></header>
<section class="resume"><div><span class="mut">Produits suivis</span><b>%d</b></div><div><span class="mut">Avec un prix</span><b>%d</b></div>
<div><span class="mut">Panier le moins cher</span><b>%s</b></div><div><span class="mut">Relevés en échec</span><b>%s</b></div></section>
<section><h2>Panier le moins cher, livraison comprise</h2><p class="mut">Un paquet de chaque ingrédient, chez l'enseigne la moins chère à l'unité.</p>
<div class="grille">%s</div><p class="total">Total : %s</p></section>
<section><h2>Tout chez une seule enseigne</h2><div class="table"><table><thead><tr><th>Enseigne</th><th>Ingrédients couverts</th><th>Sous-total</th><th>Frais</th></tr></thead><tbody>%s</tbody></table></div></section>
<section><h2>Par ingrédient</h2><div class="table"><table><thead><tr><th>Ingrédient</th><th>Enseigne</th><th>Produit</th><th>Prix</th><th>Au kilo / litre / pièce</th><th>Évolution</th><th>Relevé</th></tr></thead><tbody>%s</tbody></table></div></section>
</main></body></html>""" % (maintenant.strftime("%d/%m/%Y à %H:%M"), len(lignes), avec_prix, _euros(panier["total"]) if panier["commandes"] else "—",
                           _e(bloc_txt), "".join(cmd) or "<p class='mut'>Aucun prix relevé pour l'instant.</p>",
                           _euros(panier["total"]), seul or "<tr><td colspan='4' class='mut'>—</td></tr>", "".join(rangs))
