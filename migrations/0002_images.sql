CREATE TABLE images (
  id TEXT PRIMARY KEY,         -- 16 premiers caractères hexadécimaux du SHA-256 du fichier (doublons fusionnés)
  nom TEXT NOT NULL,
  mime TEXT NOT NULL,          -- image/png | image/svg+xml
  largeur INTEGER, hauteur INTEGER, octets INTEGER NOT NULL,
  cree_le INTEGER NOT NULL, supprime_le INTEGER
);
