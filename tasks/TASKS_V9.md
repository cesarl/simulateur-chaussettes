# Tâches V9 — vue 2D lisible et calque Dessin (pixel art)

## Demandes de César

1. **Vue 2D lisible.** Sa collaboratrice ne comprend pas les zones marron et mauve. Ce sont les mailles en « flotté trop long », assombries à 65 % dans `flatView.ts › ensureStitchBitmap`. La vue 2D doit montrer les **vraies couleurs**. Les alertes deviennent une option, affichée autrement.
2. **Dessiner sur la vue 2D comme en pixel art.** Cas réel : un ami veut une ligne tout le long du tendon d'Achille, c'est-à-dire au milieu du dos, sur toute la tige, jusqu'au talon.

## Règles

Boucle habituelle (`.cursor/rules/10-workflow.mdc`), mêmes règles que V7 et V8 :

- branche `v9-dessin` depuis `main` ;
- aucune question à César ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin ;
- au plus un petit fichier e2e par tâche, avec les actions testées faites **à la souris** ;
- une capture par tâche d'interface, ouverte et décrite dans `docs/PROGRESS.md` avant de cocher.

**Intouchables** :
- `golden.test.ts` ;
- les empreintes des liens réels (`layers.test.ts`) ;
- `v1ShareDefaults.json` ;
- `v8-layers.test.ts` ;
- et maintenant `v9-dessin.test.ts`.

## Déjà fait (par Claude) dans `src/core/layers.ts`

Ne pas réécrire ; tests dans `tests/unit/v9-dessin.test.ts`.

- **Nouveau type de calque** `DessinLayer` (`kind: 'dessin'`) : `palette` (couleurs de fil), `w` × `h` (zone motif au moment du dessin) et `cells` (cases codées en plages, texte très compact).
  - 1 case = 1 maille : rien n'est redimensionné, ce qu'on dessine est exactement ce qui sera tricoté.
  - Une case vide est transparente.
  - Les rangs sont les rangs de motif : le talon est sauté, on ne peut donc pas dessiner sur le talon, la pointe ou le bord-côte, comme le veut le fabricant.
- `renderStack` gère le Dessin (masquage, couleurs transparentes, rendu partiel `rows`) ; `layerKeyColors` et la palette « d'après les calques » aussi.
- Lien `#p=2.` : gabarit `d` ajouté ; les anciens liens ne changent pas. La ligne du tendon ajoute moins de 120 caractères au lien (testé).
- Projet `.json` v3 : les calques Dessin passent tels quels.
- Changement de taille (homme ↔ femme, tige raccourcie) : `dessinCellsForGauge` répartit les colonnes à proportion, donc un trait au dos reste au dos (testé : colonnes 42–43 sur 168 → 36–37 sur 144).
- Outils purs :
  - `newDessinLayer`, `paintDessin(l, W, H, cases, couleur | null)` (null = gomme ; palette compactée) ;
  - `brushCells`, `lineCells(…, épaisseur, droit)` : chemin le plus court par le raccord, épaisseur perpendiculaire au trait ;
  - `rectCells(…, plein)` ;
  - `floodCells(clés, …)` avec `rgbKeys(rgb)` (« d'après ce qu'on voit ») ;
  - `mirrorCells(cases, axe, W)` : symétrie autour d'un repère de face ;
  - `rowsOfCells` pour le rendu partiel ;
  - `replaceDessinColor` ;
  - `dessinFromRender` : transforme n'importe quel calque en Dessin, au rendu identique (testé).
