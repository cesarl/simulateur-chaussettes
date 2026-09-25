# Tâche V5.1 — décor plus réaliste (à faire après T38, ou à fusionner dans T38 si elle n'est pas commencée)

Retour de César : le sol/mur « fait jeu vidéo années 90 » — trop brillant, joints trop creusés et sombres, effet embossé, couleurs pâlies.

### [x] T40 — Décor v2 : carreaux de ciment mats
- Remplacer `src/render/decor/tileSurface.ts` par la nouvelle version de `reference/decor/tileSurface.ts` (reporter les éventuelles adaptations de T38). Nouveautés : finition mate, joint 1,5 mm blanc cassé `#f3f1ec` à peine en retrait, plus de biseau ni de bords ombrés, relief très léger (`normalScale` 0,25), `envMapIntensity` 0,6, atténuation 0 par défaut, **grain photo** (`grain` en entrée, option `grainStrength`).
- Charger `public/textures/grain-ciment.jpg` (fourni) une fois au démarrage et le passer à `buildTileSurface({ grain })`. Sans image : grain de secours généré (déjà prévu).
- Taille réelle des carreaux : `tileCmFromFormat(collection.format)` (20 × 20 → 20 cm, 10 × 10 → 10 cm) ; nombre de carreaux du décor ≈ 2,4 m de côté (`Math.round(240 / tileCm)`) ; `pxPerTile` 256 (20 cm) ou 160 (10 cm) pour rester sous 4096 px.
- Réglages du décor dans le panneau : garder format (pré-rempli depuis la collection), joint (mm, couleur), grain (0–100 %), patine, atténuation (0 par défaut).
- Mettre à jour `tests/unit/decor.test.ts` (fourni, 5 tests).

**Critères**
- [x] `decor.test.ts` vert.
- [x] Captures sol + mur avec une collection 20 × 20 (medina) et une 10 × 10 (RAMO), ouvertes et décrites dans `PROGRESS.md` : pas de reflets brillants, joints fins et clairs, grain visible de près, couleurs aussi franches que les SVG, carreaux deux fois plus petits pour RAMO.
