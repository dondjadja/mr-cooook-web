"use strict";
// Mesure d'usage locale : jamais envoyée hors de la machine
function noterUsage(cle) { etat.usage[cle] = (etat.usage[cle] || 0) + 1; sauver(); }
