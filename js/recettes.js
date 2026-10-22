"use strict";
// ---------- Recettes au format du contrat (CONTRAT.md v1) — données FICTIVES du brouillon ----------
// Quantités pour 5 personnes. Masses en g, liquides en ml ; « pièce » avec son poids en commentaire.
// nutrition_100g : valeurs estimées pour 100 g de l'ensemble des ingrédients listés (masse crue, eau de cuisson non comptée).
// Les vraies valeurs (Ciqual) arrivent en version « fiable ».

// Liste placard fixe (PRD, besoin_plan_b) : les recettes de plan B n'utilisent que ces 10 produits.
const PLACARD_FIXE = ["riz", "pâtes", "lentilles corail", "pois chiches en boîte", "tomates concassées",
  "œufs", "oignons", "ail", "huile d'olive", "épices de base"];

const RECETTES_V1 = [
  // ---------- Recettes de séance (reprises de la V0, version rapide ≤ 20 min) ----------
  {
    id: "boeuf_brocoli",
    nom: "Bœuf sauté aux brocolis",
    pays: "CN",
    temps_rapide: 20,
    temps_normal: 30,
    ingredients: [
      { nom: "bœuf en lanières", quantite: 1000, unite: "g", rayon: "boucherie" },
      { nom: "brocolis", quantite: 1000, unite: "g", rayon: "fruits et légumes" },
      { nom: "riz", quantite: 400, unite: "g", rayon: "épicerie" },
      { nom: "sauce soja", quantite: 60, unite: "ml", rayon: "épicerie" },
      { nom: "gingembre", quantite: 30, unite: "g", rayon: "fruits et légumes" },
      { nom: "ail", quantite: 15, unite: "g", rayon: "fruits et légumes" },
      { nom: "fécule de maïs", quantite: 15, unite: "g", rayon: "épicerie" },
      { nom: "huile d'olive", quantite: 30, unite: "ml", rayon: "épicerie" }
    ],
    etapes: [
      "Lance le riz (10 à 12 min).",
      "Mélange le bœuf avec la sauce soja et la fécule, laisse 5 min.",
      "Coupe les brocolis en petites fleurettes et blanchis-les 2 min.",
      "Saisis le bœuf en 3 fois, wok très chaud, 2 min par fournée ; réserve.",
      "Remets tout dans le wok avec ail et gingembre râpés et un fond d'eau, 2 min. Sers sur le riz."
    ],
    gestes: [
      "Saisis la viande en petites quantités : trop à la fois, le wok refroidit et la viande bout au lieu de griller.",
      "La fécule dans la marinade enrobe le bœuf : il reste tendre et la sauce nappe toute seule."
    ],
    benefices: [
      { icone: "💪", libelle: "Protéines", ecart_pct: 25 },
      { icone: "🩸", libelle: "Fer", ecart_pct: 40 },
      { icone: "🥦", libelle: "Vitamine C", ecart_pct: 60 }
    ],
    nutrition_100g: { proteines: 10.7, lipides: 3.4, glucides: 14.8, fibres: 1.3, kcal: 135 },
    options: [
      { nom: "Graines de sésame grillées", cout_gout: 1, cout_nutrition: 0, cout_prix: 1 },
      { nom: "Piment séché", cout_gout: 1, cout_nutrition: 0, cout_prix: 0 }
    ],
    alternatives: [
      { ingredient: "bœuf en lanières", remplacement: "blancs de poulet", compenser: "rien : protéines équivalentes, moins de fer" },
      { ingredient: "brocolis", remplacement: "haricots verts surgelés", compenser: "ajoute un filet de citron pour la vitamine C" }
    ],
    placard: false,
    objectifs: { energie: 3, ig: 2, stress: 1, inflammation: 2, sommeil: 1, force: 3, budget: 1, monde: 2 }
  },
  {
    id: "fajitas",
    nom: "Fajitas poulet-poivrons",
    pays: "MX",
    temps_rapide: 20,
    temps_normal: 30,
    ingredients: [
      { nom: "blancs de poulet", quantite: 1200, unite: "g", rayon: "boucherie" },
      { nom: "poivrons", quantite: 800, unite: "g", rayon: "fruits et légumes" },
      { nom: "oignons", quantite: 300, unite: "g", rayon: "fruits et légumes" },
      { nom: "tortillas de blé", quantite: 15, unite: "pièce", rayon: "épicerie" }, // 15 × 40 g
      { nom: "fromage blanc", quantite: 300, unite: "g", rayon: "crèmerie" },
      { nom: "citrons verts", quantite: 2, unite: "pièce", rayon: "fruits et légumes" }, // 2 × 60 g
      { nom: "épices de base", quantite: 10, unite: "g", rayon: "épicerie" },
      { nom: "huile d'olive", quantite: 30, unite: "ml", rayon: "épicerie" }
    ],
    etapes: [
      "Coupe poulet, poivrons et oignons en lanières.",
      "Mélange le poulet avec cumin, paprika, sel et le jus d'un citron vert.",
      "Saisis le poulet 5 min à feu vif, réserve.",
      "Fais sauter poivrons et oignons 6 min, remets le poulet.",
      "Chauffe les tortillas 20 s à sec dans la poêle ; sers avec le fromage blanc citronné."
    ],
    gestes: [
      "Coupe le poulet dans le sens contraire des fibres : il reste tendre.",
      "Le fromage blanc au citron vert remplace la crème : plus de protéines, même fraîcheur."
    ],
    benefices: [
      { icone: "💪", libelle: "Protéines", ecart_pct: 30 },
      { icone: "🫑", libelle: "Vitamine C", ecart_pct: 80 },
      { icone: "🧈", libelle: "Graisses saturées", ecart_pct: -20 }
    ],
    nutrition_100g: { proteines: 10.6, lipides: 3.1, glucides: 11.5, fibres: 1.3, kcal: 119 },
    options: [
      { nom: "Avocat écrasé", cout_gout: 2, cout_nutrition: 1, cout_prix: 2 },
      { nom: "Coriandre fraîche", cout_gout: 1, cout_nutrition: 0, cout_prix: 1 }
    ],
    alternatives: [
      { ingredient: "tortillas de blé", remplacement: "riz", compenser: "rien : sers en bol" },
      { ingredient: "fromage blanc", remplacement: "yaourt grec", compenser: "rien" }
    ],
    placard: false,
    objectifs: { energie: 3, ig: 2, stress: 1, inflammation: 1, sommeil: 1, force: 3, budget: 2, monde: 2 }
  },
  {
    id: "poisson_epinards",
    nom: "Cabillaud, épinards et citron",
    pays: "GR",
    temps_rapide: 20,
    temps_normal: 25,
    ingredients: [
      { nom: "cabillaud", quantite: 1400, unite: "g", rayon: "poissonnerie" },
      { nom: "épinards", quantite: 600, unite: "g", rayon: "fruits et légumes" },
      { nom: "tomates cerises", quantite: 500, unite: "g", rayon: "fruits et légumes" },
      { nom: "riz", quantite: 300, unite: "g", rayon: "épicerie" },
      { nom: "citrons", quantite: 2, unite: "pièce", rayon: "fruits et légumes" }, // 2 × 100 g
      { nom: "ail", quantite: 15, unite: "g", rayon: "fruits et légumes" },
      { nom: "huile d'olive", quantite: 40, unite: "ml", rayon: "épicerie" }
    ],
    etapes: [
      "Lance le riz.",
      "Fais tomber épinards et ail 3 min dans un filet d'huile, réserve.",
      "Saisis les tomates cerises 3 min.",
      "Cuis le cabillaud 3 min par face sans le bouger.",
      "Sers sur le riz avec citron et un filet d'huile d'olive crue."
    ],
    gestes: [
      "Ne touche pas le poisson pendant 3 minutes : quand la croûte est formée, il se décolle tout seul.",
      "Le zeste de citron râpé au dernier moment réveille le plat sans sel en plus."
    ],
    benefices: [
      { icone: "💪", libelle: "Protéines maigres", ecart_pct: 20 },
      { icone: "🛡️", libelle: "Anti-inflammatoire", ecart_pct: 35 },
      { icone: "🌙", libelle: "Digestion légère", ecart_pct: 30 }
    ],
    nutrition_100g: { proteines: 9.7, lipides: 1.8, glucides: 9.2, fibres: 0.9, kcal: 93 },
    options: [
      { nom: "Câpres", cout_gout: 1, cout_nutrition: 0, cout_prix: 1 },
      { nom: "Feta émiettée", cout_gout: 2, cout_nutrition: 0, cout_prix: 1 }
    ],
    alternatives: [
      { ingredient: "cabillaud", remplacement: "colin", compenser: "rien" },
      { ingredient: "épinards", remplacement: "épinards surgelés", compenser: "égoutte-les bien avant de les poêler" }
    ],
    placard: false,
    objectifs: { energie: 2, ig: 3, stress: 2, inflammation: 3, sommeil: 2, force: 3, budget: 1, monde: 1 }
  },
  {
    id: "saumon_haricots",
    nom: "Saumon poêlé, haricots verts au gingembre",
    pays: "FR",
    temps_rapide: 20,
    temps_normal: 30,
    ingredients: [
      { nom: "saumon", quantite: 1250, unite: "g", rayon: "poissonnerie" },
      { nom: "haricots verts", quantite: 1000, unite: "g", rayon: "surgelés" },
      { nom: "riz", quantite: 350, unite: "g", rayon: "épicerie" },
      { nom: "citrons", quantite: 2, unite: "pièce", rayon: "fruits et légumes" }, // 2 × 100 g
      { nom: "gingembre", quantite: 30, unite: "g", rayon: "fruits et légumes" },
      { nom: "sauce soja", quantite: 50, unite: "ml", rayon: "épicerie" }
    ],
    etapes: [
      "Lance le riz.",
      "Cuis les haricots verts 6 min à l'eau bouillante salée.",
      "Pose le saumon côté peau dans la poêle chaude, 5 min, puis 2 min de l'autre côté.",
      "Fais sauter les haricots 2 min avec gingembre râpé et sauce soja.",
      "Sers avec le citron. Version normale : en papillote au four, 15 min à 200 °C."
    ],
    gestes: [
      "Le saumon est cuit quand il se détache en lamelles et reste rosé au centre.",
      "Côté peau d'abord, sans le bouger : la peau devient croustillante et protège la chair."
    ],
    benefices: [
      { icone: "🐟", libelle: "Oméga-3", ecart_pct: 300 },
      { icone: "😴", libelle: "Sommeil", ecart_pct: 20 },
      { icone: "💪", libelle: "Protéines", ecart_pct: 20 }
    ],
    nutrition_100g: { proteines: 10.3, lipides: 5.8, glucides: 11.7, fibres: 1.4, kcal: 144 },
    options: [
      { nom: "Graines de sésame", cout_gout: 1, cout_nutrition: 0, cout_prix: 1 }
    ],
    alternatives: [
      { ingredient: "saumon", remplacement: "truite", compenser: "rien" },
      { ingredient: "sauce soja", remplacement: "sel et citron", compenser: "rien" }
    ],
    placard: false,
    objectifs: { energie: 3, ig: 2, stress: 3, inflammation: 3, sommeil: 3, force: 3, budget: 0, monde: 1 }
  },
  {
    id: "chili_con_carne",
    nom: "Chili con carne express",
    pays: "US",
    temps_rapide: 20,
    temps_normal: 40,
    ingredients: [
      { nom: "bœuf haché 5 %", quantite: 1200, unite: "g", rayon: "boucherie" },
      { nom: "haricots rouges en boîte", quantite: 800, unite: "g", rayon: "épicerie" },
      { nom: "tomates concassées", quantite: 400, unite: "g", rayon: "épicerie" },
      { nom: "riz", quantite: 400, unite: "g", rayon: "épicerie" },
      { nom: "poivrons", quantite: 300, unite: "g", rayon: "fruits et légumes" },
      { nom: "oignons", quantite: 200, unite: "g", rayon: "fruits et légumes" },
      { nom: "épices de base", quantite: 15, unite: "g", rayon: "épicerie" },
      { nom: "huile d'olive", quantite: 20, unite: "ml", rayon: "épicerie" }
    ],
    etapes: [
      "Lance le riz.",
      "Fais revenir oignons et poivrons en dés 4 min.",
      "Ajoute le bœuf, émiette-le et laisse-le dorer 5 min sans trop remuer.",
      "Ajoute cumin et paprika 30 s, puis tomates et haricots égouttés ; 8 min à frémissement.",
      "Goûte, sale, sers sur le riz. Version normale : mijote 30 min."
    ],
    gestes: [
      "Fais revenir les épices 30 secondes dans le gras avant les tomates : leurs arômes s'y dissolvent.",
      "Un carré de chocolat noir à la fin arrondit l'acidité de la tomate."
    ],
    benefices: [
      { icone: "💪", libelle: "Protéines", ecart_pct: 30 },
      { icone: "🌾", libelle: "Fibres", ecart_pct: 70 },
      { icone: "📉", libelle: "Index glycémique", ecart_pct: -25 }
    ],
    nutrition_100g: { proteines: 10.7, lipides: 2.7, glucides: 14.4, fibres: 2.2, kcal: 128 },
    options: [
      { nom: "Maïs", cout_gout: 1, cout_nutrition: 0, cout_prix: 1 },
      { nom: "Avocat", cout_gout: 2, cout_nutrition: 1, cout_prix: 2 }
    ],
    alternatives: [
      { ingredient: "bœuf haché 5 %", remplacement: "lentilles corail", compenser: "ajoute 4 œufs durs pour garder les protéines" },
      { ingredient: "haricots rouges en boîte", remplacement: "pois chiches en boîte", compenser: "rien" }
    ],
    placard: false,
    objectifs: { energie: 3, ig: 3, stress: 1, inflammation: 1, sommeil: 1, force: 3, budget: 2, monde: 2 }
  },
  {
    id: "soba_poulet",
    nom: "Nouilles soba sautées au poulet et aux légumes",
    pays: "JP",
    temps_rapide: 20,
    temps_normal: 25,
    ingredients: [
      { nom: "blancs de poulet", quantite: 800, unite: "g", rayon: "boucherie" },
      { nom: "nouilles soba", quantite: 500, unite: "g", rayon: "épicerie" },
      { nom: "chou chinois", quantite: 500, unite: "g", rayon: "fruits et légumes" },
      { nom: "champignons de Paris", quantite: 300, unite: "g", rayon: "fruits et légumes" },
      { nom: "carottes", quantite: 300, unite: "g", rayon: "fruits et légumes" },
      { nom: "sauce soja", quantite: 60, unite: "ml", rayon: "épicerie" },
      { nom: "graines de sésame", quantite: 30, unite: "g", rayon: "épicerie" },
      { nom: "huile d'olive", quantite: 30, unite: "ml", rayon: "épicerie" }
    ],
    etapes: [
      "Cuis les soba 5 min, rince-les à l'eau froide.",
      "Saisis le poulet en lanières 5 min, réserve.",
      "Fais sauter carottes en julienne et champignons 4 min.",
      "Ajoute le chou émincé 2 min.",
      "Remets poulet et nouilles avec la sauce soja, 1 min ; parsème de sésame."
    ],
    gestes: [
      "Rince les soba à l'eau froide après cuisson : l'amidon part et elles ne collent plus.",
      "Torréfie le sésame 1 min à sec : il devient beaucoup plus parfumé."
    ],
    benefices: [
      { icone: "💪", libelle: "Protéines", ecart_pct: 20 },
      { icone: "📉", libelle: "Index glycémique", ecart_pct: -20 },
      { icone: "🧲", libelle: "Magnésium", ecart_pct: 35 }
    ],
    nutrition_100g: { proteines: 11, lipides: 2.6, glucides: 15.5, fibres: 1.7, kcal: 132 },
    options: [
      { nom: "Œuf mollet", cout_gout: 1, cout_nutrition: 1, cout_prix: 1 },
      { nom: "Oignon nouveau", cout_gout: 1, cout_nutrition: 0, cout_prix: 0 }
    ],
    alternatives: [
      { ingredient: "nouilles soba", remplacement: "pâtes", compenser: "rien" },
      { ingredient: "chou chinois", remplacement: "chou blanc", compenser: "émince-le plus finement" }
    ],
    placard: false,
    objectifs: { energie: 3, ig: 2, stress: 2, inflammation: 2, sommeil: 1, force: 3, budget: 2, monde: 3 }
  },

  // ---------- Plan B : uniquement la liste placard fixe, ≤ 15 min ----------
  {
    id: "riz_saute_oeufs",
    nom: "Riz sauté aux œufs et pois chiches",
    pays: "CN",
    temps_rapide: 15,
    temps_normal: 20,
    ingredients: [
      { nom: "œufs", quantite: 18, unite: "pièce", rayon: "crèmerie" }, // 18 × 60 g
      { nom: "pois chiches en boîte", quantite: 500, unite: "g", rayon: "épicerie" }, // égouttés
      { nom: "riz", quantite: 350, unite: "g", rayon: "épicerie" },
      { nom: "oignons", quantite: 150, unite: "g", rayon: "fruits et légumes" },
      { nom: "ail", quantite: 15, unite: "g", rayon: "fruits et légumes" },
      { nom: "huile d'olive", quantite: 45, unite: "ml", rayon: "épicerie" },
      { nom: "épices de base", quantite: 10, unite: "g", rayon: "épicerie" }
    ],
    etapes: [
      "Lance le riz (10 à 12 min), puis égoutte-le et étale-le pour qu'il sèche.",
      "Pendant ce temps, brouille les œufs battus dans la poêle huilée, réserve.",
      "Fais dorer oignons et ail émincés 3 min, ajoute les pois chiches égouttés 2 min.",
      "Ajoute le riz à feu vif 3 min, puis les œufs ; sale, poivre, une pincée de cumin."
    ],
    gestes: [
      "Étale le riz sur une assiette pendant 2 min : plus sec, il saute sans coller.",
      "Laisse le riz accrocher un peu au fond sans remuer : ces grains grillés font le goût."
    ],
    benefices: [
      { icone: "💪", libelle: "Protéines", ecart_pct: 15 },
      { icone: "💶", libelle: "Prix", ecart_pct: -50 },
      { icone: "🌾", libelle: "Fibres", ecart_pct: 30 }
    ],
    nutrition_100g: { proteines: 9.2, lipides: 7.6, glucides: 17.2, fibres: 1.6, kcal: 179 },
    options: [
      { nom: "Sauce soja", cout_gout: 2, cout_nutrition: 0, cout_prix: 1 }
    ],
    alternatives: [
      { ingredient: "pois chiches en boîte", remplacement: "œufs", compenser: "6 œufs de plus" }
    ],
    placard: true,
    objectifs: { energie: 2, ig: 1, stress: 1, inflammation: 1, sommeil: 2, force: 3, budget: 3, monde: 2 }
  },
  {
    id: "pates_ail_huile",
    nom: "Pâtes ail-huile, pois chiches et œuf mollet",
    pays: "IT",
    temps_rapide: 15,
    temps_normal: 15,
    ingredients: [
      { nom: "pâtes", quantite: 800, unite: "g", rayon: "épicerie" },
      { nom: "pois chiches en boîte", quantite: 800, unite: "g", rayon: "épicerie" }, // égouttés
      { nom: "œufs", quantite: 5, unite: "pièce", rayon: "crèmerie" }, // 5 × 60 g
      { nom: "ail", quantite: 30, unite: "g", rayon: "fruits et légumes" },
      { nom: "huile d'olive", quantite: 60, unite: "ml", rayon: "épicerie" },
      { nom: "épices de base", quantite: 10, unite: "g", rayon: "épicerie" }
    ],
    etapes: [
      "Cuis les pâtes ; ajoute les œufs dans la même eau 6 min avant la fin, puis passe-les à l'eau froide.",
      "Pendant ce temps, chauffe l'huile à feu doux avec l'ail en lamelles et une pincée de piment, 3 min.",
      "Ajoute les pois chiches égouttés 2 min.",
      "Mélange avec les pâtes et une louche d'eau de cuisson ; sers avec l'œuf mollet coupé en deux."
    ],
    gestes: [
      "Garde une louche d'eau de cuisson : son amidon lie l'huile et rend la sauce onctueuse.",
      "L'ail doit blondir, jamais brunir : brûlé, il devient amer."
    ],
    benefices: [
      { icone: "💶", libelle: "Prix", ecart_pct: -55 },
      { icone: "🌾", libelle: "Fibres", ecart_pct: 45 },
      { icone: "🫒", libelle: "Bonnes graisses", ecart_pct: 40 }
    ],
    nutrition_100g: { proteines: 9.6, lipides: 6.1, glucides: 34.3, fibres: 3.4, kcal: 241 },
    options: [
      { nom: "Parmesan", cout_gout: 2, cout_nutrition: 1, cout_prix: 1 }
    ],
    alternatives: [
      { ingredient: "pois chiches en boîte", remplacement: "lentilles corail", compenser: "cuis-les 10 min avec les pâtes" }
    ],
    placard: true,
    objectifs: { energie: 3, ig: 2, stress: 1, inflammation: 2, sommeil: 2, force: 2, budget: 3, monde: 1 }
  },
  {
    id: "dahl_lentilles_corail",
    nom: "Dahl de lentilles corail et œufs durs",
    pays: "IN",
    temps_rapide: 15,
    temps_normal: 25,
    ingredients: [
      { nom: "lentilles corail", quantite: 600, unite: "g", rayon: "épicerie" },
      { nom: "œufs", quantite: 10, unite: "pièce", rayon: "crèmerie" }, // 10 × 60 g
      { nom: "tomates concassées", quantite: 400, unite: "g", rayon: "épicerie" },
      { nom: "riz", quantite: 300, unite: "g", rayon: "épicerie" },
      { nom: "oignons", quantite: 300, unite: "g", rayon: "fruits et légumes" },
      { nom: "ail", quantite: 20, unite: "g", rayon: "fruits et légumes" },
      { nom: "huile d'olive", quantite: 40, unite: "ml", rayon: "épicerie" },
      { nom: "épices de base", quantite: 15, unite: "g", rayon: "épicerie" }
    ],
    etapes: [
      "Lance le riz et, à part, les œufs 9 min à l'eau bouillante.",
      "Fais revenir oignons et ail 2 min, ajoute cumin, curcuma et curry 30 s.",
      "Ajoute lentilles rincées, tomates et 1,2 L d'eau ; 12 min à frémissement en remuant.",
      "Sale, sers sur le riz avec les œufs écalés coupés en deux."
    ],
    gestes: [
      "Fais revenir les épices 30 secondes dans l'huile chaude avant le liquide : leurs arômes se dissolvent dans le gras.",
      "Garde 1 c. à s. d'huile chaude aux épices pour la verser sur le dahl au moment de servir (tadka)."
    ],
    benefices: [
      { icone: "🌾", libelle: "Fibres", ecart_pct: 90 },
      { icone: "📉", libelle: "Index glycémique", ecart_pct: -30 },
      { icone: "💶", libelle: "Prix", ecart_pct: -60 }
    ],
    nutrition_100g: { proteines: 11, lipides: 4.9, glucides: 25.7, fibres: 3.7, kcal: 198 },
    options: [
      { nom: "Lait de coco", cout_gout: 2, cout_nutrition: 0, cout_prix: 1 },
      { nom: "Citron", cout_gout: 1, cout_nutrition: 0, cout_prix: 0 }
    ],
    alternatives: [
      { ingredient: "riz", remplacement: "pâtes", compenser: "rien" }
    ],
    placard: true,
    objectifs: { energie: 3, ig: 3, stress: 2, inflammation: 3, sommeil: 2, force: 3, budget: 3, monde: 3 }
  }
];

// Recette par identifiant, ou null si absente.
function recetteParId(id) {
  return RECETTES_V1.find(r => r.id === id) || null;
}
