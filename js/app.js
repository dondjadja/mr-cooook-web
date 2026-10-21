"use strict";
// ---------- Outils d'affichage (aucun HTML brut : tout passe par textContent) ----------
function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v; // CSSOM : autorisé par la CSP, contrairement à l'attribut
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const e of enfants.flat(Infinity)) if (e != null && e !== false) el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return el;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.minuterie); toast.minuterie = setTimeout(() => { t.hidden = true; }, 3200);
}
const euros = n => n.toFixed(2).replace(".", ",") + " €";
const virgule = n => String(n).replace(".", ",");
function copier(texte, zone, message) {
  navigator.clipboard.writeText(texte).then(() => toast(message), () => { if (zone) zone.select(); toast("Sélectionné : copie avec ⌘C"); });
}
function points(id) {
  const m = etat.maitrise[id] || { fois: 0, sansRecette: false };
  const ok = m.fois >= 3 && m.sansRecette;
  return h("div", { class: "dots", "aria-label": m.fois + " réalisations sur 3" },
    [0, 1, 2].map(i => h("span", { class: "dot" + (i < m.fois ? " on" : "") })),
    ok ? h("span", { class: "badge-ok" }, "Maîtrisé") : h("span", {}, Math.min(m.fois, 3) + "/3" + (m.fois >= 3 ? " · reste : une fois sans recette" : ""))
  );
}
const COULEURS = [["#9cc97a", "#2f7a4f"], ["#f4a259", "#bc4b51"], ["#e9c46a", "#d0703c"], ["#8ecae6", "#2a7ea0"], ["#c9a0ad", "#6d597a"], ["#b8d36b", "#4d7a2b"]];
function plat(r, taille) {
  let n = 0; for (const c of r.id) n = (n * 31 + c.charCodeAt(0)) % 997;
  const [c1, c2] = COULEURS[n % COULEURS.length];
  return h("div", { class: "plat " + (taille || ""), style: "--c1:" + c1 + ";--c2:" + c2, role: "img", "aria-label": "Illustration : " + r.nom },
    h("span", { class: "plat-emoji" }, EMOJI[r.id]), taille === "grand" ? h("small", {}, "illustration · vraie photo en version fiable") : null);
}
function chipsObjectifs(r) {
  return h("div", { class: "meta" }, OBJECTIFS.filter(o => r.obj[o.cle] >= 3).map(o => h("span", { class: "chip" }, EMOJI_OBJ[o.cle] + " " + o.court)),
    r.obj.legumes >= 3 ? h("span", { class: "chip" }, "🥦 Légumes") : null);
}
function nutrition(r) {
  const [kcal, prot, lip, gluc, fib, portion] = NUTRI[r.id], f = portion / 100;
  return { kcal, prot, lip, gluc, fib, portion, pKcal: Math.round(kcal * f), pProt: Math.round(prot * f), pFib: Math.round(fib * f * 10) / 10 };
}
function benefices(r) {
  const n = nutrition(r), o = r.obj;
  const lignes = [
    ["💪", "Protéines", n.pProt + " g par portion", "≈ " + Math.round(n.pProt / 60 * 100) + " % d'un besoin journalier moyen (60 g)"],
    ["🌾", "Fibres", virgule(n.pFib) + " g par portion", "≈ " + Math.round(n.pFib / 30 * 100) + " % des 30 g conseillés par jour"],
    ["⚡", "Énergie", n.pKcal + " kcal par portion", "portion de " + n.portion + " g, hors riz"],
    ["📉", "Glycémie", ["IG plus élevé", "IG plus élevé", "IG modéré", "IG bas"][o.ig], o.ig >= 3 ? "énergie stable, pas de coup de barre" : o.ig === 2 ? "à accompagner de légumes" : "riz froid ou complet pour le baisser"],
    ["🥦", "Légumes", "niveau " + o.legumes + " sur 3", r.legume],
    ["💶", "Budget", "≈ " + euros(r.prix / 5) + " par portion", "contre ≈ " + PRIX_LIVRAISON + " € en livraison"]
  ];
  [["stress", "😌", "Anti-stress"], ["inflammation", "🛡️", "Anti-inflammatoire"], ["sommeil", "😴", "Bon pour le sommeil"]]
    .filter(([k]) => o[k] >= 3).forEach(([, e, lib]) => lignes.push([e, lib, "atout fort de ce plat", ""]));
  return lignes;
}
function barresNutrition(r) {
  const n = nutrition(r);
  const barre = (nom, val, max) => h("div", { class: "barre" }, h("span", {}, nom),
    h("span", { class: "piste" }, h("span", { style: "width:" + Math.min(100, val / max * 100) + "%" })), h("span", { class: "num" }, virgule(val) + " g"));
  return h("div", { class: "barres" },
    barre("Protéines", n.prot, 20), barre("Lipides", n.lip, 20), barre("Glucides", n.gluc, 20), barre("Fibres", n.fib, 20),
    h("div", { class: "barre" }, h("span", {}, "Énergie"), h("span", {}), h("span", { class: "num" }, n.kcal + " kcal")));
}

function stat(titre, valeur, detail) {
  return h("div", { class: "card" }, h("span", { class: "kind" }, titre), h("span", { class: "num big" }, valeur), h("span", { class: "sub" }, detail));
}

