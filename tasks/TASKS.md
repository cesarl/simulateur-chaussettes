# Liste des tâches — à traiter dans l'ordre

Légende : `[ ]` à faire · `[~]` en cours · `[x]` terminée · `[!]` bloquée (voir `docs/PROGRESS.md`)

Chaque tâche est terminée seulement quand **tous** ses critères sont cochés ET que `npm run verify` passe. Voir `.cursor/rules/10-workflow.mdc` pour la boucle de travail.

---

## Jalon 1 — démo fabricant (lundi)

### [x] T01 — Prise en main du squelette
**Objectif** : vérifier que l'environnement fonctionne avant d'écrire du code.
- Lire `docs/CAHIER_DES_CHARGES.md`, `docs/ARCHITECTURE.md`, `src/core/types.ts`, `config/sizes.json`.
- `npm install`, puis `npx playwright install chromium` si le navigateur de test manque.
- Lancer `npm run verify`.

**Critères**
- [x] `npm run verify` passe sans modification du code.
- [x] `docs/PROGRESS.md` contient une entrée T01 avec la version de Node et le résultat.

---

### [x] T02 — Carte des zones et composition de la grille (`src/core/grid.ts`, `src/core/color.ts`)
**Objectif** : produire une `StitchGrid` complète, sans motif (tige et pied remplis d'une couleur de fond).
- `color.ts` : `hexToRgb`, `rgbToHex`, `colorDistance` (distance perceptuelle simple, ex. « redmean » ou Lab).
- `grid.ts` :
  - `rowRanges(dims, zones)` → début/fin de chaque zone en rangs (bord-côte absent = 0 rang) ;
  - `buildZoneMap(dims, zones)` → `Uint8Array` (valeurs `Zone`). Talon et pointe n'occupent que la moitié des aiguilles ; l'autre moitié vaut `Zone.Empty`. **Convention** (à rappeler en tête de fichier) : la colonne 0 est sur le côté intérieur de la jambe ; colonnes `[0, needles/2)` = arrière (talon, semelle), `[needles/2, needles)` = avant (devant de jambe, cou-de-pied). Le raccord circulaire tombe donc sur le côté intérieur, le moins visible ;
  - `composeGrid(dims, zones, patternColors | null, patternPalette)` → `StitchGrid` : palette = couleurs de zones + palette du motif, sans doublons.

**Critères**
- [x] Tests : hauteur totale = somme des zones ; sans bord-côte, la ligne 0 est dans la tige ; talon exactement `needles/2` mailles actives par rang ; couleurs de zones présentes dans la palette ; aucune couleur en double.
- [x] Aucune dépendance au DOM ni à Three.js dans `src/core`.

---

### [x] T03 — Import des carreaux (`src/io/tiles.ts`, début de `src/ui/`, `src/state.ts`)
**Objectif** : pouvoir importer des PNG/SVG et les voir dans le panneau.
- `state.ts` : store minimal (`getState`, `update(partiel)`, `subscribe`), état initial = design par défaut (taille homme, calepinage grille, 4 couleurs auto, bord-côte présent).
- `tiles.ts` : `loadTileFromFile(File)` et `loadTileFromUrl(url)` → `TileAsset`. SVG : rasterisé à 512 px de côté minimum en gardant les proportions. PNG : taille native (réduite à 1024 px max).
- Panneau : section « Carreaux » avec bouton d'import (multi-fichiers), glisser-déposer sur le panneau, vignettes, suppression, ordre (monter/descendre), bouton « Charger un exemple » (fixtures).
- `window.__SIM__.loadFixture(nom)` pour les tests.

**Critères**
- [x] e2e : importer `public/fixtures/carreau-test-etoile.svg` via l'input fichier → 1 vignette visible (`data-testid="tile-thumb"`).
- [x] e2e : importer 2 fichiers d'un coup → 2 vignettes ; supprimer → 1.
- [x] Un fichier non image affiche un message d'erreur lisible, sans exception console.

---

### [x] T04 — Calepinage (`src/core/layout.ts`)
**Objectif** : calculer la couleur de chaque maille des zones motif.
- `samplePattern(tiles, layout, dims, zones, sampling)` → `Uint8ClampedArray` RGB (ou RGBA) de taille `needles × rangsMotif`, où rangsMotif = rangs de tige (+ rangs du pied si `patternOnFoot`).
- Implémenter tous les `LayoutKind` de `types.ts`, le joint (couleur `gapColor`), le décalage, la rotation globale, la graine (générateur pseudo-aléatoire déterministe, ex. mulberry32).
- Horizontal circulaire (modulo `needles`).
- Sur-échantillonnage de l'empreinte de chaque maille (4×4 par défaut), couleur majoritaire ou moyenne. Les pixels transparents d'un PNG prennent la couleur de fond du carreau (1er pixel opaque du coin, ou blanc cassé), à documenter.
- `tileRowsForWidth(tileStitches, aspect)` pour l'option « garder les proportions ».
- `repeatWidth(layout)` et `seamMismatch(layout, needles)` (reste de la division) + `nearestFittingWidth(...)`.

**Critères**
- [x] Tests avec des carreaux synthétiques (ex. 2×2 pixels de 4 couleurs) : grille, quinconce-h (décalage d'une demi-largeur sur les rangées impaires), quinconce-v, rotation-4, miroir-4, damier (A/B alternés), rotation-aléatoire (même graine = même résultat, graine différente = résultat différent).
- [x] Test : joint de 1 maille → colonne de couleur `gapColor` au bon endroit.
- [x] Test : `seamMismatch` = 0 quand la répétition divise `needles`, `nearestFittingWidth` retourne un diviseur.
- [x] Test de performance : 200 × 600 mailles en < 200 ms (Vitest, marge ×2 tolérée en CI).

---

### [ ] T05 — Réduction des couleurs (`src/core/quantize.ts`)
**Objectif** : passer en « gros pixels » avec N couleurs.
- Mode auto : k-means déterministe (initialisation k-means++ avec graine fixe, ou médiane-coupe), N entre 2 et 8.
- Mode manuel : chaque maille prend la couleur de palette la plus proche.
- `despeckle` : une maille dont les 4 voisines (horizontal circulaire) ont toutes une autre couleur commune prend cette couleur.
- Retourne `{ palette: Hex[], indices: Uint8Array, counts: number[] }`, palette triée par nombre de mailles décroissant.

**Critères**
- [ ] Tests : image à 3 couleurs pures + N=3 → exactement ces 3 couleurs ; N=2 → 2 couleurs ; mode manuel respecté ; résultat identique à chaque appel ; despeckle retire une maille isolée et ne touche pas une ligne de 2 mailles.

---

### [ ] T06 — Maillage 3D de la chaussette (`src/render/sockGeometry.ts`)
**Objectif** : une chaussette portée, 1 quad par maille, UV exactes. Suivre la section « Maillage 3D procédural » de `ARCHITECTURE.md`.
- Séparer la fonction pure de positions (`sockPositions(dims, zones) → Float32Array`, testable) de la création de `BufferGeometry`.
- Échelle réelle (en mètres : 1 maille = `0,01 / stitchesPerCm` m de large). Forme : tige presque cylindrique (tour = aiguilles / mailles-par-cm), talon en poche arrière, pied horizontal un peu aplati (semelle plate), pointe arrondie fermée.
- Normales calculées, pas de faces retournées, ouverture en haut de la tige visible.
- Remplacer le cylindre provisoire de `main.ts`.

**Critères**
- [ ] Tests (Vitest, sans WebGL) : nombre de sommets = `(needles+1)·(rows+1)` ; UV dans [0,1] ; la colonne `needles` a la même position que la colonne 0 (fermeture) ; les rangs du talon côté avant ont une hauteur quasi nulle ; aucune coordonnée NaN.
- [ ] e2e : la vue 3D affiche la chaussette (canvas non uniforme) pour homme et femme ; capture d'écran enregistrée dans `test-results/` pour contrôle visuel par l'agent.
- [ ] L'agent a regardé cette capture (outil de lecture d'image) et décrit le résultat dans `PROGRESS.md` (forme reconnaissable : tige, talon, pied, pointe).

---

### [ ] T07 — Texture de mailles (`src/render/knitTexture.ts`)
**Objectif** : la grille devient une vraie texture tricotée.
- `DataTexture` de la grille (NearestFilter, sRGB, `needsUpdate` à chaque recalcul, sans recréer la géométrie).
- Texture de détail procédurale d'une maille jersey (V) : carte de normales + occlusion ambiante, générée sur canvas, répétée `(needles, rows)`. Mipmaps et anisotropie max pour éviter le moiré.
- Bord-côte : relief de côtes verticales.
- Matériau `MeshStandardMaterial` (rugosité élevée, pas de reflet plastique), `side: DoubleSide`, intérieur plus sombre.

**Critères**
- [ ] e2e : capture d'écran zoomée — l'agent vérifie visuellement qu'on distingue les mailles (et non des carrés plats) ; description dans `PROGRESS.md`.
- [ ] Changer une couleur de zone met à jour la texture sans reconstruire la géométrie (compteur exposé dans `__SIM__`).
- [ ] Aucun avertissement WebGL dans la console.

---

### [ ] T08 — Panneau de réglages complet (`src/ui/panel.ts`, `src/ui/controls.ts`)
**Objectif** : tous les réglages du cahier des charges (§4.5 à §4.8) branchés sur le store, recalcul automatique.
- Sections repliables : Carreaux · Calepinage · Dimensions · Gros pixels · Zones · Contrôles · Exports.
- Curseurs couplés à des champs numériques, sélecteurs de couleur, listes déroulantes. Libellés en français, unités affichées (mailles, rangs, cm).
- Tige bornée au max de la taille (message si on tente de dépasser).
- Anti-rebond ~120 ms ; durée du dernier recalcul affichée discrètement.
- Chaque contrôle a un `data-testid` stable (ex. `ctl-layout-kind`, `ctl-tile-width`, `ctl-max-colors`, `ctl-cuff-enabled`, `ctl-cuff-color`, `ctl-heel-color`, `ctl-toe-color`, `ctl-size`).

**Critères**
- [ ] e2e : charger un exemple, passer en quinconce, 3 couleurs, taille femme → `__SIM__` reflète ces valeurs, la palette du motif a ≤ 3 couleurs.
- [ ] e2e : décocher le bord-côte → nombre de rangs diminue de `cuffRows`.
- [ ] e2e : tenter une tige plus haute que le max → valeur ramenée au max.

---

### [ ] T09 — Vue à plat (`src/ui/flatView.ts`)
**Objectif** : afficher la grille de mailles pour contrôle.
- Bascule « 3D / À plat » au-dessus de la vue. Canvas 2D, mailles au rapport réel, zoom (molette) et déplacement (glisser), quadrillage visible au-delà d'un certain zoom, repères de zones à gauche, numéros tous les 10 rangs/mailles.
- Survol : affiche (maille, rang, zone, couleur).

**Critères**
- [ ] e2e : bascule vers la vue à plat, canvas visible, retour en 3D sans erreur.
- [ ] La couleur d'une maille lue sur le canvas (sans quadrillage) correspond à celle de la grille (test via `__SIM__`).

---

### [ ] T10 — Exports PNG (`src/io/exportPng.ts`, `src/render/views.ts`)
**Objectif** : produire les fichiers pour le fabricant et l'IA d'image.
- Vues : face, trois-quarts, profil extérieur, dos, profil intérieur. Cases à cocher, taille (1024/2048/4096), fond (couleur ou transparent).
- Rendu hors écran à la taille demandée, cadrage automatique, sans modifier la vue de l'utilisateur.
- Plat exact (1 px = 1 maille), plat lisible (×8 min., rapport de maille, quadrillage, zones, légende palette + nombre de mailles).
- Un téléchargement par fichier (délai court entre les fichiers), noms `<modele>_<taille>_<vue>.png`.

**Critères**
- [ ] e2e (événement `download` de Playwright) : export « face » 1024 → fichier PNG 1024×1024 ; export plat exact → PNG de `needles × rows` pixels ; l'image plat exact ne contient pas plus de couleurs que la palette.
- [ ] L'agent ouvre les PNG exportés (outil de lecture d'image) et confirme dans `PROGRESS.md` que le cadrage et le fond sont corrects.
- [ ] **Jalon 1 atteint** : entrée récapitulative dans `PROGRESS.md` + mise à jour du `README.md` (section « Utilisation »).

