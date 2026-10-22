"use strict";
// Logique pure du plan (testée par tests/test_logique.js) : aucun accès à l'affichage
// ---------- Choix du plan ----------
function score(r) {
  let s = 2 * r.obj.legumes;                                          // les légumes comptent toujours
  for (const k in etat.poids) s += etat.poids[k] * r.obj[k];
  const m = etat.maitrise[r.id];
  if (m && m.fois > 0 && !(m.fois >= 3 && m.sansRecette)) s += 6; // en cours de maîtrise : priorité
  if (m && m.fois >= 3 && m.sansRecette) s -= 4;                    // déjà maîtrisée : laisse la place
  if (r.variantes.some(v => v.cuisine === etat.envie)) s += 2;
  s += 3 * utiliseFrigo(r);                                          // finir ce qui reste au frigo
  return s;
}
function classement(exclus) {
  let pool = RECETTES.filter(r => !exclus.includes(r.id) && r.temps <= etat.tempsMax);
  if (pool.length === 0) pool = RECETTES.filter(r => !exclus.includes(r.id)); // temps trop court : on garde tout plutôt que rien
  return pool.map(r => ({ r, s: score(r) })).sort((a, b) => b.s - a.s || a.r.id.localeCompare(b.r.id));
}
function genererPlan() {
  const n = etat.seances, rang = classement([]), choisis = [];
  // recettes en cours de maîtrise d'abord (besoin_maitrise), en gardant au moins une place pour une nouvelle
  const enCours = r => { const m = etat.maitrise[r.id]; return m && m.fois > 0 && !(m.fois >= 3 && m.sansRecette); };
  for (const { r } of rang) if (enCours(r) && choisis.length < Math.max(1, n - 1)) choisis.push(r);
  for (const { r } of rang) {
    if (choisis.length === n) break;
    if (choisis.some(c => c.technique === r.technique)) continue; // varier les techniques apprises
    choisis.push(r);
  }
  for (const { r } of rang) { if (choisis.length === n) break; if (!choisis.includes(r)) choisis.push(r); }
  // pas assez de recettes dans le temps demandé : on complète avec les plus rapides, et on le dit
  etat.complete = choisis.length < n;
  const rapides = RECETTES.filter(r => !choisis.includes(r)).sort((a, b) => a.temps - b.temps || score(b) - score(a));
  while (choisis.length < n) choisis.push(rapides.shift());
  if (!choisis.some(r => r.obj.legumes >= 3)) {
    const leg = rang.find(x => x.r.obj.legumes >= 3 && !choisis.includes(x.r));
    if (leg) choisis[choisis.length - 1] = leg.r;
  }
  etat.plan = choisis.map(r => r.id);
  etat.faits = {}; etat.courses = {};
  sauver();
}
function varianteChoisie(r, rang) {
  const avecEnvie = r.variantes.filter(v => v.cuisine === etat.envie);
  const autres = r.variantes.filter(v => v.cuisine !== etat.envie);
  return [...avecEnvie, ...autres][rang % 3];
}
// 5 jours × midi/soir : 2 à 4 séances de cuisine le soir ; entre deux séances, restes et variantes en alternance
function creneaux() {
  const jours = JOURS_SEANCES[etat.plan.length], recs = etat.plan.map(id => PAR_ID[id]), slots = [];
  let courante = null, n = 0;
  for (let k = 0; k < 10; k++) {
    const j = Math.floor(k / 2), i = k % 2 === 1 ? jours.indexOf(j) : -1;
    if (i >= 0) { courante = recs[i]; n = 0; slots.push({ type: "cuisine", r: courante, i }); continue; }
    if (!courante) { slots.push({ type: "libre" }); continue; }
    slots.push(n % 2 === 0 ? { type: "restes", r: courante } : { type: "variante", r: courante, v: varianteChoisie(courante, Math.floor(n / 2)) });
    n++;
  }
  return JOURS.map((_, j) => ({ midi: slots[2 * j], soir: slots[2 * j + 1] }));
}


// ---------- Couverture et prix ----------
const PRIX_LIVRAISON = 12; // € par repas livré et par personne (estimation)
function couverture() {
  const n = {};
  creneaux().flatMap(c => [c.midi, c.soir]).forEach(c => { if (c.r) n[c.r.id] = (n[c.r.id] || 0) + 1; });
  return n;
}
function chiffresSemaine() {
  const grille = creneaux(), fois = couverture(), recettes = etat.plan.map(id => PAR_ID[id]);
  const total = recettes.reduce((s, r) => s + r.prix * fois[r.id], 0);
  const repas = grille.flatMap(c => [c.midi, c.soir]).filter(c => c.type !== "libre").length * 5;
  return { total, repas, parRepas: total / repas, livraison: repas * PRIX_LIVRAISON };
}

