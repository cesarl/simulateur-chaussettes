# Tâches — rendu 3D réaliste (à traiter après T17, avant T18)

Retour de César sur la V1 : « la chaussette 3D est affreuse, on dirait un cylindre et un pavé ». La vue à plat et les réglages sont bons, **on n'y touche pas**.

Un module de référence validé visuellement est fourni dans `reference/sock3d/` (lire son `README.md`) avec des captures cibles dans `reference/sock3d/captures/`. Le travail consiste à l'**intégrer** proprement, pas à le réinventer. En cas de doute sur la forme, l'éclairage ou le matériau, c'est le module de référence qui a raison.

Même boucle de travail que d'habitude (`.cursor/rules/10-workflow.mdc`) : tests d'abord, `npm run verify` vert, contrôle visuel des captures, cases cochées, entrée dans `docs/PROGRESS.md`, un commit par tâche.

---

### [x] T19 — Intégrer la forme et le matériau de référence
- Copier `reference/sock3d/{sockShape,sockAtlas,knitMaps,sockObject,studio}.ts` dans `src/render/sock3d/`. `sockShape`, `sockAtlas` et `knitMaps` restent purs (pas de Three.js, pas de DOM) : noter dans `docs/DECISIONS.md` qu'ils vivent sous `src/render/` car ils sont propres à la 3D.
- Brancher sur l'état de l'application : dimensions (`SockDimensions`, bord-côte absent ⇒ `cuffRows: 0`), grille (`StitchGrid`), couleurs de talon et de pointe (`ZoneSettings`). Adapter les types si l'application les a fait évoluer, sans changer le comportement du module.
- Remplacer l'ancienne géométrie et l'ancien matériau (supprimer les fichiers devenus inutiles, et leurs tests). La géométrie n'est reconstruite que si les dimensions changent ; un changement de couleur ou de motif appelle seulement `setColors` (conserver le compteur `geometryBuilds` de `window.__SIM__`).
- Déplacer `tests/unit/sock3d.test.ts` (fourni) vers les nouveaux chemins ; il doit passer tel quel (seuls les imports changent).
- La démo `sock-demo.html` (fournie à la racine) peut rester pour comparaison : l'ajouter comme 2ᵉ entrée du build dans `vite.config.ts` (`build.rollupOptions.input`) et `reference` dans `tsconfig.json` → `include`. La supprimer à la fin de T21 si elle n'est plus utile.
- Renderer : `preserveDrawingBuffer: true`, `alpha: true`, et `setupRenderer`/`createStudio` de `studio.ts` (tone mapping Neutral, ombres, environnement). Retirer l'ancien éclairage.

**Critères**
- [x] `npm run verify` vert, dont les 9 tests de `sock3d.test.ts`.
- [x] Aucune trace de l'ancienne chaussette (plus de cylindre ni de pavé dans le code).
- [x] Changer une couleur de talon ne reconstruit pas la géométrie (e2e via `geometryBuilds`).
- [x] Changer taille / hauteur de tige / bord-côte reconstruit la géométrie, sans erreur console.

### [x] T20 — Vues et exports avec le studio
- Les boutons de vue et les exports PNG utilisent `frameView` et `capturePng` de `studio.ts`. Vues proposées : trois-quarts, profil extérieur, face, dos, profil intérieur, trois-quarts dos (`dessous` reste réservée aux contrôles, non proposée à l'utilisateur).
- Fond : couleur réglable (défaut `#ecebe8`) ou transparent.
- La caméra interactive démarre en trois-quarts, cible le centre de la chaussette, zoom borné (on ne traverse pas la chaussette, on ne la perd pas de vue).
- Les exports à plat (PNG exact, lisible, BMP) ne changent pas.

**Critères**
- [x] e2e : export trois-quarts 2048 → PNG 2048×2048 ; export transparent → coin de l'image avec alpha = 0.
- [x] Après un export, la vue de l'utilisateur est inchangée (taille du canvas et position de caméra identiques).

### [x] T21 — Contrôle visuel par rapport aux captures de référence
- Test e2e `tests/e2e/rendu-reference.spec.ts` : configurer l'application comme les captures `homme-etoile-*` (taille homme, valeurs par défaut de `config/sizes.json`, bord-côte présent, carreau `carreau-test-etoile.svg`, 6 carreaux sur le tour, quinconce horizontal, palette auto 3 couleurs, bord-côte `#1f3a5f`, talon et pointe `#c0392b`), exporter trois-quarts, profil extérieur et dos en 1200 px.
- Comparer la **silhouette** (pixels différents du fond `#ecebe8` à ±6 près) avec celle de la capture de référence de même nom : indice de recouvrement (intersection / union) ≥ 0,90. Le décodage des PNG se fait dans la page (`createImageBitmap` + canvas).
- Enregistrer les captures produites dans `test-results/visuel-T21-*.png`, les **ouvrir** avec l'outil de lecture d'image, les comparer à `reference/sock3d/captures/` et décrire dans `PROGRESS.md` : forme (mollet, cheville, talon en poche, semelle à plat, pointe arrondie), relief de maille visible, frontières en chevron, couleurs fidèles, pas d'artefact (trou, cratère à la pointe, couture visible, facettes).

**Critères**
- [x] Recouvrement ≥ 0,90 pour les 3 vues.
- [x] Description visuelle écrite ; tout défaut constaté est corrigé avant de cocher.

### [x] T22 — Chaussette gauche et vue « paire » (bonus, si tout le reste est vert)
- Option « pied » : droit / gauche (`side` du module).
- Export « paire » : deux chaussettes côte à côte (gauche légèrement en retrait et tournée de 15°), même studio, cadrage commun.

**Critères**
- [x] e2e : export paire 2048 → PNG valide, deux silhouettes distinctes (deux composantes connexes de pixels non-fond).
- [x] Capture ouverte et décrite dans `PROGRESS.md`.

---

### [x] T23 — Forme anatomique v2 (mise à jour du module de référence)
César a trouvé la première forme difforme (bosse sur le dessus du pied). `reference/sock3d/sockShape.ts` a été réécrit (profils anatomiques ANSUR II, voir le `README.md` du module) et les captures de `reference/sock3d/captures/` ont été régénérées.
- Remplacer `src/render/sock3d/sockShape.ts` par la nouvelle version de `reference/sock3d/sockShape.ts` (et reporter les éventuelles adaptations de types faites en T19). Les autres fichiers du module n'ont pas changé sur le fond : comparer et ne reporter que les différences.
- Le test `tests/unit/sock3d.test.ts` fourni doit toujours passer.
- Relancer T21 (recouvrement de silhouette ≥ 0,90 avec les NOUVELLES captures) et décrire les nouvelles captures dans `PROGRESS.md` : dessus du pied en pente régulière (pas de bosse), talon arrondi, semelle à plat.

**Critères**
- [x] `npm run verify` vert.
- [x] T21 repassé avec les nouvelles captures ; description visuelle écrite.
