# Tâches V3 — talon réglable, calepinages multi-motifs, réinitialisation

Retours de César après la V2 :
1. « Le talon monte trop haut » → hauteur, profondeur et largeur du talon réglables.
2. « Quand je mets plusieurs motifs, ça n'affiche que le premier » → vrai calepinage multi-motifs (jusqu'à 16 carreaux et plus), à la suite, aléatoire, avec rotations fixes, +90°, aléatoires… et ses **75 préréglages** du configurateur de carreaux.
3. « Je touche à tout pour tester et à la fin je suis perdu » → réinitialiser chaque section, tout réinitialiser, annuler/rétablir.

Modules de référence fournis, validés et testés : `reference/sock3d/` (forme, talon réglable) et `reference/calepinage/` (moteur de calepinage). Lire leurs `README.md`. **Les intégrer, ne pas les réécrire.** Compléments au cahier des charges : `docs/CAHIER_DES_CHARGES_COMPLEMENT_V3.md`.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`). Traiter dans l'ordre. T18 reste en attente du fabricant.

---

### [ ] T24 — Talon réglable
- Reporter `reference/sock3d/sockShape.ts` (nouveaux paramètres `heelHeight`, `heelDepth`, `heelSpread`, constantes `HEEL_DEFAULTS`) dans `src/render/sock3d/`, ainsi que `demo.ts` et `sock-demo.html` s'ils ont été gardés.
- État : ajouter à la zone Talon `heelHeightMm` (25–110, défaut 55), `heelDepthMm` (40–130, défaut 72), `heelSpread` (50–100 %, défaut 100 %). Anciens projets sans ces champs → valeurs par défaut.
- Panneau, section Zones › Talon : trois curseurs « Hauteur du talon (mm) », « Profondeur sous le pied (mm) », « Largeur du talon (%) », avec une bulle d'aide : « Aperçu seulement : la taille réelle du talon dépend du tricotage (rangs de talon), à valider avec le fabricant. »
- Ces réglages changent l'atlas et les attributs UV du maillage (pas la vue à plat) : reconstruire sans bloquer l'interface (anti-rebond) ; le compteur `geometryBuilds` peut augmenter.
- Régénérer les captures du test T21 : elles sont fournies dans `reference/sock3d/captures/` (talon par défaut plus bas).

**Critères**
- [ ] `tests/unit/sock3d.test.ts` fourni (14 tests, dont les réglages du talon) vert.
- [ ] e2e : hauteur du talon 40 puis 95 → sur l'export profil extérieur, la proportion de pixels « couleur du talon » augmente nettement (au moins +30 %).
- [ ] T21 (silhouettes) vert avec les nouvelles captures ; captures ouvertes et décrites dans `PROGRESS.md`.

### [ ] T25 — Moteur de calepinage multi-motifs
- Copier `reference/calepinage/calepinage.ts` dans `src/core/calepinage.ts` et `calepinages.json` dans `config/calepinages.json` (importé au build). Déplacer `tests/unit/calepinage.test.ts` (seuls les imports changent ; il doit passer tel quel).
- Remplacer `LayoutSettings.kind` (ancien `LayoutKind`) par le `CalepinageSpec` du module (garder taille, joint, couleur de joint, décalages). **Migration** des projets enregistrés, avec un test : `grille` → générée `unique` ; `quinconce-h`/`-v` → `unique` + appareillage ; `rotation-4` → `rosace` ; `miroir-4` → `miroir` ; `damier` → `suite` (pas 1) ; `rotation-aleatoire` → `unique` + `aleatoire-90`. La graine existante est conservée.
- Réécrire l'échantillonnage de `src/core/layout.ts` sur le modèle de `reference/calepinage/sampler.ts` : plan des cases (`planPlacements`, bouclé sur le tour quand `raccord().tilesAround` est entier) → case de la maille (`cellAtStitch`) → rotation/miroir (`tileUV`) → pixel du bon carreau. Tous les carreaux importés sont utilisés, dans l'ordre de la liste (motif 1 = premier de la liste).
- Indicateur de raccord : utiliser `raccord()` (message lisible) ; le bouton « ajuster » utilise `fittingTileWidths()`.
- Performances : 16 carreaux, 200 aiguilles × 600 rangs, en moins de 300 ms (sinon Web Worker, comme prévu en T13).

**Critères**
- [ ] `calepinage.test.ts` fourni vert + test de migration.
- [ ] Test unitaire : 4 carreaux unis de 4 couleurs différentes, calepinage `suite` → les 4 couleurs sont présentes dans la grille, dans l'ordre attendu sur le premier rang de carreaux.
- [ ] Test unitaire : préréglage `damier_16` avec 16 carreaux unis → 16 couleurs dans la grille avant réduction de palette.
- [ ] e2e : importer les 3 carreaux d'exemple, choisir « À la suite, rotation aléatoire » → capture 3D et vue à plat montrent les 3 motifs (vérification visuelle décrite dans `PROGRESS.md`).

### [ ] T26 — Galerie de calepinages
Section « Calepinage » du panneau, organisée ainsi :
- **Galerie** de vignettes cliquables, en deux blocs : « Rapides » (`GENERATED_PRESETS`) et « Préréglages du configurateur » (groupés par `famille` : Rosaces, Compositions, Damier, Damier iflip, Damier rotation aléatoire, Lianes, Ophis, Aléatoire).
- Chaque vignette est un **aperçu réel** (petit canvas, bloc répété 2 fois, avec les carreaux importés ; formes grises numérotées s'il n'y a pas encore de carreau), recalculé quand les carreaux changent. Badge « N motifs ». Si le préréglage demande plus de motifs qu'il n'y en a d'importés : badge orange « motifs réutilisés ».
- Filtre « Nombre de motifs : tous / ≤ nombre importé / exactement le nombre importé » (défaut : ≤).
- Sous la galerie, bloc « Personnaliser » (replié par défaut) : ordre, pas de rangée, rotation, angle fixe, appareillage, rotation globale. Modifier un réglage fait passer la source en « générée » sans perdre les réglages.
- Bouton **« Nouveau tirage »** (graine + 1), visible seulement si le calepinage contient de l'aléatoire.
- Liste des carreaux : chaque vignette affiche son numéro de motif (1, 2, 3…) ; réordonner change la numérotation et l'aperçu.
- Bouton « Importer des préréglages (.json) » : charge un autre fichier au même format (remplace la bibliothèque pour la session et l'enregistre dans le projet) ; afficher les `warnings` de `normalizePresets` dans une zone repliable.
- `data-testid` : `calep-gallery`, `calep-thumb-<id>`, `calep-reroll`, `calep-custom`, `calep-filter`.

**Critères**
- [ ] e2e : 75 préréglages + 11 rapides visibles avec le filtre « tous » ; cliquer `calep-thumb-rosace` change la grille (empreinte différente) ; `calep-reroll` change la grille pour un calepinage aléatoire et ne la change pas pour `ramo`.
- [ ] e2e : avec 2 carreaux importés et le filtre « ≤ », `damier_16` est masqué, `damier_2` visible.
- [ ] Capture de la galerie ouverte et décrite dans `PROGRESS.md`.

### [ ] T27 — Réinitialiser, annuler, rétablir
- `defaultDesign()` unique (source des valeurs par défaut). Dans l'en-tête de **chaque section** (Carreaux excepté : on ne supprime pas les images), bouton « Réinitialiser » qui remet seulement cette partie de l'état à sa valeur par défaut.
- Une pastille discrète « modifié » à côté du titre des sections qui diffèrent des valeurs par défaut.
- En bas du panneau : « Tout réinitialiser » (garde les carreaux importés) avec confirmation en place (le bouton devient « Confirmer ? » pendant 4 s, pas de `window.confirm`).
- **Annuler / Rétablir** : boutons en haut du panneau + Ctrl+Z / Ctrl+Maj+Z (Cmd sur Mac). Historique de 100 états ; les mouvements continus d'un curseur comptent pour un seul pas.
- `data-testid` : `reset-<section>`, `reset-all`, `undo`, `redo`.

**Critères**
- [ ] Tests unitaires du store : réinitialiser une section ne touche pas les autres ; annuler/rétablir ; un glissement de curseur = un pas.
- [ ] e2e : modifier calepinage + talon + gros pixels, `reset-calepinage` → seul le calepinage revient au défaut ; `undo` le rétablit ; `reset-all` + confirmation → tout au défaut, carreaux conservés.

### [ ] T28 — Bilan V3 pour César
- Mettre à jour `README.md` (section Utilisation : galerie, nouveau tirage, talon, réinitialisation, raccourcis).
- « Point pour César » dans `PROGRESS.md` avec 4 captures : 3 carreaux à la suite + rotation aléatoire, « Rosace », un préréglage Ophis, talon bas.
