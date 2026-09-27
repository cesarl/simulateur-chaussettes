# Bibliothèque d'images

Images proposées dans la Bibliothèque du simulateur (onglet Images), pour les calques Image.

Pour ajouter une image :

1. Déposer le fichier (SVG de préférence, sinon PNG) dans ce dossier.
2. Ajouter une ligne dans `images.json` : `id` (sans espaces ni accents), `nom` (affiché), `fichier`, `categorie`.
3. Lancer `npm run sync:local`, puis committer.

Ces images sont publiques (elles sont en ligne avec le simulateur) et passent dans les liens de partage.
