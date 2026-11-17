import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { db, initializeDatabase } from './server/db.ts';
import type {
  ConflictCheckResult,
  FuelLevel,
  Vehicle,
} from './src/types/simPatroli.ts';

initializeDatabase();

const app = express();
app.use(express.json());

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function logAudit(
  actorId: string | null,
  action: string,
  entityName: string,
  entityId: string,
  summary: string,
  metadata: Record<string, unknown> = {}
) {
  db.prepare(`
    INSERT INTO audit_logs (actor_id, action, entity_name, entity_id, summary, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actorId, action, entityName, entityId, summary, JSON.stringify(metadata));
}

function evaluateDispatchConflict(
  vehicleId: string,
  plannedDeparture: string,
  plannedReturn: string,
  excludeDispatchId?: string
): ConflictCheckResult {
  const reasons: ConflictCheckResult['reasons'] = [];
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as Vehicle | undefined;

  if (!vehicle) {
    return {
      hasConflict: true,
      reasons: [{ type: 'VEHICLE_UNAVAILABLE', message: 'Kendaraan tidak ditemukan dalam inventaris Mako.' }],
      suggestedAlternatives: [],
    };
  }

  if (vehicle.status === 'MAINTENANCE' || vehicle.status === 'RUSAK_BERAT') {
    reasons.push({
      type: 'VEHICLE_UNAVAILABLE',
      message: `Unit ${vehicle.hull_code} (${vehicle.plate_number}) berstatus ${vehicle.status} dan terkunci dari penugasan.`,
    });
  }

  const openTicket = db.prepare(`
    SELECT ticket_code, title, status FROM maintenance_tickets
    WHERE vehicle_id = ? AND status IN ('OPEN', 'IN_REPAIR')
    LIMIT 1
  `).get(vehicleId) as { ticket_code: string; title: string; status: string } | undefined;

  if (openTicket) {
    reasons.push({
      type: 'MAINTENANCE_OPEN',
      message: `Terdapat tiket pemeliharaan aktif ${openTicket.ticket_code}: ${openTicket.title} (${openTicket.status}).`,
    });
  }

  // Overlap condition: existing.planned_departure < new.planned_return AND existing.planned_return > new.planned_departure
  const overlapping = db.prepare(`
    SELECT id, spt_number, mission_title, planned_departure, planned_return, status
    FROM dispatch_requests
    WHERE vehicle_id = ?
      AND status IN ('APPROVED', 'IN_PROGRESS')
      AND (? IS NULL OR id != ?)
      AND datetime(planned_departure) < datetime(?)
      AND datetime(planned_return) > datetime(?)
  `).all(
    vehicleId,
    excludeDispatchId ?? null,
    excludeDispatchId ?? null,
    plannedReturn,
    plannedDeparture
  ) as Array<{
    id: string;
    spt_number: string;
    mission_title: string;
    planned_departure: string;
    planned_return: string;
    status: string;
  }>;

  for (const ov of overlapping) {
    reasons.push({
      type: 'SCHEDULE_OVERLAP',
      message: `Bentrok jadwal dengan ${ov.spt_number} (${ov.mission_title}) pada rentang ${ov.planned_departure.slice(11, 16)}–${ov.planned_return.slice(11, 16)}.`,
      conflictingSpt: ov.spt_number,
      conflictingWindow: `${ov.planned_departure} s.d. ${ov.planned_return}`,
    });
  }

  const hasConflict = reasons.length > 0;
  let suggestedAlternatives: Vehicle[] = [];

  if (hasConflict) {
    suggestedAlternatives = db.prepare(`
      SELECT v.*, u.name as unit_name
      FROM vehicles v
      LEFT JOIN units u ON v.unit_id = u.id
      WHERE v.id != ?
        AND v.status IN ('SIAP', 'PATROLI')
        AND NOT EXISTS (
          SELECT 1 FROM maintenance_tickets mt
          WHERE mt.vehicle_id = v.id AND mt.status IN ('OPEN', 'IN_REPAIR')
        )
        AND NOT EXISTS (
          SELECT 1 FROM dispatch_requests dr
          WHERE dr.vehicle_id = v.id
            AND dr.status IN ('APPROVED', 'IN_PROGRESS')
            AND datetime(dr.planned_departure) < datetime(?)
            AND datetime(dr.planned_return) > datetime(?)
        )
      ORDER BY CASE WHEN v.status = 'SIAP' THEN 0 ELSE 1 END, v.hull_code ASC
    `).all(vehicleId, plannedReturn, plannedDeparture) as unknown as Vehicle[];
  }

  return { hasConflict, reasons, suggestedAlternatives };
}

// ---------------------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------------------

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'SIM-PATROLI SMART' });
});

app.get('/api/bootstrap', (_req: Request, res: Response) => {
  const units = db.prepare('SELECT * FROM units ORDER BY name ASC').all();
  const users = db.prepare(`
    SELECT u.*, r.code as role_code, r.name as role_name, un.name as unit_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    JOIN units un ON u.unit_id = un.id
    WHERE u.is_active = 1
    ORDER BY u.full_name ASC
  `).all();
  res.json({ units, users });
});

app.get('/api/dashboard', (_req: Request, res: Response) => {
  const vehicles = db.prepare(`
    SELECT v.*, u.name as unit_name
    FROM vehicles v
    LEFT JOIN units u ON v.unit_id = u.id
    ORDER BY v.hull_code ASC
  `).all() as unknown as Vehicle[];

  const kpi = {
    total: vehicles.length,
    siap: vehicles.filter((v) => v.status === 'SIAP').length,
    patroli: vehicles.filter((v) => v.status === 'PATROLI').length,
    maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE').length,
    rusakBerat: vehicles.filter((v) => v.status === 'RUSAK_BERAT').length,
    todayMovements: (db.prepare(`
      SELECT COUNT(*) as c FROM gate_checkouts WHERE date(actual_checkout_at) = date('now', 'localtime')
    `).get() as { c: number }).c,
    pendingApprovals: (db.prepare(`
      SELECT COUNT(*) as c FROM dispatch_requests WHERE status = 'PENDING'
    `).get() as { c: number }).c,
  };

  const activeDispatches = db.prepare(`
    SELECT dr.*, v.plate_number, v.hull_code, v.brand_model, v.status as vehicle_status,
           req.full_name as requester_name, drv.full_name as driver_name, drv.nip_nrp as driver_nip,
           un.name as unit_name, apv.full_name as approved_by_name,
           co.id as checkout_id, co.actual_checkout_at, co.odometer_start, co.fuel_level_start,
           ci.id as checkin_id, ci.actual_checkin_at, ci.odometer_end, ci.fuel_level_end, ci.condition_status
    FROM dispatch_requests dr
    JOIN vehicles v ON dr.vehicle_id = v.id
    JOIN users req ON dr.requester_id = req.id
    JOIN users drv ON dr.driver_id = drv.id
    JOIN units un ON dr.unit_id = un.id
    LEFT JOIN users apv ON dr.approved_by = apv.id
    LEFT JOIN gate_checkouts co ON co.dispatch_id = dr.id
    LEFT JOIN gate_checkins ci ON ci.dispatch_id = dr.id
    ORDER BY dr.created_at DESC, dr.planned_departure ASC
  `).all();

  const recentAudits = db.prepare(`
    SELECT al.*, u.full_name as actor_name
    FROM audit_logs al
    LEFT JOIN users u ON al.actor_id = u.id
    ORDER BY al.id DESC
    LIMIT 12
  `).all();

  res.json({ kpi, vehicles, activeDispatches, recentAudits });
});

app.get('/api/vehicles', (_req: Request, res: Response) => {
  const vehicles = db.prepare(`
    SELECT v.*, u.name as unit_name
    FROM vehicles v
    LEFT JOIN units u ON v.unit_id = u.id
    ORDER BY v.hull_code ASC
  `).all();
  res.json({ vehicles });
});

app.get('/api/dispatches', (_req: Request, res: Response) => {
  const dispatches = db.prepare(`
    SELECT dr.*, v.plate_number, v.hull_code, v.brand_model, v.status as vehicle_status,
           req.full_name as requester_name, drv.full_name as driver_name, drv.nip_nrp as driver_nip,
           un.name as unit_name, apv.full_name as approved_by_name,
           co.id as checkout_id, co.actual_checkout_at, co.odometer_start, co.fuel_level_start,
           ci.id as checkin_id, ci.actual_checkin_at, ci.odometer_end, ci.fuel_level_end, ci.condition_status
    FROM dispatch_requests dr
    JOIN vehicles v ON dr.vehicle_id = v.id
    JOIN users req ON dr.requester_id = req.id
    JOIN users drv ON dr.driver_id = drv.id
    JOIN units un ON dr.unit_id = un.id
    LEFT JOIN users apv ON dr.approved_by = apv.id
    LEFT JOIN gate_checkouts co ON co.dispatch_id = dr.id
    LEFT JOIN gate_checkins ci ON ci.dispatch_id = dr.id
    ORDER BY datetime(dr.planned_departure) DESC
  `).all();
  res.json({ dispatches });
});

app.post('/api/dispatches/check-conflict', (req: Request, res: Response) => {
  const { vehicle_id, planned_departure, planned_return, exclude_dispatch_id } = req.body;
  if (!vehicle_id || !planned_departure || !planned_return) {
    res.status(400).json({ error: 'vehicle_id, planned_departure, dan planned_return wajib diisi.' });
    return;
  }
  if (new Date(planned_return) <= new Date(planned_departure)) {
    res.status(400).json({ error: 'Waktu kembali harus lebih akhir dari waktu keberangkatan.' });
    return;
  }
  const result = evaluateDispatchConflict(vehicle_id, planned_departure, planned_return, exclude_dispatch_id);
  res.json(result);
});

app.post('/api/dispatches', (req: Request, res: Response) => {
  const {
    spt_number,
    vehicle_id,
    requester_id,
    driver_id,
    unit_id,
    mission_title,
    destination_area,
    personnel_count,
    planned_departure,
    planned_return,
    auto_approve,
    actor_id,
  } = req.body;

  if (!spt_number || !vehicle_id || !requester_id || !driver_id || !unit_id || !mission_title || !destination_area || !planned_departure || !planned_return) {
    res.status(400).json({ error: 'Seluruh field wajib penugasan harus dilengkapi.' });
    return;
  }

  if (new Date(planned_return) <= new Date(planned_departure)) {
    res.status(400).json({ error: 'Estimasi kembali harus lebih lambat daripada jadwal berangkat.' });
    return;
  }

  const conflict = evaluateDispatchConflict(vehicle_id, planned_departure, planned_return);
  if (conflict.hasConflict) {
    logAudit(
      actor_id || requester_id,
      'DISPATCH_CONFLICT_BLOCKED',
      'dispatch_requests',
      spt_number,
      `Pengajuan ${spt_number} ditolak otomatis oleh Conflict Detection: ${conflict.reasons.map((r) => r.message).join(' | ')}`,
      { vehicle_id, planned_departure, planned_return }
    );
    res.status(409).json({
      error: 'Konflik Penjadwalan / Status Armada Terdeteksi',
      conflict,
    });
    return;
  }

  const existingSpt = db.prepare('SELECT id FROM dispatch_requests WHERE spt_number = ?').get(spt_number);
  if (existingSpt) {
    res.status(409).json({ error: `Nomor SPT ${spt_number} sudah terdaftar dalam sistem.` });
    return;
  }

  const id = generateId('dsp');
  const qrCode = `SPT-QR-${spt_number.replace(/[^A-Z0-9]/gi, '').slice(-8)}-${Date.now().toString(36).toUpperCase()}`;
  const status = auto_approve ? 'APPROVED' : 'PENDING';
  const approvedBy = auto_approve ? (actor_id || 'usr-piket-01') : null;
  const approvedAt = auto_approve ? new Date().toISOString() : null;

  db.prepare(`
    INSERT INTO dispatch_requests (
      id, spt_number, vehicle_id, requester_id, driver_id, unit_id,
      mission_title, destination_area, personnel_count, planned_departure, planned_return,
      status, approved_by, approved_at, qr_dispatch_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    spt_number.trim(),
    vehicle_id,
    requester_id,
    driver_id,
    unit_id,
    mission_title.trim(),
    destination_area.trim(),
    Number(personnel_count) || 2,
    planned_departure,
    planned_return,
    status,
    approvedBy,
    approvedAt,
    qrCode
  );

  logAudit(
    actor_id || requester_id,
    auto_approve ? 'DISPATCH_APPROVED' : 'DISPATCH_CREATED',
    'dispatch_requests',
    id,
    `${auto_approve ? 'Menyetujui langsung' : 'Mengajukan'} ${spt_number} (${mission_title})`,
    { vehicle_id, planned_departure, planned_return }
  );

  const created = db.prepare('SELECT * FROM dispatch_requests WHERE id = ?').get(id);
  res.status(201).json({ dispatch: created });
});

