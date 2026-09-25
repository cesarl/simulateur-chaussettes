# Module de référence — calepinage multi-motifs

Remplace le calepinage « un seul carreau » de la V1. Écrit, testé (`tests/unit/calepinage.test.ts`) et vérifié visuellement en dehors du dépôt ; l'agent doit l'**intégrer**, pas le réécrire.

## Fichiers

| Fichier | Rôle |
|---|---|
| `calepinage.ts` | moteur pur : import des préréglages, calepinages générés, plan des cases, géométrie maille → case → pixel du motif, analyse du raccord |
| `sampler.ts` | exemple d'échantillonnage maille par maille avec plusieurs images de carreaux (à reprendre dans `src/core/layout.ts`) |
| `calepinages.json` | les 75 préréglages du configurateur de carreaux de César (fichier d'origine, non modifié) |

## Deux sources de calepinage

**1. Préréglages du configurateur** (`calepinages.json`, même format que le configurateur de carreaux) :
un bloc de `block_size = [colonnes, rangées]` cases qui se répète ; chaque case donne le motif (`1..N`, ou `"any"` = motif tiré au hasard) et la rotation (`0/90/180/270`, ou `"random"`).

**2. Calepinages générés** : `ordre` × `rotation`, plus 11 raccourcis prêts à l'emploi (`GENERATED_PRESETS`) :

| Ordre | Effet |
|---|---|
| `unique` | toujours le motif 1 |
| `suite` | 1, 2, 3… N, 1, 2… ; `pasRangee` = décalage d'une rangée à l'autre (0 = colonnes, 1 = diagonale) |
| `aleatoire` | motif tiré au hasard |
| `aleatoire-sans-voisin` | au hasard, sans deux motifs identiques côte à côte (tour compris) |

| Rotation | Effet |
|---|---|
| `aucune` / `fixe` | 0° / angle choisi |
| `suite-90` | +90° à chaque carreau |
| `aleatoire-90` | 0/90/180/270 au hasard |
| `aleatoire-180` | 0 ou 180 au hasard |
| `rosace` | bloc 2×2 tourné comme le préréglage « Rosace » du configurateur (HG 90°, HD 180°, BG 0°, BD 270°) |
| `miroir` | bloc 2×2 en symétries (normal, miroir H, miroir V, les deux) |

Communs aux deux : appareillage `droit` / `quinconce-h` / `quinconce-v`, rotation globale, graine.

## Conventions (vérifiées)

- **Rotation dans le sens horaire** : le simulateur de carreaux applique `transform="rotate(angle, cx, cy)"` en SVG (repère y vers le bas → sens horaire). Cohérent avec les préréglages « Rosace » et « Rosace renversée ».
- Case (cx, cy) : cx vers la droite (autour de la jambe), cy vers le bas.
- Motifs numérotés à partir de 0 dans le code (le JSON commence à 1). Comme dans le simulateur de carreaux (`getCellSpec` de `script.js`) : un numéro de motif trop grand prend le **dernier** carreau disponible ; `tile` peut aussi être une liste `[2,3]` (tirage au hasard parmi ces motifs). L'interface doit signaler quand des motifs manquent.
- **Hasard déterministe** : il ne dépend que de (case, graine). Changer la taille ou une couleur ne rebat pas les cartes ; seul « Nouveau tirage » (graine + 1) le fait.
- **Raccord au dos** (`raccord()`) : la répétition horizontale (bloc du préréglage, nombre de motifs pour « à la suite », 2 pour rosace/miroir, 4 pour +90°…) doit diviser le nombre de carreaux sur le tour. L'aléatoire boucle sur le tour quand la largeur du carreau divise le nombre d'aiguilles → pas de couture. `fittingTileWidths()` propose les largeurs de carreau qui tombent juste.

## Anomalies du fichier de César (lues comme le simulateur de carreaux)

`normalizePresets()` applique exactement les règles du simulateur de carreaux et signale les cas douteux dans `warnings` (à afficher discrètement) :
- `opale` (5,0) : rotation `1800` → **0°** (le simulateur de carreaux l'affiche à 0° ; probablement 180° voulu : à corriger dans le fichier source) ;
- `rosace revert` (1,1) : rotation `360` → 0° ;
- `aleatoire_no_rotation` : rotation `"0"` (texte) → 0° ;
- `Amour` : bloc 6×12 mais 6 cases en rangée 13 → ignorées (comme dans le simulateur de carreaux ; bloc probablement 6×13 voulu).
