CREATE TABLE collections (
  id TEXT PRIMARY KEY,              -- « p- » + nom en minuscules sans accents, + suffixe si pris
  nom TEXT NOT NULL,                -- ≤ 60 caractères
  description TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL,             -- '20x20' | '10x10' | '15x15'
  donnees TEXT NOT NULL,            -- JSON : zones, couleursParDefaut, recommandations, calepinages, calepinageParDefaut, variations[]
  vignette BLOB,                    -- WebP 480 × 600 : la chaussette de prévisualisation
  cree_le INTEGER NOT NULL,
  modifie_le INTEGER NOT NULL,
  supprime_le INTEGER
);
CREATE INDEX collections_modifie ON collections(modifie_le DESC);
