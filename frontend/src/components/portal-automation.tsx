"use client";

import { useEffect, useState } from "react";

import { API_BASE, apiError } from "../lib/api";

type DateRange = { start: string; end: string };
type PreviewEntry = { entry_id: string; date: string; reasons?: string[] };
type Preview = {
  ready_count: number;
  blocked_count: number;
  ready: PreviewEntry[];
  blocked: PreviewEntry[];
};
type RunEntry = {
  id: string;
  date: string;
  status: string;
  last_error: string | null;
  safe_to_retry: boolean;
};
type Run = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  total_entries: number;
  completed_entries: number;
  stop_requested: boolean;
  last_error: string | null;
  counts: Record<string, number>;
  entries: RunEntry[];
};

const ACTIVE_STATUSES = new Set(["queued", "waiting_login", "running", "stopping"]);
const STATUS_LABELS: Record<string, string> = {
  queued: "Menunggu",
  waiting_login: "Menunggu login",
  running: "Mengisi entri",
  stopping: "Menghentikan antrean",
  completed: "Selesai",
  failed: "Terhenti",
  stopped: "Dihentikan",
  paused: "Perlu pemeriksaan",
  submitted: "Tersimpan",
  processing: "Sedang diproses",
  verification_needed: "Periksa portal",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function PortalAutomation({ range, onRefresh }: { range: DateRange; onRefresh: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runId = run?.id;
  const runStatus = run?.status;

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/runs/latest`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Run | null> : null)
      .then((latest) => {
        if (!active || !latest) return;
        if (ACTIVE_STATUSES.has(latest.status) || (latest.start_date === range.start && latest.end_date === range.end)) {
          setRun(latest);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [range.start, range.end]);

  useEffect(() => {
    if (!runId || !runStatus || !ACTIVE_STATUSES.has(runStatus)) return;
    let active = true;
    const timer = window.setInterval(() => {
      fetch(`${API_BASE}/runs/${runId}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Status automation belum dapat dimuat.");
          return response.json() as Promise<Run>;
        })
        .then((next) => {
          if (!active) return;
          setRun(next);
          if (!ACTIVE_STATUSES.has(next.status)) onRefresh();
        })
        .catch(() => {
          if (active) setError("Status automation belum dapat dimuat. Pastikan aplikasi tetap berjalan.");
        });
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [runId, runStatus, onRefresh]);

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(`${API_BASE}${url}`, init);
    if (!response.ok) throw new Error(await apiError(response, "Permintaan belum dapat diproses."));
    return response.json();
  }

  async function inspectEntries() {
    setLoadingPreview(true);
    setError("");
    setConfirmed(false);
    try {
      const result = await requestJson("/runs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: range.start, end_date: range.end }),
      }) as Preview;
      setPreview(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Entri belum dapat diperiksa.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson("/runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: range.start, end_date: range.end, confirmed }),
      }) as Run;
      setRun(result);
      setPreview(null);
      setConfirmed(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Automation belum dapat dimulai.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      setRun(await requestJson(`/runs/${run.id}/stop`, { method: "POST" }) as Run);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Automation belum dapat dihentikan.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      setRun(await requestJson(`/runs/${run.id}/retry-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      }) as Run);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Entri belum dapat dicoba ulang.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(entry: RunEntry, outcome: "saved" | "not_found") {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      setRun(await requestJson(`/runs/${run.id}/entries/${entry.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal_checked: true, outcome }),
      }) as Run);
      onRefresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Status entri belum dapat diperbarui.");
    } finally {
      setBusy(false);
    }
  }

  const hasRetryableEntries = Boolean(run?.entries.some((entry) =>
    ["failed", "stopped"].includes(entry.status) && entry.safe_to_retry,
  ));
  const active = Boolean(run && ACTIVE_STATUSES.has(run.status));

  return (
    <section aria-labelledby="automation-title" className="mt-6">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5 p-5 sm:p-7">
          <div>
            <h2 id="automation-title" className="card-title text-xl">Isi logbook di portal</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-base-content/70">
              Logpilot mengisi dan menyimpan entri harian yang sudah disetujui. Login dilakukan manual di jendela browser yang dibuka.
            </p>
          </div>

          <div role="note" className="alert alert-warning items-start text-sm">
            <p>Logpilot tidak menjalankan tombol penyelesaian logbook. Tahap itu tetap dilakukan sendiri di portal.</p>
          </div>

          {run && (
            <div className="rounded-box border border-base-300 p-4 sm:p-5" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{STATUS_LABELS[run.status] ?? "Status automation"}</h3>
                  <p className="mt-1 text-sm text-base-content/70">
                    {formatDate(run.start_date)} — {formatDate(run.end_date)}
                  </p>
                </div>
                <span className="badge badge-outline">{run.completed_entries} dari {run.total_entries} tersimpan</span>
              </div>

              {run.status === "waiting_login" && (
                <p className="mt-3 text-sm leading-6 text-base-content/75">Masuk ke akun kampus pada jendela browser yang terbuka. Automation akan melanjutkan setelah halaman logbook tampil.</p>
              )}
              {run.last_error && <p role="alert" className="mt-3 text-sm text-error">{run.last_error}</p>}
              {run.entries.some((entry) => entry.status === "verification_needed") && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm leading-6">Periksa tanggal berikut pada portal. Pilih hasil setelah memastikan apakah entri sudah tersimpan.</p>
                  {run.entries.filter((entry) => entry.status === "verification_needed").map((entry) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-box bg-base-200 p-3" key={entry.id}>
                      <div>
                        <p className="font-medium">{formatDate(entry.date)}</p>
                        {entry.last_error && <p className="mt-1 text-sm text-base-content/70">{entry.last_error}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => resolve(entry, "saved")}>Sudah tersimpan</button>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => resolve(entry, "not_found")}>Belum tersimpan</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {active && <button type="button" className="btn btn-outline btn-sm" disabled={busy || run.status === "stopping"} onClick={stop}>{busy ? "Memproses…" : "Hentikan setelah langkah ini"}</button>}
                {!active && hasRetryableEntries && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={retry}>{busy ? "Menyiapkan…" : "Coba lagi entri yang aman"}</button>}
              </div>
            </div>
          )}

          {!active && (
            <div className="space-y-4">
              <button type="button" className="btn btn-outline" disabled={loadingPreview || busy} onClick={inspectEntries}>
                {loadingPreview ? "Memeriksa entri…" : "Periksa entri yang disetujui"}
              </button>
              {preview && (
                <div className="space-y-4 rounded-box bg-base-200 p-4 sm:p-5">
                  <p className="text-sm leading-6">
                    {preview.ready_count} entri siap disimpan. {preview.blocked_count} entri perlu ditinjau atau belum lengkap.
                  </p>
                  {preview.ready.length > 0 && (
                    <ul className="flex flex-wrap gap-2" aria-label="Tanggal entri yang siap">
                      {preview.ready.map((entry) => <li className="badge badge-outline px-3 py-3" key={entry.entry_id}>{formatDate(entry.date)}</li>)}
                    </ul>
                  )}
                  {preview.blocked.length > 0 && (
                    <details className="collapse collapse-arrow rounded-box border border-base-300 bg-base-100">
                      <summary className="collapse-title min-h-0 py-3 text-sm font-medium">Tinjau {preview.blocked_count} entri yang belum siap</summary>
                      <div className="collapse-content space-y-3 text-sm">
                        {preview.blocked.map((entry) => (
                          <div key={entry.entry_id}>
                            <p className="font-medium">{formatDate(entry.date)}</p>
                            <ul className="mt-1 list-inside list-disc text-base-content/70">
                              {entry.reasons?.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {preview.ready_count > 0 && (
                    <div className="space-y-3 border-t border-base-300 pt-4">
                      <label className="label cursor-pointer justify-start gap-3">
                        <input type="checkbox" className="checkbox checkbox-primary" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                        <span className="label-text leading-6">Saya sudah meninjau tanggal di atas dan menyetujui Logpilot mengisi serta menyimpan entri tersebut.</span>
                      </label>
                      <button type="button" className="btn btn-primary" disabled={!confirmed || busy} onClick={start}>
                        {busy ? "Membuka browser…" : "Mulai isi logbook"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </div>
      </div>
    </section>
  );
}
