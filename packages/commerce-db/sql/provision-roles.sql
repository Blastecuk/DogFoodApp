-- Least-privilege Neon role provisioning for the DogFood platform (per spec:
-- Payload can access only payload_db; commerce/Better Auth only commerce_db;
-- runtime and migration credentials are separate).
--
-- IMPORTANT (Neon constraint): roles created via the Neon control-plane API/console
-- are automatically granted membership in `neon_superuser`, which BYPASSES the
-- database CONNECT restrictions below. Create the runtime roles with RAW SQL (as
-- shown here) so they are NOT neon_superuser members and isolation is enforced.
-- Replace the passwords with values from your secret store; never commit real ones.

-- 1) Remove the default open CONNECT so access is grant-only.
REVOKE CONNECT ON DATABASE commerce_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE payload_db  FROM PUBLIC;

-- 2) Least-privilege runtime roles (non-superuser because created via SQL).
CREATE ROLE commerce_rt LOGIN PASSWORD '<COMMERCE_RUNTIME_PASSWORD>';
CREATE ROLE payload_rt  LOGIN PASSWORD '<PAYLOAD_RUNTIME_PASSWORD>';

-- 3) Scope each runtime role to exactly one database.
GRANT CONNECT ON DATABASE commerce_db TO commerce_rt;   -- commerce only
GRANT CONNECT ON DATABASE payload_db  TO payload_rt;    -- payload only
-- (Deliberately NOT granted: commerce_rt->payload_db, payload_rt->commerce_db.)

-- 4) commerce_rt: CRUD on the commerce schema (run as the schema owner / migrator).
GRANT USAGE ON SCHEMA commerce TO commerce_rt;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA commerce TO commerce_rt;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA commerce TO commerce_rt;
ALTER DEFAULT PRIVILEGES IN SCHEMA commerce
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO commerce_rt;

-- 5) payload_rt: CRUD on Payload's schema (run connected to payload_db as its owner).
GRANT USAGE ON SCHEMA public TO payload_rt;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO payload_rt;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO payload_rt;

-- Verification (expected): commerce_rt CONNECTS to commerce_db and is DENIED payload_db;
-- payload_rt CONNECTS to payload_db and is DENIED commerce_db.
