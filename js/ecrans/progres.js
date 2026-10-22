"use strict";
// ---------- « Progrès » : compteurs d'usage locaux et lien « Mon profil » ;
// « Semaine » et « Courses » : écran simple « arrive bientôt » (jalon suivant ; code V0 gardé dans v0_archive.js) ----------
function vueProgres() {
  const etat = lireEtatV1(), u = etat.usage, p = etat.progression || {};
  const plats = Object.keys(p).filter(id => p[id] && p[id].faits > 0).length;
  const ligne = (lib, v) => h("li", { class: "valeur" }, h("span", {}, lib), h("span", { class: "num" }, String(v || 0)));
  return h("section", { class: "ecran" },
    h("h2", {}, "Progrès"),
    h("div", { class: "bloc" }, h("h3", {}, "Usage (sur cet appareil)"),
      h("ul", { class: "clean" },
        ligne("Ouvertures", u.ouvertures), ligne("Recettes lancées", u.lancements), ligne("Séances faites", u.seances_faites),
        ligne("Plans B", u.plans_b), ligne("Caps validés", u.caps_valides), ligne("Plats déjà cuisinés", plats))),
    h("button", { class: "btn second large", onclick: ouvrirProfil }, "Mon profil"));
}
// afficherProfil() est fournie par web/js/ecrans/profil.js (lot realisation_ecran_profil) : appel protégé.
function ouvrirProfil() {
  if (typeof afficherProfil === "function") { ECRAN.vue = "progres"; afficherProfil(); window.scrollTo(0, 0); }
  else toast("Mon profil : arrive bientôt");
}
function vueBientot(titre) {
  return h("section", { class: "ecran" },
    h("h2", {}, titre),
    h("p", { class: "info" }, "Arrive bientôt : au prochain jalon."));
}
