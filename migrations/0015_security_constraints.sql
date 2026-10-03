DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_access_status_check') THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_access_status_check"
      CHECK ("accessStatus" IN ('active','disabled')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_status_check') THEN
    ALTER TABLE "member" ADD CONSTRAINT "member_status_check"
      CHECK ("status" IN ('active','suspended','removed')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_role_check') THEN
    ALTER TABLE "member" ADD CONSTRAINT "member_role_check"
      CHECK ("role" IN ('owner','admin','editor','admin_empreendimento','validator','member')) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'development_assignment_role_check') THEN
    ALTER TABLE "development_assignment" ADD CONSTRAINT "development_assignment_role_check"
      CHECK ("role" IN ('admin_empreendimento','editor','validator')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "member_organization_user_idx"
  ON "member" ("organizationId","userId");

CREATE INDEX IF NOT EXISTS "development_org_idx"
  ON "development" ("organizationId");

CREATE INDEX IF NOT EXISTS "development_assignment_org_member_idx"
  ON "development_assignment" ("organizationId","memberId");
