# Aiguilles, jauge, rangs : ce qui change la taille des motifs

Texte de référence pour l'aide de l'interface (bulles « ? » et encadré de la section « Réglages machine »).

## Les trois réglages machine

| Réglage | Ce que c'est | Qui le décide |
|---|---|---|
| **Nombre d'aiguilles** | Nombre de mailles sur le tour de la jambe (le cylindre de la machine a ce nombre d'aiguilles). C'est la **largeur de la grille**. | La machine du fabricant (ex. 168 aiguilles). |
| **Jauge horizontale** (mailles/cm) | Combien de mailles tiennent dans 1 cm de large, tricot au repos. | Le fil et la machine. |
| **Jauge verticale** (rangs/cm) | Combien de rangs tiennent dans 1 cm de haut. | Le fil et la machine. |

Ce sont des **données du fabricant**, pas des réglages de dessin : une fois connues (appel Perrin), on ne les touche plus.

## Pourquoi mes dessins changent de taille quand je les modifie

La chaussette est une grille : **1 maille = 1 pixel**. Un carreau fait un certain nombre de mailles de large (ex. 28) et de rangs de haut (ex. 37).

1. **Nombre d'aiguilles** : le tour de la jambe a toujours la même taille (c'est une jambe), mais il est découpé en plus ou moins de mailles. Avec 168 aiguilles, un carreau de 28 mailles fait 1/6 du tour ; avec 200 aiguilles, le même carreau n'en fait plus que 1/7 : **il paraît plus petit**.
2. **Jauge verticale** : une maille est plus large que haute. Pour qu'un carreau reste **carré dans la réalité**, il lui faut plus de rangs que de mailles : `rangs = mailles × (rangs/cm) ÷ (mailles/cm)`. Changer la jauge recalcule donc la hauteur du carreau en rangs. Elle change aussi la **hauteur réelle de la tige** (180 rangs à 10 rangs/cm = 18 cm ; à 12 rangs/cm = 15 cm) : la chaussette 3D raccourcit ou s'allonge.
3. **Jauge horizontale** : elle ne change pas la grille mais change la **taille réelle** annoncée (en cm) et, avec la jauge verticale, les proportions d'un carreau carré.

## Ce qu'on affiche désormais

Le réglage principal devient **« Carreaux sur le tour de la jambe »** (3, 4, 5, 6…) : c'est ce qu'on regarde vraiment sur une chaussette. La largeur en mailles s'en déduit (`aiguilles ÷ nombre de carreaux`, fractionnaire si besoin) et le motif **tombe toujours juste** au raccord.

Encadré de lecture, mis à jour en direct :

> **1 carreau = 28 mailles × 37 rangs ≈ 3,7 × 3,7 cm** · 6 carreaux sur le tour · tour de jambe au repos ≈ 22,4 cm · tige 180 rangs ≈ 18 cm

Les trois réglages machine passent dans une section repliée « Réglages machine (fabricant) », avec ce texte d'aide et un petit schéma (grille de mailles, une maille agrandie avec sa largeur et sa hauteur en mm).

## Et le trait au raccord ?

Le motif fait le tour de la jambe. Si le nombre de carreaux sur le tour n'est pas entier (ex. 168 mailles ÷ 25 = 6,72 carreaux), le dernier carreau est **coupé** là où le tour se referme : c'est le trait qu'on voit. C'est normal en tricot circulaire. Solutions :
- **« Carreaux sur le tour »** (réglage par défaut) : jamais de carreau coupé ;
- sinon, choisir **où tombe le raccord** : au dos (défaut, là où il se voit le moins), à l'intérieur, à l'extérieur ou devant.
