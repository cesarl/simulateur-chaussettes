# Architecture

## Stack
- **Vite 8** (serveur de dev + build statique), **TypeScript 7** strict.
- **Three.js** (rendu 3D, `OrbitControls`).
- **Vitest** (tests unitaires de `src/core`), **Playwright** (tests de bout en bout dans Chromium, WebGL logiciel SwiftShader).
- Interface en DOM natif + CSS (pas de React/Vue : l'interface est un panneau de formulaires, un framework n'apporterait rien).
- Aucune autre dépendance d'exécution. Seule exception envisageable : une petite lib ZIP pour l'export multi-vues (à justifier dans `DECISIONS.md`), sinon un fichier par vue.

## Chaîne de calcul

```
 Fichiers PNG/SVG
        │  io/tiles.ts (navigateur : rasterisation via <img> + canvas → RGBA)
        ▼
  TileAsset[] ──────────────┐
                            │
  SockDesign (réglages) ────┤
                            ▼
  core/grid.ts        buildZoneMap(dims, zones)        → quelle zone pour chaque maille
  core/layout.ts      samplePattern(tiles, layout, …)   → couleur RGB de chaque maille des zones motif
  core/quantize.ts    quantize(colors, settings)        → palette + index par maille
  core/grid.ts        composeGrid(...)                  → StitchGrid (palette + colorIndex + zone)
  core/checks.ts      analyse(grid, limits)             → alertes (couleurs/rang, flottés, raccord)
                            │
            ┌───────────────┼──────────────────────┐
            ▼               ▼                      ▼
  render/knitTexture.ts   ui/flatView.ts        io/export*.ts
  (DataTexture exacte     (canvas 2D, zoom,     (PNG 1px=1maille,
   + carte de mailles)     repères)              PNG lisible, PNG 3D)
            ▼
  render/sockGeometry.ts  maillage procédural, 1 quad par maille, UV = (col/aiguilles, rang/rangs)
  render/scene.ts         scène, lumière, caméra, captures
```

Règle d'or : **tout ce qui est dans `src/core/` est pur** (entrées → sorties, pas de DOM, pas de Three.js, pas d'aléatoire non initialisé). C'est ce qui permet de le tester sans navigateur.

## Arborescence

```
config/sizes.json        valeurs de tailles et limites machine (provisoires, à confirmer)
src/
  main.ts                assemblage : état → recalcul → rendu
  state.ts               store minimal (état SockDesign + abonnés), sérialisation JSON
  core/                  logique pure, testée
    types.ts             contrat de données
    sizes.ts             tailles, jauge, bornes
    grid.ts              zones + composition de la grille
    layout.ts            calepinage et échantillonnage maille par maille
    quantize.ts          réduction de couleurs, nettoyage
    checks.ts            contrôles de fabrication
    color.ts             utilitaires couleur (hex ↔ rgb, distance)
  render/                Three.js
    scene.ts
    sockGeometry.ts
    knitTexture.ts
    views.ts             angles de caméra prédéfinis pour les exports
  ui/                    DOM
    panel.ts             construction du panneau
    controls.ts          petits composants (curseur+champ, sélecteur couleur, liste de carreaux)
    flatView.ts          vue à plat
  io/
    tiles.ts             import PNG/SVG
    exportPng.ts         exports images
    project.ts           enregistrer / ouvrir un projet
tests/
  unit/                  Vitest (src/core surtout)
  e2e/                   Playwright
public/fixtures/         carreaux d'exemple (dessins de test originaux)
```

## Points de conception importants

### Calepinage maille par maille
On ne dessine pas le calepinage dans une grande image puis on la réduit : on calcule directement, pour chaque maille `(col, rang)` d'une zone motif, quel carreau et quel point du carreau elle couvre (après décalage, joint, quinconce, rotation, miroir). On échantillonne le carreau sur l'empreinte de la maille (sur-échantillonnage 4×4 par exemple) puis on prend la couleur majoritaire ou moyenne. Avantages : exact, testable, pas de flou.

L'axe horizontal est **circulaire** : la colonne `needles` est la colonne `0`. Les rangs du pied continuent la numérotation du motif de la tige (option `patternOnFoot`).

### Orientation des colonnes
La colonne 0 est sur le **côté intérieur** de la jambe. Colonnes `[0, needles/2)` = arrière (talon, semelle) ; `[needles/2, needles)` = avant (devant, cou-de-pied). Le talon et la pointe occupent la moitié `[0, needles/2)` dans la grille à plat (la pointe peut être tricotée côté dessus selon la machine : à confirmer, la convention reste modifiable en un seul endroit). La vue « face » regarde la colonne `3·needles/4`.

### Rapport de maille
`stitchAspect = stitchesPerCm / rowsPerCm` (≈ 0,75). Un carreau carré de `W` mailles de large fait donc `round(W / aspect)` rangs de haut. La vue à plat et la 3D dessinent les mailles à ce rapport.

### Maillage 3D procédural (pas de modèle importé)
Le maillage est généré à partir des dimensions : une grille de `(aiguilles+1) × (rangs+1)` sommets, dont la position est donnée par une fonction `position(col, rang)` qui suit la forme d'une chaussette portée :
- tige verticale (légère forme de mollet), axe qui se courbe au talon, pied horizontal, pointe arrondie ;
- **talon** : pendant les rangs du talon, seules les aiguilles de la moitié arrière tricotent. Côté avant (cou-de-pied), ces rangs ont une hauteur nulle (sommets confondus) ; côté arrière, ils forment la poche du talon. C'est exactement la géométrie d'une vraie chaussette : l'avant du coude est court, l'arrière est long. Même logique pour la pointe ;
- UV = `(col / aiguilles, rang / rangsTotal)` : la texture couleur est la grille elle-même, sans conversion.

Ainsi une maille de la grille correspond exactement à un quad du maillage, et le motif est forcément bien placé.

### Texture de mailles
- `map` : `DataTexture` de la grille (aiguilles × rangs), `NearestFilter`, sRGB.
- Détail de maille : petites textures générées par programme (un « V » de jersey : carte de normales + occlusion), répétées `(aiguilles, rangs)` fois via `texture.repeat` (Three.js gère une transformation par texture).
- Bord-côte : autre motif de relief (côtes 1×1 ou 2×2 verticales).
- Amélioration (T14) : shader qui déforme la frontière entre deux mailles en chevron pour imiter l'emboîtement réel des V.

### Performances
- Budget : recalcul complet < 300 ms pour 200 aiguilles × 600 rangs ; rendu 3D fluide (60 i/s) pendant la rotation.
- Recalcul déclenché avec un anti-rebond (~120 ms) pendant qu'on déplace un curseur.
- Le maillage n'est reconstruit que si les dimensions changent ; sinon on ne met à jour que la texture.
- Si le recalcul dépasse le budget : le déporter dans un Web Worker (T13).

### Captures 3D
Rendu hors écran (`WebGLRenderTarget` ou renderer dédié) à la taille demandée, caméra placée selon `render/views.ts`, fond uni ou transparent, puis `toBlob`. Le cadrage est automatique (boîte englobante) pour que la chaussette remplisse ~85 % de l'image.

### Crochet de test
`window.__SIM__` expose l'état utile aux tests e2e (prêt, dimensions de la grille, palette, dernière durée de recalcul, alertes) et quelques actions (`loadFixture(nom)`, `setDesign(partiel)`). Il n'est pas documenté pour l'utilisateur.
