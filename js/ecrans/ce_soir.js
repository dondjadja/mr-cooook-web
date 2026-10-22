"use strict";
// ---------- Écran « Ce soir » (disposition de DESIGN.md) ----------
// Photo plein écran derrière le contenu ; jour en haut ; en bas, sur un fondu : drapeau + nom, durée, 1 bénéfice,
// le geste, lien « Nutrition », bouton principal « Lancer la recette » (toujours), bascules « Rapide » et « Plan B »,
// lien « Pas ce soir » (seulement si le plat affiché est la séance de ce soir).

// Jour ISO local (AAAA-MM-JJ) d'une date, pour lire le cap sans dupliquer la logique.
const isoEcran = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const jourDeIso = iso => { const [a, m, j] = iso.split("-").map(Number); return JOURS_SEMAINE[new Date(a, m - 1, j).getDay()].toLowerCase(); };

// Séance de ce soir (cap validé) et prochaine séance prévue après aujourd'hui (lecture seule de l'état).
function seancesAffichables(etat, date) {
  const cap = etat && etat.cap;
  if (!cap || !cap.valide || !Array.isArray(cap.seances)) return { duSoir: null, prochaine: null };
  const j = isoEcran(date);
  const duSoir = existe("seanceDuJour") ? seanceDuJour(cap, date) : cap.seances.find(s => s.jour === j) || null;
  const prochaine = cap.seances.filter(s => s.jour > j).sort((a, b) => a.jour.localeCompare(b.jour))[0] || null;
  return { duSoir, prochaine };
}

// Ce que l'écran affiche : un seul plat. Ordre : bascule Plan B active → planB() ; séance de ce soir ;
// sinon prochaine séance prévue (jour sans séance, decisions.md) ; sinon ce que donne recetteDuSoir.
function soirAffiche(etat, date) {
  const soir = recetteDuSoir(etat, date);
  const { duSoir, prochaine } = seancesAffichables(etat, date);
  const parId = id => (id && existe("recetteParId") ? recetteParId(id) : null);
  const planBActif = !!ECRAN.plan_b_id && actif("plan_b") && actif("plan_b_bascule");
  let recette = null, quand = null, estSeanceDuSoir = false;
  if (planBActif) { recette = parId(ECRAN.plan_b_id); quand = "Plan B du placard"; }
  if (!recette && duSoir && (recette = parId(duSoir.recette_id))) estSeanceDuSoir = true;
  if (!recette && prochaine && (recette = parId(prochaine.recette_id))) quand = jourDeIso(prochaine.jour) + " : prochaine séance";
  if (!recette) { recette = soir.recette; if (soir.est_plan_b) quand = "Plan B du placard"; }
  if (ECRAN.version == null) ECRAN.version = soir.version || "rapide";
  const version = actif("version_rapide") ? ECRAN.version : "normale";
  const duree = version === "rapide" ? recette.temps_rapide : recette.temps_normal;
  return { recette, version, duree, quand, planBActif: planBActif && !!parId(ECRAN.plan_b_id), estSeanceDuSoir };
}

// « Lancer la recette » : seul endroit qui compte lancements (et plans_b si la bascule Plan B est active),
// puis ouvre le mode cuisine (afficherCuisine, lot correction_cuisine) ; à défaut, l'ancien pas à pas.
function lancer(recette, version) {
  compterSiPossible("lancements");
  if (ECRAN.plan_b_id && ECRAN.plan_b_id === recette.id) compterSiPossible("plans_b");
  ECRAN.recette_id = recette.id; ECRAN.etape = 0;
  if (typeof afficherCuisine === "function") {
    try { afficherCuisine(recette, version || ECRAN.version || "rapide"); return; }
    catch (err) { console.warn("afficherCuisine : " + err.message); }
  }
  aller("pas_a_pas");
}

