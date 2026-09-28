# Message à coller dans Cursor (V10, en local)

---

Travaille en autonomie, sans me poser de question.

Crée la branche `v10-favoris` depuis `main` et traite `tasks/TASKS_V10.md` dans l'ordre :

- **Étape A** (T80 → T84) : favoris en ligne (Worker + D1, mot de passe commun vérifié par le Worker, galerie).
- **Étape B** (T85 → T87) : bibliothèque d'images partagée (R2), seulement une fois l'étape A entièrement verte.

Intouchables :

- `golden.test.ts` ;
- les empreintes des liens réels ;
- `v1ShareDefaults.json` ;
- `v8-layers.test.ts` ;
- `v9-dessin.test.ts` ;
- `export-format.test.ts` ;
- le format du lien `#p=2.`.

Aucun secret ni identifiant de base dans le dépôt. `.dev.vars` va dans `.gitignore`.

Pour chaque tâche d'interface :

- les e2e font l'action **à la souris** ;
- ouvre la capture et décris-la honnêtement dans `docs/PROGRESS.md` avant de cocher.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`) :

- un commit par tâche ;
- décisions dans `docs/DECISIONS.md` ;
- vérification allégée pendant les tâches, `npm run verify` complet en fin d'étape.

À la fin de l'étape A, écris dans `PROGRESS.md` les commandes de mise en ligne que je dois lancer moi-même (création D1, migrations, secret, déploiement).
