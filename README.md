# Logpilot

Dashboard lokal untuk menyiapkan, meninjau, dan mengelola logbook magang. Data setiap mahasiswa memiliki periode sendiri; pemilih tanggal tidak memakai batas dari dokumen contoh.

## Kebutuhan

- Windows 10 atau 11
- Python 3.11 atau lebih baru
- Node.js 20.9 atau lebih baru, beserta npm
- Git

## Setup

Clone repository, lalu jalankan PowerShell dari folder proyek:

    git clone https://github.com/kanigaraa/upnvj-logpilot.git
    cd upnvj-logpilot
    .\scripts\setup.ps1

Setup membuat virtual environment Python, memasang kebutuhan backend dan frontend, menyalin `backend/.env.example` menjadi `backend/.env` jika belum ada, membuat database lokal, dan menjalankan migrasi SQLite. Setup tidak mengubah file sumber logbook.

Setelah setup selesai, jalankan:

    .\scripts\start.ps1

Skrip membuka terminal backend dan frontend agar log terlihat dan proses dapat dihentikan dengan Ctrl+C. Buka dashboard di http://localhost:3000. API tersedia di http://127.0.0.1:8000, health check di `/api/health`, dan dokumentasi interaktif di `/docs`.

Jika PowerShell menolak skrip karena execution policy, jalankan `Set-ExecutionPolicy -Scope Process Bypass` di terminal tersebut, lalu ulangi perintah setup. Perubahan ini hanya berlaku pada proses PowerShell yang sedang dibuka.

## Setup Gemini API

Gemini dapat membantu membuat hasil harian dari uraian kegiatan dan draf refleksi mingguan. Tanpa Gemini, semua kolom tetap bisa diisi dan disimpan secara manual.

### 1. Buat API key

