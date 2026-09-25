# Module de référence — décor en carreaux de ciment (sol, mur)

`tileSurface.ts` génère un sol et/ou un mur en vrais carreaux posés, à partir des SVG de la collection (recolorés) et du même moteur de calepinage que la chaussette. Vérifié visuellement (Medina 20 × 20, Lianes, Ramo 10 × 10). Version 2 après retour de César : mat, joints blancs peu profonds, grain réel, couleurs non pâlies.

- `buildTileSurface()` : textures canvas — couleur (carreaux tournés selon le calepinage, couleurs franches, très légère variation de teinte d'un carreau à l'autre, **grain photo** `public/textures/grain-ciment.jpg` fourni par César, appliqué en « lumière douce » avec un morceau et un quart de tour différents par carreau), joint fin (1,5 mm) blanc cassé à peine en retrait, **finition mate** (pas de biseau, pas d'effet embossé, peu de reflets). Atténuation facultative (0 par défaut).
- `tileCmFromFormat(format)` : 20 × 20 → 20 cm, 10 × 10 → 10 cm, d'après le champ `format` de la collection.
- `createDecor()` : plans Three.js. Sol : posé à y = 0, reçoit l'ombre de la chaussette, s'estompe vers le fond en mode « sol » (transparence radiale). Mur : derrière la chaussette, **face à la caméra** (`faceCamera` à appeler avant chaque rendu et chaque capture, voir le paramètre `beforeRender` de `capturePng`).
- Échelle réelle : `tileCm` = format de la collection (20 × 20 cm le plus souvent, 10 × 10 pour certaines).
- `heightToNormal()` est pur et testé (`tests/unit/decor.test.ts`).

Pourquoi pas l'image d'illustration de la collection (`collection_image`) : elle est hébergée sur Squarespace (autre domaine). Le navigateur « salit » alors le canvas WebGL et **bloque les exports PNG**. Le décor généré depuis les SVG n'a pas ce problème, il suit les couleurs choisies, et il est net à toutes les tailles.

Quand le décor est actif, masquer l'ombre au sol du studio (`studio.ground.visible = false`) en mode sol/coin : le sol en carreaux reçoit l'ombre lui-même.
