# Tâches V12 — Créer et modifier ses propres motifs (collections partagées en ligne)

## Demande de César

Une **vue dédiée** pour créer son propre motif :
- **N variations** (VAR1, VAR2… : un SVG ou un PNG chacune) ;
- couleurs par zone et palettes conseillées ;
- **calepinage par défaut** ;
- **prévisualisation** (2D, 3D, décor) ;
- **sauvegarde en ligne** protégée par le mot de passe commun.

On peut ensuite **le modifier**. Le motif apparaît dans la Bibliothèque et s'utilise comme n'importe quelle collection, y compris dans les liens partagés et les favoris.

## Ce qui existe déjà (à réutiliser, pas à réécrire)

- `admin.html` / `src/admin.ts` (V6, T44) : outil **local** pour les collections de César. Il découpe les SVG en zones (`svgZones.ts` : `autoZoneSvg`, `lockColorsAcrossVariations`, `setZoneColorId`, `recolorPreview`) et propose les couleurs du nuancier (avec le correctif OKLab de V8). Il reste pour les collections versionnées dans git.
- V10 :
  - Worker + D1 (`favoris`, `images`) + R2 ;
  - mot de passe commun (`worker/password.ts`) ;
  - corbeille (`supprime_le`).
- V11 : le kit d'interface (`src/ui/kit/` : boutons, menus, infobulles, fenêtres, toasts, disclosure).
- Le simulateur : `calepGallery.ts`, `samplePattern`, `sock3d`, le décor (`tileSurface`), `recolorSvg`, `yarnColors`, et le type `Collection` de `core/collections.ts`.

## Règles de cette série

Boucle habituelle (`.cursor/rules/10-workflow.mdc`), dans Cursor en local :

- branche `v12-motifs` depuis `main` ;
- aucune question à César ; décisions dans `docs/DECISIONS.md` ;
- un commit par tâche ;
- vérification allégée pendant les tâches, `npm run verify` complet à la fin ;
- e2e à la souris ; captures ouvertes et décrites dans `PROGRESS.md`.

**Intouchables** :
- `golden.test.ts` ;
- les empreintes des liens réels ;
- `v1ShareDefaults.json` ;
- `v8-layers.test.ts` ;
- `v9-dessin.test.ts` ;
- `export-format.test.ts`.

**Le format du lien `#p=2.` ne change pas** : un calque Motif d'une collection partagée est un calque `source.kind = 'collection'` comme les autres. Seul l'identifiant change : il commence par `p-`, ce qui évite tout conflit avec les collections du catalogue.

Interface faite **avec le kit de V11**, dans le même style ; pas de nouvelle dépendance lourde.

---

### [x] T100 — Stockage en ligne des collections

- `migrations/0003_collections.sql` :
  ```sql
  CREATE TABLE collections (
    id TEXT PRIMARY KEY,              -- « p- » + nom en minuscules sans accents, + suffixe si pris (ex. p-vagues, p-vagues-2)
    nom TEXT NOT NULL,                -- ≤ 60 caractères
    description TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL,             -- '20x20' | '10x10' | '15x15'
    donnees TEXT NOT NULL,            -- JSON : zones, couleursParDefaut, recommandations, calepinages, calepinageParDefaut, variations[]
    vignette BLOB,                    -- WebP 480 × 600 : la chaussette de prévisualisation
    cree_le INTEGER NOT NULL, modifie_le INTEGER NOT NULL, supprime_le INTEGER
  );
  ```
- **Fichiers des variations** dans R2, sous `collections/<id>/<VARn>-<empreinte>.svg|png`. L'empreinte change à chaque nouveau fichier, ce qui permet un cache « immutable ».
  - Les **SVG sont nettoyés** avant l'enregistrement, par une fonction pure testée et partagée entre la page et le Worker : pas de `<script>`, pas de `foreignObject`, pas d'attributs `on*`, pas de liens externes (`href` hors `#…`).
  - Les groupes `<g id="zone-N">` produits par `autoZoneSvg` sont conservés.