// ---------- Fichiers et partage (V0 locale) ----------
function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = h("a", { href: url, download: nom, hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exporterNotes(L) {
  if (navigator.share) {
    try { await navigator.share({ title: L.titre, text: L.notes }); toast("Dans Notes : sélectionne les articles, puis touche l'icône liste de contrôle"); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  copier(L.notes, null, "Texte copié : colle-le dans une note, sélectionne, puis touche l'icône liste de contrôle");
}
function remplacer(i) {
  const suivant = classement(etat.plan)[0];
  etat.plan[i] = suivant.r.id;
  etat.courses = {};
  sauver(); rendre();
  toast("Recette remplacée par : " + suivant.r.nom);
}
function carteDonnees() {
  const fichier = h("input", { type: "file", accept: "application/json,.json", id: "restaurer", hidden: true, onchange: (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { importerEtat(t); aller("aujourdhui"); toast("Données restaurées"); } catch (err) { toast("Fichier non reconnu : choisis une sauvegarde Mr Cooook (.json)"); } });
  } });
  const raz = h("button", { class: "lien-discret", onclick: () => {
    if (raz.dataset.arme) { etat = etatInitial(); genererPlan(); aller("aujourdhui"); toast("Tout est remis à zéro"); return; }
    raz.dataset.arme = "1"; raz.textContent = "Confirmer : tout effacer ?";
    setTimeout(() => { delete raz.dataset.arme; raz.textContent = "Tout remettre à zéro"; }, 4000);
  } }, "Tout remettre à zéro");
  return h("div", { class: "card" },
    h("h3", {}, "💾 Mes données"),
    h("p", { class: "note" }, "Elles restent dans ce navigateur, sur ce Mac. Fais une sauvegarde de temps en temps."),
    h("div", { class: "row" },
      h("button", { class: "btn ghost small", onclick: () => { telecharger("mr-cooook-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json", exporterEtat(), "application/json"); toast("Sauvegarde téléchargée"); } }, "Sauvegarder"),
      h("button", { class: "btn ghost small", onclick: () => fichier.click() }, "Restaurer une sauvegarde"),
      raz, fichier));
}

// ---------- Navigation : 4 onglets ; fiche, bilan et objectifs sont des pages filles ----------
const ONGLETS = { aujourdhui: ["🏠", "Aujourd'hui"], semaine: ["📅", "Semaine"], courses: ["🛒", "Courses"], progres: ["📈", "Progrès"] };
const PARENT = { bilan: "progres", objectifs: "progres" };
let vueActive = "aujourdhui";
function aller(vue) { vueActive = vue; rendre(); window.scrollTo(0, 0); }
function ouvrirFiche(r) {
  if (vueActive !== "recette") etat.retour = vueActive;
  etat.recetteVue = r.id; aller("recette");
}
const retour = cible => h("button", { class: "btn ghost small", onclick: () => aller(cible) }, "← Retour");
const entete = (titre, action) => h("div", { class: "row entete" }, h("h2", {}, titre), action || null);

// ---------- Aujourd'hui ----------
function jourIndex() { const j = new Date().getDay(); return j >= 1 && j <= 5 ? j - 1 : null; }
function recetteDuJour() {
  const grille = creneaux(), j = jourIndex();
  if (j === null) { const i0 = grille.findIndex(c => c.soir.type === "cuisine"); return { titre: "Week-end · prochaine séance lundi 18h", slot: grille[i0].soir, midi: null }; }
  const { midi, soir } = grille[j];
  const titres = { cuisine: "Ce soir à 18h · séance " + ((soir.i || 0) + 1), variante: "Ce soir · variante rapide", restes: "Ce soir · restes", libre: "Ce soir · libre" };
  return { titre: titres[soir.type], slot: soir, midi };
}
function libelleSlot(c) {
  if (!c) return "";
  if (c.type === "libre") return "Libre · restes du week-end";
  if (c.type === "variante") return "Variante " + CUISINES[c.v.cuisine] + " : " + c.v.nom;
  if (c.type === "restes") return "Restes : " + c.r.nom;
  return "Cuisiner : " + c.r.nom;
}
function proposerRapide() {
  const candidates = RECETTES.filter(r => r.temps <= 25 && !etat.plan.includes(r.id)).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  etat.rapideRang = ((etat.rapideRang ?? -1) + 1) % candidates.length;
  etat.rapide = candidates[etat.rapideRang].id;
  sauver(); rendre();
}
function vueAujourdhui() {
  const jour = recetteDuJour(), r = jour.slot.r, c = chiffresSemaine(), grille = creneaux(), j = jourIndex();
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const banniere = new Date().getDay() === 0
    ? h("div", { class: "banniere" }, h("span", {}, "📝 C'est dimanche : ton bilan prend 3 minutes."), h("button", { class: "btn small", onclick: () => aller("bilan") }, "Faire le bilan"))
    : null;

  const heros = r
    ? h("article", { class: "card heros" },
        plat(r, "grand"),
        h("span", { class: "kind" }, jour.titre),
        h("h2", {}, jour.slot.type === "variante" ? jour.slot.v.nom : r.nom),
        jour.slot.type === "variante" ? h("p", { class: "sub" }, "Base : " + r.nom + " · ajoute " + jour.slot.v.ajout) : null,
        h("div", { class: "meta" }, h("span", { class: "chip alt" }, "⏱ " + r.temps + " min"), benefices(r).slice(0, 3).map(([e, , val]) => h("span", { class: "chip" }, e + " " + val))),
        jour.midi ? h("p", { class: "sub" }, "Ce midi · " + libelleSlot(jour.midi)) : null,
        h("div", { class: "row" },
          h("button", { class: "btn grand", onclick: () => modeCuisine(r) }, "▶ Lancer la recette"),
          h("button", { class: "btn ghost", onclick: () => ouvrirFiche(r) }, "Voir la recette")))
    : h("article", { class: "card heros" }, h("span", { class: "kind" }, jour.titre), h("h2", {}, libelleSlot(jour.slot)),
        h("p", { class: "note" }, "Rien à cuisiner ce soir. Une envie ? Génère une recette rapide ci-dessous."));

  const bande = h("div", { class: "card" },
    h("div", { class: "row entete" }, h("h3", {}, "Cette semaine"), h("button", { class: "lien-discret", onclick: () => aller("semaine") }, "Voir le détail")),
    h("div", { class: "bande" }, grille.map((g, k) => {
      const s = g.soir, fait = s.type === "cuisine" && etat.faits[s.r.id];
      const icone = s.type === "cuisine" ? EMOJI[s.r.id] : s.type === "variante" ? "🔁" : s.type === "restes" ? "🍱" : "·";
      const legende = s.type === "cuisine" ? "Cuisine" : s.type === "variante" ? "Variante" : s.type === "restes" ? "Restes" : "Libre";
      return h("button", { class: "tuile" + (k === j ? " auj" : ""), "aria-label": JOURS[k] + " soir : " + libelleSlot(s),
        onclick: () => s.r ? ouvrirFiche(s.r) : aller("semaine") },
        h("span", { class: "tuile-jour" }, JOURS[k].slice(0, 3)), h("span", { class: "tuile-icone" }, fait ? "✅" : icone), h("span", { class: "tuile-legende" }, legende));
    })));

  const coches = Object.keys(etat.courses).filter(k => etat.courses[k]).length;
  const articles = etat.plan.reduce((s, id) => s + PAR_ID[id].ing.length, 0);
  const rapide = etat.rapide ? PAR_ID[etat.rapide] : null;
  const duo = h("div", { class: "duo" },
    h("div", { class: "card" },
      h("div", { class: "row entete" }, h("h3", {}, "🛒 Courses"), h("span", { class: "num sub" }, coches + "/" + articles)),
      h("span", { class: "piste large" }, h("span", { style: "width:" + Math.round(coches / articles * 100) + "%" })),
      h("div", { class: "row" }, h("button", { class: "btn small", onclick: apercuExport }, "Exporter vers Notes"), h("button", { class: "lien-discret", onclick: () => aller("courses") }, "Voir la liste"))),
    h("div", { class: "card" },
      h("h3", {}, "⏱ Pas le temps ?"),
      rapide
        ? h("div", { class: "rapide" }, plat(rapide, "petit"),
            h("div", { style: "min-width:0;display:grid;gap:4px" }, h("strong", {}, rapide.nom), h("span", { class: "sub" }, rapide.temps + " min · ≈ " + rapide.prix + " € pour 5"),
              h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => modeCuisine(rapide) }, "▶ Lancer"), h("button", { class: "lien-discret", onclick: () => ouvrirFiche(rapide) }, "Voir"), h("button", { class: "lien-discret", onclick: proposerRapide }, "Autre idée"))))
        : [h("p", { class: "sub", style: "margin:0" }, "Une recette de 25 min maximum, selon tes objectifs."),
           h("button", { class: "btn ghost small", onclick: proposerRapide }, "Générer une recette rapide")]));

  const priorites = [...OBJECTIFS].sort((a, b) => etat.poids[b.cle] - etat.poids[a.cle]).slice(0, 3);
  const enBref = h("div", { class: "card" },
    h("h3", {}, "La semaine en bref"),
    h("div", { class: "enbref" },
      h("div", {}, h("span", { class: "kind" }, "Courses"), h("span", { class: "num big" }, "≈ " + c.total + " €")),
      h("div", {}, h("span", { class: "kind" }, "Par repas"), h("span", { class: "num big" }, euros(c.parRepas))),
      h("div", {}, h("span", { class: "kind" }, "En livraison"), h("span", { class: "num big" }, "≈ " + c.livraison + " €"))),
    h("div", { class: "row entete" },
      h("span", { class: "sub" }, "🎯 Priorités : " + priorites.map(o => EMOJI_OBJ[o.cle] + " " + o.court).join(" · ")),
      h("button", { class: "lien-discret", onclick: () => aller("objectifs") }, "Régler")));

  return h("section", {},
    h("h2", { class: "date" }, date.charAt(0).toUpperCase() + date.slice(1)),
    banniere, heros, bande, duo, enBref);
}