app.patch('/api/dispatches/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, actor_id, rejection_reason } = req.body as {
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
    actor_id?: string;
    rejection_reason?: string;
  };

  const dispatch = db.prepare('SELECT * FROM dispatch_requests WHERE id = ?').get(id) as
    | { id: string; spt_number: string; vehicle_id: string; planned_departure: string; planned_return: string; status: string }
    | undefined;

  if (!dispatch) {
    res.status(404).json({ error: 'Pengajuan penugasan tidak ditemukan.' });
    return;
  }

  if (status === 'APPROVED') {
    const conflict = evaluateDispatchConflict(
      dispatch.vehicle_id,
      dispatch.planned_departure,
      dispatch.planned_return,
      dispatch.id
    );
    if (conflict.hasConflict) {
      res.status(409).json({
        error: 'Tidak dapat menyetujui SPT karena terdeteksi konflik jadwal atau status kendaraan.',
        conflict,
      });
      return;
    }

    db.prepare(`
      UPDATE dispatch_requests
      SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(actor_id || 'usr-piket-01', id);

    logAudit(actor_id || 'usr-piket-01', 'DISPATCH_APPROVED', 'dispatch_requests', id, `Perwira Piket menyetujui ${dispatch.spt_number}`);
  } else {
    db.prepare(`
      UPDATE dispatch_requests
      SET status = ?, rejection_reason = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(status, rejection_reason || null, id);

    logAudit(actor_id || 'usr-piket-01', `DISPATCH_${status}`, 'dispatch_requests', id, `Status ${dispatch.spt_number} diubah menjadi ${status}`);
  }

  res.json({ ok: true });
});

