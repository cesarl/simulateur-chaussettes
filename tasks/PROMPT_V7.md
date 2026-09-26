# Message à coller dans l'agent Cursor cloud (V7)

---

Tu travailles seul : je suis indisponible, ne me pose aucune question.

Crée la branche `v7-calques` **depuis `v6-composition`** (pas depuis `main`) et traite toutes les tâches de `tasks/TASKS_V7.md` dans l'ordre (T50 → T59), en respectant ses « Règles de cette série ».

Le cœur du modèle est déjà écrit et testé dans `reference/layers/` (lis `reference/layers/README.md` avant de commencer). **Intègre-le, ne le réécris pas.**

Priorité absolue : **les liens déjà partagés et les projets existants doivent rester identiques**. `tests/unit/golden.test.ts`, les empreintes des deux liens réels dans `tests/unit/layers.test.ts` et `v1ShareDefaults.json` ne se modifient jamais. S'ils cassent, corrige le code.

En V6, des cases ont été cochées sans que l'écran ait été regardé (boutons qui se chevauchent, Bibliothèque sans effet, 3D déformée, images dessinées en rectangles). Pour chaque tâche d'interface de V7 :

- les tests e2e font l'action **à la souris**, comme une personne ;
- tu ouvres la capture de la zone et tu la décris honnêtement dans `docs/PROGRESS.md` avant de cocher.

Si quelque chose ne va pas à l'écran, corrige-le avant de passer à la suite.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`) :

- tests d'abord ;
- un commit par tâche ;
- décisions dans `docs/DECISIONS.md` ;
- vérification allégée pendant les tâches, `npm run verify` complet en fin de jalon.

À la fin, ouvre la pull request `v7-calques` avec les captures et écris le « Point pour César ».
