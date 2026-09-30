CREATE TABLE IF NOT EXISTS "development_content_validation" (
  "id" text PRIMARY KEY,
  "developmentId" text NOT NULL,
  "organizationId" text NOT NULL,
  "contextKey" text NOT NULL,
  "section" text NOT NULL,
  "status" text NOT NULL DEFAULT 'rascunho',
  "lastEditorId" text,
  "validatorId" text,
  "comment" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "development_content_validation_unique"
  ON "development_content_validation" ("developmentId","contextKey","section");