1. Buka [Google AI Studio API keys](https://aistudio.google.com/apikey) dan masuk ke akun Google.
2. Pilih proyek Google yang akan dipakai atau buat proyek baru. Setiap API key terikat ke proyek tersebut.
3. Pilih **Create API key** dan ikuti petunjuk Google. Simpan key sementara di tempat aman; jangan tempelkan ke chat, frontend, atau repository.
4. Sebelum memilih model, periksa [model Gemini yang tersedia](https://ai.google.dev/gemini-api/docs/models) dan [kuota serta harga](https://ai.google.dev/gemini-api/docs/pricing). Pilih model yang tersedia untuk proyekmu dan mendukung output JSON terstruktur. Status gratis, kuota, dan harga dapat berubah; jangan menganggap model tertentu selalu gratis.

### 2. Masukkan key dan model ke konfigurasi lokal

1. Jalankan setup proyek jika `backend/.env` belum dibuat. Setup menyalin `backend/.env.example` secara otomatis.
2. Buka `backend/.env` dengan editor teks. Isi kedua nilai berikut tanpa tanda kutip:

       GEMINI_API_KEY=key-dari-google-ai-studio
       GEMINI_MODEL=id-model-tepat-dari-dokumentasi-google

3. Ganti nilai contoh dengan API key dan ID model yang persis, misalnya nama model dari kolom ID di halaman model. Jangan menambahkan `models/` di depan ID.
4. Simpan file. `.env` berada di folder `backend`, bukan `frontend`; file ini diabaikan Git.
5. Jika proyek sudah disiapkan sebelum fitur Gemini ditambahkan, jalankan ulang `.\scripts\setup.ps1` dari folder proyek. Langkah ini memasang pustaka Gemini dan menerapkan migrasi database terbaru.

### 3. Mulai ulang dan gunakan Gemini

1. Tutup jendela aplikasi yang sedang berjalan dengan `Ctrl+C`, lalu jalankan kembali `.\scripts\start.ps1` dari folder proyek agar backend membaca konfigurasi terbaru.
2. Di dashboard, pilih rentang tanggal lalu periksa Google Docs seperti biasa. Pilih **Buat hasil dengan Gemini** pada kolom Hasil untuk mengisi draf dari uraian kegiatan. Hasil tampil di kolom dan belum tersimpan sampai kamu memilih **Simpan perubahan**.
3. Tinjau catatan yang ditampilkan. Saat membuat hasil atau refleksi, Logpilot menyamarkan email, nomor telepon, serta nomor berlabel NIM/NPM/NIK/KTP. Tautan dokumentasi dan rincian izin tidak dikirim.
4. Editor refleksi menampilkan semua hari Senin sampai Jumat dari pekan yang dipilih, termasuk tanggal tanpa catatan. Periksa informasi sensitif lain secara manual, centang konfirmasi keamanan data, lalu pilih **Buat draf dengan Gemini**.
5. Periksa dan sunting semua teks yang dibuat. Pilih **Simpan perubahan** atau **Simpan draf** agar tersimpan, lalu setujui setelah isinya benar. Persetujuan tidak mengirim catatan ke portal.

Jika key atau model belum diisi, hasil dan refleksi tetap bisa ditulis manual. API key hanya dibaca backend dari `backend/.env`; jangan menaruh key di kode frontend, README, screenshot, atau commit Git.

### Jika Gemini gagal

- **Konfigurasi belum lengkap:** pastikan `GEMINI_API_KEY` dan `GEMINI_MODEL` tidak kosong di `backend/.env`, lalu mulai ulang aplikasi.
- **Pustaka Gemini belum terpasang:** jalankan ulang `.\scripts\setup.ps1` dari folder proyek, lalu mulai ulang aplikasi. Pesan API akan menyebutkan langkah ini jika `google-genai` belum tersedia.
- **Key ditolak:** pastikan key aktif dan berasal dari proyek Google AI Studio yang benar. Buat key baru jika key lama sudah dihapus atau dinonaktifkan.
- **Model tidak tersedia atau format tidak didukung:** salin ID model tepat dari dokumentasi Google dan pilih model yang mendukung output JSON terstruktur.
- **Kuota habis atau permintaan dibatasi:** periksa penggunaan, kuota, dan ketentuan biaya proyek di Google AI Studio. Tunggu kuota pulih atau pilih konfigurasi yang sesuai; Logpilot tidak akan mengirim ulang refleksi secara otomatis.
- **Refleksi lama tidak cocok dengan catatan terbaru:** tinjau perubahan sumber, buat draf baru, atau sunting draf secara manual sebelum menyetujui.

Integrasi memakai Google Gen AI SDK di backend melalui Interactions API dan meminta keluaran JSON terstruktur agar hasil bisa divalidasi sebelum disimpan. Lihat [panduan memulai Python](https://ai.google.dev/gemini-api/docs/get-started?lang=python), [format keluaran terstruktur](https://ai.google.dev/gemini-api/docs/structured-output), dan [penggunaan API key](https://ai.google.dev/gemini-api/docs/api-key).

## Setup Google Docs

Setiap pengguna sebaiknya memakai proyek Google Cloud dan OAuth client miliknya sendiri. Setup ini hanya mengizinkan Logpilot membaca dokumen; Logpilot tidak mengubah dokumen sumber.

### 1. Buat proyek Google Cloud

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan masuk dengan akun Google yang akan mengelola konfigurasi.
2. Buka pemilih proyek di bagian atas halaman. Pilih proyek yang sudah ada atau pilih **New Project**, beri nama, lalu buat proyek.
3. Pastikan proyek tersebut terpilih sebelum melanjutkan. Pengaktifan API dan OAuth client harus berada pada proyek yang sama.

### 2. Aktifkan Google Docs API

1. Buka **APIs & Services → Library**. Jika alamat menu berubah, gunakan [API Library](https://console.cloud.google.com/apis/library).
2. Cari **Google Docs API**, buka hasil yang namanya tepat sama, lalu pilih **Enable**.
3. Pastikan nama proyek yang aktif di bagian atas adalah proyek yang baru kamu pilih.

### 3. Atur layar persetujuan OAuth

1. Buka **Google Auth Platform → Branding**. Pada proyek yang belum dikonfigurasi, pilih **Get Started**.
2. Isi **App name** (misalnya `Logpilot Lokal`) dan **User support email**. Lanjutkan.
3. Pada **Audience**, pilih **Internal** hanya jika semua akun yang akan memakai aplikasi berada dalam organisasi Google Workspace yang sama. Untuk akun pribadi atau pengguna di luar organisasi, pilih **External**.
4. Isi **Contact Information**, tinjau kebijakan data Google, lalu selesaikan pembuatan konfigurasi.
5. Jika memilih **External** dan status aplikasi **Testing**, buka **Google Auth Platform → Audience → Test users → Add users**. Tambahkan alamat akun Google yang nanti akan dipakai untuk menghubungkan dokumen, lalu simpan. Akun yang belum terdaftar sebagai test user tidak dapat menyelesaikan persetujuan saat aplikasi masih dalam mode pengujian.
6. Pada **Data Access**, bila tersedia, tambahkan hanya scope baca Google Docs berikut: `https://www.googleapis.com/auth/documents.readonly`. Jangan pilih scope edit.

Pilihan **Internal** hanya berlaku untuk akun dalam organisasi Workspace tersebut dan dapat dibatasi oleh administrator organisasi. Jika ragu atau memakai akun Gmail pribadi, pilih **External** lalu tambahkan akunmu sebagai test user.

### 4. Buat OAuth client untuk aplikasi desktop

1. Buka **Google Auth Platform → Clients**, lalu pilih **Create Client**.
2. Pada **Application type**, pilih **Desktop app**. Jangan pilih **Web application**; Logpilot berjalan lokal dan membuka persetujuan Google di browser.
3. Beri nama, misalnya `Logpilot Windows`, lalu pilih **Create**.
4. Unduh JSON konfigurasi dari dialog hasil pembuatan atau dari daftar client. Jika unduhan tidak dimulai otomatis, buka client tersebut dan pilih unduh konfigurasi JSON.

### 5. Simpan file konfigurasi pada lokasi yang benar

1. Di dalam folder proyek, buka folder `backend`. Jika belum ada, buat subfolder bernama `.local`.
2. Pindahkan file JSON yang diunduh ke folder itu dan ubah namanya persis menjadi:

       backend/.local/google-oauth-client.json

3. Pastikan Windows tidak menambahkan ekstensi kedua, seperti `google-oauth-client.json.json`. Jangan mengedit isi JSON atau mengirimkannya ke orang lain.

Folder `backend/.local` dan token OAuth di dalamnya diabaikan Git. Jangan unggah atau commit keduanya.

### 6. Hubungkan akun dari Logpilot

1. Jalankan setup jika belum pernah dilakukan, lalu mulai aplikasi:

       .\scripts\setup.ps1
       .\scripts\start.ps1

2. Buka http://localhost:3000 dan pilih **Hubungkan Google Docs**.
3. Browser akan membuka halaman Google. Pilih akun yang sudah ditambahkan sebagai test user jika aplikasinya berstatus **External / Testing**.
4. Tinjau permintaan akses dan lanjutkan hanya jika Logpilot meminta akses baca Google Docs. Setelah Google menyatakan koneksi berhasil, kembali ke dashboard.
5. Tempel URL atau ID Google Docs. Pastikan akun yang terhubung memiliki akses **Viewer** ke dokumen; akses yang hanya diberikan kepada akun Google lain tidak cukup.
6. Pilih rentang tanggal dan jalankan pemeriksaan. Tanggal tanpa baris akan ditampilkan untuk ditinjau, bukan otomatis dianggap sebagai hari kerja yang terlewat.

Contoh URL yang diterima adalah `https://docs.google.com/document/d/ID_DOKUMEN/edit`. Logpilot juga menerima ID dokumen saja. Tautan folder Drive atau URL `drive.google.com/file` bukan URL dokumen Google Docs.

### Jika koneksi gagal

- **Google Docs belum disiapkan:** pastikan nama file tepat `backend/.local/google-oauth-client.json`, berada di folder proyek yang benar, dan backend sudah dijalankan.
- **Akses aplikasi diblokir saat Testing:** periksa **Google Auth Platform → Audience → Test users** dan tambahkan akun yang sedang dipilih di browser.
- **API tidak diaktifkan atau respons 403:** pastikan **Google Docs API** diaktifkan pada proyek yang sama dengan OAuth client.
- **Dokumen tidak dapat dibaca:** periksa URL/ID dan pastikan akun yang terhubung dapat membuka dokumen sebagai Viewer.
- **Ingin menghubungkan ulang atau mengganti akun:** hentikan aplikasi, hapus `backend/.local/google-token.json`, mulai kembali aplikasi, lalu hubungkan lagi dari dashboard.

Logpilot meminta scope `documents.readonly`. Token persetujuan dibuat otomatis di `backend/.local/google-token.json` pada komputer ini dan tidak masuk Git. Untuk rincian istilah atau tampilan Cloud Console terbaru, lihat [Google Docs API Python quickstart](https://developers.google.com/workspace/docs/api/quickstart/python), [panduan layar persetujuan OAuth](https://developers.google.com/workspace/guides/configure-oauth-consent), dan [panduan mengaktifkan Google Workspace API](https://developers.google.com/workspace/guides/enable-apis).

Parser mengenali sejumlah variasi header Indonesia dan Inggris serta beberapa format tanggal. Jika header aktivitas pada sebuah template belum dikenali, baris akan ditandai untuk ditinjau dan tidak ditebak sebagai kegiatan. Pemetaan template yang belum dikenal akan ditambahkan pada fase berikutnya.

## Pemeriksaan

Dari folder proyek, jalankan:

    Push-Location backend
    .\.venv\Scripts\python.exe -m unittest discover -s tests -v
    Pop-Location
    npm --prefix frontend run lint
    npm --prefix frontend run build -- --webpack

Migrasi bisa dijalankan ulang dengan:

    Push-Location backend
    .\.venv\Scripts\python.exe -m alembic upgrade head
    Pop-Location

## Batas fitur saat ini

- Pilih tanggal mulai dan akhir sesuai periode masing-masing. Rentang bersifat inklusif; tanggal akhir harus sama dengan atau setelah tanggal mulai. Pilihan cepat tersedia untuk 3 hari dan 1 minggu.
- Dashboard membaca Google Docs dan hanya menyimpan catatan dalam rentang yang dipilih. Dashboard menunjukkan tanggal yang terisi, kosong, izin/sakit, perlu ditinjau, atau tidak tercantum. Status tidak tercantum perlu dicocokkan dengan jadwal magang karena belum tentu hari kerja.
- Entri dalam rentang pilihan dapat disunting dan disetujui satu per satu. Jam memakai format 24 jam `HH:MM`. Jam dan tautan dokumentasi dapat disimpan sebagai pengaturan bawaan; penerapan ke catatan kosong memerlukan konfirmasi, sedangkan tautan manual per entri tetap dipertahankan.
- Refleksi Jumat menggunakan data Senin–Jumat, menandai hari tanpa catatan, dan tetap berupa draf sampai diedit serta disetujui pengguna. Teks sensitif umum disamarkan sebelum dikirim ke Gemini.
- Impor CSV/PDF dan pengiriman entri ke portal belum tersedia. Otomasi tidak akan pernah menekan tombol “Selesaikan Logbook Magang”.

DaisyUI digunakan untuk komponen antarmuka; lihat [komponen DaisyUI](https://daisyui.com/components/) dan [panduan Next.js](https://daisyui.com/docs/install/nextjs/).
