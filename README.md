# Simulateur de chaussettes jacquard — César Bazaar

Outil web local qui transforme des carreaux de ciment (PNG/SVG) en motif jacquard de chaussette : grille de mailles (1 pixel = 1 maille), aperçu 3D tricoté et exports PNG pour le fabricant et l'IA d'image.

Les icônes de l'interface (V11) reprennent les tracés [Lucide](https://lucide.dev) (licence ISC), intégrés en SVG inline dans `src/ui/kit/` — aucune dépendance npm Lucide.

### Kit UI (V11)

Composants DOM maison dans [`src/ui/kit/`](src/ui/kit/) — pas de framework :

| Module | Usage |
|---|---|
| `kitButton({ variant, icon, label, tooltip, shortcut })` | `primary` / `ghost` / `icon` |
| `openMenu({ anchor, items })` / `moreButton` | un seul menu à la fois ; Échap / clic dehors |
| `attachTooltip(el, { label, shortcut })` | délai 400 ms |
| `showToast` / `openDialog` / `disclosure` | notifications, modales, infos repliables |

Page de démo (dev) : [`kit.html`](kit.html). Captures V11 : [`docs/captures/v11/`](docs/captures/v11/).

## Utilisation (V11 — finitions)

1. `npm run sync:local && npm run dev` → `http://localhost:5173/?dev`
2. Barre projet : nom✎, ↶↷, 2D/3D, Bibliothèque, Favoris, lien, **★ Favori**, menu **⋯** (ouvrir/exporter JSON, aide).
3. Dock : **+ Calque ▾** → Motif / Image / Dessin ; menu **⋯** sur chaque carte.
4. Galerie [`favoris.html`](favoris.html) : cartes **4:5**, menus fermés, toast Annuler après suppression.

- Ce que fait l'outil : [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md)
- Comment il est construit : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Tâches de développement : [`tasks/TASKS.md`](tasks/TASKS.md) — avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md)
- Installation et lancement de l'agent : [`docs/MISE_EN_PLACE.md`](docs/MISE_EN_PLACE.md)
- Questions pour le fabricant : [`docs/QUESTIONS_FABRICANT.md`](docs/QUESTIONS_FABRICANT.md)

