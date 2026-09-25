# Module de référence — chaussette 3D réaliste

Remplace la chaussette « cylindre + pavé » par une chaussette portée crédible, avec le motif exactement plaqué.
Ce module a été écrit et vérifié visuellement en dehors du dépôt ; l'agent doit l'**intégrer** (tâches `tasks/TASKS_RENDU_3D.md`), pas le réécrire.

Captures de référence : `captures/` (ce que le rendu intégré doit égaler ou dépasser).

## Fichiers

| Fichier | Rôle | Dépendances |
|---|---|---|
| `sockShape.ts` | forme anatomique par **loft** : profil arrière (mollet → Achille → talon → semelle) et profil avant (tibia → pli de cheville → dessus du pied → orteils) appariés anneau par anneau, largeurs intérieur/extérieur séparées (pied asymétrique), semelle plate, talon arrondi, malléoles, ourlet roulé, côtes, plis de cheville ; + correspondance tissu ↔ grille (`fabricAt`) | aucune (pur) |
| `sockAtlas.ts` | atlas couleur : une colonne par aiguille, chaque texel va lire la maille de la grille via `fabricAt` | aucune (pur) |
| `knitMaps.ts` | relief d'une maille de jersey (normales + occlusion), tuile raccordable | aucune (pur) |
| `sockObject.ts` | `Mesh` Three.js : `MeshPhysicalMaterial` (duvet « sheen », très mat), relief de maille répété 1×/maille (canal UV 1), frontières de mailles en chevron (shader), intérieur assombri, `setColors` sans reconstruire la géométrie | three |
| `studio.ts` | lumière de studio (environnement RoomEnvironment + 3 lumières), ombre de contact, tone mapping Neutral (couleurs fidèles), cadrage automatique, vues nommées, capture PNG | three |
| `demo.ts` + `/sock-demo.html` | démo autonome | three |

## Mesures utilisées

Moyennes de l'enquête anthropométrique **ANSUR II** (US Army, 4 082 hommes, 1 986 femmes), calculées sur le jeu de données public :

| Mesure (mm) | Homme | Femme |
|---|---|---|
| Longueur du pied | 271 | 246 |
| Largeur du pied (métatarse) | 102 | 93 |
| Largeur du talon | 72,5 | 67 |
| Tour de cheville (minimum) | 229 | 216 |
| Largeur bimalléolaire | 75 | 67 |
| Hauteur de la malléole externe | 73 | 63 |
| Tour du mollet | 392 | 373 |

Hauteur du dessus du pied : ≈ 26 % de la longueur à mi-pied, ≈ 34 mm au métatarse (études de conception de formes de chaussure). Contrôle sur le maillage : tour de cheville à 12 cm du sol = 229 mm homme / 215 mm femme (ANSUR : 229 / 216) ; pied = 270 × 101 mm homme, 246 × 92 mm femme.

Tables en tête de `sockShape.ts` : `BACK_PROFILE`, `FRONT_PROFILE` (profils de côté), `LEG_WIDTH`, `FOOT_WIDTH` (demi-largeurs intérieur/extérieur). Ne pas les exposer dans l'interface.

## Points clés

- **La géométrie est anatomique, la texture est la grille.** Le pied a une vraie longueur de pied (271 mm homme, 246 mm femme) ; la hauteur de tige suit le nombre de rangs (raccourcir la tige abaisse le haut, le pied ne bouge pas).
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

