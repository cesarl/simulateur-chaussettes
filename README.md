# Simulateur de chaussettes jacquard — César Bazaar

Outil web local qui transforme des carreaux de ciment (PNG/SVG) en motif jacquard de chaussette : grille de mailles (1 pixel = 1 maille), aperçu 3D tricoté et exports PNG pour le fabricant et l'IA d'image.

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

Par défaut : **visionneuse 3D plein écran** (barre discrète : vues + copier le lien). Ajouter `?dev` une fois pour ouvrir le panneau de réglages (mémorisé jusqu’à « Quitter le mode dev »).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | version statique dans `dist/` |
| `npm run verify` | vérification complète : types + tests unitaires + build + tests navigateur |
| `npm run test:watch` | tests unitaires en continu |
| `npm run sync:carreaux` | copie collections / SVG / calepinages depuis le simulateur de carreaux (`public/carreaux/`) |
| `npm run sync:local` | met à jour seulement les collections locales (`collections-locales/`) dans le catalogue |

Premier lancement des tests navigateur : `npx playwright install chromium`.

## Modifier les tailles

Toutes les valeurs de tailles (aiguilles, rangs par zone, jauge) et les limites machine sont dans [`config/sizes.json`](config/sizes.json). Elles sont **provisoires** jusqu'à confirmation du fabricant.

## Utilisation (V7 — calques)

1. Lancer `npm run dev` et ouvrir l'adresse affichée (par défaut `http://localhost:5173`).
2. **Visionneuse** : uniquement la 3D. Pour les réglages : `/?dev` (puis l’URL perd `?dev` ; le mode reste actif). Bouton **Quitter le mode dev** en bas du panneau.
3. **Mode technique (`?dev`)** : grille CSS — vue à plat | vue 3D | options (onglets Calque / Chaussette / Décor / Export) | **dock des calques** en bas.
4. **Calques** : Fond (toujours en bas) + Motifs (carreaux de ciment) + Images (PNG/SVG libres). Masquer, verrouiller, réordonner, renommer. Jusqu’à 16 calques.
5. **Bibliothèque** (barre projet ou « + Motif » / « + Image ») : collections du catalogue et images du projet ; import PNG/SVG embarqué dans le `.json`.
6. **Poignées** sur la vue 2D : déplacer / tourner / redimensionner une Image ; décaler / bande un Motif.
7. **Copier le lien** : écrit `#p=2.…` (diff compact). Les anciens liens `#p=1.…` restent lisibles. Images importées → envoyer le fichier projet `.json`.
8. **Projet** : format version 3 (`design` en calques + tiles/assets utilisés). Lecture v1/v2/v3.
9. **Exports** : cocher les vues puis exporter. Raccourcis 3D : R / F / T / E / D / I.

Les modes séparés « Carreaux » / « Composition » de V6 sont remplacés par la pile de calques (empreintes golden T41 et liens réels inchangés).

## Partage et limites

- Lien `#p=2.` : état sans images embarquées. Trop long → message ; préférer le `.json`.
- Palette « automatique d’après les calques » : si le total dépasse la limite machine, bandeau + « Réduire à N couleurs ».
- Pas de motif sur bord-côte, talon, pointe. Couleurs transparentes par calque pour laisser voir le dessous.


## Collections locales

En plus du simulateur de carreaux, un dossier [`collections-locales/`](collections-locales/) permet d’ajouter des collections (SVG ou PNG) sans passer par le configurateur :

```bash
npm run sync:local    # fusionne collections-locales/ dans public/carreaux/ (la locale gagne en cas d’id identique)
```

Format : `collections-locales/collections.json` + `collections-locales/svg/<ID>-VAR<n>.svg|.png` (mêmes champs que le simulateur de carreaux). Dans l’UI, catégorie **Mes collections**.

**Admin (mode dev)** : page [`admin.html`](admin.html) (lien « Gérer mes collections » en bas du panneau). Ouvre le dossier via File System Access (Chrome/Edge) ou exporte un ZIP à décompresser. Zones SVG automatiques (moulinette), palettes conseillées, puis `npm run sync:local` + commit.

## Calques (remplace le mode composition V6)

Une chaussette = **pile de calques** (Fond → Motifs → Images) :

| Calque | Rôle |
|---|---|
| **Fond** | Une couleur, toujours en bas, non masquable |
| **Motif** | Carreaux (collection ou importés) : calepinage, taille, raccord, bande de rangs, couleurs transparentes |
| **Image** | PNG/SVG libre : poignées souris, frise, miroir, transparence |

Le mode **Composition** V6 n’existe plus : les images sont des calques Image. Les empreintes golden (T41) et les deux liens réels de César restent identiques.

## Collections du simulateur de carreaux

Le simulateur de carreaux reste la source des collections, SVG, calepinages et nuancier. Une **copie** vit dans `public/carreaux/` :

```bash
npm run sync:carreaux
# optionnel : --dry-run ou --source "/chemin/vers/configurateur-carreaux-cesar-bazaar"
```

Détails : [`docs/DONNEES_CARREAUX.md`](docs/DONNEES_CARREAUX.md). Après sync : vérifier `public/carreaux/SYNC_REPORT.md`, committer le dossier.

Dans l’UI : section **Collection** (recherche, catégories Signature / Classiques / Nouveautés) ; choisir une collection charge ses VAR1…N et son calepinage. **Couleurs** propose les palettes d’origine et les suggestions de l’artiste ; le nuancier change une zone (et recolore les SVG). Un projet enregistré conserve l’id de collection, les codes de zones et le commit de sync ; à la réouverture, les SVG sont rechargés depuis le catalogue courant (si la collection a disparu, les carreaux du fichier projet sont utilisés avec un message).

## Publication du dossier `dist/`

L’application est entièrement statique (pas de serveur ni d’API). Après `npm run build`, déployer le contenu de `dist/` :

### Cloudflare Pages
1. Créer un projet Pages lié au dépôt (ou importer `dist/` en direct upload).
2. Réglages de build : commande `npm run build`, dossier de sortie `dist`, Node 22.
3. L’outil fonctionne hors ligne une fois chargé ; aucun binding ni variable d’environnement n’est requis.

### GitHub Pages
1. Dans les réglages du dépôt → Pages → source « GitHub Actions » (ou branche `gh-pages`).
2. Servir le contenu de `dist/` à la racine du site (ou sous un sous-chemin en adaptant `base` dans `vite.config` si besoin).
3. Ne pas activer de backend : seuls des fichiers HTML/CSS/JS et les fixtures sont nécessaires.

La CI (`.github/workflows/ci.yml`) exécute déjà `npm ci`, installe Chromium Playwright avec dépendances système, puis `npm run verify` à chaque push et pull request.
