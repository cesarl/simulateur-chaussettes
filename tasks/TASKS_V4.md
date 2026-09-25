# Tâches V4 — collections, SVG et palettes du simulateur de carreaux

César veut jouer directement avec **ses collections** (75 collections, 189 SVG, nuancier de 181 couleurs, 96 palettes conseillées par l'artiste) au lieu d'importer des carreaux un par un. Les données sont copiées depuis son simulateur de carreaux par un script, `public/carreaux/` (lancé par César, l'agent n'a pas accès à ce dépôt).

À lire d'abord : `docs/DONNEES_CARREAUX.md`, `reference/collections/collections.ts`, `scripts/sync-carreaux.mjs`, et les modules déjà fournis (`reference/calepinage/`, mis à jour : mêmes règles que le simulateur de carreaux).

Boucle habituelle (`.cursor/rules/10-workflow.mdc`). Si des tâches de `tasks/TASKS_V3.md` restent à faire, les terminer avant. T18 reste en attente du fabricant.

---

### [ ] T29 — Script de synchronisation et catalogue
- `scripts/sync-carreaux.mjs` est fourni (ne pas le réécrire). Ajouter à `package.json` : `"sync:carreaux": "node scripts/sync-carreaux.mjs"`.
- Déplacer `tests/unit/collections.test.ts` (fourni, utilise `tests/fixtures/configurateur-mini/`) ; il doit passer tel quel.
- Copier `reference/collections/collections.ts` dans `src/core/collections.ts`. Mettre à jour `src/core/calepinage.ts` et `tests/unit/calepinage.test.ts` avec les versions de `reference/calepinage/` (alignées sur le simulateur de carreaux : numéro de motif trop grand → dernier motif, listes de motifs, rotations non reconnues → 0°, cases hors bloc ignorées).
- `src/io/catalogue.ts` : charge `carreaux/catalogue.json` et `carreaux/calepinages.json` (chemins relatifs, `base: './'`). **Si absent** : l'application fonctionne comme avant, avec un message discret « Collections non synchronisées : lancez `npm run sync:carreaux` ».
- La bibliothèque de calepinages de la galerie (T26) vient désormais de `public/carreaux/calepinages.json` quand il existe (sinon `config/calepinages.json`).

**Critères**
- [ ] `collections.test.ts` et `calepinage.test.ts` fournis verts.
- [ ] e2e : sans `public/carreaux/`, aucune erreur console et le message s'affiche (simuler l'absence en interceptant la requête).

### [ ] T30 — Choisir une collection
- Nouvelle section en tête du panneau : **« Collection »**, avec recherche par nom, groupes par catégorie (Signature, Classiques, Nouveautés, Autres), vignette = SVG VAR1 recoloré avec ses couleurs d'origine, badge « N motifs ». Collections `dev_only` masquées (case « afficher les collections en développement »).
- Choisir une collection : ses variations deviennent les carreaux (VAR1 = motif 1, VAR2 = motif 2…), son calepinage par défaut est appliqué, et la galerie de calepinages (T26) affiche en premier un groupe **« Calepinages de la collection »** (ses `calepinages`).
- Les carreaux importés à la main restent possibles (« Mes carreaux ») ; importer un carreau à la main quitte le mode collection.
- `data-testid` : `coll-search`, `coll-item-<id>`, `coll-current`.

**Critères**
- [ ] e2e (avec un catalogue de test servi par Playwright via `page.route`, construit depuis `tests/fixtures/configurateur-mini`) : choisir `medina` → 4 vignettes de carreaux, calepinage `aleatoire` sélectionné, groupe « Calepinages de la collection » contenant `damier_4`.
- [ ] Capture 3D de 3 vraies collections (si `public/carreaux/` existe dans le dépôt) ouverte et décrite dans `PROGRESS.md`.

### [ ] T31 — Palettes et couleurs de fil
- Les SVG sont **recolorés par zone** (`recolorSvg`) puis pixelisés. La palette de la chaussette est **exactement** l'ensemble des couleurs de zones (réduction de couleurs forcée en mode manuel sur ces couleurs ; pas de k-means en mode collection).
- Bloc « Couleurs » : bandes cliquables « Couleurs d'origine » puis « Suggestion de l'artiste 1, 2… » (`paletteOptions`, seulement les couleurs validées ; case « afficher les couleurs en test »).
- Sous les bandes : une pastille par zone (zone-1, zone-2…) ; clic → sélecteur du nuancier (recherche par nom ou code, regroupé par famille BL, GN, OR…, affiche nom, code, RAL). Changer une couleur recolore les carreaux et met à jour 3D et vue à plat.
- Bouton « Assortir bord-côte, talon et pointe » (`suggestZoneColors`) ; les sélecteurs de couleur de ces zones proposent aussi le nuancier.
- Affichage : « N couleurs de fil » ; alerte si N dépasse `maxColorsTotal` de `config/sizes.json`.
- Légende des exports à plat : code + nom de chaque couleur (ex. « OR008 · Terracotta »), pour le fabricant.
- `data-testid` : `pal-option-<id>`, `zone-swatch-<zone>`, `nuancier-search`, `match-zones`.

**Critères**
- [ ] Test unitaire : grille issue de `medina` avec ses couleurs d'origine → palette du motif = exactement les 4 hex de BW002, OR008, WT001, BL017.
- [ ] e2e : choisir « Suggestion de l'artiste 1 » de `lianes` change la palette de la grille ; changer zone-1 via le nuancier aussi ; `match-zones` change bord-côte/talon/pointe.
- [ ] Captures (vue à plat + 3D) avec deux palettes différentes de la même collection, décrites dans `PROGRESS.md`.

### [ ] T32 — Projets, synchronisation et bilan
- Le fichier projet enregistre : collection (id), couleurs par zone (codes), calepinage, et le commit de synchronisation (`catalogue.source.commit`). À la réouverture après une nouvelle synchronisation, tout se recharge ; si la collection n'existe plus, les carreaux enregistrés dans le projet sont utilisés et un message l'indique.
- `README.md` : section « Collections du simulateur de carreaux » (synchroniser, choisir, palettes).
- « Point pour César » dans `PROGRESS.md` avec 4 captures de vraies collections.

**Critères**
- [ ] Test unitaire aller-retour projet avec collection.
- [ ] `npm run verify` vert.
