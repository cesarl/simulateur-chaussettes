# Tâches V5 — visionneuse publique, lien de partage, raccord, jauge, décor

Retours de César après la mise en ligne sur `*.workers.dev` (pas de nom de domaine, c'est voulu).

Modules de référence fournis et testés, à intégrer sans les réécrire :
- `reference/share/shareLink.ts` (+ `tests/unit/share.test.ts`) — lien de partage et mode dev ;
- `reference/calepinage/calepinage.ts` (+ tests) — nouveaux : `seamColumn`, `tileWidthForCount`, `tileRowsFor`, raccord tolérant aux largeurs fractionnaires ;
- `reference/decor/` (+ `tests/unit/decor.test.ts`) — sol et mur en carreaux de ciment ;
- `reference/sock3d/studio.ts` — `capturePng` accepte un rappel `beforeRender` (pour le mur face caméra).
Textes d'aide : `docs/JAUGE_EXPLIQUEE.md`.

Boucle habituelle (`.cursor/rules/10-workflow.mdc`). Chaque tâche : tests d'abord, `npm run verify` vert, captures ouvertes et décrites, cases cochées, `PROGRESS.md`, un commit. T18 reste en attente du fabricant.

---

### [x] T33 — Un seul ascenseur
Cause : `#panel` est un élément de grille sans `min-height: 0` ; la rangée grandit avec son contenu et la page entière défile en plus du panneau.
- `html, body { height: 100%; overflow: hidden; }` ; `#app { height: 100dvh; grid-template-rows: minmax(0, 1fr); }` ; `#panel, #viewport { min-height: 0; }` ; en dessous de 1280 px : `grid-template-rows: minmax(0, 1fr) minmax(0, 1fr)`.

**Critères**
- [x] e2e (1400×900 et 1100×800) : panneau ouvert au maximum (toutes sections dépliées) → `document.scrollingElement.scrollHeight <= innerHeight` et le panneau défile seul (`#panel.scrollHeight > #panel.clientHeight`).

### [x] T34 — Visionneuse par défaut, réglages en mode dev
- Par défaut : **uniquement la 3D, en plein écran**, avec une petite barre discrète : nom du modèle / de la collection, boutons de vue (3/4, profil, dos, face), « Copier le lien ». Pas de panneau, pas de vue à plat.
- `?dev` dans l'URL active le mode dev (panneau complet, vue à plat, exports) et le **mémorise** (localStorage, `resolveDevMode`) : on reste en dev même sans `?dev`, jusqu'au bouton **« Quitter le mode dev »** (en bas du panneau, `leaveDevMode`). `?dev` est retiré de la barre d'adresse au chargement.
- Stockage indisponible : l'application fonctionne (dev seulement pour la session si `?dev`).
- `data-testid` : `viewer-bar`, `viewer-copy-link`, `leave-dev`.

**Critères**
- [x] e2e : `/` → pas de `panel` visible, canvas plein écran ; `/?dev` → panneau visible et URL sans `dev` ; recharger `/` → toujours dev ; `leave-dev` puis recharger → visionneuse.

### [x] T35 — Lien de partage
- Intégrer `shareLink.ts`. Le **lien contient tout le projet** dans le hash `#p=1.…` : réglages, collection + couleurs par zone (codes), calepinage + graine, talon, raccord, décor… (diff par rapport à `defaultDesign()`).
- Carreaux importés à la main : SVG inclus s'ils sont petits (lien < 6 000 caractères au total) ; sinon message « Les carreaux importés ne sont pas dans le lien : utilisez une collection ou envoyez le projet .json ». Les PNG importés ne sont jamais inclus.
- Bouton **« Copier le lien »** (mode dev : en haut du panneau ; visionneuse : dans la barre). Le hash est aussi tenu à jour pendant qu'on travaille (`history.replaceState`, anti-rebond 500 ms) pour qu'un simple rechargement conserve tout.
- Au chargement : si un hash est présent, il **prime** sur la sauvegarde automatique ; lien illisible ou d'une version future → message discret, état par défaut. **Jamais** de mode dev dans un lien.
- Le numéro de version du lien suit celui du format de projet ; si `defaultDesign()` change, garder la compatibilité (les champs absents prennent la valeur par défaut, c'est le principe du diff).

**Critères**
- [x] `share.test.ts` fourni vert + test d'intégration : état modifié → lien → nouvel onglet → même empreinte de grille et même vue.
- [x] e2e : en dev, modifier collection, palette, calepinage, talon → copier le lien → l'ouvrir dans un nouveau contexte **sans** localStorage → visionneuse (pas de panneau) avec exactement la même chaussette (comparaison de capture 3/4 : silhouette et couleurs dominantes identiques).

### [x] T36 — Jauge expliquée, « carreaux sur le tour »
Lire `docs/JAUGE_EXPLIQUEE.md` (texte à reprendre dans l'interface).
- Réglage principal de la taille des carreaux : **« Carreaux sur le tour de la jambe »** (curseur 2 à 12, défaut selon la collection : 6). Largeur = `tileWidthForCount(aiguilles, n, joint)`, hauteur = `tileRowsFor(largeur, jauges)` si « garder les proportions ». Les largeurs fractionnaires sont admises partout (moteur de calepinage, vue à plat).
- Mode avancé (case « Taille libre en mailles ») : les curseurs actuels largeur/hauteur en mailles.
- **Encadré de lecture** mis à jour en direct : « 1 carreau = L mailles × H rangs ≈ x × y cm · n carreaux sur le tour · tour de jambe au repos ≈ … cm · tige … rangs ≈ … cm ».
- Aiguilles, jauge horizontale, jauge verticale : section repliée **« Réglages machine (fabricant) »** avec le texte d'aide et un petit schéma SVG (grille + une maille agrandie cotée en mm). Bulles « ? » sur chaque réglage.

**Critères**
- [x] Tests unitaires : 5 carreaux sur 168 aiguilles → aucune colonne coupée (le motif de la colonne 0 prolonge celui de la colonne 167).
- [x] e2e : changer la jauge verticale ne change pas le nombre de carreaux sur le tour ; l'encadré affiche les nouvelles valeurs.

### [~] T37 — Où tombe le raccord
- Réglage « Raccord du motif » : **Dos** (défaut), Intérieur, Extérieur, Devant. Décalage horizontal effectif = `seamColumn(position, aiguilles)` + décalage choisi par l'utilisateur.
- En mode « taille libre » quand le motif ne tombe pas juste : message « Carreau coupé au raccord (dos) » + bouton « Faire tomber juste » (passe en « carreaux sur le tour » avec le nombre le plus proche).
- Vue à plat : trait vertical pointillé à la colonne du raccord, libellé « raccord ».

**Critères**
- [ ] Test unitaire : largeur 25 mailles, raccord « dos » → la colonne coupée est juste avant la colonne 42 (milieu du dos), pas en colonne 0.
- [ ] Captures dos / profil intérieur avec raccord « dos » puis « intérieur », décrites dans `PROGRESS.md`.

### [ ] T38 — Décor : sol et mur en carreaux de ciment
- Intégrer `reference/decor/tileSurface.ts` (`src/render/decor/`). Section « Décor » : Aucun (défaut) / Sol / Mur / Sol + mur ; format du carreau (défaut : `format` de la collection, 20 × 20 → 20 cm ; 10 × 10 → 10 cm ; curseur 10–30 cm) ; joint (mm) et couleur du joint ; patine ; atténuation ; carreaux du décor : **« comme la chaussette »** (mêmes carreaux et couleurs) / **« couleurs d'origine de la collection »** / **autre collection** (liste) ; calepinage du décor : celui par défaut de la collection choisie.
- Hors collection (carreaux importés) : le décor utilise les carreaux importés.
- Le mur est replacé face à la caméra à chaque rendu (`faceCamera`) et dans chaque capture (`capturePng(..., beforeRender)`). En mode sol ou sol + mur, masquer l'ombre du studio (le sol reçoit l'ombre).
- Exports PNG et lien de partage incluent le décor. Visionneuse : le décor s'affiche s'il est dans le lien.
- Génération de texture dans un `requestIdleCallback` ou un worker si elle dépasse 150 ms ; ne régénérer que si les carreaux, les couleurs ou les options du décor changent (pas quand on tourne la caméra).

**Critères**
- [ ] `decor.test.ts` fourni vert.
- [ ] e2e : décor « Sol + mur » → export trois-quarts 2048 contient les couleurs de la collection hors de la silhouette de la chaussette ; export « dos » : le mur est toujours derrière la chaussette (pixels du centre = chaussette).
- [ ] Captures sol / mur / sol + mur avec deux collections, ouvertes et décrites dans `PROGRESS.md`.

### [ ] T39 — Bilan V5
- README (visionneuse, `?dev`, lien de partage, raccord, décor) et « Point pour César » avec captures.
