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
  SockDesign (réglages) ────┤  design.pattern = carreaux | composition
                            ▼
  core/patternSource.ts computePatternRgb(...)  → RVB zone motif
       ├─ carreaux     → layout.samplePattern
       └─ composition  → composition.renderComposition
                            ▼
  core/quantize.ts    quantize(colors, settings)        → palette + index par maille
  core/grid.ts        composeGrid(...)                  → StitchGrid (palette + colorIndex + zone)
  core/checks.ts      analyse(grid, limits)             → alertes (couleurs/rang, flottés, raccord)
                            │
            ┌───────────────┼──────────────────────┐
            ▼               ▼                      ▼
  render/sock3d/          ui/flatView.ts        io/export*.ts
  (forme anatomique,      (canvas 2D, zoom,     (PNG 1px=1maille,
   atlas, maille,          repères)              PNG lisible, PNG 3D)
   MeshPhysical + studio)
            ▼
  render/scene.ts         scène studio (environnement, ombres, tone mapping Neutral)
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
    calepinage.ts        moteur multi-motifs (réf. reference/calepinage/)
    collections.ts       catalogue, recolorSvg, palettes (réf. reference/collections/)
    quantize.ts          réduction de couleurs, nettoyage
    checks.ts            contrôles de fabrication
    color.ts             utilitaires couleur (hex ↔ rgb, distance)
  render/                Three.js
    scene.ts
    sock3d/              module de chaussette anatomique (réf. `reference/sock3d/`)
      sockShape.ts       forme pure
      sockAtlas.ts       atlas couleur pur
      knitMaps.ts        relief jersey pur
      sockObject.ts      Mesh + MeshPhysicalMaterial
      studio.ts          lumière, cadrage, capture (+ beforeRender)
    decor/               sol/mur carreaux de ciment (réf. `reference/decor/`)
      tileSurface.ts     textures + createDecor / faceCamera
    decorController.ts   sync différé, sources, ombre studio
    views.ts             angles de caméra prédéfinis pour les exports (T20 → studio)
  ui/                    DOM
    panel.ts             construction du panneau
    controls.ts          petits composants (curseur+champ, sélecteur couleur, liste de carreaux)
    kit/                 système de design léger V11 (icônes Lucide, bouton, menu, tooltip, toast, dialog, disclosure)
    flatView.ts          vue à plat
  io/
    tiles.ts             import PNG/SVG
    catalogue.ts         charge public/carreaux/ (collections + calepinages)
    exportPng.ts         exports images
    project.ts           enregistrer / ouvrir un projet
tests/
  unit/                  Vitest (src/core surtout)
  e2e/                   Playwright
public/fixtures/         carreaux d'exemple (dessins de test originaux)
public/carreaux/         copie sync du simulateur de carreaux (npm run sync:carreaux)
worker/                  Cloudflare Worker (API `/api/*`, D1, secrets)
migrations/              SQL D1 (favoris, …)
```

## Worker Cloudflare (favoris)

- `wrangler.jsonc` : `main` = `worker/index.ts`, assets = `dist/` avec `binding: ASSETS` et `run_worker_first: ["/api/*"]`. Les pages et les liens `#p=` restent des fichiers statiques.
- D1 `DB` + secret `MOT_DE_PASSE` (en-tête `X-Mot-De-Passe`, comparaison à temps constant). Local : `.dev.vars` (gitignoré).
- `npm run dev` = Vite seul ; `npm run dev:api` = build + wrangler (assets + API + D1 local).

## Points de conception importants

### Calepinage maille par maille
On ne dessine pas le calepinage dans une grande image puis on la réduit : on calcule directement, pour chaque maille `(col, rang)` d'une zone motif, quel carreau et quel point du carreau elle couvre (après décalage, joint, quinconce, rotation, miroir). On échantillonne le carreau sur l'empreinte de la maille (sur-échantillonnage 4×4 par exemple) puis on prend la couleur majoritaire ou moyenne. Avantages : exact, testable, pas de flou.

L'axe horizontal est **circulaire** : la colonne `needles` est la colonne `0`. Les rangs du pied continuent la numérotation du motif de la tige (option `patternOnFoot`).

### Orientation des colonnes
La colonne 0 est sur le **côté intérieur** de la jambe. Colonnes `[0, needles/2)` = arrière (talon, semelle) ; `[needles/2, needles)` = avant (devant, cou-de-pied). Le talon et la pointe occupent la moitié `[0, needles/2)` dans la grille à plat (la pointe peut être tricotée côté dessus selon la machine : à confirmer, la convention reste modifiable en un seul endroit). La vue « face » regarde la colonne `3·needles/4`.

### Rapport de maille
`stitchAspect = stitchesPerCm / rowsPerCm` (≈ 0,75). Un carreau carré de `W` mailles de large fait donc `round(W / aspect)` rangs de haut. La vue à plat et la 3D dessinent les mailles à ce rapport.

### Maillage 3D anatomique (module `sock3d`)
Le maillage n’est plus « 1 quad par maille » : la géométrie suit une forme portée par **loft** (profils arrière/avant ANSUR II + largeurs asymétriques), semelle à plat, talon arrondi, pointe fermée. La correspondance motif ↔ surface passe par `fabricAt` + atlas (`sockAtlas.ts`) : chaque texel d’atlas lit la maille de la `StitchGrid`. Le relief jersey et le chevron sont dans `sockObject.ts`. Référence visuelle : `reference/sock3d/captures/`.

Réglages d’**aperçu du talon** (V3) : `zones.heelHeightMm` / `heelDepthMm` / `heelSpread` (mm et %) sont passés à `SockShapeInput` ; ils reconstruisent atlas + UV (compteur `geometryBuilds`) sans changer la grille de tricot.

### Performances
- Budget : recalcul complet < 300 ms pour 200 aiguilles × 600 rangs ; rendu 3D fluide (60 i/s) pendant la rotation.
- Recalcul déclenché avec un anti-rebond (~120 ms) pendant qu'on déplace un curseur.
- Le maillage n'est reconstruit que si les dimensions changent ; sinon on ne met à jour que la texture.
- Si le recalcul dépasse le budget : le déporter dans un Web Worker (T13).

### Captures 3D
Rendu hors écran (`WebGLRenderTarget` ou renderer dédié) à la taille demandée, caméra placée selon `render/views.ts`, fond uni ou transparent, puis `toBlob`. Le cadrage est automatique (boîte englobante) pour que la chaussette remplisse ~85 % de l'image.

### Crochet de test
`window.__SIM__` expose l'état utile aux tests e2e (prêt, dimensions de la grille, palette, dernière durée de recalcul, alertes) et quelques actions (`loadFixture(nom)`, `setDesign(partiel)`). Il n'est pas documenté pour l'utilisateur.
