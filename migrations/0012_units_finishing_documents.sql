CREATE TABLE IF NOT EXISTS "development_unit" (
  "id" text PRIMARY KEY, "developmentId" text NOT NULL, "organizationId" text NOT NULL,
  "tower" text NOT NULL DEFAULT '', "floor" text NOT NULL DEFAULT '', "number" text NOT NULL,
  "typology" text NOT NULL, "area" text NOT NULL DEFAULT '', "revision" integer NOT NULL DEFAULT 1,
  "lastEditorId" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "development_unit_number_unique" ON "development_unit" ("organizationId", "developmentId", lower(normalize(regexp_replace(btrim("tower"), '\s+', ' ', 'g'), NFC)), lower(normalize(regexp_replace(btrim("number"), '\s+', ' ', 'g'), NFC)));
ALTER TABLE "finishing_table" ADD COLUMN IF NOT EXISTS "unitId" text;
ALTER TABLE "finishing_table" ADD COLUMN IF NOT EXISTS "comment" text;
CREATE UNIQUE INDEX IF NOT EXISTS "finishing_table_unit_unique" ON "finishing_table" ("organizationId", "developmentId", "unitId") WHERE "unitId" IS NOT NULL;
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "unitId" text;
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "sourceFingerprint" text;
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "sourceSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS "manual_version_unit_lookup" ON "manual_version" ("organizationId", "developmentId", "manualType", "unitId", "revision");
