CREATE TABLE IF NOT EXISTS "manual_version" (
  "id" text PRIMARY KEY,
  "developmentId" text NOT NULL,
  "organizationId" text NOT NULL,
  "manualType" text NOT NULL,
  "revision" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'rascunho',
  "comment" text,
  "filename" text NOT NULL,
  "pathname" text NOT NULL,
  "sections" integer NOT NULL DEFAULT 0,
  "pages" integer NOT NULL DEFAULT 0,
  "attachments" integer NOT NULL DEFAULT 0,
  "createdBy" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "manual_version_development_idx" ON "manual_version" ("developmentId", "manualType", "revision");

UPDATE "manual_version" SET "status" = 'substituido' WHERE false;

ALTER TABLE "development" ADD COLUMN IF NOT EXISTS "workflowStatus" text NOT NULL DEFAULT 'rascunho';
ALTER TABLE "development" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
COMMIT;
