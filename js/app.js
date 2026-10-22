"use strict";
// ---------- Écrans V1 : outils, accès à l'état, navigation, barre du bas, démarrage ----------
// Chargé en dernier. Les écrans (web/js/ecrans/*.js) n'appellent que l'interface convenue (decisions.md).
// Aucun HTML brut : tout passe par createElement et textContent.

function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const e of enfants.flat(Infinity)) if (e != null && e !== false) el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return el;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.minuterie); toast.minuterie = setTimeout(() => { t.hidden = true; }, 3200);
}
// Une fonction de l'interface est-elle chargée ? (la logique est livrée par un autre lot)
const existe = nom => typeof globalThis[nom] === "function";
const actif = cle => typeof INTERRUPTEURS === "undefined" || INTERRUPTEURS[cle] !== false;

// ---------- Accès à l'état : un seul état en mémoire, le global `etat` de stockage.js ----------
// Les écrans ne lisent ni n'écrivent localStorage : la logique (assurerCap, pasCeSoir, marquerFaite, planB, compter)
// modifie ce même objet et l'enregistre elle-même.
function lireEtatV1() { return etat; }
function agir(f) { f(etat); return etat; }
function compterSiPossible(nom) { if (existe("compter")) { try { compter(nom); } catch (err) { /* mesure locale non bloquante */ } } }

// ---------- État d'écran (non stocké) : la version revient à « rapide » à chaque ouverture ----------
// plan_b_id : recette donnée par planB() quand Jeff touche « Plan B » (planB n'est appelé que sur ce geste).
const ECRAN = { vue: "ce_soir", version: null, plan_b_id: null, recette_id: null, etape: 0 };

// ---------- Outils de présentation partagés ----------
const JOURS_SEMAINE = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
function drapeau(pays) {
  if (typeof pays !== "string" || !/^[A-Z]{2}$/.test(pays)) return "🌍 Monde";
  return String.fromCodePoint(...[...pays].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}
// Cadre de taille fixe : si l'illustration manque, le cadre reste vide et la page ne saute pas.
function illustration(r) {
  const img = h("img", { src: "illustrations/" + r.id + ".svg", alt: "", width: "400", height: "300", decoding: "async" });
  img.addEventListener("error", () => { img.hidden = true; });
  return h("div", { class: "photo", role: "img", "aria-label": "Illustration : " + r.nom }, img);
}
function profilCourant(etat) {
  if (etat && etat.profil) return etat.profil;
  if (existe("lireProfil")) { try { const p = lireProfil(); if (p) return p; } catch (err) { /* profil illisible */ } }
  return existe("profilParDefaut") ? profilParDefaut() : null;
}
// Bénéfice : écart signé (« Prix −55 % », « Protéines +25 % »)
const texteBenefice = b => b.icone + " " + b.libelle + " " + (b.ecart_pct > 0 ? "+" : b.ecart_pct < 0 ? "−" : "") + Math.abs(b.ecart_pct) + " %";
const nombre = n =>String(Math.round(n * 10) / 10).replace(".", ",");
function enTete(titre, retourVers) {
  return h("div", { class: "entete-ecran" },
    retourVers ? h("button", { class: "btn ghost small", onclick: () => aller(retourVers) }, "← Ce soir") : null,
    h("h2", {}, titre));
}

// ---------- Navigation et barre du bas ----------
const BARRE = [["ce_soir", "🍳", "Ce soir"], ["semaine", "📅", "Semaine"], ["courses", "🛒", "Courses"], ["progres", "📈", "Progrès"]];
const ONGLET_DE = { fiche: "ce_soir", pas_a_pas: "ce_soir", profil: "progres" };
function aller(vue) { ECRAN.vue = vue; rendre(); window.scrollTo(0, 0); }
function rendre() {
  const onglet = ONGLET_DE[ECRAN.vue] || ECRAN.vue;
  document.getElementById("barre").replaceChildren(...BARRE.map(([cle, icone, nom]) =>
    h("button", { class: "onglet", "aria-current": cle === onglet ? "page" : null, onclick: () => aller(cle) },
      h("span", { class: "onglet-icone", "aria-hidden": "true" }, icone), h("span", {}, nom))));
  const fabriques = {
    ce_soir: () => vueCeSoir(), fiche: () => vueFiche(), pas_a_pas: () => vuePasAPas(),
    semaine: () => vueBientot("Semaine"), courses: () => vueBientot("Courses"), progres: () => vueProgres()
  };
  const f = fabriques[ECRAN.vue] || fabriques.ce_soir;
  document.getElementById("vue").replaceChildren(f());
}

// ---------- Démarrage : compter l'ouverture, assurer le cap de la semaine, afficher « Ce soir » ----------
function demarrer() {
  compterSiPossible("ouvertures");
  if (existe("assurerCap")) { try { agir(e => assurerCap(e, new Date())); } catch (err) { console.warn("assurerCap : " + err.message); } }
  const manque = ["recetteDuSoir", "planB", "pasCeSoir", "marquerFaite", "assurerCap", "basculerVersion", "quantitesFoyer", "compter"].filter(n => !existe(n));
  if (manque.length) console.warn("Interface pas encore chargée : " + manque.join(", "));
  rendre();
}
demarrer();
