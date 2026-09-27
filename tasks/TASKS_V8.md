# Tâches V8 — retours de César sur V7

Boucle habituelle (`.cursor/rules/10-workflow.mdc`), mêmes règles que V7 :
- branche `v8-retours`, créée depuis `v7-calques` ;
- aucune question à César ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin ;
- au plus un petit fichier e2e par tâche ; les actions testées se font **à la souris** ;
- chaque tâche d'interface a sa **capture, ouverte et décrite** dans `docs/PROGRESS.md` avant de cocher.

**Intouchables** :
- `golden.test.ts` ;
- les empreintes des liens réels dans `layers.test.ts` ;
- `v1ShareDefaults.json` ;
- et maintenant `tests/unit/v8-layers.test.ts`.

## Déjà fait (par Claude) dans `src/core/layers.ts`

Ne pas réécrire ces fonctions ; tests dans `tests/unit/v8-layers.test.ts`.

- `motifRowToGridRow`, `gridRowToMotifRow`, `motifYToGridY`, `gridYToMotifY` : les rangs de motif **sautent le talon**. Cause du cadre décalé sous le talon : la vue 2D n'ajoutait que le bord-côte.
- `faceGuides(aiguilles)` : colonnes des centres des faces (Intérieur 0, Dos W/4, Extérieur W/2, Devant 3W/4).
- `renderStack(input, { rows, into })` et `dirtyRowsForImage(avant, après, image, jauge)` : pendant un glisser, on ne recalcule que les rangs touchés. Le résultat est identique, octet pour octet, au rendu complet (testé).
- Les pixels préparés des images sont en cache : masque d'opacité et couleurs remplacées.
- `ImageLayer.recolor` : remplacement de couleurs d'une image (couleur principale → couleur de fil), avec `cleanRecolor`. Chaque pixel est rattaché à la couleur principale la plus proche, donc l'image est « aplatie ». Le remplacement passe dans le lien `#p=2.` ; un remplacement vide n'y est pas écrit.
- `resolveStackPalette(...)` et `fondVisible(owner)` : **une seule vérité** pour la palette appliquée ET pour le garde-fou.
  - Cause du « Réduire à 6 » à tort : le bandeau V7 comptait toutes les couleurs des calques, même cachées sous d'autres calques ou transparentes, alors que la palette appliquée ne gardait que les couleurs visibles.
  - Ordre des sources : calques → manuelle (un choix explicite gagne) → fils de la collection du Motif principal, + le Fond s'il est visible → auto, plafonné au maximum machine.
  - `showMaxColors` dit quand le réglage « Couleurs du motif » a un sens.
- `effectiveZones(design)` : le pied sans motif prend la **couleur du Fond**. `migrateDesignV1` met la « couleur du pied » d'un ancien projet dans le Fond, sans perte (testé).
- `packLayers` / `unpackLayers` :
  - l'image d'un calque Image se relit exactement (petit défaut V7 corrigé) ;
  - le type d'image `bibliotheque` est déjà prévu dans la relecture (voir T66).

---

### [x] T60 — Brancher la palette unique et le Fond

- `main.ts › recompute()` :
  - calculer une seule fois `const pal = resolveStackPalette({ quantize, suggested: suggestStackPalette(…, rgb), primaryYarns, fondColor, fondVisible: fondVisible(owner), machineMax })` ;
  - la réduction reçoit `pal.palette` et `pal.maxColors`, sauf en mode auto où elle garde la réduction automatique avec `pal.maxColors` ;
  - le bandeau s'affiche **si et seulement si** `pal.overLimit`. Sa liste = `pal.palette`, avec le calque d'origine de chaque couleur (via `stackPaletteEntries` filtré sur `pal.palette`) ;
  - « Réduire à N » réduit à `machineMax`. Il reste proposé en mode manuel si la palette choisie dépasse.
  - Supprimer le calcul séparé de `analyzeStackPaletteGuard` (ou le faire dépendre de `pal`) : plus deux comptes différents.
- **« Couleurs du motif »** (curseur `ctl-max-colors`) : visible seulement si `pal.showMaxColors`, c'est-à-dire en mode « Automatique (réduction des couleurs) » ou « Manuelle ». Il est masqué en mode « Automatique d'après les calques ».
- **Le Fond remplace la « couleur du pied »** :
  - supprimer le réglage « Couleur du pied » (`ctl-foot-color`) de l'onglet Chaussette ;
  - tous les appels à `composeGrid`, la 3D et les exports passent `effectiveZones(design)` ;
  - l'aide de la case « Motif sur le pied » devient : « Décoché : le pied est uni, de la couleur du Fond. » ;
  - le champ `zones.footColor` reste dans les fichiers (compatibilité) ; il n'est plus réglable ni utilisé.
- Le Fond fait maintenant toujours partie de la palette quand il est visible (mode « fils de la collection »). Il n'est plus remplacé en douce par le fil le plus proche.

