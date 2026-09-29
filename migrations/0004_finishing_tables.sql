CREATE TABLE IF NOT EXISTS "finishing_table" ("id" text PRIMARY KEY, "developmentId" text NOT NULL, "organizationId" text NOT NULL, "tower" text NOT NULL DEFAULT '', "typology" text NOT NULL, "unitModel" text NOT NULL, "area" text NOT NULL, "revision" integer NOT NULL DEFAULT 1, "status" text NOT NULL DEFAULT 'rascunho', "data" jsonb NOT NULL DEFAULT '{}'::jsonb, "lastEditorId" text NOT NULL, "updatedAt" timestamptz NOT NULL DEFAULT now(), "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "finishing_table_history" ("id" text PRIMARY KEY, "finishingTableId" text NOT NULL, "developmentId" text NOT NULL, "organizationId" text NOT NULL, "revision" integer NOT NULL, "status" text NOT NULL, "data" jsonb NOT NULL DEFAULT '{}'::jsonb, "changedBy" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now());
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "finishingTableId" text;
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "finishingRevision" integer;
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "finishingRows" integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "finishing_table_lookup_idx" ON "finishing_table" ("developmentId", "organizationId", "typology");
CREATE INDEX IF NOT EXISTS "finishing_table_history_lookup_idx" ON "finishing_table_history" ("finishingTableId", "revision");
