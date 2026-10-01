-- Hardening de integridade organizacional.
-- NOT VALID preserva dados legados enquanto passa a proteger novas operações.

CREATE UNIQUE INDEX IF NOT EXISTS "member_organization_user_unique"
  ON "member" ("organizationId","userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_organization_fk') THEN
    ALTER TABLE "member"
      ADD CONSTRAINT "member_organization_fk"
      FOREIGN KEY ("organizationId")
      REFERENCES "organization" ("id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'development_organization_fk') THEN
    ALTER TABLE "development"
      ADD CONSTRAINT "development_organization_fk"
      FOREIGN KEY ("organizationId")
      REFERENCES "organization" ("id")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitation_organization_fk') THEN
    ALTER TABLE "organization_invitation"
      ADD CONSTRAINT "invitation_organization_fk"
      FOREIGN KEY ("organizationId")
      REFERENCES "organization" ("id")
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;