- **API** (même style que `favoris.ts`) :

  | Méthode | Route | Accès |
  |---|---|---|
  | GET | `/api/collections` | public, avec `?corbeille=1` |
  | GET | `/api/collections/:id` | public |
  | GET | `/api/collections/:id/fichiers/:nom` | public (R2, bon `Content-Type`, `nosniff`, CSP `sandbox`, cache 1 an) |
  | GET | `/api/collections/:id/vignette?v=…` | public |
  | POST | `/api/collections` | mot de passe |
  | PATCH | `/api/collections/:id` | mot de passe |
  | DELETE | `/api/collections/:id` | mot de passe (corbeille) |
  | POST | `/api/collections/:id/restaurer` | mot de passe |

  - Création et modification se font en **multipart** : un champ JSON plus les fichiers.
  - En modification, les variations inchangées ne sont pas renvoyées.
  - La liste publique renvoie tout ce qu'il faut pour construire un objet `Collection`. Les URL des fichiers sont versionnées (`?v=modifie_le`).
- **Limites** :
  - de 1 à 16 variations ;
  - chaque fichier fait au plus 1 Mo, en SVG ou en PNG (signature vérifiée) ;
  - au plus 8 zones de couleur ;
  - le JSON des données fait au plus 64 Ko.

**Critères**
- [x] Tests Worker :
  - créer (3 SVG), lire, modifier (remplacer VAR2, changer les couleurs), supprimer, restaurer ;
  - 401 sans mot de passe, 413 et 415 pour un fichier refusé ;
  - un SVG avec `<script>` ou `onload` ressort nettoyé ;
  - deux collections du même nom reçoivent deux identifiants différents.

### [x] T101 — Les collections partagées dans le simulateur

- Au démarrage, `loadCatalogue` fusionne `/api/collections` au catalogue local : `source: 'partagee'`, catégorie « Collections partagées ».
  - Hors ligne, ou en mode `vite` sans API : le simulateur marche sans elles, avec un message discret dans la Bibliothèque.
- **Carreaux** : même chemin que les collections du catalogue (`tilesFromCollection` : recoloration SVG par zone ; PNG tel quel). Seule l'URL des fichiers change (`fichierUrl(collection, variation)`).
- **Liens et favoris** : un lien qui cite `p-…` charge le catalogue en ligne **avant** d'appliquer le lien.
  - Si la collection a été supprimée : message « Motif « p-… » introuvable (supprimé ?) », puis le calque reste avec le repli des carreaux manquants, sans planter.
  - Une collection **dans la corbeille** reste lisible par son identifiant, pour que les favoris qui l'utilisent ne cassent pas.
- **Décor** « comme la chaussette » et « autre collection » : fonctionnent aussi avec une collection partagée.

**Critères**
- [x] Test unitaire : fusion du catalogue (identifiants `p-`, catégorie, URL versionnées).
- [x] e2e : une collection partagée créée par l'API apparaît dans Bibliothèque › Collections › Collections partagées. Ajoutée en calque Motif, puis « Copier le lien » et ouverture dans un navigateur neuf : même empreinte de grille.

### [x] T102 — Vue « Créer un motif » (atelier)

Nouvelle page **`motif.html`** (entrée Vite). On y accède :

- par Bibliothèque › Collections › carte « **+ Nouveau motif** » ;
- par le menu « ⋯ » de la barre du projet ;
- par l'onglet Global.

**Mise en page** (1440 × 900) :

- **à gauche**, le formulaire en étapes repliables (kit `disclosure`) ;
- **à droite**, la prévisualisation, qui reste en place quand on fait défiler.

Étapes :

1. **Identité** :
   - nom, avec l'identifiant `p-…` affiché en gris ;
   - format : 20 × 20 (par défaut), 15 × 15, 10 × 10 ;
   - courte description.
2. **Variations** :
   - zone de dépôt multiple (SVG / PNG), chaque fichier devient VAR1, VAR2… ;
   - réordonner par glisser, remplacer, supprimer ;
   - chaque carte montre la vignette recolorée et le nombre de zones détectées ;
   - avertissement si un fichier n'est pas carré, ou si les variations n'ont pas les mêmes zones.
   - Découpage en zones avec `autoZoneSvg` et `lockColorsAcrossVariations`, **comme dans admin.ts**. Extraire le code commun dans un module partagé (`src/core/motifDraft.ts` et/ou `src/ui/motifZones.ts`) au lieu de le dupliquer ; `admin.ts` doit utiliser ce module ensuite.
3. **Couleurs** :
   - une ligne par zone (`colorRow` de V8), avec la couleur du nuancier (couleurs « Validé ») et une recherche ;
   - « Palettes conseillées » : jusqu'à 3 palettes supplémentaires (+ / ×), chacune avec un nom facultatif.
