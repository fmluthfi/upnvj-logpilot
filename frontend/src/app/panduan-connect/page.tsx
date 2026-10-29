import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panduan Connect Google Docs | Logpilot",
  description: "Panduan menyiapkan Google Cloud dan menghubungkan Google Docs ke Logpilot.",
};

export default function GoogleDocsGuidePage() {
  return (
    <div className="min-h-screen bg-base-200">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Logpilot, beranda"
            className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <Image src="/logpilot-mark.png" alt="" width={48} height={48} priority className="size-10 object-contain" />
            <span className="text-xl font-semibold tracking-tight">Logpilot</span>
          </Link>
          <Link href="/" className="btn btn-outline btn-sm">Kembali ke dashboard</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12" aria-labelledby="guide-title">
        <header className="mb-8">
          <h1 id="guide-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Panduan Connect Google Docs
          </h1>
          <p className="mt-3 text-base leading-7 text-base-content/75">
            Sebelum pertama kali memakai Google Docs, siapkan akses berikut. Logpilot hanya meminta izin baca dan tidak mengubah dokumen sumber.
          </p>
          <p className="mt-3 text-sm leading-6 text-base-content/70">
            Setiap pengguna sebaiknya memakai proyek Google Cloud dan OAuth client miliknya sendiri. Kamu perlu akun Google dan aplikasi Logpilot yang sudah disiapkan di komputer.
          </p>
        </header>

        <div role="note" className="alert alert-info mb-8 items-start">
          <p className="text-sm leading-6">
            Jika belum menyiapkan OAuth client, ikuti langkah 1 sampai 3. Kalau file kredensial sudah tersedia, lanjut ke langkah 4.
          </p>
        </div>

        <div className="space-y-8">
          <section aria-labelledby="project-title">
            <h2 id="project-title" className="text-xl font-semibold">1. Buat proyek dan aktifkan Google Docs API</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-6 text-base-content/80">
              <li>
                Buka <a className="link link-primary" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>. Pilih proyek yang sudah ada atau buat proyek baru.
              </li>
              <li>
                Di proyek itu, buka <span className="font-medium">APIs &amp; Services → Library</span>. Cari <span className="font-medium">Google Docs API</span>, lalu pilih <span className="font-medium">Enable</span>.
              </li>
              <li>Pastikan proyek yang sama masih dipilih saat membuat pengaturan OAuth di langkah berikutnya.</li>
            </ol>
          </section>

          <section aria-labelledby="consent-title" className="border-t border-base-300 pt-6">
            <h2 id="consent-title" className="text-xl font-semibold">2. Atur persetujuan OAuth</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-6 text-base-content/80">
              <li>
                Buka <span className="font-medium">Google Auth Platform → Branding</span>. Jika diminta, pilih <span className="font-medium">Get Started</span>. Isi nama aplikasi, email dukungan, dan email kontak.
              </li>
              <li>
                Pada <span className="font-medium">Audience</span>, pilih <span className="font-medium">Internal</span> jika semua pengguna berasal dari satu organisasi Google Workspace. Untuk akun Gmail pribadi atau pengguna di luar organisasi, pilih <span className="font-medium">External</span>.
              </li>
              <li>
                Jika aplikasi berstatus <span className="font-medium">External / Testing</span>, buka <span className="font-medium">Audience → Test users → Add users</span> dan tambahkan akun Google yang akan dipakai.
              </li>
              <li>
                Jika memilih <span className="font-medium">External</span>, buka <span className="font-medium">Data Access → Add or Remove Scopes</span> dan daftarkan scope berikut. Aplikasi Internal biasanya tidak perlu mendaftarkan scope di layar persetujuan:
                <code className="mt-2 block break-all rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-xs sm:text-sm">
                  https://www.googleapis.com/auth/documents.readonly
                </code>
                <span className="mt-2 block">Gunakan akses baca saja. Logpilot tidak memerlukan izin untuk mengedit dokumen.</span>
              </li>
            </ol>
            <p className="mt-3 text-sm leading-6 text-base-content/70">
              Lihat panduan resmi Google tentang <a className="link link-primary" href="https://developers.google.com/workspace/guides/configure-oauth-consent" target="_blank" rel="noreferrer">persetujuan OAuth dan scope</a>.
            </p>
          </section>

          <section aria-labelledby="client-title" className="border-t border-base-300 pt-6">
            <h2 id="client-title" className="text-xl font-semibold">3. Buat OAuth client desktop</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-6 text-base-content/80">
              <li>
                Di Google Auth Platform, buka <span className="font-medium">Clients → Create Client</span>.
              </li>
              <li>Pilih tipe aplikasi <span className="font-medium">Desktop app</span>, beri nama, lalu buat client.</li>
              <li>Unduh file JSON kredensial dan simpan dengan nama persis seperti ini:</li>
            </ol>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-base-300 bg-base-100 p-4 text-sm"><code>backend/.local/google-oauth-client.json</code></pre>
            <p className="mt-3 text-sm leading-6 text-base-content/70">
              Buat folder <code>backend/.local</code> jika belum ada. Pastikan Windows tidak menambahkan ekstensi ganda, misalnya <code>.json.json</code>. Jangan unggah atau commit file kredensial ini.
            </p>
          </section>

          <section aria-labelledby="connect-title" className="border-t border-base-300 pt-6">
            <h2 id="connect-title" className="text-xl font-semibold">4. Hubungkan akun dan dokumen di Logpilot</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-6 text-sm leading-6 text-base-content/80">
              <li>
                Jalankan ulang aplikasi dengan <code>.\scripts\start.ps1</code>, lalu buka <code>http://localhost:3000</code>.
              </li>
              <li>Pada bagian Google Docs di dashboard, pilih <span className="font-medium">Hubungkan Google Docs</span>.</li>
              <li>
                Di browser yang terbuka, masuk ke akun Google yang akan dipakai. Jika aplikasi masih <span className="font-medium">External / Testing</span>, gunakan akun yang sudah ditambahkan sebagai test user, lalu izinkan akses baca Google Docs.
              </li>
              <li>Setelah halaman Google menyatakan koneksi berhasil, tutup tab tersebut dan kembali ke dashboard Logpilot.</li>
              <li>
                Pastikan akun yang terhubung memiliki akses <span className="font-medium">Viewer</span> ke dokumen. Tempel URL Google Docs atau ID dokumen, pilih rentang tanggal, lalu tekan <span className="font-medium">Periksa rentang tanggal</span>.
              </li>
              <li>Periksa hasil pembacaan sebelum menyunting dan menyetujui entri.</li>
            </ol>
            <p className="mt-3 text-sm leading-6 text-base-content/70">
              Gunakan URL seperti <code>https://docs.google.com/document/d/ID_DOKUMEN/edit</code> atau ID di dalamnya. Tautan folder Drive dan tautan <code>drive.google.com/file</code> bukan URL Google Docs.
            </p>
          </section>

          <section aria-labelledby="troubleshooting-title" className="border-t border-base-300 pt-6">
            <h2 id="troubleshooting-title" className="text-xl font-semibold">Jika koneksi belum berhasil</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-6 text-base-content/80">
              <li>Tombol Hubungkan Google Docs belum muncul: periksa nama dan lokasi file JSON, lalu mulai ulang aplikasi.</li>
              <li>Google menolak akun saat status Testing: tambahkan akun itu di bagian Test users pada proyek yang sama.</li>
              <li>Peringatan aplikasi belum diverifikasi: pastikan nama proyek dan akses baca saja sesuai dengan OAuth client yang kamu buat.</li>
              <li>Dokumen tidak terbaca: pastikan Google Docs API aktif dan akun yang terhubung memiliki akses Viewer.</li>
              <li>
                Untuk mengganti akun Google, hentikan aplikasi, hapus <code>backend/.local/google-token.json</code>, jalankan ulang, lalu hubungkan kembali.
              </li>
            </ul>
            <p className="mt-3 text-sm leading-6 text-base-content/70">
              Pelajari alur lengkapnya di <a className="link link-primary" href="https://developers.google.com/workspace/docs/api/quickstart/python" target="_blank" rel="noreferrer">quickstart resmi Google Docs API untuk Python</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-base-300 pt-6">
          <Link href="/" className="btn btn-primary">Kembali ke dashboard</Link>
        </div>
      </main>
    </div>
  );
}
