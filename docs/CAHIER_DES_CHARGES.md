# Cahier des charges — Simulateur de chaussettes jacquard César Bazaar

Version 1.0 — 25 septembre 2026
Porteur : César Bazaar (Pantin)

## 1. Contexte et objectif

César Bazaar lance une gamme de chaussettes solidaires dont les motifs viennent de ses carreaux de ciment. Les chaussettes sont tricotées en jacquard sur machine circulaire (fabricants en discussion : Manufacture Perrin, Broussaud…).

Les fabricants et les partenaires demandent des visuels. L'outil doit produire :

1. **des aperçus 3D fidèles** d'une chaussette portée, exportables en PNG sous plusieurs angles, qui serviront ensuite de base à une IA d'image pour un rendu photoréaliste (les motifs doivent donc être exactement à leur place) ;
2. **la grille de mailles à plat** (1 pixel = 1 maille), qui sert à la discussion technique avec le fabricant.

Le principe reprend celui du simulateur de carreaux de ciment de César : on importe des carreaux et on règle leur calepinage.

## 2. Principe technique à respecter

> « Une chaussette, c'est une vieille télé avec de très gros pixels. » — le fabricant

- Chaque maille est un pixel. La **grille de mailles** est la source de vérité : l'aperçu 3D et l'export à plat en dérivent tous les deux.
- La largeur de la grille est le **nombre d'aiguilles** du cylindre (le tour de la chaussette). Sa hauteur est le **nombre de rangs**.
- Une maille n'est pas carrée : elle est plus large que haute (rapport fixé par la jauge : mailles/cm et rangs/cm). Le calepinage doit en tenir compte pour ne pas déformer les carreaux.
- Pas de dégradés, pas de détails plus fins qu'une maille, nombre de couleurs limité.
- Le motif fait le tour complet de la jambe : il doit se raccorder au dos (la répétition doit idéalement diviser le nombre d'aiguilles).

## 3. Anatomie de la chaussette (de haut en bas, dans l'ordre du tricot)

| Zone | Motif ? | Couleur | Notes |
|---|---|---|---|
| Bord-côte (côtes) | Non | couleur propre | Optionnel (modèle sans bord-côte possible). Hauteur réglable. |
| Tige (jambe) | **Oui** | motif | Hauteur mi-mollet. Peut être raccourcie, **jamais allongée** au-delà du maximum de la taille. |
| Talon | Non | couleur propre | Tricoté sur la moitié des aiguilles (côté arrière). |
| Pied | Oui (option) | motif ou couleur unie | Le motif peut continuer sur le pied (dessus et semelle). |
| Pointe | Non | couleur propre | Tricotée sur la moitié des aiguilles puis remaillée. |

Bord-côte, talon et pointe peuvent chacun avoir une couleur différente.

Deux tailles : **homme** et **femme**. Les valeurs (aiguilles, rangs par zone, jauge) sont provisoires et regroupées dans `config/sizes.json` : elles seront confirmées par le fabricant et ne doivent être codées nulle part ailleurs.

## 4. Fonctions attendues

### 4.1 Interface générale
- Application web locale en TypeScript, ouverte dans le navigateur (Chrome ou Edge récents), sans serveur ni compte.
- Écran divisé : **à gauche la vue** (3D, ou grille à plat, au choix), **à droite le panneau de réglages**.
- Interface en français. Chaque réglage met à jour l'aperçu en moins d'une demi-seconde sur un ordinateur portable ordinaire.

### 4.2 Vue 3D
- Chaussette en 3D, forme « portée » (sur une jambe invisible, comme une photo produit), orientable à la souris (rotation, zoom, sans décalage de la caméra hors du sujet).
- Vraie texture de mailles : on doit voir les « V » du jersey, pas un simple papier peint.
- Le motif est appliqué avec des coordonnées de texture (UV) exactes : une maille de la grille = une maille sur le modèle.
- Bord-côte avec un relief de côtes, talon et pointe visibles comme zones distinctes.
- Fond neutre, éclairage doux de studio.

### 4.3 Vue à plat
- Affiche la grille de mailles complète (toutes zones), avec zoom, quadrillage optionnel, repères de zones et numérotation des rangs/mailles tous les 10.
- Les mailles sont dessinées avec leur vrai rapport largeur/hauteur.

### 4.4 Carreaux (motifs)
- Importer un ou plusieurs carreaux en **PNG** ou **SVG** (glisser-déposer ou bouton). Afficher leurs vignettes, pouvoir les supprimer et les réordonner.
- Un exemple de carreau est chargeable en un clic (fichiers de `public/fixtures/`).

### 4.5 Calepinage
Réglages, comme dans le simulateur de carreaux :
- **Taille** d'un carreau en mailles (largeur) et en rangs (hauteur), avec option « garder les proportions » (qui tient compte du rapport de maille).
- **Espacement** (joint) horizontal et vertical en mailles, couleur du joint.
- **Calepinage** : grille droite, quinconce horizontal, quinconce vertical, rotation ×4 (bloc 2×2), miroirs ×4 (bloc 2×2), damier de 2 carreaux, rotation aléatoire (graine réglable).
- **Rotation globale** (0/90/180/270°) et **décalage** du motif (mailles, rangs) pour placer le raccord.
- Indicateur de **raccord circulaire** : « le motif tombe juste » ou « décalage de N mailles au dos », avec un bouton qui ajuste la largeur au plus proche diviseur du nombre d'aiguilles.

### 4.6 Dimensions et jauge
- Choix de la taille (homme / femme), qui charge les valeurs par défaut.
- Hauteur de la tige en rangs (bornée par le maximum de la taille), hauteur des autres zones en rangs.
- Tour de jambe = nombre d'aiguilles (modifiable, pour tester une autre machine).
- Jauge : mailles/cm et rangs/cm. Affichage des dimensions réelles en cm.

### 4.7 Conversion en « gros pixels »
- Le motif est échantillonné maille par maille (couleur **majoritaire** pour un rendu net, ou **moyenne**).
- Réduction à **N couleurs** (réglable, 2 à 8) : palette automatique, ou palette **manuelle** (couleurs de fils imposées, saisies en hexadécimal ou au sélecteur).
- Option **nettoyage** : suppression des mailles isolées.
- Affichage de la palette finale avec le nombre de mailles par couleur.

### 4.8 Zones
- Bord-côte : présent ou non, hauteur (rangs), couleur.
- Talon : couleur. Pointe : couleur.
- Pied : motif oui/non, couleur si non.

### 4.9 Contrôles de fabrication (alertes, non bloquantes)
- Nombre total de couleurs, et nombre de couleurs par rang, comparés aux limites de `config/sizes.json`.
- **Flottés** trop longs (trop de mailles consécutives de la même couleur sur un rang, au-delà du seuil) : nombre de cas et surlignage dans la vue à plat.
- Raccord circulaire (voir 4.5).

### 4.10 Exports
- **PNG 3D** : une ou plusieurs vues prédéfinies (face, trois-quarts, profil extérieur, dos, profil intérieur), taille 2048 × 2048 par défaut, fond neutre uni (couleur réglable) ou transparent. Un clic = un fichier par vue (ou une archive ZIP si plusieurs vues).
- **PNG à plat exact** : 1 pixel = 1 maille (largeur = aiguilles, hauteur = rangs).
- **PNG à plat lisible** : agrandi, mailles au bon rapport, quadrillage, repères de zones, légende de la palette.
- **Projet** : enregistrer / rouvrir un modèle (fichier `.json` contenant les réglages et les carreaux).
- Noms de fichiers explicites : `<modele>_<taille>_<vue>.png`.

## 5. Hors périmètre de la V1 (idées pour plus tard)
- Export BMP indexé directement lisible par le logiciel de la machine (à valider avec le fabricant).
- Export carte de profondeur / masque des zones pour guider l'IA d'image.
- Planche de présentation (plusieurs vues sur une image).
- Motifs spécifiques par zone (ex. logo sur la semelle), bouclette, remaillage visible.
- Mise en ligne publique.

## 6. Contraintes techniques
- TypeScript strict, Vite, Three.js. Pas de framework d'interface (DOM natif). Aucune dépendance supplémentaire sans justification écrite dans `docs/DECISIONS.md`.
- Logique métier pure (sans DOM ni Three.js) dans `src/core/`, couverte par des tests unitaires.
- Tests de bout en bout Playwright sur le build de production.
- Fonctionne hors ligne une fois chargé. Aucune donnée n'est envoyée sur internet.

## 7. Jalons
- **Jalon 1 — démo fabricant (lundi 28 septembre)** : tâches T01 à T10 de `tasks/TASKS.md` (import, calepinage, gros pixels, 3D texturée, vue à plat, exports PNG).
- **Jalon 2 — outil de travail (mi-octobre)** : T11 à T15 (projets, contrôles de fabrication, performances, fidélité des mailles).
- **Jalon 3 — finitions (avant fin novembre)** : T16 et suivantes, valeurs définitives du fabricant.
- Objectif commercial : chaussettes en vente pour Noël.

## 8. Critères de recette globale
1. Depuis un carreau SVG, en moins de 2 minutes, César obtient 4 vues PNG 3D et la grille à plat d'un modèle homme.
2. Changer la taille, le calepinage ou une couleur de zone met l'aperçu à jour sans rechargement.
3. La grille exportée a exactement `aiguilles × rangs` pixels et au plus N couleurs de motif + couleurs de zones.
4. Aucune erreur dans la console du navigateur pendant ces opérations.