4. **Calepinage** :
   - la galerie de calepinages (`calepGallery`) **avec les vrais carreaux du motif** ;
   - choix du calepinage par défaut, plus une liste facultative de calepinages « proposés » (cases à cocher).
5. **Enregistrer** :
   - bouton principal « Enregistrer en ligne », qui demande le mot de passe (fenêtre commune, retenu comme en V10) ;
   - « Annuler les modifications ».
   - Brouillon conservé automatiquement dans `localStorage` (avec `try/catch`), et proposé au retour : « Reprendre le brouillon ? ».

**Prévisualisation** (colonne droite), mise à jour à chaque changement, au plus une fois par image :

- **2D** : un carré de 4 × 4 carreaux posés avec le calepinage choisi (comme un sol) ;
- **3D** : la chaussette avec ce motif, 6 carreaux sur le tour, couleurs par défaut ou palette choisie, à tourner à la souris ;
- **Décor** : bascule « sol + mur » dans la vue 3D (même décor que le simulateur) ;
- sélecteur de palette à prévisualiser : défaut, conseillée 1, 2, 3.

**Critères**
- [x] e2e `motif-creer.spec.ts`, à la souris :
  - déposer 3 SVG de test → 3 variations, zones détectées ;
  - changer une couleur de zone → la prévisualisation 2D change ;
  - choisir le calepinage « damier » par défaut ;
  - Enregistrer (mot de passe « essai ») ;
  - le motif est dans `/api/collections` et dans la Bibliothèque ;
  - l'ajouter en calque Motif : il arrive avec son calepinage et ses couleurs par défaut.
- [x] e2e : brouillon → recharger la page → « Reprendre le brouillon » retrouve les 3 variations.
- [x] Captures de chaque étape et de la prévisualisation (2D, 3D, décor), décrites.

### [ ] T103 — Modifier, dupliquer, supprimer

- **Bibliothèque** (et galerie des motifs, T104) : sur une collection partagée, le menu « ⋯ » propose Modifier, Dupliquer, Supprimer (corbeille).
- **Modifier** ouvre `motif.html?id=p-…` pré-rempli.
  - « Enregistrer » fait un PATCH ; seules les variations nouvelles ou remplacées sont envoyées.
  - L'identifiant ne change jamais, même si le nom change, pour que les liens et favoris existants restent valides.
- **Dupliquer** ouvre l'atelier avec une copie (« Nom (copie) », nouvel identifiant au premier enregistrement).
- **Après une modification** :
  - les chaussettes qui utilisent ce motif prennent la nouvelle version au prochain chargement (URL versionnées) ;
  - un simulateur déjà ouvert peut recharger le motif (bouton « Recharger le motif » dans le calque) ;
  - **prévenir dans l'atelier** : « Ce motif est utilisé dans N favoris ; ils afficheront la nouvelle version. » (compter les favoris dont le lien cite l'identifiant).
- **Supprimer** : corbeille (restaurable) ; les favoris qui l'utilisent restent lisibles (T101).

**Critères**
- [ ] e2e : modifier la couleur par défaut d'un motif utilisé dans un favori → ouvrir le favori → nouvelle couleur ; dupliquer → deux motifs distincts ; supprimer puis restaurer.

### [ ] T104 — Galerie « Motifs » et finitions

- Dans la Bibliothèque, section « **Collections partagées** » :
  - première carte « + Nouveau motif » ;
  - cartes avec vignette (chaussette de prévisualisation) et nom ;
  - flèche « infos » : format, variations en miniatures, couleurs par défaut, date de modification.
- **Vignette** du motif : capture 3D de la prévisualisation au moment de l'enregistrement, en 480 × 600 WebP, comme les favoris.
- **Corbeille des motifs**, accessible depuis la section.
- **`admin.html`** (outil local de César) : bouton « Publier en ligne », qui envoie une collection locale vers l'API. Bonus, si le temps le permet.

**Critères**
- [ ] Captures : section Collections partagées, fiche d'infos ouverte, corbeille.

### [ ] T105 — Bilan V12

- README : « Créer un motif » (étapes, limites : 16 variations, 1 Mo par fichier, SVG / PNG, 8 zones).
- **Commande de mise en ligne pour César** : `npm run db:migrate:remote`. Le stockage R2 existe déjà depuis V10.
- `npm run verify` complet vert. « Point pour César » avec captures.
