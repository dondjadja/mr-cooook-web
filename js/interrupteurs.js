// Interrupteurs des fonctionnalités : mettre à false pour en couper une sans toucher au reste.
// Chargé en premier par index.html et par les tests.
"use strict";
var INTERRUPTEURS = { plan_b: true, pas_ce_soir: true, profil: true, version_rapide: true, plan_b_bascule: true, mode_cuisine: true };
// Enregistrement du service worker (appli installable et hors ligne). Ignoré hors navigateur.
if (typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
