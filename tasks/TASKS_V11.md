# Tâches V11 — Finitions : une interface claire, compacte et professionnelle

## Demande de César

L'outil marche. Il va être utilisé à plusieurs, donc il doit devenir **lisible, compact et beau** : un vrai outil pro, pas un « template Bootstrap » avec de gros boutons. C'est du polissage ; après cette série, on s'arrête.

1. **Galerie des favoris** : les aperçus sont trop hauts et trop fins. Il faut des cartes **4:5**, bien mises en page, et des menus « Renommer / Supprimer / Copier le lien » **fermés par défaut**, jolis et pratiques.
2. **Simulateur** :
   - retirer « Enregistrer » ;
   - Annuler / Rétablir en **icônes** (Ctrl+Z, Ctrl+Y) ;
   - boutons condensés, avec icônes et infobulles.
3. **Bibliothèque** (collections, bibliothèque intégrée, partagée, images du projet) : mise en page soignée, **menus contextuels**, et **petites flèches** qui déplient plus d'infos.

## Règles de cette série

Boucle habituelle (`.cursor/rules/10-workflow.mdc`), dans Cursor en local :

- branche `v11-finitions` depuis `main` ;
- aucune question à César ; décisions dans `docs/DECISIONS.md` ; un commit par tâche ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin.

**Pas de changement de comportement** :

- mêmes fonctions, mêmes raccourcis ;
- **mêmes `data-testid`** : les e2e existants doivent rester verts, et on ne les change que si un élément disparaît vraiment, par exemple « Enregistrer » ;
- les intouchables des séries précédentes restent intouchables ;
- aucune nouvelle dépendance lourde : pas de framework d'interface, pas de bibliothèque de composants.

**Captures avant / après obligatoires** pour chaque tâche : la capture « avant » est prise **avant** de toucher le code. Elles vont dans `docs/captures/v11/`, sont ouvertes et décrites dans `PROGRESS.md`, avec ce qui a changé et ce qui reste imparfait.

Les tailles sont à vérifier à **1440 × 900** et à **1100 × 800**, et pour la galerie aussi à **390 px** (téléphone).

---

### [x] T90 — Fondations visuelles (système de design léger)

**Variables** dans `:root` (`src/styles.css`), puis on les utilise partout au lieu des valeurs en dur :