function vueCeSoir() {
  const date = new Date();
  const jour = h("p", { class: "jour" }, JOURS_SEMAINE[date.getDay()]);
  if (!existe("recetteDuSoir")) {
    return h("section", { class: "ecran" }, jour,
      h("p", { class: "info" }, "La logique du soir n'est pas encore branchée : rien à proposer pour l'instant."));
  }
  const s = soirAffiche(lireEtatV1(), date), r = s.recette;
  const benef = (r.benefices || [])[0];

  const principal = h("button", { class: "btn principal", onclick: () => lancer(r, s.version) }, "Lancer la recette");

  // Deux bascules de même forme : « Rapide » (actif par défaut) et « Plan B » (inactif par défaut).
  const bascule = (libelle, actifNow, onclick) => h("button", { class: "btn second bascule", "aria-pressed": String(actifNow), onclick },
    libelle + (actifNow ? " ✓" : ""));
  const bascules = [];
  if (actif("version_rapide")) {
    bascules.push(bascule("Rapide", s.version === "rapide", () => {
      ECRAN.version = existe("basculerVersion") ? basculerVersion(s.version) : (s.version === "rapide" ? "normale" : "rapide"); rendre();
    }));
  }
  if (actif("plan_b") && actif("plan_b_bascule") && existe("planB")) {
    bascules.push(bascule("Plan B", s.planBActif, () => basculerPlanB(date)));
  }

  const pasCeSoirLien = actif("pas_ce_soir") && existe("pasCeSoir") && s.estSeanceDuSoir
    ? h("button", { class: "lien-texte", onclick: () => decaler(date) }, "Pas ce soir")
    : null;

  return h("section", { class: "ecran ce-soir" },
    fondPhoto(r),
    jour,
    h("div", { class: "bas" },
      s.quand ? h("p", { class: "quand" }, s.quand) : null,
      h("h2", { class: "nom-plat" }, drapeau(r.pays) + " " + r.nom),
      h("p", { class: "ligne" }, "⏱ " + s.duree + " min" + (s.version === "rapide" ? " (rapide)" : "")),
      benef ? h("p", { class: "ligne" }, texteBenefice(benef)) : null,
      r.gestes && r.gestes[0] ? h("p", { class: "geste" }, h("strong", {}, "Le geste : "), r.gestes[0]) : null,
      h("button", { class: "lien-texte gauche", onclick: () => { ECRAN.recette_id = r.id; aller("fiche"); } }, "Nutrition"),
      principal,
      bascules.length ? h("div", { class: "bascules" + (bascules.length === 1 ? " seule" : "") }, bascules) : null,
      pasCeSoirLien));
}

// Photo plein écran derrière le contenu ; si l'illustration manque, le fond reste uni.
function fondPhoto(r) {
  const img = h("img", { src: "illustrations/" + r.id + ".svg", alt: "", decoding: "async" });
  img.addEventListener("error", () => { img.hidden = true; });
  return h("div", { class: "fond-photo", role: "img", "aria-label": "Illustration : " + r.nom }, img);
}

// Bascule « Plan B » : activée → le plat affiché devient planB(etat, date) ; désactivée → retour à la séance.
function basculerPlanB(date) {
  if (ECRAN.plan_b_id) ECRAN.plan_b_id = null;
  else { const r = planB(lireEtatV1(), date); ECRAN.plan_b_id = r ? r.id : null; }
  rendre();
}

// « Pas ce soir » : la séance glisse au prochain jour libre (logique), en 1 appui ; message « Séance décalée à … ».
function decaler(date) {
  const avant = lireEtatV1();
  // Copie des valeurs avant l'appel : pasCeSoir modifie la séance en place dans l'état unique.
  const trouvee = ((avant.cap && avant.cap.seances) || []).find(x => x.jour === isoEcran(date));
  const duJour = trouvee ? { jour: trouvee.jour, recette_id: trouvee.recette_id } : null;
  const apres = agir(e => pasCeSoir(e, date));
  const placee = duJour && ((apres.cap && apres.cap.seances) || []).find(x => x.recette_id === duJour.recette_id && x.jour !== duJour.jour);
  ECRAN.plan_b_id = null;
  toast(placee ? "Séance décalée à " + jourDeIso(placee.jour) : "Séance retirée de la semaine");
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
