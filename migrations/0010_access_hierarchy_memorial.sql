ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "platformRole" text;

-- The existing primary account(s) become platform managers for the migration preview.
-- Their organization membership remains intact so no production data is orphaned.
UPDATE "user" u
SET "platformRole" = 'manager'
WHERE u."platformRole" IS NULL
  AND EXISTS (
    SELECT 1 FROM "member" m
    WHERE m."userId" = u.id AND m.role = 'owner'
  );

CREATE TABLE IF NOT EXISTS "platform_integration" (
  "id" text PRIMARY KEY,
  "provider" text NOT NULL,
  "encryptedKey" text NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "testedAt" timestamptz,
  "status" text NOT NULL DEFAULT 'saved',
  "updatedBy" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_integration_provider_unique"
  ON "platform_integration" ("provider");

CREATE TABLE IF NOT EXISTS "technical_content_template" (
  "id" text PRIMARY KEY,
  "checklistItemId" text NOT NULL,
  "scope" text NOT NULL,
  "title" text NOT NULL,
  "descriptionHtml" text NOT NULL,
  "maintenance" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "variablesSchema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "updatedBy" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "technical_template_item_scope_unique"
  ON "technical_content_template" ("checklistItemId","scope");

CREATE TABLE IF NOT EXISTS "memorial_import" (
  "id" text PRIMARY KEY,
  "developmentId" text NOT NULL,
  "organizationId" text NOT NULL,
  "filename" text NOT NULL,
  "pathname" text NOT NULL UNIQUE,
  "contentType" text,
  "sizeBytes" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'uploaded',
  "provider" text,
  "model" text,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "createdBy" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "memorial_evidence" (
  "id" text PRIMARY KEY,
  "importId" text NOT NULL,
  "developmentId" text NOT NULL,
  "checklistItemId" text NOT NULL,
  "scope" text NOT NULL,
  "confidence" integer NOT NULL DEFAULT 0,
  "page" integer,
  "excerpt" text,
  "variables" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
