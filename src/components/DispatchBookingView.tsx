import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  QrCode,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  ConflictCheckResult,
  DispatchRequest,
  DispatchStatus,
  Unit,
  User,
  Vehicle,
} from '../types/simPatroli';
import { DispatchStatusLabel, VehicleStatusLabel } from './StatusText';

interface DispatchBookingViewProps {
  vehicles: Vehicle[];
  units: Unit[];
  users: User[];
  dispatches: DispatchRequest[];
  currentUserId: string;
  onRefresh: () => Promise<void>;
  onOpenGateQr: (qrCode: string) => void;
}

function defaultWindow() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 3);
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  };
  return { dep: toLocal(start), ret: toLocal(end) };
}

export function DispatchBookingView({
  vehicles,
  units,
  users,
  dispatches,
  currentUserId,
  onRefresh,
  onOpenGateQr,
}: DispatchBookingViewProps) {
  const initialTimes = defaultWindow();
  const [sptNumber, setSptNumber] = useState(
    `SPT/${String(Math.floor(100 + Math.random() * 899))}/TRANTIB/XI/2026`
  );
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [driverId, setDriverId] = useState(
    users.find((u) => u.role_code === 'PENGEMUDI')?.id || users[0]?.id || ''
  );
  const [missionTitle, setMissionTitle] = useState('');
  const [destinationArea, setDestinationArea] = useState('');
  const [personnelCount, setPersonnelCount] = useState(4);
  const [plannedDeparture, setPlannedDeparture] = useState(initialTimes.dep);
  const [plannedReturn, setPlannedReturn] = useState(initialTimes.ret);
  const [autoApprove, setAutoApprove] = useState(true);

  const [conflictState, setConflictState] = useState<ConflictCheckResult | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | DispatchStatus>('ALL');

  const drivers = users.filter((u) => u.role_code === 'PENGEMUDI');
  const driverList = drivers.length > 0 ? drivers : users;

  useEffect(() => {
    if (!vehicleId && vehicles.length > 0) setVehicleId(vehicles[0].id);
  }, [vehicles, vehicleId]);

  useEffect(() => {
    if (!unitId && units.length > 0) setUnitId(units[0].id);
  }, [units, unitId]);

  // Real-time Conflict Detection check whenever vehicle or time window changes
  useEffect(() => {
    if (!vehicleId || !plannedDeparture || !plannedReturn) return;
    if (new Date(plannedReturn) <= new Date(plannedDeparture)) {
      setConflictState({
        hasConflict: true,
        reasons: [
          {
            type: 'SCHEDULE_OVERLAP',
            message: 'Jam estimasi kembali harus lebih akhir daripada jam keberangkatan.',
          },
        ],
        suggestedAlternatives: [],
      });
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingConflict(true);
      try {
        const res = await fetch('/api/dispatches/check-conflict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: vehicleId,
            planned_departure: `${plannedDeparture}:00`,
            planned_return: `${plannedReturn}:00`,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as ConflictCheckResult;
          setConflictState(data);
        }
      } finally {
        setCheckingConflict(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [vehicleId, plannedDeparture, plannedReturn]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/dispatches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spt_number: sptNumber,
          vehicle_id: vehicleId,
          requester_id: currentUserId,
          driver_id: driverId,
          unit_id: unitId,
          mission_title: missionTitle,
          destination_area: destinationArea,
          personnel_count: personnelCount,
          planned_departure: `${plannedDeparture}:00`,
          planned_return: `${plannedReturn}:00`,
          auto_approve: autoApprove,
          actor_id: currentUserId,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        if (payload.conflict) {
          setConflictState(payload.conflict);
        }
        setFeedback({
          type: 'error',
          message: payload.error || 'Gagal menyimpan pengajuan penugasan.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        message: `SPT ${sptNumber} berhasil diterbitkan${
          autoApprove ? ' dan disetujui untuk Check-Out Gerbang QR.' : ' (menunggu persetujuan).'
        }`,
      });
      setSptNumber(
        `SPT/${String(Math.floor(100 + Math.random() * 899))}/TRANTIB/XI/2026`
      );
      setMissionTitle('');
      setDestinationArea('');
      await onRefresh();
    } catch {
      setFeedback({
        type: 'error',
        message: 'Terjadi kesalahan jaringan saat menghubungi server.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusAction(
    id: string,
    nextStatus: 'APPROVED' | 'REJECTED'
  ) {
    setFeedback(null);
    const res = await fetch(`/api/dispatches/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        actor_id: currentUserId,
        rejection_reason:
          nextStatus === 'REJECTED' ? 'Ditolak oleh Perwira Piket Mako' : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setFeedback({
        type: 'error',
        message: data.error || 'Gagal memperbarui status penugasan.',
      });
      return;
    }
    await onRefresh();
  }

  const filteredDispatches =
    statusFilter === 'ALL'
      ? dispatches
      : dispatches.filter((d) => d.status === statusFilter);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Dispatch Booking Form with Conflict Detection */}
      <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-bold text-[#0F2942]">
            Form Pengajuan Penugasan Armada (SPT)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sistem memvalidasi jadwal bentrok dan status kelayakan kendaraan secara otomatis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="spt-number"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Nomor Surat Perintah Tugas
              </label>
              <input
                id="spt-number"
                type="text"
                required
                value={sptNumber}
                onChange={(e) => setSptNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label
                htmlFor="unit-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Bidang / Satuan Pengaju
              </label>
              <select
                id="unit-select"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942] bg-white"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="vehicle-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pilih Kendaraan Patroli
              </label>
              <select
                id="vehicle-select"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942] bg-white"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.hull_code} ({v.plate_number}) — [{v.status}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="driver-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pengemudi / Awak Utama
              </label>
              <select
                id="driver-select"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942] bg-white"
              >
                {driverList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="mission-title"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Perihal / Jenis Operasi Patroli
            </label>
            <input
              id="mission-title"
              type="text"
              required
              placeholder="Contoh: Patroli Penertiban PKL & Pengamanan Alun-Alun"
              value={missionTitle}
              onChange={(e) => setMissionTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label
                htmlFor="destination-area"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Wilayah / Rute Sasaran
              </label>
              <input
                id="destination-area"
                type="text"
                required
                placeholder="Contoh: Kec. Kota Barat - Kawasan Pasar Induk"
                value={destinationArea}
                onChange={(e) => setDestinationArea(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label
                htmlFor="personnel-count"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Jml. Personel
              </label>
              <input
                id="personnel-count"
                type="number"
                min={1}
                max={30}
                value={personnelCount}
                onChange={(e) => setPersonnelCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="planned-departure"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Rencana Berangkat
              </label>
              <input
                id="planned-departure"
                type="datetime-local"
                required
                value={plannedDeparture}
                onChange={(e) => setPlannedDeparture(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>

            <div>
              <label
                htmlFor="planned-return"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Estimasi Kembali
              </label>
              <input
                id="planned-return"
                type="datetime-local"
                required
                value={plannedReturn}
                onChange={(e) => setPlannedReturn(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          {/* Real-time Conflict Detection Panel */}
          {conflictState && (
            <div
              className={`p-3.5 rounded-md border text-xs ${
                conflictState.hasConflict
                  ? 'bg-red-50/70 border-red-200 text-red-900'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  {conflictState.hasConflict ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      Conflict Detection: Penjadwalan Diblokir
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                      Conflict Detection: Unit & Jadwal Tersedia
                    </>
                  )}
                </span>
                {checkingConflict && (
                  <span className="text-[11px] font-normal text-slate-500">
                    Memeriksa...
                  </span>
                )}
              </div>

              {conflictState.hasConflict ? (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-1 list-disc pl-4">
                    {conflictState.reasons.map((r, idx) => (
                      <li key={idx}>{r.message}</li>
                    ))}
                  </ul>
                  {conflictState.suggestedAlternatives.length > 0 && (
                    <div className="pt-2 border-t border-red-200">
                      <div className="font-semibold text-slate-800 mb-1.5">
                        Rekomendasi Armada Pengganti yang Bebas Bentrok:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {conflictState.suggestedAlternatives.map((alt) => (
                          <button
                            key={alt.id}
                            type="button"
                            onClick={() => setVehicleId(alt.id)}
                            className="px-2.5 py-1 text-[11px] font-mono font-semibold bg-white border border-slate-300 text-[#0F2942] rounded hover:border-[#0F2942] cursor-pointer"
                          >
                            Gunakan {alt.hull_code} ({alt.plate_number})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-emerald-800">
                  Tidak ada tumpang tindih jadwal atau tiket pemeliharaan aktif pada rentang waktu yang dipilih.
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="rounded border-slate-300 text-[#0F2942] focus:ring-[#0F2942]"
            />
            <span>
              Setujui langsung sebagai Perwira Piket (terbitkan QR Gerbang Mako)
            </span>
          </label>

          {feedback && (
            <div
              className={`p-3 rounded border text-xs flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || Boolean(conflictState?.hasConflict)}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {submitting
              ? 'Memproses Penugasan...'
              : conflictState?.hasConflict
              ? 'Selesaikan Konflik Jadwal / Unit Terlebih Dahulu'
              : 'Simpan & Terbitkan SPT Penugasan'}
          </button>
        </form>
      </section>

      {/* Right: Dispatch Queue & Approval Table */}
      <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#0F2942]">
              Daftar & Antrean Penugasan Armada
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Otorisasi Perwira Piket dan akses cepat QR Check-Out / Check-In.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
            {(
              [
                ['ALL', 'Semua'],
                ['PENDING', 'Pending'],
                ['APPROVED', 'Disetujui'],
                ['IN_PROGRESS', 'Patroli'],
                ['COMPLETED', 'Selesai'],
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
        </div>

        <div className="divide-y divide-slate-100">
          {filteredDispatches.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Tidak ada data penugasan pada filter status ini.
            </div>
          ) : (
            filteredDispatches.map((d) => (
              <div
                key={d.id}
                className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0F2942]">
                        {d.spt_number}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {d.hull_code} ({d.plate_number})
                      </span>
                    </div>
                    <h3 className="font-display font-semibold text-sm text-slate-900 mt-1">
                      {d.mission_title}
                    </h3>
                  </div>

                  <DispatchStatusLabel status={d.status} />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>Bidang: {d.unit_name}</span>
                  <span>Pengemudi: {d.driver_name}</span>
                  <span>Sasaran: {d.destination_area}</span>
                  <span className="font-mono tabular-nums">
                    Jadwal: {d.planned_departure.slice(0, 10)}{' '}
                    {d.planned_departure.slice(11, 16)}–
                    {d.planned_return.slice(11, 16)}
                  </span>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                    <span>QR: {d.qr_dispatch_code}</span>
                    {d.vehicle_status && (
                      <>
                        <span>·</span>
                        <VehicleStatusLabel status={d.vehicle_status} />
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {d.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStatusAction(d.id, 'REJECTED')}
                          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusAction(d.id, 'APPROVED')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded hover:bg-emerald-800 cursor-pointer"
                        >
                          Setujui SPT
                        </button>
                      </>
                    )}
                    {(d.status === 'APPROVED' || d.status === 'IN_PROGRESS') && (
                      <button
                        type="button"
                        onClick={() => onOpenGateQr(d.qr_dispatch_code)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5 text-amber-400" />
                        {d.status === 'APPROVED'
                          ? 'Proses Check-Out QR'
                          : 'Proses Check-In QR'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
