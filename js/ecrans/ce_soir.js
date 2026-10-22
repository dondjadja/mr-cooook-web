"use strict";
// ---------- Écran « Ce soir » (disposition de DESIGN.md, de haut en bas) ----------
// jour · illustration · drapeau + nom · 1 ligne (durée + bénéfice) · le geste · lien « Nutrition »
// · bouton principal · « Plan B » / « Rapide » côte à côte · lien « Pas ce soir » · (barre du bas dans index.html)

// Ce que l'écran affiche ce soir : un seul plat, sa version et s'il s'agit du plan B.
function soirAffiche(etat, date) {
  const soir = recetteDuSoir(etat, date);
  // planB() compte un usage : jamais appelé ici, seulement au toucher du bouton (basculerPlanB).
  const choisie = ECRAN.plan_b_id && existe("recetteParId") ? recetteParId(ECRAN.plan_b_id) : null;
  const planBChoisi = !!choisie && !soir.est_plan_b && actif("plan_b");
  const recette = planBChoisi ? choisie : soir.recette;
  if (ECRAN.version == null) ECRAN.version = soir.version || "rapide";
  const version = actif("version_rapide") ? ECRAN.version : "normale";
  const duree = version === "rapide" ? recette.temps_rapide : recette.temps_normal;
  return { soir, recette, version, duree, planBChoisi, estPlanB: soir.est_plan_b || planBChoisi };
}

function lancer(recette) {
  compterSiPossible("lancements");
  ECRAN.recette_id = recette.id; ECRAN.etape = 0;
  aller("pas_a_pas");
}

function vueCeSoir() {
  const date = new Date();
  const jour = h("p", { class: "jour" }, JOURS_SEMAINE[date.getDay()]);
  if (!existe("recetteDuSoir")) {
    return h("section", { class: "ecran" }, jour,
      h("p", { class: "info" }, "La logique du soir n'est pas encore branchée : rien à proposer pour l'instant."));
  }
  const etat = lireEtatV1();
  const s = soirAffiche(etat, date), r = s.recette;
  const seance = existe("seanceDuJour") ? seanceDuJour(etat.cap, date) : (s.soir.est_plan_b ? null : true);
  const benef = (r.benefices || [])[0];

  const info = s.soir.est_plan_b
    ? h("p", { class: "info" }, "Pas de séance prévue ce soir : plan B du placard.")
    : s.planBChoisi ? h("p", { class: "info" }, "Plan B : 15 min, placard seulement.") : null;

  const principal = h("button", { class: "btn principal", onclick: () => lancer(r) },
    s.estPlanB ? "Lancer le plan B" : "Lancer la recette");

  const boutons = [];
  if (actif("plan_b") && existe("planB") && !s.soir.est_plan_b) {
    boutons.push(h("button", { class: "btn second", "aria-pressed": String(s.planBChoisi),
      onclick: () => basculerPlanB(date) }, "Plan B"));
  }
  if (actif("version_rapide")) {
    boutons.push(h("button", { class: "btn second", "aria-pressed": String(s.version === "rapide"),
      onclick: () => { ECRAN.version = existe("basculerVersion") ? basculerVersion(s.version) : (s.version === "rapide" ? "normale" : "rapide"); rendre(); } },
      s.version === "rapide" ? "Rapide ✓" : "Rapide"));
  }

  const pasCeSoirLien = actif("pas_ce_soir") && existe("pasCeSoir") && seance && !s.soir.est_plan_b
    ? h("button", { class: "lien-texte", onclick: () => decaler(date) }, "Pas ce soir")
    : null;

  return h("section", { class: "ecran" },
    jour,
    info,
    illustration(r),
    h("h2", { class: "nom-plat" }, drapeau(r.pays) + " " + r.nom),
    h("p", { class: "ligne" }, "⏱ " + s.duree + " min" + (s.version === "rapide" ? " (rapide)" : "") +
      (benef ? " · " + texteBenefice(benef) : "")),
    r.gestes && r.gestes[0] ? h("p", { class: "geste" }, h("strong", {}, "Le geste : "), r.gestes[0]) : null,
    h("button", { class: "lien-texte gauche", onclick: () => { ECRAN.recette_id = r.id; aller("fiche"); } }, "Nutrition"),
    principal,
    boutons.length ? h("div", { class: "duo" + (boutons.length === 1 ? " seul" : "") }, boutons) : null,
    pasCeSoirLien);
}

