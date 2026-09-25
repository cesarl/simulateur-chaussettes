# Message à coller dans l'agent Cursor

Copie le bloc ci-dessous tel quel dans la fenêtre de l'agent.

---

Tu travailles en autonomie complète sur ce dépôt. Je suis indisponible toute la journée : ne me pose aucune question et n'attends aucune validation.

1. Lis `AGENTS.md`, toutes les règles de `.cursor/rules/`, puis `docs/CAHIER_DES_CHARGES.md`, `docs/ARCHITECTURE.md` et `src/core/types.ts`.
2. Traite `tasks/TASKS.md` dans l'ordre, à partir de la première tâche non terminée, en suivant exactement la boucle de `.cursor/rules/10-workflow.mdc` : tests d'abord, `npm run verify` vert, contrôle visuel des captures quand c'est demandé, cases cochées, entrée dans `docs/PROGRESS.md`, un commit par tâche.
3. Enchaîne les tâches sans t'arrêter pour me faire un résumé. Priorité absolue : le jalon 1 (T01 à T10) terminé et commité.
4. Si une décision n'est pas couverte, prends l'option la plus simple, note-la dans `docs/DECISIONS.md` et continue. Si tu es bloqué après 3 essais, documente, marque `[!]` et passe à la suite.
5. À la fin (ou si tu dois t'arrêter), écris la section « Point pour César » dans `docs/PROGRESS.md`.

Commence maintenant par T01.

---

## Pour relancer après une interruption

« Reprends le travail : relis `docs/PROGRESS.md` et `tasks/TASKS.md`, puis continue à la première tâche non terminée selon `.cursor/rules/10-workflow.mdc`. Ne me pose pas de question. »
