# (Facultatif) Question « Ask » à poser à Cursor dans le projet du simulateur de carreaux

Claude a déjà fait l'état des lieux (voir `docs/DONNEES_CARREAUX.md`). Ce prompt sert seulement si tu veux un second avis ou si le simulateur de carreaux a beaucoup changé. Mode **Ask** (lecture seule), dans le dépôt `configurateur-carreaux-cesar-bazaar`.

---

Mode lecture seule : ne modifie aucun fichier. Je veux réutiliser les données de ce simulateur dans un autre projet (simulateur de chaussettes). Explique-moi précisément, avec les chemins de fichiers et des extraits :
1. Où sont définies les collections, leurs variations (SVG) et comment un SVG est associé à sa collection (règle de nommage).
2. Comment les couleurs sont appliquées aux SVG : zones, `data-color-id`, cas des SVG sans `data-color-id`, couleurs partagées entre variations.
3. Le nuancier : champs, signification de « Etat », comment le simulateur choisit les couleurs visibles du public.
4. Les palettes conseillées (`artist_recommendations`) : format exact, comment elles sont lues, filtrées et appliquées.
5. Les calepinages : format de `calepinages.json`, sens des rotations (horaire ou non) avec la ligne de code qui l'applique, signification de `tile: "any"` et `rot: "random"`, comment l'aléatoire est tiré.
6. Les options de collection (`active`, `dev_only`, `no_color_zone_restriction`, `category`, répartition par carton) et leur effet.
7. Tout fichier à ne jamais copier ailleurs (données confidentielles).
Termine par un tableau « fichier → rôle → à copier oui/non ».
