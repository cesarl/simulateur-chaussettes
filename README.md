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

Premier lancement des tests navigateur : `npx playwright install chromium`.

## Modifier les tailles

Toutes les valeurs de tailles (aiguilles, rangs par zone, jauge) et les limites machine sont dans [`config/sizes.json`](config/sizes.json). Elles sont **provisoires** jusqu'à confirmation du fabricant.

## Utilisation

1. Lancer `npm run dev` et ouvrir l'adresse affichée (par défaut `http://localhost:5173`).
2. Dans **Carreaux**, cliquer « Exemple » ou déposer un PNG/SVG. Régler le calepinage, la taille (homme / femme), les couleurs et les zones : l'aperçu 3D se met à jour.
3. Basculer sur **À plat** pour contrôler la grille (zoom à la molette, déplacement en glissant). Dans **Exports**, cocher les vues, choisir 1024, 2048 ou 4096, puis **Exporter**. Chaque fichier se télécharge sous le nom `<modele>_<taille>_<vue>.png` (face, trois-quarts, profil extérieur, dos, profil intérieur, plat exact, plat lisible). Cases **BMP indexé** et **Planche** disponibles. Raccourcis 3D : R réinitialise la vue ; F/T/E/D/I changent l’angle.

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
