ALTER TABLE "development_assignment" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'editor';
CREATE UNIQUE INDEX IF NOT EXISTS "development_assignment_unique" ON "development_assignment" ("developmentId", "memberId");
ALTER TABLE "organization_invitation" ADD COLUMN IF NOT EXISTS "developmentIds" jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS "organization_integration" ("id" text PRIMARY KEY, "organizationId" text NOT NULL, "provider" text NOT NULL, "encryptedKey" text NOT NULL, "config" jsonb NOT NULL DEFAULT '{}'::jsonb, "testedAt" timestamptz, "status" text NOT NULL DEFAULT 'saved', "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS "org_integration_provider_unique" ON "organization_integration" ("organizationId","provider");
