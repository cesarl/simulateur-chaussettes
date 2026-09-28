# Tâches V10 — Favoris en ligne (D1) et bibliothèque d'images partagée (R2)

## Demande de César

- Enregistrer en ligne les chaussettes réussies (« favoris ») et les montrer dans une **galerie** : une jolie grille avec, pour chacune, la vue de la paire sur son décor.
- Au clic, la chaussette s'ouvre en **édition** si on est en mode dev, sinon en **visionneuse**.
- On peut renommer et supprimer.
- Ses amis peuvent ajouter des favoris, avec un **mot de passe simple et commun**.
- Étape B, facultative : les images importées (PNG / SVG) sont envoyées en ligne et **complètent la bibliothèque** au fur et à mesure. Si l'étape B pose problème, on s'arrête après l'étape A : tout doit fonctionner sans elle.

## Règles de cette série

Boucle habituelle (`.cursor/rules/10-workflow.mdc`), mêmes règles que V7 à V9 :

- branche `v10-favoris` depuis `main` ; César travaille dans **Cursor en local** ;
- aucune question à César ; décisions dans `docs/DECISIONS.md` ;
- un commit par tâche ;
- vérification allégée pendant les tâches, `npm run verify` complet en fin d'étape ;
- au plus un petit fichier e2e par tâche, avec les actions testées faites **à la souris** ;
- une capture par tâche d'interface, ouverte et décrite dans `docs/PROGRESS.md`.

**Intouchables** :
- `golden.test.ts` ;
- les empreintes des liens réels (`layers.test.ts`) ;
- `v1ShareDefaults.json` ;
- `v8-layers.test.ts` ;
- `v9-dessin.test.ts` ;
- `export-format.test.ts`.

**Le format du lien `#p=2.` ne change pas** : un favori, c'est un lien enregistré.

Quelques points qui restent vrais tout au long de la série :

- La consigne « ne pas toucher `wrangler.jsonc` » est **levée pour cette série** : T80 le modifie. Aucun identifiant ni secret n'est écrit en dur dans le dépôt.
- **Sécurité « à deux balles » mais réelle** : le mot de passe est vérifié **par le Worker**, jamais seulement en JavaScript dans la page, où il serait lisible par tous. Lire est public ; écrire demande le mot de passe.
- **Rien ne s'efface vraiment** : une suppression met une date dans `supprime_le`, et une corbeille permet de restaurer. D1 garde aussi 30 jours d'historique restaurable (Time Travel).

---

## Étape A — Favoris

### [x] T80 — Worker, D1 et environnement local

- `wrangler.jsonc` :
  - `"main": "worker/index.ts"` ;
  - `assets` : garder `directory` et `not_found_handling`, ajouter `"binding": "ASSETS"` et `"run_worker_first": ["/api/*"]` ;
  - `d1_databases` : `binding: "DB"`, `database_name: "simulateur-chaussettes"`, `migrations_dir: "migrations"`. Mettre `database_id` avec une valeur d'attente, et documenter dans le README comment la remplacer.
  - Tout le reste est servi comme avant par les fichiers statiques : la visionneuse et les liens `#p=` ne passent pas par le Worker.
- `migrations/0001_favoris.sql` :
  ```sql
  CREATE TABLE favoris (
    id TEXT PRIMARY KEY,            -- 10 caractères aléatoires url-safe
    nom TEXT NOT NULL,              -- ≤ 80 caractères
    lien TEXT NOT NULL,             -- le hash « p=2.… » sans « # » (≤ 20 000 caractères)
    vignette BLOB,                  -- WebP 480 × 600 (≤ 200 Ko)
    cree_le INTEGER NOT NULL,       -- ms depuis 1970
    modifie_le INTEGER NOT NULL,
    supprime_le INTEGER             -- NULL = visible ; sinon dans la corbeille
  );
  CREATE INDEX favoris_modifie ON favoris(modifie_le DESC);
  ```
- **Mot de passe** : secret `MOT_DE_PASSE`, lu dans `env`.
  - En local, `.dev.vars` (dans `.gitignore`) avec `MOT_DE_PASSE=essai`, plus un `.dev.vars.example` versionné.
  - Comparaison à temps constant.
  - En-tête `X-Mot-De-Passe`.
- Scripts npm :
  - `dev:api` : `vite build` puis `wrangler dev`, qui sert `dist` et l'API avec D1 local ;
  - `db:migrate:local` et `db:migrate:remote` (`wrangler d1 migrations apply …`).
  - `npm run dev` (vite seul) reste utilisable. Les appels `/api` y échouent proprement, avec le message « Favoris indisponibles en mode vite : lancer npm run dev:api ».
- Tests e2e : le `webServer` de Playwright passe sur `wrangler dev --port 4173` (build puis migrations locales), avec `.dev.vars` de test. Si c'est trop lent ou fragile, créer un second fichier de configuration Playwright pour les seuls tests `/api`, et le noter dans `DECISIONS.md`.

**Critères**
- [x] `npm run dev:api` → `/` répond comme avant ; `/api/sante` renvoie `{ ok: true, db: true }`.
- [x] Les tests existants restent verts.

