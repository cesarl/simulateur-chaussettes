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
