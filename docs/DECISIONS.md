# Décisions

Une entrée par décision non couverte par le cahier des charges. César relit cette liste.

```
## D0X — <titre court> (tâche T0X)
Contexte : <pourquoi il fallait décider>
Options : <A / B / C>
Choix : <option> — <raison en une phrase>
Conséquence : <ce que ça implique, comment revenir en arrière>
```

---

## D01 — Pas de framework d'interface (T00)
Contexte : le panneau est un ensemble de formulaires.
Options : React / Vue / DOM natif.
Choix : DOM natif — moins de dépendances, build plus simple, suffisant pour un panneau.
Conséquence : petits composants maison dans `src/ui/controls.ts`.

## D02 — Colonne 0 côté intérieur de la jambe (T00)
Contexte : il faut une convention pour placer talon, pointe et raccord du motif.
Choix : colonne 0 = côté intérieur ; moitié `[0, n/2)` = arrière. Le raccord tombe sur le côté le moins visible.
Conséquence : à confirmer avec le fabricant (sens de tricotage, côté de la pointe) ; modifiable en un seul endroit de `src/core/grid.ts`.

## D03 — Fond de motif et mailles hors tricot (T02)
Contexte : `composeGrid` doit toujours produire une couleur par maille, y compris sans motif et sur la moitié vide du talon et de la pointe.
Options : laisser l'index 0 / couleur dédiée documentée / omettre ces cellules de la palette.
Choix : couleur dédiée — `#f4f1ea` (fond, seulement si la palette de motif est vide) et `#d9d4cc` (hors tricot). Les deux sont dédupliquées avec le reste de la palette.
Conséquence : la vue à plat pourra distinguer le hors-tricot ; remplacer ces constantes dans `src/core/grid.ts` si le fabricant impose une autre convention.

## D04 — Modèle par défaut (T03)
Contexte : le cahier impose taille homme, calepinage grille, 4 couleurs auto et bord-côte, pas les autres valeurs initiales.
Options : tout à zéro / valeurs de démonstration lisibles.
Choix : carreau de 24 mailles × `round(24 / rapport)` rangs (32 avec la jauge actuelle), motif aussi sur le pied, couleurs bord-côte `#1f3a5f`, talon `#b5462f`, pointe `#1d1d1b`, pied `#f4f1ea`, nom de fichier `modele`.
Conséquence : tout est modifiable dans le panneau ; les défauts sont regroupés dans `defaultDesign()` (`src/state.ts`).

## D05 — Géométrie du calepinage (T04)
Contexte : le cahier décrit les familles de calepinage sans fixer le sens des décalages, l’emplacement du joint, ni le traitement de la transparence.
Options : pavage infini / motif recadré sur un seul tour ; joint centré / joint en bas à droite ; transparence ignorée / remplacée.
Choix : pavage infini, maille `(col, rang)` = coordonnée `(col − décalage, rang − décalage)` ; joint à droite et en bas ; quinconce horizontal vers la droite et vertical vers le bas, d’une demi-taille de carreau ; pixels d’alpha inférieur à 128 remplacés par le premier pixel opaque (coin haut-gauche, parcours ligne à ligne), sinon `#f4f1ea` ; sortie RVB (3 octets). Période = pas du carreau, ×2 pour rotation-4, miroir-4 et damier. À distance égale, `nearestFittingWidth` choisit la largeur la plus grande. Rotation aléatoire : un pas de mulberry32 mélangé à la position du carreau.
Conséquence : le raccord (`seamMismatch`) ne dépend pas du décalage. Le détail est en tête de `src/core/layout.ts`.

