-- Village fuzzy search.
--
-- PIN narrows to a handful of candidates, trigram similarity ranks them by name, a human
-- confirms. Name-only matching is not an option: the seeded pilot data alone contains four
-- distinct villages called "Venkatapur" at four different PINs.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- GIN over trigrams on the village name. Without this, similarity() is a sequential scan
-- over every location in the country once this grows past the pilot districts.
CREATE INDEX IF NOT EXISTS "Location_name_trgm_idx"
  ON "Location" USING GIN (lower(name) gin_trgm_ops);

-- Aliases are matched alongside the canonical name — villages genuinely carry several
-- spellings and often an older name, and without this the same place gets created twice.
CREATE INDEX IF NOT EXISTS "Location_aliases_idx"
  ON "Location" USING GIN (aliases);
