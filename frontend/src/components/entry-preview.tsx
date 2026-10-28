"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE, apiError } from "../lib/api";
import { EntryDefaultHours } from "./entry-default-hours";
import { LogbookEntryRow, type EntryDraft, type LogbookEntry } from "./logbook-entry-row";

type DateRange = { start: string; end: string };
type Props = { range: DateRange; refreshKey: number };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function EntryPreview({ range, refreshKey }: Props) {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [dirtyEntries, setDirtyEntries] = useState<Record<string, boolean>>({});
  const [loadedRange, setLoadedRange] = useState("");
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const loadKey = `${range.start}|${range.end}|${refreshKey}|${revision}`;
  const loading = loadedRange !== loadKey;
  const error = loadError?.key === loadKey ? loadError.message : "";
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;

  const handleDirtyChange = useCallback((entryId: string, dirty: boolean) => {
    setDirtyEntries((current) => current[entryId] === dirty ? current : { ...current, [entryId]: dirty });
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/entries?start=${range.start}&end=${range.end}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response, "Catatan belum dapat dimuat."));
        return response.json() as Promise<LogbookEntry[]>;
      })
      .then((result) => {
        if (active) {
          setEntries(result);
          setDirtyEntries((current) => Object.fromEntries(
            result.map((entry) => [entry.id, current[entry.id] ?? false]),
          ));
          setSelectedEntryId((current) => result.some((entry) => entry.id === current) ? current : result[0]?.id ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setEntries([]);
          setLoadError({ key: loadKey, message: "Catatan belum dapat dimuat. Pastikan aplikasi sudah dijalankan." });
        }
      })
      .finally(() => { if (active) setLoadedRange(loadKey); });
    return () => {
      active = false;
    };
  }, [range.start, range.end, refreshKey, revision, loadKey]);

  async function save(entryId: string, draft: EntryDraft, sourceReviewed: boolean) {
    const response = await fetch(`${API_BASE}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
        source_reviewed: sourceReviewed,
      }),
    });
    if (!response.ok) throw new Error(await apiError(response, "Perubahan belum tersimpan."));
    const updated = await response.json() as LogbookEntry;
    setEntries((current) => current.map((entry) => entry.id === entryId ? updated : entry));
    return updated;
  }

  async function approve(entryId: string) {
    const response = await fetch(`${API_BASE}/entries/${entryId}/approve`, { method: "POST" });
    if (!response.ok) throw new Error(await apiError(response, "Catatan belum dapat disetujui."));
    const updated = await response.json() as LogbookEntry;
    setEntries((current) => current.map((entry) => entry.id === entryId ? updated : entry));
    return updated;
  }

  async function generateResult(entryId: string, activityText: string) {
    const response = await fetch(`${API_BASE}/entries/${entryId}/generate-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_text: activityText }),
    });
    if (!response.ok) throw new Error(await apiError(response, "Hasil belum dapat dibuat."));
    const result = await response.json() as { result_text: string };
    return result.result_text;
  }

  const eligibleCount = entries.filter((entry) =>
    entry.status === "draft"
      && !entry.entry_approved
      && !entry.source_conflict
      && !entry.start_time
      && !entry.end_time
      && Boolean((entry.activity_text ?? entry.original_activity ?? "").trim()),
  ).length;
  const documentationEligibleCount = entries.filter((entry) =>
    entry.status === "draft"
      && !entry.source_conflict
      && !entry.entry_approved
      && !entry.documentation_url?.trim()
      && Boolean((entry.activity_text ?? entry.original_activity ?? "").trim()),
  ).length;

  return (
    <section aria-labelledby="entries-title" className="mt-6">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-5 sm:p-7">
          <div>
            <h2 id="entries-title" className="card-title text-xl">Pratinjau dan persetujuan</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/70">
              Buka tanggal untuk memeriksa atau mengedit entri. Setujui entri sebelum menyiapkan batch.
            </p>
            <p className="mt-1 text-sm text-base-content/65">{formatDate(range.start)} sampai {formatDate(range.end)}</p>
          </div>

          <EntryDefaultHours
            range={range}
            eligibleCount={eligibleCount}
            documentationEligibleCount={documentationEligibleCount}
            onApplied={async () => setRevision((current) => current + 1)}
          />

          {error && <div role="alert" className="alert alert-warning text-sm">{error}</div>}
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Memuat catatan">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-24 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p role="status" className="rounded-box bg-base-200 p-4 text-sm leading-6 text-base-content/75">
              Belum ada entri tersimpan pada rentang ini. Hubungkan Google Docs dan periksa periode untuk memuat catatan.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
              <nav aria-label="Pilih tanggal entri" className="max-h-56 overflow-y-auto rounded-box border border-base-300 bg-base-200/60 p-2 lg:sticky lg:top-4 lg:max-h-[38rem]">
                <p className="px-2 py-2 text-sm font-medium">{entries.length} tanggal</p>
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const dirty = Boolean(dirtyEntries[entry.id]);
                    const statusLabel = dirty
                      ? "Belum disimpan"
                      : entry.status === "submitted"
                        ? "Menunggu"
                        : entry.status === "skipped"
                          ? "Izin"
                          : entry.status === "verification_needed"
                            ? "Periksa"
                            : entry.source_conflict || entry.status === "needs_review"
                              ? "Tinjau"
                              : entry.entry_approved || entry.status === "approved"
                                ? "Disetujui"
                                : "Draf";
                    const statusTextColor = dirty || entry.source_conflict || entry.status === "needs_review" || entry.status === "submitted"
                      ? "text-warning-content"
                      : entry.entry_approved || entry.status === "approved"
                        ? "text-success-content"
                        : "text-base-content/65";

                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-label={`${formatShortDate(entry.date)}, ${statusLabel}`}
                        title={statusLabel}
                        aria-pressed={entry.id === selectedEntryId}
                        onClick={() => setSelectedEntryId(entry.id)}
                        className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-box px-3 py-2.5 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${entry.id === selectedEntryId ? "bg-base-100 font-semibold shadow-sm ring-1 ring-base-300" : "hover:bg-base-100/70"}`}
                      >
                        <span className="whitespace-nowrap">{formatShortDate(entry.date)}</span>
                        <span className={`shrink-0 text-xs ${statusTextColor}`}>{statusLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              <div id="entry-detail" className="min-w-0">
                {selectedEntry ? entries.map((entry) => (
                  <div key={entry.id} hidden={entry.id !== selectedEntry.id}>
                    <LogbookEntryRow
                      entry={entry}
                      onSave={save}
                      onApprove={approve}
                      onGenerateResult={generateResult}
                      onDirtyChange={handleDirtyChange}
                    />
                  </div>
                )) : <p className="text-sm text-base-content/70">Pilih tanggal untuk melihat entri.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