### [x] T81 — API des favoris

`worker/api/favoris.ts` : une logique pure qui prend `env` en paramètre, pour être testable.

| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/favoris` | public : liste sans les vignettes, triée par `modifie_le` décroissant ; `?corbeille=1` pour les supprimés |
| GET | `/api/favoris/:id` | public |
| GET | `/api/favoris/:id/vignette?v=<modifie_le>` | public ; `image/webp`, cache 1 an `immutable` |
| POST | `/api/favoris` | mot de passe ; `{ nom, lien, vignette }` (vignette en base64) → `{ id }` |
| PATCH | `/api/favoris/:id` | mot de passe ; `{ nom?, lien?, vignette? }` |
| DELETE | `/api/favoris/:id` | mot de passe ; met la date dans `supprime_le` |
| POST | `/api/favoris/:id/restaurer` | mot de passe |

Validation des entrées :

- `lien` doit commencer par `p=1.` ou `p=2.`, et `decodeShare` doit le lire sans erreur (réutiliser `src/io/shareLink.ts` côté Worker) ;
- tailles maximales ci-dessus ; erreurs en JSON `{ erreur: "…" }` en français, codes 400, 401, 404 ou 413 ;
- une écriture sans mot de passe, ou avec un faux, renvoie 401 et ne change rien.

Tests : `@cloudflare/vitest-pool-workers` avec un D1 local, dans une configuration vitest séparée, lancée par `npm test`.

**Critères**
- [x] Tests :
  - créer, lister, renommer, supprimer, voir la corbeille, restaurer ;
  - 401 sans mot de passe ;
  - un lien abîmé est refusé ;
  - une vignette trop grosse est refusée.

### [x] T82 — « ★ Favori » dans l'éditeur

- Barre du projet (mode dev) : bouton **« ★ Favori »**.
  - Premier enregistrement : petite fenêtre avec le nom (pré-rempli avec le nom du modèle) → vignette → POST.
  - Chaussette ouverte depuis un favori : la fenêtre propose **« Mettre à jour « Nom » »** (PATCH du lien et de la vignette) ou **« Enregistrer comme nouveau »**.
  - L'identifiant du favori ouvert vit dans l'URL (`?favori=<id>` à côté de `#p=…`) et dans l'état, jamais dans le lien partagé.
- **Vignette** :
  - `capturePair` sur le décor courant, avec le fond par défaut s'il n'y a pas de décor ;
  - réduite à 480 × 600 et encodée en WebP qualité 0,8 (`canvas.toBlob`) ;
  - si le résultat dépasse 200 Ko, repasser en qualité 0,6.
- **Mot de passe** :
  - demandé dans une petite fenêtre de l'application, pas avec `window.prompt`, au premier enregistrement ;
  - retenu en `localStorage` (clé `simulateur-chaussettes:mdp`, avec `try/catch`) ;
  - en cas de 401, redemandé avec « Mot de passe incorrect » ;
  - lien « Oublier le mot de passe » dans l'onglet Global.
- **Projet avec images importées** (images embarquées, carreaux PNG importés) : le lien n'a pas tout. Avant l'étape B, on refuse avec ce message : « Ce projet contient des images importées : elles ne peuvent pas encore être enregistrées en ligne. Utilisez des images de la bibliothèque, ou envoyez le fichier .json. »
- Confirmation discrète « Enregistré dans les favoris », avec un lien vers la galerie.

**Critères**
- [x] e2e `favori-enregistrer.spec.ts`, à la souris :
  - ouvrir le lien Jardin d'Azur en dev → ★ Favori → mot de passe « essai » → nom → le favori existe (`GET /api/favoris`) avec une vignette WebP 480 × 600 ;
  - modifier la chaussette → ★ → « Mettre à jour » → le lien enregistré a changé ;
  - un mauvais mot de passe affiche l'erreur et n'enregistre rien.

### [ ] T83 — Page « Favoris » (galerie)

- Nouvelle page `favoris.html` : entrée Vite `favoris`, servie en `/favoris.html`.
- Lien « Favoris » dans la barre du projet (mode dev) et discret dans la visionneuse.
- **Présentation** :
  - grille de cartes 4:5 (vignette, nom, date « modifié le … »), 2 à 5 colonnes selon la largeur, lisible sur téléphone ;
  - titre « Chaussettes solidaires — favoris », filtre texte ;
  - vignettes en `loading="lazy"`.
- **Clic sur une carte** : `./?favori=<id>#<lien>` ouvre en **édition** si le mode dev est mémorisé dans ce navigateur (`resolveDevMode`), sinon la même adresse ouvre la **visionneuse**. Ne jamais mettre `?dev` dans ces liens.
- **Au survol** (ou menu « ⋯ » sur téléphone) :
  - « Renommer » (sur place) ;
  - « Supprimer » (va dans la corbeille, avec « Annuler » pendant 5 s) ;
  - « Copier le lien ».
  - Renommer et supprimer demandent le mot de passe, avec la même fenêtre et la même mémorisation que T82.
