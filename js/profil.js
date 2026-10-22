"use strict";
// ---------- Profil et portions (CONTRAT.md v1) : seul module qui modifie le profil ----------
// Le profil (données de santé) reste dans l'état local de l'appareil, jamais dans le dépôt.
// Valeurs par défaut génériques et fictives : Jeff saisit les siennes dans l'écran Profil.
function profilParDefaut() {
  return { poids_kg: 75, seances_sport_semaine: 3, petit_dejeuner: true, proteines_cible_g: 90, foyer: 5 };
}
function lireProfil() {
  return Object.assign(profilParDefaut(), etat.profil || {});
}
// Nettoie et enregistre le profil (nombres positifs, booléen) ; renvoie le profil enregistré
function enregistrerProfil(p) {
  const d = profilParDefaut(), src = p || {};
  const nombre = (v, def, min, max) => { const n = Number(v); return isFinite(n) && n >= min && n <= max ? n : def; };
  const propre = {
    poids_kg: nombre(src.poids_kg, d.poids_kg, 20, 300),
    seances_sport_semaine: Math.round(nombre(src.seances_sport_semaine, d.seances_sport_semaine, 0, 21)),
    petit_dejeuner: typeof src.petit_dejeuner === "boolean" ? src.petit_dejeuner : d.petit_dejeuner,
    proteines_cible_g: nombre(src.proteines_cible_g, d.proteines_cible_g, 20, 250),
    foyer: Math.round(nombre(src.foyer, d.foyer, 1, 12))
  };
  etat.profil = propre;
  sauver();
  return propre;
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

// Part de Jeff : fraction de la recette (pour 5) qui apporte la cible de protéines
function portionJeff(recette, profil) {
  const p = Object.assign(profilParDefaut(), profil || {});
  const masse = masseRecette(recette), prot100 = recette.nutrition_100g.proteines;
  let coefficient = 1 / PARTS_RECETTE;
  if (INTERRUPTEURS.profil && masse > 0 && prot100 > 0) coefficient = (p.proteines_cible_g * 100 / prot100) / masse;
  return { coefficient, proteines_g: Math.round(coefficient * masse * prot100 / 100) };
}
// Quantités pour tout le foyer : part de Jeff + (foyer − 1) parts standard (recette ÷ 5), arrondies vers le haut
function quantitesFoyer(recette, profil) {
  const p = Object.assign(profilParDefaut(), profil || {});
  const autres = Math.max(0, p.foyer - 1) / PARTS_RECETTE;
  const facteur = INTERRUPTEURS.profil ? portionJeff(recette, p).coefficient + autres : p.foyer / PARTS_RECETTE;
  return recette.ingredients.map(i => {
    const q = i.quantite * facteur;
    const quantite = i.unite === "pièce" ? Math.ceil(q - 1e-9) : Math.ceil(q / 5 - 1e-9) * 5;
    return { nom: i.nom, quantite, unite: i.unite, rayon: i.rayon };
  });
}
