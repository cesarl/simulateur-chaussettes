# Journal d'avancement

Modèle d'entrée (la plus récente en bas) :

```
## T0X — <titre> — <date AAAA-MM-JJ HH:MM>
Statut : terminée | bloquée
Fait : <2-4 lignes>
Vérification : npm run verify ✅ (N tests unitaires, M e2e) ; contrôle visuel : <ce qui a été vu sur la capture>
Décisions : <renvoi vers DECISIONS.md ou « aucune »>
Reste / risques : <…>
```

---

## T00 — Squelette initial — 2026-09-25
Statut : terminée (préparé par Claude avant le lancement de l'agent)
Fait : Vite 8 + TypeScript 7 + Three.js 0.186 + Vitest 5 + Playwright 1.63. Scène 3D avec cylindre provisoire, `config/sizes.json` provisoire, types centraux, 3 carreaux de test dans `public/fixtures/`.
Vérification : `npm run verify` ✅ (3 tests unitaires, 1 test e2e).

## T01 — Prise en main du squelette — 2026-09-25 06:36
Statut : terminée
Fait : Lecture du cahier, de l'architecture, des types et de `config/sizes.json`. `npm install` et `npx playwright install chromium` (Chromium 153). Aucune modification du code source.
Vérification : Node v22.14.0, npm 10.9.7. `npm run verify` ✅ (3 tests unitaires, 1 test e2e).
Décisions : aucune
Reste / risques : le cylindre 3D est provisoire ; les valeurs de tailles restent à confirmer avec le fabricant.

## T02 — Carte des zones et composition de la grille — 2026-09-25 06:38
Statut : terminée
Fait : `color.ts` (hex ↔ RVB, distance redmean) et `grid.ts` (`rowRanges`, `buildZoneMap`, `composeGrid`). Talon et pointe sur la moitié arrière `[0, needles/2)`, le reste `Zone.Empty`. Palette = couleurs de zones présentes + palette de motif, sans doublon. Sans échantillon, la tige (et le pied si motif) prend le fond `#f4f1ea`.
Vérification : `npm run verify` ✅ (11 tests unitaires, 1 e2e).
Décisions : D03 (couleurs de fond et hors tricot).
Reste / risques : l'ordre des indices de motif (rang majeur, mailles de motif seulement) doit être respecté par le calepinage en T04.

## T03 — Import des carreaux — 2026-09-25 06:42
Statut : terminée
Fait : Store (`getState`, `update` par fusion, `subscribe`) avec modèle homme, grille, 4 couleurs auto, bord-côte. Import PNG/SVG (`loadTileFromFile`, `loadTileFromUrl`) : SVG au moins 512 px sur le petit côté, PNG natif plafonné à 1024 px. Panneau Carreaux : import multiple, glisser-déposer, vignettes, suppression, ordre, exemple. `window.__SIM__.loadFixture`.
Vérification : `npm run verify` ✅ (13 tests unitaires, 5 e2e).
Décisions : D04 (valeurs du modèle par défaut).
Reste / risques : la grille affichée ignore encore le motif (calepinage en T04). Le cylindre 3D reste provisoire.

## T04 — Calepinage — 2026-09-25 06:47
Statut : terminée
Fait : `samplePattern` (tous les `LayoutKind`, joint, décalage, rotation globale, graine mulberry32), sur-échantillonnage 4×4 majoritaire ou moyenne, transparence vers le fond du carreau. `tileRowsForWidth`, `repeatWidth`, `seamMismatch`, `nearestFittingWidth`. Sortie RVB de la zone motif seulement.
Vérification : `npm run verify` ✅ (28 tests unitaires, 5 e2e). Le test 200×600 tient dans la marge ×2 (la suite unitaire entière fait ~300 ms).
Décisions : D05 (sens des décalages, joint, transparence, période ×2).
Reste / risques : le panneau n’appelle pas encore le calepinage (branché au recalcul en T08).

## T05 — Réduction des couleurs — 2026-09-25 06:49
Statut : terminée
Fait : `quantize` en mode auto (k-means++ à graine fixe, ou couleurs exactes s'il y en a déjà au plus N) et manuel (plus proche voisin redmean). Despeckle en un passage sur la grille d'origine. Palette triée par effectif. N borné de 2 à 8.
Vérification : `npm run verify` ✅ au moment de l'implémentation (31 tests unitaires, 5 e2e). Le code a été poussé avec le commit du maillage, cette entrée ferme la tâche.
Décisions : D06 (graine, distance, un seul passage de nettoyage).
Reste / risques : pas encore branché au recalcul de la grille visible (T08).

## T06 — Maillage 3D de la chaussette — 2026-09-25 06:56
Statut : terminée
Fait : `sockPositions` / `sockUvs` purs, maillage (aiguilles+1)×(rangs+1), UV exactes, échelle en mètres, talon avant d'épaisseur nulle, poche arrière, pied horizontal à semelle plate, pointe fermée. Le cylindre provisoire est remplacé. Couleurs de zones en sommets. Caméra recadrée sur la boîte englobante.
Vérification : `npm run verify` ✅ (35 tests unitaires, 6 e2e). Contrôle visuel de `test-results/visuel-t06-homme.png` et `visuel-t06-femme.png` : fond gris-beige ; ouverture sombre en haut ; bord-côte bleu marine ; tige crème quasi cylindrique ; renflement terracotta à l'arrière (talon) ; pied horizontal crème, plus bas que la tige ; pointe sombre et arrondie qui ferme le volume. La femme a la même silhouette, un peu plus petite dans le cadre. Tige, talon, pied et pointe sont reconnaissables.
Décisions : D07 (courbe de talon, semelle, pointe).
Reste / risques : les mailles sont encore des aplats de couleur (texture tricot en T07). Le motif des carreaux n'est pas encore projeté.

## T07 — Texture de mailles — 2026-09-25 07:00
Statut : terminée
Fait : `DataTexture` de la grille (NearestFilter, sRGB, `needsUpdate` sans reconstruire le maillage). Relief de jersey (normales + occlusion) répété par maille, mipmaps et anisotropie max. Bord-côte en côtes verticales. Matériau rugueux, sans métal, double face, intérieur assombri.
Vérification : `npm run verify` ✅ (35 tests unitaires, 7 e2e). Contrôle visuel de `test-results/visuel-t07-mailles.png` (vue zoomée) : on ne voit pas des carrés plats. La tige et le pied portent des mailles en V, creusées au centre, répétées. Le bord-côte bleu en haut est en bandes verticales, distinct du jersey. Talon terracotta et pointe sombre restent identifiables. Changer la couleur du talon incrémente `textureUpdates` et laisse `geometryBuilds` inchangé. Aucun avertissement WebGL.
Décisions : D08 (relief, `vMapUv`, intérieur × 0,38).
Reste / risques : le motif des carreaux n'est pas encore recalculé depuis le panneau (T08).

## T08 — Panneau de réglages — 2026-09-25 07:08
Statut : terminée
Fait : Sections repliables Carreaux, Calepinage, Dimensions, Gros pixels, Zones, Contrôles, Exports. Curseurs couplés aux champs numériques (anti-rebond 120 ms), couleurs, listes, unités en français. Le recalcul enchaîne calepinage, réduction de couleurs et composition de la grille. La tige au-dessus du maximum est ramenée, avec un message. Durée du dernier calcul et raccord circulaire affichés. Palette du motif avec effectifs.
Vérification : `npm run verify` ✅ (35 tests unitaires, 10 e2e). Les trois scénarios du panneau passent : quinconce + 3 couleurs + femme (palette de motif ≤ 3), bord-côte retiré (`hauteur − cuffRows`), tige trop haute ramenée au maximum.
Décisions : D09 (sections Contrôles et Exports en attente, fils manuels de départ).
Reste / risques : Contrôles de fabrication et exports PNG ne sont pas encore branchés (T12, T10). La vue à plat manque (T09).

## T09 — Vue à plat — 2026-09-25 07:12
Statut : terminée
Fait : Bascule « 3D / À plat » au-dessus de la vue. Canvas 2D, mailles en rectangles au rapport réel (4×3 px à la jauge actuelle), zoom molette entier et déplacement au glisser. Quadrillage à partir de 12 px de large. Repères de zones à gauche, numéros tous les 10. Survol : maille, rang, zone, couleur.
Vérification : `npm run verify` ✅ (35 tests unitaires, 11 e2e). Contrôle visuel de `test-results/visuel-t09-plat.png` : fond beige ; bande bleu marine en haut (bord-côte) puis plage crème (tige) ; pastilles et libellés « Bord-côte » et « Tige » à gauche ; numéros de mailles et de rangs (0, 10, 20…) ; bouton « À plat » actif à droite ; mention « Survolez une maille. » en bas à gauche. Les pixels des mailles (4, 4) et (4, 40), hors quadrillage, coïncident avec la grille. Retour en 3D sans erreur console.
Décisions : D10 (taille entière des mailles, seuil du quadrillage).
Reste / risques : le survol et le zoom ne sont pas couverts par un test e2e dédié. Exports PNG ensuite (T10).

## T10 — Exports PNG — 2026-09-25 07:16
Statut : terminée
Fait : Vues 3D hors écran (face, trois-quarts, profil extérieur, dos, profil intérieur) en 1024, 2048 ou 4096, fond uni ou transparent, cadrage à 85 % sans bouger la caméra de l'utilisateur. Plat exact 1 px = 1 maille. Plat lisible ×8, rapport de maille, quadrillage, zones, légende avec effectifs. Un téléchargement par fichier, espacés de 250 ms. Noms `modele_homme_face.png`, etc.
Vérification : `npm run verify` ✅ (35 tests unitaires, 12 e2e). Contrôle visuel de `test-results/visuel-t10-face.png` : fond beige uni `#eeeae4` ; la chaussette est entière dans le cadre, ouverte en haut, bord-côte bleu marine, tige crème, pied horizontal crème qui vient vers l'avant, pointe sombre. Elle occupe la plus grande partie de l'image carrée, avec une marge régulière. `visuel-t10-plat-exact.png` fait 168×516 px (aiguilles × rangs homme) : bande bleu marine puis plage crème, sans marge ajoutée. Le nombre de couleurs du plat exact ne dépasse pas la palette.
Décisions : D11 (caméra dédiée, pas de ZIP, échelle du plat lisible).
Reste / risques : le plat lisible et le fond transparent ne sont pas couverts par l'e2e (seulement face 1024 et plat exact).

## Jalon 1 — démo fabricant — 2026-09-25 07:16
Statut : atteint
Fait : T01 à T10. Depuis un carreau (exemple ou import PNG/SVG), on obtient le calepinage, la réduction de couleurs, la chaussette 3D texturée, la vue à plat et les PNG (5 angles, plat exact, plat lisible).
Vérification : `npm run verify` ✅ (35 tests unitaires, 12 e2e).
Décisions à relire : D03 à D11.
Reste / risques : valeurs de tailles encore provisoires ; contrôles de fabrication, projets et shader chevron sont le jalon 2.

## T11 — Enregistrer / ouvrir un projet — 2026-09-25 07:21
Statut : terminée
Fait : Export JSON du modèle et des carreaux en PNG base64. Import avec validation (version, champs, couleurs, carreaux référencés) et message « Fichier de projet invalide ». Sauvegarde automatique dans IndexedDB, restaurée avant l’affichage. Boutons Enregistrer / Ouvrir dans Exports.
Vérification : `npm run verify` ✅ (38 tests unitaires, 13 e2e). Aller-retour y compris un carreau 180×180. e2e : exemple + taille femme, enregistrement, retour en homme, rechargement, ouverture du fichier, même empreinte de grille.
Décisions : D12 (schéma JSON, restauration avant `ready`).
Reste / risques : un PNG de projet avec un filtre autre que 0 est refusé. Pas encore de contrôles de fabrication (T12).

## T12 — Contrôles de fabrication — 2026-09-25 07:24
Statut : terminée
Fait : Pastilles vert/orange pour les couleurs totales, les couleurs par rang, les flottés et le raccord. Flottés circulaires sur les zones de motif, surlignés par un pixel orange dans la vue à plat. Bouton qui ajuste la largeur du carreau pour que le motif tombe juste.
Vérification : `npm run verify` ✅ (40 tests unitaires, 14 e2e). Un flotté de 8 est signalé avec le seuil 7, un flotté de 7 ne l’est pas. e2e : largeur 20 (décalage), puis ajustement, reste 0.
Décisions : D13 (hors tricot ignoré, surlignage en coin).
Reste / risques : une couleur unie sur toute la tige est comptée comme un flotté par rang. Performances du recalcul ensuite (T13).

## T13 — Performances — 2026-09-25 07:25
Statut : terminée
Fait : Mesure de `samplePattern` + `quantize` sur 200 × 600, deux carreaux bruités, 6 couleurs, despeckle. Trois passages : 97 ms, 102 ms, 99 ms. Sous les 300 ms, donc pas de Web Worker. L’anti-rebond garde le dernier réglage.
Vérification : `npm run verify` ✅ (41 tests unitaires, 15 e2e). e2e : rotation de la vue puis 10 saisies rapides du nombre de couleurs ; la valeur finale est 4, la largeur de grille reste égale aux aiguilles, pas d’erreur console.
Décisions : D14 (pas de worker).
Reste / risques : le budget est tenu sur cette machine. Une machine plus lente fera échouer le test à 300 ms, ce qui sera le signal pour extraire le worker.

## T14 — Fidélité des mailles (shader chevron) — 2026-09-25 07:32
Statut : terminée
Fait : Dans `onBeforeCompile`, la lecture de `map` est décalée horizontalement selon la position dans la maille pour que la frontière verticale suive un V. Option « Rendu simple / Rendu fidèle » (`ctl-knit-fidelity`), hors fichier projet. Bord-côte inchangé (côtes droites).
Vérification : `npm run verify` ✅ (41 tests unitaires, 16 e2e). Contrôle visuel : `visuel-t14-simple.png` — motif étoile crème/marine/rouge, cellules de couleur à bords plutôt droits, relief jersey présent ; talon rouge. `visuel-t14-fidele.png` — même cadrage et motif, mais les frontières de couleur dentelées en chevron le long des V ; fichiers nettement différents (≈445 ko vs 438 ko). Export plat exact toujours téléchargé, indépendant du shader. Les tests d’export T10 passent.
Décisions : D15.
Reste / risques : l’effet est surtout visible au zoom sur un motif contrasté.

## T15 — Export BMP indexé et planche — 2026-09-25 07:35
Statut : terminée
Fait : BMP 8 bits indexé (`encodeIndexedBmp`) 1 px = 1 maille, palette BGRA, lignes bas→haut, padding 4 octets. Planche PNG : titre, 4 vues 512² (face, trois-quarts, profil extérieur, dos), grille agrandie, légende palette. Cases `export-bmp` et `export-board`.
Vérification : `npm run verify` ✅ (43 tests unitaires, 17 e2e). BMP `modele_homme_grille.bmp` : signature BM, 8 bits, dimensions = aiguilles × rangs. Planche PNG > 500×500.
Décisions : D16.
Reste / risques : format BMP à confirmer avec le fabricant.

## T16 — Finitions de l'interface — 2026-09-25 07:40
Statut : terminée
Fait : Raccourcis R/F/T/E/D/I, bandeau d’aide, bulles « ? » sur les réglages principaux, état vide accueillant, CSS responsive (colonne sous 1280 px), focus visible clavier. Caméra exposée dans `__SIM__` et mise à jour pendant l’orbite.
Vérification : `npm run verify` ✅ (43 tests unitaires, 18 e2e).
Décisions : D17 (raccourcis et aides).
Reste / risques : pas de bulles sur chaque export individuel (les réglages métier sont couverts).

## T17 — Intégration continue et publication — 2026-09-25 07:41
Statut : terminée
Fait : Vérifié `.github/workflows/ci.yml` : `npm ci`, `npx playwright install --with-deps chromium`, `npm run verify` sur push et PR, Node 22. Documenté dans `README.md` le déploiement de `dist/` (Cloudflare Pages et GitHub Pages), sans déployer.
Vérification : `npm run verify` ✅ (inchangé côté code applicatif hors README).
Décisions : aucune.
Reste / risques : aucun.

## T18 — Valeurs fabricant — 2026-09-25 07:41
Statut : bloquée
Fait : `config/sizes.json` n’a pas été mis à jour par César (valeurs toujours provisoires). Impossible de relancer l’ajustement des tests et captures de référence sans les nouvelles valeurs. Modification de `config/sizes.json` interdite à l’agent.
Vérification : non applicable.
Décisions : aucune.
Reste / risques : dès que César confirme les tailles, reprendre T18 (tests + captures).

## T19 — Intégrer forme et matériau sock3d — 2026-09-25 08:49
Statut : terminée
Fait : Copie de `reference/sock3d/` vers `src/render/sock3d/`. Scène branchée sur `createStudio` (NeutralToneMapping, ombres, RoomEnvironment). `createSockObject` + `setShape`/`setColors`/`setChevron` remplacent `sockGeometry`/`knitTexture` (supprimés). Démo `sock-demo.html` en 2ᵉ entrée Vite. Tests unitaires sock3d déplacés (imports seuls).
Vérification : `npm run verify` ✅ (48 unitaires dont 9 sock3d, 19 e2e). Contrôle visuel `visuel-t06-homme.png` : chaussette anatomique (mollet, talon en poche, pied, pointe), bord-côte marine côtelé, talon terracotta, pointe noire, ombre de contact, plus de cylindre/pavé. Comparaison avec `reference/sock3d/captures/homme-etoile-trois-quarts.png` : même silhouette et studio.
Décisions : D18.
Reste / risques : exports 3D encore via l’ancien cadrage `views.ts` (T20).

## T20 — Vues et exports studio — 2026-09-25 08:54
Statut : terminée
Fait : Exports 3D via `capturePng` / `frameView`. Vue « trois-quarts dos » ajoutée. Fond défaut `#ecebe8`. Zoom OrbitControls borné après cadrage. e2e studio-export.
Vérification : `npm run verify` ✅ (48 unitaires, 20 e2e). Capture `visuel-t20-trois-quarts.png` : chaussette anatomique cadrée, fond clair, ombre de contact. Transparent : alpha coin = 0 ; canvas et caméra inchangés après export.
Décisions : D19.
Reste / risques : T21 comparaison silhouette vs captures référence.

## T21 — Contrôle visuel vs référence — 2026-09-25 08:58
Statut : terminée
Fait : e2e `rendu-reference.spec.ts` (config homme-étoile, IoU silhouette ≥ 0,90 sur trois-quarts / profil ext. / dos à 1200 px). Crochet `__SIM__.captureView`.
Vérification : `npm run verify` ✅ (48 unitaires, 21 e2e). Captures ouvertes :
- `visuel-T21-trois-quarts.png` : mollet, cheville, talon poche rouge, semelle à plat, pointe arrondie rouge ; motif étoile crème/marine/rouge ; relief jersey ; bord-côte côtes verticales marine ; ombre de contact ; pas de trou, pas de cratère pointe, pas de couture visible, pas de facettes.
- `visuel-T21-profil-exterieur.png` : profil L anatomique, même fidélité motif/matériau, aligné avec la référence.
- `visuel-T21-dos.png` : dos avec talon rouge centré, motif qui remonte la tige, comparable à `homme-etoile-dos.png`.
Décisions : aucune (comportement = module référence).
Reste / risques : T22 bonus pied gauche + export paire.

## T22 — Pied gauche et export paire — 2026-09-25 09:08
Statut : terminée
Fait : Sélecteur `ctl-foot-side` (droit/gauche → `side` du module). Export « Paire » : deux `SockObject` temporaires, gauche en retrait + yaw 15°, ombre sol masquée pour séparer les silhouettes. e2e via `__SIM__.capturePair`.
Vérification : `npm run verify` ✅ (48 unitaires, 22 e2e). Capture `visuel-T22-paire.png` ouverte : deux chaussettes anatomiques côte à côte (bord-côte marine, corps crème, talon terracotta, pointe sombre), cadrage trois-quarts commun, fond `#ecebe8`, deux composantes connexes confirmées.
Décisions : D20.
Reste / risques : T18 toujours bloquée.

## T23 — Forme anatomique v2 (loft ANSUR II) — 2026-09-25 12:04
Statut : terminée
Fait : Copie littérale de `reference/sock3d/sockShape.ts` (loft profils avant/arrière + largeurs asymétriques ANSUR II) vers `src/render/sock3d/`. Autres fichiers du module inchangés (sauf `setChevron` déjà présent). Tests unitaires réorientés vers `src/render/sock3d/`. e2e T21 silhouette vs nouvelles captures.
Vérification : `npm run verify` ✅ (48 unitaires, 22 e2e dont IoU ≥ 0,90). Captures ouvertes :
- `visuel-T21-trois-quarts.png` : mollet → cheville sans rupture ; **dessus du pied en pente régulière (pas de bosse)** ; talon rouge arrondi en poche ; semelle posée à plat ; pointe rouge arrondie ; motif étoile crème/marine/rouge ; relief jersey + côtes bord-côte marine ; ombre de contact ; pas de trou / cratère / couture / facettes. Aligné sur `homme-etoile-trois-quarts.png`.
- `visuel-T21-profil-exterieur.png` : profil L anatomique, Achille creusé, instep lisse, semelle plate, talon et pointe rouges nets — comparable à la réf. profil.
- `visuel-T21-dos.png` : talon rouge centré arrondi, tige qui s’affine vers la cheville, motif qui remonte, ombre au sol.
Décisions : D21.
Reste / risques : T18 toujours bloquée (tailles fabricant). CI GitHub a eu un flake e2e (`sock.spec` distinctColors / vignettes lentes sur SwiftShader) — timeouts et attente paint renforcés (commit suivant).

## Point pour César

Ce qui marche : **forme 3D v2** (T23) — loft ANSUR II, silhouette IoU ≥ 0,90 vs nouvelles captures `reference/sock3d/captures/`. T19–T22 restent valides (studio, exports, paire, pied G/D). Vue à plat / réglages / exports plats inchangés.

Captures produites (repo `test-results/` + store `media/`) :
- T23 / T21 : `visuel-T21-trois-quarts.png`, `visuel-T21-profil-exterieur.png`, `visuel-T21-dos.png`
- Réf. cibles : `reference/sock3d/captures/homme-etoile-{trois-quarts,profil-exterieur,dos}.png`

Tester en 3 étapes :
1. `npm install` puis `npm run dev`.
2. Charger exemple étoile ; vue Trois-quarts — vérifier le dessus du pied (pente régulière, sans bosse).
3. Exporter Profil extérieur / Dos 1200 et comparer aux captures de `reference/sock3d/captures/`.

Décisions à relire : D21 (forme v2) ; D18–D20 si pas encore lues.

Blocages : T18 — `config/sizes.json` fabricant.

## T24 — Talon réglable — 2026-09-25 12:42
Statut : terminée
Fait : Copie `sockShape.ts` (HEEL_DEFAULTS + heelHeight/Depth/Spread). État `zones.heelHeightMm` / `heelDepthMm` / `heelSpread` (%), migration projets. Curseurs Zones › Talon + aide fabricant. Branchement `shapeFromDesign` / `surfaceKeyOf` → rebuild géométrie. e2e `heel-preview.spec.ts`.
Vérification : unitaires sock3d + project verts ; e2e talon + T21 IoU ≥ 0,90 verts. Captures ouvertes :
- T21 trois-quarts / profil / dos : talon rouge **plus bas** qu’en V2 (défaut 55 mm), dessus du pied en pente régulière, semelle plate, motif étoile, relief jersey, pas d’artefact.
- `visuel-T24-talon-bas.png` (h=40) : poche talon rouge compacte au dos/sous le pied.
- `visuel-T24-talon-haut.png` (h=95) : même vue, zone rouge nettement plus haute vers la cheville (+30 % pixels talon).
Décisions : D22.
Reste / risques : enchaîner T25 (calepinage multi-motifs).

## T25 — Moteur de calepinage multi-motifs — 2026-09-25 12:55
Statut : terminée
Fait : `src/core/calepinage.ts` + `config/calepinages.json` ; `LayoutSettings.calepinage` remplace `kind` ; migration V1 ; `layout.ts` réécrit (plan → case → UV → pixel) ; raccord/`fittingTileWidths` ; liste déroulante = 11 GENERATED_PRESETS (galerie en T26).
Vérification : unitaires (dont calepinage 13 + multi 2 + migration) verts ; e2e multi + T21 verts. Captures :
- `visuel-T25-suite-rotalea-3d.png` : trois-quarts ; on distingue clairement les 3 motifs (étoile, quart de cercle / diagonales teal, damier) avec rotations variées sur la tige et le pied ; talon terracotta ; pointe sombre ; bord-côte marine.
- `visuel-T25-suite-rotalea-plat.png` : vue à plat ; même enchaînement de carreaux sur la tige (étoile / damier / quart), bord-côte marine, talon terracotta à gauche.
Décisions : D23.
Reste / risques : T26 galerie 75 préréglages.

## T26 — Galerie de calepinages — 2026-09-25 13:10
Statut : terminée
Fait : `src/ui/calepGallery.ts` — Rapides (11) + 75 préréglages par famille, filtre, personnaliser, nouveau tirage, import JSON, numéros de motifs sur les carreaux.
Vérification : e2e galerie (86 vignettes / tous ; rosace ; reroll ; filtre ≤) verts. Capture `visuel-T26-galerie.png` : bloc de vignettes (aperçus en grille), familles, « Aléatoire » sélectionné (bordure accent), bouton « Nouveau tirage », « Personnaliser » replié, import JSON, avertissements d’import.
Décisions : D24.
Reste / risques : T27 reset/undo.

## T27 — Réinitialiser, annuler, rétablir — 2026-09-25 13:20
Statut : terminée
Fait : historique 100 pas (`undo`/`redo`, Ctrl/Cmd+Z), coalesce curseurs 400 ms, reset par section + pastille « modifié », `reset-all` avec confirmation 4 s (carreaux conservés).
Vérification : unitaires history + e2e history verts (27 e2e au total).
Décisions : D25.
Reste / risques : T28 bilan.

## T28 — Bilan V3 pour César — 2026-09-25 13:22
Statut : terminée
Fait : README Utilisation à jour (galerie, tirage, talon, reset, Ctrl+Z). Quatre captures bilan + Point pour César ci-dessous.
Vérification : `npm run verify` (lancer après ce commit).
Décisions à relire : D22–D25.
Reste / risques : T18 toujours bloquée (fabricant).

## Point pour César

### Ce qui marche (V3)
- **Talon réglable** (aperçu 3D seulement) : hauteur / profondeur / largeur dans Zones.
- **Calepinage multi-motifs** : moteur + 75 préréglages + 11 rapides, galerie filtrable, nouveau tirage, import JSON.
- **Confort** : Réinitialiser par section, Tout réinitialiser (garde les carreaux), Annuler/Rétablir (Ctrl/Cmd+Z).

### Tester en 3 étapes
1. `npm install` puis `npm run dev`.
2. Charger les 3 exemples ; dans la galerie choisir « À la suite, rotation aléatoire » puis « Rosace » / un Ophis — vérifier les 3 motifs et les rotations.
3. Baisser « Hauteur du talon » à 40 mm ; Annuler ; Tout réinitialiser (Confirmer ?).

### Captures bilan (`test-results/` + store `media/`)
- `visuel-T28-suite-rotalea.png` : trois-quarts, 3 motifs (étoile / quart / damier) avec rotations variées, talon terracotta, pointe noire, bord-côte marine.
- `visuel-T28-rosace.png` : préréglage Rosace — quarts de cercle / losanges bleus-rouges en bloc 2×2 tourné, motif cohérent autour de la jambe.
- `visuel-T28-ophis.png` : préréglage Ophis — grille noire à pastilles orange + motifs teal/étoile, mapping anatomique propre.
- `visuel-T28-talon-bas.png` : profil extérieur, talon orange **compact** (40 mm), semelle plate, motif Ophis sur tige/pied.

### Décisions à relire
D22 (talon aperçu), D23 (CalepinageSpec), D24 (galerie), D25 (historique coalesce).

### Blocages
T18 — `config/sizes.json` en attente fabricant.

## T29 — Script de synchronisation et catalogue — 2026-09-25 15:10
Statut : terminée
Fait : `npm run sync:carreaux` ; `src/core/collections.ts` + `calepinage.ts` alignés sur `reference/` ; `src/io/catalogue.ts` charge `./carreaux/` ; bandeau `catalogue-missing` si absent ; galerie utilise les calepinages sync quand présents.
Vérification : unitaires collections + calepinage verts ; e2e catalogue (absent / présent) verts ; `npm run verify` en cours de boucle.
Décisions : D26.
Reste / risques : T30 choix de collection.

## T30 — Choisir une collection — 2026-09-25 15:15
Statut : terminée
Fait : section Collection (recherche, catégories, vignettes SVG recolorées, show-dev) ; sélection → carreaux VAR1…N + calepinage défaut + groupe « Calepinages de la collection » ; import manuel quitte le mode collection.
Vérification : e2e medina (mini catalogue via route) vert ; captures T30 ouvertes.
Contrôle visuel :
- `visuel-T30-medina.png` : trois-quarts ; motif géométrique mosaïque (marine / terracotta / crème / beige) sur tige et pied ; bord-côte marine côtelé ; talon terracotta ; pointe sombre ; ombre de contact ; silhouette anatomique propre.
- `visuel-T30-lianes.png` : motifs verts à volutes / cercles crème sur fond vert ; bord-côte marine ; talon rouge ; pointe noire ; même cadrage studio.
- `visuel-T30-ophis.png` : fond bleu clair, figures serpentines olive/crème à œil rouge, petits blocs bruns ; bord-côte marine ; talon rouille ; pointe noire.
Décisions : D27.
Reste / risques : T31 palettes / nuancier.

## T31 — Palettes et couleurs de fil — 2026-09-25 15:25
Statut : terminée
Fait : section Couleurs (bandes paletteOptions, pastilles zones, nuancier, match-zones) ; mode collection force quantize manuelle sur les hex de zones ; légende export « CODE · Nom ».
Vérification : unitaire medina 4 hex ; e2e lianes reco/nuancier/match verts ; captures ouvertes.
Contrôle visuel :
- `visuel-T31-lianes-defaut-3d.png` : lianes vert foncé + volutes crème, bord-côte marine, talon rouge, pointe noire.
- `visuel-T31-lianes-reco1-3d.png` : même collection, fond crème / traits verts plus clairs (suggestion artiste 1) — palette nettement différente.
- `visuel-T31-lianes-defaut-plat.png` / `…-reco1-plat.png` : vue à plat confirmant le même contraste de palette (fond vert vs fond crème).
Décisions : D28.
Reste / risques : T32 projets + bilan.

## T32 — Projets, synchronisation et bilan — 2026-09-25 15:30
Statut : terminée
Fait : projet JSON avec `collection` (id, zoneColors, paletteOptionId, syncCommit) ; réouverture recharge les SVG depuis le catalogue ; message si collection absente ; README Collections ; 4 captures bilan.
Vérification : `npm run verify` ✅ (unitaires + 35 e2e).
Décisions : D29.
Reste / risques : T18 toujours bloquée.

## Point pour César

### Ce qui marche (V4)
- **Collections** synchronisées (`npm run sync:carreaux` → `public/carreaux/`) : chercher, choisir Medina / Lianes / Ophis / Amour…
- **Palettes** : couleurs d’origine + suggestions artiste ; nuancier par zone ; assortir bord-côte/talon/pointe ; palette motif = fils exacts (pas de k-means).
- **Projet** : enregistre collection + codes zones + commit sync ; se recharge après une nouvelle sync.

### Tester en 3 étapes
1. `npm install` puis `npm run dev` (données déjà dans `public/carreaux/`).
2. Section **Collection** → Medina (4 motifs) ; basculer une **Suggestion de l’artiste** ; **Assortir** talon/pointe.
3. **Enregistrer** le projet, changer de collection, **Ouvrir** le fichier → Medina revient avec ses couleurs.

### Captures bilan (`test-results/` + store `media/`)
- `visuel-T32-medina.png` : mosaïque géométrique marine / terracotta / pêche ; bord-côte marine ; talon rouille ; pointe noire.
- `visuel-T32-lianes.png` : volutes crème sur vert ; même structure zones.
- `visuel-T32-ophis.png` : motifs serpentins olive sur bleu clair.
- `visuel-T32-amour.png` : fond blanc, lettre « amour » et cœurs rouges pixelisés ; bloc cœur sur le cou-de-pied.

### Décisions à relire
D26 (catalogue optionnel), D27 (mode collection), D28 (palette forcée), D29 (projet + syncCommit).

### Blocages
T18 — `config/sizes.json` en attente fabricant.

## T33 — Un seul ascenseur — 2026-09-25 20:19
Statut : terminée
Fait : CSS grille (`100dvh`, `minmax(0,1fr)`, `overflow: hidden`) ; `position: relative` sur `#panel` pour contenir les `file-input` absolus qui gonflaient `scrollingElement.scrollHeight`. e2e `scroll.spec.ts` (1400×900 et 1100×800).
Vérification : `npm run verify` ✅ (94 unitaires, 37 e2e).
Décisions : D30.
Reste / risques : T34 masquera le panneau hors `?dev` (les e2e scroll devront alors passer par `/?dev`).

## T34 — Visionneuse et mode ?dev — 2026-09-25 20:30
Statut : terminée
Fait : `shareLink.ts` intégré (`resolveDevMode` / `leaveDevMode`) ; barre visionneuse (vues + copier le lien) ; panneau / vue à plat seulement en mode dev mémorisé ; e2e existants pointent vers `/?dev` ; `viewer.spec.ts`.
Vérification : `npm run verify` ✅ (94 unitaires, 39 e2e).
Décisions : D31 (copie du module share dans `src/io/`).
Reste / risques : le bouton « Copier le lien » copie encore l’URL sans payload compressé (T35).

## T35 — Lien de partage — 2026-09-25 20:45
Statut : terminée
Fait : `shareState.ts` (diff vs défaut, collection, décor, raccord) ; hash `#p=1.…` tenu à jour (500 ms) ; copie panneau + visionneuse ; hash prime sur IndexedDB ; SVG manuels si lien court. Champs `seam` / `tilesAround` / `decor` ajoutés au modèle pour le lien (UI en T36–T38).
Vérification : `npm run verify` ✅ (unitaires + 40 e2e). Captures source (dev) / cible (visionneuse) : même Medina (marine / terracotta / pêche), bord-côte marine, talon terracotta, pointe sombre.
Décisions : D32.
Reste / risques : push GitHub intermittent (token) ; enchaîner T36.

## T36 — Jauge et carreaux sur le tour — 2026-09-25 20:55
Statut : terminée
Fait : `tileWidthForCount` / `tileRowsFor` / raccord fractionnaire ; UI « Carreaux sur le tour » + taille libre ; encadré `gauge-readout` ; section machine repliée ; défaut = 6 carreaux sur 168.
Vérification : `npm run verify` ✅ ; e2e `gauge.spec.ts` vert.
Décisions : D33.
Reste / risques : T37 raccord.

## T37 — Position du raccord — 2026-09-25 21:05
Statut : terminée
Fait : `geometryFromLayout` ajoute `seamColumn(seam, aiguilles)` au décalage ; select Dos/Intérieur/Extérieur/Devant ; message « Carreau coupé au raccord (…) » + « Faire tomber juste » (mode around) ; trait pointillé « raccord » en vue à plat.
Vérification : `npm run verify` ✅ (98 unitaires, 42 e2e). Contrôle visuel :
- `visuel-T37-raccord-dos-vue-dos.png` : vue dos, étoile fixture, motif symétrique autour de l’axe vertical central (ligne bleue / nœuds rouges centrés) ; talon terracotta en bas ; bord-côte marine.
- `visuel-T37-raccord-dos-vue-interieur.png` : profil intérieur, même palette ; ombre studio à droite ; pointe noire à gauche.
- `visuel-T37-raccord-interieur-vue-dos.png` : vue dos après raccord « intérieur » — le motif n’est plus centré sur l’axe dos (décalage visible des nœuds rouges / lignes).
- `visuel-T37-raccord-interieur-vue-interieur.png` : profil intérieur correspondant.
- `visuel-T37-raccord-plat.png` : vue à plat, trait pointillé terracotta vertical avec libellé « raccord », bande bleu marine en haut, motif étoile, boutons 3D / À plat.
Décisions : D34.
Reste / risques : T38 décor.

## T38 — Décor sol et mur — 2026-09-25 21:30
Statut : terminée
Fait : `tileSurface.ts` + `decorController` (idle, faceCamera, sources sock/origine/autre) ; section Décor ; `capturePng`/`scene` beforeRender ; ombre studio masquée en sol/coin.
Vérification : `npm run verify` ✅ (98 unitaires, 43 e2e). Contrôle visuel :
- `visuel-T38-medina-coin.png` : Medina trois-quarts, sol + mur en carreaux marine/terracotta/beige assortis ; ombre sur le sol carrelé ; talon terracotta, pointe noire, bord-côte marine.
- `visuel-T38-medina-sol.png` : sol seul (horizon studio clair), même palette, pas de mur.
- `visuel-T38-medina-mur.png` : mur seul face caméra derrière la chaussette ; sol = ombre studio.
- `visuel-T38-medina-dos.png` : vue dos, chaussette au centre devant le mur carrelé (centre = motif chaussette).
- `visuel-T38-lianes-coin.png` : Lianes (vert/crème, talon rouge), sol + mur au même motif à plus grande échelle.
Décisions : D35.
Reste / risques : T39 bilan.

## T39 — Bilan V5 — 2026-09-25 21:35
Statut : terminée
Fait : README mis à jour (visionneuse, `?dev`, lien `#p=`, jauge, raccord, décor) ; ARCHITECTURE décor ; captures bilan `visuel-T39-*` ; Point pour César ci-dessous.
Vérification : `npm run verify` ✅.
Décisions : D30–D35 à relire.
Reste / risques : T18 fabricant.

---

## T40 — Décor v2 mats + grain photo — 2026-09-25 21:55
Statut : terminée
Fait : `tileSurface.ts` = référence v2 (mat, joint 1,5 mm `#f3f1ec`, `normalScale` 0,25, `envMapIntensity` 0,6) ; grain `public/textures/grain-ciment.jpg` chargé une fois ; `tileCmFromFormat` ; `tilesPerSide ≈ 240/tileCm` ; curseur Grain ; défauts atténuation 0.
Vérification : `npm run verify` ✅ (101 unitaires, 45 e2e) ; unit `decor.test.ts` 5/5 ; e2e `decor-v2` + `decor` OK.
Contrôle visuel :
- `visuel-T40-medina-sol.png` : Medina trois-quarts sur sol carrelé assorti (marine/terracotta/beige) ; joints fins blancs ; finition mate sans reflet brillant ; grain ciment visible ; ombre douce sur le sol ; horizon studio.
- `visuel-T40-medina-mur.png` : mur carrelé face caméra derrière la chaussette ; sol = ombre studio plainte ; mêmes couleurs franches ; joints visibles.
- `visuel-T40-ramo-sol.png` : RAMO (jaune/rose/bleu/vert) ; carreaux nettement plus petits qu’en 20 cm (grille plus dense) ; grain et joints clairs ; ombre au sol.
- `visuel-T40-ramo-mur.png` : même motif sur mur, carreaux 10 cm, joints fins, aspect mat.
Décisions : D36.
Reste / risques : textures 10 cm lourdes en e2e (SwiftShader) — timeout 180 s.

---

## Point pour César

### Ce qui marche (V5 + T40)
- **Un seul ascenseur** : la page ne défile plus ; seul le panneau défile.
- **Visionneuse par défaut** : plein écran 3D + barre (vues, copier le lien). `?dev` ouvre les réglages et les mémorise ; **Quitter le mode dev** revient à la visionneuse.
- **Lien de partage** `#p=1.…` : collection, couleurs, calepinage, talon, raccord, décor — recharge sans localStorage.
- **Jauge** : « Carreaux sur le tour » + encadré cm ; réglages machine repliés.
- **Raccord** : dos / intérieur / extérieur / devant ; trait « raccord » à plat.
- **Décor v2** : sol / mur / sol+mur mats, grain photo, joints blancs fins, couleurs franches ; format 20 cm / 10 cm.

### Tester en 3 étapes
1. `npm install` puis `npm run dev` → `/?dev`.
2. Collection **Medina** → Décor **Sol** : joints clairs, pas de brillance plastique.
3. Collection **Ramo** → Décor **Sol** : carreaux ~2× plus petits ; curseur **Grain**.

### Captures (`test-results/` + store `media/`)
- `visuel-T40-medina-sol/mur.png`, `visuel-T40-ramo-sol/mur.png`.
- Aussi T37–T39.

### Décisions à relire
D30–D36 (dont D36 décor v2).

### Blocages
T18 — `config/sizes.json` en attente fabricant.

## Fix — Visionneuse plein écran mobile — 2026-09-25 22:06
Statut : terminée
Fait : `#app.viewer-mode { grid-template-rows: minmax(0, 1fr) }` (media ≤1279 px gardait 2 rangées → ~50 % hauteur).
Vérification : e2e `viewer-mobile` 390×844, canvasH > 90 % de innerHeight.
Contrôle visuel : `visuel-fix-viewer-mobile.png` — barre en haut, chaussette sur toute la hauteur, plus de bande morte.
Décisions : D37.

## Fix(ci) — timeout décor.spec — 2026-09-25 22:09
Statut : terminée
Fait : timeout 180 s + defaultTimeout 120 s ; attendre `decorBuildId` + 2 rAF ; captures 1024. Porté aussi sur `cursor/v5-t33-t39-75d2` (PR #6 mergée, CI rouge historique).
Décisions : aucune (durcissement test).

## Fix — Toggle décor visionneuse publique — 2026-09-25 22:10
Statut : terminée
Fait : case « Décor » dans la barre visionneuse (`viewer-decor-toggle`) ; on/off via `design.decor.mode` (persisté share + IndexedDB).
Contrôle visuel :
- `visuel-fix-decor-toggle-on.png` : Medina + sol/mur carrelés, case Décor cochée.
- `visuel-fix-decor-toggle-off.png` : même chaussette, fond studio uni, décor absent.
Décisions : D38.

## Point pour César

### Ce qui marche (V5 + T40 + fixes)
- Décor v2 mats + grain ; visionneuse plein écran mobile ; **case Décor** hors `?dev`.
- Lien `#p=`, jauge, raccord.

### Tester en 3 étapes
1. `npm run dev` → `/` (pas `?dev`) : visionneuse pleine hauteur.
2. Via `?dev` : Medina + Décor Sol+mur → Quitter le mode dev → case **Décor** visible cochée.
3. Décocher / recocher : décor disparaît / revient ; **Copier le lien** conserve l’état.

### Captures
T40 Medina/RAMO ; `visuel-fix-viewer-mobile.png` ; `visuel-fix-decor-toggle-on/off.png`.

### Décisions à relire
D36–D38.

### Blocages
T18 — `config/sizes.json` en attente fabricant.

## T41 — Filet de sécurité léger (empreintes) — 2026-09-26 12:16
Statut : terminée
Fait : `tests/unit/golden.test.ts` avec 4 empreintes FNV-1a de `StitchGrid` via la chaîne pure. Fixtures PNG dans `tests/fixtures/golden/`. Empreintes : `61919254`, `a7801712`, `14de87a4`, `cc408b99`.
Vérification : vitest golden ✅ (4) ; typecheck ✅. Commit avant toute autre modif V6.
Décisions : D39.
Reste / risques : ne jamais modifier ce test pour le faire passer.

## T42 — Source de motif — 2026-09-26 12:25
Statut : terminée
Fait : `design.pattern` (carreaux | composition), `src/core/patternSource.ts` (`computePatternRgb`), copie `src/core/composition.ts`, `recompute()` aiguillé. Projet/lien : `pattern` absent ⇒ carreaux. ARCHITECTURE mise à jour.
Vérification : `npm run verify` ✅ (unitaires + 47 e2e). Golden T41 inchangé et vert.
Décisions : D40.
Reste / risques : images composition branchées en T45 ; UI mode composition en T46.

## T43 — Collections locales — 2026-09-26 12:30
Statut : terminée
Fait : `collections-locales/`, sync `--local` (défaut si dossier présent) et `npm run sync:local` (`--local-only`). Champ `source: carreaux|locale` ; PNG = zones vides, couleurs auto ; UI « Mes collections » + hint PNG.
Vérification : vitest collections + golden + pattern-source ✅ ; typecheck ✅.
Décisions : D41.
Reste / risques : admin en T44.

## T44 — Admin collections locales — 2026-09-26 12:50
Statut : terminée
Fait : `src/core/svgZones.ts`, `admin.html` + `src/admin.ts` (FS Access ou ZIP), lien « Gérer mes collections » en bas du panneau, ZIP store sans dépendance. E2e : 2 SVG → zip avec zone-N.
Contrôle visuel `visuel-t44-admin.png` : fond beige ; avant/après côte à côte (carré orange + cercle crème) ; listes zone-1/zone-2 vers codes nuancier ; bouton Enregistrer ; message ZIP téléchargé.
Vérification : `npm run verify` ✅ (120 unitaires, 48 e2e). Fin jalon B.
Décisions : D42.
Reste / risques : composition libre T45+.

## T45 — Moteur composition branché — 2026-09-26 12:58
Statut : terminée
Fait : `compositionPalette`, cache `compositionImages`, `recompute` charge les rasters (SVG recolorés / PNG / embarqués) puis `renderComposition`. Perf 5 calques 168×380 < 300 ms. Golden inchangé.
Vérification : typecheck ✅ ; vitest golden + composition-engine ✅.
Décisions : D43.

## T46 — Éditeur 2D + 3D — 2026-09-26 13:18
Statut : terminée
Fait : bascule Carreaux/Composition ; éditeur canvas (zones grisées, repères, raccord, sélection, poignées échelle/rotation, aimantation, clavier) + panneau calques/inspecteur ; poignée de split ; bibliothèque collections. Import fichier reporté à T47 (assets embarqués).
Contrôle visuel `visuel-t46-composition.png` : mode Composition actif (onglet terracotta) ; à gauche éditeur à plat + liste 2 calques medina/VAR1 + inspecteur (rotation 35°, largeur 42 mailles ≈ 5,6 cm) ; au centre chaussette 3D (bord-côte marine, tige crème avec motif tan, talon terracotta, pointe noire) et bascule 3D/À plat ; à droite panneau collections.
Vérification : typecheck ✅ ; e2e `composition-editor.spec.ts` ✅ ; unitaires 123 ✅.
Décisions : D44.
Reste / risques : import PNG/SVG + assets projet en T47.

## T47 — Projet v2 + lien partage — 2026-09-26 14:05
Statut : terminée
Fait : projet JSON v2 (`assets` embarqués, `usedEmbeddedAssets`) ; lecture v1 ; import PNG/SVG dans l’éditeur ; lien désactivé si images importées ; autosave omet assets si > 4 Mo ; avertissement save > 20 Mo.
Contrôle visuel `visuel-t47-share-viewer.png` : visionneuse publique après lien composition bibliothèque (chaussette 3D avec motif).
Vérification : `npm run verify` ✅ (unitaires + 50 e2e). Fin jalon C.
Décisions : D45.
Reste / risques : aides jacquard T48, bilan T49.

## T48 — Aides jacquard composition — 2026-09-26 14:10
Statut : terminée
Fait : `countIsolatedStitches` + pastille `check-detail` ; bulle « ? » ; bouton Aperçu gros pixels.
Contrôle visuel `visuel-t48-aides.png` : mode composition, bulle conseils, pastilles contrôles, aperçu pixelisé.
Vérification : typecheck ✅ ; vitest composition-aids + golden ✅ ; e2e composition-aids + composition-editor ✅.
Décisions : D46.
Reste / risques : bilan T49.

## T49 — Bilan V6 — 2026-09-26 14:20
Statut : terminée
Fait : README (collections locales, sync:local, admin, mode composition, projet v2, lien) ; Point pour César ci-dessous ; verify complet.
Vérification : `npm run verify` (en cours / à confirmer).
Décisions : D41–D46 à relire.
Reste / risques : bascule À plat visionneuse (commit séparé hors TASKS_V6).

## Point pour César — fin V6

### Ce qui marche
- Empreintes golden carreaux (T41) intactes.
- Collections locales + `npm run sync:local` + page admin (ZIP / File System Access).
- Mode composition : éditeur 2D + 3D, bibliothèque, import embarqué, projet v2, lien si bibliothèque seule.
- Aides jacquard (détails isolés, aperçu gros pixels, guide).
- Visionneuse : bascule décor **et** bascule 3D / À plat hors `?dev`.

### Tester en 3 étapes
1. `npm run dev` → ouvrir `/?dev`.
2. Bascule **Composition** → Ajouter (bibliothèque) → déplacer / tourner ; **Copier le lien** → ouvrir sans `?dev` (même grille).
3. Quitter le mode dev → cocher/décocher **Décor** et basculer **3D / À plat**.

### Captures à relire
- `/cursor/stores/self/media/visuel-t44-admin.png` — admin zones SVG
- `/cursor/stores/self/media/visuel-t46-composition.png` — composition 2D + 3D
- `/cursor/stores/self/media/visuel-t47-share-viewer.png` — visionneuse après lien
- `/cursor/stores/self/media/visuel-t48-aides.png` — aides jacquard
- `/cursor/stores/self/media/visuel-viewer-flat-on.png` / `off` — bascule À plat publique

### Décisions à relire
D41 (sync local), D42 (admin ZIP), D43 (cache images), D44 (import T47), D45 (projet v2 / lien), D46 (mailles isolées 2 %).

### Limites connues
- Import PNG/SVG : PNG > 2 Mo plafonné via pipeline tiles (1024 px).
- Autosave IndexedDB omet les assets > 4 Mo (message à l’écran).
- Lien de partage impossible avec images importées (fichier .json obligatoire).

### Contrôle visuel bascule À plat (hors TASKS)
- `visuel-viewer-flat-off.png` : visionneuse publique, chaussette 3D (bord-côte marine, tige crème, talon terracotta, pointe noire) ; barre avec Décor et **À plat** décochés.
- `visuel-viewer-flat-on.png` : case **À plat** cochée ; grille 2D (bord-côte bleu, tige motif points, repères zones, « Survolez une maille. »).

Vérification T49 : `npm run verify` ✅ (52 e2e).

## Fix CI — project.spec timeout — 2026-09-26 15:00
Statut : terminée
Fait : e2e projet — timeout 120 s, `saveAs` fiable, purge IndexedDB avant rechargement (évite course autosave homme vs ouverture femme), attentes ready/hash élargies. Golden T41 inchangé.
Vérification : `npm run verify` ✅ (52 e2e).

## T50 — Filets de sécurité et module de référence — 2026-09-26 19:26
Statut : terminée
Fait : `src/core/layers.ts` + `v1ShareDefaults.json` copiés depuis `reference/layers/` (imports locaux seulement). `src/io/shareLink.ts` remplacé par la version 2 (`#p=2.` en écriture, lit `#p=1.` et `#p=2.`). `layers.test.ts` pointe vers `src/core/layers`. Assertions partage adaptées + test lecture `#p=1.`. Comparaison `defaultDesign()` de `main` vs `v1ShareDefaults.json` : identité (D47).
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (139 tests unitaires, dont `layers.test.ts` et `golden.test.ts`).
Décisions : D47
Reste / risques : l’UI et `state.ts` sont encore V6 ; T51 branche l’état sur les calques. Les e2e partage qui attendent `#p=1.` seront adaptés en T52.

## T51 — État V2 calques — 2026-09-26 19:44
Statut : terminée
Fait : `SockDesignV2` runtime (`state.ts`) : Fond + 1 Motif, actions calques, undo/redo, `paletteFromLayers`. `recompute` via `stackCompute` (cache `motifLayerRgb` + `renderStack`). `patternSource.ts` supprimé. Projet : lecture V1→migration calques, écriture design V2. Lien : écriture `#p=2.`, lecture V1/V2 (`designV2` + `design` V1 pour empreintes). Hook e2e : miroir `layout`/`pattern` (D48). UI adaptée (commit précédent).
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (139, dont `golden` + `layers` + cache/undo T51). Empreintes liens réels inchangées.
Décisions : D48
Reste / risques : UI encore branchée sur le Motif « en cours » (pas le dock T54) ; e2e composition stub ; T52 finalise projet v3 + e2e liens réels + verify jalon A.

## T52 — Projet v3, liens, e2e liens réels — 2026-09-26 19:48
Statut : en cours (verify jalon A)
Fait : projet JSON `version: 3` (lecture 1/2/3, migration V1/composition → calques, tiles/assets utilisés seulement). Lien `#p=2.` + lecture V1/V2. e2e `liens-reels.spec.ts` (Jardin / Palm) vert. share.spec adapté `#p=2.`.
Vérification : unitaires ✅ (141) ; e2e liens-reels ✅ (4). `npm run verify` en cours.
Décisions : aucune nouvelle (suite D47/D48)
Reste / risques : e2e composition / modes carreaux à adapter ou retirer si cassés par V7.

## T52 — verify jalon A — adaptations e2e — 2026-09-26 19:58
Statut : en cours
Fait : e2e composition (`composition-aids`, `composition-editor`, `composition-share`) **supprimés** (mode remplacé par calques Image). `editingLayoutSettings` expose les tileIds de collection (miroir V6). checks.spec force la taille libre avant décalage.
Vérification : `npm run verify` relancé.

## T52 — Projet v3 + verify jalon A — 2026-09-26 20:05
Statut : terminée
Fait : projet v3 ; e2e `liens-reels` ; e2e composition V6 **supprimés** (mode retiré) ; miroir `layout.tileIds` pour collections ; checks en taille libre. `npm run verify` ✅ (141 unitaires, 53 e2e).
Vérification : verify complet vert.
Décisions : D48 (suite) — e2e composition retirés, listés ici.
Reste / risques : Jalon B (T53–T59) UI calques.

## T53 — Disposition écran + 3D non déformée — 2026-09-26 20:18
Statut : terminée
Fait : Grille CSS unique (`#project-bar`, `#view2d-wrap`/`#view2d`, `#view3d-wrap`/`#view3d`, `#panel`, `#layers-dock`, séparateurs). `createScene(#view3d)` + ResizeObserver → `camera.aspect` correct. Visionneuse = `#view3d` plein écran (`data-testid=viewport`). Splitters mémorisés (`sim-layout-splits`). Breakpoint empilement `max-width: 1100px`. Stub barre projet + dock (T54). Flat en dual-pane dans `#view2d`.
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (141) ; e2e `disposition.spec.ts` ✅ (2). Captures ouvertes :
- **1440×900** (`docs/captures/v7/visuel-T53-disposition-1440.png`) : barre projet en haut (Motif 1, Annuler… Bibliothèque) ; 2D | 3D | options côte à côte sans chevauchement ; dock bas avec Fond + Motif 1 ; chaussette 3D non écrasée (proportions normales après drag séparateur) ; onglets Calque/Chaussette/Décor/Export dans le cadre options.
- **1100×800** (`docs/captures/v7/visuel-T53-disposition-1100.png`) : 2D au-dessus de 3D, options dessous, dock en bas ; pas de chevauchement visible ; scroll page nul.
Décisions : D49
Reste / risques : dock stub (pas de drag / vignettes) → T54 ; options encore le panneau V6 monolithique → T55 ; boutons Ouvrir/Enregistrer/Bibliothèque désactivés → T57.

## T54 — Liste des calques (dock du bas) — 2026-09-26 21:20
Statut : terminée
Fait :
- `src/ui/layersDock.ts` complet : une carte par calque (vignette = rendu réel du calque seul, nom, type, œil, cadenas, menu « ⋯ » dupliquer / monter / descendre / supprimer), ordre dessus → dessous de gauche à droite, Fond fixé à droite sans œil ni menu ni glisser, libellés « dessus » / « dessous » aux extrémités.
- Clic = sélection + onglet « Calque » (nouveau `src/ui/optionsTabs.ts`, activation seule) ; double-clic sur le nom = renommer (Entrée valide, Échap annule).
- Glisser à la souris avec repère d’insertion (`dock-insert-marker`) ; Échap annule le glisser.
- Sans ascenseur : largeur des cartes 140 → 96 → icône seule, calculée d’après la largeur disponible ; au-delà de 16 calques l’ajout est refusé avec le message « 16 calques au maximum » (`MAX_LAYERS` dans `state.ts`, `addMotifLayer` / `addImageLayer` / `duplicateLayer` renvoient le refus).
- Repli « Calques ▾ » mémorisé (`localStorage: sim-dock-collapsed`, try/catch) ; la barre fine garde le nom du calque sélectionné.
- Clavier quand le focus est dans le dock : ↑/← et ↓/→ sélectionnent, Suppr supprime (jamais le Fond), Ctrl+D duplique, H bascule masquer.
- `src/ui/library.ts` : Bibliothèque minimale (dialogue modal) pour « + Motif » (collections, recherche) et « + Image » (image d’exemple, import PNG/SVG embarqué, images du projet) ; le bouton « Bibliothèque » de la barre projet l’ouvre aussi (défaut V6 n° 2 corrigé). T57 l’enrichit.
- `collectionTiles` (stackCompute) : un calque Motif de collection n’utilise que les carreaux nommés `<collection>-…`, donc deux collections cohabitent. Miroir dans `editingLayoutSettings`.
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (147 unitaires, dont 6 nouveaux dans `tests/unit/layers-dock.test.ts`) ; e2e `calques-dock.spec.ts` ✅ (4 tests, tout à la souris : `click`, `page.mouse.down/move/up`, `dblclick`).
Contrôles visuels (images ouvertes une par une) :
- `docs/captures/v7/visuel-T54-dock-3-calques.png` — dock seul, 3 calques : « Calques ▾ », libellé « DESSUS », carte « carreau-test-d… / IMAGE » sélectionnée (cadre rouge) dont la vignette est crème avec une petite marque en damier noir et blanc, carte « Medina par Bl… / MOTIF » avec vignette du motif rose-orange-bleu, carte « Fond / FOND » à vignette crème uni, libellé « DESSOUS », puis « + Motif » et « + Image » à droite. Les cartes Image et Motif portent trois boutons (œil, cadenas, ⋯) ; la carte Fond n’en a qu’un (cadenas). Tout est aligné sur une ligne, rien ne déborde.
- `docs/captures/v7/visuel-T54-dock-12-calques.png` — dock seul, 12 calques : mode « icône seule », 12 vignettes d’environ 50 px : la première est l’image damier, la deuxième (cadre rouge) est la copie sélectionnée, suivent neuf vignettes du motif Medina (orange / bleu, proportions correctes, non écrasées), puis la carte crème du Fond ; « DESSUS » et « DESSOUS » toujours aux extrémités, « + Motif » / « + Image » toujours visibles. Aucun ascenseur (mesuré : `scrollWidth <= clientWidth`).
- `docs/captures/v7/visuel-T54-dock-replie.png` — barre fine : « Calques ▸ » puis « Motif · Medina par Bleu Cobalt (copie) (copie) … ». Le nom du calque sélectionné reste lisible ; les cartes et les boutons d’ajout sont masqués. À noter : chaque duplication ajoute « (copie) » au nom (comportement du module de référence `duplicateStackLayer`), ce qui donne un nom très long après neuf copies.
- `docs/captures/v7/visuel-T54-ecran-apres-reordre.png` — écran entier après le glisser de la carte du bas vers le haut : barre projet « Dunes par Bleu Cobalt », vue 2D qui montre la **vraie grille** du motif Medina (formes terracotta, beige, bleu marine, bord-côte marine en haut), 3D cohérente avec la même chaussette à motif, panneau d’options sur l’onglet « Calque » (collection Medina, 4 couleurs de fil), dock à 4 cartes : Medina (sélectionnée, tout à gauche = dessus), image damier, Dunes, Fond. C’est bien Medina, remontée par le glisser, qui s’affiche.
- `docs/captures/v7/visuel-T54-ecran-16-calques.png` — écran entier avec 16 calques : 16 cartes icône (vignettes crème, les Motifs dupliqués n’ont pas de carreaux donc seul le Fond se voit), la 3ᵉ sélectionnée, et le message rouge « 16 calques au maximum » à droite de « + Image » après un clic sur « + Motif ». Une seule ligne, pas d’ascenseur.
- `docs/captures/v7/visuel-T54-carte-motif.png` / `visuel-T54-carte-fond.png` — zoom sur une carte : vignette, nom tronqué avec points de suite, type en petites capitales, boutons œil / cadenas / ⋯ ; la carte Fond n’a que le cadenas.
Décisions : D50
Reste / risques :
- **9 e2e restent rouges, et ils l’étaient déjà avant T54** : vérifié en rejouant les mêmes fichiers sur le commit T53 (`6b3e9d2`) dans un worktree séparé → mêmes 9 échecs. Ils testent la coquille V6 et doivent être adaptés à la disposition T53 : `flat`, `multi-calepinage`, `palettes` (captures), `seam` (clic sur « À plat », bouton masqué en double panneau) ; `project` (`project-save` existe maintenant deux fois : barre projet + panneau) ; `scroll` ×2 (le panneau d’options ne déborde plus à 1400×900 ni 1100×800) ; `ui` (la zone 3D ne fait plus 700 px de large) ; `viewer-flat` (la case « À plat » démarre cochée). Total suite : 50 ✅ / 9 ❌ (59 tests) avant **et** après T54.
- Sélectionner un calque déclenche un recalcul complet (`recompute` est abonné à tout changement d’état) : avec 12 calques et des images, le clic sur une carte prend un temps visible. À optimiser en T56 (recalcul seulement si le rendu change).
- La palette d’un design migré (palette exacte, `paletteFromLayers: false`) n’intègre pas automatiquement les couleurs d’un calque ajouté → T58.
- Poignées 2D → T56 ; Bibliothèque complète → T57.

## T55 — Options du calque sélectionné — 2026-09-26 22:55
Statut : terminée
Fait :
- `src/ui/layerOptions.ts` : en-tête (nom + « Réinitialiser ce calque »), source du calque, **Fond** (nuancier fils + couleur libre), **Motif** étendue (toute / bande, curseurs du rang / au rang, lecture en cm), **Image** (aperçu, remplacement, miroirs, frise + écart, valeurs numériques repliées), **Couleurs transparentes** (pastilles `layerKeyColors`, damier barré si transparente).
- `src/ui/panel.ts` : volet « Calque » = options par type ; `motif-options` réutilise `collectionPicker`, `palettePanel`, calepinage et carreaux importés via `editingMotif()` ; onglets **Chaussette** (taille, dimensions, zones, gros pixels, contrôles, palette avec « Automatique d'après les calques »), **Décor** et **Export** masquent les autres volets.
- `src/styles.css` : `[hidden]` sur `.field` / `.row` / `.layer-source` force `display: none` (évite que `display:flex` annule `hidden`).
- Tests unitaires `tests/unit/layer-options.test.ts` ; e2e `tests/e2e/calque-options.spec.ts` (transparence + bande à la souris, captures des trois types).
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (156 unitaires) ; `npm run build` ✅ ; e2e `calque-options.spec.ts` ✅ (3).
Contrôles visuels (panneau `#panel`, images ouvertes) :
- `docs/captures/v7/visuel-T55-options-motif.png` — onglet Calque, calque « Motif · Medina… » : en-tête + source collection ; sections Collection (recherche, vignettes SIGNATURE, Medina sélectionnée), Couleurs (4 fils), Calepinage et réglages motif visibles ; pas de section Fond ni Image.
- `docs/captures/v7/visuel-T55-options-fond.png` — calque Fond : seule la section « Couleur du fond » (texte d’aide, sélecteur libre beige, grille de pastilles fils bleu/vert/brun) ; pas de motif ni transparence.
- `docs/captures/v7/visuel-T55-options-image.png` — calque Image damier : aperçu carré, « Remplacer l'image… », miroir horizontal coché, frise décochée, « Valeurs numériques » replié, trois pastilles transparentes (noir, crème, terracotta).
- `docs/captures/v7/visuel-T55-transparence.png` — bas du volet Motif Dunes jaune/blanc : étendue « Toute la chaussette », pastille blanche en damier barré (transparente), pastille jaune pleine ; pied de panneau avec durée de calcul.
- `docs/captures/v7/visuel-T55-bande.png` — étendue « Bande de rangs », curseurs 0→66 rangs, libellé « 0,0 cm à 6,6 cm » ; deux pastilles couleurs du motif.
- `docs/captures/v7/visuel-T55-options-chaussette.png` — onglet Chaussette : Dimensions (Homme, curseurs tige/talon/pied/pointe), Zones (bord-côte, couleurs talon), pas le volet Calque.
Décisions : aucune nouvelle (réutilisation panneau V6 branché sur calque, D48/D50).
Reste / risques : bibliothèque enrichie → T57 ; e2e legacy V6 (9 rouges listés en T54) toujours à adapter.

## T56 — Vue 2D : vrai rendu et poignées — 2026-09-26 23:12
Statut : terminée
Fait :
- `src/ui/flatGizmos.ts` : sélection au clic (`layerAtStitch`), Échap pour désélectionner, poignées Image (`imageGizmo`, `dragImage`) et Motif (`motifGizmo`, `dragMotif`, `scaleMotif`, `setMotifBand`), calques verrouillés / Fond sans poignées ; pan avec espace ou clic milieu/droit ; molette = zoom (déjà dans `flatView`).
- `src/ui/flatView.ts` : coordonnées motif ↔ canvas, overlay poignées, `revealMotifStitch` (centrage), pan sans glisser par défaut sur le fond.
- `src/main.ts` : branchement gizmos ; crochet `__SIM__` (`gizmoClient`, `stackLayerAt`, `flatRevealMotif`, `motifStitchFromLocal`) pour les e2e.
- `tests/e2e/poignees.spec.ts` : déplacement image +20 mailles, rotation 90°, échelle ×2, décalage Motif, bande (poignée basse), tout à la souris.
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (156 unitaires) ; `npm run build` ✅ ; e2e `poignees.spec.ts` ✅ (1 test, ~3 min).
Contrôle visuel — `docs/captures/v7/poignees-2d.png` (copie aussi dans `media/v7/`) :
- Grille **maille par maille** (barreaux horizontaux, pas de rectangle lissé) : bord-côte marine, tige grise avec le motif Medina quantifié, repères « Bord-côte » / « Tige » à gauche.
- Calque **Motif en bande** sélectionné : deux lignes rouges pointillées horizontales avec **poignées rondes rouges** à gauche (haut et bas de bande) ; le motif reste visible en vrai tricot dans la bande.
- (Calque Image tourné sélectionné juste avant la capture : cadre terracotta + poignées visibles pendant le test ; sur la capture finale le Motif bande domine avec ses poignées.)
Décisions : aucune nouvelle.
Reste / risques : bibliothèque complète → T57 ; e2e legacy V6 (9 rouges) ; optimiser recalcul à la seule sélection (noté T54).

## T57 — Bibliothèque — 2026-09-26 23:49
Statut : terminée
Fait :
- `src/ui/library.ts` : dialogue modal (Échap natif, `showModal`) ; onglets Collections / Images ; collections groupées (Mes collections, Signature, Classiques, Nouveautés, Autres), vignettes VAR1, recherche, clic → calque Motif (nom catalogue, calepinage défaut) ; menu ▾ « Ajouter une variation comme image » ; images du projet avec vignettes ; import PNG/SVG + glisser-déposer ; case « Importer comme carreau (Motif) » ; calque ajouté sélectionné, dialogue fermé.
- Branchements existants conservés : barre projet `project-library`, dock `dock-add-motif` / `dock-add-image`.
- `tests/e2e/bibliotheque.spec.ts` : premier plan (`elementFromPoint`), filtre medina, Motif Medina, import damier PNG + couleurs 2D.
- `tests/e2e/ui.spec.ts` : aide calepinage lue via `toBeAttached` (curseur masqué tant que « taille libre » est décochée en V7).
Vérification : `npm run verify` ✅ (156 tests unitaires, 64 e2e).
Contrôle visuel — `docs/captures/v7/visuel-T57-bibliotheque-dialogue.png` (copie `media/v7/`) :
- Modal centré au-dessus de l’app, fond assombri ; onglet **Collections** actif, bouton **Fermer** à droite.
- Ligne d’aide « 70 collections · un clic ajoute un calque Motif », champ de recherche vide.
- Section **SIGNATURE** : grille de vignettes (Medina terracotta/bleu, Fleurs, Continuum, etc.) avec libellés tronqués et petit bouton ▾ pour les variations en calque Image.
Décisions : aucune nouvelle.
Reste / risques : garde-fous multi-calques → T58.

## T58 — Garde-fous jacquard multi-calques — 2026-09-26 23:55
Statut : terminée
Fait :
- `src/core/stackPaletteGuard.ts` : couleurs par calque, bandeau si palette « d’après les calques » > `MACHINE_LIMITS.maxColorsTotal`, réduction aux N fils les plus présents dans le RVB empilé ; indices `owner` pour libellés flottés / mailles isolées.
- `src/ui/panel.ts` : bandeau `stack-palette-banner` + bouton « Réduire à N couleurs » ; pastilles contrôles enrichies.
- `src/main.ts` : branchement recalcul ; `src/ui/layerOptions.ts` : bulle « ? » conseil jacquard.
- `tests/unit/stack-palette-guard.test.ts` : 3 Motifs × 2 couleurs + Fond.
Vérification : `npm run typecheck` ✅ ; `npm test` ✅ (157 tests unitaires).
Décisions : aucune nouvelle.
Reste / risques : bilan V7 → T59.

## T59 — Bilan V7 — 2026-09-27 00:10
Statut : terminée
Fait : README mis à jour (calques, bibliothèque, poignées, `#p=2.`, limites). Captures bilan dans `docs/captures/v7/` (écran, dock, options, poignées, bibliothèque, visionneuses Jardin + Palm). `npm run verify` ✅ **157 unitaires + 64 e2e**.
Vérification : verify complet vert (12 min e2e). Captures liens réels ouvertes :
- **Jardin** : visionneuse plein écran, titre « Jardin d Dazur », motif bleu/blanc feuilles, décor carreaux assorti, barre ¾/Profil/Dos/Face + Décor coché.
- **Palm Beach** : titre « Palm Beach », motif orange/rose géométrique, décor assorti, même barre visionneuse ; empreinte grille `5e26e231`.
Décisions : aucune nouvelle (suite D47–D50).
Reste / risques : T18 (sizes fabricant) hors scope ; PR draft #9 à merger sur `v6-composition` (ou `main` si #8 mergée).

---

## Point pour César — V7 calques — 2026-09-27

### Ce qui marche
- Pile de calques Fond / Motif / Image (état V2, projet JSON v3, lien `#p=2.` ; lecture `#p=1.` intacte).
- Écran `?dev` : 2D | 3D | options (onglets) | dock bas ; visionneuse plein écran inchangée ; aspect 3D correct.
- Dock : cartes, vignettes, drag, menu, clavier, repli, max 16.
- Options par type + couleurs transparentes + bande Motif.
- Poignées 2D (Image + Motif/bande).
- Bibliothèque (collections + import images).
- Garde-fou palette multi-calques (« Réduire à N »).
- Empreintes golden + liens Jardin / Palm inchangées.

### Tester en 5 minutes
1. `npm run dev` → ouvrir `http://localhost:5173/?dev`
2. Bibliothèque → Medina ; ajouter une Image ; masquer/réordonner dans le dock ; déplacer l’image à la souris sur la vue 2D.
3. « Copier le lien » → coller dans un onglet sans `?dev` : visionneuse seule. Rouvrir aussi les deux liens réels (fixtures `tests/unit/layers.test.ts`).

### Décisions à relire
D47 (défauts V1 = main), D48 (miroirs e2e), D49 (grille CSS / view3d), D50 (dock + bibliothèque minimale).

### Blocages
Aucun pour V7. T18 toujours en attente des tailles fabricant.

## T60 — Palette unique et Fond — 2026-09-27 08:50
Statut : terminée
Fait :
- `planStackPalette` dans `stackPaletteGuard.ts` : une seule vérité (`resolveStackPalette`) pour réduction + bandeau ; liste du bandeau = `pal.palette` avec provenance via `stackPaletteEntries`.
- `main.ts` : branchement ; `composeGrid` / contrôles / flottés via `effectiveZones(design)` ; Fond visible inclus en mode fils de collection.
- `panel.ts` : suppression de « Couleur du pied » ; aide « Motif sur le pied » ; curseur `ctl-max-colors` masqué hors modes auto/manuelle.
- CSS : `.stack-palette-banner[hidden] { display: none }` (le `display: flex` écrasait l’attribut `hidden`).
- Tests : `v8-palette-plan.test.ts` ; e2e `palette-bandeau.spec.ts` (souris).
Vérification : typecheck ✅ ; unitaires concernés ✅ ; e2e palette-bandeau ✅ (2/2).
Contrôle visuel :
- `visuel-T60-pas-bandeau.png` : Motif Jardin (bleu/blanc) au-dessus de Fleurs ; onglet Chaussette ; **pas** de bandeau orange ; dock avec Jardin / Fleurs / Fond.
- `visuel-T60-bandeau.png` : après transparence du Jardin, motif Fleurs multicolore visible en 2D/3D ; bandeau avec pastilles hex + bouton « Réduire à 6 couleurs » ; contrôles signalent 10/6 couleurs.
- `visuel-T60-pied-fond.png` : vue 2D (tige Dunes beige/bleu, bord-côte marine) ; le pied uni noir (Fond BK001) est confirmé par `getStitch` (zone Foot) — la capture cadre surtout la tige.
Décisions : D51.
Reste / risques : T61 (cadre sous le talon).

## T61 — Cadre image sous le talon — 2026-09-27 09:15
Statut : terminée
Fait :
- `flatView.ts` : `clientAtMotifStitch` / `clientToMotifStitch` / `revealMotifStitch` via `motifYToGridY` / `gridYToMotifY` (talon sauté ; clic sur talon collé au pied).
- `flatGizmos.ts` : cadre image découpé en deux polygones s'il chevauche le talon (clipping à la hauteur de tige) ; poignées aux coins réels.
- e2e `gizmo-pied.spec.ts` (souris) ; `gizmoClient.motifCorners` pour le test d'inclusion.
Vérification : typecheck ✅ ; e2e gizmo-pied ✅.
Contrôle visuel :
- `visuel-T61-avant-pied.png` : image damier (4 carrés noirs + disque rouge) sur la **tige** grise, cadre rouge à poignées blanches + poignée de rotation ; bord-côte marine en haut, talon à peine visible en bas.
- `visuel-T61-apres-pied.png` : même image sur le **pied**, cadre rouge aligné sur le motif (sous le talon rayé rouge/gris) ; libellé « Pied » ; survol maille 126 rang 299.
Décisions : D52.
Reste / risques : T62 fluidité.

## T62 — Vue 2D fluide — 2026-09-27 09:45
Statut : terminée
Fait :
- `flatView` : grille peinte via `ImageData` 1 px/maille + `drawImage` (smoothing off) ; lignes de mailles en un seul chemin ; canvas overlay pour poignées.
- Glisser image/motif : `dirtyRowsForImage` + `renderStack` partiel ; 1 frame/`rAF` ; aperçu RVB sans quantize ; 3D ≤ 8×/s ; historique / autosave / lien seulement au lâcher.
- `window.__SIM__.stats` : `dragFrames`, `dragComputeMsAvg`, `motifRgbComputes`.
- e2e `glisser-fluide.spec.ts`.
Vérification : typecheck ✅ ; e2e glisser-fluide ✅.
Temps mesurés (agent) : avant (V7, fillRect plein + recompute/souris) ≈ 80–120 ms/événement estimé ; après `dragComputeMsAvg` ≈ 12–20 ms sur 40 pas (seuil test < 25), `motifRgbComputes` = 0 pendant le glisser image.
Décisions : D53.
Reste / risques : T63 repères faces.

## T63 — Repères des faces — 2026-09-27 10:00
Statut : terminée
Fait : traits pointillés aux colonnes `faceGuides` (+ Intérieur en W) ; bouton « Repères » (`ctl-face-guides`) mémorisé en localStorage ; aimantation ±2 mailles au glisser d’image.
Vérification : e2e reperes-faces ✅.
Contrôle visuel — `visuel-T63-reperes.png` : libellés « Intérieur », « Dos », « Extérieur » en haut (Devant hors cadre à droite selon le pan) ; traits pointillés bleu-gris distincts du raccord rouge brique au centre du Dos ; tige taupe, bord-côte marine.
Décisions : aucune nouvelle.
Reste / risques : T64 bascule vues.

## T64 — Bascule vues 2D/3D — 2026-09-27 10:15
Statut : terminée
Fait : boutons `ctl-view-2d` / `ctl-view-3d` dans la barre projet ; classes CSS `hide-2d` / `hide-3d` ; localStorage ; mesh 3D suspendu si masqué ; aspect recalculé à la réaffiche.
Vérification : e2e vues-bascule ✅.
Contrôle visuel : 4 captures `visuel-T64-{2d-3d,3d-seul,aucune,2d-seul}.png` — combinaisons lisibles, panneau+dock quand aucune vue.
Décisions : aucune.
Reste / risques : T65 onglet Global.

## T65 — Onglet Global — 2026-09-27 09:20
Statut : terminée
Fait :
- Onglet `tab-global` / `pane-global` (dernier après Export) ; `OptionsTab` étendu.
- Contenu de l’ancien `.options-footer` déplacé : « Tout réinitialiser », « Dernier calcul », « Gérer mes collections », « Quitter le mode dev » (`data-testid` inchangés).
- Plus de pied de panneau ni de propriété `Panes.footer`.
- e2e `onglet-global.spec.ts` (souris).
Vérification : typecheck ✅ ; e2e onglet-global ✅.
Contrôle visuel — `visuel-t65-onglet-global.png` : onglet **Global** actif dans la barre d’onglets (Calque / Chaussette / Décor / Export / Global) ; volet droit montre « Tout réinitialiser », « Dernier calcul : 164 ms », lien « Gérer mes collections », bouton « Quitter le mode dev » ; bandeau Annuler/Rétablir/Copier le lien toujours en tête du panneau ; **aucun** pied `.options-footer` sous les options ; 2D (tige crème, bord-côte marine, repères) et 3D (chaussette) visibles ; dock Motif 1 / Fond en bas.
Décisions : aucune.
Reste / risques : T66 bibliothèque d’images.

## T66 — Bibliothèque d’images — 2026-09-27 09:27
Statut : terminée
Fait :
- `AssetRef` + `assetKey` `b:<id>` ; chargement `compositionImages` via `./images/<fichier>` ; `cleanAsset` sans transtypage ; `project.readAssetRef`.
- `scripts/syncBibliothequeImages.mjs` branché dans `sync-carreaux` / `sync:local` → `public/images/` + `index.json` + rapport.
- Bibliothèque onglet Images : section « Bibliothèque » (filtre + vignettes) au-dessus de « Images du projet ».
- Tests : `sync-bibliotheque.test.ts` ; e2e `bibliotheque-images.spec.ts` (souris).
Vérification : typecheck ✅ ; unit sync ✅ ; e2e bibliotheque-images ✅.
Contrôle visuel — `visuel-t66-logo-2d.png` : calque **Logo** (IMAGE) sélectionné dans le dock ; logo « CÉSAR BAZAAR » magenta visible sur la **vue 2D** (tige crème) et la **3D** (côté de la chaussette) ; pastilles roses dans « Couleurs transparentes » ; Fond + Motif 1 toujours présents.
Décisions : D54.
Reste / risques : T67 œil / remplacement couleurs.

## T67 — Couleurs calque œil / remplacement — 2026-09-27 09:45
Statut : terminée
Fait :
- Composant `colorRow` (pastille, libellé, œil, Remplacer…) ; section « Couleurs du calque » remplace le damier.
- Zones Motif (palettePanel) : œil + bascule groupée si même fil ; Images : dialogue Remplacer (sock + nuancier + origine).
- `setImageRecolor` dans state ; `data-testid` `layer-color-*` conservés pour les e2e V7.
- e2e `couleurs-calque.spec.ts`.
Vérification : typecheck ✅ ; e2e couleurs-calque ✅.
Contrôle visuel :
- `visuel-t67-motif-oeil.png` : Motif Dunes jaune sur Fond bleu marine (blanc transparent) ; lignes zone-1 WT000 Blanc avec œil ; 2D/3D cohérents.
- `visuel-t67-image-recolor.png` : calque Logo sélectionné ; section « Couleurs du calque » avec pastille + « Changer… » (remplacement actif) ; logo visible en 2D/3D.
Décisions : D55.
Reste / risques : T68 bilan + verify complet.

## T68 — Bilan V8 — 2026-09-27 10:06
Statut : terminée
Fait :
- README mis à jour (V8 : repères, bascule 2D/3D, onglet Global, bibliothèque d’images, lignes de couleur).
- Captures sous `docs/captures/v8/` (et copie `media/v8/`).
- Correctifs de suivi : `leave-dev` / `reset-all` via onglet Global ; `ctl-max-colors` après mode auto ; œil zone ≠ `layer-color-*` ; rechargement entre liens T59.
- `npm run verify` complet vert.
Vérification : typecheck ✅ ; 167 unitaires ✅ ; build ✅ ; 74 e2e ✅.
Décisions : D51–D55.
Reste / risques : T18 (tailles fabricant) toujours hors scope ; CI GitHub peut échouer pour facturation.

## Point pour César — V8 retours — 2026-09-27

### Ce qui marche
- Palette unique (`resolveStackPalette`) + Fond = pied uni ; plus de « Couleur du pied ».
- Cadre Image correct sous le talon ; glisser 2D fluide (`dragComputeMsAvg` < 25 ms).
- Repères des faces + aimantation ; bascule 2D/3D mémorisée.
- Onglet **Global** (réinit / collections / quitter / ms) — plus de pied de panneau.
- Bibliothèque d’images publiques (`bibliotheque-images/` → `public/images/`) ; Logo partageable dans le lien.
- Lignes de couleur : œil (transparence) + Remplacer… (Images).

### Tester en 3 étapes
1. `npm run sync:local && npm run dev` → ouvrir `http://localhost:5173/?dev`
2. Bibliothèque → Images → Logo ; basculer Repères / 2D / 3D ; onglet Global.
3. Sur un Motif : œil sur une couleur ; sur le Logo : Remplacer… → Copier le lien → coller sans `?dev`.

### Décisions à relire
D51 (palette/Fond), D52 (talon), D53 (glisser), D54 (bibliothèque), D55 (œil/recolor).

### Blocages
Aucun pour V8. T18 en attente des tailles fabricant. Ne pas toucher `wrangler.jsonc`.

## Fix — paletteFromLayers dans le lien de partage — 2026-09-27
Statut : terminée
Fait : le réglage « Automatique d’après les calques » (`quantize.paletteFromLayers`) était sérialisé dans `#p=2.` mais `applyShare` le forçait à `false` à l’ouverture. Correction : `quantizeForShareApply` conserve le booléen ; défauts V2 figés + `shareJsonToDesignV2` + migration V1 → `false` si absent (rétrocompat). Tests unit `share-palette-from-layers` + e2e share (calques / manuelle).
Vérification : `npm run verify` ✅ (171 unitaires ; 76 e2e dont share palette calques/manuelle). Contrôle visuel : avant/après ouverture du lien — select Palette = « Automatique d’après les calques » (`media/visuel-share-palette-calques-avant.png` / `apres.png`).
Décisions : D56
Reste / risques : aucun ; empreintes liens réels / golden / v1ShareDefaults / v8-layers inchangés.

## Maj+D — bascule du mode développeur — 2026-09-27 16:35
Statut : terminée
Fait : Maj+D entre ou sort du mode dev (`enterDevMode` / `leaveDevMode`, même mémorisation que `?dev`). D seul reste la vue de dos. Ignoré dans un champ, avec Ctrl/Cmd/Alt, et en répétition de touche. Légende des vues : « Maj+D : mode dev ». README mis à jour.
Vérification : test unitaire `enterDevMode` ✅ (10 tests dans `share.test.ts`). Contrôle navigateur : Maj+D masque le panneau (visionneuse), D seul y reste, second Maj+D rouvre le panneau et réécrit `simulateur-chaussettes:dev` ; dans le champ « Rechercher une collection… », Maj+D ne quitte pas le mode.
Décisions : D57
Reste / risques : aucun.

## Admin — défilement de la page collections — 2026-09-27 16:45
Statut : terminée
Fait : `admin.html` autorise le défilement de la page (`html:has(body.admin)`), sans modifier `src/styles.css`. Le formulaire « Nouvelle collection » atteint le dépôt de fichiers et **Enregistrer**.
Vérification : navigateur — formulaire plus haut que la fenêtre, ascenseur visible, **Enregistrer** atteint au défilement. Simulateur : `overflow: hidden` sur `html`/`body`/`#app`, `scrollY` reste 0 après `scrollTo`.
Décisions : D58
Reste / risques : aucun.

## Admin — motifs multiples et fils gris — 2026-09-27 17:12
Statut : terminée
Fait : chaque motif importé a son aperçu avant/après et son remplacement de couleurs (nom du fil + pastille, nuancier complet). Le choix de fil passe par OKLab avec pénalité de chroma : un gris neutre ne part plus vers un vert ou un bleu de même clarté.
Vérification : unitaires `svgZones` ✅ (`#808080` → Gris moyen, `#606060` → Gris acier, `#d7e8cf` reste vert). Contrôle navigateur : deux SVG, deux blocs Motif, pastilles et noms visibles.
Décisions : D59
Reste / risques : la quantification des mailles garde la distance redmean.

## T70 — Vue 2D vraies couleurs + alertes — 2026-09-27 15:30
Statut : terminée
Fait : `ensureStitchBitmap` peint la grille pixel pour pixel (plus d’assombrissement). Bouton **Alertes** (`ctl-flat-alerts`, défaut off, `sim-flat-alerts`) : contours rouges par plage de flotté + ronds pour mailles isolées sur `flat-overlay`, légende en bas. Pastilles Contrôles Flottés / Détails cliquables → activent Alertes. 3D inchangée.
Vérification : typecheck ✅ ; unitaires checks/composition-aids ✅ ; e2e `vue2d-couleurs.spec.ts` ✅.
Contrôle visuel :
- `docs/captures/v9/visuel-t70-avant-alertes.png` (Classique14) : bord-côte marine, tige avec losanges blancs / fleurs noir-vert / fond bleu clair, couleurs franches (pas de voile marron/mauve) ; repères Intérieur / Dos / Extérieur ; pas de contours d’alerte ni de légende.
- `docs/captures/v9/visuel-t70-apres-alertes.png` : même motif, nombreuses plages entourées d’un trait rouge fin (flottés), légende rose en bas (« Contour rouge : flotté trop long (plus de 7 mailles…) »). Les couleurs du motif restent lisibles sous les contours.
Décisions : D60
Reste / risques : T71 branche le calque Dessin déjà écrit.


## T71 — Calque Dessin dans l’application — 2026-09-27 15:45
Statut : terminée
Fait : dock « + Dessin », vignette damier, menu « Transformer en dessin », options Calque (couleurs œil/Remplacer, effacer, compteur), actions état (`addDessinLayer`, `convertLayerToDessin`, …). Poignées 2D n’appliquent plus `motifGizmo` aux Dessin. Projet v3 / lien `#p=2.` conservent le Dessin.
Vérification : typecheck ✅ ; unit `v9-dessin-app` + `v9-dessin` ✅ ; e2e `dessin-calque` ✅.
Contrôle visuel :
- `visuel-t71-dessin-vide.png` : vue 2D crème (Motif vide), calque Dessin 1 sélectionné dans le dock ; panneau « Dessin · Dessin 1 », « Aucune maille peinte », bouton Effacer.
- `visuel-t71-transform-dessin.png` : après transformation, rendu 2D inchangé (mêmes couleurs aux 5 points e2e) ; Motif masqué.
Décisions : D61
Reste / risques : outils de dessin (T72).

## T72 — Outils de dessin 2D — 2026-09-27 15:50
Statut : terminée
Fait : barre `dessin-toolbar` (crayon, gomme, trait, rectangle, pot, pipette, main) ; épaisseur 1–4 ; symétrie ; aimantation ; aperçu overlay ; trait live (rAF 2D, 3D ≤ 8 Hz) ; commit au lâcher = 1 undo. Zoom max 24 px/maille.
Vérification : e2e `dessin-achille` ✅ (trait Achille + symétrie/pipette).
Contrôle visuel :
- `visuel-t72-achille-2d.png` : trait noir vertical 2 mailles au centre du Dos, sur toute la tige crème, s’arrête au talon terracotta ; bord-côte marine intact.
- `visuel-t72-achille-3d-dos.png` : vue de dos, même trait noir descendant du bord-côte au talon orange, tige crème texturée.
Décisions : D62
Reste / risques : sélecteur couleur T73.

## T73 — Couleur du crayon — 2026-09-27 15:55
Statut : terminée
Fait : pastille `dessin-color` ouvre un dialogue (sock + nuancier recherchable + 8 récentes) ; pipette met à jour la couleur ; bandeau palette V8 inchangé si dépassement.
Vérification : e2e `dessin-couleur` ✅ (recherche « noir », peindre → maille = fil choisi).
Décisions : D63
Reste / risques : bilan T74.

## T74 — Bilan V9 — 2026-09-27 16:30
Statut : terminée
Fait : README V9 (Alertes, Dessin, recette Achille 5 clics) ; captures `docs/captures/v9/` ; Point pour César. Correctifs verify : (1) dock à 16 calques — boutons restent cliquables + message (D64) ; (2) e2e décor — `decorBuildId` capturé avant le select (D65).
Vérification : `npm run verify` ✅ (189 unitaires, 82 e2e).
Décisions : D60–D65
Reste / risques : T18 fabricant ; CI Actions peut échouer pour facturation.

## Point pour César — V9 dessin — 2026-09-27

### Ce qui marche
- Vue 2D aux **vraies couleurs** ; **Alertes** optionnelles (contours flottés + ronds isolés).
- Calque **Dessin** : + Dessin, Transformer en dessin, outils pixel art, couleur nuancier, lien `#p=2.`, projet v3.
- Cas réel : trait 2 mailles au Dos sur toute la tige (2D + 3D dos).

### Tester en 3 étapes
1. `npm run sync:local && npm run dev` → `http://localhost:5173/?dev`
2. **+ Dessin** → Trait épaisseur 2 → glisser au Dos du haut au bas de la tige (Maj)
3. Bouton **Alertes** sur Classique14 ; **⋯ → Transformer en dessin** sur un Motif

### Décisions à relire
D60 (Alertes), D61 (branchement Dessin), D62 (outils live), D63 (couleur crayon), D64 (dock 16), D65 (e2e décor).

### Blocages
Aucun pour V9. T18 en attente des tailles fabricant. Ne pas toucher `wrangler.jsonc`. CI GitHub Actions : facturation possible ≠ échec code.
