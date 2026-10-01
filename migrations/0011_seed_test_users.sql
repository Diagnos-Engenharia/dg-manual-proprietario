-- Provisionamento idempotente de contas de teste do DG Manual.
-- Senhas são armazenadas apenas como hashes scrypt compatíveis com Better Auth.

-- 1) Gerenciador de plataforma
INSERT INTO "user" (
  "id", "name", "email", "emailVerified", "platformRole", "createdAt", "updatedAt"
)
VALUES (
  'test-manager-contact-diagnos',
  'Gerenciador Diagnos',
  'contato@diagnos.eng.br',
  true,
  'manager',
  now(),
  now()
)
ON CONFLICT ("email") DO UPDATE
SET
  "platformRole" = 'manager',
  "emailVerified" = true,
  "updatedAt" = now();

UPDATE "account"
SET
  "password" = 'b8085b145e08234d5b662a884915c060:88fc3b586f199ed8162289ee2a59f3475729cab1033ce8d84444e0d5c0d0ff80ae841b660a3151732fc709c5f0dd928df65c6d6f92ad9a6f3db9168c964510e1',
  "updatedAt" = now()
WHERE "providerId" = 'credential'
  AND "userId" = (
    SELECT "id" FROM "user" WHERE lower("email") = 'contato@diagnos.eng.br' LIMIT 1
  );

INSERT INTO "account" (
  "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
)
SELECT
  'test-manager-contact-diagnos-account',
  u."id",
  'credential',
  u."id",
  'b8085b145e08234d5b662a884915c060:88fc3b586f199ed8162289ee2a59f3475729cab1033ce8d84444e0d5c0d0ff80ae841b660a3151732fc709c5f0dd928df65c6d6f92ad9a6f3db9168c964510e1',
  now(),
  now()
FROM "user" u
WHERE lower(u."email") = 'contato@diagnos.eng.br'
  AND NOT EXISTS (
    SELECT 1
    FROM "account" a
    WHERE a."providerId" = 'credential'
      AND a."userId" = u."id"
  );

-- 2) Construtor de teste
INSERT INTO "user" (
  "id", "name", "email", "emailVerified", "createdAt", "updatedAt"
)
VALUES (
  'test-constructor-diagnos',
  'Construtor Teste',
  'construtor@teste.com.br',
  true,
  now(),
  now()
)
ON CONFLICT ("email") DO UPDATE
SET
  "emailVerified" = true,
  "updatedAt" = now();

UPDATE "account"
SET
  "password" = '8c616f416adbebe3c371c532d12308ac:60c1540b5400f82b1fc04aa92d3b9de8e2f5db0011bd11a2ddd96da25ee788eb1a224225e93b3e43e3a3311ec160d7aa828e9a30c0e834ec121f3aa33f3d2dc1',
  "updatedAt" = now()
WHERE "providerId" = 'credential'
  AND "userId" = (
    SELECT "id" FROM "user" WHERE lower("email") = 'construtor@teste.com.br' LIMIT 1
  );

INSERT INTO "account" (
  "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
)
SELECT
  'test-constructor-diagnos-account',
  u."id",
  'credential',
  u."id",
  '8c616f416adbebe3c371c532d12308ac:60c1540b5400f82b1fc04aa92d3b9de8e2f5db0011bd11a2ddd96da25ee788eb1a224225e93b3e43e3a3311ec160d7aa828e9a30c0e834ec121f3aa33f3d2dc1',
  now(),
  now()
FROM "user" u
WHERE lower(u."email") = 'construtor@teste.com.br'
  AND NOT EXISTS (
    SELECT 1
    FROM "account" a
    WHERE a."providerId" = 'credential'
      AND a."userId" = u."id"
  );

-- Vincula o Construtor à organização da Diagnos (ou à primeira organização existente).
WITH target_org AS (
  SELECT o."id"
  FROM "organization" o
  ORDER BY
    CASE WHEN lower(o."name") LIKE '%diagnos%' THEN 0 ELSE 1 END,
    o."createdAt" ASC
  LIMIT 1
),
constructor_user AS (
  SELECT u."id"
  FROM "user" u
  WHERE lower(u."email") = 'construtor@teste.com.br'
  LIMIT 1
)
UPDATE "member" m
SET
  "role" = 'editor',
  "status" = 'active',
  "lastAccessAt" = now()
WHERE m."organizationId" = (SELECT "id" FROM target_org)
  AND m."userId" = (SELECT "id" FROM constructor_user);

WITH target_org AS (
  SELECT o."id"
  FROM "organization" o
  ORDER BY
    CASE WHEN lower(o."name") LIKE '%diagnos%' THEN 0 ELSE 1 END,
    o."createdAt" ASC
  LIMIT 1
),
constructor_user AS (
  SELECT u."id"
  FROM "user" u
  WHERE lower(u."email") = 'construtor@teste.com.br'
  LIMIT 1
)
INSERT INTO "member" (
  "id", "organizationId", "userId", "role", "status", "lastAccessAt", "createdAt"
)
SELECT
  'test-constructor-diagnos-member',
  o."id",
  u."id",
  'editor',
  'active',
  now(),
  now()
FROM target_org o
CROSS JOIN constructor_user u
WHERE NOT EXISTS (
  SELECT 1
  FROM "member" m
  WHERE m."organizationId" = o."id"
    AND m."userId" = u."id"
);

-- Dá acesso a um empreendimento existente para permitir testar a interface do Construtor.
WITH target_org AS (
  SELECT o."id"
  FROM "organization" o
  ORDER BY
    CASE WHEN lower(o."name") LIKE '%diagnos%' THEN 0 ELSE 1 END,
    o."createdAt" ASC
  LIMIT 1
),
constructor_member AS (
  SELECT m."id", m."organizationId"
  FROM "member" m
  JOIN "user" u ON u."id" = m."userId"
  WHERE lower(u."email") = 'construtor@teste.com.br'
    AND m."organizationId" = (SELECT "id" FROM target_org)
  LIMIT 1
),
target_development AS (
  SELECT d."id", d."organizationId"
  FROM "development" d
  WHERE d."organizationId" = (SELECT "id" FROM target_org)
  ORDER BY d."createdAt" DESC
  LIMIT 1
)
INSERT INTO "development_assignment" (
  "id", "organizationId", "developmentId", "memberId", "role", "createdAt"
)
SELECT
  'test-constructor-diagnos-assignment',
  d."organizationId",
  d."id",
  m."id",
  'editor',
  now()
FROM target_development d
CROSS JOIN constructor_member m
WHERE NOT EXISTS (
  SELECT 1
  FROM "development_assignment" a
  WHERE a."developmentId" = d."id"
    AND a."memberId" = m."id"
);
