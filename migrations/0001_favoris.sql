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