## D06 — K-means et nettoyage (T05)
Contexte : il faut une palette automatique reproductible, et une règle précise pour les mailles isolées.
Options : k-means++ / médiane-coupe ; plusieurs passages de nettoyage / un seul.
Choix : k-means++ à graine fixe `0x51ec0517`, distance euclidienne au carré, au plus 16 itérations. N est borné de 2 à 8. Si l'image a déjà au plus N couleurs, on les garde telles quelles. Le mode manuel utilise la distance redmean. Le nettoyage se fait en un seul passage sur la grille d'origine (une ligne de deux mailles n'est pas mangée). Les couleurs sans maille après nettoyage sortent de la palette.
Conséquence : le résultat est identique à chaque appel. Le détail est en tête de `src/core/quantize.ts`.

## D07 — Forme 3D de la chaussette (T06)
Contexte : l'architecture décrit la chaussette portée sans donner les courbes exactes.
Options : tube coudé à rayon constant / poche de talon par Bézier avec avant immobile / modèle sculpté.
Choix : cylindre de jambe légèrement évasé au mollet ; pendant le talon, la moitié avant reste immobile et la moitié arrière suit une Bézier qui descend et recule (semelle plate) ; le pied s'extrude vers l'avant ; la pointe rejoint un seul point. Les quads d'aire nulle (avant du talon) ne sont pas émis, pour éviter des normales NaN. Échelle : `0,01 / jauge` mètre par maille ou par rang.
Conséquence : la forme est entièrement dans `src/render/sockGeometry.ts`. Le côté de la pointe reste celui de la grille (moitié arrière active).

## D08 — Relief de maille (T07)
Contexte : il faut un V de jersey et des côtes, sur un seul matériau, sans que la couleur de la grille soit floutée.
Options : deux maillages / un shader qui choisit le relief selon la zone / tout en V.
Choix : `DataTexture` NearestFilter pour la couleur ; normales et occlusion du V répétées (aiguilles × rangs), mipmaps et anisotropie max ; dans le bord-côte (`vMapUv.y`), ces cartes sont remplacées par des côtes verticales (une côte pour deux mailles). L'intérieur (face arrière) est multiplié par 0,38. Three r186 n'expose pas `vUv` dès qu'une carte est présente : on lit `vMapUv`.
Conséquence : le mélange est dans `onBeforeCompile` de `src/render/knitTexture.ts`.

## D09 — Panneau : sections encore vides et palette manuelle (T08)
Contexte : le cahier demande les sections Contrôles et Exports dès le panneau complet, alors que leur logique arrive en T12 et T10. Le mode palette manuelle n'a pas de fils par défaut.
Options : masquer ces sections / les afficher vides avec une phrase / y mettre des contrôles factices.
Choix : les deux sections sont présentes, ouvertes, avec une phrase d'attente. Une palette manuelle vide reçoit quatre fils (`#1f3a5f`, `#b5462f`, `#f4f1ea`, `#1d1d1b`). Le champ tige n'a pas d'attribut `max` HTML : le dépassement est détecté puis ramené par `clampLegRows`, avec le message.
Conséquence : T10 et T12 remplaceront le texte d'attente. Les fils initiaux sont dans `MANUAL_SEED` (`src/ui/panel.ts`).

## D10 — Mailles de la vue à plat (T09)
Contexte : le rapport réel des mailles et une couleur de pixel exacte (sans lissage) doivent tenir ensemble, et le quadrillage ne doit pas masquer le test de couleur.
Options : mailles fractionnaires lissées / rectangles entiers zoomés / image 1 px rééchantillonnée.
Choix : rectangle de base 4 px de large sur `round(4 × rapport)` px de haut, zoom entier de 1 à 8 (molette), déplacement au glisser. Le quadrillage n'est dessiné qu'à partir de 12 px de large. Les noms de zones sont à gauche, les numéros tous les 10 mailles et rangs dans les marges.
Conséquence : au zoom 1, une maille fait 4×3 px avec la jauge actuelle. Le détail est dans `src/ui/flatView.ts`.

## D11 — Cadrage et noms des exports PNG (T10)
Contexte : le cahier demande un cadrage automatique (~85 %), un fond uni ou transparent, et un fichier par vue, sans préciser les identifiants de fichier ni la caméra d'export.
Options : réutiliser la caméra de l'utilisateur / caméra dédiée ; une archive ZIP / un téléchargement par fichier.
Choix : caméra dédiée (champ 35°, la caméra de l'utilisateur ne bouge pas). La distance est ajustée pour que la boîte englobante tienne dans 85 % du cadre. Fond par défaut `#eeeae4`, ou transparent. Pas de ZIP : un PNG toutes les 250 ms. Noms `<modele>_<taille>_<vue>.png` avec vue parmi `face`, `trois-quarts`, `profil-exterieur`, `dos`, `profil-interieur`, `plat-exact`, `plat-lisible`. Le plat lisible agrandit chaque maille à 8 px de large, hauteur au rapport réel.
Conséquence : les angles sont dans `src/render/views.ts`, le rendu dans `src/io/exportPng.ts`.

## D12 — Fichier projet et IndexedDB (T11)
Contexte : le cahier demande un JSON avec les réglages et les carreaux, et une sauvegarde du dernier état, sans fixer le schéma ni le comportement au rechargement.
Options : pixels bruts en base64 / PNG ; restauration silencieuse au démarrage / bouton « reprendre ».
Choix : document `{ version: 1, design, tiles: [{ id, name, source, pngBase64 }] }`. PNG RGBA filtre 0, encodé avec `CompressionStream` en lisant le flux pendant l’écriture (sinon les gros carreaux bloquent). IndexedDB `cesar-bazaar` / magasin `project` / clé `last`, relu avant que `__SIM__.ready` passe à vrai. Si IndexedDB manque ou si le document est illisible, le modèle par défaut reste affiché.
Conséquence : l’import rejette toute autre version avec « Fichier de projet invalide : … ». Le code est dans `src/io/project.ts` et `src/io/pngCodec.ts`.

## D13 — Ce que comptent les contrôles (T12)
Contexte : le cahier ne dit pas si les mailles hors tricot entrent dans le nombre de couleurs, ni comment surligner un flotté sans changer la couleur lue au centre de la maille.
Options : compter toute la grille / seulement les mailles tricotées ; surlignage plein / coin.
Choix : les mailles `Zone.Empty` sont ignorées pour les couleurs. Un flotté est une suite circulaire, zones de motif seulement (tige, et pied si le motif y est). Le seuil est accepté tel quel (7 passe, 8 est signalé). Le surlignage est un pixel orange au coin de la maille, pour laisser le centre intact.
Conséquence : une tige unie produit beaucoup de flottés (un rang entier dépasse 7). Le détail est dans `src/core/checks.ts`.

## D14 — Pas de Web Worker (T13)
Contexte : le recalcul doit passer sous 300 ms pour 200 aiguilles × 600 rangs, 2 carreaux et 6 couleurs, sinon layout et quantize vont dans un worker.
Options : worker tout de suite / mesurer d’abord.
Choix : mesurer d’abord. Trois passages donnent 97 ms, 102 ms et 99 ms. Le calcul reste sur le fil principal.
Conséquence : un recalcul peut figer l’image environ un dixième de seconde. Si une taille plus grande dépasse 300 ms, le test `tests/unit/perf.test.ts` échoue et il faudra alors le worker.

## D15 — Chevron des frontières de couleur (T14)
Contexte : le cahier demande une option simple/fidèle sans fixer l’amplitude ni si le réglage entre dans le fichier projet.
Options : champ dans `SockDesign` / état d’affichage seul ; warp sur toutes les zones / hors bord-côte.
Choix : `knitFidelity` dans l’état d’application seulement (défaut `fidele`), pas dans le JSON projet. Décalage horizontal `(0,5 − ly) × 0,32 × signe(lx − 0,5)` hors bord-côte. `wrapS` de la grille en `RepeatWrapping` pour le raccord circulaire.
Conséquence : le plat exact et le BMP restent des pixels droits. Le détail est dans `src/render/knitTexture.ts`.

## D16 — BMP indexé et contenu de la planche (T15)
Contexte : le cahier demande un BMP 8 bits et une planche, sans fixer biClrUsed ni quelles 4 vues.
Options : toujours 256 entrées de palette / seulement les couleurs utilisées ; 5 vues / 4 vues.
Choix : palette = couleurs de la grille (`biClrUsed` = longueur), lignes bas → haut, padding 4 octets. Planche = face, trois-quarts, profil extérieur, dos (512²) + grille agrandie ×4 + légende, titre = nom du modèle.
Conséquence : à valider avec le fabricant pour le BMP. Fichiers `src/io/exportBmp.ts` et `renderBoard` dans `exportPng.ts`.

## D20 — Pied gauche et export paire (T22)
Contexte : le module référence expose `side: 'droite' | 'gauche'`. L’export paire demande deux chaussettes côte à côte.
Options : champ dans `SockDesign` / état d’affichage ; cloner le mesh interactif / créer deux `SockObject` temporaires.
Choix : `footSide` dans l’état d’application (comme `knitFidelity`), hors JSON projet. Export paire : deux objets temporaires (droite + gauche), gauche en retrait Z et yaw +15°, cadrage commun `trois-quarts` via `capturePng` sur un `Group`.
Conséquence : changer Pied reconstruit la géométrie (`setShape`). L’export paire ne modifie pas la vue interactive.

## D21 — Forme anatomique v2 loft ANSUR II (T23)
Contexte : César a jugé la forme v1 difforme (bosse sur le dessus du pied). `reference/sock3d/sockShape.ts` a été réécrit (loft profils avant/arrière + largeurs asymétriques, mesures ANSUR II) et les captures régénérées.
Options : réécrire localement / remplacer à l’identique depuis la référence.
Choix : copie littérale de `reference/sock3d/sockShape.ts` vers `src/render/sock3d/sockShape.ts`. Les autres fichiers du module sont inchangés (sauf `setChevron` déjà ajouté en T19 sur `sockObject`). Les tests unitaires `sock3d.test.ts` importent depuis `src/render/sock3d/` (comme T19). Architecture mise à jour pour mentionner le loft.
Conséquence : silhouette T21 recalée sur les nouvelles captures ; plus de bosse parasite sur le dessus du pied.

## D22 — Talon réglable en aperçu seulement (T24)
Contexte : César trouve le talon trop haut ; le CDC V3 demande hauteur / profondeur / largeur sans toucher aux rangs de talon de la grille.
Options : champs dans `SockDimensions` / dans `ZoneSettings` / état d’affichage hors projet.
Choix : `heelHeightMm`, `heelDepthMm`, `heelSpread` (%) dans `ZoneSettings` (sérialisés, défauts 55 / 72 / 100). Conversion `heelSpread/100` vers `SockShapeInput.heelSpread`. Anciens projets sans ces champs → défauts à l’import.
Conséquence : changer ces curseurs reconstruit la géométrie 3D (`geometryBuilds`) ; la vue à plat et le nombre de rangs de talon restent inchangés.

## D23 — CalepinageSpec remplace LayoutKind (T25)
Contexte : multi-motifs + 75 préréglages ; l’ancien `kind` ne suffit plus.
Options : étendre LayoutKind / remplacer par `CalepinageSpec` du module référence.
Choix : `layout.calepinage: CalepinageSpec` ; migration à l’import projet et via `setDesign({ layout: { kind } })` ; bibliothèque dans `config/calepinages.json` via `presets.ts`. Liste panneau provisoire = GENERATED_PRESETS (galerie T26).
Conséquence : projets V1 restent ouvrables ; `seed`/`rotation` migrent vers `graine`/`rotationGlobale`. Sur-échantillonnage 3×3 (comme `sampler.ts` de référence) pour tenir le budget 300 ms.

## D24 — Galerie de calepinages (T26)
Contexte : 75 préréglages + 11 rapides à présenter sans saturer le panneau.
Options : liste déroulante / galerie à vignettes réelles.
Choix : galerie (`calep-gallery`) avec filtre par nombre de motifs (défaut ≤), aperçus canvas 4×4 cases, bibliothèque remplaçable en session (`calepPresets` dans l’état).
Conséquence : la liste déroulante T25 est retirée ; sélection via `calep-thumb-<id>`.

## D25 — Historique coalesce curseurs (T27)
Contexte : chaque `input` de curseur ne doit pas créer un pas d’historique.
Options : pointerup / debounce flag / coalescence temporelle.
Choix : `update(..., { coalesce: true })` via `slide()` ; premier update d’un geste pousse l’historique, les suivants sont fusionnés ; fin de geste après 400 ms d’inactivité.
Conséquence : un glissement = un Annuler ; les clics discrets (galerie, cases) restent des pas séparés.

## D26 — Catalogue synchronisé optionnel (T29)
Contexte : les collections viennent de `public/carreaux/` produit par `npm run sync:carreaux` ; l’agent n’a pas toujours ces fichiers.
Options : exiger le dossier / charger à l’exécution avec repli.
Choix : `loadCatalogue('./carreaux/')` au boot ; si absent ou invalide → `catalogueMissing` + bandeau `catalogue-missing` ; galerie garde `config/calepinages.json`. Si présent, remplace `calepPresets` par `calepinages.json` synchronisé. Calepinage aligné sur le simulateur de carreaux (rotations hors 0/90/180/270 → 0°, motif trop grand → dernier, listes de motifs).
Conséquence : l’app reste utilisable sans sync ; e2e simule l’absence via `page.route` (corps `{}` pour éviter le bruit console 404).

## D27 — Mode collection vs carreaux manuels (T30)
Contexte : César veut choisir une collection entière plutôt qu’importer des PNG un par un.
Options : remplacer la section Carreaux / section séparée au-dessus.
Choix : section « Collection » en tête ; « Mes carreaux » pour l’import manuel. Sélection → rasterisation des SVG recolorés (`recolorSvg` + couleurs d’origine), `activeCollectionId` + `zoneColors` dans l’état. Import manuel (ou exemple) remet `activeCollectionId` à null. Galerie : groupe « Calepinages de la collection » en premier.
Conséquence : l’historique annule aussi collection / couleurs de zones.

## D28 — Palette forcée en mode collection (T31)
Contexte : une zone SVG = un fil ; k-means introduirait des couleurs parasites.
Options : laisser quantize auto / forcer manuelle sur les hex de zones.
Choix : en mode collection, `recompute` impose `paletteMode: 'manuelle'` avec `yarnColors(...)`. Changer une suggestion ou une pastille recolore les SVG puis re-rasterise. Légende plat/planche : `CODE · Nom` via `paletteLabels`.
Conséquence : sans collection, le comportement V1/V3 (auto ou manuel utilisateur) est inchangé.

## D29 — Projet avec métadonnées collection (T32)
Contexte : rouvrir un projet après `sync:carreaux` doit recharger les SVG à jour.
Options : ne stocker que les PNG rasterisés / stocker id + codes zones + commit.
Choix : champ optionnel `collection: { id, zoneColors, paletteOptionId, syncCommit }` dans le JSON projet. À l’ouverture, si la collection existe encore → `tilesFromCollection` ; sinon → carreaux PNG du fichier + message. Catalogue chargé avant la restauration IndexedDB.
Conséquence : les anciens projets sans `collection` restent valides.

## D30 — Contenant du panneau et fichiers absolus (T33)
Contexte : `#panel` défilait correctement, mais `document.scrollingElement.scrollHeight` restait énorme : les `input.file-input` en `position: absolute` (sans ancêtre positionné) élargissaient le débordement scrollable de la racine.
Options : `position: fixed` sur `body` / retirer absolute des file-input / `position: relative` sur `#panel`.
Choix : `position: relative` sur `#panel`, plus `html/body` overflow hidden, `#app` en `100dvh` + `overflow: hidden`, `min-height: 0` sur panel/viewport, et sous 1280 px deux rangées `minmax(0, 1fr)`.
Conséquence : un seul ascenseur (celui du panneau) ; les file-input restent accessibles dans le flux du panneau.

## D31 — Module share dans src/io (T34)
Contexte : `resolveDevMode` / `leaveDevMode` sont fournis dans `reference/share/shareLink.ts` avec le lien de partage (T35).
Options : importer depuis `reference/` / copier dans `src/io/`.
Choix : copie dans `src/io/shareLink.ts` (même contenu) ; les tests unitaires importent depuis `src/`.
Conséquence : une seule source d’exécution ; la référence reste le fichier d’origine fourni.

## D32 — Format JSON du lien de partage (T35)
Contexte : le lien encode un diff compact, pas le `SockDesign` brut (collection, décor, raccord absents du type V4).
Options : étendre uniquement le payload share / étendre aussi `SockDesign`.
Choix : étendre `SockDesign` (`decor`, `layout.seam`, `tilesAround`, `tileSizeMode`) et sérialiser via `designToShareJson` (sans `tileIds`) ; SVG manuels via `TileAsset.svgText`.
Conséquence : projets JSON anciens restent lisibles (défauts) ; T36–T38 branchent l’UI sur ces champs.

## D33 — Taille de carreau par défaut via « N sur le tour » (T36)
Contexte : le défaut V4 était 24 mailles ; le réglage principal devient N carreaux sur le tour.
Options : garder 24 en mode libre / dériver de N=6.
Choix : `defaultDesign()` calcule largeur/hauteur via `tileWidthForCount(168, 6)` et `tileRowsFor` (mode `around`).
Conséquence : le motif tombe juste dès l’ouverture ; la case « Taille libre » retrouve l’ancien comportement.

## D34 — Raccord via seamColumn dans geometryFromLayout (T37)
Contexte : le raccord doit pouvoir tomber au dos / intérieur / extérieur / devant sans changer le calepinage.
Options : décaler la texture UV / ajouter un offset dans `geometryFromLayout` / décaler à l’affichage seulement.
Choix : `offsetStitches` effectif = offset utilisateur + `seamColumn(seam, needles)` dans `geometryFromLayout` ; UI « Faire tomber juste » repasse en mode `around` (plus proche N) plutôt qu’ajuster la largeur libre.
Conséquence : les tests de calepinage qui attendent un motif démarrant en colonne 0 utilisent `seam: 'interieur'` (seamColumn = 0).

## D35 — Décor : module référence + beforeRender scène (T38)
Contexte : sol/mur en carreaux de ciment, mur toujours face caméra, exports inclus.
Options : photo d’ambiance / générer depuis SVG collection / CDN.
Choix : copie de `reference/decor/tileSurface.ts` ; `decorController` (idle + cache sources) ; `scene.setBeforeRender` pour `faceCamera` à chaque frame ; `capturePng(..., beforeRender)` pour les exports ; mode `coin` = sol + mur.
Conséquence : pas de dépendance réseau ; le décor suit les couleurs choisies ; régénération seulement si options/carreaux changent.

## D36 — Décor v2 mats + grain photo (T40)
Contexte : César trouve le décor T38 trop brillant, joints trop creusés, couleurs pâlies (« jeu vidéo années 90 »).
Options : retoucher les paramètres T38 / remplacer par `reference/decor` v2 (mat, grain photo).
Choix : intégrer sans réécrire `reference/decor/tileSurface.ts` (import `../../core/calepinage`) ; charger `public/textures/grain-ciment.jpg` une fois ; défauts `groutMm` 1,5 / `#f3f1ec` / `attenuation` 0 / `grainStrength` 0,7 ; `tilesPerSide = round(240/tileCm)` ; `pxPerTile` 160 si ≤12 cm sinon 256 ; curseur Grain 0–100 % dans le panneau.
Conséquence : couleurs franches, joints fins clairs, grain visible ; textures 10 cm plus lourdes (timeout e2e 180 s + `decorBuildId`).

## D37 — Visionneuse mobile pleine hauteur
Contexte : sur mobile (≤1279 px) la grille `#app` a 2 rangées 1fr/1fr pour viewport+panneau ; en mode visionneuse le panneau est `display:none` mais la 1re rangée seule reste à 50 %.
Choix : `#app.viewer-mode { grid-template-rows: minmax(0, 1fr); }` + `#viewport { height: 100%; }`.
Conséquence : le canvas occupe toute la hauteur viewport hors mode dev.

## D38 — Toggle décor en visionneuse publique
Contexte : hors `?dev`, l’utilisateur doit pouvoir afficher/masquer le décor sans ouvrir le panneau.
Choix : case à cocher « Décor » dans `viewerBar` (`viewer-decor-toggle`) ; on ↔ dernier mode non-aucun (défaut `coin`) ; off ↔ `aucun` ; mémorisé via `design.decor.mode` (IndexedDB + lien `#p=` déjà en place).
Conséquence : pas de nouvel état parallèle ; le panneau `?dev` et la visionneuse restent synchronisés.

## D39 — Empreintes golden via PNG pré-rasterisés (T41)
Contexte : la chaîne carreaux doit être figée avant V6 ; la pixelisation SVG dépend du DOM (interdit en Vitest node).
Options : e2e Playwright pour les empreintes / fixtures PNG déjà pixelisées + chaîne pure / images synthétiques seules.
Choix : PNG RGBA filtre 0 dans `tests/fixtures/golden/` (exemples publics + medina/lianes du catalogue mini, recolorés), lus via `decodePng` ; empreintes FNV-1a déjà fournies par `gridFingerprint`. Script `scripts/rasterize-golden-fixtures.mjs` pour régénérer (Playwright + encode filtre 0).
Conséquence : 4 scénarios couvrent calepinage suite, préréglage medina, lianes reco + femme sans côte, quinconce+rot aléatoire ; le test ne doit jamais être retouché pour « passer ».

## D40 — Source de motif `design.pattern` (T42)
Contexte : préparer la composition libre sans toucher au calepinage carreaux.
Options : remplacer `layout` / dualité parallèle hors design / champ `pattern` discriminant.
Choix : `SockDesign.pattern = { kind:'carreaux' } | { kind:'composition', composition }` (défaut carreaux) ; `computePatternRgb` aiguille ; champ absent à la lecture projet/lien ⇒ carreaux. Copie de `reference/composition` vers `src/core/composition.ts` dès T42 pour que l’aiguillage compile (images branchées en T45).
Conséquence : recompute, quantize, grille, 3D et exports inchangés ; golden T41 reste le filet.



## D41 — Collections locales fusionnées (T43)
Contexte : César veut ajouter des collections sans passer par le simulateur de carreaux.
Options : catalogue séparé / fusion dans public/carreaux / CDN.
Choix : dossier `collections-locales/` même format ; sync complète fusionne (locale gagne) ; `npm run sync:local` met à jour seulement les locales. PNG : `zones: []`, pas de recoloration, quantize auto + hint UI.
Conséquence : une seule source runtime (`public/carreaux/`) ; catégorie « Mes collections ».

## D42 — Admin collections : ZIP store sans dépendance (T44)
Contexte : Firefox/Safari n’ont pas File System Access ; il faut un export dossier.
Options : jszip / fflate / ZIP store maison.
Choix : `src/io/zipStore.ts` (méthode store, CRC32) + mode dossier Chrome/Edge. Entrée Vite `admin.html`. Zones SVG pures dans `svgZones.ts`.
Conséquence : aucune nouvelle dépendance npm ; e2e valide le ZIP téléchargé.

## D43 — Cache images composition (T45)
Contexte : renderComposition a besoin de RasterImage ; SVG/PNG viennent du DOM.
Choix : cache module `io/compositionImages.ts` (clé assetKey+couleurs+taille) ; recompute déclenche un chargement async une fois puis recalcule. Palette : zones SVG + fond + couleurs exactes PNG si ≤ N.
Conséquence : premier frame peut être fond seul, puis motif dès images prêtes ; golden carreaux intact.

## D44 — Éditeur composition MVP + import en T47 (T46)
Contexte : T46 demande bibliothèque + import embarqué ; les `EmbeddedAsset` et projet v2 sont T47.
Choix : bibliothèque collections pleinement branchée ; bouton Import présent mais renvoie vers T47 pour la persistance des images. Drag-and-drop fichier sur la vue à plat idem. Split vertical CSS + poignée ; aimantation douce désactivable.
Conséquence : e2e T46 couvre le flux bibliothèque → clavier → supprimer ; l’import fichier est complété avec le projet v2.
