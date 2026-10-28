"use client";

import { useEffect, useState } from "react";

import { API_BASE, apiError } from "../lib/api";

type DateRange = { start: string; end: string };
type Props = { range: DateRange; refreshKey: number };
type ReflectionDay = {
  date: string;
  status: "filled" | "leave" | "missing" | "needs_review";
  entries: { activity: string; result: string; obstacle: string }[];
};
type WeeklyReflection = {
  friday_date: string;
  week_start: string;
  source_hash: string;
  days: ReflectionDay[];
  missing_dates: string[];
  has_conflicts: boolean;
  reflection_text: string;
  approved: boolean;
  stale: boolean;
  previously_approved: boolean;
};

const DAY_STATUS = {
  filled: "Ada catatan",
  leave: "Izin / non-kerja",
  missing: "Tidak ada catatan",
  needs_review: "Perlu ditinjau",
} as const;

function fridayFor(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay();
  const daysFromFriday = weekday === 0 ? -2 : weekday === 6 ? -1 : 5 - weekday;
  date.setUTCDate(date.getUTCDate() + daysFromFriday);
  return date.toISOString().slice(0, 10);
}

function fridaysInRange(range: DateRange) {
  const first = Date.parse(`${fridayFor(range.start)}T00:00:00Z`);
  const last = Date.parse(`${fridayFor(range.end)}T00:00:00Z`);
  const fridays = [];
  for (let time = first; time <= last; time += 7 * 86_400_000) {
    fridays.push(new Date(time).toISOString().slice(0, 10));
  }
  return fridays;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function WeeklyReflectionEditor({ range, refreshKey }: Props) {
  const weeks = fridaysInRange(range);
  const [friday, setFriday] = useState(() => fridayFor(range.end));
  const [data, setData] = useState<WeeklyReflection | null>(null);
  const [draft, setDraft] = useState("");
  const loadKey = `${friday}|${refreshKey}`;
  const [loadState, setLoadState] = useState<{ key: string; error: string } | null>(null);
  const [actionError, setActionError] = useState("");
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [sourceReviewed, setSourceReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const loading = loadState?.key !== loadKey;
  const loadError = loadState?.key === loadKey ? loadState.error : "";
  const dirty = Boolean(data && (draft !== data.reflection_text || data.stale));
  const hasFacts = Boolean(data?.days.some((day) => day.entries.some((entry) =>
    entry.activity.trim() || entry.result.trim() || entry.obstacle.trim(),
  )));

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/reflections/${friday}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response, "Refleksi belum dapat dimuat."));
        return response.json() as Promise<WeeklyReflection>;
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setDraft(result.reflection_text);
        setPrivacyConfirmed(false);
        setSourceReviewed(false);
        setActionError("");
        setLoadState({ key: loadKey, error: "" });
      })
      .catch((error) => {
        if (!active) return;
        setData(null);
        setLoadState({
          key: loadKey,
          error: error instanceof Error ? error.message : "Refleksi belum dapat dimuat.",
        });
      });
    return () => { active = false; };
  }, [friday, refreshKey, loadKey]);

  async function generate() {
    if (!data) return;
    setBusy("generate");
    setActionError("");
    try {
      const response = await fetch(`${API_BASE}/reflections/${friday}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_hash: data.source_hash,
          privacy_confirmed: privacyConfirmed,
          regenerate: Boolean(data.reflection_text && !data.stale),
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Refleksi belum dapat dibuat."));
      const result = await response.json() as WeeklyReflection;
      setData(result);
      setDraft(result.reflection_text);
      setPrivacyConfirmed(false);
      setSourceReviewed(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Refleksi belum dapat dibuat.");
    } finally {
      setBusy("");
    }
  }

  async function saveDraft() {
    if (!data) return;
    setBusy("save");
    setActionError("");
    try {
      const response = await fetch(`${API_BASE}/reflections/${friday}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_hash: data.source_hash,
          reflection_text: draft,
          source_reviewed: sourceReviewed,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Draf refleksi belum tersimpan."));
      const result = await response.json() as WeeklyReflection;
      setData(result);
      setDraft(result.reflection_text);
      setSourceReviewed(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Draf refleksi belum tersimpan.");
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    if (!data) return;
    setBusy("approve");
    setActionError("");
    try {
      const response = await fetch(`${API_BASE}/reflections/${friday}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_hash: data.source_hash }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Refleksi belum dapat disetujui."));
      setData(await response.json() as WeeklyReflection);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Refleksi belum dapat disetujui.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="reflection-title" className="mt-6">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="reflection-title" className="card-title text-xl">Refleksi mingguan</h2>
              <p className="mt-1 text-sm leading-6 text-base-content/70">
                Pilih Jumat. Catatan yang dibaca mencakup Senin sampai Jumat pada pekan tersebut.
              </p>
            </div>
            <label className="form-control w-full sm:w-64">
              <span className="label py-1"><span className="label-text text-xs">Pekan berakhir</span></span>
              <select className="select select-bordered bg-base-100" value={friday} onChange={(event) => setFriday(event.target.value)}>
                {weeks.map((value) => <option key={value} value={value}>{displayDate(value)}</option>)}
              </select>
            </label>
          </div>

          {loadError && <div role="alert" className="alert alert-warning text-sm">{loadError}</div>}
          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Memuat refleksi">
              <div className="skeleton h-8 w-48" />
              <div className="skeleton h-24 w-full" />
            </div>
          ) : data && (
            <>
              {data.missing_dates.length > 0 && (
                <div role="note" className="alert alert-warning items-start text-sm">
                  <p>
                    Tidak ada catatan untuk {data.missing_dates.map(displayDate).join(", ")}. Hari tersebut tidak akan dianggap sebagai hari kerja.
                  </p>
                </div>
              )}

              {data.has_conflicts && (
                <div role="alert" className="alert alert-warning items-start text-sm">
                  Ada perubahan pada dokumen sumber. Tinjau dan selesaikan konflik pada entri harian sebelum membuat atau menyetujui refleksi.
                </div>
              )}

              {data.stale && (
                <div role="alert" className="alert alert-warning items-start text-sm">
                  {data.previously_approved
                    ? "Persetujuan refleksi sebelumnya tidak berlaku untuk catatan sumber terbaru."
                    : "Catatan sumber berubah sejak draf ini dibuat."} Buat ulang refleksi atau tinjau ulang sebelum menyimpan.
                </div>
              )}

              <div className="divide-y divide-base-300 rounded-box border border-base-300 px-4">
                {data.days.map((day) => (
                  <div key={day.date} className="grid gap-2 py-3 sm:grid-cols-[12rem_1fr] sm:items-start">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{displayDate(day.date)}</span>
                      <span className={`badge ${day.status === "filled" ? "badge-success" : day.status === "needs_review" ? "badge-warning" : "badge-outline"}`}>
                        {DAY_STATUS[day.status]}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm leading-6 text-base-content/80">
                      {day.entries.length ? day.entries.map((entry, index) => (
                        <div key={`${day.date}-${index}`}>
                          {entry.activity && <p>{entry.activity}</p>}
                          {entry.result && <p className="text-base-content/65">Hasil: {entry.result}</p>}
                          {entry.obstacle && <p className="text-base-content/65">Kendala: {entry.obstacle}</p>}
                        </div>
                      )) : (
                        <p className="text-base-content/65">
                          {day.status === "leave" ? "Izin atau hari non-kerja tercatat; rinciannya tidak dikirim ke Gemini." : day.status === "missing" ? "Belum ada entri pada sumber." : "Isi entri perlu ditinjau."}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <label className="form-control">
                <span className="label py-1"><span className="label-text font-medium">Draf refleksi</span></span>
                <textarea
                  className="textarea textarea-bordered min-h-36 bg-base-100 leading-6"
                  maxLength={1500}
                  value={draft}
                  disabled={busy !== ""}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <span className="label py-1"><span className="label-text-alt">{draft.length}/1500 karakter</span></span>
              </label>

              {data.stale && (
                <label className="label cursor-pointer justify-start gap-3 whitespace-normal">
                  <input type="checkbox" className="checkbox checkbox-warning" checked={sourceReviewed} onChange={(event) => setSourceReviewed(event.target.checked)} />
                  <span className="label-text text-sm">Saya sudah meninjau catatan sumber terbaru dan memperbarui refleksi ini.</span>
                </label>
              )}

              <div className="alert alert-info items-start text-sm leading-6">
                <p>
                  Membuat draf mengirim kegiatan, hasil, dan kendala pekan ini ke Gemini. Email, nomor telepon, NIM/NPM/NIK disamarkan; tautan dokumentasi dan rincian izin tidak dikirim. Periksa informasi sensitif lain sebelum lanjut.
                </p>
              </div>
              <label className="label cursor-pointer justify-start gap-3 whitespace-normal">
                <input type="checkbox" className="checkbox checkbox-primary" checked={privacyConfirmed} onChange={(event) => setPrivacyConfirmed(event.target.checked)} />
                <span className="label-text text-sm">Saya telah meninjau catatan dan memastikan isinya aman dikirim ke Gemini.</span>
              </label>

              {actionError && <p role="alert" className="text-sm text-error">{actionError}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={!privacyConfirmed || !hasFacts || data.has_conflicts || busy !== ""} onClick={generate}>
                  {busy === "generate" ? "Membuat draf…" : data.reflection_text && !data.stale ? "Buat ulang draf" : "Buat draf dengan Gemini"}
                </button>
                <button type="button" className="btn btn-outline btn-sm" disabled={!dirty || (data.stale && !sourceReviewed) || busy !== ""} onClick={saveDraft}>
                  {busy === "save" ? "Menyimpan…" : "Simpan draf"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!data.reflection_text.trim() || dirty || data.stale || data.has_conflicts || data.approved || busy !== ""} onClick={approve}>
                  {busy === "approve" ? "Menyetujui…" : data.approved ? "Sudah disetujui" : "Setujui refleksi"}
                </button>
                {data.approved && <span role="status" className="text-sm text-success-content">Refleksi disetujui untuk pekan ini.</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
