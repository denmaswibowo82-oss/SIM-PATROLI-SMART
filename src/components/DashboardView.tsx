import { useState } from 'react';
import {
  ArrowRight,
  CalendarPlus,
  CarFront,
  QrCode,
  ShieldAlert,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { DashboardResponse, Vehicle, VehicleStatus } from '../types/simPatroli';
import {
  DispatchStatusLabel,
  FuelIndicator,
  VehicleStatusLabel,
} from './StatusText';
import type { NavTab } from './Sidebar';

interface DashboardViewProps {
  data: DashboardResponse | null;
  loading: boolean;
  onNavigate: (tab: NavTab) => void;
  onQuickScanQr: (qrToken: string) => void;
}

export function DashboardView({
  data,
  loading,
  onNavigate,
  onQuickScanQr,
}: DashboardViewProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | VehicleStatus>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [qrModalVehicle, setQrModalVehicle] = useState<Vehicle | null>(null);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="h-80 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  const { kpi, vehicles, activeDispatches, recentAudits } = data;
  const filteredVehicles =
    statusFilter === 'ALL'
      ? vehicles
      : vehicles.filter((v) => v.status === statusFilter);

  const readinessRate =
    kpi.total > 0 ? Math.round(((kpi.siap + kpi.patroli) / kpi.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Fleet Readiness Row */}
      <section aria-label="KPI Kekuatan Armada">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Armada Siap Operasi</span>
              <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                SIAP
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold text-[#0F2942] tabular-nums">
                {kpi.siap}
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                dari {kpi.total} unit ({readinessRate}% layak jalan)
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Sedang Patroli Lapangan</span>
              <span className="font-mono text-[#0F2942] font-semibold tabular-nums">
                PATROLI
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold text-[#0F2942] tabular-nums">
                {kpi.patroli}
              </span>
              <span className="text-xs text-slate-500">
                Unit aktif di luar Mako
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Dalam Pemeliharaan</span>
              <span className="font-mono text-[#D97706] font-semibold tabular-nums">
                MAINTENANCE
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold text-[#D97706] tabular-nums">
                {kpi.maintenance + kpi.rusakBerat}
              </span>
              <span className="text-xs text-slate-500">
                Terkunci dari booking jadwal
              </span>
            </div>
          </div>

          <div className="bg-[#0F2942] border border-[#0F2942] rounded-lg p-5 text-white flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span>Pergerakan Gerbang Hari Ini</span>
              <span className="font-mono text-amber-400 font-semibold tabular-nums">
                LOG QR
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold text-white tabular-nums">
                {kpi.todayMovements}
              </span>
              <span className="text-xs text-slate-300 tabular-nums">
                {kpi.pendingApprovals} SPT menunggu persetujuan
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Fleet Readiness Matrix */}
      <section className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#0F2942]">
              Status Kekuatan & Kesiapan Armada Patroli
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau posisi unit, pembacaan odometer terakhir, level BBM, dan token stiker QR Mako.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {(
                [
                  ['ALL', 'Semua'],
                  ['SIAP', 'Siap'],
                  ['PATROLI', 'Patroli'],
                  ['MAINTENANCE', 'Maintenance'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setStatusFilter(code)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === code
                      ? 'bg-white text-[#0F2942] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-[#0F2942] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tabel
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#0F2942] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Visual Unit
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-5">Kode Lambung & Nopol</th>
                  <th className="py-3 px-4">Kendaraan & Bidang</th>
                  <th className="py-3 px-4">Status Armada</th>
                  <th className="py-3 px-4 text-right">Odometer</th>
                  <th className="py-3 px-4">Level BBM</th>
                  <th className="py-3 px-5 text-right">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredVehicles.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-3 px-5">
                      <div className="font-mono font-semibold text-[#0F2942] text-xs">
                        {v.hull_code}
                      </div>
                      <div className="font-mono text-xs text-slate-500 mt-0.5">
                        {v.plate_number}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 text-xs">
                        {v.brand_model}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {v.unit_name || 'Operasional Mako'} · Tahun{' '}
                        <span className="tabular-nums">{v.manufacture_year}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <VehicleStatusLabel status={v.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-800 tabular-nums">
                      {v.current_odometer.toLocaleString('id-ID')} km
                    </td>
                    <td className="py-3 px-4">
                      <FuelIndicator level={v.current_fuel} />
                    </td>
                    <td className="py-3 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQrModalVehicle(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#0F2942]" />
                          Stiker QR
                        </button>
                        {v.status === 'SIAP' && (
                          <button
                            type="button"
                            onClick={() => onNavigate('dispatch')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer whitespace-nowrap"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Tugaskan
                          </button>
                        )}
                        {v.status === 'PATROLI' && (
                          <button
                            type="button"
                            onClick={() => onQuickScanQr(v.qr_token)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#D97706] rounded hover:bg-[#B45309] cursor-pointer whitespace-nowrap"
                          >
                            Check-In QR
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredVehicles.map((v) => (
              <div
                key={v.id}
                className="border border-slate-200 rounded-lg overflow-hidden bg-white flex flex-col"
              >
                <div className="aspect-[16/9] bg-slate-100 relative overflow-hidden">
                  {v.image_url ? (
                    <img
                      src={v.image_url}
                      alt={`${v.hull_code} ${v.brand_model}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                      <CarFront className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#0F2942]">
                        {v.hull_code} · {v.plate_number}
                      </span>
                      <VehicleStatusLabel status={v.status} />
                    </div>
                    <h3 className="font-display font-semibold text-sm text-slate-900 mt-1.5">
                      {v.brand_model}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {v.unit_name || 'Operasional Mako'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-700 tabular-nums">
                      {v.current_odometer.toLocaleString('id-ID')} km
                    </span>
                    <FuelIndicator level={v.current_fuel} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active Dispatches + Audit Log Split */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#0F2942]">
                Daftar Surat Perintah Tugas (SPT) Terkini
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Jadwal keberangkatan dan pergerakan armada yang terverifikasi di Gerbang Mako.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dispatch')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2942] hover:text-[#D97706] cursor-pointer whitespace-nowrap shrink-0"
            >
              Kelola Penugasan
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-5">No. SPT & Armada</th>
                  <th className="py-2.5 px-4">Misi & Tujuan</th>
                  <th className="py-2.5 px-4">Jadwal</th>
                  <th className="py-2.5 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {activeDispatches.slice(0, 6).map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-5">
                      <div className="font-mono font-semibold text-[#0F2942]">
                        {d.spt_number}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {d.hull_code} · {d.plate_number}
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-medium text-slate-900 truncate">
                        {d.mission_title}
                      </div>
                      <div className="text-slate-500 truncate mt-0.5">
                        {d.driver_name} · {d.destination_area}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {d.planned_departure.slice(11, 16)} –{' '}
                      {d.planned_return.slice(11, 16)} WIB
                    </td>
                    <td className="py-3 px-5">
                      <DispatchStatusLabel status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#0F2942]">
                Jejak Audit Sistem
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rekam transaksi otorisasi dan gerbang Mako.
              </p>
            </div>
            <ShieldAlert className="w-4 h-4 text-[#D97706] shrink-0" />
          </div>
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
            {recentAudits.map((log) => (
              <div key={log.id} className="px-5 py-3 text-xs">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="font-mono font-semibold text-[#0F2942]">
                    {log.action}
                  </span>
                  <span className="font-mono tabular-nums">
                    {log.created_at.slice(11, 16)}
                  </span>
                </div>
                <p className="text-slate-700 mt-1 leading-relaxed">
                  {log.summary}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vehicle QR Sticker Modal */}
      {qrModalVehicle && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-sm w-full p-6">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-display font-bold text-base text-[#0F2942]">
                  Stiker Identitas QR Armada
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tempelkan pada kaca depan kiri kendaraan patroli.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalVehicle(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Tutup modal QR"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-5 flex flex-col items-center text-center">
              <div className="p-4 bg-white border border-slate-200 rounded-lg">
                <QRCodeSVG
                  value={qrModalVehicle.qr_token}
                  size={168}
                  level="M"
                  fgColor="#0F2942"
                />
              </div>
              <div className="mt-4 font-mono text-sm font-bold text-[#0F2942]">
                {qrModalVehicle.hull_code} · {qrModalVehicle.plate_number}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {qrModalVehicle.brand_model}
              </div>
              <div className="mt-2 font-mono text-[11px] text-slate-500">
                Token: {qrModalVehicle.qr_token}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const token = qrModalVehicle.qr_token;
                  setQrModalVehicle(null);
                  onQuickScanQr(token);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer"
              >
                Uji Pindai di Gerbang QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
