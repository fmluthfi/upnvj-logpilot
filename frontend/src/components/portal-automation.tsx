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
  runner: string;
  start_date: string;
  end_date: string;
  status: string;
  total_entries: number;
  completed_entries: number;
  stop_requested: boolean;
  pause_requested: boolean;
  last_error: string | null;
  counts: Record<string, number>;
  entries: RunEntry[];
};

type PairingCode = { pairing_code: string; expires_at: string };

const ACTIVE_STATUSES = new Set(["ready", "queued", "waiting_login", "running", "stopping", "paused"]);
const STATUS_LABELS: Record<string, string> = {
  ready: "Siap dijalankan",
  queued: "Menunggu",
  waiting_login: "Menunggu login",
  running: "Mengisi entri",
  stopping: "Menghentikan antrean",
  completed: "Selesai",
  failed: "Gagal",
  stopped: "Dihentikan",
  paused: "Dijeda",
  submitted: "Tersimpan",
  updated: "Diperbarui",
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function PortalAutomation({ range, onRefresh }: { range: DateRange; onRefresh: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [paired, setPaired] = useState<boolean | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [pairingMessage, setPairingMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runId = run?.id;
  const runStatus = run?.status;
  const runRunner = run?.runner;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/extension/pairing-status`, { cache: "no-store" });
        if (!response.ok) throw new Error("Backend lokal tidak tersedia.");
        const status = await response.json() as { paired: boolean };
        if (!active) return;
        setBackendAvailable(true);
        setPaired(status.paired);
        if (status.paired) {
          setPairingCode(null);
          setPairingMessage("");
        }
      } catch {
        if (active) {
          setBackendAvailable(false);
          setPaired(false);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!pairingCode) return;
    const remaining = Date.parse(pairingCode.expires_at) - Date.now();
    const timer = window.setTimeout(() => setPairingCode(null), Math.max(remaining, 0));
    return () => window.clearTimeout(timer);
  }, [pairingCode]);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/runs/latest`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Run | null> : null)
      .then((latest) => {
        if (!active) return;
        if (latest && (ACTIVE_STATUSES.has(latest.status) || (latest.runner === "extension" && latest.start_date === range.start && latest.end_date === range.end))) {
          setRun(latest);
        } else {
          setRun(null);
        }
        setError("");
      })
      .catch(() => {
        if (active) setError("Status batch belum dapat dimuat. Pastikan backend lokal berjalan.");
      });
    return () => { active = false; };
  }, [range.start, range.end]);

  useEffect(() => {
    if (!runId || !runStatus || !ACTIVE_STATUSES.has(runStatus) || (runRunner !== "extension" && runStatus === "paused")) return;
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
  }, [runId, runStatus, runRunner, onRefresh]);

  async function requestJson(url: string, init?: RequestInit) {
    try {
      const response = await fetch(`${API_BASE}${url}`, init);
      if (!response.ok) throw new Error(await apiError(response, "Permintaan belum dapat diproses."));
      return response.json();
    } catch (requestError) {
      if (requestError instanceof TypeError) {
        throw new Error("Tidak dapat terhubung ke backend lokal. Pastikan jendela backend Logpilot masih berjalan.");
      }
      throw requestError;
    }
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

  async function createPairingCode() {
    setBusy(true);
    setError("");
    setPairingMessage("");
    try {
      const result = await requestJson("/extension/pairing-code", { method: "POST" }) as PairingCode;
      setPairingCode(result);
      setPairingMessage("");
    } catch (requestError) {
      setPairingMessage(requestError instanceof Error ? requestError.message : "Kode pairing belum dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPairingCode() {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode.pairing_code);
      setPairingMessage("Kode pairing disalin.");
    } catch {
      setPairingMessage("Pilih dan salin kode pairing secara manual.");
    }
  }

  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson("/runs/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: range.start, end_date: range.end, confirmed }),
      }) as Run;
      setRun(result);
      setPreview(null);
      setConfirmed(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Batch belum dapat disiapkan.");
    } finally {
      setBusy(false);
    }
  }

  async function control(action: "pause" | "stop") {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      setRun(await requestJson(
        run.runner === "extension" ? `/runs/${run.id}/control` : `/runs/${run.id}/stop`,
        run.runner === "extension"
          ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }
          : { method: "POST" },
      ) as Run);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Kontrol batch belum dapat diterapkan.");
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
      setError("");
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
  const needsReview = Boolean(run?.entries.some((entry) => entry.status === "verification_needed"));
  const legacyReview = Boolean(run && run.runner !== "extension" && run.status === "paused");
  const active = Boolean(run && ACTIVE_STATUSES.has(run.status) && !legacyReview);
  const submittedCount = run?.completed_entries ?? 0;
  const updatedCount = run?.counts.updated ?? 0;
  const processingEntry = run?.entries.find((entry) => entry.status === "processing");
  const pairingStatus = backendAvailable === false
    ? "Backend terputus"
    : paired === null
      ? "Memeriksa…"
      : paired
        ? "Pairing aktif"
        : "Belum dipasangkan";

  return (
    <section aria-labelledby="automation-title" className="mt-6">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5 p-5 sm:p-7">
          <div>
            <h2 id="automation-title" className="card-title text-xl">Isi logbook di portal</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-base-content/70">
              Siapkan entri yang sudah disetujui di sini. Chrome extension mengisi portal memakai sesi browser yang kamu buka.
            </p>
          </div>

          <div role="note" className="rounded-box bg-warning/15 px-4 py-3 text-sm leading-6 text-base-content/80">
            <p>Logpilot hanya menyimpan entri harian. Penyelesaian logbook tetap kamu lakukan sendiri di portal.</p>
          </div>

          <details className="border-t border-base-300 pt-4" aria-live="polite">
            <summary className="disclosure-summary flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <h3 className="font-semibold">Chrome extension</h3>
              <span className={`badge ${backendAvailable === false ? "badge-error" : paired ? "badge-success" : "badge-outline"}`}>
                {pairingStatus}
              </span>
            </summary>
            <div className="mt-4 space-y-3">
              {backendAvailable === false && <p className="text-sm text-error-content">Jalankan kembali backend lokal Logpilot.</p>}
              {paired && <p className="text-sm text-base-content/70">Sambungan extension aktif.</p>}
              {backendAvailable && !paired && !pairingCode && (
                <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={createPairingCode}>
                  {busy ? "Membuat kode…" : "Buat kode pairing"}
                </button>
              )}
              {pairingCode && (
                <div className="rounded-box bg-base-200 p-4">
                  <p className="text-sm leading-6">Tempel kode ini di popup extension. Berlaku sampai {formatTime(pairingCode.expires_at)}.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-box bg-base-100 px-3 py-2 text-sm">{pairingCode.pairing_code}</code>
                    <button type="button" className="btn btn-outline btn-sm" onClick={copyPairingCode}>Salin kode</button>
                  </div>
                </div>
              )}
              {pairingMessage && <p role="status" className="text-sm text-base-content/75">{pairingMessage}</p>}
            </div>
          </details>

          {run && (
            <div className="rounded-box border border-base-300 p-4 sm:p-5" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {run.runner !== "extension" && run.status === "paused"
                      ? "Batch lama perlu diperiksa"
                      : run.status === "running" && run.pause_requested
                        ? "Menjeda pada checkpoint aman"
                        : STATUS_LABELS[run.status] ?? "Status automation"}
                  </h3>
                  <p className="mt-1 text-sm text-base-content/70">
                    {formatDate(run.start_date)} sampai {formatDate(run.end_date)}
                  </p>
                </div>
                <span className="badge badge-outline">{submittedCount} dari {run.total_entries} tersimpan</span>
              </div>

              <progress className="progress progress-primary mt-4 w-full" max={run.total_entries || 1} value={submittedCount} aria-label="Progres batch" />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-content/70">
                <span>{run.counts.queued ?? 0} menunggu</span>
                <span>{run.counts.processing ?? 0} diproses</span>
                {updatedCount > 0 && <span>{updatedCount} diperbarui</span>}
                <span>{run.counts.failed ?? 0} gagal</span>
                <span>{run.counts.skipped ?? 0} dilewati</span>
                <span>{run.counts.verification_needed ?? 0} perlu diperiksa</span>
              </div>

              {run.runner === "extension" && run.status === "ready" && (
                <p className="mt-3 text-sm leading-6 text-base-content/75">Batch tersimpan sebagai snapshot. Buka popup Logpilot di Chrome, pastikan tab portal siap, lalu pilih “Mulai automation”.</p>
              )}
              {run.status === "paused" && run.runner === "extension" && (
                <p className="mt-3 text-sm leading-6 text-base-content/75">Batch dijeda. Lanjutkan dari popup extension setelah memeriksa portal.</p>
              )}
              {run.status === "paused" && run.runner !== "extension" && (
                <p className="mt-3 text-sm leading-6 text-base-content/75">Automation sebelumnya berhenti setelah hasil Simpan tidak pasti. Tanggal ini tetap terkunci sampai diperiksa; tanggal lain bisa disiapkan untuk pengujian.</p>
              )}
              {processingEntry && (
                <p className="mt-3 text-sm text-base-content/75">Sedang memproses {formatDate(processingEntry.date)}.</p>
              )}
              {run.last_error && <p role="alert" className="mt-3 text-sm text-error-content">{run.last_error}</p>}
              {needsReview && (
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

              {run.entries.some((entry) => ["failed", "skipped", "stopped"].includes(entry.status)) && (
                <div className="mt-4 space-y-2" aria-label="Catatan batch">
                  {run.entries.filter((entry) => ["failed", "skipped", "stopped"].includes(entry.status)).map((entry) => (
                    <div className="flex flex-wrap items-start justify-between gap-2 rounded-box bg-base-200 p-3 text-sm" key={entry.id}>
                      <span className="font-medium">{formatDate(entry.date)} · {STATUS_LABELS[entry.status] ?? entry.status}</span>
                      {entry.last_error && <span className="text-base-content/70">{entry.last_error}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {run.runner === "extension" && run.status === "running" && !run.pause_requested && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => control("pause")}>{busy ? "Memproses…" : "Jeda batch"}</button>}
                {active && run.status !== "stopping" && !(run.runner !== "extension" && run.status === "paused") && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => control("stop")}>{busy ? "Memproses…" : "Hentikan batch"}</button>}
                {run.runner === "extension" && !active && hasRetryableEntries && <button type="button" className="btn btn-primary btn-sm" disabled={busy || needsReview} onClick={retry}>{busy ? "Menyiapkan…" : "Siapkan ulang entri aman"}</button>}
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
                    <div className="flex flex-col items-start gap-4 border-t border-base-300 pt-4">
                      <label className="flex w-full max-w-3xl cursor-pointer items-start gap-3 whitespace-normal">
                        <input type="checkbox" className="checkbox checkbox-primary mt-1 shrink-0" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                        <span className="min-w-0 flex-1 whitespace-normal break-words text-sm leading-6">Saya sudah meninjau tanggal di atas dan menyetujui Logpilot mengisi serta menyimpan entri tersebut.</span>
                      </label>
                      <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={!confirmed || busy || !backendAvailable || !paired} onClick={prepare}>
                        {busy ? "Menyiapkan batch…" : "Siapkan batch"}
                      </button>
                      {backendAvailable && !paired && <p className="text-sm text-base-content/70">Pasangkan Chrome extension sebelum menyiapkan batch.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div role="alert" className="alert alert-error items-start text-sm"><p>{error}</p></div>}
        </div>
      </div>
    </section>
  );
}
