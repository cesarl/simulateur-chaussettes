# Décisions

Une entrée par décision non couverte par le cahier des charges. César relit cette liste.

```
## D0X — <titre court> (tâche T0X)
Contexte : <pourquoi il fallait décider>
Options : <A / B / C>
Choix : <option> — <raison en une phrase>
Conséquence : <ce que ça implique, comment revenir en arrière>
```

---

## D01 — Pas de framework d'interface (T00)
Contexte : le panneau est un ensemble de formulaires.
Options : React / Vue / DOM natif.
Choix : DOM natif — moins de dépendances, build plus simple, suffisant pour un panneau.
Conséquence : petits composants maison dans `src/ui/controls.ts`.

## D02 — Colonne 0 côté intérieur de la jambe (T00)
Contexte : il faut une convention pour placer talon, pointe et raccord du motif.
Choix : colonne 0 = côté intérieur ; moitié `[0, n/2)` = arrière. Le raccord tombe sur le côté le moins visible.
Conséquence : à confirmer avec le fabricant (sens de tricotage, côté de la pointe) ; modifiable en un seul endroit de `src/core/grid.ts`.

## D03 — Fond de motif et mailles hors tricot (T02)
Contexte : `composeGrid` doit toujours produire une couleur par maille, y compris sans motif et sur la moitié vide du talon et de la pointe.
Options : laisser l'index 0 / couleur dédiée documentée / omettre ces cellules de la palette.
Choix : couleur dédiée — `#f4f1ea` (fond, seulement si la palette de motif est vide) et `#d9d4cc` (hors tricot). Les deux sont dédupliquées avec le reste de la palette.
Conséquence : la vue à plat pourra distinguer le hors-tricot ; remplacer ces constantes dans `src/core/grid.ts` si le fabricant impose une autre convention.

## D04 — Modèle par défaut (T03)
Contexte : le cahier impose taille homme, calepinage grille, 4 couleurs auto et bord-côte, pas les autres valeurs initiales.
Options : tout à zéro / valeurs de démonstration lisibles.
Choix : carreau de 24 mailles × `round(24 / rapport)` rangs (32 avec la jauge actuelle), motif aussi sur le pied, couleurs bord-côte `#1f3a5f`, talon `#b5462f`, pointe `#1d1d1b`, pied `#f4f1ea`, nom de fichier `modele`.
Conséquence : tout est modifiable dans le panneau ; les défauts sont regroupés dans `defaultDesign()` (`src/state.ts`).

## D05 — Géométrie du calepinage (T04)
Contexte : le cahier décrit les familles de calepinage sans fixer le sens des décalages, l’emplacement du joint, ni le traitement de la transparence.
Options : pavage infini / motif recadré sur un seul tour ; joint centré / joint en bas à droite ; transparence ignorée / remplacée.
Choix : pavage infini, maille `(col, rang)` = coordonnée `(col − décalage, rang − décalage)` ; joint à droite et en bas ; quinconce horizontal vers la droite et vertical vers le bas, d’une demi-taille de carreau ; pixels d’alpha inférieur à 128 remplacés par le premier pixel opaque (coin haut-gauche, parcours ligne à ligne), sinon `#f4f1ea` ; sortie RVB (3 octets). Période = pas du carreau, ×2 pour rotation-4, miroir-4 et damier. À distance égale, `nearestFittingWidth` choisit la largeur la plus grande. Rotation aléatoire : un pas de mulberry32 mélangé à la position du carreau.
Conséquence : le raccord (`seamMismatch`) ne dépend pas du décalage. Le détail est en tête de `src/core/layout.ts`.

## D06 — K-means et nettoyage (T05)
Contexte : il faut une palette automatique reproductible, et une règle précise pour les mailles isolées.
Options : k-means++ / médiane-coupe ; plusieurs passages de nettoyage / un seul.
Choix : k-means++ à graine fixe `0x51ec0517`, distance euclidienne au carré, au plus 16 itérations. N est borné de 2 à 8. Si l'image a déjà au plus N couleurs, on les garde telles quelles. Le mode manuel utilise la distance redmean. Le nettoyage se fait en un seul passage sur la grille d'origine (une ligne de deux mailles n'est pas mangée). Les couleurs sans maille après nettoyage sortent de la palette.
Conséquence : le résultat est identique à chaque appel. Le détail est en tête de `src/core/quantize.ts`.

## D07 — Forme 3D de la chaussette (T06)
Contexte : l'architecture décrit la chaussette portée sans donner les courbes exactes.
Options : tube coudé à rayon constant / poche de talon par Bézier avec avant immobile / modèle sculpté.
Choix : cylindre de jambe légèrement évasé au mollet ; pendant le talon, la moitié avant reste immobile et la moitié arrière suit une Bézier qui descend et recule (semelle plate) ; le pied s'extrude vers l'avant ; la pointe rejoint un seul point. Les quads d'aire nulle (avant du talon) ne sont pas émis, pour éviter des normales NaN. Échelle : `0,01 / jauge` mètre par maille ou par rang.
Conséquence : la forme est entièrement dans `src/render/sockGeometry.ts`. Le côté de la pointe reste celui de la grille (moitié arrière active).

## D08 — Relief de maille (T07)
Contexte : il faut un V de jersey et des côtes, sur un seul matériau, sans que la couleur de la grille soit floutée.
Options : deux maillages / un shader qui choisit le relief selon la zone / tout en V.
Choix : `DataTexture` NearestFilter pour la couleur ; normales et occlusion du V répétées (aiguilles × rangs), mipmaps et anisotropie max ; dans le bord-côte (`vMapUv.y`), ces cartes sont remplacées par des côtes verticales (une côte pour deux mailles). L'intérieur (face arrière) est multiplié par 0,38. Three r186 n'expose pas `vUv` dès qu'une carte est présente : on lit `vMapUv`.
Conséquence : le mélange est dans `onBeforeCompile` de `src/render/knitTexture.ts`.

## D09 — Panneau : sections encore vides et palette manuelle (T08)
Contexte : le cahier demande les sections Contrôles et Exports dès le panneau complet, alors que leur logique arrive en T12 et T10. Le mode palette manuelle n'a pas de fils par défaut.
Options : masquer ces sections / les afficher vides avec une phrase / y mettre des contrôles factices.
Choix : les deux sections sont présentes, ouvertes, avec une phrase d'attente. Une palette manuelle vide reçoit quatre fils (`#1f3a5f`, `#b5462f`, `#f4f1ea`, `#1d1d1b`). Le champ tige n'a pas d'attribut `max` HTML : le dépassement est détecté puis ramené par `clampLegRows`, avec le message.
Conséquence : T10 et T12 remplaceront le texte d'attente. Les fils initiaux sont dans `MANUAL_SEED` (`src/ui/panel.ts`).

## D10 — Mailles de la vue à plat (T09)
Contexte : le rapport réel des mailles et une couleur de pixel exacte (sans lissage) doivent tenir ensemble, et le quadrillage ne doit pas masquer le test de couleur.
Options : mailles fractionnaires lissées / rectangles entiers zoomés / image 1 px rééchantillonnée.
Choix : rectangle de base 4 px de large sur `round(4 × rapport)` px de haut, zoom entier de 1 à 8 (molette), déplacement au glisser. Le quadrillage n'est dessiné qu'à partir de 12 px de large. Les noms de zones sont à gauche, les numéros tous les 10 mailles et rangs dans les marges.
Conséquence : au zoom 1, une maille fait 4×3 px avec la jauge actuelle. Le détail est dans `src/ui/flatView.ts`.
