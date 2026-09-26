# Module de référence — calques (V7)

`layers.ts` est le cœur du nouveau modèle. Il est pur (ni DOM, ni Three.js), testé (`tests/unit/layers.test.ts`, 11 tests) et vérifié visuellement.

À intégrer tel quel dans `src/core/layers.ts`, avec `v1ShareDefaults.json` dans `src/core/`, en corrigeant seulement les chemins d'import. **Ne pas le réécrire.**

## Le modèle

```
SockDesignV2 { version: 2, name, dimensions, zones, quantize, decor, layers: StackLayer[] }
layers[0]  = Fond   { kind:'fond', color }             toujours en bas, unique, jamais caché
layers[1…] = Motif  { kind:'motif', source, layout, bounds }
           | Image  { kind:'image', asset, x, y, widthStitches, rotation, flipX, flipY, repeatAroundGap }
tous : id, name, hidden, locked, transparentColors[]
```

- `source` d'un Motif : `{kind:'collection', collectionId, colors (codes nuancier par zone), paletteId}` ou `{kind:'importes', tileIds}`.
- `layout` = les réglages de calepinage de V1 à V6 (`LayoutSettings` sans `tileIds`) : chaque calque Motif a les siens.
- `bounds` : `{kind:'tout'}` ou `{kind:'bande', fromRow, toRow}` (rangs de motif, 0 = sous le bord-côte).
- `transparentColors` : couleurs du calque qui laissent voir dessous. Chaque pixel est rattaché à la couleur principale la plus proche, donc les pixels d'anticrénelage suivent leur couleur.
- Les couleurs principales viennent de `layerKeyColors` : ce sont les couleurs de fil pour une collection (à passer dans `keyColors`), sinon elles sont calculées. Ce sont aussi les pastilles affichées dans l'interface.

## Chaîne de calcul

```
pour chaque calque Motif : motifLayerRgb(calque, carreaux du calque, …)   ← mettre en cache
renderStack({ layers, gauge: stackGauge(dims, zones), motifRgb, images, keyColors })
  → { rgb, owner }
rgb → quantize → composeGrid → 3D / exports   (inchangé)
owner → layerAtStitch() pour la sélection au clic dans la vue 2D
```

- On ne recalcule un Motif que si son `layout`, ses carreaux, les dimensions ou les zones changent. Changer l'ordre, masquer un calque ou changer ses couleurs transparentes ne demande que `renderStack`, qui est rapide.
- Le sur-échantillonnage 3 × 3 n'est actif que si une image est visible. Il est identique à la composition V6.

## Garanties (tests)

- **Liens réels** (`#p=1.` Jardin d'Azur et Palm Beach) :
  - le décodage par le code V6 et le décodage V7 migré en calques donnent la même grille, à l'empreinte près (`1751a01`, `5e26e231`) ;
  - le re-partage en `#p=2.` fait moins de 900 caractères et se relit à l'identique.
- **Empreintes T41** (cas 1 et 4) : identiques après migration Fond + 1 Motif.
- **Composition V6** migrée (Fond + Images) : mêmes octets RVB que `renderComposition`.
- **Empilement** : transparence, bandes, ordre, masquage, Fond protégé, identifiants uniques, palette suggérée.
- **Poignées** :
  - image : déplacer, avec le tour circulaire ; tourner, dans le sens horaire, avec un aimant à 15° ; agrandir ;
  - motif : glisser pour décaler, agrandir en gardant un nombre entier de carreaux sur le tour, bande bornée.

## Liens de partage : défauts figés

Un lien ne stocke que ce qui diffère des valeurs par défaut. Si ces valeurs changent, les anciens liens changent de sens. D'où ces règles :

- `v1ShareDefaults.json` est la copie exacte des défauts de l'application V1 à V6. Tout lien `#p=1.` se lit en fusionnant sur ce fichier (`shareDefaultsFor(1)`). **Ne jamais le modifier.**
- Les liens `#p=2.` se fusionnent sur `shareDefaultsV2()`, construit à partir des mêmes valeurs figées. Chaque calque y est stocké en différence par rapport à un gabarit figé (`packLayers`).
- `defaultDesign()` de l'application peut évoluer librement. Si un jour il faut changer les défauts d'un lien, on crée `#p=3.`.
- `reference/share/shareLink.ts` (version 2) :
  - écrit `#p=2.` et lit `#p=1.` et `#p=2.` ;
  - `decodeShare(hash, shareDefaultsFor)` renvoie `version` ;
  - un carreau SVG du lien peut porter un `id`, celui qu'utilise un calque Motif « importés ».

## Fixtures

- `tests/fixtures/liens/` contient les SVG des deux collections et leurs PNG pixelisés avec les couleurs des liens.
- Script : `scripts/rasterize-link-fixtures.mjs`. Ne pas le relancer sans raison : les empreintes en dépendent.
