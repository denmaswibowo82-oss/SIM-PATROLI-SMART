import {
  CalendarPlus,
  Database,
  FileText,
  LayoutDashboard,
  QrCode,
  Wrench,
} from 'lucide-react';
import type { User } from '../types/simPatroli';

export type NavTab =
  | 'dashboard'
  | 'dispatch'
  | 'gate-qr'
  | 'maintenance'
  | 'daily-report'
  | 'architecture';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  users: User[];
  currentUserId: string;
  onChangeUser: (userId: string) => void;
  pendingCount: number;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard Operasional', icon: LayoutDashboard },
  { id: 'dispatch', label: 'Penugasan & Booking', icon: CalendarPlus },
  { id: 'gate-qr', label: 'Gerbang Mako QR', icon: QrCode },
  { id: 'maintenance', label: 'Pemeliharaan Armada', icon: Wrench },
  { id: 'daily-report', label: 'Laporan Piket Harian', icon: FileText },
  { id: 'architecture', label: 'Arsitektur & SQL', icon: Database },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  users,
  currentUserId,
  onChangeUser,
  pendingCount,
}: SidebarProps) {
  const activeUser = users.find((u) => u.id === currentUserId) || users[0];

  return (
    <aside className="no-print w-full lg:w-[264px] shrink-0 bg-[#0F2942] text-slate-100 flex flex-col border-b lg:border-b-0 lg:border-r border-[#16395C]">
      <div className="px-5 py-5 border-b border-[#16395C] flex items-center gap-3.5">
        <div className="w-10 h-10 rounded bg-white p-1 shrink-0 flex items-center justify-center overflow-hidden">
          <img
            src="/src/assets/images/satpol_emblem_1794896241877.jpg"
            alt="Lambang Satuan Polisi Pamong Praja"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-sm tracking-tight text-white whitespace-nowrap">
            SIM-PATROLI SMART
          </div>
          <div className="text-[11px] text-amber-400 font-medium truncate">
            Satuan Polisi Pamong Praja
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#16395C] text-white border border-amber-500/40'
                  : 'text-slate-300 hover:bg-[#16395C]/60 hover:text-white border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-amber-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </span>
              {item.id === 'dispatch' && pendingCount > 0 && (
                <span className="font-mono text-[11px] font-semibold text-amber-300 tabular-nums">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="hidden lg:block px-4 py-4 border-t border-[#16395C] bg-[#091A2B]">
        <label
          htmlFor="active-officer-select"
          className="block text-[11px] font-medium text-slate-400 mb-1.5"
        >
          Otoritas Personel Aktif
        </label>
        <select
          id="active-officer-select"
          value={currentUserId}
          onChange={(e) => onChangeUser(e.target.value)}
          className="w-full bg-[#0F2942] border border-[#1E4B77] rounded px-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.role_code})
            </option>
          ))}
        </select>
        {activeUser && (
          <div className="mt-2.5 text-[11px] text-slate-300 leading-relaxed">
            <div className="font-medium text-white truncate">
              {activeUser.role_name}
            </div>
            <div className="font-mono text-[10px] text-slate-400 tabular-nums">
              NIP {activeUser.nip_nrp}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
