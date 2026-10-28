"use client";

import { useEffect, useState, type FormEvent } from "react";

import { API_BASE, apiError } from "../lib/api";

type DateRange = { start: string; end: string };
type DefaultHours = { default_start_time: string | null; default_end_time: string | null };

type Props = {
  range: DateRange;
  eligibleCount: number;
  onApplied: () => Promise<void>;
};

export function EntryDefaultHours({ range, eligibleCount, onApplied }: Props) {
  const [hours, setHours] = useState<DefaultHours>({ default_start_time: null, default_end_time: null });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/entries/default-hours`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response, "Pengaturan jam belum dapat dibaca."));
        return response.json() as Promise<DefaultHours>;
      })
      .then((result) => {
        if (!active) return;
        setHours(result);
        setStartTime(result.default_start_time ?? "");
        setEndTime(result.default_end_time ?? "");
      })
      .catch(() => {
        if (active) setError("Pengaturan jam belum dapat dibaca. Coba muat ulang halaman.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hoursDirty = startTime !== (hours.default_start_time ?? "")
    || endTime !== (hours.default_end_time ?? "");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(startTime) !== Boolean(endTime)) {
      setError("Isi jam mulai dan jam selesai, atau kosongkan keduanya.");
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
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Jam bawaan belum tersimpan."));
      const result = await response.json() as DefaultHours;
      setHours(result);
      setStartTime(result.default_start_time ?? "");
      setEndTime(result.default_end_time ?? "");
      setConfirming(false);
      setMessage("Jam bawaan tersimpan.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Jam bawaan belum tersimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function apply() {
    setApplying(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/entries/default-hours/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...range, confirmed: true }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Jam bawaan belum diterapkan."));
      const result = await response.json() as { updated: number };
      setConfirming(false);
      setMessage(`Jam diterapkan ke ${result.updated} entri.`);
      await onApplied();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Jam bawaan belum diterapkan.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <details className="collapse collapse-arrow border-y border-base-300">
      <summary className="collapse-title min-h-0 px-0 font-semibold">Jam kerja bawaan</summary>
      <div className="collapse-content px-0">
        <p className="mb-4 max-w-2xl text-sm leading-6 text-base-content/70">
          Jam ini hanya menjadi pilihan. Terapkan ke catatan yang belum memiliki jam setelah meninjau jumlah dan rentangnya.
        </p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={save}>
          <label className="form-control w-36">
            <span className="label py-1"><span className="label-text text-xs">Mulai</span></span>
          <input className="input input-bordered input-sm bg-base-100" type="time" value={startTime} disabled={loading} onChange={(event) => { setStartTime(event.target.value); setError(""); setConfirming(false); }} />
          </label>
          <label className="form-control w-36">
            <span className="label py-1"><span className="label-text text-xs">Selesai</span></span>
          <input className="input input-bordered input-sm bg-base-100" type="time" value={endTime} disabled={loading} onChange={(event) => { setEndTime(event.target.value); setError(""); setConfirming(false); }} />
          </label>
          <button type="submit" className="btn btn-outline btn-sm" disabled={loading || saving}>
            {saving ? "Menyimpan…" : "Simpan jam bawaan"}
          </button>
        </form>

        {hoursDirty && eligibleCount > 0 && <p className="mt-3 text-xs text-base-content/65">Simpan perubahan jam bawaan sebelum menerapkannya.</p>}
        {!hoursDirty && hours.default_start_time && hours.default_end_time && eligibleCount > 0 && !confirming && (
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => { setConfirming(true); setError(""); setMessage(""); }}>
            Tinjau penerapan ke {eligibleCount} entri
          </button>
        )}

        {confirming && (
          <div className="alert alert-warning mt-4 items-start">
            <div className="space-y-2">
              <p className="font-semibold">
                Terapkan {hours.default_start_time}–{hours.default_end_time} ke {eligibleCount} entri dalam rentang ini?
              </p>
              <p className="text-sm leading-6">Entri tetap berstatus draf dan belum disetujui.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="btn btn-primary btn-sm" disabled={applying} onClick={apply}>
                  {applying ? "Menerapkan…" : "Ya, terapkan jam"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={applying} onClick={() => setConfirming(false)}>Batal</button>
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
