"use client";

import { useState } from "react";

export type LogbookEntry = {
  id: string;
  date: string;
  week_number: number | null;
  original_activity: string | null;
  activity_text: string | null;
  result_text: string | null;
  obstacle_text: string | null;
  start_time: string | null;
  end_time: string | null;
  documentation_url: string | null;
  entry_approved: boolean;
  source_conflict: boolean;
  status: string;
};

export type EntryDraft = {
  activity_text: string;
  result_text: string;
  obstacle_text: string;
  start_time: string;
  end_time: string;
  documentation_url: string;
};

type Props = {
  entry: LogbookEntry;
  onSave: (entryId: string, draft: EntryDraft, sourceReviewed: boolean) => Promise<LogbookEntry>;
  onApprove: (entryId: string) => Promise<LogbookEntry>;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  needs_review: "Perlu ditinjau",
  approved: "Disetujui",
  skipped: "Izin / sakit",
  processing: "Diproses",
  submitted: "Terkirim",
  verification_needed: "Perlu diperiksa",
};

function draftFrom(entry: LogbookEntry): EntryDraft {
  return {
    activity_text: entry.activity_text ?? entry.original_activity ?? "",
    result_text: entry.result_text ?? "",
    obstacle_text: entry.obstacle_text ?? "",
    start_time: entry.start_time ?? "",
    end_time: entry.end_time ?? "",
    documentation_url: entry.documentation_url ?? "",
  };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function LogbookEntryRow({ entry, onSave, onApprove }: Props) {
  const [draft, setDraft] = useState(() => draftFrom(entry));
  const [sourceReviewed, setSourceReviewed] = useState(false);
  const [previousEntry, setPreviousEntry] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (previousEntry !== entry) {
    setPreviousEntry(entry);
    setDraft(draftFrom(entry));
    setSourceReviewed(false);
    setError("");
    setSaved(false);
  }

  const isReadOnly = ["skipped", "processing", "submitted", "verification_needed"].includes(entry.status);
  const dirty = (entry.source_conflict && sourceReviewed)
    || (entry.activity_text === null && entry.original_activity !== null && draft.activity_text === entry.original_activity)
    || Object.keys(draft).some(
    (key) => draft[key as keyof EntryDraft] !== draftFrom(entry)[key as keyof EntryDraft],
  );
  const validation = entry.source_conflict && !sourceReviewed
    ? "Tinjau perubahan sumber sebelum menyetujui."
    : !draft.activity_text.trim()
      ? "Uraian kegiatan perlu diisi."
      : !draft.start_time || !draft.end_time
        ? "Isi jam mulai dan jam selesai."
        : draft.start_time >= draft.end_time
          ? "Jam selesai harus setelah jam mulai."
          : dirty
            ? "Simpan perubahan sebelum menyetujui."
            : entry.status === "needs_review"
              ? "Lengkapi dan simpan catatan yang perlu ditinjau."
              : "";
  const statusLabel = dirty ? "Perubahan belum disimpan" : STATUS_LABELS[entry.status] ?? "Draf";

  function updateField(field: keyof EntryDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await onSave(entry.id, draft, sourceReviewed);
      setDraft(draftFrom(updated));
      setSourceReviewed(false);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan belum tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    setApproving(true);
    setError("");
    try {
      await onApprove(entry.id);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Catatan belum dapat disetujui.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <tr>
      <td className="min-w-36 align-top">
        <p className="whitespace-nowrap font-medium">{displayDate(entry.date)}</p>
        {entry.week_number && <p className="mt-1 text-xs text-base-content/65">Minggu {entry.week_number}</p>}
        <span className={`badge mt-2 ${dirty || entry.status === "needs_review" || entry.source_conflict ? "badge-warning" : entry.status === "approved" ? "badge-success" : "badge-outline"}`}>
          {statusLabel}
        </span>
      </td>
      <td className="min-w-[28rem] align-top">
        <details className="collapse collapse-arrow mb-3 rounded-box bg-base-200">
          <summary className="collapse-title min-h-0 py-2 text-sm font-medium">Teks dari dokumen</summary>
          <div className="collapse-content whitespace-pre-wrap text-sm leading-6">
            {entry.original_activity || "Kolom kegiatan belum dikenali pada dokumen."}
          </div>
        </details>
        <label className="form-control mb-3">
          <span className="label py-1"><span className="label-text text-xs font-medium">Uraian kegiatan</span></span>
          <textarea className="textarea textarea-bordered min-h-20 w-full bg-base-100" value={draft.activity_text} disabled={isReadOnly} maxLength={10000} onChange={(event) => updateField("activity_text", event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label py-1"><span className="label-text text-xs font-medium">Hasil</span></span>
            <textarea className="textarea textarea-bordered min-h-16 w-full bg-base-100" value={draft.result_text} disabled={isReadOnly} maxLength={5000} onChange={(event) => updateField("result_text", event.target.value)} />
          </label>
          <label className="form-control">
            <span className="label py-1"><span className="label-text text-xs font-medium">Kendala</span></span>
            <textarea className="textarea textarea-bordered min-h-16 w-full bg-base-100" value={draft.obstacle_text} disabled={isReadOnly} maxLength={5000} onChange={(event) => updateField("obstacle_text", event.target.value)} />
          </label>
        </div>
        {entry.source_conflict && (
          <label className="label mt-3 cursor-pointer justify-start gap-3 whitespace-normal">
            <input type="checkbox" className="checkbox checkbox-warning" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />
            <span className="label-text text-sm">Saya sudah meninjau perubahan pada dokumen sumber.</span>
          </label>
        )}
      </td>
      <td className="min-w-48 align-top">
        <div className="grid grid-cols-2 gap-2">
          <label className="form-control">
            <span className="label py-1"><span className="label-text text-xs">Mulai</span></span>
            <input className="input input-bordered input-sm w-full bg-base-100" type="time" value={draft.start_time} disabled={isReadOnly} onChange={(event) => updateField("start_time", event.target.value)} />
          </label>
          <label className="form-control">
            <span className="label py-1"><span className="label-text text-xs">Selesai</span></span>
            <input className="input input-bordered input-sm w-full bg-base-100" type="time" value={draft.end_time} disabled={isReadOnly} onChange={(event) => updateField("end_time", event.target.value)} />
          </label>
        </div>
        <label className="form-control mt-3">
          <span className="label py-1"><span className="label-text text-xs font-medium">Dokumentasi</span></span>
          <input className="input input-bordered input-sm w-full bg-base-100" type="url" value={draft.documentation_url} disabled={isReadOnly} maxLength={2048} onChange={(event) => updateField("documentation_url", event.target.value)} />
        </label>
      </td>
      <td className="min-w-48 align-top">
        {entry.source_conflict && <p className="mb-2 text-sm text-warning-content">Sumber berubah. Periksa teks sebelum menyetujui.</p>}
        {error && <p role="alert" className="mb-2 text-sm text-error">{error}</p>}
        {saved && <p role="status" className="mb-2 text-sm text-success-content">Perubahan tersimpan.</p>}
        {!isReadOnly && (
          <div className="space-y-2">
            <button type="button" className="btn btn-outline btn-sm w-full" disabled={!dirty || saving} onClick={save}>
              {saving ? "Menyimpan…" : "Simpan perubahan"}
            </button>
            <button type="button" className="btn btn-primary btn-sm w-full" disabled={Boolean(validation) || approving || entry.entry_approved} onClick={approve}>
              {approving ? "Menyetujui…" : entry.entry_approved ? "Sudah disetujui" : "Setujui entri"}
            </button>
            {validation && !entry.entry_approved && <p className="text-xs leading-5 text-base-content/65">{validation}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}
