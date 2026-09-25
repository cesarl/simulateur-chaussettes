# Complément au cahier des charges — V3 (25 septembre 2026)

Rédigé à partir des retours de César. Complète `CAHIER_DES_CHARGES.md` sans le remplacer.

## Talon (§4.8)
- Réglages d'aperçu : hauteur du talon au dos (mm), profondeur sous le pied (mm), largeur autour de la cheville (%). Défaut plus bas qu'en V2 (55 mm / 72 mm).
- Ces réglages ne modifient pas la grille de tricot (nombre de rangs du talon), seulement l'aperçu 3D.

## Calepinage multi-motifs (§4.5, remplace la liste des calepinages)
- Tous les carreaux importés sont utilisés (jusqu'à 16 et plus). Motif 1 = premier carreau de la liste, etc.
- Bibliothèque : les 75 préréglages du configurateur de carreaux de César (`config/calepinages.json`, même format), plus des calepinages rapides : un seul motif, à la suite (diagonale ou colonnes), +90° à chaque carreau, rotation aléatoire, aléatoire, aléatoire sans voisins identiques, rosace, miroirs, quinconce.
- Galerie à vignettes réelles, filtrable par nombre de motifs, import d'un autre fichier de préréglages.
- Aléatoire reproductible (graine) et bouton « Nouveau tirage ». Rotation dans le sens horaire, comme dans le configurateur.
- Raccord au dos calculé selon la répétition du calepinage ; proposition de largeurs de carreau qui tombent juste.

## Confort (§4.1)
- Réinitialiser chaque section, tout réinitialiser (en gardant les carreaux), annuler / rétablir (Ctrl+Z / Ctrl+Maj+Z), pastille « modifié » sur les sections changées.
