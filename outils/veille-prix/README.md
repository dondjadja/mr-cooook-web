# Veille des prix (outil perso, hors appli)

Outil local, séparé de l'appli Mr Cooook : il ne modifie rien dans `js/` et ne fait que **lire** `js/recettes.js`.
Python 3 + bibliothèque standard, aucun accès réseau à cette étape.

## Étape 1 (ici) : liste unifiée et correspondances

```
SOURCES                                   RÉFÉRENTIEL (veille.sqlite)
js/recettes.js  (ingrédients + placard) ─┐
donnees/liste_permanente.csv            ─┼─▶ ingredients ──▶ produits (1 ingrédient → n produits par enseigne)
liste de courses exportée (--courses)   ─┘        ▲
donnees/correspondances.csv ──────────────────────┘
```

| Fichier | Rôle |
|---|---|
| `donnees/liste_permanente.csv` | Ce que tu achètes hors recettes (`nom,quantite,unite,rayon,note,frequence`). Le `nom` sert de clé : les précisions (label, marque) vont dans `note`. `frequence` (ex. `1/semaine`) est notée pour plus tard, pas encore utilisée. |
| `donnees/correspondances.csv` | La pièce maîtresse : relie un ingrédient à un produit précis d'une enseigne. |
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

## Étapes suivantes

2. Relevés automatiques (Playwright, sur ta machine) des drives et de Joybuy, comparatif de panier livraison comprise, rapport HTML.
3. Alertes ntfy (prix cible, baisse, prix barré) ; Amazon via camelcamelcamel ou Keepa plutôt qu'un relevé direct.
