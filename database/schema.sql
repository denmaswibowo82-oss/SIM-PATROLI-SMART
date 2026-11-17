-- ============================================================================
-- SIM-PATROLI SMART (Sistem Informasi Manajemen Keluar Masuk Kendaraan Patroli)
-- Satuan Polisi Pamong Praja (Satpol PP)
-- PostgreSQL 16+ Production Database Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ----------------------------------------------------------------------------
-- ENUMERATIONS
-- ----------------------------------------------------------------------------
CREATE TYPE vehicle_category AS ENUM (
  'MOBIL_PATROLI',
  'TRUK_DALMAS',
  'MOTOR_PATROLI',
  'MOBIL_OPERASIONAL'
);

CREATE TYPE vehicle_status AS ENUM (
  'SIAP',
  'PATROLI',
  'MAINTENANCE',
  'RUSAK_BERAT'
);

CREATE TYPE dispatch_status AS ENUM (
  'PENDING',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE fuel_level AS ENUM (
  'E',
  '1/4',
  '1/2',
  '3/4',
  'FULL'
);

CREATE TYPE maintenance_severity AS ENUM (
  'RINGAN',
  'SEDANG',
  'BERAT',
  'DARURAT'
);

CREATE TYPE maintenance_status AS ENUM (
  'OPEN',
  'IN_REPAIR',
  'RESOLVED'
);

-- ----------------------------------------------------------------------------
-- 1. ROLES (Hak Akses RBAC)
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(40) NOT NULL UNIQUE, -- ADMIN, PERWIRA_PIKET, DANRU_JAGA, PENGEMUDI, KANIT_BIDANG
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. UNITS (Satuan Kerja / Bidang di Lingkungan Satpol PP)
-- ----------------------------------------------------------------------------
CREATE TABLE units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(30) NOT NULL UNIQUE, -- TRANTIBUM, GAKDA, LINMAS, SEKRETARIAT, PTI
  name        VARCHAR(150) NOT NULL,
  head_name   VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. USERS (Personel & Pejabat Satpol PP)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip_nrp       VARCHAR(30) NOT NULL UNIQUE,
  full_name     VARCHAR(150) NOT NULL,
  rank_title    VARCHAR(80) NOT NULL,       -- Penata Tk.I, Pengatur Muda, dll.
  role_id       UUID NOT NULL REFERENCES roles(id) ON UPDATE CASCADE,
  unit_id       UUID NOT NULL REFERENCES units(id) ON UPDATE CASCADE,
  phone         VARCHAR(25),
  password_hash TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_unit ON users(unit_id);

-- ----------------------------------------------------------------------------
-- 4. VEHICLES (Inventaris Kendaraan Dinas Patroli)
-- ----------------------------------------------------------------------------
CREATE TABLE vehicles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number      VARCHAR(20) NOT NULL UNIQUE,  -- e.g. B 9042 PQA
  hull_code         VARCHAR(30) NOT NULL UNIQUE,  -- e.g. PATROLI-01
  brand_model       VARCHAR(120) NOT NULL,        -- e.g. Ford Ranger Double Cabin 4x4
  category          vehicle_category NOT NULL,
  manufacture_year  SMALLINT NOT NULL CHECK (manufacture_year BETWEEN 1995 AND 2100),
  qr_token          VARCHAR(120) NOT NULL UNIQUE, -- Token unik tercetak pada stiker QR armada
  current_odometer  INTEGER NOT NULL DEFAULT 0 CHECK (current_odometer >= 0),
  current_fuel      fuel_level NOT NULL DEFAULT 'FULL',
  status            vehicle_status NOT NULL DEFAULT 'SIAP',
  unit_id           UUID REFERENCES units(id) ON DELETE SET NULL,
  stnk_valid_until  DATE NOT NULL,
  kir_valid_until   DATE,
  image_url         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_qr ON vehicles(qr_token);

-- ----------------------------------------------------------------------------
-- 5. DISPATCH_REQUESTS (Pengajuan Penugasan & Booking Armada)
-- ----------------------------------------------------------------------------
CREATE TABLE dispatch_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spt_number         VARCHAR(60) NOT NULL UNIQUE, -- Nomor Surat Perintah Tugas
  vehicle_id         UUID NOT NULL REFERENCES vehicles(id) ON UPDATE CASCADE,
  requester_id       UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  driver_id          UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  unit_id            UUID NOT NULL REFERENCES units(id) ON UPDATE CASCADE,
  mission_title      VARCHAR(180) NOT NULL,
  destination_area   VARCHAR(200) NOT NULL,
  personnel_count    SMALLINT NOT NULL DEFAULT 2 CHECK (personnel_count >= 1),
  planned_departure  TIMESTAMPTZ NOT NULL,
  planned_return     TIMESTAMPTZ NOT NULL,
  status             dispatch_status NOT NULL DEFAULT 'PENDING',
  approved_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at        TIMESTAMPTZ,
  rejection_reason   TEXT,
  qr_dispatch_code   VARCHAR(140) NOT NULL UNIQUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_dispatch_time_window CHECK (planned_return > planned_departure),
  -- PostgreSQL Conflict Detection Level-DB: mencegah overlap jadwal pada kendaraan yang sama
  CONSTRAINT excl_vehicle_dispatch_overlap EXCLUDE USING GIST (
    vehicle_id WITH =,
    tstzrange(planned_departure, planned_return, '[)') WITH &&
  ) WHERE (status IN ('APPROVED', 'IN_PROGRESS'))
);

