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

- **Rotation dans le sens horaire** (comme `rotate()` en CSS). Vérifié sur les préréglages « Rosace » et « Rosace renversée », qui ne sont cohérents entre eux que dans ce sens.
- Case (cx, cy) : cx vers la droite (autour de la jambe), cy vers le bas.
- Motifs numérotés à partir de 0 dans le code (le JSON commence à 1). S'il y a moins de carreaux importés que le préréglage n'en demande, les motifs sont réutilisés (numéro modulo nombre de carreaux) : l'interface doit l'afficher.
- **Hasard déterministe** : il ne dépend que de (case, graine). Changer la taille ou une couleur ne rebat pas les cartes ; seul « Nouveau tirage » (graine + 1) le fait.
- **Raccord au dos** (`raccord()`) : la répétition horizontale (bloc du préréglage, nombre de motifs pour « à la suite », 2 pour rosace/miroir, 4 pour +90°…) doit diviser le nombre de carreaux sur le tour. L'aléatoire boucle sur le tour quand la largeur du carreau divise le nombre d'aiguilles → pas de couture. `fittingTileWidths()` propose les largeurs de carreau qui tombent juste.

## Anomalies du fichier de César (corrigées à l'import)

`normalizePresets()` corrige ces cas ; ceux qui changent le sens du fichier (opale, Amour) sont aussi renvoyés dans `warnings`, à afficher discrètement (console + info-bulle) :
- `opale` (5,0) : rotation `1800` → lue comme 180° (faute de frappe probable) ;
- `rosace revert` (1,1) : rotation `360` → 0° ;
- `aleatoire_no_rotation` : rotation `"0"` (texte) → 0° ;
- `Amour` : bloc déclaré 6×12 mais des cases en rangée 13 → bloc agrandi à 6×13.
