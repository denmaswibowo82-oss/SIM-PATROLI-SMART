import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, QrCode, RefreshCw } from 'lucide-react';
import type {
  DashboardResponse,
  DispatchRequest,
  MaintenanceTicket,
  Unit,
  User,
} from './types/simPatroli';
import { Sidebar, type NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { DispatchBookingView } from './components/DispatchBookingView';
import { GateQrTerminalView } from './components/GateQrTerminalView';
import { MaintenanceView } from './components/MaintenanceView';
import { DailyReportView } from './components/DailyReportView';
import { ArchitectureSqlView } from './components/ArchitectureSqlView';

const TAB_TITLES: Record<NavTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard Operasional Armada',
    subtitle: 'Ringkasan kekuatan armada, unit aktif di lapangan, dan jejak audit gerbang Mako.',
  },
  dispatch: {
    title: 'Pengajuan Penugasan & Booking Armada',
    subtitle: 'Penerbitan SPT patroli dengan proteksi deteksi bentrok jadwal dan unit rusak.',
  },
  'gate-qr': {
    title: 'Terminal Gerbang Mako Berbasis QR Code',
    subtitle: 'Pencatatan waktu aktual keluar-masuk, odometer, level BBM, dan inspeksi fisik.',
  },
  maintenance: {
    title: 'Manajemen Pemeliharaan & Perbaikan',
    subtitle: 'Pelaporan kerusakan armada dan sinkronisasi status kelayakan operasi.',
  },
  'daily-report': {
    title: 'Berita Acara Laporan Piket Harian',
    subtitle: 'Dokumen resmi pertanggungjawaban piket siap cetak untuk Perwira Piket & Danru.',
  },
  architecture: {
    title: 'Arsitektur Proyek & Skema PostgreSQL',
    subtitle: 'Struktur kode full-stack serta definisi DDL 9 tabel database SIM-PATROLI SMART.',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dispatches, setDispatches] = useState<DispatchRequest[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState('usr-piket-01');
  const [loading, setLoading] = useState(true);
  const [pendingQrCode, setPendingQrCode] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [bootRes, dashRes, dspRes, mntRes] = await Promise.all([
        fetch('/api/bootstrap'),
        fetch('/api/dashboard'),
        fetch('/api/dispatches'),
        fetch('/api/maintenance'),
      ]);

      if (bootRes.ok) {
        const bootData = await bootRes.json();
        setUnits(bootData.units || []);
        setUsers(bootData.users || []);
      }
      if (dashRes.ok) {
        const dashData = (await dashRes.json()) as DashboardResponse;
        setDashboard(dashData);
      }
      if (dspRes.ok) {
        const dspData = await dspRes.json();
        setDispatches(dspData.dispatches || []);
      }
      if (mntRes.ok) {
        const mntData = await mntRes.json();
        setTickets(mntData.tickets || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function handleOpenGateWithQr(qrToken: string) {
    setPendingQrCode(qrToken);
    setActiveTab('gate-qr');
  }

  const headerMeta = TAB_TITLES[activeTab];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        users={users}
        currentUserId={currentUserId}
        onChangeUser={setCurrentUserId}
        pendingCount={dashboard?.kpi.pendingApprovals ?? 0}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Contextual Breadcrumb/Title on Left, Primary Actions on Right */}
        <header className="no-print bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-500">
              SIM-PATROLI SMART / {headerMeta.title}
            </div>
            <h1 className="font-display text-lg font-bold text-[#0F2942] truncate mt-0.5">
              {headerMeta.title}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
              title="Muat ulang data operasional"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Segarkan
            </button>

            {activeTab !== 'gate-qr' && (
              <button
                type="button"
                onClick={() => setActiveTab('gate-qr')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] rounded hover:bg-[#B45309] cursor-pointer whitespace-nowrap shrink-0"
              >
                <QrCode className="w-3.5 h-3.5" />
                Pindai Gerbang QR
              </button>
            )}

            {activeTab !== 'dispatch' && (
              <button
                type="button"
                onClick={() => setActiveTab('dispatch')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer whitespace-nowrap shrink-0"
              >
                <CalendarPlus className="w-3.5 h-3.5 text-amber-400" />
                Ajukan Penugasan
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 md:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              data={dashboard}
              loading={loading}
              onNavigate={setActiveTab}
              onQuickScanQr={handleOpenGateWithQr}
            />
          )}

          {activeTab === 'dispatch' && (
            <DispatchBookingView
              vehicles={dashboard?.vehicles || []}
              units={units}
              users={users}
              dispatches={dispatches}
              currentUserId={currentUserId}
              onRefresh={loadAll}
              onOpenGateQr={handleOpenGateWithQr}
            />
          )}

          {activeTab === 'gate-qr' && (
            <GateQrTerminalView
              dispatches={dispatches}
              currentUserId={currentUserId}
              initialQrCode={pendingQrCode}
              onClearInitialQr={() => setPendingQrCode(null)}
              onRefresh={loadAll}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceView
              tickets={tickets}
              vehicles={dashboard?.vehicles || []}
              currentUserId={currentUserId}
              onRefresh={loadAll}
            />
          )}

          {activeTab === 'daily-report' && <DailyReportView />}

          {activeTab === 'architecture' && <ArchitectureSqlView />}
        </main>
      </div>
    </div>
  );
}
