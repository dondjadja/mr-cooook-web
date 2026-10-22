"use strict";
// ---------- Stockage local (navigateur) : clé mrcooook_v1 (CONTRAT.md v1) ----------
// L'état V0 (clé mrcooook_v0) n'est ni lu, ni migré, ni supprimé.
// Seule la partie V1 de l'état (profil, cap, progression, usage) est enregistrée sur l'appareil ;
// les champs V0 encore utilisés par les anciens écrans restent en mémoire seulement.
const CLE = "mrcooook_v1";
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const CHAMPS_USAGE = ["ouvertures", "lancements", "seances_faites", "plans_b", "caps_valides"];
function usageInitial() { const u = {}; for (const k of CHAMPS_USAGE) u[k] = 0; return u; }
// Partie V1 de l'état (forme convenue) : { profil, cap, progression, usage }
function etatV1Initial() { return { profil: null, cap: null, progression: {}, usage: usageInitial() }; }
function etatInitial() {
  const e = {
    version: 1, mois: MOIS[new Date().getMonth()],
    poids: { energie: 4, ig: 4, stress: 3, inflammation: 2, sommeil: 3, force: 2, budget: 3, monde: 2 },
    maitrise: {}, envie: "surprise", seances: 3, tempsMax: 50, frigo: [], semaine: 1, plan: null, faits: {}, courses: {},
    historique: [], bilans: {}
  };
  Object.assign(e, etatV1Initial());
  Object.assign(e.usage, { seances: 0, bilans: 0 }); // compteurs V0, non enregistrés
  return e;
}
// Extrait la partie V1 d'un état (seule partie écrite sur l'appareil)
function partieV1(e) {
  const u = {};
  for (const k of CHAMPS_USAGE) u[k] = (e.usage && Number(e.usage[k])) || 0;
  return { profil: e.profil || null, cap: e.cap || null, progression: e.progression || {}, usage: u };
}
function lireStockage() {
  try {
    const s = JSON.parse(localStorage.getItem(CLE));
    if (s && typeof s === "object" && typeof s.progression === "object" && s.progression && typeof s.usage === "object" && s.usage) return partieV1(s);
  } catch (err) { /* stockage illisible : on repart d'un état neuf */ }
  return null;
}
function charger() {
  const e = etatInitial(), s = lireStockage();
  if (s) { e.profil = s.profil; e.cap = s.cap; e.progression = s.progression; Object.assign(e.usage, s.usage); }
  return e;
}
let etat = charger();
// Enregistre la partie V1 de l'état donné (par défaut l'état global)
function sauver(e) {
  try { localStorage.setItem(CLE, JSON.stringify(partieV1(e || etat))); } catch (err) { /* stockage indisponible : l'état reste en mémoire */ }
}
// Sauvegarde et restauration (fichier JSON choisi par l’utilisateur ; contenu vérifié avant usage, affiché uniquement par textContent)
function exporterEtat() { return JSON.stringify(etat, null, 2); }
function importerEtat(texte) {
  const e = JSON.parse(texte);
  if (!e || e.version !== 1 || typeof e.poids !== "object" || typeof e.maitrise !== "object" || !Array.isArray(e.historique)) throw new Error("Fichier non reconnu");
  const base = etatInitial();
  etat = Object.assign(base, e, { usage: Object.assign(base.usage, e.usage || {}) });
  sauver();
}
const libelleEnvie = () => etat.envie === "surprise" ? "Surprise" : CUISINES[etat.envie];
function utiliseFrigo(r) {
  const texte = (r.ing.join(" ") + " " + r.legume).toLowerCase();
  return etat.frigo.filter(k => texte.includes(k)).length;
}