// QR Resolution Lookup (Supports either SPT QR code OR Vehicle QR token)
app.get('/api/gate/resolve/:qrToken', (req: Request, res: Response) => {
  const { qrToken } = req.params;
  const normalized = qrToken.trim();

  // 1. Try matching dispatch QR code directly
  const byDispatch = db.prepare(`
    SELECT dr.*, v.plate_number, v.hull_code, v.brand_model, v.current_odometer, v.current_fuel, v.status as vehicle_status,
           v.qr_token as vehicle_qr_token, drv.full_name as driver_name, un.name as unit_name,
           co.id as checkout_id, co.actual_checkout_at, co.odometer_start, co.fuel_level_start
    FROM dispatch_requests dr
    JOIN vehicles v ON dr.vehicle_id = v.id
    JOIN users drv ON dr.driver_id = drv.id
    JOIN units un ON dr.unit_id = un.id
    LEFT JOIN gate_checkouts co ON co.dispatch_id = dr.id
    WHERE dr.qr_dispatch_code = ? OR dr.spt_number = ?
    LIMIT 1
  `).get(normalized, normalized) as Record<string, unknown> | undefined;

  if (byDispatch) {
    const mode = byDispatch.status === 'IN_PROGRESS' ? 'CHECKIN' : byDispatch.status === 'APPROVED' ? 'CHECKOUT' : 'READONLY';
    res.json({ mode, dispatch: byDispatch });
    return;
  }

  // 2. Try matching vehicle sticker QR token (find active IN_PROGRESS or next APPROVED dispatch)
  const byVehicle = db.prepare(`
    SELECT dr.*, v.plate_number, v.hull_code, v.brand_model, v.current_odometer, v.current_fuel, v.status as vehicle_status,
           v.qr_token as vehicle_qr_token, drv.full_name as driver_name, un.name as unit_name,
           co.id as checkout_id, co.actual_checkout_at, co.odometer_start, co.fuel_level_start
    FROM vehicles v
    JOIN dispatch_requests dr ON dr.vehicle_id = v.id
    JOIN users drv ON dr.driver_id = drv.id
    JOIN units un ON dr.unit_id = un.id
    LEFT JOIN gate_checkouts co ON co.dispatch_id = dr.id
    WHERE (v.qr_token = ? OR v.hull_code = ? OR v.plate_number = ?)
      AND dr.status IN ('IN_PROGRESS', 'APPROVED')
    ORDER BY CASE WHEN dr.status = 'IN_PROGRESS' THEN 0 ELSE 1 END, datetime(dr.planned_departure) ASC
    LIMIT 1
  `).get(normalized, normalized, normalized) as Record<string, unknown> | undefined;

  if (byVehicle) {
    const mode = byVehicle.status === 'IN_PROGRESS' ? 'CHECKIN' : 'CHECKOUT';
    res.json({ mode, dispatch: byVehicle });
    return;
  }

  res.status(404).json({ error: `Kode QR "${normalized}" tidak cocok dengan SPT aktif atau armada yang dijadwalkan.` });
});

