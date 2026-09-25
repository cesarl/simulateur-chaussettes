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
