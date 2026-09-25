# Données du simulateur de carreaux → simulateur de chaussettes

## Principe
Le simulateur de carreaux (`configurateur-carreaux-cesar-bazaar`, dépôt voisin sur le PC de César) reste **la seule source** des collections, SVG, calepinages et couleurs. Le simulateur de chaussettes en garde une **copie** dans `public/carreaux/`, produite par un script :

```bash
npm run sync:carreaux                  # source par défaut : ../configurateur-carreaux-cesar-bazaar
npm run sync:carreaux -- --dry-run     # voir ce qui changerait, sans rien écrire
npm run sync:carreaux -- --source "C:\Users\couco\Documents\GitHub\configurateur-carreaux-cesar-bazaar"
```
Après une mise à jour du simulateur de carreaux : relancer le script, vérifier `public/carreaux/SYNC_REPORT.md`, committer `public/carreaux/`. L'agent Cursor n'a pas accès au dépôt des carreaux : c'est toujours César qui lance la synchronisation.

## Ce qui est copié (liste fermée)
| Source | Destination | Remarque |
|---|---|---|
| `data/collections.json` | `public/carreaux/catalogue.json` (normalisé) | collections actives/dev, variations, zones, palettes |
| `data/nuancier.json` | `public/carreaux/catalogue.json` → `nuancier` | code, nom, hex, RAL, état (Validé/Test) |
| `data/calepinages.json` | `public/carreaux/calepinages.json` | copie conforme (anomalies corrigées à la lecture par `normalizePresets`) |
| `assets/svg/<ID>-VAR<n>.svg` | `public/carreaux/svg/` | uniquement les SVG des collections |

**Jamais copiés** : `data/pigment-recipes*` (confidentiel), `config.json`, mockups, images, PSD, outils, logs.

## Organisation du simulateur de carreaux (constatée le 25/09/2026, commit f513e1f)
- Site statique (HTML + `script.js` + `style.css`), pas de build. Données dans `data/`, SVG dans `assets/svg/`.
- **Collection** (`collections.json`, 75 entrées) : `id`, `nom`, `description`, `format` (20x20…), `variations` (nombre de motifs), `layouts` (calepinages proposés) et `defaut_layout`, `category` (signature / classic / new), `colors` (codes nuancier), `artist_recommendations` (URL du simulateur avec `zone-1=CODE&zone-2=CODE…`), options `active`, `dev_only`, `no_color_zone_restriction`, répartition par carton.
- **SVG** : un fichier par variation, `<ID EN MAJUSCULES>-VAR<n>.svg`. Chaque couleur est un groupe `<g id="zone-N" data-color-id="CODE">`. Les zones sont communes à toutes les variations d'une collection (zone-2 = même couleur partout). Quelques SVG anciens n'ont pas de `data-color-id` : la couleur se déduit du remplissage (attribut ou classe CSS Illustrator).
- **Nuancier** (181 couleurs, 144 « Validé ») : `Color_ID` (ex. OR008), `Nom couleur`, `RAL`, `Hex`, `Etat`. Le simulateur public ne montre que les couleurs validées.
- **Calepinages** : voir `reference/calepinage/README.md`. Le numéro de motif `tile: n` d'un calepinage = la variation `VARn` de la collection.

## Pourquoi c'est idéal pour le jacquard
Une zone = une couleur de fil. En recolorant les SVG par zone avant de les pixeliser, la palette de la chaussette est **exactement** la liste des couleurs de zones : pas de réduction de couleurs approximative. Les « recommandations de l'artiste » deviennent directement des coloris de chaussettes.

## Anomalies trouvées dans les données des carreaux (à corriger côté carreaux quand César le souhaite)
- `secret-garden` : une recommandation contient deux URL collées (`https://https://…GN019www.cesarbazaar.fr/…`).
- `classique21` : calepinage `rosace revert 2` inexistant dans `calepinages.json`.
- `assets/svg/OMG-VAR1..3.svg` : n'appartiennent à aucune collection.
- `calepinages.json` : `opale` rotation `1800`, `Amour` bloc 6×12 avec une 13ᵉ rangée, `rosace revert` rotation `360`.