- **Couleurs** : garder l'identité actuelle (fond crème `#f4f1ec`, encre `#1d1d1b`, accent brique `#b5462f`) et ajouter :
  - `--surface` (panneaux) et `--surface-2` (survol) ;
  - `--line` (traits) et `--line-strong` ;
  - `--muted` ;
  - `--accent-soft` (fond léger de l'accent) ;
  - `--danger` ;
  - `--focus` (anneau de focus visible).
- **Échelle d'espacement** 4 / 8 / 12 / 16 / 24 / 32 px.
- **Rayons** 6 et 10 px.
- **Deux ombres** : `--shadow-1` pour les cartes, `--shadow-pop` pour les menus et les fenêtres.
- **Texte** :
  - police système, 13 px pour l'interface et 12 px pour les libellés secondaires ;
  - 15 à 18 px pour les titres ;
  - chiffres tabulaires pour les valeurs (`font-variant-numeric: tabular-nums`).

**Composants** réutilisables (`src/ui/kit/`), en TypeScript et CSS simples :

- **`icons.ts`** : une trentaine d'icônes SVG en ligne, épaisseur de trait 1,75, taille 16 ou 18 px, `currentColor`. Reprendre les tracés de **Lucide** (licence ISC, à mentionner dans le README). Au minimum :
  - annuler, rétablir, lien, étoile, étoile pleine ;
  - bibliothèque, galerie, dossier ouvert, télécharger, envoyer ;
  - plus, ⋯, chevron bas et chevron droit, crayon, corbeille, copier ;
  - œil, œil barré, cadenas ouvert et fermé, calque ;
  - carré 2D, cube 3D, loupe, fermer, info, réglages, pinceau, gomme.
- **`button.ts`** : trois variantes seulement.
  - **principal** : l'action de la zone, au plus un par zone ;
  - **discret** (bordure fine) ;
  - **icône** : 32 × 32, sans bordure, fond au survol.

  Hauteur 32 px (28 px en compact), état désactivé visible, focus clavier visible.
- **`tooltip.ts`** : infobulle propre au survol et au focus, après 400 ms, avec le raccourci clavier en petit (ex. « Annuler · Ctrl+Z »). Tous les boutons-icônes en ont une, et un `aria-label`.
- **`menu.ts`** : **menu contextuel** unique pour toute l'application.
  - Ouverture au clic sur « ⋯ » ou au clic droit, là où c'est pertinent.
  - Fermeture au clic dehors, avec Échap ou après un choix.
  - Navigation au clavier (↑ / ↓ / Entrée) ; placement automatique, retourné s'il déborde de l'écran.
  - Contenu : icône + libellé + raccourci éventuel, séparateurs, et un élément « danger » en rouge pour Supprimer.
  - **Un seul menu ouvert à la fois.**
- **`disclosure.ts`** : petite flèche (chevron) qui déplie ou replie un bloc d'infos, avec une animation courte et `aria-expanded`.
- **`toast.ts`** : notification discrète en bas au centre (« Lien copié », « Supprimé — Annuler »), disparaît après 3 à 5 s.
- **`dialog.ts`** : fenêtre modale commune, utilisée pour le favori, le mot de passe et le renommage. Titre, contenu, boutons alignés à droite, Échap et Entrée.

**Critères**
- [x] Une page de démonstration `kit.html`, en mode dev, montre tous les composants. Capture décrite.
- [x] e2e `kit.spec.ts`, à la souris et au clavier :
  - le menu s'ouvre, se ferme avec Échap et au clic dehors ;
  - un seul menu ouvert à la fois ;
  - l'infobulle apparaît au survol.

### [x] T91 — Barre du projet (simulateur)

Hauteur 44 px, un seul rang, groupes séparés par un fin trait vertical :

```
[■ Nom du modèle ✎]  │  ↶ ↷  │  [▣ 2D][▢ 3D]          🔍 Bibliothèque   ▦ Favoris   🔗   ★ Favori (principal)   ⋯
```

- **Nom** : modifiable sur place (clic sur le nom ou sur le crayon).
- **Annuler / Rétablir** : icônes seules, avec infobulle et raccourci. Grisées quand il n'y a rien à annuler ou à rétablir. Raccourcis actifs partout, sauf dans un champ de texte :
  - Annuler : Ctrl+Z (⌘Z sur Mac) ;
  - Rétablir : Ctrl+Y, Ctrl+Maj+Z, ⌘⇧Z.
- **2D / 3D** : bouton segmenté, deux bascules avec icône (état mémorisé comme en V8).
- **Copier le lien** : icône lien ; toast « Lien copié ».
- **★ Favori** : seul bouton principal de la barre ; « ★ Mettre à jour » quand la chaussette vient d'un favori.
- **« Enregistrer » est retiré de la barre.**
  - « Ouvrir un fichier .json… » et « Exporter le projet (.json) » passent dans le menu « ⋯ », car un projet avec des carreaux PNG importés en a encore besoin.
  - Le menu « ⋯ » contient aussi « Galerie des favoris » et « Aide / raccourcis ».
- En dessous de 1100 px de large, les libellés disparaissent : icônes seules, avec infobulles.

**Critères**
- [x] e2e à la souris :
  - Annuler et Rétablir par les icônes, puis par Ctrl+Z / Ctrl+Y ;
  - le bouton « Enregistrer » n'existe plus, « Exporter le projet (.json) » est dans ⋯ et télécharge bien ;
  - les zones de la barre ne se chevauchent pas à 1100 px.
- [x] Captures avant / après à 1440 et 1100 px.

### [x] T92 — Panneau d'options, onglets et dock des calques

- **Onglets** (Calque, Chaussette, Décor, Export, Global) : onglets soulignés, icône + libellé, 36 px de haut.
- **Sections** : en-tête compact 32 px avec chevron (`disclosure`) ; espacements de l'échelle ; libellé à gauche et commande à droite quand elle est courte (cases, petits nombres).
  - **Curseurs** : valeur éditable à droite, unité en gris.
  - **Pastilles de couleur** : 20 px, bordure fine, nom du fil en infobulle.
  - Les boutons « Réinitialiser » deviennent des icônes discrètes (flèche circulaire) dans l'en-tête de section.
- **Dock des calques** :
  - cartes plus fines ;
  - œil et cadenas en icônes ;
  - menu « ⋯ » avec le composant `menu` : Dupliquer, Transformer en dessin, Monter, Descendre, Supprimer (danger) ;
  - « + Motif / + Image / + Dessin » regroupés dans un seul bouton « + Calque ▾ » avec menu ;
  - calque sélectionné : contour accent et fond `--accent-soft`.
- **Onglet Global** :
  - « Tout réinitialiser » en bouton danger, avec confirmation par la fenêtre commune ;
  - « Oublier le mot de passe » ;
  - « Quitter le mode dev ».

**Critères**
- [x] Le panneau d'options tient à 1440 × 900 sans défilement pour l'onglet Calque d'un Motif simple, sections repliées sauf la première.
- [x] e2e existants verts (options, dock, dessin).
- [x] Captures avant / après : onglet Calque (Motif, Image, Dessin), Chaussette, dock.

### [ ] T93 — Galerie des favoris

- **En-tête collant** :
  - titre « Favoris » avec leur nombre ;
  - recherche avec icône loupe ;
  - tri (récents, nom) ;
  - bouton « Corbeille » (avec son nombre) ;
  - bouton « Ouvrir le simulateur ».
- **Grille** : `repeat(auto-fill, minmax(220px, 1fr))`, 20 px d'écart, 2 colonnes sur téléphone, marges confortables.
- **Carte** :
  - **cadre 4:5 strict** (`aspect-ratio: 4 / 5`), image en `object-fit: cover` ; ne plus jamais étirer ni écraser la vignette ;
  - rayon 10 px, ombre légère, léger zoom de l'image au survol (1,03) ;
  - sous l'image : nom (une ligne, « … » si trop long) et date relative (« il y a 2 jours ») ;
  - bouton « ⋯ » en haut à droite, **visible seulement au survol ou au focus** (toujours visible sur écran tactile) ;
  - menu avec le composant commun : Ouvrir, Ouvrir en visionneuse, Copier le lien, Renommer, Supprimer (danger) ;
  - clic sur la carte : ouvre, comme en V10.
- **Renommer** : fenêtre commune, champ pré-rempli et sélectionné.
- **Supprimer** : immédiat, toast « « Nom » mis à la corbeille — Annuler ».
- **Mot de passe** : fenêtre commune, demandé seulement au premier besoin.
- **Corbeille** : même grille, cartes grisées, bouton « Restaurer ».
- **États** :
  - chargement : cartes squelettes 4:5 animées ;
  - vide : illustration simple (icône étoile) et phrase d'aide ;
  - erreur : message et bouton « Réessayer ».
- **Vignettes existantes** : si certaines anciennes vignettes ne sont pas en 4:5, elles sont recadrées au centre par `object-fit`. Si elles ont été **déformées à l'enregistrement**, corriger l'encodage de la vignette (T82 de V10 : garder le rapport 4:5, 480 × 600) et le noter.

**Critères**
- [ ] e2e `favoris-galerie.spec.ts` mis à jour, à la souris :
  - le rapport largeur/hauteur de chaque vignette est 0,8 ± 1 % ;
  - aucun menu n'est visible au chargement ;
  - « ⋯ » → Renommer, et Supprimer → Annuler par le toast ;
  - Échap ferme le menu.
- [ ] Captures avant / après sur ordinateur (1440) et téléphone (390), décrites.

### [ ] T94 — Bibliothèque

Fenêtre large (≈ 1000 × 680, adaptée à l'écran) :

- **Colonne de gauche** : Collections, Images › Intégrée, Images › Partagée, Images › Projet, chacune avec son nombre.
- **En haut** : recherche avec loupe (collante) ; filtres par catégorie pour les collections (Signature, Classiques, Nouveautés, Mes collections), en petites pastilles.
- **Cartes carrées** (vignette VAR1 recolorée pour les collections) : nom, et nombre de variations en petit.
  - Au survol : bouton principal « Ajouter » (ajoute un calque Motif) et « ⋯ » avec le menu commun : Ajouter comme motif, Ajouter une variation comme image ›, Renommer / Retirer pour la bibliothèque partagée (mot de passe).
  - **Petite flèche « infos »** (disclosure) sur chaque carte ; une seule ouverte à la fois, dépliée sous la carte ou dans un panneau latéral. Elle montre :
    - collections : format (20 × 20 / 10 × 10), variations en miniatures, pastilles des couleurs par défaut avec les codes du nuancier, palettes conseillées ;
    - images : dimensions, poids, date d'ajout, et « bibliothèque intégrée / partagée / projet ».
- **Images › Partagée** : première carte « + Envoyer une image » en zone de dépôt (glisser-déposer ou clic), avec barre de progression, doublon signalé, et erreurs claires (trop lourde, format).
- **Images › Projet** : images embarquées du projet, avec « Envoyer dans la bibliothèque partagée » dans le menu.
- Double-clic sur une carte : ajoute directement.
- Échap ferme ; le focus revient au bouton qui a ouvert la fenêtre.

**Critères**
- [ ] e2e `bibliotheque.spec.ts` et `images-partagees.spec.ts` mis à jour, à la souris :
  - filtrer, ouvrir les infos d'une collection (couleurs visibles), « Ajouter » → calque Motif ;
  - dans Partagée, « ⋯ » → Renommer.
- [ ] Captures avant / après de chaque onglet, et d'une fiche d'infos ouverte, décrites.

### [ ] T95 — Cohérence et finitions

- **Tout passe par le kit** :
  - la barre de la visionneuse (icônes, vues, « Copier le lien », décor) ;
  - les fenêtres (favori, mot de passe, renommer, confirmation) ;
  - les messages, qui deviennent des toasts ;
  - les boutons d'export.
- **Focus clavier visible partout**, ordre de tabulation logique, `aria-label` sur toutes les icônes.
- **Chasse aux restes** : plus aucun gros bouton gris par défaut du navigateur, plus de texte collé aux bords, alignements sur la grille de 4 px.
- **Aide / raccourcis** (menu ⋯) : petite fenêtre qui liste les raccourcis (annuler, rétablir, vues 3D, outils de dessin, Maj+D mode dev).

**Critères**
- [ ] Captures finales de chaque zone à 1440 × 900 : simulateur (Motif, Image, Dessin), visionneuse, bibliothèque, galerie ; téléphone : visionneuse et galerie.
- [ ] `npm run verify` complet vert.

### [ ] T96 — Bilan V11

- README :
  - captures ;
  - mention de Lucide (licence) ;
  - le kit (comment réutiliser bouton, menu et infobulle).
- « Point pour César » avec les captures avant / après côte à côte.
