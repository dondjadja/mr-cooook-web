"use strict";
// ---------- Mode cuisine (« Lancer la recette », DESIGN.md) ----------
// Interrupteur `mode_cuisine` actif : présentation générale (« Commencer »), puis une étape par écran avec minuteur.
// Interrupteur coupé : ancien pas à pas (une étape par écran, sans présentation ni minuteur).
// Nouveau nom global : afficherCuisine seulement (ses outils sont rangés sur la fonction elle-même).
// L'état d'écran (non stocké) vit dans ECRAN.cuisine ; l'état de l'appli reste le global `etat`.
// Ce fichier ne compte ni lancements ni plans_b (comptés par « Ce soir » avant l'appel) ; marquerFaite compte seances_faites.

// Point d'entrée appelé par lancer() (ce_soir.js) : ouvre la présentation générale de la recette.
function afficherCuisine(recette, version) {
  afficherCuisine.quitter();
  ECRAN.recette_id = recette.id; ECRAN.etape = 0;
  ECRAN.cuisine = actif("mode_cuisine")
    ? { recette_id: recette.id, version: version === "normale" ? "normale" : "rapide", phase: "presentation",
        minuteur: null, intervalle: null, verrou: null }
    : null;
  if (ECRAN.cuisine) {
    afficherCuisine.garderEcran(ECRAN.cuisine);
    // Le navigateur relâche le verrou quand l'appli passe en arrière-plan : on le redemande au retour.
    if (!afficherCuisine.ecoute && typeof document !== "undefined") {
      afficherCuisine.ecoute = true;
      document.addEventListener("visibilitychange", () => {
        const c = ECRAN.cuisine;
        if (document.visibilityState === "visible" && c && !c.verrou) afficherCuisine.garderEcran(c);
      });
    }
  }
  aller("pas_a_pas");
}
// Écran allumé si le navigateur le permet (navigator.wakeLock) ; sinon rien, sans erreur.
afficherCuisine.garderEcran = c => {
  try {
    if (typeof navigator === "undefined" || !navigator.wakeLock || typeof navigator.wakeLock.request !== "function") return;
    navigator.wakeLock.request("screen").then(v => {
      if (ECRAN.cuisine !== c) { v.release().catch(() => {}); return; }
      c.verrou = v;
      v.addEventListener("release", () => { if (c.verrou === v) c.verrou = null; });
    }).catch(() => { /* refusé : l'écran pourra s'éteindre */ });
  } catch (err) { /* verrou d'écran indisponible */ }
};
// Arrête le minuteur d'une séance de cuisine.
afficherCuisine.arreterMinuteur = c => {
  if (!c) return;
  if (c.intervalle) clearInterval(c.intervalle);
  c.intervalle = null; c.minuteur = null;
};
// Fin de la séance de cuisine : minuteur arrêté, verrou d'écran relâché, état d'écran vidé.
afficherCuisine.quitter = () => {
  const c = ECRAN.cuisine;
  if (!c) return;
  afficherCuisine.arreterMinuteur(c);
  if (c.verrou) { try { c.verrou.release().catch(() => {}); } catch (err) { /* déjà relâché */ } c.verrou = null; }
  ECRAN.cuisine = null;
};

