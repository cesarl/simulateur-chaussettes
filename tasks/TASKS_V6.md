# Tâches V6 — collections locales et composition libre

Demande de César :
1. **Ajouter facilement des collections et des images** sans passer par le simulateur de carreaux, avec une petite interface (usage local, par César).
2. **Composition libre** (pour César et des amis de la mode) : poser une ou plusieurs images (PNG, SVG) où l'on veut sur la chaussette déroulée — déplacer, tourner, redimensionner, miroir, fond — avec la 3D en direct à côté. **Pas d'upload sur un serveur** : les images importées sont enregistrées **dans le fichier projet (.json)**. Le lien de partage marche tant que la composition n'utilise que des images de la bibliothèque (collections).
3. **Ne rien casser côté carreaux** : le mode carreaux (calepinage) reste strictement identique.

Module de référence fourni et testé : `reference/composition/composition.ts` (+ `tests/unit/composition.test.ts`) — modèle, rendu en mailles avec tour circulaire et proportions réelles, sélection, poignées, ordre des calques. **L'intégrer, ne pas le réécrire.**

## Règles propres à cette série (économiser du temps et des jetons)
- Travailler sur une branche `v6-composition` ; une pull request à la fin (César vérifiera l'aperçu Cloudflare de la branche avant de fusionner).
- **Vérification allégée pendant les tâches** : `npm run typecheck`, `npm test` (unitaires) et **seulement les tests e2e concernés** (`npx playwright test tests/e2e/<fichier>`). `npm run verify` complet **une seule fois par jalon** (fin de T43, fin de T47, fin de T49).
- Nouveaux tests e2e : **au plus un fichier par tâche**, court (un scénario principal). Pas de captures en e2e sauf celles demandées ; les captures visuelles se font via `window.__SIM__` + un petit script, ouvertes et décrites dans `PROGRESS.md`.
- Toujours : pas de question à César, décisions dans `DECISIONS.md`, un commit par tâche, `PROGRESS.md` à jour.

---

## Jalon A — sécurité et fondations (aucun changement visible)

### [x] T41 — Filet de sécurité léger (4 projets de référence)
- `tests/unit/golden.test.ts` : calcule l'empreinte (hash simple FNV-1a) de la `StitchGrid` pour **4 projets carreaux** couvrant l'essentiel, **par la chaîne pure** (sans navigateur ni e2e) :
  1. carreaux d'exemple, calepinage « à la suite » 3 motifs, homme, bord-côte ;
  2. collection `medina` du catalogue de test (`tests/fixtures/configurateur-mini`), préréglage `damier_4_random` graine 7, couleurs d'origine ;
  3. `lianes`, suggestion de l'artiste 1, femme, sans bord-côte, raccord « intérieur » ;
  4. quinconce + rotation aléatoire, 5 carreaux sur le tour, talon 40 mm.
- Les empreintes attendues sont **enregistrées une fois** (valeurs actuelles, avant toute modification) dans le test. Ensuite ce test ne doit **jamais** être modifié pour « faire passer » : s'il casse, c'est le code qu'on corrige.
- Si une partie de la chaîne dépend du DOM (pixelisation des SVG), utiliser des carreaux déjà pixelisés en fixtures PNG (lus avec `src/io/pngCodec.ts`) ou des images synthétiques générées dans le test.

**Critères** : [x] 4 empreintes enregistrées, test vert ; [x] commit **avant** toute autre modification de V6.

### [x] T42 — « Source de motif » (réorganisation invisible)
- Aujourd'hui `main.ts › recompute()` appelle directement `samplePattern(...)` (calepinage). Introduire une notion de **source de motif** dans l'état : `design.pattern = { kind: 'carreaux' } | { kind: 'composition', composition: Composition }` (défaut : `carreaux`). Les réglages carreaux existants restent où ils sont (`layout`, collection…) : on n'y touche pas.
- `src/core/patternSource.ts` : `computePatternRgb(state) → Uint8ClampedArray` qui aiguille vers `samplePattern` (carreaux) ou `renderComposition` (composition). `recompute()` n'appelle plus que cette fonction ; tout ce qui suit (réduction des couleurs, zones, talon, pointe, grille, 3D, exports) est inchangé.
- Projet .json et lien de partage : champ `pattern` absent ⇒ `carreaux` (anciens projets et anciens liens toujours valides).

**Critères** : [ ] `golden.test.ts` vert sans modification ; [ ] test unitaire : un ancien projet (sans `pattern`) se charge en mode carreaux ; [ ] `npm run verify` complet vert (fin du jalon A).

## Jalon B — collections locales et outil d'administration

### [ ] T43 — Collections locales fusionnées par la synchronisation
- Dossier `collections-locales/` à la racine, **même format que le simulateur de carreaux** : `collections-locales/collections.json` (tableau de collections, mêmes champs : `id`, `nom`, `format`, `variations`, `layouts`, `defaut_layout`, `category`, `colors`, `artist_recommendations`…) et `collections-locales/svg/<ID>-VAR<n>.svg` **ou** `.png`.
- `scripts/sync-carreaux.mjs` : ajouter une seconde source facultative `--local collections-locales` (par défaut si le dossier existe). Fusion : les collections locales s'ajoutent ; en cas d'identifiant identique, **la locale gagne** (avertissement dans le rapport). Nouveau champ `source: 'carreaux' | 'locale'` dans le catalogue. Les PNG sont copiés tels quels (variation `file` en `.png`, `zones: []`).
- Nouvelle commande `npm run sync:local` = synchronisation **sans** le simulateur de carreaux (ne met à jour que la partie locale, garde le reste du catalogue existant).
- Côté application : une collection PNG n'a pas de zones → pas de recoloration ; ses couleurs de fil viennent de la réduction de couleurs automatique (k-means, N réglable) ; le panneau Couleurs l'indique (« couleurs figées : image PNG »).
- Tests : étendre `tests/unit/collections.test.ts` avec une mini collection locale (1 SVG + 1 PNG) dans `tests/fixtures/collections-locales-mini/`.

**Critères** : [ ] tests verts ; [ ] une collection locale apparaît dans le sélecteur avec la catégorie « Mes collections ».

### [ ] T44 — Outil d'administration des collections (mode dev, local)
Page `admin.html` (entrée Vite séparée, accessible seulement en mode dev ; lien « Gérer mes collections » en bas du panneau).
- **Ouvrir le dossier** `collections-locales/` avec l'API File System Access (`showDirectoryPicker`, Chrome/Edge). Sinon (Firefox/Safari) : mode « téléchargement » qui produit un .zip à décompresser dans le dossier.
- Liste des collections locales ; **Nouvelle collection** : nom (→ identifiant en majuscules sans accents), format (10×10, 15×15, 20×20), catégorie, glisser-déposer des fichiers SVG/PNG (ordre = VAR1, VAR2…, réordonnables), calepinages proposés (cases à cocher parmi la bibliothèque) et calepinage par défaut.
- **Zones automatiques pour les SVG** (comme la « Moulinette ») : si le SVG n'a pas de groupes `zone-N`, l'outil lit toutes les couleurs de remplissage (attributs `fill`, `style="fill:…"`, classes CSS d'Illustrator), regroupe les formes par couleur dans `<g id="zone-N" data-color-id="…">` (N par surface décroissante) et associe chaque couleur **au code du nuancier le plus proche** (distance « redmean » comme `sync-carreaux.mjs`). Aperçu avant/après côte à côte ; possibilité de changer le code nuancier d'une zone. Les couleurs de zones doivent être **cohérentes entre les variations** d'une même collection (même couleur ⇒ même zone).
- Palettes conseillées : éditeur simple (une ligne = une palette = un code par zone), enregistrées au format `artist_recommendations` (URL `…?zone-1=CODE&zone-2=CODE`).
- **Enregistrer** : écrit `collections.json` + fichiers dans `svg/`, puis affiche « Lancez `npm run sync:local` puis committez ». Validation avant écriture (identifiant unique, au moins une variation, codes nuancier connus).
- Traitement pur des SVG dans `src/core/svgZones.ts` (tests unitaires sur 2 SVG : un avec attributs `fill`, un avec classes CSS). Le DOM n'est utilisé que dans la page.

**Critères** : [ ] tests unitaires `svgZones` verts ; [ ] e2e court : créer une collection de 2 SVG en mode téléchargement → le .zip contient `collections.json` et 2 SVG avec des groupes `zone-N` ; [ ] captures de la page d'admin décrites dans `PROGRESS.md` ; [ ] `npm run verify` complet vert (fin du jalon B).

## Jalon C — composition libre

### [ ] T45 — Moteur de composition branché
- Copier `reference/composition/composition.ts` dans `src/core/composition.ts` ; `tests/unit/composition.test.ts` fourni doit passer (imports adaptés).
- `computePatternRgb` (T42) : mode composition → images pixelisées (SVG de collection **recolorés avec la palette choisie**, SVG/PNG embarqués décodés), puis `renderComposition` ; gauge = aiguilles, rangs de motif (tige + pied si le motif continue), jauges.
- Cache des images pixelisées par `assetKey` + couleurs + taille ; recalcul < 300 ms pour 5 calques sur 168 × 380 (sinon worker, comme T13).
- Couleurs de fil en mode composition : couleurs de zones des SVG utilisés + fond + réduction de couleurs des PNG (N réglable, défaut 4) ; alerte si le total dépasse `maxColorsTotal`.

**Critères** : [ ] tests verts ; [ ] `golden.test.ts` inchangé et vert.

### [ ] T46 — Éditeur 2D (vue à plat) + 3D côte à côte
- Bascule en haut du panneau : **« Carreaux » / « Composition »**. En mode composition, la zone d'affichage montre **la vue à plat éditable à gauche et la 3D à droite** (redimensionnables par une poignée verticale ; sous 1280 px : l'une au-dessus de l'autre).
- Vue à plat éditable (canvas, sur la grille de mailles au rapport réel) :
  - zones grisées non modifiables : bord-côte, talon, pointe ; repères devant / dos / côtés ; ligne du raccord ;
  - **sélection** au clic (`hitTest`), cadre + 4 poignées d'échelle (les proportions de l'image sont toujours conservées) + 1 poignée de rotation (Maj = pas de 15°) ; **glisser** pour déplacer (tour circulaire : ce qui sort à droite revient à gauche) ; molette = zoom de la vue, glisser avec clic droit ou barre d'espace = déplacer la vue ;
  - clavier : flèches = 1 maille (Maj = 10), Suppr = supprimer, Ctrl+D = dupliquer, Ctrl+Z / Ctrl+Maj+Z (historique existant), [ ] = descendre / monter d'un cran ;
  - aimantation douce sur le milieu du devant, le milieu du dos et les côtés (désactivable).
- Panneau « Calques » : liste (vignette, nom), visibilité, verrou, ordre (glisser ou boutons), et pour le calque sélectionné : X, Y (mailles), largeur (mailles et cm), rotation (°), miroir H/V, « répéter tout autour » + écart. Fond : couleur (nuancier ou libre).
- « Ajouter une image » : **bibliothèque** (collections : toutes les variations, recolorées avec la palette choisie) ou **import** PNG/SVG (plusieurs à la fois, glisser-déposer sur la vue à plat) ; une image importée est ajoutée aux « images du projet » (`EmbeddedAsset`) ; PNG > 2 Mo : redimensionné à 1024 px de côté.
- La 3D se met à jour en direct pendant les déplacements (anti-rebond 60 ms ; aperçu approximatif pendant le glisser, calcul exact au relâcher si nécessaire).

**Critères** : [ ] e2e court : mode composition → ajouter une image de la bibliothèque → la déplacer au clavier (flèche ×10) → l'empreinte de la grille change ; supprimer → grille = fond seul ; [ ] captures (vue à plat éditable + 3D) avec 2 calques dont un tourné, ouvertes et décrites.

### [ ] T47 — Projet avec images embarquées, lien quand c'est possible
- Fichier projet (.json) : version 2 = version 1 + `pattern` + `assets: EmbeddedAsset[]` (seulement les images utilisées : `usedEmbeddedAssets`). Lecture des versions 1 et 2. Taille affichée avant l'enregistrement ; avertissement au-delà de 20 Mo.
- Ouvrir un projet : restaure calques et images (aucun réseau). Sauvegarde automatique locale : si trop lourde pour le stockage du navigateur, ne garder que les réglages et prévenir (« images non sauvegardées automatiquement : enregistrez le projet »).
- Lien de partage : si `isLinkShareable(composition)` → lien normal (les calques ne référencent que la bibliothèque, quelques dizaines de caractères chacun) ; sinon bouton désactivé avec l'explication « Cette composition contient des images importées : envoyez le fichier projet (.json) ». La visionneuse ouvre correctement une composition partagée par lien.
- Exports PNG, BMP, planche : inchangés (ils partent de la grille).

**Critères** : [ ] test unitaire aller-retour projet v2 avec 1 PNG + 1 SVG embarqués ; [ ] test unitaire : projet v1 toujours lisible ; [ ] e2e court : composition avec image de la bibliothèque → lien → visionneuse identique ; [ ] `npm run verify` complet vert (fin du jalon C).

## Jalon D — finitions

### [ ] T48 — Aides et garde-fous « jacquard »
- En mode composition : alerte si une image a des détails plus fins qu'une maille (proportion de mailles isolées après réduction), si le nombre de couleurs de fil dépasse la limite machine, si des flottés sont trop longs (contrôles existants).
- Bouton « Aperçu gros pixels » sur le calque sélectionné (sa vignette pixelisée à la taille réelle en mailles).
- Petit guide (bulle « ? ») : « Préférez des dessins en aplats (SVG) ; les photos passent mal en 4 à 6 couleurs de fil. »

### [ ] T49 — Bilan V6
- README : collections locales (dossier, `npm run sync:local`, page d'admin), mode composition (raccourcis, projet .json avec images, quand le lien fonctionne).
- « Point pour César » dans `PROGRESS.md` : captures (admin, composition 2D + 3D, visionneuse), décisions à relire, limites connues.
- `npm run verify` complet vert ; ouvrir la pull request `v6-composition` avec un résumé et les captures.
