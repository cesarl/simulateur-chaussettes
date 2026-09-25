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
