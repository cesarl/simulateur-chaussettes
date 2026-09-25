# Message à coller dans l'agent Cursor (V5)

---

En autonomie complète, sans me poser de question.

Nouveaux retours : un seul ascenseur, visionneuse 3D par défaut et réglages seulement en mode `?dev` (mémorisé), lien de partage avec tout le projet dans l'URL, jauge expliquée avec « carreaux sur le tour », position du raccord réglable, décor sol/mur en carreaux de ciment.

Tout est dans `tasks/TASKS_V5.md`. Modules fournis et testés à intégrer sans les réécrire : `reference/share/`, `reference/decor/`, `reference/calepinage/` (mis à jour), `reference/sock3d/studio.ts` (mis à jour). Textes d'aide : `docs/JAUGE_EXPLIQUEE.md`.

Traite T33 → T39 dans l'ordre avec la boucle habituelle (`.cursor/rules/10-workflow.mdc`) : tests d'abord, `npm run verify` vert, captures ouvertes et décrites, cases cochées, `docs/PROGRESS.md`, un commit par tâche. Ne touche pas à `wrangler.jsonc`. T18 reste en attente du fabricant.
