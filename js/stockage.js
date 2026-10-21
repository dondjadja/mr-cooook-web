"use strict";
// ---------- Stockage local (navigateur, V0) : recommence proprement si le stockage est indisponible ----------
const CLE = "mrcooook_v0";
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
function etatInitial() {
  return {
    version: 1, mois: MOIS[new Date().getMonth()],
    poids: { energie: 4, ig: 4, stress: 3, inflammation: 2, sommeil: 3, force: 2, budget: 3, monde: 2 },
    maitrise: {}, envie: "surprise", seances: 3, tempsMax: 50, frigo: [], semaine: 1, plan: null, faits: {}, courses: {},
    historique: [], bilans: {}, usage: { ouvertures: 0, seances: 0, bilans: 0 }
  };
}
function charger() {
  try {
    const e = JSON.parse(localStorage.getItem(CLE));
    if (e && e.version === 1) return e;
  } catch (err) { /* stockage illisible : on repart d'un état neuf */ }
  return etatInitial();
}
let etat = charger();
function sauver() { try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { /* stockage indisponible : l'état reste en mémoire */ } }
// Sauvegarde et restauration (fichier JSON choisi par l’utilisateur ; contenu vérifié avant usage, affiché uniquement par textContent)
function exporterEtat() { return JSON.stringify(etat, null, 2); }
function importerEtat(texte) {
  const e = JSON.parse(texte);
  if (!e || e.version !== 1 || typeof e.poids !== "object" || typeof e.maitrise !== "object" || !Array.isArray(e.historique)) throw new Error("Fichier non reconnu");
  etat = Object.assign(etatInitial(), e);
  sauver();
}
const libelleEnvie = () => etat.envie === "surprise" ? "Surprise" : CUISINES[etat.envie];
function utiliseFrigo(r) {
  const texte = (r.ing.join(" ") + " " + r.legume).toLowerCase();
  return etat.frigo.filter(k => texte.includes(k)).length;
}
