"use strict";
// ---------- Écran « Mon profil » : 5 champs, un bouton « Enregistrer » (lot realisation_ecran_profil) ----------
// Données de santé : lues et écrites uniquement par lireProfil() / enregistrerProfil() ; jamais de stockage direct.
// Seul nom global : afficherProfil (tout le reste est local à la fonction). Affichage par createElement et textContent.
function afficherProfil() {
  const p = lireProfil();
  const champs = {}; // nom du champ -> élément de saisie
  const message = h("p", { class: "info", role: "status", "aria-live": "polite" }, "");
  message.hidden = true;

  // Cible tactile ≥ 44 px : propriétés CSSOM (autorisées par la CSP), sans attribut style ni nouvelle couleur.
  const gros = el => { el.style.minHeight = "44px"; el.style.boxSizing = "border-box"; return el; };

  function nombreChamp(cle, libelle, valeur, min, max, pas) {
    const id = "profil_" + cle;
    const input = gros(h("input", { id, type: "number", inputmode: pas < 1 ? "decimal" : "numeric", min, max, step: pas, value: String(valeur) }));
    input.style.width = "100%"; input.style.fontSize = "16px";
    champs[cle] = input;
    return h("div", { class: "bloc" }, h("label", { for: id }, libelle), input);
  }

  const caseBox = h("input", { id: "profil_petit_dejeuner", type: "checkbox" });
  caseBox.checked = !!p.petit_dejeuner;
  caseBox.style.width = "24px"; caseBox.style.height = "24px"; caseBox.style.margin = "0";
  champs.petit_dejeuner = caseBox;
  const ligneCase = gros(h("label", { class: "check bloc", for: "profil_petit_dejeuner" }, caseBox, "Je prends un petit-déjeuner"));
  ligneCase.style.alignItems = "center";

  const enregistrer = () => {
    const nombres = [["poids_kg", "Poids"], ["seances_sport_semaine", "Séances de sport"], ["proteines_cible_g", "Cible de protéines"], ["foyer", "Foyer"]];
    const brut = { petit_dejeuner: champs.petit_dejeuner.checked };
    for (const [cle, nom] of nombres) {
      const v = champs[cle].value.trim().replace(",", ".");
      // Un champ vide garde la valeur actuelle ; sinon nombre positif exigé (0 admis pour le sport)
      if (v === "") { brut[cle] = p[cle]; continue; }
      const n = Number(v);
      if (!isFinite(n) || n < 0 || (n === 0 && cle !== "seances_sport_semaine")) {
        message.textContent = nom + " : saisis un nombre positif.";
        message.hidden = false; champs[cle].focus();
        return;
      }
      brut[cle] = n;
    }
    enregistrerProfil(brut);
    toast("Profil enregistré");
    aller("progres");
  };

  const ecran = h("section", { class: "ecran" },
    h("h2", {}, "Mon profil"),
    h("p", { class: "note" }, "Ces données restent sur cet appareil."),
    nombreChamp("poids_kg", "Poids (kg)", p.poids_kg, 20, 300, 0.5),
    nombreChamp("seances_sport_semaine", "Séances de sport par semaine", p.seances_sport_semaine, 0, 21, 1),
    ligneCase,
    nombreChamp("proteines_cible_g", "Cible de protéines par repas (g)", p.proteines_cible_g, 20, 250, 5),
    nombreChamp("foyer", "Personnes dans le foyer", p.foyer, 1, 12, 1),
    message,
    h("button", { class: "btn principal", type: "button", onclick: enregistrer }, "Enregistrer"),
    h("button", { class: "btn second", type: "button", onclick: () => aller("progres") }, "Annuler"));
  document.getElementById("vue").replaceChildren(ecran);
}