function vuePasAPas() {
  const r = existe("recetteParId") ? recetteParId(ECRAN.recette_id) : null;
  if (!r) { ECRAN.vue = "ce_soir"; return vueCeSoir(); }
  const c = ECRAN.cuisine;
  if (c && actif("mode_cuisine") && c.recette_id === r.id) return c.phase === "presentation" ? vuePresentation(r, c) : vueEtapeCuisine(r, c);
  const total = r.etapes.length, i = Math.min(Math.max(ECRAN.etape, 0), total - 1), derniere = i === total - 1;
  const changer = k => { ECRAN.etape = k; rendre(); window.scrollTo(0, 0); };
  const actions = derniere
    ? [h("button", { class: "btn principal", onclick: () => terminer(r, false) }, "C'est fait"),
       h("button", { class: "btn second large", onclick: () => terminer(r, true) }, "Fait sans recette")]
    : [h("button", { class: "btn principal", onclick: () => changer(i + 1) }, "Étape suivante")];
  return h("section", { class: "ecran" },
    enTete(drapeau(r.pays) + " " + r.nom, "ce_soir"),
    h("p", { class: "compteur" }, "Étape " + (i + 1) + " sur " + total),
    h("p", { class: "etape" }, r.etapes[i]),
    actions,
    i > 0 ? h("button", { class: "lien-texte", onclick: () => changer(i - 1) }, "Étape précédente") : null);

  // Présentation générale : photo, drapeau + nom, durée de la version, ingrédients du foyer (part de Jeff), le geste.
  function vuePresentation(r, c) {
    const duree = c.version === "rapide" ? r.temps_rapide : r.temps_normal;
    let ingredients = r.ingredients, foyer = 5;
    if (existe("quantitesFoyer") && existe("lireProfil")) {
      try { const p = lireProfil(); ingredients = quantitesFoyer(r, p); foyer = (p && p.foyer) || 5; }
      catch (err) { console.warn("quantitesFoyer : " + err.message); }
    }
    const qte = (q, u) => nombre(q) + (u === "pièce" ? " ×" : " " + u);
    const commencer = () => { c.phase = "etapes"; ECRAN.etape = 0; rendre(); window.scrollTo(0, 0); };
    return h("section", { class: "ecran mode-cuisine" },
      enTete(drapeau(r.pays) + " " + r.nom, "ce_soir"),
      illustration(r),
      h("p", { class: "ligne" }, "⏱ " + duree + " min" + (c.version === "rapide" ? " (rapide)" : "")),
      h("div", { class: "bloc" }, h("h3", {}, "Ingrédients pour " + foyer),
        h("ul", { class: "clean" }, ingredients.map(i => h("li", { class: "ingredient-cuisine" },
          h("span", {}, qte(i.quantite, i.unite) + " " + i.nom),
          i.part_jeff != null ? h("span", { class: "part-jeff" }, "ta part : " + (i.unite === "pièce" ? nombre(i.part_jeff) : qte(i.part_jeff, i.unite))): null)))),
      r.gestes && r.gestes[0] ? h("p", { class: "geste" }, h("strong", {}, "Le geste : "), r.gestes[0]) : null,
      h("button", { class: "btn principal", onclick: commencer }, "Commencer"));
  }

  // Une étape par écran : « Étape n sur N », texte sans le suffixe de durée, minuteur si l'étape a une durée.
  function vueEtapeCuisine(r, c) {
    const total = r.etapes.length, i = Math.min(Math.max(ECRAN.etape, 0), total - 1), derniere = i === total - 1;
    const brut = String(r.etapes[i]);
    const minutes = existe("dureeEtape") ? dureeEtape(brut) : null;
    const texte = minutes != null ? brut.replace(/\s*— \d+ min\s*$/, "") : brut;
    const changer = k => { ECRAN.etape = k; rendre(); window.scrollTo(0, 0); };
    const m = c.minuteur, enCoursIci = m && !m.fini && m.etape === i;
    const actions = derniere
      ? [h("button", { class: "btn principal", onclick: () => terminer(r, false) }, "C'est fait"),
         h("button", { class: "btn second large", onclick: () => terminer(r, true) }, "Fait sans recette")]
      : [h("button", { class: "btn principal", onclick: () => changer(i + 1) }, "Étape suivante")];
    return h("section", { class: "ecran mode-cuisine" },
      enTete(drapeau(r.pays) + " " + r.nom, "ce_soir"),
      bandeauMinuteur(c),
      h("p", { class: "compteur" }, "Étape " + (i + 1) + " sur " + total),
      h("p", { class: "etape" }, texte),
      minutes != null && !enCoursIci
        ? h("button", { class: "btn second large", onclick: () => lancerMinuteur(c, i, minutes) }, "⏲ Minuteur " + minutes + " min")
        : null,
      actions,
      i > 0 ? h("button", { class: "lien-texte", onclick: () => changer(i - 1) }, "Étape précédente") : null);
  }

  // Bandeau du minuteur, en haut de chaque étape tant qu'il existe (changer d'étape ne l'arrête pas).
  function bandeauMinuteur(c) {
    const m = c.minuteur;
    if (!m) return null;
    const fermer = () => { afficherCuisine.arreterMinuteur(c); rendre(); };
    if (m.fini) {
      return h("div", { class: "minuteur-bandeau fini", role: "alert" },
        h("span", {}, "⏰ Minuteur terminé (étape " + (m.etape + 1) + ")"),
        h("button", { class: "btn ghost small", onclick: fermer }, "OK"));
    }
    return h("div", { class: "minuteur-bandeau", role: "timer" },
      h("span", {}, "⏲ Étape " + (m.etape + 1) + " : ", h("span", { class: "num decompte", "data-decompte": "" }, mmss(reste(m)))),
      h("button", { class: "btn ghost small", onclick: fermer }, "Arrêter"));
  }
  function lancerMinuteur(c, etape, minutes) {
    afficherCuisine.arreterMinuteur(c);
    c.minuteur = { etape, minutes, fin: Date.now() + minutes * 60000, fini: false };
    c.intervalle = setInterval(() => tic(c), 250);
    rendre();
  }
  // Décompte calculé sur l'heure de fin (juste même si le téléphone ralentit les minuteries).
  function tic(c) {
    const m = c.minuteur;
    if (!m || m.fini) return;
    const s = reste(m);
    for (const el of document.querySelectorAll("[data-decompte]")) el.textContent = mmss(s);
    if (s > 0) return;
    m.fini = true; clearInterval(c.intervalle); c.intervalle = null;
    try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([300, 150, 300]); }
    catch (err) { /* vibration indisponible */ }
    toast("⏰ Minuteur terminé");
    if (ECRAN.vue === "pas_a_pas" && ECRAN.cuisine === c) rendre();
  }
  function reste(m) { return Math.max(0, Math.ceil((m.fin - Date.now()) / 1000)); }
  function mmss(s) { return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
}

function terminer(r, sansRecette) {
  if (existe("marquerFaite")) agir(e => marquerFaite(e, r.id, sansRecette));
  else console.warn("marquerFaite absente : séance non notée");
  afficherCuisine.quitter();
  ECRAN.plan_b_id = null; ECRAN.etape = 0;
  toast(sansRecette ? "Bravo : fait sans recette" : "Séance notée");
  aller("ce_soir");
}