app.post('/api/gate/checkout', (req: Request, res: Response) => {
  const {
    dispatch_id,
    guard_officer_id,
    odometer_start,
    fuel_level_start,
    lights_siren_ok,
    tires_body_ok,
    documents_ok,
    checkout_notes,
    qr_scanned_token,
  } = req.body as {
    dispatch_id: string;
    guard_officer_id: string;
    odometer_start: number;
    fuel_level_start: FuelLevel;
    lights_siren_ok: boolean;
    tires_body_ok: boolean;
    documents_ok: boolean;
    checkout_notes?: string;
    qr_scanned_token: string;
  };

  const dispatch = db.prepare(`
    SELECT dr.*, v.plate_number, v.hull_code, v.current_odometer, v.status as vehicle_status
    FROM dispatch_requests dr
    JOIN vehicles v ON dr.vehicle_id = v.id
    WHERE dr.id = ?
  `).get(dispatch_id) as
    | { id: string; spt_number: string; vehicle_id: string; driver_id: string; status: string; plate_number: string; hull_code: string; current_odometer: number; vehicle_status: string }
    | undefined;

  if (!dispatch) {
    res.status(404).json({ error: 'SPT penugasan tidak ditemukan.' });
    return;
  }
  if (dispatch.status !== 'APPROVED') {
    res.status(400).json({ error: `SPT ${dispatch.spt_number} berstatus ${dispatch.status}, tidak dapat Check-Out.` });
    return;
  }
  if (dispatch.vehicle_status !== 'SIAP') {
    res.status(409).json({ error: `Unit ${dispatch.hull_code} berstatus ${dispatch.vehicle_status}, belum kembali atau sedang maintenance.` });
    return;
  }

  const odo = Number(odometer_start);
  if (Number.isNaN(odo) || odo < dispatch.current_odometer) {
    res.status(400).json({ error: `Odometer keluar (${odo}) tidak boleh lebih kecil dari odometer terakhir (${dispatch.current_odometer} km).` });
    return;
  }

  const checkoutId = generateId('chkout');
  const nowIso = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO gate_checkouts (
        id, dispatch_id, vehicle_id, guard_officer_id, driver_id, actual_checkout_at,
        odometer_start, fuel_level_start, lights_siren_ok, tires_body_ok, documents_ok,
        checkout_notes, qr_scanned_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      checkoutId,
      dispatch.id,
      dispatch.vehicle_id,
      guard_officer_id || 'usr-danru-01',
      dispatch.driver_id,
      nowIso,
      odo,
      fuel_level_start,
      lights_siren_ok ? 1 : 0,
      tires_body_ok ? 1 : 0,
      documents_ok ? 1 : 0,
      checkout_notes || null,
      qr_scanned_token || dispatch.spt_number
    );

    db.prepare(`
      UPDATE dispatch_requests SET status = 'IN_PROGRESS', updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(dispatch.id);

    db.prepare(`
      UPDATE vehicles
      SET status = 'PATROLI', current_odometer = ?, current_fuel = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(odo, fuel_level_start, dispatch.vehicle_id);

    logAudit(
      guard_officer_id || 'usr-danru-01',
      'GATE_CHECKOUT',
      'gate_checkouts',
      checkoutId,
      `Check-Out QR ${dispatch.hull_code} (${dispatch.plate_number}) · ${dispatch.spt_number} · Odo ${odo.toLocaleString('id-ID')} km · BBM ${fuel_level_start}`
    );

    db.exec('COMMIT');
    res.status(201).json({ checkoutId, actual_checkout_at: nowIso });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/gate/checkin', (req: Request, res: Response) => {
  const {
    dispatch_id,
    guard_officer_id,
    odometer_end,
    fuel_level_end,
    condition_status,
    damage_notes,
    qr_scanned_token,
  } = req.body as {
    dispatch_id: string;
    guard_officer_id: string;
    odometer_end: number;
    fuel_level_end: FuelLevel;
    condition_status: 'BAIK' | 'PERLU_PERBAIKAN' | 'RUSAK';
    damage_notes?: string;
    qr_scanned_token: string;
  };

  const checkout = db.prepare(`
    SELECT co.*, dr.spt_number, v.plate_number, v.hull_code
    FROM gate_checkouts co
    JOIN dispatch_requests dr ON co.dispatch_id = dr.id
    JOIN vehicles v ON co.vehicle_id = v.id
    WHERE co.dispatch_id = ?
  `).get(dispatch_id) as
    | { id: string; dispatch_id: string; vehicle_id: string; odometer_start: number; spt_number: string; plate_number: string; hull_code: string }
    | undefined;

  if (!checkout) {
    res.status(404).json({ error: 'Data Check-Out untuk SPT ini tidak ditemukan.' });
    return;
  }

  const existingCheckin = db.prepare('SELECT id FROM gate_checkins WHERE dispatch_id = ?').get(dispatch_id);
  if (existingCheckin) {
    res.status(409).json({ error: 'Kendaraan pada SPT ini sudah melakukan Check-In.' });
    return;
  }

  const odoEnd = Number(odometer_end);
  if (Number.isNaN(odoEnd) || odoEnd < checkout.odometer_start) {
    res.status(400).json({ error: `Odometer masuk (${odoEnd}) tidak boleh lebih kecil dari odometer keluar (${checkout.odometer_start} km).` });
    return;
  }

  const checkinId = generateId('chkin');
  const nowIso = new Date().toISOString();
  const nextVehicleStatus = condition_status === 'BAIK' ? 'SIAP' : 'MAINTENANCE';

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO gate_checkins (
        id, checkout_id, dispatch_id, vehicle_id, guard_officer_id, actual_checkin_at,
        odometer_end, fuel_level_end, condition_status, damage_notes, qr_scanned_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      checkinId,
      checkout.id,
      dispatch_id,
      checkout.vehicle_id,
      guard_officer_id || 'usr-danru-01',
      nowIso,
      odoEnd,
      fuel_level_end,
      condition_status,
      damage_notes || null,
      qr_scanned_token || checkout.spt_number
    );

    db.prepare(`
      UPDATE dispatch_requests SET status = 'COMPLETED', updated_at = datetime('now', 'localtime') WHERE id = ?
    `).run(dispatch_id);

    db.prepare(`
      UPDATE vehicles
      SET status = ?, current_odometer = ?, current_fuel = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(nextVehicleStatus, odoEnd, fuel_level_end, checkout.vehicle_id);

    if (condition_status !== 'BAIK') {
      const ticketId = generateId('mnt');
      const ticketCode = `MNT-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 899))}`;
      db.prepare(`
        INSERT INTO maintenance_tickets (
          id, ticket_code, vehicle_id, reported_by, title, description, severity, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')
      `).run(
        ticketId,
        ticketCode,
        checkout.vehicle_id,
        guard_officer_id || 'usr-danru-01',
        `Temuan Check-In Gerbang Mako (${condition_status})`,
        damage_notes || `Dilaporkan pada saat Check-In SPT ${checkout.spt_number}.`,
        condition_status === 'RUSAK' ? 'BERAT' : 'SEDANG'
      );
    }

    const distance = odoEnd - checkout.odometer_start;
    logAudit(
      guard_officer_id || 'usr-danru-01',
      'GATE_CHECKIN',
      'gate_checkins',
      checkinId,
      `Check-In QR ${checkout.hull_code} (${checkout.plate_number}) · Kondisi ${condition_status} · Tempuh ${distance} km · BBM ${fuel_level_end}`
    );

    db.exec('COMMIT');
    res.status(201).json({ checkinId, distanceKm: distance, vehicleStatus: nextVehicleStatus });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

// Maintenance endpoints
app.get('/api/maintenance', (_req: Request, res: Response) => {
  const tickets = db.prepare(`
    SELECT mt.*, v.plate_number, v.hull_code, v.brand_model, u.full_name as reporter_name
    FROM maintenance_tickets mt
    JOIN vehicles v ON mt.vehicle_id = v.id
    JOIN users u ON mt.reported_by = u.id
    ORDER BY CASE WHEN mt.status = 'RESOLVED' THEN 1 ELSE 0 END, mt.created_at DESC
  `).all();
  res.json({ tickets });
});

app.post('/api/maintenance', (req: Request, res: Response) => {
  const { vehicle_id, reported_by, title, description, severity, workshop_name, estimated_ready } = req.body;
  if (!vehicle_id || !title || !description) {
    res.status(400).json({ error: 'Kendaraan, judul kerusakan, dan deskripsi wajib diisi.' });
    return;
  }

  const id = generateId('mnt');
  const ticketCode = `MNT-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 899))}`;

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO maintenance_tickets (
        id, ticket_code, vehicle_id, reported_by, title, description, severity, status, workshop_name, estimated_ready
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_REPAIR', ?, ?)
    `).run(
      id,
      ticketCode,
      vehicle_id,
      reported_by || 'usr-danru-01',
      title,
      description,
      severity || 'SEDANG',
      workshop_name || null,
      estimated_ready || null
    );

    db.prepare(`UPDATE vehicles SET status = 'MAINTENANCE', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(vehicle_id);
    logAudit(reported_by || 'usr-danru-01', 'MAINTENANCE_OPENED', 'maintenance_tickets', id, `Tiket ${ticketCode}: ${title}`);
    db.exec('COMMIT');
    res.status(201).json({ id, ticket_code: ticketCode });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

app.patch('/api/maintenance/:id/resolve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { actor_id } = req.body as { actor_id?: string };

  const ticket = db.prepare('SELECT * FROM maintenance_tickets WHERE id = ?').get(id) as
    | { id: string; ticket_code: string; vehicle_id: string }
    | undefined;

  if (!ticket) {
    res.status(404).json({ error: 'Tiket maintenance tidak ditemukan.' });
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE maintenance_tickets
      SET status = 'RESOLVED', resolved_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(id);

    // Check if any other open tickets remain for this vehicle
    const remaining = db.prepare(`
      SELECT COUNT(*) as c FROM maintenance_tickets WHERE vehicle_id = ? AND status IN ('OPEN', 'IN_REPAIR')
    `).get(ticket.vehicle_id) as { c: number };

    if (remaining.c === 0) {
      db.prepare(`UPDATE vehicles SET status = 'SIAP', updated_at = datetime('now', 'localtime') WHERE id = ?`).run(ticket.vehicle_id);
    }

    logAudit(actor_id || 'usr-piket-01', 'MAINTENANCE_RESOLVED', 'maintenance_tickets', id, `Tiket ${ticket.ticket_code} diselesaikan; armada kembali SIAP.`);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

// Daily Duty Report (Laporan Piket Harian / Berita Acara)
app.get('/api/reports/daily', (req: Request, res: Response) => {
  const dateParam = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  const vehicles = db.prepare('SELECT status FROM vehicles').all() as Array<{ status: string }>;
  const fleetSummary = {
    total: vehicles.length,
    siap: vehicles.filter((v) => v.status === 'SIAP').length,
    patroli: vehicles.filter((v) => v.status === 'PATROLI').length,
    maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE' || v.status === 'RUSAK_BERAT').length,
  };

  const movements = db.prepare(`
    SELECT
      dr.id as dispatch_id,
      dr.spt_number,
      v.hull_code,
      v.plate_number,
      v.brand_model,
      un.name as unit_name,
      drv.full_name as driver_name,
      dr.mission_title,
      dr.destination_area,
      co.actual_checkout_at,
      ci.actual_checkin_at,
      co.odometer_start,
      ci.odometer_end,
      CASE WHEN ci.odometer_end IS NOT NULL AND co.odometer_start IS NOT NULL THEN (ci.odometer_end - co.odometer_start) ELSE NULL END as distance_km,
      co.fuel_level_start,
      ci.fuel_level_end,
      ci.condition_status,
      dr.status as dispatch_status
    FROM dispatch_requests dr
    JOIN vehicles v ON dr.vehicle_id = v.id
    JOIN units un ON dr.unit_id = un.id
    JOIN users drv ON dr.driver_id = drv.id
    LEFT JOIN gate_checkouts co ON co.dispatch_id = dr.id
    LEFT JOIN gate_checkins ci ON ci.dispatch_id = dr.id
    WHERE substr(dr.planned_departure, 1, 10) = ?
       OR substr(co.actual_checkout_at, 1, 10) = ?
    ORDER BY COALESCE(co.actual_checkout_at, dr.planned_departure) ASC
  `).all(dateParam, dateParam) as Array<{ distance_km: number | null }>;

  const totalDistanceKm = movements.reduce((sum, row) => sum + (row.distance_km ?? 0), 0);

  const maintenanceNotes = db.prepare(`
    SELECT mt.*, v.plate_number, v.hull_code, v.brand_model, u.full_name as reporter_name
    FROM maintenance_tickets mt
    JOIN vehicles v ON mt.vehicle_id = v.id
    JOIN users u ON mt.reported_by = u.id
    WHERE mt.status IN ('OPEN', 'IN_REPAIR')
    ORDER BY mt.created_at DESC
  `).all();

  const perwiraPiket = db.prepare("SELECT * FROM users WHERE id = 'usr-piket-01'").get();
  const danruPenjagaan = db.prepare("SELECT * FROM users WHERE id = 'usr-danru-01'").get();

  const cleanDate = dateParam.replace(/-/g, '');
  res.json({
    reportDate: dateParam,
    reportNumber: `BA-PIKET/${cleanDate}/SATPOLPP`,
    shiftLabel: 'Regu Piket 1x24 Jam (07.00 – 07.00 WIB)',
    fleetSummary,
    movements,
    totalDistanceKm,
    maintenanceNotes,
    officers: {
      perwiraPiket,
      danruPenjagaan,
    },
  });
});

app.get('/api/architecture/schema', (_req: Request, res: Response) => {
  const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
  const sql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '';
  res.json({ sql });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIM-PATROLI SMART server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