// « Plan B » : bascule ; planB() (qui compte plans_b) n'est appelé qu'à l'activation par Jeff.
function basculerPlanB(date) {
  if (ECRAN.plan_b_id) ECRAN.plan_b_id = null;
  else { const r = planB(lireEtatV1(), date); ECRAN.plan_b_id = r ? r.id : null; }
  rendre();
}

// « Pas ce soir » : la séance glisse au prochain jour libre (logique), en 1 appui.
function decaler(date) {
  const avant = lireEtatV1();
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  // Copie des valeurs avant l'appel : pasCeSoir modifie la séance en place dans l'état unique.
  const trouvee = ((avant.cap && avant.cap.seances) || []).find(x => x.jour === iso(date));
  const duJour = trouvee ? { jour: trouvee.jour, recette_id: trouvee.recette_id } : null;
  const apres = agir(e => pasCeSoir(e, date));
  const placee = duJour && ((apres.cap && apres.cap.seances) || []).find(x => x.recette_id === duJour.recette_id && x.jour !== duJour.jour);
  ECRAN.plan_b_id = null;
  if (placee) {
    const [a, m, j] = placee.jour.split("-").map(Number);
    toast("Séance décalée à " + JOURS_SEMAINE[new Date(a, m - 1, j).getDay()].toLowerCase());
  } else toast("Séance retirée de la semaine");
  rendre();
}

// ---------- Fiche « Nutrition » : valeurs pour 100 g, part de Jeff, quantités pour le foyer ----------
function vueFiche() {
  const r = existe("recetteParId") ? recetteParId(ECRAN.recette_id) : null;
  if (!r) { ECRAN.vue = "ce_soir"; return vueCeSoir(); }
  const etat = lireEtatV1(), profil = profilCourant(etat), n = r.nutrition_100g || {};
  const part = profil && existe("portionJeff") ? portionJeff(r, profil) : null;
  const avecFoyer = profil && existe("quantitesFoyer");
  const ingredients = avecFoyer ? quantitesFoyer(r, profil) : r.ingredients;
  const foyer = avecFoyer ? (profil.foyer || 5) : 5;
  const valeur = (lib, v, u) => h("li", { class: "valeur" }, h("span", {}, lib), h("span", { class: "num" }, nombre(v) + " " + u));
  return h("section", { class: "ecran" },
    enTete(drapeau(r.pays) + " " + r.nom, "ce_soir"),
    h("div", { class: "bloc" }, h("h3", {}, "Pour 100 g"),
      h("ul", { class: "clean" }, valeur("Protéines", n.proteines, "g"), valeur("Lipides", n.lipides, "g"),
        valeur("Glucides", n.glucides, "g"), valeur("Fibres", n.fibres, "g"), valeur("Énergie", n.kcal, "kcal"))),
    part ? h("p", { class: "ligne" }, "💪 Ta part : " + Math.round(part.proteines_g) + " g de protéines") : null,
    h("div", { class: "bloc" }, h("h3", {}, "Ingrédients pour " + foyer),
      h("ul", { class: "clean" }, ingredients.map(i => h("li", {}, nombre(i.quantite) + (i.unite === "pièce" ? " × " : " " + i.unite + " ") + i.nom)))),
    h("div", { class: "bloc" }, h("h3", {}, "Bénéfices"),
      h("ul", { class: "clean" }, (r.benefices || []).map(b => h("li", {}, texteBenefice(b))))),
    h("button", { class: "btn principal", onclick: () => lancer(r) }, "Lancer la recette"));
}
