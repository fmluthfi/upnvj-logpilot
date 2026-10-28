<p align="center">
  <img src="frontend/public/logpilot-mark.png" alt="Logo Logpilot" width="112">
</p>

<h1 align="center">Logpilot: Otomatisasi Logbook Magang UPNVJ</h1>

<p align="center">Otomatisasi pengisian entri harian dari Google Docs ke portal Kampus Berdampak.</p>

<p align="center">
  <a href="#mulai-cepat">Mulai cepat</a> ·
  <a href="#hubungkan-google-docs">Google Docs</a> ·
  <a href="#aktifkan-groqcloud">GroqCloud</a> ·
  <a href="#pasang-chrome-extension">Chrome extension</a> ·
  <a href="#jika-ada-masalah">Bantuan</a>
</p>

Logpilot berjalan di komputer pengguna. Setelah catatan Google Docs ditinjau dan disetujui, Chrome extension mengisi serta menyimpan entri harian melalui sesi portal yang sudah dibuka pengguna.

**Batas penting:** Logpilot tidak menekan tombol **Selesaikan Logbook Magang**. Penyelesaian logbook dilakukan sendiri di portal.

## Yang bisa dilakukan

- Pilih rentang tanggal sesuai kebutuhan, termasuk beberapa hari atau sebagian dari masa magang. Tanggal mulai dan akhir tidak dibatasi contoh dokumen.
- Lihat tanggal yang terisi, kosong, izin/sakit, perlu dipetakan, atau tidak ditemukan di dokumen. Tanggal tanpa catatan tetap perlu dicocokkan dengan jadwal magang masing-masing.
- Sunting uraian, hasil, kendala, jam kerja format 24 jam, dan tautan dokumentasi sebelum menyetujui entri. Jam serta tautan dokumentasi dapat disimpan sebagai bawaan; nilai per entri tetap bisa diubah.
- Buat draf hasil harian dan refleksi mingguan dengan GroqCloud, lalu tinjau dan sunting sebelum digunakan. Refleksi Jumat memakai catatan Senin sampai Jumat pada minggu yang sama, walaupun rentang unggah hanya mencakup sebagian minggu.
- Siapkan batch dari entri yang disetujui. Extension membandingkan entri yang sudah ada di portal, melewati data yang sama, dan memakai form revisi untuk data yang berubah. Hasil Simpan yang tidak dapat dipastikan dihentikan untuk pemeriksaan; entri tersebut tidak dikirim ulang secara otomatis.

## Mulai cepat

### 1. Siapkan komputer

Panduan dan skrip otomatis ditujukan untuk **Windows 10/11** dengan PowerShell. Pasang **Python 3.11+**, **Node.js 20.9+** beserta npm, **Git**, dan **Google Chrome 102+**.

Di PowerShell:

```powershell
git clone https://github.com/kanigaraa/upnvj-logpilot.git
cd upnvj-logpilot
.\scripts\setup.ps1
```

Setup memasang dependensi Python dan frontend, membuat database SQLite serta migrasinya, dan menyalin `backend/.env.example` ke `backend/.env` bila file itu belum ada. Setup juga memasang Chromium untuk jalur Playwright lama. Dokumen sumber tidak diubah.

Jika PowerShell menolak skrip, jalankan `Set-ExecutionPolicy -Scope Process Bypass` pada terminal yang sama, lalu ulangi setup. Pengaturan itu hanya berlaku untuk proses PowerShell tersebut.

### 2. Siapkan sumber dan AI