// ---------- Fiche recette (ordre : photo, bénéfices, nutrition, ingrédients, étapes, astuce ; « Lancer » toujours visible) ----------
function vueRecette() {
  const r = PAR_ID[etat.recetteVue], n = nutrition(r);
  return h("section", { class: "fiche" },
    h("div", { class: "row" }, retour(etat.retour || "aujourdhui")),
    plat(r, "grand"),
    h("div", { style: "display:grid;gap:6px" },
      h("h2", { class: "titre-recette" }, EMOJI[r.id] + " " + r.nom),
      h("p", { class: "sub", style: "margin:0" }, r.origine + " · " + r.technique + " · " + r.temps + " min · ≈ " + r.prix + " € pour 5"),
      chipsObjectifs(r), points(r.id)),
    h("div", { class: "cards" },
      h("div", { class: "card" }, h("h3", {}, "Bénéfices"),
        h("ul", { class: "clean benefs" }, benefices(r).map(([e, nom, val, detail]) => h("li", { class: "benef-ligne" },
          h("span", { class: "emoji", "aria-hidden": "true" }, e),
          h("span", {}, h("strong", {}, nom + " : "), val, detail ? h("span", { class: "sub" }, " · " + detail) : null)))),
        h("p", { class: "benef" }, r.benefice)),
      h("div", { class: "card" }, h("h3", {}, "Score nutritionnel pour 100 g"), barresNutrition(r),
        h("span", { class: "sub" }, "Estimation du prototype, hors riz. Portion ≈ " + n.portion + " g."))),
    h("div", { class: "cards" },
      h("div", { class: "card" }, h("h3", {}, "Ingrédients pour 5"),
        h("ul", { class: "clean" }, r.ing.map(i => h("li", {}, "• " + i)), r.riz ? h("li", {}, "• Riz : 500 g, + 150 g pour la grosse portion") : null)),
      h("div", { class: "card" }, h("h3", {}, "Étapes"), h("ol", {}, r.etapes.map(e => h("li", {}, e))))),
    h("div", { class: "astuce" }, h("span", { class: "kind" }, "🎯 Astuce à maîtriser"), h("p", { style: "margin:4px 0 0" }, ASTUCES[r.id])),
    h("details", { class: "card" }, h("summary", {}, "Variantes (même base, autre placard)"),
      h("ul", { class: "clean" }, r.variantes.map(v => h("li", {}, h("strong", {}, v.nom), " · " + CUISINES[v.cuisine] + " : " + v.ajout)))),
    h("div", { class: "action-collante" }, h("button", { class: "btn grand", onclick: () => modeCuisine(r) }, "▶ Lancer la recette"))
  );
}

