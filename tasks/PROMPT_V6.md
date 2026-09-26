# Message à coller dans l'agent Cursor cloud (V6)

---

Tu travailles seul toute la journée : je suis indisponible, ne me pose aucune question.

Crée la branche `v6-composition` depuis `main` et traite **toutes** les tâches de `tasks/TASKS_V6.md` dans l'ordre (T41 → T49), en respectant ses « Règles propres à cette série » (vérification allégée pendant les tâches, `npm run verify` complet seulement en fin de jalon, au plus un petit fichier e2e par tâche). Module de référence testé à intégrer sans le réécrire : `reference/composition/`.

Priorité absolue : **ne rien casser côté carreaux**. Commence par T41 (empreintes de référence enregistrées AVANT toute modification) et ne modifie jamais ce test pour le faire passer.

Pour le reste, boucle habituelle (`.cursor/rules/10-workflow.mdc`) : tests d'abord, captures ouvertes et décrites, cases cochées, `docs/PROGRESS.md`, décisions dans `docs/DECISIONS.md`, un commit par tâche. À la fin, ouvre la pull request `v6-composition` avec un résumé et les captures, et écris le « Point pour César ».