// ---------- Calendrier (.ics) ----------
function prochainLundi(depuis) {
  const d = depuis ? new Date(depuis) : new Date(); d.setHours(0, 0, 0, 0);
  const decalage = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + decalage); return d;
}
function fmtIcs(d, hh) { const p = n => String(n).padStart(2, "0"); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "T" + p(hh) + "0000"; }
function construireIcs(lundi) {
  const evts = etat.plan.map((id, i) => { const jour = new Date(lundi); jour.setDate(jour.getDate() + JOURS_SEANCES[etat.plan.length][i]); return { jour, r: PAR_ID[id] }; });
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mr Cooook//V0//FR"];
  evts.forEach(({ jour, r }, i) => lignes.push("BEGIN:VEVENT", "UID:mrcooook-s" + etat.semaine + "-" + i + "@local", "DTSTAMP:" + fmtIcs(new Date(), 0),
    "DTSTART:" + fmtIcs(jour, 18), "DTEND:" + fmtIcs(jour, 19), "SUMMARY:Cuisiner : " + r.nom, "DESCRIPTION:" + r.ing.join(", ").replace(/,/g, "\\,"),
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:À la cuisine", "END:VALARM", "END:VEVENT"));
  lignes.push("END:VCALENDAR");
  return { evts, texte: lignes.join("\r\n") };
}

// =====================================================================
// ---------- V1 : logique du soir (interface convenue, CONTRAT.md v1) ----------
// Seul module qui modifie le cap et la progression. `date` est un objet Date ; les jours sont des chaînes AAAA-MM-JJ.
// Les fonctions qui modifient l'état le modifient en place, l'enregistrent et le renvoient.
function jourIso(d) { const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
function ajouterJours(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0); }
function lundiDe(date) { return ajouterJours(date, -((date.getDay() + 6) % 7)); }
// Numéro de jour stable (indépendant de l'heure et du fuseau) pour les rotations
function numeroJour(date) { return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5); }

function seanceDuJour(cap, date) {
  if (!cap || !Array.isArray(cap.seances)) return null;
  const j = jourIso(date);
  return cap.seances.find(s => s.jour === j) || null;
}
function recettesPlacard() { return RECETTES_V1.filter(r => r.placard === true && r.temps_rapide <= 15); }
// Choix du plan B, sans effet : rotation déterministe par la date sur les recettes placard
function choisirPlanB(date) {
  const liste = recettesPlacard();
  if (!liste.length) return null;
  return liste[((numeroJour(date) % liste.length) + liste.length) % liste.length];
}
// Plan B : sans aucun effet (ne compte rien, n'écrit rien) ; plans_b est compté par l'écran au lancement
function planB(e, date) {
  if (!INTERRUPTEURS.plan_b) return null;
  return choisirPlanB(date);
}
// Durée d'une étape écrite à la fin du texte : « … — 10 min » → 10 ; sinon null
function dureeEtape(texte) {
  const m = /— (\d+) min$/.exec(String(texte == null ? "" : texte).trim());
  return m ? Number(m[1]) : null;
}
function versionParDefaut() { return INTERRUPTEURS.version_rapide ? "rapide" : "normale"; }
function basculerVersion(version) { return version === "rapide" ? "normale" : "rapide"; }
function dureeVersion(recette, version) { return version === "rapide" ? recette.temps_rapide : recette.temps_normal; }
// Un seul plat pour ce soir : la séance du cap validé, sinon le plan B (version rapide par défaut)
function recetteDuSoir(e, date) {
  const version = versionParDefaut();
  const cap = e && e.cap;
  const seance = cap && cap.valide ? seanceDuJour(cap, date) : null;
  let recette = seance ? recetteParId(seance.recette_id) : null, est_plan_b = false;
  if (!recette && INTERRUPTEURS.plan_b) { recette = choisirPlanB(date); est_plan_b = !!recette; }
  if (!recette) { // plan B coupé : prochaine séance du cap, sinon première recette de séance
    const j = jourIso(date);
    const suivante = cap && Array.isArray(cap.seances) ? cap.seances.filter(s => s.jour >= j).sort((a, b) => a.jour.localeCompare(b.jour))[0] : null;
    recette = (suivante && recetteParId(suivante.recette_id)) || RECETTES_V1.find(r => !r.placard) || RECETTES_V1[0];
  }
  return { recette, version, duree_min: dureeVersion(recette, version), est_plan_b };
}
// « Pas ce soir » : la séance du jour glisse au prochain jour libre de la semaine (lundi → dimanche), sinon elle est retirée
function pasCeSoir(e, date) {
  if (!INTERRUPTEURS.pas_ce_soir || !e || !e.cap || !Array.isArray(e.cap.seances)) return e;
  const seance = seanceDuJour(e.cap, date);
  if (!seance) return e;
  const dimanche = jourIso(ajouterJours(lundiDe(date), 6)), occupes = new Set(e.cap.seances.map(s => s.jour));
  let libre = null;
  for (let d = ajouterJours(date, 1); jourIso(d) <= dimanche; d = ajouterJours(d, 1)) {
    if (!occupes.has(jourIso(d))) { libre = jourIso(d); break; }
  }
  if (libre) seance.jour = libre;
  else e.cap.seances.splice(e.cap.seances.indexOf(seance), 1);
  e.cap.seances.sort((a, b) => a.jour.localeCompare(b.jour));
  sauver(e);
  return e;
}
// Séance faite : progression de la recette et compteur d'usage
function marquerFaite(e, recette_id, sans_recette) {
  if (!e.progression) e.progression = {};
  const p = e.progression[recette_id] || { faits: 0, dernier_sans_recette: false };
  e.progression[recette_id] = { faits: p.faits + 1, dernier_sans_recette: !!sans_recette };
  compter("seances_faites", e); // enregistre aussi l'état
  return e;
}
// Cap d'amorçage (jusqu'à jalon_cap) : lundi, mercredi, vendredi, 3 premières recettes de séance
function capDAmorcage(date) {
  const lundi = lundiDe(date), ids = RECETTES_V1.filter(r => !r.placard).slice(0, 3).map(r => r.id);
  return { semaine: jourIso(lundi), theme: "découverte", valide: true,
    seances: ids.map((id, i) => ({ jour: jourIso(ajouterJours(lundi, 2 * i)), recette_id: id, repas_couverts: 2 })) };
}
// Au démarrage : pose le cap d'amorçage si aucun cap ou s'il date d'une semaine passée
function assurerCap(e, date) {
  const lundi = jourIso(lundiDe(date));
  if (!e.cap || !e.cap.semaine || e.cap.semaine < lundi) { e.cap = capDAmorcage(date); sauver(e); }
  return e;
}
