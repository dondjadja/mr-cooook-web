"use strict";
// ---------- Profil et portions (CONTRAT.md v2) : seul module qui modifie le profil ----------
// Le profil (données de santé) reste dans l'état local de l'appareil, jamais dans le dépôt.
// Valeurs par défaut génériques et fictives : Jeff saisit les siennes dans l'écran Profil.
const FAIMS = ["petite", "normale", "grande"];
const OBJECTIFS_MOIS = ["perdre", "maintenir", "muscle"];
function profilParDefaut() {
  return { poids_kg: 75, seances_sport_semaine: 3, petit_dejeuner: true, faim: "normale", foyer: 5, objectif_mois: "maintenir" };
}
// Nettoie un profil (v2 ou ancien format) : 6 champs saisis, valeurs par défaut sinon ; tout autre champ est ignoré
function profilPropre(src) {
  const d = profilParDefaut(), s = src || {};
  const nombre = (v, def, min, max) => { const n = Number(v); return v !== null && v !== "" && isFinite(n) && n >= min && n <= max ? n : def; };
  return {
    poids_kg: nombre(s.poids_kg, d.poids_kg, 20, 300),
    seances_sport_semaine: Math.round(nombre(s.seances_sport_semaine, d.seances_sport_semaine, 0, 21)),
    petit_dejeuner: typeof s.petit_dejeuner === "boolean" ? s.petit_dejeuner : d.petit_dejeuner,
    faim: FAIMS.includes(s.faim) ? s.faim : d.faim,
    foyer: Math.round(nombre(s.foyer, d.foyer, 1, 12)),
    objectif_mois: OBJECTIFS_MOIS.includes(s.objectif_mois) ? s.objectif_mois : d.objectif_mois
  };
}
// Lecture tolérante : un profil stocké à l'ancien format est complété ; proteines_cible_g est ignoré
function lireProfil() { return profilPropre(etat.profil); }
// Nettoie et enregistre le profil ; renvoie le profil enregistré
function enregistrerProfil(p) {
  const propre = profilPropre(p);
  etat.profil = propre;
  sauver();
  return propre;
}

// Besoins calculés (jamais saisis, jamais stockés), règle validée par Jeff (CONTRAT.md v2)
const COEF_OBJECTIF = { perdre: 0.8, maintenir: 1, muscle: 1.15 };
const COEF_FAIM = { petite: 0.85, normale: 1, grande: 1.15 };
function besoinsCalcules(profil) {
  const p = profilPropre(profil);
  let gParKg = 2.0;
  if (p.objectif_mois === "maintenir") gParKg = p.seances_sport_semaine === 0 ? 1.2 : p.seances_sport_semaine <= 3 ? 1.6 : 2.0;
  const proteines_jour_g = Math.round(p.poids_kg * gParKg);
  const repas = p.petit_dejeuner ? 3 : 2;
  return { proteines_jour_g, proteines_repas_g: Math.round(proteines_jour_g / repas),
    coef_feculents: COEF_OBJECTIF[p.objectif_mois] * COEF_FAIM[p.faim] };
}

// Poids d'une pièce (décision réversible, hors contrat) ; inconnu → 100 g
const POIDS_PIECE_G = [["citron vert", 60], ["citrons verts", 60], ["œuf", 60], ["oeuf", 60], ["citron", 100], ["tortilla", 40]];
function poidsPiece(nom) {
  const n = String(nom).toLowerCase();
  for (const [cle, g] of POIDS_PIECE_G) if (n.includes(cle)) return g;
  return 100;
}
// Masse crue d'un ingrédient en grammes (ml compté comme g)
function masseIngredient(i) { return i.unite === "pièce" ? i.quantite * poidsPiece(i.nom) : i.quantite; }
function masseRecette(recette) { return recette.ingredients.reduce((s, i) => s + masseIngredient(i), 0); }
const PARTS_RECETTE = 5; // les recettes sont écrites pour 5

// Féculents (liste fixe) : les lentilles corail comptent comme protéines, pas comme féculents
const FECULENTS = ["riz", "pâtes", "nouilles", "soba", "semoule", "pommes de terre", "tortilla", "pain"];
function estFeculent(nom) {
  const n = String(nom).toLowerCase();
  return !n.includes("lentilles") && FECULENTS.some(f => n.includes(f));
}
function estLegume(i) { return i.rayon === "fruits et légumes"; }

// Part de Jeff : fraction de la recette (pour 5) qui apporte ses protéines par repas
function portionJeff(recette, profil) {
  const cible = besoinsCalcules(profil).proteines_repas_g;
  const masse = masseRecette(recette), prot100 = recette.nutrition_100g.proteines;
  let coefficient = 1 / PARTS_RECETTE;
  if (INTERRUPTEURS.profil && masse > 0 && prot100 > 0) coefficient = (cible * 100 / prot100) / masse;
  return { coefficient, proteines_g: Math.round(coefficient * masse * prot100 / 100) };
}
// Coefficient propre à un ingrédient de la part de Jeff : féculents (objectif × faim), légumes (faim), reste inchangé
function coefIngredientJeff(i, profil) {
  if (!INTERRUPTEURS.profil) return 1;
  const p = profilPropre(profil);
  if (estFeculent(i.nom)) return besoinsCalcules(p).coef_feculents;
  if (estLegume(i)) return COEF_FAIM[p.faim];
  return 1;
}
// Arrondi vers le haut : pièce entière, sinon par 5 g / ml
function arrondiHaut(q, unite) { return unite === "pièce" ? Math.ceil(q - 1e-9) : Math.ceil(q / 5 - 1e-9) * 5; }
// Quantités pour tout le foyer : part de Jeff + (foyer − 1) parts standard (recette ÷ 5), arrondies vers le haut ;
// jamais moins que la recette ramenée au foyer (hypothese_minimum_foyer)
function quantitesFoyer(recette, profil) {
  const p = profilPropre(profil);
  const autres = Math.max(0, p.foyer - 1) / PARTS_RECETTE;
  const coefJeff = INTERRUPTEURS.profil ? portionJeff(recette, p).coefficient : 1 / PARTS_RECETTE;
  return recette.ingredients.map(i => {
    const jeff = i.quantite * coefJeff * coefIngredientJeff(i, p);
    const total = Math.max(jeff + i.quantite * autres, i.quantite * p.foyer / PARTS_RECETTE);
    const part = i.unite === "pièce" ? Math.max(1, Math.round(jeff)) : Math.max(5, Math.round(jeff / 5) * 5);
    return { nom: i.nom, quantite: arrondiHaut(total, i.unite), unite: i.unite, rayon: i.rayon, part_jeff: part };
  });
}
