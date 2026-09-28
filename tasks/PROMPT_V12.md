# Message à coller dans Cursor (V12, en local)

---

Travaille en autonomie, sans me poser de question.

Crée la branche `v12-motifs` depuis `main` et traite `tasks/TASKS_V12.md` dans l'ordre (T100 → T105).

Objectif : une page « Créer un motif » pour fabriquer ses propres collections, enregistrées en ligne (D1 + R2, mot de passe commun), modifiables, et utilisables partout comme les collections du catalogue :

- N variations ;
- couleurs par zone et palettes conseillées ;
- calepinage par défaut ;
- prévisualisation 2D, 3D et décor.

**Réutilise l'existant** :

- le découpage en zones d'`admin.ts` / `svgZones.ts`, à extraire dans un module commun ;
- le Worker et le mot de passe de V10 ;
- le kit d'interface de V11 ;
- `calepGallery`, `sock3d`, le décor.

Le format du lien `#p=2.` ne change pas. Les intouchables des séries précédentes restent intouchables.

Pour chaque tâche d'interface :

- les e2e font les actions **à la souris** ;
- ouvre les captures et décris-les honnêtement dans `docs/PROGRESS.md` avant de cocher.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`) :

- un commit par tâche ;
- décisions dans `docs/DECISIONS.md` ;
- `npm run verify` complet à la fin.

Termine par la commande de migration que je dois lancer en ligne.
