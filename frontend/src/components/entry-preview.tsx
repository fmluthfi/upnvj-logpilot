"use client";

import { useEffect, useState } from "react";

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

export function EntryPreview({ range, refreshKey }: Props) {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [loadedRange, setLoadedRange] = useState("");
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const loadKey = `${range.start}|${range.end}|${refreshKey}|${revision}`;
  const loading = loadedRange !== loadKey;
  const error = loadError?.key === loadKey ? loadError.message : "";

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

  const eligibleCount = entries.filter((entry) =>
    entry.status === "draft"
      && !entry.source_conflict
      && !entry.start_time
      && !entry.end_time
      && Boolean((entry.activity_text ?? entry.original_activity ?? "").trim()),
  ).length;

  return (
    <section aria-labelledby="entries-title" className="mt-6">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5 p-5 sm:p-7">
          <div>
            <h2 id="entries-title" className="card-title text-xl">Pratinjau dan persetujuan</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/70">
              Sunting setiap entri, lengkapi jam, lalu setujui secara terpisah.
            </p>
            <p className="mt-1 text-sm text-base-content/65">{formatDate(range.start)} — {formatDate(range.end)}</p>
          </div>

          <EntryDefaultHours
            key={`${range.start}|${range.end}`}
            range={range}
            eligibleCount={eligibleCount}
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
            <div className="overflow-x-auto">
              <table className="table table-zebra min-w-[78rem]">
                <thead>
                  <tr><th>Tanggal</th><th>Isi entri</th><th>Jam dan dokumentasi</th><th>Persetujuan</th></tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <LogbookEntryRow key={entry.id} entry={entry} onSave={save} onApprove={approve} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
