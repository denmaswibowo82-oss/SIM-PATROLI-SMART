import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import type { DailyReportResponse } from '../types/simPatroli';

export function DailyReportView() {
  const [reportDate, setReportDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [incidentNotes, setIncidentNotes] = useState(
    'Situasi wilayah hukum Satpol PP selama piket 1x24 jam dalam keadaan aman, tertib, dan terkendali. Seluruh pergerakan kendaraan patroli tercatat melalui QR Gerbang Mako.'
  );

  useEffect(() => {
    let active = true;
    async function loadReport() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/reports/daily?date=${encodeURIComponent(reportDate)}`
        );
        if (res.ok && active) {
          const data = (await res.json()) as DailyReportResponse;
          setReport(data);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReport();
    return () => {
      active = false;
    };
  }, [reportDate]);

  const formattedDateIndo = new Date(`${reportDate}T00:00:00`).toLocaleDateString(
    'id-ID',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }
  );

  return (
    <div className="space-y-5">
      {/* Screen-only toolbar */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label
              htmlFor="report-date"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Tanggal Laporan Piket
            </label>
            <input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
            />
          </div>

          <div className="min-w-[260px] flex-1">
            <label
              htmlFor="incident-notes"
              className="block text-[11px] font-semibold text-slate-600 mb-1"
            >
              Catatan Kejadian Menonjol (Ditampilkan pada Berita Acara)
            </label>
            <input
              id="incident-notes"
              type="text"
              value={incidentNotes}
              onChange={(e) => setIncidentNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-[#0F2942]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0F2942] rounded hover:bg-[#16395C] cursor-pointer whitespace-nowrap shrink-0"
        >
          <Printer className="w-4 h-4 text-amber-400" />
          Cetak Berita Acara (A4 / PDF)
        </button>
      </div>

      {/* Printable Official Government Berita Acara */}
      {loading || !report ? (
        <div className="h-96 bg-white border border-slate-200 rounded-lg animate-pulse" />
      ) : (
        <article className="print-only-container bg-white border border-slate-200 rounded-lg p-8 md:p-12 max-w-[960px] mx-auto text-slate-900">
          {/* Official Kop Surat */}
          <header className="border-b-[3px] border-double border-slate-900 pb-4 flex items-center gap-5">
            <img
              src="/src/assets/images/satpol_emblem_1794896241877.jpg"
              alt="Lambang Satuan Polisi Pamong Praja"
              referrerPolicy="no-referrer"
              className="w-20 h-20 object-contain shrink-0"
            />
            <div className="flex-1 text-center">
              <div className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
                Pemerintah Daerah Kabupaten / Kota
              </div>
              <h1 className="font-display text-xl font-bold tracking-tight text-[#0F2942] uppercase mt-0.5">
                Satuan Polisi Pamong Praja
              </h1>
              <div className="text-xs text-slate-600 mt-0.5">
                Markas Komando (Mako) — Seksi Penjagaan, Ketertiban Umum & Pengendalian Armada
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                Sistem Informasi Manajemen Keluar Masuk Kendaraan Patroli (SIM-PATROLI SMART)
              </div>
            </div>
            <div className="w-20 shrink-0 hidden sm:block" aria-hidden="true" />
          </header>

          {/* Document Title & Metadata */}
          <div className="text-center my-6">
            <h2 className="font-display text-base font-bold uppercase underline underline-offset-4 text-slate-900">
              Berita Acara Laporan Piket Harian Armada Patroli
            </h2>
            <div className="font-mono text-xs text-slate-700 mt-1.5">
              Nomor: {report.reportNumber}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-6 border border-slate-300 p-3.5 bg-slate-50/50">
            <div>
              <span className="text-slate-600">Hari / Tanggal: </span>
              <strong className="text-slate-900">{formattedDateIndo}</strong>
            </div>
            <div>
              <span className="text-slate-600">Dinas Piket: </span>
              <strong className="text-slate-900">{report.shiftLabel}</strong>
            </div>
            <div>
              <span className="text-slate-600">Perwira Piket Mako: </span>
              <strong className="text-slate-900">
                {report.officers.perwiraPiket.full_name}
              </strong>
            </div>
            <div>
              <span className="text-slate-600">Danru Penjagaan Gerbang: </span>
              <strong className="text-slate-900">
                {report.officers.danruPenjagaan.full_name}
              </strong>
            </div>
          </div>

          {/* Section I: Rekapitulasi Kekuatan Armada */}
          <section className="mb-6">
            <h3 className="font-display text-xs font-bold uppercase tracking-wide text-[#0F2942] mb-2">
              I. Rekapitulasi Kekuatan & Kesiapan Armada
            </h3>
            <table className="w-full border-collapse border border-slate-400 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-400 py-2 px-3 text-center">
                    Total Armada
                  </th>
                  <th className="border border-slate-400 py-2 px-3 text-center">
                    Siap Operasi (Mako)
                  </th>
                  <th className="border border-slate-400 py-2 px-3 text-center">
                    Sedang Patroli
                  </th>
                  <th className="border border-slate-400 py-2 px-3 text-center">
                    Maintenance / Rusak
                  </th>
                  <th className="border border-slate-400 py-2 px-3 text-center">
                    Total Jarak Tempuh Piket
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-mono font-bold text-sm text-center tabular-nums">
                  <td className="border border-slate-400 py-2.5 px-3">
                    {report.fleetSummary.total} Unit
                  </td>
                  <td className="border border-slate-400 py-2.5 px-3 text-emerald-800">
                    {report.fleetSummary.siap} Unit
                  </td>
                  <td className="border border-slate-400 py-2.5 px-3 text-[#0F2942]">
                    {report.fleetSummary.patroli} Unit
                  </td>
                  <td className="border border-slate-400 py-2.5 px-3 text-amber-800">
                    {report.fleetSummary.maintenance} Unit
                  </td>
                  <td className="border border-slate-400 py-2.5 px-3">
                    {report.totalDistanceKm.toLocaleString('id-ID')} KM
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Section II: Mutasi Keluar Masuk Kendaraan */}
          <section className="mb-6">
            <h3 className="font-display text-xs font-bold uppercase tracking-wide text-[#0F2942] mb-2">
              II. Mutasi Keluar-Masuk Kendaraan Patroli (Gerbang QR)
            </h3>
            <table className="w-full border-collapse border border-slate-400 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-400 py-2 px-2 text-center w-8">
                    No
                  </th>
                  <th className="border border-slate-400 py-2 px-2 text-left">
                    No. SPT & Kegiatan
                  </th>
                  <th className="border border-slate-400 py-2 px-2 text-left">
                    Armada / Pengemudi
                  </th>
                  <th className="border border-slate-400 py-2 px-2 text-center">
                    Jam Keluar / Masuk
                  </th>
                  <th className="border border-slate-400 py-2 px-2 text-right">
                    Odo Awal / Akhir
                  </th>
                  <th className="border border-slate-400 py-2 px-2 text-center">
                    BBM
                  </th>
                  <th className="border border-slate-400 py-2 px-2 text-center">
                    Kondisi
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.movements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="border border-slate-400 py-6 text-center text-slate-500"
                    >
                      Tidak ada pergerakan SPT kendaraan pada tanggal yang dipilih.
                    </td>
                  </tr>
                ) : (
                  report.movements.map((m, index) => (
                    <tr key={m.dispatch_id}>
                      <td className="border border-slate-400 py-2 px-2 text-center font-mono tabular-nums">
                        {index + 1}
                      </td>
                      <td className="border border-slate-400 py-2 px-2">
                        <div className="font-mono font-bold text-[#0F2942]">
                          {m.spt_number}
                        </div>
                        <div className="text-slate-800 mt-0.5">
                          {m.mission_title}
                        </div>
                        <div className="text-slate-500">{m.destination_area}</div>
                      </td>
                      <td className="border border-slate-400 py-2 px-2">
                        <div className="font-mono font-semibold">
                          {m.hull_code} ({m.plate_number})
                        </div>
                        <div className="text-slate-700 mt-0.5">{m.driver_name}</div>
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-center font-mono tabular-nums whitespace-nowrap">
                        <div>
                          Out:{' '}
                          {m.actual_checkout_at
                            ? `${m.actual_checkout_at.slice(11, 16)} WIB`
                            : 'Belum'}
                        </div>
                        <div>
                          In:{' '}
                          {m.actual_checkin_at
                            ? `${m.actual_checkin_at.slice(11, 16)} WIB`
                            : 'Di Lapangan'}
                        </div>
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>
                          {m.odometer_start !== null
                            ? m.odometer_start.toLocaleString('id-ID')
                            : '-'}
                        </div>
                        <div>
                          {m.odometer_end !== null
                            ? `${m.odometer_end.toLocaleString('id-ID')} (+${
                                m.distance_km ?? 0
                              } km)`
                            : '-'}
                        </div>
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-center font-mono whitespace-nowrap">
                        {m.fuel_level_start || '-'} → {m.fuel_level_end || '-'}
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-center font-semibold">
                        {m.condition_status || m.dispatch_status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* Section III: Pemeliharaan & Catatan Kejadian */}
          <section className="mb-8 space-y-3">
            <h3 className="font-display text-xs font-bold uppercase tracking-wide text-[#0F2942]">
              III. Catatan Pemeliharaan & Kejadian Menonjol
            </h3>
            {report.maintenanceNotes.length > 0 && (
              <div className="text-xs border border-slate-300 p-3">
                <div className="font-semibold mb-1">
                  Armada Dalam Perbaikan / Maintenance Aktif:
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {report.maintenanceNotes.map((mn) => (
                    <li key={mn.id}>
                      <span className="font-mono font-semibold">
                        {mn.hull_code} ({mn.plate_number})
                      </span>{' '}
                      — {mn.title} ({mn.workshop_name || 'Bengkel Mako'})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-xs border border-slate-300 p-3 leading-relaxed">
              <span className="font-semibold">Catatan Kejadian Piket: </span>
              {incidentNotes}
            </div>
          </section>

          {/* Section IV: Kolom Tanda Tangan Resmi */}
          <section className="pt-4 grid grid-cols-2 gap-12 text-xs text-center">
            <div>
              <div>Mengetahui / Mengesahkan,</div>
              <div className="font-bold uppercase text-slate-900 mt-0.5">
                Perwira Piket Mako Satpol PP
              </div>
              <div className="h-20" />
              <div className="font-bold underline underline-offset-4 text-slate-900">
                {report.officers.perwiraPiket.full_name}
              </div>
              <div className="text-slate-700 mt-0.5">
                {report.officers.perwiraPiket.rank_title}
              </div>
              <div className="font-mono text-[11px] text-slate-600 tabular-nums">
                NIP. {report.officers.perwiraPiket.nip_nrp}
              </div>
            </div>

            <div>
              <div>Dibuat di Mako pada {formattedDateIndo}</div>
              <div className="font-bold uppercase text-slate-900 mt-0.5">
                Komandan Regu (Danru) Penjagaan
              </div>
              <div className="h-20" />
              <div className="font-bold underline underline-offset-4 text-slate-900">
                {report.officers.danruPenjagaan.full_name}
              </div>
              <div className="text-slate-700 mt-0.5">
                {report.officers.danruPenjagaan.rank_title}
              </div>
              <div className="font-mono text-[11px] text-slate-600 tabular-nums">
                NIP. {report.officers.danruPenjagaan.nip_nrp}
              </div>
            </div>
          </section>
        </article>
      )}
    </div>
  );
}
