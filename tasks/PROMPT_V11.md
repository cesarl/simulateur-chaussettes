# Message à coller dans Cursor (V11, en local)

---

Travaille en autonomie, sans me poser de question.

Crée la branche `v11-finitions` depuis `main` et traite `tasks/TASKS_V11.md` dans l'ordre (T90 → T96).

C'est une série de **finitions visuelles** :

- **aucun changement de comportement** ;
- **mêmes `data-testid`** ;
- pas de nouvelle dépendance lourde ;
- les intouchables des séries précédentes restent intouchables.

Commence chaque tâche par les **captures « avant »**. Termine-la par les **captures « après »**, ouvertes et décrites honnêtement dans `docs/PROGRESS.md`, en disant ce qui reste imparfait.

Vise un outil pro, dense et lisible :

- icônes fines ;
- un seul bouton principal par zone ;
- menus « ⋯ » fermés par défaut ;
- infobulles avec raccourcis ;
- cartes 4:5 dans la galerie.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`) :

- un commit par tâche ;
- décisions dans `docs/DECISIONS.md` ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin.
