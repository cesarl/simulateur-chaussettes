# Message à coller dans l'agent Cursor cloud (V9)

---

Tu travailles seul : je suis indisponible, ne me pose aucune question.

Crée la branche `v9-dessin` **depuis `main`** et traite toutes les tâches de `tasks/TASKS_V9.md` dans l'ordre (T70 → T74).

Le cœur du calque Dessin est déjà écrit et testé dans `src/core/layers.ts`. Voir `tests/unit/v9-dessin.test.ts` et la section « Déjà fait » : **branche-le, ne le réécris pas**.

Intouchables :

- `golden.test.ts` ;
- les empreintes des liens réels ;
- `v1ShareDefaults.json` ;
- `v8-layers.test.ts` ;
- `v9-dessin.test.ts`.

S'ils cassent, corrige le code.

Pour chaque tâche d'interface :

- les e2e font l'action **à la souris**, comme une personne. Le test principal est le vrai cas : tracer à la souris une ligne de 2 mailles au milieu du dos, sur toute la tige ;
- ouvre la capture et décris-la honnêtement dans `docs/PROGRESS.md` avant de cocher.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`) :

- un commit par tâche ;
- décisions dans `docs/DECISIONS.md` ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin.

Termine par la pull request `v9-dessin` et le « Point pour César ».