- Petites adaptations pour que tout compile (le Dessin n'a pas de poignées, n'a pas d'options de source, et « Réinitialiser » le vide) :
  - `main.ts › gizmoClient` ;
  - `layerOptions.ts › syncSource` ;
  - `state.ts › resetSelectedLayer`.

---

### [x] T70 — Vue 2D : vraies couleurs, alertes en option

- `ensureStitchBitmap` ne modifie plus jamais les couleurs : la vue 2D = la grille, pixel pour pixel.
- Bouton bascule **« Alertes »** dans la barre de la vue 2D (désactivé par défaut, mémorisé en `localStorage` avec `try/catch`). Quand il est actif, sur le **canvas de superposition** :
  - chaque flotté trop long est entouré d'un **contour rouge fin**, un rectangle par plage de mailles de même couleur (pas par maille) ;
  - les mailles isolées ont un petit rond ;
  - une légende en bas de la vue : « Contour rouge : flotté trop long (plus de N mailles de même couleur à la suite, le fil passe derrière sur une grande longueur). Rond : maille isolée. »
- Onglet Chaussette › Contrôles : les pastilles « Flottés » et « Mailles isolées » deviennent cliquables et activent « Alertes ».
- La vue 3D n'affiche jamais les alertes.

**Critères**
- [x] e2e `vue2d-couleurs.spec.ts` sur un design avec flottés :
  - la couleur lue sur le canvas 2D, au centre d'une maille en flotté, est exactement celle de la grille (`window.__SIM__`) ;
  - clic sur « Alertes » → contours visibles sur la superposition ; recharger → toujours actif.
- [x] Capture avant / après sur le design de la collaboratrice (collection Classique14, voir la capture de César), décrite.

### [x] T71 — Calque Dessin dans l'application

- Dock :
  - bouton **« + Dessin »** : crée `newDessinLayer(nextLayerId(…, 'dessin'), W, H, 'Dessin n')` au-dessus et le sélectionne ;
  - vignette = le dessin seul sur un damier clair.
- Menu « ⋯ » de tout calque Motif ou Image : **« Transformer en dessin »**. Il rend la pile, puis crée `dessinFromRender(…, index du calque, rgb, owner, …)` juste au-dessus du calque d'origine, masque l'original (sans le supprimer) et sélectionne le Dessin.
- Clic dans la vue 2D sur une maille peinte : sélectionne le Dessin (`layerAtStitch`), sauf si un outil de dessin est actif (voir T72).
- Onglet « Calque » d'un Dessin :
  - nom ;
  - lignes de couleurs (`colorRow` de V8) : œil = couleur transparente, « Remplacer… » = `replaceDessinColor` ;
  - « Effacer tout le dessin » (annulable) ;
  - nombre de mailles peintes.
- Historique : un trait ou une forme = **une** étape d'annulation.
- Sauvegarde automatique et lien : via le projet v3 et le lien `#p=2.` existants. S'assurer que rien ne filtre les calques inconnus (lecture de projet, `normalizeStack`, dock, palette, décor « comme la chaussette »).

**Critères**
- [x] Test unitaire : projet v3 avec un Dessin → sérialisé → relu → même rendu.
- [x] e2e : « + Dessin » → calque dans le dock ; « Transformer en dessin » sur un Motif → rendu 2D identique (mêmes couleurs de canvas en 5 points), et l'original est masqué.

### [x] T72 — Outils de dessin dans la vue 2D

Quand un calque Dessin est sélectionné, une **barre d'outils de dessin** apparaît dans la vue 2D (et disparaît sinon).

- **Outils** :
  - Crayon (B) ;
  - Gomme (E) ;
  - Trait (L) : Maj = horizontal, vertical ou 45° ;
  - Rectangle (R) : plein ou contour ;
  - Pot de peinture (G) : « d'après ce qu'on voit » (`rgbKeys`) par défaut, ou « d'après le dessin » ;
  - Pipette (I, ou Alt + clic avec n'importe quel outil) ;
  - Main (Espace maintenue) pour déplacer la vue.
- **Épaisseur** 1 à 4 mailles.
- **Symétrie** : « Aucune », « Devant ↔ Dos » (axe W/4, qui est aussi l'axe 3W/4), « Intérieur ↔ Extérieur » (axe 0) ; utiliser `mirrorCells`.
- **Aimantation** du trait sur les repères de face (± 2 mailles) quand l'aimantation est active : tracer au milieu du dos devient trivial.
- **Aperçu** : sous la souris, les mailles que l'outil va peindre sont surlignées sur la superposition.
- **Pendant un trait** :
  - les mailles s'accumulent ;
  - `paintDessin` est appliqué sur un état de travail ;
  - rendu partiel `renderStack(…, { rows: rowsOfCells(…), into })` ;
  - au plus un rafraîchissement 2D par image, et 3D au plus 8 fois par seconde ;
  - **validation au lâcher** : une seule étape d'historique, lien et sauvegarde mis à jour à ce moment-là.
- **Hors zone** (bord-côte, talon, pointe) : curseur « interdit » et bulle « Le talon est tricoté d'une seule couleur : on ne peut pas y dessiner. » (même texte adapté pour le bord-côte et la pointe).
- **Zoom** (molette, centré sur la souris) : jusqu'à 1 maille ≈ 24 px ; les lignes de mailles s'affichent à partir d'un zoom lisible (vérifier ce qui existe déjà depuis V8).
- Raccourcis clavier actifs seulement quand la vue 2D a le focus et que le focus n'est pas dans un champ.

**Critères**
- [x] e2e `dessin-achille.spec.ts`, **uniquement à la souris** (le cas réel) :
  - « + Dessin » → outil Trait, épaisseur 2, Maj ;
  - glisser du haut de la tige au repère « Dos » jusqu'au bas de la tige ;
  - vérifier via `window.__SIM__` : les colonnes 42 et 43 sont peintes du rang 0 au rang 179, et rien au rang 180 ni ailleurs ;
  - Annuler → plus rien ; Rétablir → revenu ;
  - « Copier le lien » → ouvrir → même trait.
- [x] e2e : le crayon avec symétrie « Devant ↔ Dos » peint aussi la maille miroir ; le pot « d'après ce qu'on voit » remplit une forme d'un Motif ; la pipette prend la couleur.
- [x] Capture : le trait du tendon d'Achille en 2D **et en 3D vue de dos**, décrite. Le trait doit descendre le long du dos et s'arrêter au talon.

### [x] T73 — Couleur du crayon

- Pastille « couleur courante » dans la barre de dessin. Au clic, un sélecteur s'ouvre (même composant que « Remplacer… » de V8) :
  1. « Déjà sur la chaussette » : palette effective + bord-côte, talon, pointe ;
  2. le nuancier (couleurs « Validé »), avec une recherche par code ou par nom ;
  3. les 8 dernières couleurs utilisées.
- La pipette met à jour la couleur courante.
- Si ajouter une couleur fait dépasser le maximum de la machine, le bandeau de V8 s'affiche, comme pour les autres calques. Le dessin n'est pas bloqué.

**Critères**
- [x] e2e : choisir une couleur du nuancier par sa recherche, dessiner → la maille prend exactement ce fil.

### [ ] T74 — Bilan V9

- README :
  - vue 2D (vraies couleurs, bouton Alertes) ;
  - calque Dessin (outils, raccourcis, symétrie, « Transformer en dessin ») ;
  - la recette « ligne au tendon d'Achille » en 5 clics.
- Captures dans `docs/captures/v9/`.
- « Point pour César ».
- `npm run verify` complet vert. Pull request `v9-dessin`.
