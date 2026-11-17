export type VehicleCategory =
  | 'MOBIL_PATROLI'
  | 'TRUK_DALMAS'
  | 'MOTOR_PATROLI'
  | 'MOBIL_OPERASIONAL';

export type VehicleStatus = 'SIAP' | 'PATROLI' | 'MAINTENANCE' | 'RUSAK_BERAT';

export type DispatchStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type FuelLevel = 'E' | '1/4' | '1/2' | '3/4' | 'FULL';

export type MaintenanceSeverity = 'RINGAN' | 'SEDANG' | 'BERAT' | 'DARURAT';

export type MaintenanceStatus = 'OPEN' | 'IN_REPAIR' | 'RESOLVED';

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  head_name: string;
}

export interface User {
  id: string;
  nip_nrp: string;
  full_name: string;
  rank_title: string;
  role_id: string;
  role_code?: string;
  role_name?: string;
  unit_id: string;
  unit_name?: string;
  phone: string;
  is_active: boolean;
}

export interface Vehicle {
  id: string;
  plate_number: string;
  hull_code: string;
  brand_model: string;
  category: VehicleCategory;
  manufacture_year: number;
  qr_token: string;
  current_odometer: number;
  current_fuel: FuelLevel;
  status: VehicleStatus;
  unit_id: string | null;
  unit_name?: string;
  stnk_valid_until: string;
  kir_valid_until: string | null;
  image_url: string | null;
}

export interface DispatchRequest {
  id: string;
  spt_number: string;
  vehicle_id: string;
  plate_number?: string;
  hull_code?: string;
  brand_model?: string;
  vehicle_status?: VehicleStatus;
  requester_id: string;
  requester_name?: string;
  driver_id: string;
  driver_name?: string;
  driver_nip?: string;
  unit_id: string;
  unit_name?: string;
  mission_title: string;
  destination_area: string;
  personnel_count: number;
  planned_departure: string;
  planned_return: string;
  status: DispatchStatus;
  approved_by: string | null;
  approved_by_name?: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  qr_dispatch_code: string;
  created_at: string;
  checkout_id?: string | null;
  actual_checkout_at?: string | null;
  odometer_start?: number | null;
  fuel_level_start?: FuelLevel | null;
  checkin_id?: string | null;
  actual_checkin_at?: string | null;
  odometer_end?: number | null;
  fuel_level_end?: FuelLevel | null;
  condition_status?: string | null;
}

export interface MaintenanceTicket {
  id: string;
  ticket_code: string;
  vehicle_id: string;
  plate_number?: string;
  hull_code?: string;
  brand_model?: string;
  reported_by: string;
  reporter_name?: string;
  title: string;
  description: string;
  severity: MaintenanceSeverity;
  status: MaintenanceStatus;
  workshop_name: string | null;
  estimated_ready: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_name?: string | null;
  action: string;
  entity_name: string;
  entity_id: string;
  summary: string;
  metadata: string;
  created_at: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  reasons: Array<{
    type: 'VEHICLE_UNAVAILABLE' | 'MAINTENANCE_OPEN' | 'SCHEDULE_OVERLAP';
    message: string;
    conflictingSpt?: string;
    conflictingWindow?: string;
  }>;
  suggestedAlternatives: Vehicle[];
}

export interface DashboardResponse {
  kpi: {
    total: number;
    siap: number;
    patroli: number;
    maintenance: number;
    rusakBerat: number;
    todayMovements: number;
    pendingApprovals: number;
  };
  vehicles: Vehicle[];
  activeDispatches: DispatchRequest[];
  recentAudits: AuditLog[];
}

export interface DailyReportRow {
  dispatch_id: string;
  spt_number: string;
  hull_code: string;
  plate_number: string;
  brand_model: string;
  unit_name: string;
  driver_name: string;
  mission_title: string;
  destination_area: string;
  actual_checkout_at: string | null;
  actual_checkin_at: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_km: number | null;
  fuel_level_start: FuelLevel | null;
  fuel_level_end: FuelLevel | null;
  condition_status: string | null;
  dispatch_status: DispatchStatus;
}

export interface DailyReportResponse {
  reportDate: string;
  reportNumber: string;
  shiftLabel: string;
  fleetSummary: {
    total: number;
    siap: number;
    patroli: number;
    maintenance: number;
  };
  movements: DailyReportRow[];
  totalDistanceKm: number;
  maintenanceNotes: MaintenanceTicket[];
  officers: {
    perwiraPiket: User;
    danruPenjagaan: User;
  };
}
