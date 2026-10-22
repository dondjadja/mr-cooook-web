"use strict";
// ---------- Recette pas à pas : une étape par écran, « Étape suivante » ;
// à la dernière : « C'est fait » / « Fait sans recette » → marquerFaite, retour à « Ce soir » ----------
function vuePasAPas() {
  const r = existe("recetteParId") ? recetteParId(ECRAN.recette_id) : null;
  if (!r) { ECRAN.vue = "ce_soir"; return vueCeSoir(); }
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
}
function terminer(r, sansRecette) {
  if (existe("marquerFaite")) agir(e => marquerFaite(e, r.id, sansRecette));
  else console.warn("marquerFaite absente : séance non notée");
  ECRAN.plan_b_id = null; ECRAN.etape = 0;
  toast(sansRecette ? "Bravo : fait sans recette" : "Séance notée");
  aller("ce_soir");
}
