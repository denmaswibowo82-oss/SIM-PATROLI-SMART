import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sim_patroli.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      head_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nip_nrp TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      rank_title TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES roles(id),
      unit_id TEXT NOT NULL REFERENCES units(id),
      phone TEXT,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      plate_number TEXT NOT NULL UNIQUE,
      hull_code TEXT NOT NULL UNIQUE,
      brand_model TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('MOBIL_PATROLI','TRUK_DALMAS','MOTOR_PATROLI','MOBIL_OPERASIONAL')),
      manufacture_year INTEGER NOT NULL,
      qr_token TEXT NOT NULL UNIQUE,
      current_odometer INTEGER NOT NULL DEFAULT 0,
      current_fuel TEXT NOT NULL DEFAULT 'FULL' CHECK (current_fuel IN ('E','1/4','1/2','3/4','FULL')),
      status TEXT NOT NULL DEFAULT 'SIAP' CHECK (status IN ('SIAP','PATROLI','MAINTENANCE','RUSAK_BERAT')),
      unit_id TEXT REFERENCES units(id),
      stnk_valid_until TEXT NOT NULL,
      kir_valid_until TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dispatch_requests (
      id TEXT PRIMARY KEY,
      spt_number TEXT NOT NULL UNIQUE,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      driver_id TEXT NOT NULL REFERENCES users(id),
      unit_id TEXT NOT NULL REFERENCES units(id),
      mission_title TEXT NOT NULL,
      destination_area TEXT NOT NULL,
      personnel_count INTEGER NOT NULL DEFAULT 2,
      planned_departure TEXT NOT NULL,
      planned_return TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')),
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      rejection_reason TEXT,
      qr_dispatch_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gate_checkouts (
      id TEXT PRIMARY KEY,
      dispatch_id TEXT NOT NULL UNIQUE REFERENCES dispatch_requests(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      guard_officer_id TEXT NOT NULL REFERENCES users(id),
      driver_id TEXT NOT NULL REFERENCES users(id),
      actual_checkout_at TEXT NOT NULL,
      odometer_start INTEGER NOT NULL,
      fuel_level_start TEXT NOT NULL CHECK (fuel_level_start IN ('E','1/4','1/2','3/4','FULL')),
      lights_siren_ok INTEGER NOT NULL DEFAULT 1,
      tires_body_ok INTEGER NOT NULL DEFAULT 1,
      documents_ok INTEGER NOT NULL DEFAULT 1,
      checkout_notes TEXT,
      qr_scanned_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gate_checkins (
      id TEXT PRIMARY KEY,
      checkout_id TEXT NOT NULL UNIQUE REFERENCES gate_checkouts(id),
      dispatch_id TEXT NOT NULL UNIQUE REFERENCES dispatch_requests(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      guard_officer_id TEXT NOT NULL REFERENCES users(id),
      actual_checkin_at TEXT NOT NULL,
      odometer_end INTEGER NOT NULL,
      fuel_level_end TEXT NOT NULL CHECK (fuel_level_end IN ('E','1/4','1/2','3/4','FULL')),
      condition_status TEXT NOT NULL CHECK (condition_status IN ('BAIK','PERLU_PERBAIKAN','RUSAK')),
      damage_notes TEXT,
      qr_scanned_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id TEXT PRIMARY KEY,
      ticket_code TEXT NOT NULL UNIQUE,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      reported_by TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'SEDANG' CHECK (severity IN ('RINGAN','SEDANG','BERAT','DARURAT')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REPAIR','RESOLVED')),
      workshop_name TEXT,
      estimated_ready TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as total FROM vehicles').get() as { total: number };
  if (countRow.total === 0) {
    seedInitialData();
  }
}

function todayAt(hour: number, minute: number, dayOffset = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + dayOffset);
  now.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}

function seedInitialData(): void {
  const insertRole = db.prepare(
    'INSERT INTO roles (id, code, name, description) VALUES (?, ?, ?, ?)'
  );
  insertRole.run('role-piket', 'PERWIRA_PIKET', 'Perwira Piket Mako', 'Otoritas persetujuan SPT & penandatangan Laporan Piket Harian');
  insertRole.run('role-danru', 'DANRU_JAGA', 'Danru Penjagaan Gerbang', 'Komandan Regu Penjagaan Mako yang melakukan verifikasi QR Check-Out/In');
  insertRole.run('role-kanit', 'KANIT_BIDANG', 'Kepala Seksi / Pengaju', 'Pejabat bidang pengaju surat perintah penugasan patroli');
  insertRole.run('role-driver', 'PENGEMUDI', 'Pengemudi / Awak Patroli', 'Personel pengemudi kendaraan dinas Satpol PP');

  const insertUnit = db.prepare(
    'INSERT INTO units (id, code, name, head_name) VALUES (?, ?, ?, ?)'
  );
  insertUnit.run('unit-trantib', 'TRANTIBUM', 'Bidang Ketertiban Umum & Ketentraman', 'Drs. Hendra Wijaya, M.Si');
  insertUnit.run('unit-gakda', 'GAKDA', 'Bidang Penegakan Perda & Perkada', 'R. Bagus Santoso, S.H., M.H.');
  insertUnit.run('unit-linmas', 'LINMAS', 'Bidang Perlindungan Masyarakat', 'Siti Aminah, S.STP');
  insertUnit.run('unit-pti', 'PTI', 'Regu Tindak Internal & Penjagaan Mako', 'Kapten (Satpol) Dedi Kurniawan');

  const insertUser = db.prepare(
    'INSERT INTO users (id, nip_nrp, full_name, rank_title, role_id, unit_id, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertUser.run('usr-piket-01', '197904122005011004', 'AKP (Purn/Satpol) Bambang Sutrisno, S.Sos', 'Penata Tk.I (III/d)', 'role-piket', 'unit-pti', '0812-8800-1101', 'hashed-demo');
  insertUser.run('usr-danru-01', '198608192010011008', 'Serma (Satpol) Teguh Prasetyo', 'Pengatur Tk.I (II/d)', 'role-danru', 'unit-pti', '0813-7721-9022', 'hashed-demo');
  insertUser.run('usr-kanit-01', '198301052009021003', 'Arif Rahman Hakim, S.STP', 'Penata (III/c)', 'role-kanit', 'unit-trantib', '0811-9045-3312', 'hashed-demo');
  insertUser.run('usr-drv-01', '199103242015031002', 'Budi Hartono', 'Pengatur Muda (II/a)', 'role-driver', 'unit-trantib', '0856-4412-7781', 'hashed-demo');
  insertUser.run('usr-drv-02', '199311102018011006', 'Rizky Ramadhan', 'Pengatur Muda (II/a)', 'role-driver', 'unit-gakda', '0812-3310-6654', 'hashed-demo');
  insertUser.run('usr-drv-03', '199007182014021001', 'Eko Wahyudi', 'Pengatur (II/c)', 'role-driver', 'unit-linmas', '0819-0023-4490', 'hashed-demo');

  const suvImg = '/src/assets/images/fleet_patrol_suv_1794896243573.jpg';
  const motoImg = '/src/assets/images/fleet_patrol_moto_1794896242958.jpg';

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (
      id, plate_number, hull_code, brand_model, category, manufacture_year,
      qr_token, current_odometer, current_fuel, status, unit_id, stnk_valid_until, kir_valid_until, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertVehicle.run('veh-01', 'B 9042 PQA', 'PATROLI-01', 'Ford Ranger Double Cabin 4x4', 'MOBIL_PATROLI', 2023, 'SATPOL-QR-PATROLI-01', 42810, '3/4', 'PATROLI', 'unit-trantib', '2027-08-14', '2027-02-14', suvImg);
  insertVehicle.run('veh-02', 'B 9045 PQA', 'PATROLI-02', 'Toyota Hilux Patroli Double Cabin', 'MOBIL_PATROLI', 2024, 'SATPOL-QR-PATROLI-02', 18450, 'FULL', 'SIAP', 'unit-gakda', '2028-01-20', '2027-07-20', suvImg);
  insertVehicle.run('veh-03', 'B 9108 PQA', 'DALMAS-01', 'Isuzu Elf Truk Angkut Personel', 'TRUK_DALMAS', 2021, 'SATPOL-QR-DALMAS-01', 67320, '1/2', 'SIAP', 'unit-trantib', '2027-05-11', '2027-01-11', suvImg);
  insertVehicle.run('veh-04', 'B 3412 PQA', 'URA-01', 'Kawasaki KLX 250 Tactical Trail', 'MOTOR_PATROLI', 2023, 'SATPOL-QR-URA-01', 11290, 'FULL', 'SIAP', 'unit-linmas', '2027-11-02', null, motoImg);
  insertVehicle.run('veh-05', 'B 3415 PQA', 'URA-02', 'BMW F750 GS Patroli Reaksi Cepat', 'MOTOR_PATROLI', 2024, 'SATPOL-QR-URA-02', 9440, '3/4', 'PATROLI', 'unit-trantib', '2028-03-19', null, motoImg);
  insertVehicle.run('veh-06', 'B 9088 PQA', 'PATROLI-03', 'Mitsubishi Triton 4x4 Ops', 'MOBIL_OPERASIONAL', 2020, 'SATPOL-QR-PATROLI-03', 89120, '1/4', 'MAINTENANCE', 'unit-gakda', '2027-04-09', '2026-12-30', suvImg);

  const insertDispatch = db.prepare(`
    INSERT INTO dispatch_requests (
      id, spt_number, vehicle_id, requester_id, driver_id, unit_id, mission_title,
      destination_area, personnel_count, planned_departure, planned_return,
      status, approved_by, approved_at, qr_dispatch_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Completed morning patrol today (already checked out & checked in)
  insertDispatch.run(
    'dsp-01', 'SPT/084/TRANTIB/XI/2026', 'veh-02', 'usr-kanit-01', 'usr-drv-02', 'unit-gakda',
    'Penertiban Reklame Tak Berizin & PKL Zona Merah', 'Jl. Jend. Sudirman - Bundaran Pusat Kota', 5,
    todayAt(7, 0), todayAt(10, 30), 'COMPLETED', 'usr-piket-01', todayAt(6, 45), 'SPT-QR-084-2026'
  );

  // Currently IN_PROGRESS on patrol (checked out, awaiting check-in)
  insertDispatch.run(
    'dsp-02', 'SPT/085/TRANTIB/XI/2026', 'veh-01', 'usr-kanit-01', 'usr-drv-01', 'unit-trantib',
    'Patroli Gabungan Pengamanan Pasar Induk & Terminal', 'Kec. Pasar Baru & Terminal Terpadu', 6,
    todayAt(13, 0), todayAt(18, 0), 'IN_PROGRESS', 'usr-piket-01', todayAt(12, 30), 'SPT-QR-085-2026'
  );

  // Currently IN_PROGRESS motorcycle URA patrol
  insertDispatch.run(
    'dsp-03', 'SPT/086/LINMAS/XI/2026', 'veh-05', 'usr-kanit-01', 'usr-drv-03', 'unit-linmas',
    'Pengawasan Jalur Protokol & Antisipasi Tawuran Pelajar', 'Koridor Jl. Diponegoro - Stasiun Kota', 2,
    todayAt(14, 0), todayAt(17, 30), 'IN_PROGRESS', 'usr-piket-01', todayAt(13, 30), 'SPT-QR-086-2026'
  );

  // APPROVED and waiting for QR Gate Check-Out!
  insertDispatch.run(
    'dsp-04', 'SPT/087/TRANTIB/XI/2026', 'veh-03', 'usr-kanit-01', 'usr-drv-01', 'unit-trantib',
    'Patroli Malam Ketentraman Umum & Penjagaan Taman Kota', 'Alun-Alun Kota & Kawasan Niaga Barat', 10,
    todayAt(19, 0), todayAt(23, 30), 'APPROVED', 'usr-piket-01', todayAt(15, 10), 'SPT-QR-087-2026'
  );

  // PENDING approval
  insertDispatch.run(
    'dsp-05', 'SPT/088/LINMAS/XI/2026', 'veh-04', 'usr-kanit-01', 'usr-drv-03', 'unit-linmas',
    'Monitoring Posko Siaga Bencana & Titik Rawan Banjir', 'Kec. Bantaran Timur', 2,
    todayAt(20, 0), todayAt(22, 30), 'PENDING', null, null, 'SPT-QR-088-2026'
  );

  const insertCheckout = db.prepare(`
    INSERT INTO gate_checkouts (
      id, dispatch_id, vehicle_id, guard_officer_id, driver_id, actual_checkout_at,
      odometer_start, fuel_level_start, lights_siren_ok, tires_body_ok, documents_ok, checkout_notes, qr_scanned_token
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCheckout.run('chkout-01', 'dsp-01', 'veh-02', 'usr-danru-01', 'usr-drv-02', todayAt(7, 8), 18388, 'FULL', 1, 1, 1, 'Kondisi lengkap, rotator berfungsi normal', 'SPT-QR-084-2026');
  insertCheckout.run('chkout-02', 'dsp-02', 'veh-01', 'usr-danru-01', 'usr-drv-01', todayAt(13, 5), 42810, '3/4', 1, 1, 1, 'Membawa 4 barrier & pengeras suara', 'SPT-QR-085-2026');
  insertCheckout.run('chkout-03', 'dsp-03', 'veh-05', 'usr-danru-01', 'usr-drv-03', todayAt(14, 12), 9440, '3/4', 1, 1, 1, 'HT unit 04 aktif di channel utama', 'SPT-QR-086-2026');

  const insertCheckin = db.prepare(`
    INSERT INTO gate_checkins (
      id, checkout_id, dispatch_id, vehicle_id, guard_officer_id, actual_checkin_at,
      odometer_end, fuel_level_end, condition_status, damage_notes, qr_scanned_token
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCheckin.run('chkin-01', 'chkout-01', 'dsp-01', 'veh-02', 'usr-danru-01', todayAt(10, 42), 18450, 'FULL', 'BAIK', 'Kendaraan bersih, BBM diisi ulang di SPBU Mitra', 'SPT-QR-084-2026');

  const insertMaintenance = db.prepare(`
    INSERT INTO maintenance_tickets (
      id, ticket_code, vehicle_id, reported_by, title, description, severity, status, workshop_name, estimated_ready
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMaintenance.run(
    'mnt-01', 'MNT-2026-019', 'veh-06', 'usr-danru-01',
    'Perbaikan Kampas Kopling & Servis Berkala 90.000 KM',
    'Selip kopling terasa saat tanjakan; penggantian set kopling, oli gardan, dan pengecekan rem cakram depan.',
    'BERAT', 'IN_REPAIR', 'Bengkel Rekanan Pemda — CV. Karya Utama Motor', todayAt(17, 0, 2).slice(0, 10)
  );

  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (actor_id, action, entity_name, entity_id, summary, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run('usr-piket-01', 'DISPATCH_APPROVED', 'dispatch_requests', 'dsp-04', 'Menyetujui SPT/087/TRANTIB/XI/2026 untuk unit DALMAS-01 (B 9108 PQA)', '{}', todayAt(15, 10));
  insertAudit.run('usr-danru-01', 'GATE_CHECKOUT', 'gate_checkouts', 'chkout-03', 'Check-Out QR URA-02 (B 3415 PQA) oleh Rizky/Eko · Odometer 9.440 km', '{}', todayAt(14, 12));
  insertAudit.run('usr-danru-01', 'GATE_CHECKOUT', 'gate_checkouts', 'chkout-02', 'Check-Out QR PATROLI-01 (B 9042 PQA) oleh Budi Hartono · Odometer 42.810 km', '{}', todayAt(13, 5));
  insertAudit.run('usr-danru-01', 'GATE_CHECKIN', 'gate_checkins', 'chkin-01', 'Check-In QR PATROLI-02 (B 9045 PQA) kondisi BAIK · Jarak tempuh 62 km', '{}', todayAt(10, 42));
}