CREATE INDEX idx_dispatch_vehicle_time ON dispatch_requests(vehicle_id, planned_departure, planned_return);
CREATE INDEX idx_dispatch_status ON dispatch_requests(status);

-- ----------------------------------------------------------------------------
-- 6. GATE_CHECKOUTS (Pencatatan Keluar Gerbang Mako via QR)
-- ----------------------------------------------------------------------------
CREATE TABLE gate_checkouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id       UUID NOT NULL UNIQUE REFERENCES dispatch_requests(id) ON DELETE CASCADE,
  vehicle_id        UUID NOT NULL REFERENCES vehicles(id) ON UPDATE CASCADE,
  guard_officer_id  UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  driver_id         UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  actual_checkout_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  odometer_start    INTEGER NOT NULL CHECK (odometer_start >= 0),
  fuel_level_start  fuel_level NOT NULL,
  lights_siren_ok   BOOLEAN NOT NULL DEFAULT TRUE,
  tires_body_ok     BOOLEAN NOT NULL DEFAULT TRUE,
  documents_ok      BOOLEAN NOT NULL DEFAULT TRUE,
  checkout_notes    TEXT,
  qr_scanned_token  VARCHAR(140) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkout_time ON gate_checkouts(actual_checkout_at DESC);

-- ----------------------------------------------------------------------------
-- 7. GATE_CHECKINS (Pencatatan Kembali ke Mako via QR)
-- ----------------------------------------------------------------------------
CREATE TABLE gate_checkins (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id       UUID NOT NULL UNIQUE REFERENCES gate_checkouts(id) ON DELETE CASCADE,
  dispatch_id       UUID NOT NULL UNIQUE REFERENCES dispatch_requests(id) ON DELETE CASCADE,
  vehicle_id        UUID NOT NULL REFERENCES vehicles(id) ON UPDATE CASCADE,
  guard_officer_id  UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  actual_checkin_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  odometer_end      INTEGER NOT NULL CHECK (odometer_end >= 0),
  fuel_level_end    fuel_level NOT NULL,
  condition_status  VARCHAR(30) NOT NULL CHECK (condition_status IN ('BAIK', 'PERLU_PERBAIKAN', 'RUSAK')),
  damage_notes      TEXT,
  qr_scanned_token  VARCHAR(140) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkin_time ON gate_checkins(actual_checkin_at DESC);

-- ----------------------------------------------------------------------------
-- 8. MAINTENANCE_TICKETS (Laporan Kerusakan & Pemeliharaan Berkala)
-- ----------------------------------------------------------------------------
CREATE TABLE maintenance_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code     VARCHAR(40) NOT NULL UNIQUE,
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON UPDATE CASCADE,
  reported_by     UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  title           VARCHAR(160) NOT NULL,
  description     TEXT NOT NULL,
  severity        maintenance_severity NOT NULL DEFAULT 'SEDANG',
  status          maintenance_status NOT NULL DEFAULT 'OPEN',
  workshop_name   VARCHAR(150),
  estimated_ready DATE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_vehicle_status ON maintenance_tickets(vehicle_id, status);

-- ----------------------------------------------------------------------------
-- 9. AUDIT_LOGS (Jejak Audit Tidak Dapat Diubah / Immutable Trail)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(80) NOT NULL,      -- DISPATCH_CREATED, DISPATCH_CONFLICT_BLOCKED, GATE_CHECKOUT, GATE_CHECKIN, MAINTENANCE_OPENED
  entity_name VARCHAR(60) NOT NULL,
  entity_id   VARCHAR(80) NOT NULL,
  summary     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_name, entity_id);

-- ----------------------------------------------------------------------------
-- TRIGGER UPDATED_AT OTOMATIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_dispatch_updated BEFORE UPDATE ON dispatch_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_updated BEFORE UPDATE ON maintenance_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
