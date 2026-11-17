import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Navigation,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { DispatchStatus, FuelLevel, VehicleStatus } from '../types/simPatroli';

export function VehicleStatusLabel({ status }: { status: VehicleStatus }) {
  switch (status) {
    case 'SIAP':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Siap Operasi
        </span>
      );
    case 'PATROLI':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2942] whitespace-nowrap">
          <Navigation className="w-3.5 h-3.5 shrink-0 text-[#D97706]" />
          Sedang Patroli
        </span>
      );
    case 'MAINTENANCE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Wrench className="w-3.5 h-3.5 shrink-0" />
          Maintenance
        </span>
      );
    case 'RUSAK_BERAT':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Rusak Berat
        </span>
      );
  }
}

export function DispatchStatusLabel({ status }: { status: DispatchStatus }) {
  switch (status) {
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Disetujui (Siap Keluar)
        </span>
      );
    case 'IN_PROGRESS':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2942] whitespace-nowrap">
          <Navigation className="w-3.5 h-3.5 shrink-0 text-[#D97706]" />
          Di Lapangan
        </span>
      );
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Menunggu Persetujuan
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          Selesai Kembali
        </span>
      );
    case 'REJECTED':
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          {status === 'REJECTED' ? 'Ditolak' : 'Dibatalkan'}
        </span>
      );
  }
}

const FUEL_SEGMENTS: Record<FuelLevel, number> = {
  E: 1,
  '1/4': 2,
  '1/2': 3,
  '3/4': 4,
  FULL: 5,
};

export function FuelIndicator({ level }: { level: FuelLevel }) {
  const filled = FUEL_SEGMENTS[level] ?? 3;
  const barColor =
    filled <= 2 ? 'bg-amber-600' : filled === 1 ? 'bg-red-600' : 'bg-[#0F2942]';

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((idx) => (
          <span
            key={idx}
            className={`w-2 h-2.5 rounded-[1px] ${
              idx <= filled ? barColor : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-xs font-medium text-slate-700 tabular-nums">
        {level}
      </span>
    </div>
  );
}