**Critères**
- [x] Test unitaire (`main`, ou une fonction extraite de `recompute`) : la palette appliquée et le compte du bandeau sont toujours égaux.
- [x] e2e `palette-bandeau.spec.ts`, à la souris :
  - deux Motifs dont celui du dessus recouvre tout, en mode « d'après les calques » → pas de bandeau ;
  - rendre transparentes des couleurs jusqu'à dépasser 6 couleurs visibles → bandeau ; « Réduire à 6 » → 6 couleurs ;
  - le curseur « Couleurs du motif » est invisible en mode calques et visible en mode manuel.
- [x] e2e : décocher « Motif sur le pied », changer la couleur du Fond → le pied de la vue 2D prend cette couleur ; « Couleur du pied » n'existe plus.

### [x] T61 — Vue 2D : le cadre suit l'image sous le talon

- Remplacer tous les calculs « rang de motif ↔ rang de la grille » de `flatView.ts` et `flatGizmos.ts` (`motifOriginRow() + …`, `row - motifOriginRow()`) par `motifYToGridY` / `gridYToMotifY` (coordonnées continues : coins, poignées, souris) et `motifRowToGridRow` / `gridRowToMotifRow` (mailles entières).
- Un cadre d'image qui chevauche le talon se dessine en deux morceaux : le haut au-dessus du talon, le reste sous le talon. C'est ce que fait la grille. Les poignées restent sur les coins réels.

**Critères**
- [x] e2e `gizmo-pied.spec.ts`, à la souris : glisser une image sous le talon → toutes les mailles dont `owner` est cette image sont à l'intérieur du cadre dessiné, à 1 maille près ; puis cliquer au centre de l'image → elle est bien sélectionnée.
- [x] Capture avant / après (image sur le pied, sélectionnée), décrite.

### [x] T62 — Vue 2D fluide

- **Dessin** : la grille est peinte dans un `ImageData` à 1 pixel par maille, puis agrandie avec `drawImage` (`imageSmoothingEnabled = false`). Fini les 80 000 `fillRect` + `strokeRect` par image.
  - Les lignes de mailles sont tracées en un seul chemin, et seulement à partir du zoom où elles sont lisibles.
  - Les poignées et les repères passent sur un **second canvas** superposé, redessiné seul pendant un glisser.
- **Pendant un glisser d'image** :
  - `renderStack(…, { rows: dirtyRowsForImage(avant, après, …), into: dernierRésultat })` ;
  - réduction des couleurs et grille recalculées une fois par `requestAnimationFrame` au plus, jamais à chaque événement souris ;
  - la texture 3D est mise à jour au plus 8 fois par seconde, puis exactement au lâcher ;
  - pas d'entrée d'historique intermédiaire (une seule au lâcher, `coalesce`) ;
  - la sauvegarde automatique et le lien dans l'adresse ne se mettent à jour qu'au lâcher.
- Glisser un Motif (décalage, taille) : même régulation par image, avec un rendu complet (le cache des Motifs recalcule seulement ce calque).

**Critères**
- [x] `window.__SIM__.stats` expose `dragFrames` et `dragComputeMsAvg`. e2e `glisser-fluide.spec.ts` : glisser une image sur 40 pas à la souris → `dragComputeMsAvg < 25` et aucun appel à `motifLayerRgb` pendant le glisser.
- [x] Note dans `PROGRESS.md` : temps mesurés avant et après sur la machine de l'agent.

### [x] T63 — Repères des faces sur la vue 2D

- Traits verticaux fins en pointillés aux colonnes de `faceGuides(aiguilles)`, sur toute la hauteur tricotée, avec leur libellé en haut : « Intérieur », « Dos », « Extérieur », « Devant ».
  - Au bord : le repère « Intérieur » est dessiné en colonne 0 **et** en colonne W, pour qu'on le voie des deux côtés de la vue.
  - Style distinct du trait du raccord (qui reste en rouge brique).
- Bouton « Repères » dans la barre d'outils de la vue 2D (actif par défaut, mémorisé en `localStorage` avec `try/catch`).
- Le glisser d'une image s'**aimante** au centre d'une face (± 2 mailles) quand l'aimantation est active, comme pour le reste.

**Critères**
- [x] Capture de la vue 2D avec les 4 repères, décrite.
- [x] e2e : désactiver « Repères » → ils disparaissent ; recharger → toujours désactivés.

### [ ] T64 — Afficher ou masquer les vues 2D et 3D

- Deux boutons bascule « 2D » et « 3D » dans la barre du projet.
  - Masquer une vue libère sa place : l'autre vue, ou le panneau d'options s'il n'y a plus de vue, prend la largeur.
  - Les deux peuvent être masquées : options + dock seulement.
  - Choix mémorisé en `localStorage`.
- 3D masquée : rendu et mise à jour du maillage suspendus (plus rapide), repris quand on la réaffiche.
- La visionneuse publique (sans `?dev`) ne change pas.

**Critères**
- [ ] e2e `vues-bascule.spec.ts`, à la souris :
  - masquer la 2D, puis la 3D, puis réafficher : les zones ne se chevauchent jamais ;
  - le canvas 3D réaffiché a `camera.aspect` juste à 1 % près.
