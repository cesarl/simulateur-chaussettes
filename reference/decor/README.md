# Module de référence — décor en carreaux de ciment (sol, mur)

`tileSurface.ts` génère un sol et/ou un mur en vrais carreaux posés, à partir des SVG de la collection (recolorés) et du même moteur de calepinage que la chaussette. Vérifié visuellement (Medina, Lianes, Ramo).

- `buildTileSurface()` : textures canvas — couleur (carreaux tournés selon le calepinage, variations de teinte, grain du ciment, bords arrondis, joint), relief (normales calculées depuis une carte de hauteur : joints creusés, micro-relief), rugosité (cire satinée sur les carreaux, joint mat), atténuation (éclaircit le décor pour laisser la chaussette au premier plan).
- `createDecor()` : plans Three.js. Sol : posé à y = 0, reçoit l'ombre de la chaussette, s'estompe vers le fond en mode « sol » (transparence radiale). Mur : derrière la chaussette, **face à la caméra** (`faceCamera` à appeler avant chaque rendu et chaque capture, voir le paramètre `beforeRender` de `capturePng`).
- Échelle réelle : `tileCm` = format de la collection (20 × 20 cm le plus souvent, 10 × 10 pour certaines).
- `heightToNormal()` est pur et testé (`tests/unit/decor.test.ts`).

Pourquoi pas l'image d'illustration de la collection (`collection_image`) : elle est hébergée sur Squarespace (autre domaine). Le navigateur « salit » alors le canvas WebGL et **bloque les exports PNG**. Le décor généré depuis les SVG n'a pas ce problème, il suit les couleurs choisies, et il est net à toutes les tailles.

Quand le décor est actif, masquer l'ombre au sol du studio (`studio.ground.visible = false`) en mode sol/coin : le sol en carreaux reçoit l'ombre lui-même.
