# Veille des prix (outil perso, hors appli)

Outil local, séparé de l'appli Mr Cooook : il ne modifie rien dans `js/` et ne fait que **lire** `js/recettes.js`.
Python 3. Étape 1 : bibliothèque standard seule, sans réseau. Étape 2 : Playwright, sur ta machine.

## Étape 1 : liste unifiée et correspondances

```
SOURCES                                   RÉFÉRENTIEL (veille.sqlite)
js/recettes.js  (ingrédients + placard) ─┐
donnees/liste_permanente.csv            ─┼─▶ ingredients ──▶ produits (1 ingrédient → n produits par enseigne)
liste de courses exportée (--courses)   ─┘        ▲
donnees/correspondances.csv ──────────────────────┘
```

| Fichier | Rôle |
|---|---|
| `donnees/liste_permanente.csv` | Ce que tu achètes hors recettes (`nom,quantite,unite,rayon,note,frequence,priorite`). Le `nom` sert de clé : les précisions (label, marque) vont dans `note`. `frequence` (ex. `1/semaine`) et `priorite` (`basse`, vide = normale) sont notées pour plus tard, pas encore utilisées. |
| `donnees/correspondances.csv` | La pièce maîtresse : relie un ingrédient à un produit précis d'une enseigne. |
| `donnees/releves_externes.csv` | Prix vus ailleurs (captures, recherches web de Claude) : `date,ingredient,enseigne,prix,prix_barre,source`. Chargé par `importer`, sans doublon. |
| `veille.sqlite` | Base locale créée au premier import (non versionnée). |

### Remplir `correspondances.csv`

```
ingredient,enseigne,libelle,url,contenance,unite,prix_cible
gingembre,joybuy,Gingembre frais 200 g,https://…,200,g,
riz,leclerc,Riz basmati 1 kg,https://…,1,kg,2.20
riz,amazon,Riz basmati 5 × 1 kg,https://www.amazon.fr/dp/…,5,kg,
```

- `ingredient` : le nom tel qu'il apparaît dans les recettes ou la liste permanente (casse, accents et « œ » ignorés).
- `enseigne` : `auchan`, `carrefour`, `leclerc`, `intermarche`, `joybuy`, `amazon` (`grandfrais`, `marche` réservés aux relevés manuels).
- `contenance` + `unite` (`g`, `kg`, `ml`, `cl`, `l`, `pièce`) : sert à comparer au kilo, au litre ou à la pièce.
- `prix_cible` (facultatif) : seuil d'alerte de l'étape 3.
- Ne relie un ingrédient qu'aux enseignes où il a du sens, pas aux six.
- Retirer une ligne désactive le produit sans effacer ses relevés.

## Commandes

```bash
cd outils/veille-prix
python3 veille_prix.py importer                       # relit toutes les sources
python3 veille_prix.py importer --courses courses.md  # + une liste de courses exportée
python3 veille_prix.py liste                          # liste unifiée (les plus utilisés d'abord)
python3 veille_prix.py manquants                      # ce qu'il reste à relier : ta liste de travail
python3 -m unittest discover -s tests                 # tests
```

`--courses` accepte un texte simple ou le Markdown à cases exporté par l'ancien écran Courses (`- [ ] ×2 riz`).
L'écran Courses de la V1 n'existe pas encore : en attendant, l'outil lit tous les ingrédients des recettes.

## Étape 2 : relevés et comparatif (sur ta machine)

Les relevés passent par un vrai navigateur (Playwright) : à lancer **chez toi**, pas depuis un serveur
(les sites bloquent les adresses de serveurs). Installation, une fois :

```bash
cd outils/veille-prix
python3 -m pip install playwright
python3 -m playwright install chromium      # ou utilise ton Chrome : ajoute --chrome aux commandes
```

| Commande | Rôle |
|---|---|
| `python3 veille_prix.py profil` | Ouvre une page produit de chaque site : accepte les cookies, choisis ton drive (Auchan Pessac, Carrefour…), résous les « je ne suis pas un robot ». Une fois, puis quand un site t'a « oublié ». |
| `python3 veille_prix.py importer` | Relit tes CSV (à refaire après chaque modification). |
| `python3 veille_prix.py releve --max 3` | Premier essai sur 3 pages. Sans `--max` : tous les produits. `--manuel` : s'arrête sur chaque écran anti-robot pour que tu le résolves. |
| `python3 veille_prix.py saisir "sauce huître" joybuy 4,79` | Note un prix à la main : site qui bloque (Joybuy), Grand Frais, marché (`--contenance 1 --unite kg` pour un produit sans page). Il entre dans le comparatif comme un relevé. |
| `python3 veille_prix.py openprices` | Récupère dans la base ouverte **Open Prices** les prix connus des produits dont on a le code-barres, relevés autour de Pessac (`--toute-la-france` pour élargir). |
| `python3 veille_prix.py rapport` | Écrit `rapport.html` : panier le moins cher livraison comprise, tableau par ingrédient. |
| `python3 veille_prix.py calibrer URL` | Quand un site donne « prix introuvable » : liste ce qui ressemble à un prix sur la page. Envoie le résultat à Claude, qui remplira `selecteur_prix`. |

```
releve ─▶ pour chaque produit (enseignes alternées, 4 à 12 s entre deux pages)
          1. données structurées schema.org (JSON-LD)   ─┐
          2. balises meta de prix                         ├─▶ releves : ok / bloque / introuvable / erreur
          3. selecteur_prix de l'enseigne (enseignes.json) ┘
rapport ─▶ dernier prix valable par produit, prix au kilo/litre/pièce, évolution,
           panier le moins cher : enseigne la moins chère à l'unité, sauf si ses frais
           de livraison coûtent plus que l'écart (enseignes.json : frais, seuil_gratuite)
```

- `donnees/enseignes.json` : page d'accueil, frais de livraison ou de retrait, seuil de gratuité, sélecteur de prix. Exclus des relevés (`"releve": false`) : Amazon (suis-le avec camelcamelcamel ou Keepa) et Joybuy, qui renvoie une page « 403 Interdit » aux navigateurs automatisés (note ses prix avec `saisir`, et active les alertes de baisse de prix de l'appli Joybuy sur tes favoris).
- Le navigateur reste **visible** pendant le relevé : les sites bloquent plus souvent un navigateur caché (`--invisible`).
- Statut `bloque` : écran anti-robot. Relance plus tard, ou passe par `profil` pour résoudre le captcha une fois à la main.
- Fréquence prévue : 2 fois par semaine (mardi et vendredi soir). Lance-le à la main tant que le calibrage n'est pas fini ; automatise ensuite (cron ou Automator), ordinateur allumé et session ouverte.
- Tests : `python3 -m unittest discover -s tests` (le test du navigateur utilise des pages locales, jamais les vrais sites).

## Étape suivante

3. Alertes ntfy (prix cible, baisse, prix barré, promo « le 2e à -X % ») et ordre de passage selon fréquence et priorité.
