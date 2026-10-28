"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { API_BASE } from "../lib/api";
import { EntryPreview } from "../components/entry-preview";
import { WeeklyReflectionEditor } from "../components/weekly-reflection-editor";

type DocsStatus = {
  configured: boolean;
  connected: boolean;
  state: "connected" | "connecting" | "disconnected" | "failed";
};

type CoverageEntry = {
  source_row_index: number;
  week_number: number | null;
  activity: string | null;
  result: string | null;
  obstacle: string | null;
  documentation_url: string | null;
  kind: string;
  source_conflict: boolean;
};

type CoverageDay = {
  date: string;
  status: "filled" | "leave" | "blank" | "needs_mapping" | "missing";
  entries: CoverageEntry[];
};

type SyncResult = {
  start_date: string;
  end_date: string;
  summary: Record<CoverageDay["status"], number>;
  days: CoverageDay[];
  sync: { conflicts: number };
};

const COVERAGE_LABELS: Record<CoverageDay["status"], string> = {
  filled: "Terisi",
  leave: "Izin / sakit",
  blank: "Baris kosong",
  needs_mapping: "Perlu pemetaan",
  missing: "Belum tercantum",
};

async function fetchDocsStatus(): Promise<DocsStatus> {
  const response = await fetch(`${API_BASE}/docs/status`, { cache: "no-store" });
  if (!response.ok) throw new Error("Status Google Docs tidak tersedia.");
  return response.json() as Promise<DocsStatus>;
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

function inclusiveDays(start: string, end: string) {
  const startTime = Date.parse(start + "T00:00:00Z");
  const endTime = Date.parse(end + "T00:00:00Z");
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

export default function Home() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [selectedRange, setSelectedRange] = useState<{
    start: string;
    end: string;
    days: number;
  } | null>(null);
  const [documentUrl, setDocumentUrl] = useState("");
  const [docsStatus, setDocsStatus] = useState<DocsStatus | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [entriesRefreshKey, setEntriesRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetchDocsStatus()
      .then((status) => {
        if (active) {
          setDocsStatus(status);
          setApiAvailable(true);
        }
      })
      .catch(() => {
        if (active) {
          setDocsStatus(null);
          setApiAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (docsStatus?.state !== "connecting") return;
    let active = true;
    const timer = window.setInterval(() => {
      fetchDocsStatus()
        .then((status) => {
          if (active) {
            setDocsStatus(status);
            setApiAvailable(true);
            if (status.connected) setConnectionMessage("Google Docs terhubung dengan akses baca saja.");
            if (status.state === "failed") setConnectionMessage("Izin Google Docs gagal. Coba sambungkan kembali.");
          }
        })
        .catch(() => {
          if (active) setApiAvailable(false);
        });
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [docsStatus?.state]);

  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!startDate || !endDate) {
      setError("Pilih tanggal mulai dan tanggal akhir.");
      setSelectedRange(null);
      return;
    }

    if (startDate > endDate) {
      setError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.");
      setSelectedRange(null);
      return;
    }

    setError("");
    setSyncResult(null);
    setSyncError("");
    setSelectedRange({
      start: startDate,
      end: endDate,
      days: inclusiveDays(startDate, endDate),
    });
  }

  function updateStart(value: string) {
    setStartDate(value);
    setError("");
    setSelectedRange(null);
    setSyncResult(null);
    setSyncError("");
  }

  function updateEnd(value: string) {
    setEndDate(value);
    setError("");
    setSelectedRange(null);
    setSyncResult(null);
    setSyncError("");
  }

  function setQuickRange(days: number) {
    if (!startDate) {
      setError("Pilih tanggal mulai terlebih dahulu.");
      return;
    }
    const start = Date.parse(startDate + "T00:00:00Z");
    const end = new Date(start + (days - 1) * 86_400_000).toISOString().slice(0, 10);
    setEndDate(end);
    setError("");
    setSyncResult(null);
    setSyncError("");
    setSelectedRange({ start: startDate, end, days });
  }

  async function connectGoogleDocs() {
    setConnectionMessage("");
    try {
      const response = await fetch(`${API_BASE}/docs/connect`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.detail === "Koneksi Google Docs sedang berjalan."
            ? "Persetujuan Google masih berlangsung. Selesaikan di tab Google yang terbuka."
            : "Google Docs belum dapat dihubungkan. Periksa panduan koneksi di README.",
        );
      }
      setApiAvailable(true);
      setDocsStatus(await fetchDocsStatus());
      setConnectionMessage(
        result.state === "connected"
          ? "Google Docs sudah terhubung dengan akses baca saja."
          : "Selesaikan izin baca-saja pada tab Google yang terbuka.",
      );
    } catch (connectionError) {
      setConnectionMessage(
        connectionError instanceof Error && connectionError.name === "Error"
          ? connectionError.message
          : "Google Docs belum dapat dihubungkan. Periksa koneksi dan panduan di README.",
      );
    }
  }

  async function syncGoogleDocs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentUrl.trim()) {
      setSyncError("Masukkan URL atau ID Google Docs.");
      return;
    }
    if (!selectedRange) {
      setSyncError("Terapkan atau pilih rentang tanggal terlebih dahulu.");
      return;
    }
    setSyncing(true);
    setSyncError("");
    try {
      const response = await fetch(`${API_BASE}/docs/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_url: documentUrl,
          start_date: selectedRange.start,
          end_date: selectedRange.end,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = typeof result.detail === "string" ? result.detail : "";
        throw new Error(
          message.includes("akses dokumen")
            ? "Dokumen tidak dapat dibaca. Pastikan akun Google memiliki akses lihat."
            : message.includes("Hubungkan Google Docs")
              ? "Hubungkan Google Docs sebelum membaca dokumen."
              : "Dokumen belum dapat dibaca. Periksa tautan, akses, dan format tabelnya.",
        );
      }
      setSyncResult(result as SyncResult);
      setEntriesRefreshKey((current) => current + 1);
    } catch (requestError) {
      setSyncResult(null);
      setSyncError(
        requestError instanceof Error && requestError.name === "Error"
          ? requestError.message
          : "Sinkronisasi gagal. Periksa koneksi dan akses dokumen.",
      );
    } finally {
      setSyncing(false);
    }
  }

  function exportCoverageCsv() {
    if (!syncResult) return;
    const rows = [
      ["Tanggal", "Status", "Minggu", "Kegiatan", "Hasil", "Kendala", "Dokumentasi", "Perlu ditinjau"],
      ...syncResult.days.map((day) => [
        day.date,
        COVERAGE_LABELS[day.status],
        day.entries.map((entry) => entry.week_number ?? "").filter(Boolean).join("; "),
        day.entries.map((entry) => entry.activity ?? "").filter(Boolean).join("\n"),
        day.entries.map((entry) => entry.result ?? "").filter(Boolean).join("\n"),
        day.entries.map((entry) => entry.obstacle ?? "").filter(Boolean).join("\n"),
        day.entries.map((entry) => entry.documentation_url ?? "").filter(Boolean).join("\n"),
        day.entries.some((entry) => entry.source_conflict) ? "Ya" : "Tidak",
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `logbook-${syncResult.start_date}-${syncResult.end_date}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="min-h-screen bg-base-200">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Logpilot, beranda"
            className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <Image src="/logpilot-mark.png" alt="" width={48} height={48} priority className="size-10 object-contain" />
            <span className="text-xl font-semibold tracking-tight">Logpilot</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section aria-labelledby="dashboard-title">
          <h1 id="dashboard-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Otomasi Pengisian Logbook Magang UPNVJ
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-base-content/75">
            Siapkan catatan dari Google Docs untuk rentang tanggal yang kamu pilih sebelum mengisi logbook.
          </p>

          <div role="note" className="alert alert-warning mt-6 items-start">
            <div>
              <p className="font-semibold">Penyelesaian logbook tetap manual.</p>
              <p className="text-sm leading-6">
                Logpilot tidak akan menjalankan “Selesaikan Logbook Magang”.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid items-start gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-5 p-5 sm:p-7">
              <div>
                <h2 className="card-title text-xl">Rentang tanggal</h2>
                <p className="mt-1 text-sm leading-6 text-base-content/70">
                  Tanggal awal dan akhir ikut dihitung. Pilih periode sesuai kebutuhanmu.
                </p>
              </div>

              <form noValidate onSubmit={applyRange}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="form-control w-full">
                    <span className="label"><span className="label-text font-medium">Mulai</span></span>
                    <input
                      className="input input-bordered w-full bg-base-100"
                      type="date"
                      value={startDate}
                      onChange={(event) => updateStart(event.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "range-error" : "range-hint"}
                    />
                  </label>
                  <label className="form-control w-full">
                    <span className="label"><span className="label-text font-medium">Sampai</span></span>
                    <input
                      className="input input-bordered w-full bg-base-100"
                      type="date"
                      value={endDate}
                      onChange={(event) => updateEnd(event.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "range-error" : "range-hint"}
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-sm text-base-content/70">Pilih cepat:</span>
                  <button type="button" className="btn btn-outline btn-sm" disabled={!startDate} onClick={() => setQuickRange(3)}>
                    3 hari
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={!startDate} onClick={() => setQuickRange(7)}>
                    1 minggu
                  </button>
                </div>

                {error ? (
                  <p id="range-error" role="alert" className="mt-3 text-sm font-medium text-error">{error}</p>
                ) : (
                  <p id="range-hint" className="mt-3 text-sm text-base-content/65">
                    Tidak ada batas tanggal bawaan.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="submit" className="btn btn-primary">Terapkan periode</button>
                  {selectedRange && (
                    <span role="status" className="text-sm text-base-content/70">
                      {selectedRange.days} hari dipilih · {formatDate(selectedRange.start)}–{formatDate(selectedRange.end)}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>

          <aside className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title text-xl">Sumber Google Docs</h2>
                {docsStatus?.connected && <span className="badge badge-success">Terhubung</span>}
                {docsStatus?.state === "connecting" && <span className="badge badge-info">Menunggu izin</span>}
              </div>
              <p className="text-sm leading-6 text-base-content/70">
                Dokumen dibaca tanpa mengubah isi aslinya.
              </p>

              {apiAvailable === false && (
                <div role="status" className="alert alert-warning items-start text-sm">
                  Koneksi aplikasi belum tersedia. Pastikan aplikasi sudah dijalankan sesuai panduan setup.
                </div>
              )}
              {apiAvailable && docsStatus && !docsStatus.configured && (
                <div role="note" className="rounded-box bg-base-200 p-4 text-sm leading-6 text-base-content/75">
                  Koneksi Google Docs perlu disiapkan. Ikuti panduan Google Docs di README.
                </div>
              )}
              {connectionMessage && <p role="status" className="text-sm text-base-content/75">{connectionMessage}</p>}

              {docsStatus?.configured && !docsStatus.connected && (
                <button
                  type="button"
                  className="btn btn-outline w-full"
                  disabled={!apiAvailable || docsStatus.state === "connecting"}
                  onClick={connectGoogleDocs}
                >
                  {docsStatus.state === "connecting" ? "Menunggu persetujuan Google…" : "Hubungkan Google Docs"}
                </button>
              )}

              <form className="grid gap-4" onSubmit={syncGoogleDocs}>
                <label className="form-control w-full">
                  <span className="label"><span className="label-text font-medium">URL atau ID dokumen</span></span>
                  <input
                    className="input input-bordered w-full bg-base-100"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Tempel URL atau ID Google Docs"
                    value={documentUrl}
                    onChange={(event) => {
                      setDocumentUrl(event.target.value);
                      setSyncResult(null);
                      setSyncError("");
                    }}
                    aria-label="URL atau ID Google Docs"
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={!docsStatus?.connected || !selectedRange || syncing}
                >
                  {syncing ? "Membaca dokumen…" : "Periksa rentang tanggal"}
                </button>
                {syncError && <p role="alert" className="text-sm font-medium text-error">{syncError}</p>}
              </form>

              <p className="text-xs leading-5 text-base-content/65">
                Tanggal tanpa baris akan ditandai agar bisa kamu periksa.
              </p>
            </div>
          </aside>
        </section>

        {selectedRange && (
          <>
            <EntryPreview
              range={{ start: selectedRange.start, end: selectedRange.end }}
              refreshKey={entriesRefreshKey}
            />
            <WeeklyReflectionEditor
              key={`${selectedRange.start}|${selectedRange.end}`}
              range={{ start: selectedRange.start, end: selectedRange.end }}
              refreshKey={entriesRefreshKey}
            />
          </>
        )}

        {syncResult && (
          <section aria-labelledby="coverage-title" className="mt-6">
            <div className="card border border-base-300 bg-base-100 shadow-sm">
              <div className="card-body gap-5 p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 id="coverage-title" className="card-title text-xl">Hasil pemeriksaan</h2>
                    <p className="mt-1 text-sm text-base-content/70">
                      {formatDate(syncResult.start_date)} — {formatDate(syncResult.end_date)}
                    </p>
                  </div>
                  <button type="button" className="btn btn-outline" onClick={exportCoverageCsv}>Ekspor CSV</button>
                </div>

                <div className="flex flex-wrap gap-2" aria-label="Ringkasan status tanggal">
                  {(Object.keys(COVERAGE_LABELS) as CoverageDay["status"][]).map((status) => (
                    <span className="badge badge-outline px-3 py-3" key={status}>
                      {COVERAGE_LABELS[status]} · {syncResult.summary[status]}
                    </span>
                  ))}
                </div>

                {syncResult.sync.conflicts > 0 && (
                  <div role="alert" className="alert alert-warning items-start text-sm">
                    Beberapa catatan sumber berubah atau tidak lagi tercantum. Tinjau kembali sebelum digunakan.
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr><th>Tanggal</th><th>Status</th><th>Catatan</th></tr>
                    </thead>
                    <tbody>
                      {syncResult.days.map((day) => (
                        <tr key={day.date}>
                          <td className="whitespace-nowrap font-medium">{formatDate(day.date)}</td>
                          <td><span className="badge badge-outline">{COVERAGE_LABELS[day.status]}</span></td>
                          <td className="min-w-64 whitespace-normal">
                            {day.entries.length ? day.entries.map((entry) => (
                              <div key={`${day.date}-${entry.source_row_index}`} className="mb-3 last:mb-0">
                                <p>{entry.activity ?? (entry.kind === "needs_mapping" ? "Kolom sumber perlu ditinjau." : "Baris tanggal belum diisi.")}</p>
                                {entry.result && <p className="mt-1 text-sm text-base-content/70">Hasil: {entry.result}</p>}
                                {entry.obstacle && <p className="mt-1 text-sm text-base-content/70">Kendala: {entry.obstacle}</p>}
                                {entry.documentation_url && <p className="mt-1 break-all text-sm text-base-content/70">Dokumentasi: {entry.documentation_url}</p>}
                                {entry.source_conflict && <p className="mt-1 text-sm font-medium text-warning-content">Catatan ini berubah di dokumen.</p>}
                              </div>
                            )) : (
                              <span className="text-base-content/65">Tidak ada catatan pada tanggal ini.</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-sm leading-6 text-base-content/70">
                  Tanggal tanpa catatan belum tentu hari kerja yang terlewat. Cocokkan dengan jadwal magangmu.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