- Bouton **« Corbeille »** : la liste des favoris supprimés, avec « Restaurer ».
- **États** :
  - chargement : cartes grises ;
  - vide : « Aucun favori pour l'instant — ouvrez le simulateur et cliquez sur ★ Favori » ;
  - API indisponible : message clair.

**Critères**
- [ ] e2e `favoris-galerie.spec.ts`, à la souris : 3 favoris créés par l'API → 3 cartes ; filtrer ; renommer ; supprimer puis Annuler ; supprimer, corbeille, restaurer ; cliquer une carte → la chaussette s'ouvre avec la même empreinte de grille (visionneuse, et éditeur si dev).
- [ ] Captures de la galerie sur ordinateur et sur téléphone (390 px), décrites.

### [ ] T84 — Bilan de l'étape A et mise en ligne

- README, section « Favoris en ligne » :
  - fonctionnement ;
  - mot de passe ;
  - corbeille ;
  - restauration D1 (Time Travel, 30 jours).
- **Commandes pour César**, une seule fois :
  1. `npx wrangler d1 create simulateur-chaussettes` → copier `database_id` dans `wrangler.jsonc` ;
  2. `npm run db:migrate:remote` ;
  3. `npx wrangler secret put MOT_DE_PASSE` ;
  4. `npm run build && npx wrangler deploy`.
- `npm run verify` complet vert. « Point pour César ».

---

## Étape B — Bibliothèque d'images partagée (facultative)

### [ ] T85 — Images en ligne (R2 + D1)

- `wrangler.jsonc` : `r2_buckets` avec `binding: "IMAGES"`, `bucket_name: "simulateur-chaussettes-images"`.
- `migrations/0002_images.sql` :
  ```sql
  CREATE TABLE images (
    id TEXT PRIMARY KEY,         -- 16 premiers caractères hexadécimaux du SHA-256 du fichier (doublons fusionnés)
    nom TEXT NOT NULL,
    mime TEXT NOT NULL,          -- image/png | image/svg+xml
    largeur INTEGER, hauteur INTEGER, octets INTEGER NOT NULL,
    cree_le INTEGER NOT NULL, supprime_le INTEGER
  );
  ```
- **API** :

  | Méthode | Route | Accès |
  |---|---|---|
  | GET | `/api/images` | public |
  | GET | `/api/images/:id` | public |
  | POST | `/api/images` | mot de passe |
  | PATCH | `/api/images/:id` | mot de passe (nom) |
  | DELETE | `/api/images/:id` | mot de passe (corbeille) |

  - `GET /api/images/:id` renvoie le fichier depuis R2, avec le bon `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` et un cache 1 an `immutable`.
  - `POST /api/images` reçoit le fichier brut, avec les en-têtes `X-Nom` et `Content-Type`. Refusé au-delà de 2 Mo, et s'il ne s'agit ni d'un PNG (vérifier la signature) ni d'un SVG (commence par `<svg` ou `<?xml`).
  - Si l'image existe déjà (même empreinte), on renvoie la même, sans doublon.
- **Nouveau type d'image** pour les calques : `AssetRef … | { kind: 'partagee'; imageId }` ; `assetKey` → `s:<id>` ; chargement depuis `/api/images/:id`. Ces images passent dans le lien de partage (gabarit et `cleanAsset` dans `layers.ts` : ajout d'un cas, sans changer les autres).

**Critères**
- [ ] Tests Worker :
  - envoi PNG et SVG ;
  - doublon fusionné ;
  - 413 au-delà de 2 Mo ;
  - 415 pour un JPEG ou un faux PNG ;
  - 401 sans mot de passe ;
  - en-têtes de sécurité présents.

### [ ] T86 — Brancher : favoris avec images, et bibliothèque qui s'enrichit

- **« ★ Favori » sur un projet avec des images importées** : la fenêtre propose « Envoyer N image(s) dans la bibliothèque partagée et enregistrer ».
  - Chaque image embarquée est envoyée (POST) ; ses calques passent de `embarquee` à `partagee` (une seule étape d'historique), puis le favori est enregistré.
  - Les carreaux PNG importés d'un Motif restent refusés en V10, avec un message clair.
- **Bibliothèque › Images** : nouvelle section **« Bibliothèque partagée »** (vignettes, nom, filtre) sous la bibliothèque intégrée.
  - Un clic ajoute un calque Image.
  - Un bouton « Envoyer une image… » (mot de passe) l'ajoute à la section et au calque.
  - « Renommer » et « Retirer » au survol.
- Hors ligne ou API indisponible : la section affiche « Bibliothèque partagée indisponible » ; le reste marche.

**Critères**
- [ ] e2e `images-partagees.spec.ts`, à la souris :
  - importer un PNG → ★ Favori → « Envoyer et enregistrer » → le favori s'ouvre dans un navigateur neuf (sans localStorage) avec l'image visible ;
  - l'image apparaît dans « Bibliothèque partagée ».

### [ ] T87 — Bilan V10

- README : bibliothèque partagée, limites (2 Mo, PNG / SVG), et la commande `npx wrangler r2 bucket create simulateur-chaussettes-images` pour César.
- Captures dans `docs/captures/v10/`.
- `npm run verify` complet vert. « Point pour César ».
