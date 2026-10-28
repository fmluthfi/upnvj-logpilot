"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

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
  onGenerateResult: (entryId: string, activityText: string) => Promise<string>;
  onDirtyChange?: (entryId: string, dirty: boolean) => void;
};

const TIME_24H = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

export function LogbookEntryRow({ entry, onSave, onApprove, onGenerateResult, onDirtyChange }: Props) {
  const [draft, setDraft] = useState(() => draftFrom(entry));
  const [sourceReviewed, setSourceReviewed] = useState(false);
  const [previousEntry, setPreviousEntry] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatingResult, setGeneratingResult] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (previousEntry !== entry) {
    setPreviousEntry(entry);
    setDraft(draftFrom(entry));
    setSourceReviewed(false);
    setError("");
    setSaved(false);
  }

  const isReadOnly = ["skipped", "processing", "verification_needed"].includes(entry.status);
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
        : !TIME_24H.test(draft.start_time) || !TIME_24H.test(draft.end_time)
          ? "Gunakan format 24 jam HH:MM, misalnya 09:00."
        : draft.start_time >= draft.end_time
          ? "Jam selesai harus setelah jam mulai."
          : dirty
            ? "Simpan perubahan sebelum menyetujui."
            : entry.status === "needs_review"
              ? "Lengkapi dan simpan catatan yang perlu ditinjau."
              : "";
  const approved = entry.entry_approved || entry.status === "approved";
  const statusLabel = dirty
    ? "Perubahan belum disimpan"
    : entry.status === "submitted"
      ? "Menunggu validasi"
      : approved
        ? "Disetujui"
        : STATUS_LABELS[entry.status] ?? "Draf";

  useEffect(() => onDirtyChange?.(entry.id, dirty), [entry.id, dirty, onDirtyChange]);

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

  async function generateResult() {
    setGeneratingResult(true);
    setError("");
    setSaved(false);
    try {
      updateField("result_text", await onGenerateResult(entry.id, draft.activity_text));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Hasil belum dapat dibuat.");
    } finally {
      setGeneratingResult(false);
    }
  }

  return (
    <article className="min-w-0 space-y-6 px-2 py-2 sm:space-y-7 sm:px-4 sm:py-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg font-semibold">{displayDate(entry.date)}</h3>
        {entry.week_number && <span className="text-sm text-base-content/65">Minggu {entry.week_number}</span>}
        <span className={`badge whitespace-nowrap ${dirty || entry.status === "needs_review" || entry.source_conflict || entry.status === "submitted" ? "badge-warning" : approved ? "badge-success" : "badge-outline"}`}>
          {statusLabel}
        </span>
      </header>

      {entry.status === "submitted" && dirty && (
        <p className="text-sm text-base-content/70">Perubahan perlu disimpan dan disetujui ulang sebelum dikirim ke portal.</p>
      )}

      {entry.source_conflict && (
        <div className="rounded-box bg-warning/40 p-4">
          <p className="text-sm font-medium">Teks dari dokumen sumber</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{entry.original_activity || "Kolom kegiatan belum dikenali pada dokumen."}</p>
        </div>
      )}

      <label className="form-control gap-1">
        <span className="label py-1"><span className="label-text text-sm font-medium">Uraian kegiatan</span></span>
        <textarea className="textarea textarea-bordered min-h-28 w-full bg-base-100" value={draft.activity_text} disabled={isReadOnly || generatingResult} maxLength={10000} onChange={(event) => updateField("activity_text", event.target.value)} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
        <div className="form-control min-w-0 gap-1">
          <span className="flex min-h-11 items-center text-sm font-medium">Hasil</span>
          <textarea className="textarea textarea-bordered min-h-28 w-full bg-base-100" value={draft.result_text} disabled={isReadOnly} maxLength={5000} onChange={(event) => updateField("result_text", event.target.value)} />
          {!isReadOnly && (
            <button type="button" aria-label="Buat hasil dengan AI menggunakan Groq" className="btn btn-primary btn-ai-compact mt-2 self-start" disabled={!draft.activity_text.trim() || generatingResult || saving || approving} onClick={generateResult}>
              <Image src="/groq-mark.svg" width={12} height={18} alt="" aria-hidden="true" unoptimized className="h-[18px] w-3 shrink-0 object-contain" />
              <span>{generatingResult ? "Membuat…" : "Buat dengan AI"}</span>
            </button>
          )}
        </div>
        <label className="form-control min-w-0 gap-1">
          <span className="flex min-h-11 items-center text-sm font-medium">Kendala</span>
          <textarea className="textarea textarea-bordered min-h-28 w-full bg-base-100" value={draft.obstacle_text} disabled={isReadOnly} maxLength={5000} onChange={(event) => updateField("obstacle_text", event.target.value)} />
        </label>
      </div>

      <section aria-label="Jam kerja dan dokumentasi" className="grid gap-5 border-t border-base-300 pt-6 sm:grid-cols-2 sm:gap-6">
        <label className="form-control min-w-0 gap-1">
          <span className="label py-1"><span className="label-text text-sm font-medium">Mulai</span></span>
          <input className="input input-bordered w-full bg-base-100" type="text" inputMode="text" placeholder="09:00" maxLength={5} value={draft.start_time} disabled={isReadOnly} onChange={(event) => updateField("start_time", event.target.value)} />
        </label>
        <label className="form-control min-w-0 gap-1">
          <span className="label py-1"><span className="label-text text-sm font-medium">Selesai</span></span>
          <input className="input input-bordered w-full bg-base-100" type="text" inputMode="text" placeholder="17:00" maxLength={5} value={draft.end_time} disabled={isReadOnly} onChange={(event) => updateField("end_time", event.target.value)} />
        </label>
        <p className="-mt-2 text-xs text-base-content/65 sm:col-span-2">Format 24 jam: HH:MM.</p>
        <label className="form-control min-w-0 gap-1 sm:col-span-2">
          <span className="label py-1"><span className="label-text text-sm font-medium">Dokumentasi</span></span>
          <input className="input input-bordered min-w-0 w-full bg-base-100" type="url" placeholder="Tautan dokumentasi" value={draft.documentation_url} disabled={isReadOnly} maxLength={2048} onChange={(event) => updateField("documentation_url", event.target.value)} />
        </label>
      </section>

      {entry.source_conflict && (
        <label className="label cursor-pointer justify-start gap-3 whitespace-normal">
          <input type="checkbox" className="checkbox checkbox-warning" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />
          <span className="label-text text-sm">Saya sudah meninjau perubahan pada dokumen sumber.</span>
        </label>
      )}
      {error && <p role="alert" className="text-sm text-error-content">{error}</p>}
      {saved && <p role="status" className="text-sm text-success-content">Perubahan tersimpan.</p>}
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-3 border-t border-base-300 pt-6">
          {dirty && (
            <button type="button" className="btn btn-primary" disabled={saving || generatingResult} onClick={save}>
              {saving ? "Menyimpan…" : "Simpan perubahan"}
            </button>
          )}
          {!approved && !dirty && (
            <button type="button" className="btn btn-primary" disabled={Boolean(validation) || approving || generatingResult} onClick={approve}>
              {approving ? "Menyetujui…" : "Setujui entri"}
            </button>
          )}
          {!approved && !dirty && validation && <p className="text-sm leading-5 text-base-content/65">{validation}</p>}
        </div>
      )}
    </article>
  );
}
