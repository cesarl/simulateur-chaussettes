# Message à coller dans l'agent Cursor (rendu 3D)

---

Nouvelle série de tâches, en autonomie complète : je suis indisponible, ne me pose aucune question.

Mon retour sur la V1 : la chaussette 3D est affreuse (un cylindre et un pavé). Le reste (réglages, vue à plat, exports à plat) est bon : n'y touche pas.

Je t'ai fourni un module de référence déjà validé visuellement : `reference/sock3d/` (lis d'abord son `README.md`, puis regarde les images de `reference/sock3d/captures/`). Ta mission est de l'intégrer proprement dans l'application, pas de le réécrire.

1. Relis `.cursor/rules/10-workflow.mdc`.
2. Traite `tasks/TASKS_RENDU_3D.md` dans l'ordre (T19 → T22), avec la même boucle que d'habitude : tests d'abord, `npm run verify` vert, captures ouvertes et décrites, cases cochées, `docs/PROGRESS.md`, un commit par tâche.
3. En cas de doute sur la forme, la lumière ou le matériau, le module de référence a raison. Si tu dois t'en écarter, écris pourquoi dans `docs/DECISIONS.md`.
4. T18 reste en attente des valeurs du fabricant : ne la traite pas.
5. À la fin, mets à jour la section « Point pour César » de `docs/PROGRESS.md` avec les captures produites.

Commence par T19.
