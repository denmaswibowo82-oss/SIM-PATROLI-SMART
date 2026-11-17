import { useState } from 'react';
import { CheckCircle2, Wrench } from 'lucide-react';
import type {
  MaintenanceSeverity,
  MaintenanceTicket,
  Vehicle,
} from '../types/simPatroli';

interface MaintenanceViewProps {
  tickets: MaintenanceTicket[];
  vehicles: Vehicle[];
  currentUserId: string;
  onRefresh: () => Promise<void>;
}

export function MaintenanceView({
  tickets,
  vehicles,
  currentUserId,
  onRefresh,
}: MaintenanceViewProps) {
  const availableForReport = vehicles.filter((v) => v.status !== 'PATROLI');
  const [vehicleId, setVehicleId] = useState(availableForReport[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<MaintenanceSeverity>('SEDANG');
  const [workshopName, setWorkshopName] = useState('');
  const [estimatedReady, setEstimatedReady] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          reported_by: currentUserId,
          title,
          description,
          severity,
          workshop_name: workshopName,
          estimated_ready: estimatedReady || null,
        }),
      });
      if (res.ok) {
        setTitle('');
        setDescription('');
        setWorkshopName('');
        setEstimatedReady('');
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(id: string) {
    await fetch(`/api/maintenance/${id}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor_id: currentUserId }),
    });
    await onRefresh();
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-bold text-[#0F2942]">
            Buka Tiket Pemeliharaan / Kerusakan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Armada yang memiliki tiket aktif otomatis terkunci dari pengajuan patroli.
          </p>
        </div>

        <form onSubmit={handleCreateTicket} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="mnt-vehicle"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Pilih Kendaraan
            </label>
            <select
              id="mnt-vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:border-[#0F2942]"
            >
              {availableForReport.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.hull_code} ({v.plate_number}) — {v.brand_model}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="mnt-severity"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Tingkat Kerusakan
              </label>
              <select
                id="mnt-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as MaintenanceSeverity)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:border-[#0F2942]"
              >
                <option value="RINGAN">Ringan (Servis Rutin)</option>
                <option value="SEDANG">Sedang</option>
                <option value="BERAT">Berat</option>
                <option value="DARURAT">Darurat</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="mnt-eta"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Estimasi Selesai
              </label>
              <input
                id="mnt-eta"
                type="date"
                value={estimatedReady}
                onChange={(e) => setEstimatedReady(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="mnt-title"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Judul Pekerjaan / Keluhan
            </label>
            <input
              id="mnt-title"
              type="text"
              required
              placeholder="Contoh: Penggantian Aki & Servis Alternator"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label
              htmlFor="mnt-workshop"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Bengkel Rekanan / Lokasi Perbaikan
            </label>
            <input
              id="mnt-workshop"
              type="text"
              placeholder="Contoh: Bengkel Rekanan Pemda"
              value={workshopName}
              onChange={(e) => setWorkshopName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div>
            <label
              htmlFor="mnt-desc"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Rincian Teknis
            </label>
            <textarea
              id="mnt-desc"
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer"
          >
            {submitting ? 'Menyimpan Tiket...' : 'Laporkan & Kunci Unit ke Maintenance'}
          </button>
        </form>
      </section>

      <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-bold text-[#0F2942]">
            Daftar Tiket Pemeliharaan Armada
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Selesaikan tiket setelah unit lulus uji jalan untuk mengembalikan status ke Siap Operasi.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {tickets.map((t) => {
            const isResolved = t.status === 'RESOLVED';
            return (
              <div
                key={t.id}
                className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-[#0F2942]">
                      {t.ticket_code}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono font-semibold text-slate-700">
                      {t.hull_code} ({t.plate_number})
                    </span>
                    <span className="text-slate-400">·</span>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        isResolved ? 'text-emerald-700' : 'text-[#D97706]'
                      }`}
                    >
                      {isResolved ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Wrench className="w-3.5 h-3.5" />
                      )}
                      {t.status} ({t.severity})
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-sm text-slate-900">
                    {t.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {t.description}
                  </p>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    {t.workshop_name && <span>Bengkel: {t.workshop_name}</span>}
                    {t.estimated_ready && (
                      <span className="font-mono">Target Selesai: {t.estimated_ready}</span>
                    )}
                    <span>Pelapor: {t.reporter_name}</span>
                  </div>
                </div>

                {!isResolved && (
                  <button
                    type="button"
                    onClick={() => handleResolve(t.id)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 rounded hover:bg-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Tandai Selesai & Siap
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
