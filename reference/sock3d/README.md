# Module de référence — chaussette 3D réaliste

Remplace la chaussette « cylindre + pavé » par une chaussette portée crédible, avec le motif exactement plaqué.
Ce module a été écrit et vérifié visuellement en dehors du dépôt ; l'agent doit l'**intégrer** (tâches `tasks/TASKS_RENDU_3D.md`), pas le réécrire.

Captures de référence : `captures/` (ce que le rendu intégré doit égaler ou dépasser).

## Fichiers

| Fichier | Rôle | Dépendances |
|---|---|---|
| `sockShape.ts` | forme anatomique (mollet, cheville, poche du talon, cou-de-pied, semelle posée à plat, pointe arrondie, ourlet roulé, côtes, plis de cheville) + correspondance tissu ↔ grille (`fabricAt`) | aucune (pur) |
| `sockAtlas.ts` | atlas couleur : une colonne par aiguille, chaque texel va lire la maille de la grille via `fabricAt` | aucune (pur) |
| `knitMaps.ts` | relief d'une maille de jersey (normales + occlusion), tuile raccordable | aucune (pur) |
| `sockObject.ts` | `Mesh` Three.js : `MeshPhysicalMaterial` (duvet « sheen », très mat), relief de maille répété 1×/maille (canal UV 1), frontières de mailles en chevron (shader), intérieur assombri, `setColors` sans reconstruire la géométrie | three |
| `studio.ts` | lumière de studio (environnement RoomEnvironment + 3 lumières), ombre de contact, tone mapping Neutral (couleurs fidèles), cadrage automatique, vues nommées, capture PNG | three |
| `demo.ts` + `/sock-demo.html` | démo autonome | three |

## Points clés

- **La géométrie est anatomique, la texture est la grille.** Le pied a une vraie longueur de pied (27 cm homme, ×0,91 femme) ; la hauteur de tige suit le nombre de rangs (raccourcir la tige abaisse le haut, le pied ne bouge pas).
- **Talon** : zone en coin sur le dos (colonnes `[0, W/2)`), bords en diagonale comme un talon à rangs raccourcis. Devant, la tige et le pied se suivent sans trou.
- **Couleurs exactes** : atlas en `NearestFilter`, `NeutralToneMapping`, duvet gris neutre. Pas d'ACES (il délave les rouges).
- **Pointe** : la paramétrisation se referme en un point ; les normales y sont moyennées et le relief de maille est atténué (`knitMask`), sinon un petit cratère sombre apparaît.
- **Chevron** : le shader décale la lecture de couleur à l'intérieur de chaque maille selon `vNormalMapUv.x` pour que les frontières entre couleurs aient la forme des V tricotés. Réglable via `uChevron` (0 = carrés).
- **Capture** : redimensionne temporairement le rendu à la taille d'export (même tone mapping qu'à l'écran), puis restaure. Nécessite `preserveDrawingBuffer: true`, et `alpha: true` pour le fond transparent.
- Chaussette gauche : `side: 'gauche'` (miroir X, orientation des triangles corrigée).

## Entrées attendues

```ts
buildSockMesh({ needles, cuffRows /* 0 si pas de bord-côte */, legRows, heelRows, footRows, toeRows, rowsPerCm, size: 'homme' | 'femme', side?, ribWidth? })
buildSockAtlas(shape, { width, height, palette: ['#rrggbb'], colorIndex /* W×H, rang 0 = haut */ }, { heel, toe, rim? })
```
La grille est celle de l'application (`StitchGrid`) : mêmes conventions (colonne 0 = côté intérieur, `[0, W/2)` = arrière).

## Réglages anatomiques

Tables en tête de `sockShape.ts` (`LEG_A`, `LEG_BF`, `LEG_BB`, `FOOT_A`, `FOOT_BF`, `FOOT_Y`), en mètres, taille homme. Ne pas les exposer dans l'interface.
