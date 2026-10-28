"use client";

import { useEffect, useState, type FormEvent } from "react";

import { API_BASE, apiError } from "../lib/api";

type DateRange = { start: string; end: string };
type DefaultSettings = {
  default_start_time: string | null;
  default_end_time: string | null;
  default_documentation_url: string | null;
};

type Props = {
  range: DateRange;
  eligibleCount: number;
  documentationEligibleCount: number;
  onApplied: () => Promise<void>;
};

const TIME_24H = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function EntryDefaultHours({ range, eligibleCount, documentationEligibleCount, onApplied }: Props) {
  const [settings, setSettings] = useState<DefaultSettings>({
    default_start_time: null,
    default_end_time: null,
    default_documentation_url: null,
  });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [documentationUrl, setDocumentationUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState<"hours" | "documentation" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/entries/default-hours`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response, "Pengaturan jam belum dapat dibaca."));
        return response.json() as Promise<DefaultSettings>;
      })
      .then((result) => {
        if (!active) return;
        setSettings(result);
        setStartTime(result.default_start_time ?? "");
        setEndTime(result.default_end_time ?? "");
        setDocumentationUrl(result.default_documentation_url ?? "");
      })
      .catch(() => {
        if (active) setError("Pengaturan bawaan belum dapat dibaca. Coba muat ulang halaman.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hoursDirty = startTime !== (settings.default_start_time ?? "")
    || endTime !== (settings.default_end_time ?? "");
  const documentationDirty = documentationUrl.trim() !== (settings.default_documentation_url ?? "");
  const settingsDirty = hoursDirty || documentationDirty;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(startTime) !== Boolean(endTime)) {
      setError("Isi jam mulai dan jam selesai, atau kosongkan keduanya.");
      return;
    }
    if ((startTime && !TIME_24H.test(startTime)) || (endTime && !TIME_24H.test(endTime))) {
      setError("Gunakan format 24 jam HH:MM, misalnya 09:00.");
      return;
    }
    if (startTime && endTime && startTime >= endTime) {
      setError("Jam selesai harus setelah jam mulai.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/entries/default-hours`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_start_time: startTime || null,
          default_end_time: endTime || null,
          default_documentation_url: documentationUrl.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Pengaturan bawaan belum tersimpan."));
      const result = await response.json() as DefaultSettings;
      setSettings(result);
      setStartTime(result.default_start_time ?? "");
      setEndTime(result.default_end_time ?? "");
      setDocumentationUrl(result.default_documentation_url ?? "");
      setConfirming(null);
      setMessage("Pengaturan bawaan tersimpan.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Pengaturan bawaan belum tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function apply(kind: "hours" | "documentation") {
    setApplying(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/entries/default-hours/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...range,
          confirmed: true,
          apply_hours: kind === "hours",
          apply_documentation: kind === "documentation",
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Pengaturan bawaan belum diterapkan."));
      const result = await response.json() as { updated: number; documentation_updated: number };
      setConfirming(null);
      setMessage(kind === "hours"
        ? `Jam diterapkan ke ${result.updated} entri.`
        : `Dokumentasi diterapkan ke ${result.documentation_updated} entri.`);
      await onApplied();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Pengaturan bawaan belum diterapkan.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <details className="collapse collapse-arrow border-y border-base-300">
      <summary className="collapse-title min-h-0 px-0 font-semibold">Jam kerja dan dokumentasi bawaan</summary>
      <div className="collapse-content px-0">
        <p className="mb-4 max-w-2xl text-sm leading-6 text-base-content/70">
          Atur jam kerja dan tautan dokumentasi yang bisa dipakai bersama. Setiap entri tetap dapat diubah secara manual.
        </p>
        <form onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-control w-full">
              <span className="label py-1"><span className="label-text text-xs">Mulai</span></span>
              <input className="input input-bordered input-sm w-full bg-base-100" type="text" inputMode="text" placeholder="09:00" maxLength={5} value={startTime} disabled={loading} onChange={(event) => { setStartTime(event.target.value); setError(""); setConfirming(null); }} />
            </label>
            <label className="form-control w-full">
              <span className="label py-1"><span className="label-text text-xs">Selesai</span></span>
              <input className="input input-bordered input-sm w-full bg-base-100" type="text" inputMode="text" placeholder="17:00" maxLength={5} value={endTime} disabled={loading} onChange={(event) => { setEndTime(event.target.value); setError(""); setConfirming(null); }} />
            </label>
            <label className="form-control w-full sm:col-span-2">
              <span className="label py-1"><span className="label-text text-xs">Dokumentasi bawaan</span></span>
              <input className="input input-bordered input-sm w-full bg-base-100" type="url" autoComplete="off" spellCheck={false} placeholder="Tempel tautan file atau folder Google Drive" value={documentationUrl} disabled={loading} maxLength={2048} onChange={(event) => { setDocumentationUrl(event.target.value); setError(""); setConfirming(null); }} />
              <span className="label py-1"><span className="label-text-alt">Tautan ini mengisi entri baru dan entri kosong yang kamu pilih. Tautan manual tetap dipertahankan.</span></span>
            </label>
          </div>
          <p className="mt-2 text-xs leading-5 text-base-content/65">Jam menggunakan format 24 jam HH:MM, misalnya 09:00.</p>
          <button type="submit" className="btn btn-outline btn-sm mt-4" disabled={loading || saving || !settingsDirty}>
            {saving ? "Menyimpan…" : "Simpan pengaturan bawaan"}
          </button>
        </form>

        {hoursDirty && eligibleCount > 0 && <p className="mt-3 text-xs text-base-content/65">Simpan perubahan jam sebelum menerapkannya.</p>}
        {!hoursDirty && settings.default_start_time && settings.default_end_time && eligibleCount > 0 && !confirming && (
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => { setConfirming("hours"); setError(""); setMessage(""); }}>
            Tinjau penerapan ke {eligibleCount} entri
          </button>
        )}
        {documentationDirty && documentationEligibleCount > 0 && <p className="mt-3 text-xs text-base-content/65">Simpan perubahan tautan sebelum menerapkannya.</p>}
        {!documentationDirty && settings.default_documentation_url && documentationEligibleCount > 0 && !confirming && (
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => { setConfirming("documentation"); setError(""); setMessage(""); }}>
            Tinjau dokumentasi untuk {documentationEligibleCount} entri
          </button>
        )}

        {confirming && (
          <div className="alert alert-warning mt-4 items-start">
            <div className="space-y-2">
              {confirming === "hours" ? (
                <>
                  <p className="font-semibold">Terapkan {settings.default_start_time}–{settings.default_end_time} ke {eligibleCount} entri dalam rentang ini?</p>
                  <p className="text-sm leading-6">Entri tetap berstatus draf dan belum disetujui.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Isi dokumentasi yang kosong pada {documentationEligibleCount} entri dalam rentang ini?</p>
                  <p className="break-all text-sm leading-6">{settings.default_documentation_url}</p>
                  <p className="text-sm leading-6">Tautan yang sudah diisi manual tidak akan diganti.</p>
                </>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="btn btn-primary btn-sm" disabled={applying} onClick={() => apply(confirming)}>
                  {applying ? "Menerapkan…" : confirming === "hours" ? "Ya, terapkan jam" : "Ya, terapkan dokumentasi"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={applying} onClick={() => setConfirming(null)}>Batal</button>
              </div>
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
        {message && <p role="status" className="mt-3 text-sm text-success-content">{message}</p>}
      </div>
    </details>
  );
}