---

## Jalon 2 — outil de travail

### [ ] T11 — Enregistrer / ouvrir un projet (`src/io/project.ts`)
- Export `.json` : `SockDesign` + carreaux (PNG en base64). Import avec validation (version, champs) et message clair si le fichier est invalide.
- Sauvegarde automatique du dernier état dans IndexedDB (try/catch : si indisponible, l'application fonctionne quand même).

**Critères** : test unitaire aller-retour sérialisation ; e2e enregistrer → recharger la page → ouvrir → même grille (comparaison d'empreinte de la grille).

### [ ] T12 — Contrôles de fabrication (`src/core/checks.ts` + section « Contrôles »)
- Couleurs totales et par rang vs `MACHINE_LIMITS`, flottés > `maxFloat` (horizontal circulaire, zones motif seulement), raccord circulaire.
- Pastilles vert/orange dans le panneau, surlignage des flottés dans la vue à plat, bouton « ajuster la largeur pour que le motif tombe juste ».

**Critères** : tests unitaires sur grilles synthétiques (flotté de 8 détecté avec seuil 7, flotté de 7 accepté, raccord) ; e2e : le bouton d'ajustement ramène le décalage à 0.

### [ ] T13 — Performances
- Mesurer le recalcul (200 aiguilles × 600 rangs, 2 carreaux, 6 couleurs). S'il dépasse 300 ms : déplacer layout + quantize dans un Web Worker (module Vite `?worker`), annuler les calculs périmés.
- Vérifier que la rotation 3D reste fluide pendant un recalcul.

**Critères** : durée mesurée notée dans `PROGRESS.md` avant/après ; e2e : 10 changements rapides de curseur → état final cohérent, pas d'erreur.

### [ ] T14 — Fidélité des mailles (shader chevron)
- Via `onBeforeCompile` du `MeshStandardMaterial` : à l'intérieur de chaque maille, décaler la lecture de couleur pour que la frontière verticale entre deux mailles suive la forme en V. Option « rendu simple / rendu fidèle » dans le panneau.

**Critères** : captures avant/après examinées et décrites ; aucune régression des tests d'export (le plat exact ne dépend pas du shader).

### [ ] T15 — Export BMP indexé et planche
- BMP 8 bits indexé, 1 px = 1 maille (format courant des logiciels jacquard — à confirmer avec le fabricant).
- Planche PNG : 4 vues + grille à plat + palette sur une seule image, titre du modèle.

**Critères** : test unitaire de l'en-tête BMP (taille, palette, lignes de bas en haut, remplissage à 4 octets) ; e2e téléchargement.

## Jalon 3 — finitions

### [ ] T16 — Finitions de l'interface
- Raccourcis (R : réinitialiser la vue, F : face…), bulles d'aide sur chaque réglage (vocabulaire du tricot expliqué simplement), état vide accueillant, responsive ≥ 1280 px, accessibilité clavier des contrôles.

### [ ] T17 — Intégration continue et publication
- Workflow GitHub Actions `npm ci && npx playwright install --with-deps chromium && npm run verify` (le fichier `.github/workflows/ci.yml` existe déjà : le vérifier).
- Documenter dans `README.md` le déploiement du dossier `dist/` (Cloudflare Pages ou GitHub Pages), sans le faire.

### [ ] T18 — Valeurs fabricant
- Quand `config/sizes.json` est mis à jour par César (valeurs confirmées), relancer tous les tests, ajuster ceux qui dépendaient des anciennes valeurs, régénérer les captures de référence.
