# Tâches V7 — tout en calques (Fond, Motif, Image)

## Demande de César

Supprimer les deux modes séparés « Carreaux » et « Composition ». Une chaussette devient une **pile de calques** :

- **Fond** : une couleur, toujours en bas.
- **Motif** : les carreaux avec toutes les options actuelles (collection, couleurs, palettes conseillées, calepinage, taille, raccord, joint, décalage). On peut en mettre plusieurs. Chacun couvre toute la surface ou seulement une bande de rangs.
- **Image** : un PNG ou un SVG posé librement, déplacé, tourné et redimensionné **à la souris**.

Tous les calques se cachent et se réordonnent. Chacun peut **rendre certaines de ses couleurs transparentes** : par exemple, le blanc d'un motif jaune et blanc laisse voir le calque du dessous.

Écran (mode dev) : vue 2D avec poignées, vue 3D, options du projet (Chaussette, Décor, Export), options du calque sélectionné, et **liste des calques toujours visible en bas**, repliable et **sans ascenseur**.

## Défauts constatés en V6, à corriger

1. Les boutons de la vue 3D chevauchent « Importer » et « Bibliothèque ».
2. « Bibliothèque » ne fait rien de visible.
3. La 3D est déformée. Cause : la scène observe `#viewport` en entier (`createScene(viewport)`) alors que le canvas n'occupe qu'une colonne, donc `camera.aspect` est faux.
4. La liste des calques demande de faire défiler.
5. Une image ne s'édite qu'avec des champs texte : il n'y a pas de poignées.
6. La vue 2D dessine des rectangles au lieu des images.

**Leçon de V6** : des cases ont été cochées sans regarder l'écran. En V7, chaque tâche d'interface se vérifie :

- **avec la vraie souris** dans les tests e2e (`locator.click`, `page.mouse.down/move/up`, `dragTo`) — jamais en appelant `window.__SIM__` pour l'action testée ;
- **par une capture** de la zone concernée, ouverte et décrite dans `docs/PROGRESS.md` : ce qu'on voit, ce qui est aligné, ce qui déborde.

## Module de référence

Module testé à intégrer **sans le réécrire** (lire `reference/layers/README.md`) :

- `reference/layers/layers.ts` et `v1ShareDefaults.json` : modèle, empilement, transparence, bandes, poignées, migration V1 → V2, lien compact ;
- `reference/share/shareLink.ts` (version 2) : écrit `#p=2.`, lit `#p=1.` et `#p=2.` ;
- `tests/unit/layers.test.ts` : vert **dès maintenant** sur le code V6. Il contient les deux liens réels de César :
  - « Jardin d'Azur » en damier : empreinte `1751a01` ;
  - « Palm Beach » en aléatoire : empreinte `5e26e231` ;
- `tests/fixtures/liens/` et `scripts/rasterize-link-fixtures.mjs`.

## Règles de cette série

