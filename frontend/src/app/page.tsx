"use client";

import { useState, type FormEvent } from "react";

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
    setSelectedRange({
      start: startDate,
      end: endDate,
      days: inclusiveDays(startDate, endDate),
    });
  }

  function updateStart(value: string) {
    setStartDate(value);
    setSelectedRange(null);
  }

  function updateEnd(value: string) {
    setEndDate(value);
    setSelectedRange(null);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-300 bg-base-100">
        <div className="navbar mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex-1 gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-xl bg-primary font-bold tracking-tight text-primary-content"
            >
              LP
            </span>
            <div>
              <p className="font-semibold leading-tight">Logpilot</p>
              <p className="text-xs text-base-content/65">Logbook magang UPNVJ</p>
            </div>
          </div>
          <div className="badge badge-outline gap-2 border-primary/25 bg-secondary/50 px-3 py-3 text-secondary-content">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            Berjalan lokal
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <section aria-labelledby="dashboard-title">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
                Dashboard · Konfigurasi awal
              </p>
              <h1
                id="dashboard-title"
                className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl"
              >
                Siapkan logbook harianmu.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-base-content/70 sm:text-lg">
                Tentukan periode yang ingin ditinjau. Catatan tetap bisa diperiksa
                dan disetujui sebelum dikirim.
              </p>
            </div>
            <span className="badge badge-outline border-base-300 bg-base-100 px-3 py-4 text-base-content/70">
              Dashboard lokal
            </span>
          </div>

          <div role="note" className="alert alert-warning mt-8 items-start">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-warning-content font-bold text-warning"
            >
              !
            </span>
            <div>
              <p className="font-semibold">Pengaman logbook aktif</p>
              <p className="text-sm leading-6">
                Otomasi tidak akan pernah menekan tombol “Selesaikan Logbook
                Magang”. Penyelesaian akhir selalu dilakukan secara manual.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Konfigurasi dashboard"
          className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]"
        >
          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-6 p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-primary">Langkah 1</p>
                  <h2 className="card-title mt-1 text-2xl">Pilih periode</h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-base-content/65">
                    Tanggal dihitung inklusif. Pilih sesuai masa magangmu; tidak
                    ada batas tanggal berdasarkan contoh logbook.
                  </p>
                </div>
                <span className="badge badge-ghost px-3 py-3">
                  Sesuai periode magangmu
                </span>
              </div>

              <form noValidate onSubmit={applyRange}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="form-control w-full">
                    <span className="label">
                      <span className="label-text font-semibold">Tanggal mulai</span>
                    </span>
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
                    <span className="label">
                      <span className="label-text font-semibold">Tanggal akhir</span>
                    </span>
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

                {error ? (
                  <p id="range-error" role="alert" className="mt-3 text-sm font-medium text-error">
                    {error}
                  </p>
                ) : (
                  <p id="range-hint" className="mt-3 text-sm text-base-content/60">
                    Tidak ada batas periode bawaan. Pastikan tanggal sesuai
                    dengan masa magangmu.
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="submit" className="btn btn-primary">
                    Terapkan periode
                  </button>
                  <span className="text-xs text-base-content/55">
                    Belum ada data yang dikirim.
                  </span>
                </div>
              </form>

              {selectedRange && (
                <div role="status" className="rounded-box border border-success/40 bg-success/50 p-4">
                  <p className="font-semibold text-success-content">
                    Periode siap ditinjau
                  </p>
                  <p className="mt-1 text-sm text-success-content/80">
                    {formatDate(selectedRange.start)} — {formatDate(selectedRange.end)}{" "}
                    <span className="font-medium">
                      ({selectedRange.days} hari kalender, termasuk kedua tanggal)
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-primary">Langkah 2</p>
                <span className="badge badge-outline border-base-300 text-base-content/60">
                  Belum terhubung
                </span>
              </div>
              <h2 className="card-title mt-1 text-2xl">Sumber logbook</h2>
              <p className="text-sm leading-6 text-base-content/65">
                Dashboard belum membaca dokumen. Koneksi Google Docs belum
                tersedia pada dashboard awal ini.
              </p>

              <div className="divider my-1" />

              <div className="rounded-box bg-base-200 p-4">
                <p className="text-sm font-semibold">Privasi dokumen</p>
                <p className="mt-1 text-sm leading-6 text-base-content/65">
                  Dokumen asli tidak diubah. Aplikasi berjalan di perangkat ini.
                </p>
              </div>
            </div>
          </aside>
        </section>

        <footer className="mt-8 flex flex-col gap-1 border-t border-base-300 pt-5 text-xs leading-5 text-base-content/55 sm:flex-row sm:justify-between">
          <span>Logpilot · UPN Veteran Jakarta</span>
          <span>Pratinjau awal · koneksi portal belum dijalankan</span>
        </footer>
      </main>
    </div>
  );
}
