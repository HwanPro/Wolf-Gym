-- Preserve stored data. Existing equivalent non-empty documents cause this
-- migration to fail; review those records explicitly instead of deleting them.
CREATE UNIQUE INDEX "ClientProfile_document_number_normalized_key"
ON "ClientProfile" ((regexp_replace("document_number", '[^0-9]', '', 'g')))
WHERE "document_number" IS NOT NULL
  AND regexp_replace("document_number", '[^0-9]', '', 'g') <> '';
