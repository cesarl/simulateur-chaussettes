# Message à coller dans l'agent Cursor cloud (V8)

---

Tu travailles seul : je suis indisponible, ne me pose aucune question.

Crée la branche `v8-retours` **depuis `v7-calques`** et traite toutes les tâches de `tasks/TASKS_V8.md` dans l'ordre (T60 → T68).

Le cœur de calcul est déjà corrigé et testé dans `src/core/layers.ts`. Voir `tests/unit/v8-layers.test.ts` et la section « Déjà fait » de `TASKS_V8.md` : **branche-le, ne le réécris pas**.

Intouchables :

- `golden.test.ts` ;
- les empreintes des liens réels ;
- `v1ShareDefaults.json` ;
- `v8-layers.test.ts`.

S'ils cassent, corrige le code.

Pour chaque tâche d'interface :

- fais l'action testée **à la souris** dans l'e2e ;
- ouvre la capture et décris-la honnêtement dans `docs/PROGRESS.md` avant de cocher.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`) :

- un commit par tâche ;
- décisions dans `docs/DECISIONS.md` ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin.

Termine par la pull request `v8-retours` et le « Point pour César ».
