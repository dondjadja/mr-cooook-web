"use strict";
// Mesure d'usage locale : jamais envoyée hors de la machine
// compter(nom) : +1 sur un compteur de Usage (ouvertures, lancements, seances_faites, plans_b, caps_valides), puis enregistrement.
// Le second paramètre (facultatif) désigne l'état à compter ; par défaut l'état global.
function compter(nom, e) {
  const cible = e || etat;
  if (!cible.usage) cible.usage = usageInitial();
  cible.usage[nom] = (cible.usage[nom] || 0) + 1;
  sauver(cible);
  return cible.usage[nom];
}
// V0 : compteur des anciens écrans
function noterUsage(cle) { etat.usage[cle] = (etat.usage[cle] || 0) + 1; sauver(); }
