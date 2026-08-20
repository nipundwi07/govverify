-- GovVerify MVP schema
-- Run this once against a fresh Supabase PostgreSQL database.

-- ---------------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------------

CREATE TYPE asset_type AS ENUM (
  'fence',
  'road',
  'drainage',
  'streetlight',
  'other'
);

CREATE TYPE contract_status AS ENUM (
  'pending',
  'submitted',
  'approved',
  'rejected'
);

CREATE TYPE submission_status AS ENUM (
  'pending_review',
  'auto_flagged',
  'approved',
  'rejected'
);

CREATE TYPE official_role AS ENUM (
  'junior_engineer',
  'district_officer',
  'admin'
);

-- ---------------------------------------------------------------------------
-- Tables (order matters because of foreign keys)
-- ---------------------------------------------------------------------------

CREATE TABLE vendors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE officials (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  district   TEXT NOT NULL,
  role       official_role NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  asset_type          asset_type NOT NULL,
  assigned_vendor_id  UUID NOT NULL REFERENCES vendors (id),
  site_latitude       NUMERIC NOT NULL,
  site_longitude      NUMERIC NOT NULL,
  site_radius_meters  INTEGER NOT NULL,
  district            TEXT NOT NULL,
  sanctioned_amount   NUMERIC NOT NULL,
  status              contract_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id            UUID NOT NULL REFERENCES contracts (id),
  vendor_id              UUID NOT NULL REFERENCES vendors (id),
  photo_url              TEXT NOT NULL,
  captured_lat           NUMERIC NOT NULL,
  captured_lng           NUMERIC NOT NULL,
  gps_accuracy_meters    NUMERIC NOT NULL,
  captured_at            TIMESTAMPTZ NOT NULL,
  submitted_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  distance_from_site_m   NUMERIC NOT NULL,
  status                 submission_status NOT NULL DEFAULT 'pending_review',
  flag_reason            TEXT,
  reviewed_by            UUID REFERENCES officials (id),
  review_notes           TEXT,
  reviewed_at            TIMESTAMPTZ
);

-- Keep contracts.updated_at in sync on every UPDATE (created_at stays fixed).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
--
-- How Supabase knows "who is logged in":
--   Mobile/dashboard clients authenticate via Supabase Auth. When a user signs
--   in, we store their role-specific IDs in JWT app_metadata (set by the
--   backend or an auth hook), for example:
--     { "vendor_id": "<uuid>" }           for vendors
--     { "official_id": "<uuid>", "district": "..." }  for officials
--
--   Policies below read those claims. Your Express API using the service_role
--   key bypasses RLS entirely — RLS protects direct client → Supabase access.
-- ---------------------------------------------------------------------------

ALTER TABLE vendors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE officials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Helper: current user's vendor_id from JWT (NULL if not a vendor session).
CREATE OR REPLACE FUNCTION auth_vendor_id()
RETURNS UUID AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'vendor_id', '')::UUID;
$$ LANGUAGE sql STABLE;

-- Helper: current official's district from JWT.
CREATE OR REPLACE FUNCTION auth_official_district()
RETURNS TEXT AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'district', '');
$$ LANGUAGE sql STABLE;

-- Helper: true when JWT indicates an official role (any official type).
CREATE OR REPLACE FUNCTION auth_is_official()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ) IN ('junior_engineer', 'district_officer', 'admin');
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------
-- vendors policies
-- ---------------------------------------------------------------------------

-- Vendors can read only their own vendor profile (name, phone, etc.).
CREATE POLICY vendors_select_own
  ON vendors
  FOR SELECT
  TO authenticated
  USING (id = auth_vendor_id());

-- ---------------------------------------------------------------------------
-- contracts policies
-- ---------------------------------------------------------------------------

-- Vendors can see contracts assigned to them (needed to know where to submit proof).
CREATE POLICY contracts_select_assigned_vendor
  ON contracts
  FOR SELECT
  TO authenticated
  USING (assigned_vendor_id = auth_vendor_id());

-- Officials can see contracts in their district (for dashboard review context).
CREATE POLICY contracts_select_official_district
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    auth_is_official()
    AND district = auth_official_district()
  );

-- ---------------------------------------------------------------------------
-- submissions policies — core vendor isolation
-- ---------------------------------------------------------------------------

-- A vendor may SELECT only rows where vendor_id matches their JWT claim.
-- This blocks Vendor A from reading Vendor B's submissions even if they guess UUIDs.
CREATE POLICY submissions_select_own_vendor
  ON submissions
  FOR SELECT
  TO authenticated
  USING (vendor_id = auth_vendor_id());

-- A vendor may INSERT only if they attach their own vendor_id to the row.
-- WITH CHECK runs on the new row; prevents inserting proof on behalf of someone else.
CREATE POLICY submissions_insert_own_vendor
  ON submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (vendor_id = auth_vendor_id());

-- Officials in the same district as the contract can read submissions for review.
CREATE POLICY submissions_select_official_district
  ON submissions
  FOR SELECT
  TO authenticated
  USING (
    auth_is_official()
    AND EXISTS (
      SELECT 1
      FROM contracts c
      WHERE c.id = submissions.contract_id
        AND c.district = auth_official_district()
    )
  );

-- Officials in the contract's district can update review fields (approve/reject).
CREATE POLICY submissions_update_official_district
  ON submissions
  FOR UPDATE
  TO authenticated
  USING (
    auth_is_official()
    AND EXISTS (
      SELECT 1
      FROM contracts c
      WHERE c.id = submissions.contract_id
        AND c.district = auth_official_district()
    )
  )
  WITH CHECK (
    auth_is_official()
    AND EXISTS (
      SELECT 1
      FROM contracts c
      WHERE c.id = submissions.contract_id
        AND c.district = auth_official_district()
    )
  );

-- ---------------------------------------------------------------------------
-- officials policies
-- ---------------------------------------------------------------------------

-- Officials can read their own profile row (for session/bootstrap).
CREATE POLICY officials_select_own
  ON officials
  FOR SELECT
  TO authenticated
  USING (
    id = NULLIF(auth.jwt() -> 'app_metadata' ->> 'official_id', '')::UUID
  );