## Lancer l'outil

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
npm run dev          # ouvre http://localhost:5173
```

Par défaut : **visionneuse 3D plein écran** (barre discrète : vues + copier le lien). Ajouter `?dev` une fois, ou taper **Maj+D**, pour ouvrir le panneau de réglages (mémorisé jusqu’à « Quitter le mode dev » ou un second **Maj+D**).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | version statique dans `dist/` |
| `npm run verify` | vérification complète : types + tests unitaires + build + tests navigateur |
| `npm run test:watch` | tests unitaires en continu |
| `npm run sync:carreaux` | copie collections / SVG / calepinages depuis le simulateur de carreaux (`public/carreaux/`) |
| `npm run sync:local` | met à jour seulement les collections locales (`collections-locales/`) dans le catalogue |
| `npm run dev:api` | build + Worker local (D1) sur le port 4173 : assets + `/api/*` |
| `npm run db:migrate:local` | applique les migrations D1 en local |
| `npm run db:migrate:remote` | applique les migrations D1 distantes (après création de la base) |

Premier lancement des tests navigateur : `npx playwright install chromium`.

### Favoris en ligne (Worker + D1)

Les chaussettes réussies peuvent être enregistrées en ligne (**★ Favori** en mode dev) et consultées dans la galerie [`favoris.html`](favoris.html).

**Fonctionnement**
- Un favori = un lien `#p=…` (sans `#` en base) + vignette WebP 480×600 + nom.
- Lecture publique (`GET /api/favoris`) ; écriture (créer, renommer, mettre à jour, supprimer, restaurer) protégée par le mot de passe commun, vérifié **par le Worker** (en-tête `X-Mot-De-Passe`), jamais seulement en JavaScript dans la page.
- Galerie : grille de cartes, filtre texte, ouverture en visionneuse ou en édition selon le mode dev mémorisé (`simulateur-chaussettes:dev`) — les liens de la galerie n’incluent jamais `?dev`.

**Mot de passe**
- Secret Wrangler `MOT_DE_PASSE`. En local : copier [`.dev.vars.example`](.dev.vars.example) vers `.dev.vars` (ex. `MOT_DE_PASSE=essai`).
- Mémorisé dans le navigateur (`simulateur-chaussettes:mdp`) ; « Oublier le mot de passe » dans l’onglet Global.

**Corbeille**
- Supprimer met une date dans `supprime_le` (pas d’effacement réel). Bouton Corbeille + Restaurer. Annuler pendant 5 s après une suppression.

**Restauration D1 (Time Travel)**
- Cloudflare D1 conserve ~30 jours d’historique. En cas de besoin, César peut restaurer un point dans le temps via le tableau de bord Cloudflare / `wrangler d1 time-travel` (documentation Cloudflare).

En local avec l’API : `.dev.vars` puis `npm run dev:api` (port 4173). Tests API : `npm run e2e:api`.

`wrangler.jsonc` contient un `database_id` d’attente (`00000000-0000-0000-0000-000000000000`). Pour la production, César remplace cet id après `npx wrangler d1 create simulateur-chaussettes`. Ne jamais committer de secret (`.dev.vars` est gitignoré).

`npm run dev` (Vite seul) reste utilisable : les appels `/api` échouent avec « Favoris indisponibles en mode vite : lancer npm run dev:api ».

### Bibliothèque partagée (Worker + R2)

Les images importées (PNG ou SVG) peuvent être envoyées en ligne et réutilisées par tout le monde.

- **★ Favori** sur un projet qui contient des images embarquées propose « Envoyer N image(s) dans la bibliothèque partagée et enregistrer ». Les calques passent de `embarquee` à `partagee` (une étape d’annulation), puis le favori est enregistré. Le lien `#p=2.` contient l’identifiant (`s:<id>`), pas les octets.
- **Bibliothèque › Images › Bibliothèque partagée** : vignettes, filtre, clic pour ajouter un calque Image, « Envoyer une image… », renommer et retirer (mot de passe). Hors ligne : « Bibliothèque partagée indisponible » ; le reste de la bibliothèque continue de marcher.
- **Limites** : 2 Mo maximum ; PNG (signature vérifiée) ou SVG (commence par `<svg` ou `<?xml`). JPEG et faux PNG sont refusés. Un même fichier (empreinte SHA-256) n’est stocké qu’une fois.
- Les **carreaux PNG importés d’un Motif** ne passent pas dans le favori en V10 : message clair, il faut une collection ou le fichier `.json`.

### Créer un motif (collections partagées — V12)

Page dédiée [`motif.html`](motif.html) pour fabriquer ses propres collections en ligne (mêmes usages que le catalogue : calques Motif, liens `#p=2.`, favoris, décor).

**Accès**
- Bibliothèque › Collections › carte **+ Nouveau motif** ;
- barre projet › menu **⋯** › Créer un motif ;
- URL directe `motif.html` (édition `?id=p-…`, duplication `?dup=p-…`).

**Étapes**
1. Identité (nom → id `p-…`, format 20×20 / 15×15 / 10×10, description).
2. Variations : déposer N fichiers SVG ou PNG (VAR1, VAR2…) ; zones détectées comme dans l’admin.
3. Couleurs par zone (nuancier Validé) + jusqu’à 3 palettes conseillées.
4. Calepinage par défaut (+ calepinages proposés).
5. Enregistrer en ligne (mot de passe commun, même Worker que les favoris).

**Limites** : 1 à 16 variations ; 1 Mo max par fichier (SVG ou PNG) ; au plus 8 zones de couleur ; JSON des données ≤ 64 Ko. Les SVG sont nettoyés (pas de script / `on*` / liens externes).

**Après enregistrement** : le motif apparaît dans Bibliothèque › Collections partagées (vignette WebP 480×600, infos, menu Modifier / Dupliquer / Supprimer). Corbeille des motifs dans la même section. Un favori qui cite `p-…` charge la version live des couleurs par défaut.

#### Mise en ligne (César) — migration collections
Le bucket R2 existe déjà (V10). Il reste à appliquer la table D1 :

```bash
npm run db:migrate:remote
```

(migration `migrations/0003_collections.sql`). Puis redéployer le Worker comme d’habitude.

#### Commandes de mise en ligne (César)

À lancer **une seule fois** sur le compte Cloudflare (placeholders — aucun secret dans le dépôt) :

```bash
npx wrangler d1 create simulateur-chaussettes
# → copier database_id dans wrangler.jsonc

npx wrangler r2 bucket create simulateur-chaussettes-images

npm run db:migrate:remote
npx wrangler secret put MOT_DE_PASSE
# → saisir le mot de passe commun quand demandé

npm run build && npx wrangler deploy
```

## Modifier les tailles

Toutes les valeurs de tailles (aiguilles, rangs par zone, jauge) et les limites machine sont dans [`config/sizes.json`](config/sizes.json). Elles sont **provisoires** jusqu'à confirmation du fabricant.

## Utilisation (V9 — vue 2D lisible + calque Dessin)

1. Lancer `npm run dev` et ouvrir l'adresse affichée (par défaut `http://localhost:5173`).
2. **Visionneuse** : uniquement la 3D. Pour les réglages : `/?dev` ou **Maj+D**.
3. **Vue 2D** : couleurs exactes de la grille (plus d’assombrissement des flottés). Bouton **Alertes** (défaut off, mémorisé) : contours rouges sur les flottés trop longs + ronds sur les mailles isolées + légende. Les pastilles Contrôles « Flottés » / « Détails » activent aussi Alertes.
4. **Calque Dessin** : bouton **+ Dessin** dans le dock. Menu **⋯ → Transformer en dessin** sur un Motif ou une Image (copie peinte, original masqué).
5. **Outils** (barre sous la vue 2D quand un Dessin est sélectionné) : Crayon (B), Gomme (E), Trait (L, Maj = droit), Rectangle (R), Pot (G), Pipette (I / Alt+clic), Main (Espace). Épaisseur 1–4, symétrie Devant↔Dos / Intérieur↔Extérieur, aimantation sur les repères.
6. **Couleur du crayon** : pastille → déjà sur la chaussette / nuancier (recherche) / 8 dernières.
7. **Recette — ligne au tendon d’Achille** (5 clics) :
   1. `/?dev` → **+ Dessin**
   2. outil **Trait**, épaisseur **2**, aimantation cochée
   3. pastille couleur (ex. noir)
   4. glisser du haut de la tige au repère **Dos** jusqu’au bas de la tige (Maj pour un trait droit)
   5. lâcher : une seule étape d’annulation ; **Copier le lien** pour partager

Captures : [`docs/captures/v9/`](docs/captures/v9/).

## Utilisation (V8 — calques + retours)

1. Lancer `npm run dev` et ouvrir l'adresse affichée (par défaut `http://localhost:5173`).
2. **Visionneuse** : uniquement la 3D. Pour les réglages : `/?dev` ou **Maj+D** (puis l’URL perd `?dev` ; le mode reste actif). **Maj+D** ou le bouton **Quitter le mode dev** (onglet **Global**) reviennent à la visionneuse. Dans un champ de saisie, Maj+D ne change pas de mode.
3. **Mode technique (`?dev`)** : grille CSS — vue à plat | vue 3D | options (onglets Calque / Chaussette / Décor / Export / **Global**) | **dock des calques** en bas.
4. **Vues 2D / 3D** : boutons bascule dans la barre projet (choix mémorisé). Masquer une vue libère sa place ; les deux masquées → options + dock seulement.
5. **Repères** (vue 2D) : traits pointillés Intérieur / Dos / Extérieur / Devant ; aimantation au glisser d’image (± 2 mailles). Bouton « Repères » mémorisé.
6. **Calques** : Fond (toujours en bas) + Motifs + Images. Masquer, verrouiller, réordonner, renommer. Jusqu’à 16 calques. Le **Fond** colore aussi le pied uni (plus de « Couleur du pied »).
7. **Bibliothèque** (barre projet ou « + Motif » / « + Image ») :
   - Collections du catalogue ;
   - section **Bibliothèque** (images publiques sous `bibliotheque-images/`, ex. Logo) — passent dans le lien de partage ;
   - section **Bibliothèque partagée** (images en ligne, PNG/SVG ≤ 2 Mo) — passent aussi dans le lien ;
   - Images du projet (PNG/SVG embarqués dans le `.json`).
8. **Couleurs d’un calque** : lignes avec pastille, nom/code, **œil** (transparence). Sur une Image, **Remplacer…** choisit un fil déjà sur la chaussette ou du nuancier.
9. **Poignées** sur la vue 2D : déplacer / tourner / redimensionner une Image (cadre correct sous le talon) ; décaler / bande un Motif.
10. **Copier le lien** : `#p=2.…`. Images bibliothèque OK ; images importées → fichier projet `.json`.
11. **Projet** : format version 3. Lecture v1/v2/v3.
12. **Exports** : cocher les vues puis exporter. Raccourcis 3D : R / F / T / E / D / I. **Maj+D** bascule le mode développeur (D seul = vue de dos).

Les modes séparés « Carreaux » / « Composition » de V6 sont remplacés par la pile de calques (empreintes golden T41 et liens réels inchangés).

### Ajouter une image à la bibliothèque publique

1. Déposer le fichier (SVG de préférence, sinon PNG) dans [`bibliotheque-images/`](bibliotheque-images/).
2. Ajouter une ligne dans `bibliotheque-images/images.json` (`id`, `nom`, `fichier`, `categorie`).
3. Lancer `npm run sync:local` (copie vers `public/images/` + `index.json`), puis committer.

## Partage et limites

- Lien `#p=2.` : état sans images embarquées (les images **bibliothèque** et **partagées** y passent). Trop long → message ; préférer le `.json`.
- Palette unique (`resolveStackPalette`) : le bandeau n’apparaît que si les couleurs **visibles** dépassent la limite machine.
- Pas de motif sur bord-côte, talon, pointe. Œil barré sur une couleur de calque pour laisser voir le dessous.

## Collections locales

En plus du simulateur de carreaux, un dossier [`collections-locales/`](collections-locales/) permet d’ajouter des collections (SVG ou PNG) sans passer par le configurateur :

```bash
npm run sync:local    # fusionne collections-locales/ dans public/carreaux/ (la locale gagne en cas d’id identique)
```

Format : `collections-locales/collections.json` + `collections-locales/svg/<ID>-VAR<n>.svg|.png` (mêmes champs que le simulateur de carreaux). Dans l’UI, catégorie **Mes collections**.

**Admin (mode dev)** : page [`admin.html`](admin.html) (lien « Gérer mes collections » dans l’onglet **Global**). La page défile (le simulateur, lui, reste sans ascenseur de page). Ouvre le dossier via File System Access (Chrome/Edge) ou exporte un ZIP à décompresser. Chaque motif est prévisualisé, avec son remplacement de fil (nom + pastille). Un gris neutre reste un gris. Puis `npm run sync:local` + commit.

## Calques (remplace le mode composition V6)

Une chaussette = **pile de calques** (Fond → Motifs → Images) :

| Calque | Rôle |
|---|---|
| **Fond** | Une couleur, toujours en bas, non masquable |
| **Motif** | Carreaux (collection ou importés) : calepinage, taille, raccord, bande de rangs, œil par couleur |
| **Image** | PNG/SVG libre ou bibliothèque publique : poignées souris, frise, miroir, œil, Remplacer… |

Le mode **Composition** V6 n’existe plus : les images sont des calques Image. Les empreintes golden (T41) et les deux liens réels de César restent identiques.

## Collections du simulateur de carreaux

Le simulateur de carreaux reste la source des collections, SVG, calepinages et nuancier. Une **copie** vit dans `public/carreaux/` :

```bash
npm run sync:carreaux
# optionnel : --dry-run ou --source "/chemin/vers/configurateur-carreaux-cesar-bazaar"
```

Détails : [`docs/DONNEES_CARREAUX.md`](docs/DONNEES_CARREAUX.md). Après sync : vérifier `public/carreaux/SYNC_REPORT.md`, committer le dossier.

Dans l’UI : section **Collection** (recherche, catégories Signature / Classiques / Nouveautés) ; choisir une collection charge ses VAR1…N et son calepinage. **Couleurs** propose les palettes d’origine et les suggestions de l’artiste ; le nuancier change une zone (et recolore les SVG). Un projet enregistré conserve l’id de collection, les codes de zones et le commit de sync ; à la réouverture, les SVG sont rechargés depuis le catalogue courant (si la collection a disparu, les carreaux du fichier projet sont utilisés avec un message).

## Publication

Après `npm run build`, le dossier `dist/` contient les pages statiques. Le déploiement Cloudflare Workers (Assets + Worker `/api/*` + D1) se fait avec `npx wrangler deploy` **après** création de la base et du secret (voir « Commandes de mise en ligne » ci-dessus).

Sans Worker (Pages statique seul), l’outil fonctionne hors ligne pour l’édition et les liens `#p=` ; les favoris en ligne ne seront pas disponibles.

### GitHub Pages
1. Dans les réglages du dépôt → Pages → source « GitHub Actions » (ou branche `gh-pages`).
2. Servir le contenu de `dist/` à la racine du site (ou sous un sous-chemin en adaptant `base` dans `vite.config` si besoin).
3. Pas d’API favoris sur GitHub Pages (Worker Cloudflare requis).

La CI (`.github/workflows/ci.yml`) exécute déjà `npm ci`, installe Chromium Playwright avec dépendances système, puis `npm run verify` à chaque push et pull request.