- Branche `v7-calques`, créée depuis `v6-composition` (V6 n'est pas fusionnée ; V7 la remplace). Une pull request à la fin.
- **Intouchables** : `tests/unit/golden.test.ts` (T41), les empreintes des liens dans `tests/unit/layers.test.ts`, et `v1ShareDefaults.json`. S'ils cassent, c'est le code qu'on corrige.
- Vérification allégée, comme en V6 :
  - pendant les tâches : `npm run typecheck`, `npm test`, et seulement les e2e concernés ;
  - `npm run verify` complet à la fin de chaque jalon ;
  - au plus **un** petit fichier e2e par tâche ;
  - les anciens e2e liés aux modes « carreaux / composition » sont **adaptés ou supprimés** (dire lesquels dans `PROGRESS.md`), pas contournés.
- Vocabulaire de l'interface :
  - « Motif » remplace « Carreaux » quand on parle du calque ;
  - « carreaux de ciment » reste pour le décor et les collections ;
  - « Calque », « Fond », « Image », « Bibliothèque ».
- Toujours :
  - aucune question à César ; décisions dans `docs/DECISIONS.md` ;
  - un commit par tâche ; `docs/PROGRESS.md` à jour ;
  - pas d'envoi d'image sur un serveur : les images restent dans le projet `.json`.

---

## Jalon A — le modèle en calques, sans changement visible

### [x] T50 — Filets de sécurité et module de référence

- Copier `reference/layers/layers.ts` vers `src/core/layers.ts` et `v1ShareDefaults.json` vers `src/core/` (imports corrigés, rien d'autre). Faire pointer `tests/unit/layers.test.ts` vers `src/core/layers`.
- Remplacer `src/io/shareLink.ts` par `reference/share/shareLink.ts` (version 2). Adapter les deux assertions `'#p=1.'` de `share.test.ts` et `share-integration.test.ts`, et ajouter un test : un hash `#p=1.` se lit toujours.
- Vérifier avec `git show main:src/state.ts` que les valeurs de `defaultDesign()` en production sont celles de `v1ShareDefaults.json`, puisque les liens déjà partagés ont été faits en production. Noter le résultat dans `DECISIONS.md`. S'il y a une différence, **arrêter T50** : écrire la différence dans `PROGRESS.md` et continuer avec les défauts de `main` (c'est la production qui fait foi).

**Critères**
- [x] `layers.test.ts`, `golden.test.ts` et tous les tests unitaires sont verts ; commit **avant** toute autre modification.

### [x] T51 — État V2 : les calques remplacent `layout`, `pattern` et la collection active

- `SockDesign` devient `SockDesignV2` (`version: 2`, `layers`). Disparaissent de l'état :
  - `design.layout`, `design.pattern` ;
  - `activeCollectionId`, `zoneColors`, `paletteOptionId`.

  Ils vivent maintenant dans chaque calque Motif. `tiles` (carreaux importés) et `embeddedAssets` (images) restent des bibliothèques du projet, référencées par les calques.
- `state.ts` :
  - `defaultDesign()` = Fond + **1 calque Motif** qui reprend ce que V6 affiche au premier lancement (même collection ou mêmes carreaux, même calepinage), pour que l'écran de départ ne change pas ;
  - nouvelles actions : `selectedLayerId`, ajouter, supprimer, dupliquer, déplacer, masquer, verrouiller, renommer, modifier un calque ;
  - annuler / rétablir couvrent tout cela ;
  - la réinitialisation par section devient « réinitialiser ce calque » plus les sections du projet.
- `recompute()` :
  - carreaux pixelisés **par calque Motif**, en cache par `(collectionId, couleurs)` ou `tileIds` ;
  - `motifLayerRgb` en cache par `(layout, carreaux, dimensions, zones, échantillonnage)` ;
  - `renderStack`, puis la suite inchangée (quantize → grille → 3D → exports) ;
  - supprimer `patternSource.ts` ; `renderComposition` reste dans `composition.ts`, qui sert au test d'équivalence.
- Palette :
  - nouveau champ `quantize.paletteFromLayers` (booléen, absent = `false`) ;
  - s'il est vrai, `palette = suggestStackPalette(...)` (couleurs de fil des calques Motif en collection données dans `keyColors`) et `maxColors = min(8, longueur)` ;
  - vrai par défaut pour un nouveau design ; faux pour tout design migré, qui garde sa palette exacte.
- Décor « comme la chaussette » : utilise `primaryMotifLayer()`.

**Critères**
- [x] Tests unitaires :
  - un projet V6 ouvert dans V7 (fixtures de `project.test.ts`) calcule la même grille qu'en V6 ;
  - masquer, réordonner ou rendre une couleur transparente ne recalcule pas `motifLayerRgb` (compteur d'appels) ;
  - annuler ou rétablir un ajout de calque fonctionne.
- [x] `golden.test.ts` et `layers.test.ts` verts sans modification.

### [x] T52 — Fichiers projet, sauvegarde auto et lien de partage

- Projet `.json` en **version 3** : `{version: 3, design: SockDesignV2, tiles, assets}`.
  - La lecture accepte les versions 1, 2 et 3 : les versions 1 et 2 passent par `migrateDesignV1`, avec `collection` (métadonnées V4) → `V1Context`.
  - Seuls les carreaux et les images **utilisés par un calque** sont enregistrés.
- Lien de partage :
  - l'écriture se fait en `#p=2.` avec `designV2ToShareJson` contre `shareDefaultsFor(2)` ;
  - la lecture passe par `decodeShare(hash, shareDefaultsFor)` puis `designFromShare` ;
  - les SVG importés utilisés par un Motif « importés » vont dans `t` avec leur `id`, s'ils tiennent dans le lien ;
  - les images embarquées ne vont jamais dans le lien. Le message de V6 reste : « ce projet contient des images importées : envoyez le fichier .json ».
- La sauvegarde automatique (IndexedDB) relit l'ancien format sans erreur.

**Critères**
- [x] Tests unitaires :
  - projet V1 (fixture de `project.test.ts`), V2 avec composition et V3 → relus, même grille ;
  - le lien d'un design à 4 calques fait l'aller-retour exact.
- [x] e2e `liens-reels.spec.ts` : les deux liens réels (dans `layers.test.ts`) s'ouvrent en visionneuse, sans panneau, sans message d'erreur :
  - la 3D contient les deux couleurs de fil du lien ;
  - en dev, la liste des calques affiche « Fond » et un Motif nommé d'après la collection.
- [x] `npm run verify` complet vert (fin du jalon A).

---

## Jalon B — le nouvel écran

### [x] T53 — Disposition de l'écran (mode dev) et 3D non déformée

La visionneuse (mode normal, sans `?dev`) ne change pas. En mode dev, à 1440 × 900 :

```
┌ barre du projet : nom · annuler/rétablir · Copier le lien · Ouvrir/Enregistrer · Bibliothèque ─────┐
├───────────────────────┬───────────────────────┬──────────────────────────────┤
│ Vue 2D (à plat)       │ Vue 3D                │ Options (onglets)            │
│ poignées du calque    │ ses propres boutons   │ [Calque] [Chaussette]        │
│ sélectionné           │ de vue, dans son      │ [Décor] [Export]             │
│                       │ cadre                 │ (ce panneau seul peut        │
│                       │                       │  défiler)                    │
├───────────────────────┴───────────────────────┴──────────────────────────────┤
│ Calques ▾  [Image 2] [Motif Palm] [Motif Jardin] … [Fond]   + Motif  + Image │  ← dock repliable
└──────────────────────────────────────────────────────────────────────────────┘
```

- Une seule grille CSS, sans `position: absolute` entre zones.
  - Chaque zone a sa propre barre d'outils, **dans son cadre**.
  - Séparateurs déplaçables entre 2D et 3D, et entre les vues et les options (mémorisés en `localStorage`, avec `try/catch`).
  - En dessous de 1100 px de large : 2D et 3D l'une sur l'autre, options en dessous, dock toujours en bas.
- **3D** :
  - la scène est montée dans son propre élément `#view3d` : `createScene(view3d)` ;
  - un `ResizeObserver` sur cet élément met à jour `camera.aspect` ;
  - la visionneuse garde le même élément, en plein écran.
- La page entière ne défile jamais. Le dock et les vues ne défilent pas ; seul le panneau d'options peut défiler.

**Critères**
- [x] e2e `disposition.spec.ts` à 1440 × 900 et 1100 × 800 :
  - les boîtes des zones (2D, 3D, options, dock, et chaque barre d'outils) ne se chevauchent pas deux à deux ;
  - `document.scrollingElement.scrollHeight <= innerHeight` ;
  - le rapport largeur/hauteur du canvas 3D est égal à `camera.aspect` à 1 % près, **après avoir déplacé le séparateur à la souris** et après redimensionnement de la fenêtre.
- [x] Capture de l'écran entier aux deux tailles, ouverte et décrite.

### [x] T54 — Liste des calques (dock du bas)

- Une **carte** par calque, en ligne : vignette (rendu réel du calque seul), nom, œil (masquer), cadenas.
  - Ordre : **dessus à gauche → dessous à droite** ; le Fond est fixé à droite, sans œil ni glisser. Libellés discrets « dessus » et « dessous » aux extrémités.
  - Clic : sélectionne le calque et ouvre l'onglet « Calque ». Double-clic sur le nom : renommer.
  - Glisser une carte à la souris pour réordonner, avec un repère d'insertion. Menu « ⋯ » : dupliquer, monter, descendre, supprimer (sauf le Fond).
  - Boutons « + Motif » (ouvre la Bibliothèque sur l'onglet Collections) et « + Image » (ouvre la Bibliothèque sur l'onglet Images).
- **Sans ascenseur** : les cartes rétrécissent (140 px, puis 96 px, puis icône seule) pour que tout tienne sur une ligne jusqu'à 16 calques. Au-delà, l'ajout est refusé avec un message (« 16 calques au maximum »).
- Bouton « Calques ▾ » : replie le dock en une barre fine qui affiche encore le nom du calque sélectionné (mémorisé).
- Clavier, quand le focus est dans le dock : ↑ / ↓ pour sélectionner, Suppr pour supprimer (pas le Fond), Ctrl+D pour dupliquer, H pour masquer.

**Critères**
- [x] e2e `calques-dock.spec.ts`, **à la souris** :
  - ajouter 2 Motifs et 1 Image ;
  - glisser la carte du bas vers le haut : l'ordre de la pile change et la couleur d'une maille témoin de la vue 2D change ;
  - masquer puis démasquer ;
  - avec 16 calques, `dock.scrollWidth <= dock.clientWidth` ;
  - replier puis déplier.
- [x] Capture du dock avec 3 puis 12 calques, décrite.

### [x] T55 — Options du calque sélectionné

L'onglet « Calque » montre les options **du type** de calque sélectionné. On réutilise les réglages existants de `panel.ts`, `collectionPicker.ts`, `palettePanel.ts` et `calepGallery.ts`, branchés sur le calque au lieu de l'état global.

- **Fond** : couleur, choisie dans le nuancier des fils ou au sélecteur libre.
- **Motif** :
  - source : collection (vignettes, recherche, « Mes collections ») ou carreaux importés (liste, import, ordre) ;
  - couleurs par zone et palettes conseillées ;
  - calepinage (galerie) ;
  - taille : « carreaux sur le tour », ou taille libre ;
  - raccord, joint, décalage ;
  - **étendue** : « Toute la chaussette » ou « Bande », avec deux curseurs « du rang » et « au rang » ; l'encadré indique aussi ces bornes en cm depuis le haut de la tige ;
  - **Couleurs transparentes**.
- **Image** :
  - aperçu de l'image ;
  - remplacer l'image ;
  - miroir horizontal et vertical ;
  - frise autour de la jambe et son écart ;
  - valeurs numériques secondaires, repliées : x, y, largeur, rotation ;
  - **Couleurs transparentes**.
- **Couleurs transparentes** (Motif et Image) :
  - une pastille par couleur principale du calque (`layerKeyColors`) ;
  - un clic la rend transparente : pastille barrée en damier ;
  - un second clic la rétablit.
- Onglets du projet :
  - **Chaussette** : taille, dimensions, zones (bord-côte, talon, pointe, pied), gros pixels, contrôles, palette (« Automatique d'après les calques » ou manuelle) ;
  - **Décor** et **Export** : sections actuelles.

**Critères**
- [x] e2e `calque-options.spec.ts`, à la souris : choisir un Motif jaune et blanc, rendre le blanc transparent → dans la vue 2D, une maille qui était blanche prend la couleur du Fond ; limiter ce motif à une bande → hors de la bande, on voit le Fond.
- [x] Capture de l'onglet pour chacun des trois types, décrite.

### [x] T56 — Vue 2D : vrai rendu et poignées

- La vue 2D affiche **la grille réelle**, c'est-à-dire la sortie de `renderStack` après la réduction des couleurs, maille par maille. Les images y apparaissent donc comme elles seront tricotées, jamais comme des rectangles.
  - Pendant qu'on déplace une image, l'aperçu peut être allégé (image posée en transparence sur la grille). La grille exacte est recalculée au lâcher, ou toutes les 100 ms au plus.
- Clic : sélectionne le calque visible sous la souris (`layerAtStitch`). Échap : désélectionne.
- **Poignées d'une Image** (`imageGizmo`, `dragImage`) :
  - cadre tourné ;
  - glisser l'intérieur pour déplacer ; le tour est circulaire ;
  - 4 coins pour agrandir en gardant les proportions ;
  - rond au-dessus du bord haut pour tourner (Maj : pas de 15°) ;
  - flèches du clavier : 1 maille (Maj : 10).
- **Poignées d'un Motif** (`motifGizmo`, `dragMotif`, `scaleMotif`, `setMotifBand`) :
  - cadre pointillé sur un carreau de référence : le glisser décale le calepinage ;
  - son coin bas-droit agrandit ou réduit (en « carreaux sur le tour », par crans entiers) ;
  - si le calque est en « Bande », deux poignées horizontales règlent le haut et le bas de la bande.
- Un calque verrouillé n'a pas de poignées. Le Fond n'en a pas.
- Zoom avec la molette et déplacement de la vue avec la barre espace ou le bouton du milieu (bonus, si le temps le permet).

**Critères**
- [x] e2e `poignees.spec.ts`, **uniquement à la souris** :
  - déplacer une image de 20 mailles vers la droite : la couleur de l'image apparaît 20 mailles plus loin dans la grille ;
  - la tourner de 90° avec la poignée ronde : `rotation` = 90 ± 1 ;
  - l'agrandir par un coin : la largeur double à ± 5 % ;
  - décaler un Motif ;
  - régler la bande par sa poignée basse.
- [x] Capture 2D avec une image tournée sélectionnée et un Motif en bande sélectionné, décrite (on doit voir le vrai dessin, pas un rectangle).

### [ ] T57 — Bibliothèque

Bouton « Bibliothèque » dans la barre du projet, et boutons « + Motif » / « + Image » du dock. Il ouvre un **panneau par-dessus l'écran** (dialogue modal, Échap pour fermer) avec deux onglets :

- **Collections** : toutes les collections du catalogue et de « Mes collections ».
  - Chaque collection a une vignette (VAR1 recolorée), son nom et un filtre texte.
  - Un clic ajoute un **calque Motif** avec cette collection, ses couleurs par défaut et son calepinage par défaut.
  - Un sous-menu « Ajouter une variation comme image » propose chaque variation.
- **Images** :
  - les images déjà dans le projet ;
  - « Importer PNG / SVG… » (bouton et glisser-déposer) : ajoute un **calque Image** (image embarquée dans le projet) ;
  - case « Importer comme carreau (Motif) » : ajoute un calque Motif « importés ».
- Tout ce qui est ajouté est placé au-dessus et sélectionné, puis le dialogue se ferme.

**Critères**
- [ ] e2e `bibliotheque.spec.ts`, à la souris :
  - ouvrir → le dialogue est visible et au premier plan (`elementFromPoint` au centre = dialogue) ;
  - filtrer « medina » ;
  - cliquer → un calque Motif « Medina » apparaît dans le dock ;
  - importer un PNG de test → un calque Image, dont la vue 2D montre les couleurs.
- [ ] Capture du dialogue, décrite.

### [ ] T58 — Garde-fous jacquard avec plusieurs calques

- La palette automatique réunit les couleurs de tous les calques visibles. **Au-delà du maximum de couleurs de la machine**, un bandeau le dit, avec la liste des couleurs et le calque d'où vient chacune, plus le bouton « Réduire à N couleurs » (qui passe en palette manuelle avec les N plus présentes).
- Contrôles existants (flottés, mailles isolées) : inchangés. Ils indiquent en plus le calque concerné quand c'est possible, via `owner`.
- Conseils (bulle « ? » de V6) : repris dans l'onglet « Calque ».

**Critères**
- [ ] Test unitaire : 3 calques Motif de 2 couleurs chacun, plus le Fond → le bandeau propose la réduction, et la réduction donne exactement N couleurs.

### [ ] T59 — Bilan V7

- README : calques, bibliothèque, poignées, liens `#p=2.` (les anciens liens marchent toujours), limites.
- Captures dans `docs/captures/v7/` :
  - écran entier ;
  - dock ;
  - options de chaque type de calque ;
  - poignées ;
  - bibliothèque ;
  - visionneuse ouverte depuis chacun des deux liens réels.
- « Point pour César » dans `PROGRESS.md` : ce qui marche, ce qui reste, comment tester en 5 minutes.
- `npm run verify` complet vert. Pull request `v7-calques`.
