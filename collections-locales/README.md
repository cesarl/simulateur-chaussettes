# Collections locales (César)

Même format que le simulateur de carreaux :
- `collections.json` — tableau de collections (`id`, `nom`, `format`, `variations`, `layouts`, `defaut_layout`, `category`, `colors`, `artist_recommendations`…)
- `svg/<ID>-VAR<n>.svg` **ou** `.png`

Synchronisation :
- `npm run sync:carreaux` fusionne aussi ce dossier s’il existe (les locales gagnent en cas d’id identique).
- `npm run sync:local` met à jour seulement la partie locale (conserve le reste du catalogue).

Puis committez `public/carreaux/`.