- [ ] Captures des 4 combinaisons, décrites.

### [ ] T65 — Onglet « Global »

- Le pied de panneau (`options-footer`) disparaît. Son contenu va dans un nouvel onglet **« Global »**, le dernier après Calque, Chaussette, Décor, Export :
  - « Tout réinitialiser » ;
  - « Gérer mes collections » ;
  - « Quitter le mode dev » ;
  - « Dernier calcul : … ms ».
- `data-testid` inchangés, pour que les tests existants suivent.

**Critères**
- [ ] e2e : les 3 boutons sont dans l'onglet Global, et il n'y a plus d'élément `.options-footer`.

### [ ] T66 — Bibliothèque d'images intégrée (+ logo fourni par César)

- Nouveau dossier **`bibliotheque-images/`** à la racine, déjà créé par Claude :
  - `images.json` : `[{ id, nom, fichier, categorie }]` ;
  - les fichiers eux-mêmes (SVG ou PNG) ;
  - premier élément : `logo.svg`.
- Synchronisation :
  - `scripts/sync-carreaux.mjs` (et `npm run sync:local`) copie ces images dans `public/images/` avec un `public/images/index.json` ;
  - rapport dans `SYNC_REPORT.md` ;
  - fichier invalide ou absent : avertissement, et la synchronisation continue.
- Nouveau type d'image pour les calques :
  - `AssetRef = … | { kind: 'bibliotheque'; imageId }` dans `composition.ts`, `assetKey` → `b:<id>` ;
  - chargement dans `compositionImages.ts` (fetch `./images/<fichier>`, rasterisation comme les SVG) ;
  - lecture et écriture dans `project.ts` ;
  - retirer le transtypage `as unknown as AssetRef` de `cleanAsset` dans `layers.ts`.
  - Ces images ne sont **pas** embarquées dans le projet et **passent dans le lien de partage**.
- Bibliothèque, onglet **Images** : section « Bibliothèque » (vignettes, nom, filtre texte) au-dessus de « Images du projet ». Un clic ajoute un calque Image.
- Outil « Gérer mes collections » : section « Images » pour ajouter, renommer ou retirer une image de `bibliotheque-images/`, sur le modèle des collections locales. C'est un bonus, si le temps le permet.

**Critères**
- [ ] Test unitaire : synchronisation de `bibliotheque-images/` (fixture minimale) → `index.json` correct ; une entrée dont le fichier manque est ignorée avec un avertissement.
- [ ] e2e `bibliotheque-images.spec.ts`, à la souris :
  - Bibliothèque → Images → « Logo » → calque Image magenta visible dans la vue 2D ;
  - « Copier le lien » → ouvrir le lien → même image (pas de message « images importées »).

### [ ] T67 — Couleurs d'un calque : œil (transparence) et remplacement

Un seul composant **« ligne de couleur »** pour les Motifs et les Images : pastille, code ou nom du fil, **œil**, et pour les Images **« Remplacer… »**.

- **Motif** (collection) :
  - les lignes « Couleurs par zone » reçoivent l'œil ;
  - œil barré = la couleur de fil de cette zone passe dans `transparentColors` ; un nouveau clic la rétablit ;
  - si deux zones ont le même fil, elles basculent ensemble, et une info-bulle le dit ;
  - Motif « importés » : une ligne par couleur principale, avec l'œil.
- **Image** : une ligne par couleur principale (`layerKeyColors`), avec l'œil et « Remplacer… ». Ce bouton ouvre une petite fenêtre avec :
  1. « Déjà sur la chaussette » : couleurs de `pal.palette` + bord-côte, talon et pointe (sans doublon) ;
  2. le **nuancier** (couleurs « Validé » du catalogue), avec une recherche par code ou par nom ;
  3. « Couleur d'origine » pour annuler.

  Le choix écrit `recolor[couleurPrincipale] = fil`. La ligne montre alors « origine → fil ».
- L'ancienne section « Couleurs transparentes » (pastilles en damier) est remplacée par ces lignes.

**Critères**
- [ ] e2e `couleurs-calque.spec.ts`, à la souris :
  - œil barré sur le blanc d'un Motif jaune et blanc → le Fond apparaît dans la vue 2D ;
  - sur une Image, « Remplacer… » → choisir une couleur de « Déjà sur la chaussette » → dans la vue 2D, les mailles de l'image passent à cette couleur ;
  - l'œil et le remplacement survivent à « Copier le lien » puis à la réouverture.
- [ ] Capture des lignes de couleurs d'un Motif et d'une Image (avec un remplacement), décrite.

### [ ] T68 — Bilan V8

- README : repères, vues à masquer, onglet Global, bibliothèque d'images (comment ajouter une image : déposer le fichier dans `bibliotheque-images/`, compléter `images.json`, `npm run sync:local`), couleurs des calques.
- Captures dans `docs/captures/v8/`.
- « Point pour César ».
- `npm run verify` complet vert. Pull request `v8-retours`.
