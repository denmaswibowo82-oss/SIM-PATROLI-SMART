import { useEffect, useState } from 'react';
import { Check, Copy, Download, FolderTree } from 'lucide-react';

const PROJECT_TREE = `sim-patroli-smart/
├── database/
│   └── schema.sql                 # DDL PostgreSQL lengkap (9 tabel, ENUM, GIST Exclusion, Trigger)
├── server/
│   └── db.ts                      # SQLite persistence layer & seed operasional Satpol PP
├── server.ts                      # Express API Server + Vite Middleware (Port 3000)
├── src/
│   ├── types/
│   │   └── simPatroli.ts          # Kontrak tipe TypeScript 9 entitas & DTO API
│   ├── components/
│   │   ├── Sidebar.tsx            # Navigasi samping Navy #0F2942 & switch otoritas piket
│   │   ├── StatusText.tsx         # Indikator status armada & segmen level BBM
│   │   ├── DashboardView.tsx      # KPI kekuatan armada, tabel/grid unit, modal QR stiker
│   │   ├── DispatchBookingView.tsx# Form pengajuan SPT + mesin Conflict Detection
│   │   ├── GateQrTerminalView.tsx # Terminal Check-Out & Check-In Gerbang Mako berbasis QR
│   │   ├── MaintenanceView.tsx    # Pengelolaan tiket kerusakan & penguncian unit
│   │   ├── DailyReportView.tsx    # Berita Acara Laporan Piket Harian siap cetak A4
│   │   └── ArchitectureSqlView.tsx# Dokumentasi arsitektur & skema PostgreSQL
│   ├── App.tsx                    # Root workspace & state orchestration
│   └── index.css                  # Konfigurasi Tailwind v4, font & @media print
└── package.json`;

const ENTITIES_SUMMARY = [
  { name: 'roles', desc: 'Master hak akses RBAC (PERWIRA_PIKET, DANRU_JAGA, KANIT_BIDANG, PENGEMUDI).' },
  { name: 'units', desc: 'Satuan kerja/bidang Satpol PP (TRANTIBUM, GAKDA, LINMAS, PTI).' },
  { name: 'users', desc: 'Profil personel & pejabat piket lengkap dengan NIP/NRP dan pangkat.' },
  { name: 'vehicles', desc: 'Inventaris kendaraan patroli, kode lambung, QR token, odometer, dan status.' },
  { name: 'dispatch_requests', desc: 'Pengajuan SPT & booking jadwal dengan constraint EXCLUDE USING GIST anti-bentrok.' },
  { name: 'gate_checkouts', desc: 'Rekam waktu keluar Mako aktual, odo awal, BBM awal, dan cek fisik.' },
  { name: 'gate_checkins', desc: 'Rekam waktu kembali aktual, odo akhir, BBM akhir, dan kondisi unit.' },
  { name: 'maintenance_tickets', desc: 'Tiket kerusakan/servis yang otomatis mengunci unit dari penugasan.' },
  { name: 'audit_logs', desc: 'Jejak audit immutable atas seluruh transaksi persetujuan, konflik, dan gerbang.' },
];

export function ArchitectureSqlView() {
  const [sql, setSql] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/architecture/schema')
      .then((r) => r.json())
      .then((d) => setSql(d.sql || ''))
      .catch(() => {});
  }, []);

  async function handleCopy() {
    if (!sql) return;
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!sql) return;
    const blob = new Blob([sql], { type: 'text/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sim_patroli_smart_postgresql.sql';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <FolderTree className="w-4 h-4 text-[#0F2942]" />
            <h2 className="font-display text-base font-bold text-[#0F2942]">
              Struktur Direktori Proyek
            </h2>
          </div>
          <pre className="p-4 bg-[#091A2B] text-slate-100 rounded-md text-[11px] font-mono overflow-x-auto leading-relaxed">
            {PROJECT_TREE}
          </pre>
        </section>

        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="font-display text-base font-bold text-[#0F2942] mb-3">
            Ringkasan 9 Entitas Database Relasional
          </h2>
          <div className="divide-y divide-slate-100">
            {ENTITIES_SUMMARY.map((item) => (
              <div
                key={item.name}
                className="py-2.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 text-xs"
              >
                <span className="font-mono font-bold text-[#0F2942] w-44 shrink-0">
                  {item.name}
                </span>
                <span className="text-slate-600">{item.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#0F2942]">
              Skema Lengkap PostgreSQL (database/schema.sql)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dilengkapi constraint EXCLUDE USING GIST untuk Conflict Detection di level database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Salin SQL
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Unduh .SQL
            </button>
          </div>
        </div>
        <pre className="p-5 bg-[#091A2B] text-slate-100 text-xs font-mono overflow-x-auto max-h-[520px] leading-relaxed">
          {sql || 'Memuat skema PostgreSQL...'}
        </pre>
      </section>
    </div>
  );
}
