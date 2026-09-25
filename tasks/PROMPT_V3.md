# Message à coller dans l'agent Cursor (V3)

---

En autonomie complète, sans me poser de question.

Nouveaux retours : talon réglable, vrai calepinage multi-motifs avec mes 75 préréglages, réinitialisation / annuler. Tout est décrit dans `tasks/TASKS_V3.md` et `docs/CAHIER_DES_CHARGES_COMPLEMENT_V3.md`. Deux modules de référence déjà testés sont fournis : `reference/sock3d/` et `reference/calepinage/` (lis leurs `README.md`). Intègre-les, ne les réécris pas.

Si T23 (`tasks/TASKS_RENDU_3D.md`) n'est pas terminée, fais-la d'abord. Puis traite T24 → T28 dans l'ordre, avec la boucle habituelle (`.cursor/rules/10-workflow.mdc`) : tests d'abord, `npm run verify` vert, captures ouvertes et décrites, cases cochées, `docs/PROGRESS.md`, un commit par tâche. Décisions non couvertes → `docs/DECISIONS.md`. T18 reste en attente du fabricant.
