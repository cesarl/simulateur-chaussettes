# Message à coller dans l'agent Cursor (V4 : collections)

---

En autonomie complète, sans me poser de question.

Je veux jouer directement avec les collections de mon simulateur de carreaux (SVG, zones de couleur, nuancier, palettes conseillées, calepinages). J'ai déjà lancé la synchronisation : les données sont dans `public/carreaux/` (si le dossier est absent, travaille avec `tests/fixtures/configurateur-mini/` et le catalogue de test).

Lis `docs/DONNEES_CARREAUX.md` puis traite `tasks/TASKS_V4.md` (T29 → T32), après avoir terminé ce qui reste de `tasks/TASKS_V3.md`. Modules fournis et testés à intégrer sans les réécrire : `reference/collections/`, `reference/calepinage/` (mis à jour), `scripts/sync-carreaux.mjs`. Boucle habituelle (`.cursor/rules/10-workflow.mdc`) : tests d'abord, `npm run verify` vert, captures ouvertes et décrites, cases cochées, `docs/PROGRESS.md`, un commit par tâche. T18 reste en attente du fabricant.