// ---------- Mode cuisine (« Lancer la recette ») ----------
const cuisine = { r: null, i: -1, minuteur: null, fin: 0, verrou: null };
function modeCuisine(r) {
  Object.assign(cuisine, { r, i: -1 });
  document.getElementById("cuisine").hidden = false;
  document.body.style.overflow = "hidden";
  if (navigator.wakeLock) navigator.wakeLock.request("screen").then(v => { cuisine.verrou = v; }, () => {});
  dessinerCuisine();
}
function fermerCuisine() {
  clearInterval(cuisine.minuteur); cuisine.minuteur = null;
  if (cuisine.verrou) { cuisine.verrou.release().catch(() => {}); cuisine.verrou = null; }
  document.getElementById("cuisine").hidden = true;
  document.body.style.overflow = "";
}
function lancerMinuteur(min) {
  clearInterval(cuisine.minuteur);
  cuisine.fin = Date.now() + min * 60000;
  const tic = () => {
    const el = document.getElementById("minuteur");
    const reste = Math.max(0, Math.round((cuisine.fin - Date.now()) / 1000));
    if (el) el.textContent = String(Math.floor(reste / 60)).padStart(2, "0") + ":" + String(reste % 60).padStart(2, "0");
    if (reste === 0) { clearInterval(cuisine.minuteur); cuisine.minuteur = null; toast("⏰ Minuteur terminé"); }
  };
  tic(); cuisine.minuteur = setInterval(tic, 1000);
}
function dessinerCuisine() {
  const { r, i } = cuisine, total = r.etapes.length;
  let centre;
  if (i < 0) {
    centre = [h("span", { class: "kind" }, "Avant de commencer"),
      h("div", { class: "astuce" }, h("span", { class: "kind" }, "🎯 Astuce à maîtriser"), h("p", { style: "margin:4px 0 0" }, ASTUCES[r.id])),
      h("h3", {}, "Sors les ingrédients (pour 5)"),
      h("ul", { class: "clean" }, r.ing.map((x, k) => h("li", {}, h("label", { class: "check" }, h("input", { type: "checkbox", id: "prep_" + k }), x))))];
  } else if (i < total) {
    const minutes = (r.etapes[i].match(/(\d+)\s*min/) || [])[1];
    centre = [h("span", { class: "kind" }, "Étape " + (i + 1) + " sur " + total),
      h("p", { class: "etape-texte" }, r.etapes[i]),
      minutes ? h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => lancerMinuteur(+minutes) }, "⏱ Minuteur " + minutes + " min"), h("span", { class: "minuteur num", id: "minuteur" }, cuisine.minuteur ? "" : "")) : null];
  } else {
    centre = [h("span", { class: "kind" }, "Terminé"), h("p", { class: "etape-texte" }, "Bravo ! " + EMOJI[r.id] + " Note ta séance pour avancer vers la maîtrise."),
      etat.plan.includes(r.id) && !etat.faits[r.id]
        ? h("div", { class: "row" },
            h("button", { class: "btn", onclick: () => { fermerCuisine(); declarer(r.id, false); } }, "Cuisiné avec la recette"),
            h("button", { class: "btn ghost", onclick: () => { fermerCuisine(); declarer(r.id, true); } }, "Cuisiné sans regarder"))
        : h("p", { class: "note" }, "Recette hors plan : elle ne compte pas dans la maîtrise de la semaine.")];
  }
  document.getElementById("cuisine").replaceChildren(
    h("div", { class: "row", style: "justify-content:space-between" }, h("strong", {}, EMOJI[r.id] + " " + r.nom), h("button", { class: "btn ghost small", onclick: fermerCuisine }, "Fermer")),
    h("div", { class: "centre" }, centre),
    h("div", { class: "row", style: "justify-content:space-between" },
      h("button", { class: "btn ghost", disabled: i < 0, onclick: () => { cuisine.i--; dessinerCuisine(); } }, "← Précédent"),
      i < total ? h("button", { class: "btn", onclick: () => { cuisine.i++; dessinerCuisine(); } }, i < 0 ? "C'est parti" : i === total - 1 ? "Terminer" : "Suivant →") : h("span", {})));
  if (cuisine.minuteur && i >= 0) lancerMinuteur((cuisine.fin - Date.now()) / 60000);
}
document.addEventListener("keydown", (e) => {
  if (document.getElementById("cuisine").hidden) return;
  if (e.key === "Escape") fermerCuisine();
  if (e.key === "ArrowRight" && cuisine.i < cuisine.r.etapes.length) { cuisine.i++; dessinerCuisine(); }
  if (e.key === "ArrowLeft" && cuisine.i >= 0) { cuisine.i--; dessinerCuisine(); }
});

