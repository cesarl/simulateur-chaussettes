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

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | version statique dans `dist/` |
| `npm run verify` | vérification complète : types + tests unitaires + build + tests navigateur |
| `npm run test:watch` | tests unitaires en continu |
| `npm run sync:carreaux` | copie collections / SVG / calepinages depuis le simulateur de carreaux (`public/carreaux/`) |

Premier lancement des tests navigateur : `npx playwright install chromium`.

## Modifier les tailles

Toutes les valeurs de tailles (aiguilles, rangs par zone, jauge) et les limites machine sont dans [`config/sizes.json`](config/sizes.json). Elles sont **provisoires** jusqu'à confirmation du fabricant.

## Utilisation

1. Lancer `npm run dev` et ouvrir l'adresse affichée (par défaut `http://localhost:5173`).
2. **Collection** (si `public/carreaux/` est synchronisé) : rechercher et choisir une collection — ses variations deviennent les motifs, le calepinage par défaut s’applique. Sinon, dans **Mes carreaux**, « Charger un exemple » ou déposer un PNG/SVG.
3. Dans **Calepinage**, choisir un préréglage dans la **galerie** (Rapides, familles, ou calepinages de la collection). Filtrer par nombre de motifs. Si le calepinage est aléatoire, **Nouveau tirage** change la graine. Le bloc **Personnaliser** affine ordre / rotation / appareillage.
4. **Couleurs** (mode collection) : bandes « Couleurs d’origine » / suggestions de l’artiste ; pastilles de zones → nuancier ; **Assortir bord-côte, talon et pointe**.
5. **Dimensions** : taille homme/femme, hauteur de tige, etc. **Zones** : couleurs + **talon d’aperçu** (hauteur / profondeur / largeur mm — n’affecte pas la grille de tricot).
6. Pastille **modifié** + **Réinitialiser** en tête de chaque section ; **Tout réinitialiser** en bas (garde les carreaux, confirmation « Confirmer ? » 4 s). **Annuler / Rétablir** en haut du panneau, ou Ctrl/Cmd+Z et Ctrl/Cmd+Maj+Z.
7. Basculer sur **À plat** pour contrôler la grille. Dans **Exports**, cocher les vues puis **Exporter**. Raccourcis 3D : R réinitialise la vue ; F/T/E/D/I changent l’angle.

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