- Ikuti [panduan Google Docs](#hubungkan-google-docs) untuk membuat OAuth client dan meletakkan file JSON pada lokasi yang benar. Ini diperlukan untuk membaca dokumen sumber.
- Ikuti [panduan GroqCloud](#aktifkan-groqcloud) jika ingin membuat draf dengan AI. Tanpa API key, entri tetap dapat ditulis manual.

### 3. Jalankan aplikasi

```powershell
.\scripts\start.ps1
```

Buka **http://localhost:3000**. Skrip membuka jendela backend dan frontend; hentikan keduanya dengan `Ctrl+C`. Backend tersedia di `http://127.0.0.1:8000`, health check di `/api/health`, dan dokumentasi API di `/docs`.

Untuk mengisi portal, lanjutkan ke [pemasangan Chrome extension](#pasang-chrome-extension). Login portal tetap dilakukan secara manual.

## Hubungkan Google Docs

Setiap pengguna sebaiknya membuat proyek Google Cloud dan OAuth client sendiri. Logpilot meminta akses **baca saja** dan tidak mengubah dokumen sumber. Langkah berikut mengikuti [quickstart resmi Google Docs API](https://developers.google.com/workspace/docs/api/quickstart/python).

### 1. Buat proyek dan aktifkan API

1. Masuk ke [Google Cloud Console](https://console.cloud.google.com/), buka pemilih proyek di bagian atas, lalu buat proyek baru atau pilih proyek yang sudah ada.
2. Di proyek tersebut, buka **APIs & Services → Library** atau [API Library](https://console.cloud.google.com/apis/library). Cari **Google Docs API** dan pilih **Enable**.
3. Pastikan proyek yang tampil di bagian atas tetap sama saat membuat kredensial pada langkah berikutnya.

### 2. Atur persetujuan OAuth

1. Buka **Google Auth Platform → Branding**. Jika belum dikonfigurasi, pilih **Get Started**. Isi nama aplikasi, email dukungan, dan email kontak.
2. Pada **Audience**, pilih **Internal** hanya jika semua pengguna berada dalam organisasi Google Workspace yang sama. Untuk akun Gmail pribadi atau pengguna di luar organisasi, pilih **External**.
3. Selesaikan konfigurasi. Jika aplikasi **External** masih berstatus **Testing**, buka **Audience → Test users → Add users** dan tambahkan akun Google yang akan dipakai untuk menghubungkan dokumen.
4. Pada **Data Access**, bila diminta, tambahkan hanya scope `https://www.googleapis.com/auth/documents.readonly`. Jangan pilih akses edit.

Google menjelaskan pilihan audience dan test user dalam [panduan OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent).

### 3. Buat OAuth client desktop

1. Buka **Google Auth Platform → Clients → Create Client**.
2. Pilih **Desktop app**, beri nama, lalu buat client. Jangan pilih **Web application**.
3. Unduh file JSON kredensial. Simpan di proyek dengan nama persis:

   ```text
   backend/.local/google-oauth-client.json
   ```

   Buat folder `backend/.local` bila belum ada. Pastikan Windows tidak memberi nama ganda seperti `google-oauth-client.json.json`.

### 4. Hubungkan dokumen di dashboard

1. Jalankan `.\scripts\start.ps1`, buka `http://localhost:3000`, lalu pilih **Hubungkan Google Docs**.
2. Pada halaman Google yang terbuka, pilih akun yang terdaftar sebagai test user bila aplikasi masih **External / Testing**. Setujui hanya akses baca Google Docs.
3. Kembali ke dashboard. Pastikan akun tersebut memiliki akses **Viewer** ke dokumen yang akan dibaca.
4. Tempel URL Google Docs, misalnya `https://docs.google.com/document/d/ID_DOKUMEN/edit`, atau tempel ID dokumennya saja. Tautan folder Drive dan `drive.google.com/file` bukan URL Google Docs.
5. Pilih rentang tanggal, lalu periksa hasil pembacaan sebelum menyetujui entri.

Token OAuth disimpan lokal di `backend/.local/google-token.json`. Untuk mengganti akun, hentikan aplikasi, hapus file token tersebut, jalankan kembali, lalu hubungkan ulang dari dashboard. Folder `.local` diabaikan Git.

Parser menerima beberapa variasi header Indonesia dan Inggris serta format tanggal. Jika sebuah template belum dapat dikenali, Logpilot menandai baris untuk ditinjau dan tidak menebak kegiatannya. **Impor PDF/CSV belum tersedia**; sumber yang didukung saat ini adalah Google Docs.

## Aktifkan GroqCloud

GroqCloud dipakai untuk membuat **draf**, bukan untuk menyetujui atau mengirim entri. Fitur lain tetap berjalan tanpa API key.

1. Buat akun di [GroqCloud Console](https://console.groq.com/), lalu buat key pada halaman [API Keys](https://console.groq.com/keys).
2. Buka `backend/.env` yang dibuat oleh setup. Isi atau perbarui nilai berikut:

   ```ini
   AI_PROVIDER=groq
   GROQ_API_KEY=key-dari-groqcloud
   GROQ_MODEL=openai/gpt-oss-20b
   ```

3. Ganti `key-dari-groqcloud` dengan key milikmu. Jika ingin memakai model lain, ambil ID-nya dari [daftar model Groq](https://console.groq.com/docs/models) dan ubah `GROQ_MODEL`.
4. Simpan file, lalu hentikan dan jalankan ulang aplikasi dengan `.\scripts\start.ps1` agar backend membaca konfigurasi baru. Bila proyek pernah disiapkan sebelum Groq dipakai, jalankan `.\scripts\setup.ps1` lagi untuk memperbarui dependensi.

API key hanya dibaca di backend. Jangan menaruhnya dalam variabel `NEXT_PUBLIC_`, kode frontend, screenshot, atau commit. `backend/.env` diabaikan Git. [Quickstart Groq](https://console.groq.com/docs/quickstart) menjelaskan pembuatan key dan SDK Python.

Di dashboard, tombol **Buat dengan AI** membuat draf hasil dari uraian kegiatan. Editor refleksi mengumpulkan catatan satu minggu Senin sampai Jumat dan menandai hari yang belum lengkap. Tinjau informasi sensitif sebelum membuat draf, lalu periksa, sunting, simpan, dan setujui hasilnya. Logpilot menyamarkan email, nomor telepon, serta nomor berlabel NIM/NPM/NIK/KTP; tautan dokumentasi dan rincian izin tidak dikirim ke GroqCloud.

## Pasang Chrome extension

Extension menggunakan sesi Chrome tempat kamu sudah login ke portal. Pairing menghubungkannya dengan backend lokal; kredensial portal tidak dimasukkan ke dashboard.

1. Dari folder proyek, buat berkas extension:

   ```powershell
   npm --prefix frontend run build:extension
   ```

2. Buka `chrome://extensions` di Chrome, aktifkan **Developer mode**, pilih **Load unpacked**, lalu pilih folder `extension` dalam repository. Folder yang dipilih harus berisi `manifest.json`.
3. Jalankan aplikasi dan buka dashboard. Pada panel **Isi logbook di portal**, pilih **Buat kode pairing**.
4. Buka popup **Logpilot** dari ikon Extensions Chrome, tempel kode, lalu pilih **Hubungkan extension**. Kode berlaku lima menit dan hanya dapat dipakai sekali.
5. Di Chrome yang sama, buka `https://kampusberdampak.upnvj.ac.id/logbook-harian` dan login sendiri. Biarkan tab portal terbuka selama batch berjalan.
6. Pada dashboard, periksa sumber dan rentang tanggal. Sunting serta setujui entri yang benar, pilih **Periksa entri yang disetujui**, lalu **Siapkan batch**.
7. Buka popup Logpilot. Pastikan backend terhubung, pairing aktif, dan panel portal terdeteksi. Pilih **Mulai automation**. Popup boleh ditutup selama batch berjalan; progres juga tampil di dashboard.

Setelah memperbarui kode extension, jalankan lagi `build:extension`, klik **Reload** pada kartu Logpilot di `chrome://extensions`, lalu muat ulang tab portal. Restart backend saja tidak memuat ulang content script Chrome.

Extension hanya mengisi dan menyimpan entri harian yang sudah disetujui. Entri yang sudah sama tidak dikirim dua kali. Jika status setelah Simpan tidak dapat dibuktikan dengan aman, proses berhenti untuk pemeriksaan sebelum ada percobaan lagi. **Tombol penyelesaian logbook tidak pernah dijalankan oleh Logpilot.**

## Jika ada masalah

| Gejala | Yang diperiksa |
| --- | --- |
| Dashboard tidak terhubung ke backend | Pastikan jendela backend dari `start.ps1` masih berjalan dan port `8000` tidak dipakai aplikasi lain. |
| Google menolak akses saat aplikasi masih Testing | Tambahkan akun yang dipilih di **Audience → Test users** pada proyek Google Cloud yang sama. |
| Dokumen tidak terbaca | Periksa ID/URL Google Docs, akses Viewer akun yang terhubung, dan apakah Google Docs API aktif. |
| Groq menolak key atau model | Periksa `GROQ_API_KEY` dan `GROQ_MODEL` di `backend/.env`, lalu mulai ulang backend. |
| Groq membatasi permintaan | Tunggu kuota pulih sesuai [batas penggunaan Groq](https://console.groq.com/docs/rate-limits), lalu buat ulang draf. Entri manual tetap dapat dipakai. |
| Extension masih memakai perilaku lama | Build ulang, **Reload** extension di Chrome, lalu muat ulang tab portal. |
| Hasil Simpan belum pasti | Periksa tanggal tersebut di portal sebelum memilih hasil pada dashboard. Jangan memulai ulang entri yang mungkin sudah tersimpan. |

## Pengembangan dan pemeriksaan

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
npm --prefix frontend run lint
npm --prefix frontend run build -- --webpack
npm --prefix frontend run build:extension
node --test extension/tests/*.test.mjs
```

Tes automation memakai mock dan tidak mengirim logbook sungguhan. Struktur proyek: `backend/` untuk API dan database lokal, `frontend/` untuk dashboard, `extension/` untuk Chrome extension, serta `scripts/` untuk setup dan menjalankan aplikasi. Lihat [kebijakan keamanan](docs/SECURITY.md) untuk penanganan kredensial dan data.