// ---------- Semaine ----------
function vueSemaine() {
  const recettes = etat.plan.map(id => PAR_ID[id]);
  const lignes = creneaux().map((c, j) => h("tr", {}, h("th", { scope: "row" }, JOURS[j]), cellule(c.midi, "Midi"), cellule(c.soir, "Soir")));
  return h("section", {},
    entete("Semaine " + etat.semaine, h("button", { class: "btn ghost small", onclick: ouvrirRappels }, "🔔 Rappels 18h")),
    h("p", { class: "sub", style: "margin:0" }, recettes.length + " recettes à répéter · envie : " + libelleEnvie() + " · " + etat.tempsMax + " min max" + (etat.frigo.length ? " · frigo pris en compte" : "")),
    etat.complete ? h("p", { class: "note" }, "Peu de recettes tiennent en " + etat.tempsMax + " min : le plan est complété avec les plus rapides.") : null,
    h("div", { class: "legend" }, h("span", { style: "--c:var(--accent)" }, "Cuisine 18h"), h("span", { style: "--c:var(--warn)" }, "Variante rapide"), h("span", { style: "--c:var(--line)" }, "Restes")),
    h("div", { class: "grid-wrap" }, h("table", { class: "semaine" }, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Midi"), h("th", {}, "Soir"))), h("tbody", {}, lignes))),
    h("p", { class: "note" }, "Touche un plat pour sa fiche. Prix : estimations du prototype.")
  );
}
function cellule(c, moment) {
  if (c.type === "libre") return h("td", { class: "slot-restes", "data-label": moment }, h("span", { class: "kind" }, "Libre"), "Restes du week-end");
  if (c.type === "variante") return h("td", { class: "slot-variante", "data-label": moment }, h("span", { class: "kind" }, "🔁 Variante " + CUISINES[c.v.cuisine]), h("strong", {}, c.v.nom), h("span", { class: "sub" }, "+ " + c.v.ajout));
  if (c.type === "restes") return h("td", { class: "slot-restes", "data-label": moment }, h("span", { class: "kind" }, "🍱 Restes"), c.r.nom);
  const r = c.r, fait = etat.faits[r.id], n = couverture()[r.id];
  return h("td", { class: "slot-cuisine", "data-label": moment },
    h("span", { class: "kind" }, "18h · séance " + (c.i + 1) + " · quantités ×" + n),
    h("button", { class: "lien", onclick: () => ouvrirFiche(r) }, EMOJI[r.id] + " " + r.nom),
    h("span", { class: "sub" }, r.temps + " min · ≈ " + r.prix * n + " € · " + r.legume),
    points(r.id),
    fait ? h("span", { class: "chip" }, fait.sansRecette ? "✓ Cuisiné sans recette" : "✓ Cuisiné")
         : h("div", { class: "row" },
             h("button", { class: "btn small", onclick: () => modeCuisine(r) }, "▶ Lancer"),
             h("button", { class: "btn ghost small", onclick: () => declarer(r.id, false) }, "✓ Fait"),
             h("button", { class: "btn ghost small", onclick: () => declarer(r.id, true) }, "✓ Sans recette"),
             h("button", { class: "lien-discret", onclick: () => remplacer(c.i), "aria-label": "Remplacer " + r.nom }, "Remplacer"))
  );
}
function declarer(id, sansRecette) {
  etat.faits[id] = { sansRecette };
  const m = etat.maitrise[id] || { fois: 0, sansRecette: false };
  m.fois += 1; m.sansRecette = sansRecette;
  etat.maitrise[id] = m; noterUsage("seances");
  sauver(); rendre();
  toast(m.fois >= 3 && sansRecette ? "Plat maîtrisé : " + PAR_ID[id].nom : "Séance notée");
}

// ---------- Courses ----------
const RAYONS = ["Fruits et légumes", "Boucherie et poissonnerie", "Frais", "Épicerie"];
function rayon(ing) {
  const t = ing.toLowerCase();
  if (/boîte|coco|sauce|pâte de|fécule|farine|tortilla|nouilles|pâtes|semoule|lentilles|raisins|tahini|pain|provence|cumin|piment|muscade|graines/.test(t)) return 3;
  if (/poulet|bœuf|saumon|cabillaud|colin|porc|cuisse/.test(t)) return 1;
  if (/œuf|crème|lait|beurre|emmental|feta|mozzarella|yaourt|tofu/.test(t)) return 2;
  return 0;
}
function listeCourses() {
  const parRayon = RAYONS.map(() => []), fois = couverture();
  etat.plan.map(id => PAR_ID[id]).forEach(r => r.ing.forEach((ing, i) => parRayon[rayon(ing)].push({ cle: r.id + ":" + i, ing: (fois[r.id] > 1 ? "×" + fois[r.id] + " " : "") + ing, r })));
  const remplis = RAYONS.map((nom, k) => ({ nom, items: parRayon[k] })).filter(x => x.items.length);
  const titre = "Courses Mr Cooook · semaine " + etat.semaine;
  return {
    titre, remplis,
    notes: titre + "\n\n" + remplis.map(x => x.nom + "\n" + x.items.map(i => i.ing).join("\n")).join("\n\n"),
    obsidian: "## " + titre + "\n\n" + remplis.map(x => "### " + x.nom + "\n" + x.items.map(i => "- [" + (etat.courses[i.cle] ? "x" : " ") + "] " + i.ing).join("\n")).join("\n\n")
  };
}
function apercuExport() {
  const L = listeCourses(), d = document.getElementById("fiche");
  d.replaceChildren(h("div", { style: "display:grid;gap:12px" },
    h("div", { class: "row", style: "justify-content:space-between" }, h("h2", {}, "Exporter la liste cochable"), h("button", { class: "btn ghost small", onclick: () => d.close() }, "Fermer")),
    h("p", { class: "note" }, "Aperçu de la note. Dans Notes, sélectionne les articles puis touche l'icône liste de contrôle : chaque ligne devient une case à cocher, synchronisée sur l'iPhone."),
    h("div", { class: "apple" }, h("strong", {}, L.titre),
      L.remplis.map(x => [h("span", { class: "apple-rayon" }, x.nom),
        x.items.map(i => h("div", { class: "item" + (etat.courses[i.cle] ? " on" : "") }, h("span", { class: "rond" + (etat.courses[i.cle] ? " on" : ""), "aria-hidden": "true" }), h("span", {}, i.ing)))])),
    h("div", { class: "row" },
      h("button", { class: "btn", onclick: () => exporterNotes(L) }, "Exporter vers Apple Notes"),
      h("button", { class: "btn ghost", onclick: () => { telecharger("courses-semaine-" + etat.semaine + ".md", L.obsidian, "text/markdown"); toast("Fichier .md téléchargé : glisse-le dans ton coffre Obsidian"); } }, "Fichier pour Obsidian")),
    h("div", { class: "row" },
      h("button", { class: "btn ghost small", onclick: () => copier(L.notes, null, "Texte copié : colle-le dans une note") }, "Copier le texte"))));
  d.showModal();
}
function vueCourses() {
  const sousOnglet = etat.coursesOnglet || "semaine";
  const segment = h("div", { class: "segment", role: "group", "aria-label": "Liste affichée" },
    [["semaine", "Cette semaine"], ["placard", "Placard du mois"]].map(([k, lib]) =>
      h("button", { "aria-pressed": String(k === sousOnglet), onclick: () => { etat.coursesOnglet = k; sauver(); rendre(); } }, lib)));
  if (sousOnglet === "placard") return h("section", {}, entete("Courses", segment), contenuPlacard());
  const L = listeCourses(), recettes = etat.plan.map(id => PAR_ID[id]);
  const coches = Object.keys(etat.courses).filter(k => etat.courses[k]).length, total = L.remplis.reduce((s, x) => s + x.items.length, 0);
  const rizSemaine = recettes.filter(r => r.riz).length;
  return h("section", {},
    entete("Courses", segment),
    h("div", { class: "banniere" },
      h("span", {}, coches + "/" + total + " articles cochés"),
      h("button", { class: "btn small", onclick: apercuExport }, "Exporter vers Notes")),
    h("p", { class: "note" }, "« ×3 » : quantité d'un repas pour 5, à multiplier par 3 (la séance couvre aussi restes et variantes). Riz : " + (rizSemaine * 650) + " g par séance servie avec du riz, pris dans le placard."),
    h("div", { class: "cards" }, L.remplis.map(x => h("div", { class: "card" }, h("h3", {}, x.nom),
      h("ul", { class: "clean" }, x.items.map(({ cle, ing, r }) => h("li", {}, h("label", { class: "check" },
        h("input", { type: "checkbox", id: "c_" + cle.replace(/\W/g, "_"), checked: !!etat.courses[cle], onchange: (e) => { etat.courses[cle] = e.target.checked; sauver(); rendre(); } }),
        h("span", {}, ing, h("span", { class: "sub" }, " · " + EMOJI[r.id]))))))))));
}
function contenuPlacard() {
  const utilisees = new Set(etat.plan.flatMap(id => PAR_ID[id].variantes.map(v => v.cuisine)));
  return [
    h("p", { class: "note" }, "Acheté une fois par mois en grosse quantité. C'est lui qui rend les variantes possibles sans courses en plus."),
    h("div", { class: "card" }, h("h3", {}, "Base"), h("ul", { class: "clean" }, PLACARD_BASE.map(([n, q]) => h("li", { class: "row entete" }, h("span", {}, n), h("span", { class: "num sub" }, q))))),
    h("div", { class: "cards" }, Object.entries(PLACARD_CUISINES).map(([k, liste]) => h("div", { class: "card" },
      h("div", { class: "row entete" }, h("h3", {}, CUISINES[k]), utilisees.has(k) ? h("span", { class: "chip" }, "utile cette semaine") : null),
      h("ul", { class: "clean" }, liste.map(x => h("li", {}, "• " + x))))))
  ];
}

// ---------- Rappels (fenêtre ouverte depuis Semaine) ----------
function ouvrirRappels() {
  const d = document.getElementById("fiche"), { evts, texte } = construireIcs(prochainLundi());
  d.replaceChildren(h("div", { class: "pile" },
    h("div", { class: "row entete" }, h("h2", {}, "🔔 Rappels à 18h"), h("button", { class: "btn ghost small", onclick: () => d.close() }, "Fermer")),
    h("ul", { class: "clean" }, evts.map(({ jour, r }) => h("li", { class: "row entete" },
      h("span", {}, EMOJI[r.id] + " " + r.nom), h("span", { class: "sub" }, jour.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " · 18h")))),
    h("p", { class: "note" }, "Le fichier s'ouvre dans Calendrier : confirme l'ajout, les rappels sonnent à 18h."),
    h("div", { class: "row" },
      h("button", { class: "btn", onclick: () => { telecharger("mr-cooook-semaine-" + etat.semaine + ".ics", texte, "text/calendar"); toast("Fichier calendrier téléchargé : ouvre-le pour l'ajouter"); } }, "Ajouter au Calendrier"),
      h("button", { class: "btn ghost small", onclick: () => copier(texte, null, "Format .ics copié") }, "Copier le format .ics"))));
  d.showModal();
}

// ---------- Bilan du dimanche ----------
function vueBilan() {
  const recettes = etat.plan.map(id => PAR_ID[id]);
  const brouillon = etat.bilans.brouillon || (etat.bilans.brouillon = {});
  const lignes = recettes.map(r => {
    const b = brouillon[r.id] || (brouillon[r.id] = { note: 0, restes: false, difficulte: "" });
    const etoiles = h("div", { class: "stars", role: "group", "aria-label": "Note de " + r.nom },
      [1, 2, 3, 4, 5].map(n => h("button", { class: n <= b.note ? "on" : "", "aria-label": n + " sur 5", onclick: () => { b.note = n; sauver(); rendre(); } }, "★")));
    const difficulte = h("div", { class: "row", role: "radiogroup", "aria-label": "Difficulté de " + r.nom },
      ["Facile", "Moyen", "Difficile"].map(d => h("button", { class: "btn small" + (b.difficulte === d ? "" : " ghost"), role: "radio", "aria-checked": String(b.difficulte === d), onclick: () => { b.difficulte = d; sauver(); rendre(); } }, d)));
    const fait = etat.faits[r.id];
    return h("div", { class: "card" },
      h("h3", {}, EMOJI[r.id] + " " + r.nom),
      h("span", { class: "sub" }, fait ? (fait.sansRecette ? "Cuisiné sans recette" : "Cuisiné avec la recette") : "Pas cuisiné cette semaine"),
      etoiles,
      h("span", { class: "kind" }, "Difficulté ressentie"), difficulte,
      h("label", { class: "check" }, h("input", { type: "checkbox", id: "restes_" + r.id, checked: b.restes, onchange: (e) => { b.restes = e.target.checked; sauver(); } }), "Il reste des restes"));
  });
  const frigo = h("div", { class: "row" }, FRIGO.map(([k, lib]) => h("label", { class: "check chip alt" },
    h("input", { type: "checkbox", id: "frigo_" + k.replace(/\W/g, "_"), checked: etat.frigo.includes(k),
      onchange: (e) => { etat.frigo = e.target.checked ? [...etat.frigo, k] : etat.frigo.filter(x => x !== k); sauver(); } }), lib)));
  return h("section", {},
    h("div", { class: "row" }, retour("progres")),
    h("h2", {}, "📝 Bilan du dimanche"),
    h("p", { class: "note" }, "3 minutes, sans rien taper : note, difficulté et restes pour chaque plat, puis 4 questions pour préparer la semaine suivante."),
    h("h3", {}, "La semaine écoulée"),
    h("div", { class: "cards" }, lignes),
    h("h3", {}, "La semaine prochaine"),
    h("div", { class: "cards" },
      choix("Combien de séances de cuisine ?", [[2, "2"], [3, "3"], [4, "4"]], etat.seances, v => { etat.seances = v; }),
      choix("Temps maximum par séance ?", [[20, "20 min"], [35, "35 min"], [50, "50 min"]], etat.tempsMax, v => { etat.tempsMax = v; }),
      choix("Envie de cuisine ?", [...Object.entries(CUISINES), ["surprise", "Surprise"]], etat.envie, v => { etat.envie = v; })),
    h("div", { class: "card" }, h("h3", {}, "Qu'est-ce qui reste au frigo ?"), h("span", { class: "sub" }, "Les recettes qui l'utilisent passent en premier."), frigo),
    h("div", { class: "action-collante" }, h("button", { class: "btn grand", onclick: cloturer }, "Valider et préparer la semaine " + (etat.semaine + 1)))
  );
}
function choix(titre, options, valeur, poser) {
  return h("div", { class: "card" }, h("h3", {}, titre),
    h("div", { class: "row", role: "radiogroup", "aria-label": titre }, options.map(([v, lib]) =>
      h("button", { class: "btn small" + (v === valeur ? "" : " ghost"), role: "radio", "aria-checked": String(v === valeur), onclick: () => { poser(v); sauver(); rendre(); } }, lib))));
}
function cloturer() {
  const faites = Object.keys(etat.faits).length;
  const brouillon = etat.bilans.brouillon || {};
  for (const id in brouillon) if (brouillon[id].difficulte && etat.maitrise[id]) etat.maitrise[id].difficulte = brouillon[id].difficulte;
  etat.historique.push({ semaine: etat.semaine, faites });
  etat.bilans["semaine_" + etat.semaine] = brouillon;
  delete etat.bilans.brouillon;
  noterUsage("bilans");
  etat.semaine += 1;
  etat.rapide = null;
  genererPlan();
  aller("aujourdhui");
  toast("Semaine " + etat.semaine + " prête");
}

// ---------- Objectifs du mois (page fille de Progrès) ----------
function vueObjectifs() {
  return h("section", {},
    h("div", { class: "row" }, retour("progres")),
    h("h2", {}, "🎯 Objectifs de " + etat.mois),
    h("div", { class: "card" },
      h("h3", {}, "Comment ils se tiennent"),
      h("div", { class: "chaine" }, SYSTEME.map((x, i) => [i ? h("span", { class: "fleche", "aria-hidden": "true" }, "→") : null, h("span", { class: "chip" }, x)])),
      h("p", { class: "note" }, "Glycémie stable → moins de coups de barre et de pics de cortisol → meilleur sommeil → récupération → force. Une inflammation basse soutient l'ensemble ; cuisiner soi-même fait baisser le budget. 🥦 Les légumes comptent toujours.")),
    h("p", { class: "note" }, "De 1 (secondaire) à 5 (prioritaire ce mois-ci). Touche « Pourquoi et comment » pour le détail."),
    h("ul", { class: "clean objectifs" }, OBJECTIFS.map(o => {
      const valeur = h("span", { class: "num" }, etat.poids[o.cle] + "/5");
      return h("li", { class: "card" },
        h("div", { class: "row entete" }, h("label", { for: "poids_" + o.cle }, h("h3", {}, EMOJI_OBJ[o.cle] + " " + o.nom)), valeur),
        h("input", { type: "range", id: "poids_" + o.cle, min: 1, max: 5, step: 1, value: etat.poids[o.cle],
          oninput: (e) => { etat.poids[o.cle] = +e.target.value; valeur.textContent = etat.poids[o.cle] + "/5"; sauver(); } }),
        h("details", {}, h("summary", {}, "Pourquoi et comment"),
          h("dl", {},
            h("dt", {}, "Comment ça marche"), h("dd", {}, o.comment),
            h("dt", {}, "Dans l'assiette"), h("dd", {}, o.assiette),
            h("dt", {}, "Ce que fait Mr Cooook"), h("dd", {}, o.action))));
    })),
    h("p", { class: "note" }, "Repères généraux de nutrition, pas un avis médical."),
    h("div", { class: "action-collante" }, h("button", { class: "btn grand", onclick: () => { genererPlan(); aller("aujourdhui"); toast("Plan recalculé selon tes objectifs"); } }, "Recalculer le plan"))
  );
}

// ---------- Progrès : bilan, objectifs, maîtrise ----------
function vueProgres() {
  const enCours = RECETTES.filter(r => etat.maitrise[r.id]);
  const maitrisees = enCours.filter(r => etat.maitrise[r.id].fois >= 3 && etat.maitrise[r.id].sansRecette).length;
  const hist = [...etat.historique, { semaine: etat.semaine, faites: Object.keys(etat.faits).length, courante: true }].slice(-8);
  const W = 320, H = 150, g = 28, bw = (W - g - 8) / hist.length;
  const y = v => H - 22 - (v / 4) * (H - 40);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Séances cuisinées par semaine");
  svg.style.maxWidth = "480px"; svg.style.width = "100%";
  const S = (tag, a, txt) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; svg.append(e); return e; };
  [0, 1, 2, 3, 4].forEach(v => { S("line", { x1: g, x2: W - 4, y1: y(v), y2: y(v), stroke: "var(--line)", "stroke-width": 1 }); S("text", { x: g - 8, y: y(v) + 4, "text-anchor": "end" }, v); });
  hist.forEach((s, i) => {
    const x = g + 4 + i * bw;
    S("rect", { x: x + 4, y: y(s.faites), width: bw - 8, height: y(0) - y(s.faites), rx: 3, fill: s.courante ? "var(--warn)" : "var(--accent)" });
    S("text", { x: x + bw / 2, y: H - 6, "text-anchor": "middle" }, "S" + s.semaine);
  });
  const tries = [...OBJECTIFS].sort((a, b) => etat.poids[b.cle] - etat.poids[a.cle]);
  return h("section", {},
    h("h2", {}, "Progrès"),
    h("div", { class: "banniere" },
      h("div", {}, h("strong", {}, "📝 Bilan du dimanche"), h("div", { class: "sub" }, "3 min : notes, difficulté, restes, puis 4 questions pour la semaine suivante.")),
      h("button", { class: "btn small", onclick: () => aller("bilan") }, "Faire le bilan")),
    h("div", { class: "cards stats" },
      stat("Plats maîtrisés", String(maitrisees), "3 fois, la dernière sans recette"),
      stat("Plats en cours", String(enCours.length - maitrisees), "reviennent en priorité"),
      stat("Cette semaine", Object.keys(etat.faits).length + "/" + etat.plan.length, "séances cuisinées")),
    h("div", { class: "card" }, h("h3", {}, "Plats commencés"),
      enCours.length ? h("ul", { class: "clean" }, enCours.map(r => h("li", { class: "row entete" },
        h("button", { class: "lien-discret fort", onclick: () => ouvrirFiche(r) }, EMOJI[r.id] + " " + r.nom,
          etat.maitrise[r.id].difficulte ? " · " + etat.maitrise[r.id].difficulte.toLowerCase() : ""), points(r.id))))
                     : h("p", { class: "note" }, "Coche une séance « Fait » pour commencer.")),
    h("div", { class: "card" },
      h("div", { class: "row entete" }, h("h3", {}, "🎯 Objectifs de " + etat.mois), h("button", { class: "btn ghost small", onclick: () => aller("objectifs") }, "Régler")),
      h("ul", { class: "clean" }, tries.map(o => h("li", { class: "barre" }, h("span", {}, EMOJI_OBJ[o.cle] + " " + o.court),
        h("span", { class: "piste" }, h("span", { style: "width:" + etat.poids[o.cle] * 20 + "%" })), h("span", { class: "num" }, etat.poids[o.cle] + "/5"))))),
    h("div", { class: "card" }, h("h3", {}, "Séances cuisinées par semaine"), svg, h("span", { class: "sub" }, "Orange : semaine en cours")),
    h("p", { class: "sub" }, "Usage local : " + etat.usage.ouvertures + " ouvertures · " + etat.usage.seances + " séances · " + etat.usage.bilans + " bilans"),
    carteDonnees()
  );
}

// ---------- Rendu ----------
function rendre() {
  document.getElementById("soustitre").textContent = etat.mois + " · semaine " + etat.semaine + " · 5 personnes";
  const actif = vueActive === "recette" ? (etat.retour in ONGLETS ? etat.retour : PARENT[etat.retour]) : (PARENT[vueActive] || vueActive);
  const nav = document.getElementById("onglets");
  nav.replaceChildren(...Object.entries(ONGLETS).map(([k, [icone, nom]]) => h("button", { role: "tab", "aria-selected": String(k === actif), onclick: () => aller(k) },
    h("span", { class: "onglet-icone", "aria-hidden": "true" }, icone), h("span", {}, nom))));
  const fabrique = { aujourdhui: vueAujourdhui, recette: vueRecette, semaine: vueSemaine, courses: vueCourses, progres: vueProgres, bilan: vueBilan, objectifs: vueObjectifs }[vueActive];
  document.getElementById("vue").replaceChildren(fabrique());
}
noterUsage("ouvertures");
if (!etat.plan || !etat.plan.every(id => PAR_ID[id])) genererPlan();
sauver();
rendre();
