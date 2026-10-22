"use strict";
// ---------- Écran « Mon profil » : 6 champs saisis, besoins calculés en lecture seule (lot correction_ecran_profil) ----------
// Données de santé : lues et écrites uniquement par lireProfil() / enregistrerProfil() ; jamais de stockage direct.
// Seul nom global : afficherProfil (tout le reste est local à la fonction). Affichage par createElement et textContent.
// Tailles des champs : web/styles/profil.css (aucun style posé ici).
function afficherProfil() {
  const p = lireProfil();
  const champs = {}; // nom du champ -> élément de saisie
  const message = h("p", { class: "info", role: "status", "aria-live": "polite" }, "");
  message.hidden = true;

  function nombreChamp(cle, libelle, valeur, min, max, pas) {
    const id = "profil_" + cle;
    const input = h("input", { id, class: "profil-champ", type: "number", inputmode: pas < 1 ? "decimal" : "numeric", min, max, step: pas, value: String(valeur) });
    champs[cle] = input;
    input.addEventListener("input", majBesoins);
    return h("div", { class: "bloc" }, h("label", { for: id }, libelle), input);
  }
  function choixChamp(cle, libelle, valeur, options) {
    const id = "profil_" + cle;
    const sel = h("select", { id, class: "profil-champ" },
      options.map(([v, t]) => h("option", { value: v }, t)));
    sel.value = valeur;
    champs[cle] = sel;
    sel.addEventListener("change", majBesoins);
    return h("div", { class: "bloc" }, h("label", { for: id }, libelle), sel);
  }

  const caseBox = h("input", { id: "profil_petit_dejeuner", class: "profil-case", type: "checkbox" });
  caseBox.checked = !!p.petit_dejeuner;
  caseBox.addEventListener("change", majBesoins);
  champs.petit_dejeuner = caseBox;
  const ligneCase = h("label", { class: "check bloc profil-ligne", for: "profil_petit_dejeuner" }, caseBox, "Je prends un petit-déjeuner");

  const valJour = h("strong", { id: "besoin_jour" }, "");
  const valRepas = h("strong", { id: "besoin_repas" }, "");
  const besoins = h("div", { class: "bloc", "aria-live": "polite" },
    h("p", { class: "note" }, "Besoins calculés (non modifiables)"),
    h("p", {}, "Protéines par jour : ", valJour, " g"),
    h("p", {}, "Protéines par repas : ", valRepas, " g"));

  // Profil tel que saisi à l'instant (champ vide : valeur enregistrée ; le reste est nettoyé par profilPropre)
  function saisie() {
    const num = cle => { const v = champs[cle].value.trim().replace(",", "."); return v === "" ? p[cle] : Number(v); };
    return { poids_kg: num("poids_kg"), seances_sport_semaine: num("seances_sport_semaine"),
      petit_dejeuner: champs.petit_dejeuner.checked, faim: champs.faim.value, foyer: num("foyer"),
      objectif_mois: champs.objectif_mois.value };
  }
  function majBesoins() {
    const b = besoinsCalcules(saisie());
    valJour.textContent = String(b.proteines_jour_g);
    valRepas.textContent = String(b.proteines_repas_g);
  }

  const enregistrer = () => {
    const nombres = [["poids_kg", "Poids"], ["seances_sport_semaine", "Séances de sport"], ["foyer", "Foyer"]];
    for (const [cle, nom] of nombres) {
      const v = champs[cle].value.trim().replace(",", ".");
      if (v === "") continue; // un champ vide garde la valeur actuelle
      const n = Number(v);
      if (!isFinite(n) || n < 0 || (n === 0 && cle !== "seances_sport_semaine")) {
        message.textContent = nom + " : saisis un nombre positif.";
        message.hidden = false; champs[cle].focus();
        return;
      }
    }
    enregistrerProfil(saisie());
    toast("Profil enregistré");
    aller("progres");
  };

  const ecran = h("section", { class: "ecran" },
    h("h2", {}, "Mon profil"),
    h("p", { class: "note" }, "Ces données restent sur cet appareil."),
    nombreChamp("poids_kg", "Poids (kg)", p.poids_kg, 20, 300, 0.5),
    nombreChamp("seances_sport_semaine", "Séances de sport par semaine", p.seances_sport_semaine, 0, 21, 1),
    ligneCase,
    choixChamp("faim", "Faim", p.faim, [["petite", "Petite"], ["normale", "Normale"], ["grande", "Grande"]]),
    nombreChamp("foyer", "Personnes dans le foyer", p.foyer, 1, 12, 1),
    choixChamp("objectif_mois", "Objectif du mois", p.objectif_mois, [["perdre", "Perdre"], ["maintenir", "Maintenir"], ["muscle", "Prendre du muscle"]]),
    besoins,
    message,
    h("button", { class: "btn principal", type: "button", onclick: enregistrer }, "Enregistrer"),
    h("button", { class: "btn second", type: "button", onclick: () => aller("progres") }, "Annuler"));
  document.getElementById("vue").replaceChildren(ecran);
  majBesoins();
}
