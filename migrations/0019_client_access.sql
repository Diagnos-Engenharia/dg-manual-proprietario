-- Client access is independent of internal organization memberships.
ALTER TABLE "manual_version" ADD COLUMN IF NOT EXISTS "publishedAt" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "development_unit_tenant_unique"
  ON "development_unit" ("id", "developmentId", "organizationId");

CREATE TABLE IF NOT EXISTS "client_access" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organization" ("id") ON DELETE RESTRICT,
  "developmentId" text NOT NULL,
  "unitId" text NOT NULL,
  "userId" text REFERENCES "user" ("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'active', 'disabled')),
  "createdBy" text NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("status" <> 'active' OR "userId" IS NOT NULL),
  CONSTRAINT "client_access_development_tenant_fk" FOREIGN KEY ("developmentId", "organizationId")
    REFERENCES "development" ("id", "organizationId") ON DELETE RESTRICT,
  CONSTRAINT "client_access_unit_tenant_fk" FOREIGN KEY ("unitId", "developmentId", "organizationId")
    REFERENCES "development_unit" ("id", "developmentId", "organizationId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "client_access_unit_email_unique"
  ON "client_access" ("organizationId", "unitId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "client_access_id_org_user_unique"
  ON "client_access" ("id", "organizationId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "client_access_id_org_unit_unique"
  ON "client_access" ("id", "organizationId", "unitId");
CREATE INDEX IF NOT EXISTS "client_access_user_status_idx" ON "client_access" ("userId", "status");

ALTER TABLE "organization_invitation" ADD COLUMN IF NOT EXISTS "unitId" text;
ALTER TABLE "organization_invitation" ADD COLUMN IF NOT EXISTS "clientAccessId" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitation_client_access_fk') THEN
    ALTER TABLE "organization_invitation" ADD CONSTRAINT "invitation_client_access_fk"
      FOREIGN KEY ("clientAccessId", "organizationId", "unitId")
      REFERENCES "client_access" ("id", "organizationId", "unitId") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitation_client_shape_check') THEN
    ALTER TABLE "organization_invitation" ADD CONSTRAINT "invitation_client_shape_check"
      CHECK (("role" = 'client' AND "clientAccessId" IS NOT NULL AND "unitId" IS NOT NULL)
        OR ("role" <> 'client' AND "clientAccessId" IS NULL AND "unitId" IS NULL)) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "client_password_reset" (
  "id" text PRIMARY KEY,
  "clientAccessId" text NOT NULL,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "createdBy" text NOT NULL REFERENCES "user" ("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "client_reset_access_tenant_user_fk" FOREIGN KEY ("clientAccessId", "organizationId", "userId")
    REFERENCES "client_access" ("id", "organizationId", "userId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "client_password_reset_access_idx" ON "client_password_reset" ("clientAccessId", "expiresAt");
