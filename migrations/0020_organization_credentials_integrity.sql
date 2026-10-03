-- Close deletion/write races for tenant-owned credentials and notifications.
-- NOT VALID preserves legacy rows; all new writes/deletions are enforced.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_api_key_organization_fk') THEN
    ALTER TABLE "organization_api_key"
      ADD CONSTRAINT "organization_api_key_organization_fk"
      FOREIGN KEY ("organizationId") REFERENCES "organization" ("id")
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_integration_organization_fk') THEN
    ALTER TABLE "organization_integration"
      ADD CONSTRAINT "organization_integration_organization_fk"
      FOREIGN KEY ("organizationId") REFERENCES "organization" ("id")
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_notification_organization_fk') THEN
    ALTER TABLE "organization_notification"
      ADD CONSTRAINT "organization_notification_organization_fk"
      FOREIGN KEY ("organizationId") REFERENCES "organization" ("id")
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "organization_api_key_organization_idx"
  ON "organization_api_key" ("organizationId");
CREATE INDEX IF NOT EXISTS "organization_notification_organization_idx"
  ON "organization_notification" ("organizationId");
