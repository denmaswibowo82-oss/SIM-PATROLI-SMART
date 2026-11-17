import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  QrCode,
  ScanLine,
  XCircle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { DispatchRequest, FuelLevel } from '../types/simPatroli';
import { DispatchStatusLabel } from './StatusText';

interface GateQrTerminalViewProps {
  dispatches: DispatchRequest[];
  currentUserId: string;
  initialQrCode: string | null;
  onClearInitialQr: () => void;
  onRefresh: () => Promise<void>;
}

interface ResolvedGatePayload {
  mode: 'CHECKOUT' | 'CHECKIN' | 'READONLY';
  dispatch: DispatchRequest & {
    current_odometer: number;
    current_fuel: FuelLevel;
    vehicle_qr_token: string;
  };
}

const FUEL_OPTIONS: FuelLevel[] = ['E', '1/4', '1/2', '3/4', 'FULL'];

export function GateQrTerminalView({
  dispatches,
  currentUserId,
  initialQrCode,
  onClearInitialQr,
  onRefresh,
}: GateQrTerminalViewProps) {
  const [qrInput, setQrInput] = useState('');
  const [resolved, setResolved] = useState<ResolvedGatePayload | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Check-Out form states
  const [odometerStart, setOdometerStart] = useState<number>(0);
  const [fuelStart, setFuelStart] = useState<FuelLevel>('FULL');
  const [lightsSirenOk, setLightsSirenOk] = useState(true);
  const [tiresBodyOk, setTiresBodyOk] = useState(true);
  const [documentsOk, setDocumentsOk] = useState(true);
  const [checkoutNotes, setCheckoutNotes] = useState('');

  // Check-In form states
  const [odometerEnd, setOdometerEnd] = useState<number>(0);
  const [fuelEnd, setFuelEnd] = useState<FuelLevel>('3/4');
  const [conditionStatus, setConditionStatus] = useState<
    'BAIK' | 'PERLU_PERBAIKAN' | 'RUSAK'
  >('BAIK');
  const [damageNotes, setDamageNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [liveTime, setLiveTime] = useState(() =>
    new Date().toLocaleTimeString('id-ID', { hour12: false })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setLiveTime(new Date().toLocaleTimeString('id-ID', { hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function resolveQrToken(token: string) {
    const clean = token.trim();
    if (!clean) return;
    setScanning(true);
    setScanError(null);
    setActionResult(null);
    setQrInput(clean);

    try {
      const res = await fetch(`/api/gate/resolve/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        setResolved(null);
        setScanError(data.error || 'Kode QR tidak valid.');
        return;
      }

      const payload = data as ResolvedGatePayload;
      setResolved(payload);
      if (payload.mode === 'CHECKOUT') {
        setOdometerStart(payload.dispatch.current_odometer);
        setFuelStart(payload.dispatch.current_fuel);
        setLightsSirenOk(true);
        setTiresBodyOk(true);
        setDocumentsOk(true);
        setCheckoutNotes('');
      } else if (payload.mode === 'CHECKIN') {
        const baseOdo =
          payload.dispatch.odometer_start ?? payload.dispatch.current_odometer;
        setOdometerEnd(baseOdo + 18);
        setFuelEnd(payload.dispatch.fuel_level_start || '1/2');
        setConditionStatus('BAIK');
        setDamageNotes('');
      }
    } catch {
      setScanError('Gagal memverifikasi QR ke server Mako.');
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    if (initialQrCode) {
      void resolveQrToken(initialQrCode);
      onClearInitialQr();
    }
  }, [initialQrCode, onClearInitialQr]);

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved) return;
    setSubmitting(true);
    setActionResult(null);

    try {
      const res = await fetch('/api/gate/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispatch_id: resolved.dispatch.id,
          guard_officer_id: currentUserId,
          odometer_start: odometerStart,
          fuel_level_start: fuelStart,
          lights_siren_ok: lightsSirenOk,
          tires_body_ok: tiresBodyOk,
          documents_ok: documentsOk,
          checkout_notes: checkoutNotes,
          qr_scanned_token: qrInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionResult({
          type: 'error',
          message: data.error || 'Gagal mencatat Check-Out gerbang.',
        });
        return;
      }

      setActionResult({
        type: 'success',
        message: `Check-Out ${resolved.dispatch.hull_code} (${resolved.dispatch.plate_number}) tercatat pada pukul ${new Date(
          data.actual_checkout_at
        ).toLocaleTimeString('id-ID', { hour12: false })} WIB.`,
      });
      await onRefresh();
      await resolveQrToken(resolved.dispatch.qr_dispatch_code);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved) return;
    setSubmitting(true);
    setActionResult(null);

    try {
      const res = await fetch('/api/gate/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispatch_id: resolved.dispatch.id,
          guard_officer_id: currentUserId,
          odometer_end: odometerEnd,
          fuel_level_end: fuelEnd,
          condition_status: conditionStatus,
          damage_notes: damageNotes,
          qr_scanned_token: qrInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionResult({
          type: 'error',
          message: data.error || 'Gagal mencatat Check-In gerbang.',
        });
        return;
      }

      setActionResult({
        type: 'success',
        message: `Check-In ${resolved.dispatch.hull_code} selesai (${data.distanceKm} km ditempuh). Status kendaraan diperbarui ke ${data.vehicleStatus}.`,
      });
      await onRefresh();
      setResolved(null);
    } finally {
      setSubmitting(false);
    }
  }

  const readyQueue = dispatches.filter(
    (d) => d.status === 'APPROVED' || d.status === 'IN_PROGRESS'
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: QR Scanner Input + Ready-to-Scan QR Cards */}
      <section className="xl:col-span-6 space-y-5">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#0F2942]">
                Terminal Pemindai QR Gerbang Mako
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pindai QR pada Surat Perintah Tugas (SPT) atau stiker QR armada, atau pilih kartu di bawah.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-slate-500">Jam Server Mako</div>
              <div className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                {liveTime} WIB
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void resolveQrToken(qrInput);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <ScanLine className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Masukkan / scan kode QR (mis. SPT-QR-087-2026 atau SATPOL-QR-PATROLI-01)"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
              />
            </div>
            <button
              type="submit"
              disabled={scanning}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer whitespace-nowrap shrink-0"
            >
              {scanning ? 'Memverifikasi...' : 'Pindai QR'}
            </button>
          </form>

          {scanError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-[#0F2942]">
              Antrean QR Siap Pindai di Pos Penjagaan
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {readyQueue.length} tugas aktif
            </span>
          </div>

          {readyQueue.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Seluruh armada berada di Mako dan tidak ada SPT yang menunggu verifikasi gerbang.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {readyQueue.map((item) => {
                const isSelected = resolved?.dispatch.id === item.id;
                const isCheckout = item.status === 'APPROVED';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => resolveQrToken(item.qr_dispatch_code)}
                    className={`w-full text-left p-4 transition-colors flex items-center justify-between gap-4 cursor-pointer ${
                      isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="p-1.5 bg-white border border-slate-200 rounded shrink-0">
                        <QRCodeSVG
                          value={item.qr_dispatch_code}
                          size={52}
                          level="L"
                          fgColor="#0F2942"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#0F2942]">
                            {item.hull_code} · {item.plate_number}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-slate-600 truncate">
                            {item.qr_dispatch_code}
                          </span>
                        </div>
                        <div className="font-medium text-xs text-slate-900 truncate mt-0.5">
                          {item.spt_number} — {item.mission_title}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Pengemudi: {item.driver_name}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${
                          isCheckout ? 'text-emerald-700' : 'text-[#D97706]'
                        }`}
                      >
                        {isCheckout ? (
                          <>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            Check-Out
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            Check-In
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Right: Gate Verification Form */}
      <section className="xl:col-span-6 bg-white border border-slate-200 rounded-lg">
        {!resolved ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-[#0F2942] mb-3">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="font-display font-bold text-sm text-[#0F2942]">
              Belum Ada Kode QR Terpindai
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
              Pilih salah satu kartu QR di panel sebelah kiri atau masukkan token QR SPT/Armada untuk membuka formulir Check-Out maupun Check-In Gerbang Mako.
            </p>
          </div>
        ) : (
          <div>
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs font-bold text-[#0F2942]">
                  {resolved.dispatch.spt_number} · {resolved.dispatch.hull_code} (
                  {resolved.dispatch.plate_number})
                </div>
                <h2 className="font-display text-base font-bold text-slate-900 mt-0.5">
                  {resolved.mode === 'CHECKOUT'
                    ? 'Verifikasi Check-Out Gerbang Mako'
                    : resolved.mode === 'CHECKIN'
                    ? 'Verifikasi Check-In Kembali ke Mako'
                    : 'Riwayat Penugasan Selesai'}
                </h2>
              </div>
              <DispatchStatusLabel status={resolved.dispatch.status} />
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4 border-b border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Kendaraan</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {resolved.dispatch.brand_model}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Pengemudi</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {resolved.dispatch.driver_name}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Bidang</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {resolved.dispatch.unit_name}
                  </div>
                </div>
              </div>

              {actionResult && (
                <div
                  className={`p-3 rounded border text-xs flex items-start gap-2 ${
                    actionResult.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  {actionResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  )}
                  <span>{actionResult.message}</span>
                </div>
              )}

              {resolved.mode === 'CHECKOUT' && (
                <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="odo-start"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Odometer Keluar (KM)
                      </label>
                      <input
                        id="odo-start"
                        type="number"
                        required
                        min={resolved.dispatch.current_odometer}
                        value={odometerStart}
                        onChange={(e) => setOdometerStart(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm font-mono font-semibold tabular-nums border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
                      />
                      <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                        Odo terakhir: {resolved.dispatch.current_odometer.toLocaleString('id-ID')} km
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1">
                        Level BBM Awal
                      </span>
                      <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded">
                        {FUEL_OPTIONS.map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setFuelStart(lvl)}
                            className={`py-1.5 text-xs font-mono font-semibold rounded transition-colors cursor-pointer ${
                              fuelStart === lvl
                                ? 'bg-[#0F2942] text-white'
                                : 'text-slate-700 hover:bg-white'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-semibold text-slate-700">
                      Pemeriksaan Fisik Pra-Keberangkatan (Danru Jaga)
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lightsSirenOk}
                        onChange={(e) => setLightsSirenOk(e.target.checked)}
                        className="rounded border-slate-300 text-[#0F2942]"
                      />
                      <span>Lampu utama, rotator strobo, dan sirine berfungsi baik</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tiresBodyOk}
                        onChange={(e) => setTiresBodyOk(e.target.checked)}
                        className="rounded border-slate-300 text-[#0F2942]"
                      />
                      <span>Kondisi ban, rem, dan bodi kendaraan layak operasi</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={documentsOk}
                        onChange={(e) => setDocumentsOk(e.target.checked)}
                        className="rounded border-slate-300 text-[#0F2942]"
                      />
                      <span>STNK asli, SIM pengemudi, dan fisik SPT lengkap</span>
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="checkout-notes"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Catatan Penjagaan (Opsional)
                    </label>
                    <input
                      id="checkout-notes"
                      type="text"
                      placeholder="Contoh: Perlengkapan dalmas & HT lengkap"
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer"
                  >
                    {submitting
                      ? 'Menyimpan Transaksi...'
                      : `Catat Check-Out Gerbang (${liveTime} WIB)`}
                  </button>
                </form>
              )}

              {resolved.mode === 'CHECKIN' && (
                <form onSubmit={handleCheckinSubmit} className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Keluar Mako:{' '}
                      <strong className="font-mono">
                        {resolved.dispatch.actual_checkout_at?.slice(11, 16)} WIB
                      </strong>
                    </span>
                    <span>
                      Odo Awal:{' '}
                      <strong className="font-mono tabular-nums">
                        {(
                          resolved.dispatch.odometer_start ??
                          resolved.dispatch.current_odometer
                        ).toLocaleString('id-ID')}{' '}
                        km
                      </strong>
                    </span>
                    <span>
                      BBM Awal:{' '}
                      <strong className="font-mono">
                        {resolved.dispatch.fuel_level_start}
                      </strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="odo-end"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Odometer Kembali (KM)
                      </label>
                      <input
                        id="odo-end"
                        type="number"
                        required
                        min={
                          resolved.dispatch.odometer_start ??
                          resolved.dispatch.current_odometer
                        }
                        value={odometerEnd}
                        onChange={(e) => setOdometerEnd(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm font-mono font-semibold tabular-nums border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
                      />
                      <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                        Estimasi tempuh:{' '}
                        {Math.max(
                          0,
                          odometerEnd -
                            (resolved.dispatch.odometer_start ??
                              resolved.dispatch.current_odometer)
                        )}{' '}
                        km
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1">
                        Level BBM Akhir
                      </span>
                      <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded">
                        {FUEL_OPTIONS.map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setFuelEnd(lvl)}
                            className={`py-1.5 text-xs font-mono font-semibold rounded transition-colors cursor-pointer ${
                              fuelEnd === lvl
                                ? 'bg-[#0F2942] text-white'
                                : 'text-slate-700 hover:bg-white'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kondisi Armada Saat Kembali
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['BAIK', 'Kondisi Baik'],
                          ['PERLU_PERBAIKAN', 'Perlu Servis'],
                          ['RUSAK', 'Rusak / Mogok'],
                        ] as const
                      ).map(([code, label]) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setConditionStatus(code)}
                          className={`py-2 px-3 text-xs font-semibold rounded border transition-colors cursor-pointer ${
                            conditionStatus === code
                              ? code === 'BAIK'
                                ? 'bg-emerald-700 text-white border-emerald-700'
                                : 'bg-[#D97706] text-white border-[#D97706]'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {conditionStatus !== 'BAIK' && (
                      <p className="text-[11px] text-amber-800 mt-1.5">
                        Memilih status selain Baik akan otomatis membuka Tiket Pemeliharaan dan mengunci unit dari booking baru.
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="damage-notes"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Catatan Kerusakan / Pemeriksaan Akhir
                    </label>
                    <input
                      id="damage-notes"
                      type="text"
                      placeholder="Contoh: Kendaraan bersih dan siap operasi berikutnya"
                      value={damageNotes}
                      onChange={(e) => setDamageNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#D97706] rounded hover:bg-[#B45309] cursor-pointer"
                  >
                    {submitting
                      ? 'Menyimpan Check-In...'
                      : `Catat Check-In Kembali (${liveTime} WIB)`}
                  </button>
                </form>
              )}

              {resolved.mode === 'READONLY' && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                  SPT ini telah selesai atau belum berstatus siap gerbang. Silakan pilih SPT berstatus Disetujui atau Sedang Patroli.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
