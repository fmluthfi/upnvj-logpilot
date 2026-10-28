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

Setup membuat virtual environment Python, memasang kebutuhan backend dan frontend, memasang Chromium untuk Playwright, menyalin `backend/.env.example` menjadi `backend/.env` jika belum ada, membuat database lokal, dan menjalankan migrasi SQLite. Backend juga memeriksa migrasi sebelum mulai agar database mengikuti versi aplikasi. Setup tidak mengubah file sumber logbook.

Setelah setup selesai, jalankan:

    .\scripts\start.ps1

Skrip membuka terminal backend dan frontend agar log terlihat dan proses dapat dihentikan dengan Ctrl+C. Buka dashboard di http://localhost:3000. API tersedia di http://127.0.0.1:8000, health check di `/api/health`, dan dokumentasi interaktif di `/docs`.

Jika PowerShell menolak skrip karena execution policy, jalankan `Set-ExecutionPolicy -Scope Process Bypass` di terminal tersebut, lalu ulangi perintah setup. Perubahan ini hanya berlaku pada proses PowerShell yang sedang dibuka.

## Setup GroqCloud

GroqCloud membantu membuat draf hasil harian dari uraian kegiatan dan refleksi mingguan. Tanpa API key, semua kolom tetap bisa diisi dan disimpan secara manual.

### 1. Buat API key Groq

1. Masuk atau buat akun di [GroqCloud Console](https://console.groq.com/).
2. Buka [API Keys](https://console.groq.com/keys), buat key, lalu salin dan simpan di tempat aman. Jangan kirim key melalui chat atau memasukkannya ke frontend maupun repository.
3. Periksa [model yang tersedia](https://console.groq.com/docs/models) dan [batas penggunaan](https://console.groq.com/docs/rate-limits) di Console Groq. Model bawaan Logpilot adalah `openai/gpt-oss-20b` dan bisa diganti lewat konfigurasi.

### 2. Simpan konfigurasi di backend

1. Jalankan `.\scripts\setup.ps1` dari folder proyek jika `backend/.env` belum dibuat. Setup menyalin `backend/.env.example` dan memasang Groq Python SDK.
2. Buka `backend/.env` dengan editor teks, lalu isi:

       AI_PROVIDER=groq
       GROQ_API_KEY=key-dari-groqcloud
       GROQ_MODEL=openai/gpt-oss-20b

3. Ganti `key-dari-groqcloud` dengan key yang kamu buat. Untuk memakai model lain, isi `GROQ_MODEL` dengan ID model dari GroqCloud.
4. Simpan file. Konfigurasi berada di folder `backend`, tidak perlu variabel `NEXT_PUBLIC_`, dan `.env` diabaikan Git.
5. Jika proyek sudah disiapkan sebelumnya, jalankan ulang `.\scripts\setup.ps1` agar dependensi backend diperbarui.

### 3. Mulai ulang dan gunakan GroqCloud

1. Tutup jendela aplikasi dengan `Ctrl+C`, lalu jalankan `.\scripts\start.ps1` dari folder proyek agar backend membaca key dan model baru.
2. Pilih rentang tanggal dan periksa Google Docs. Tombol **Buat dengan AI** merumuskan hasil yang tersirat langsung dari uraian kegiatan tanpa menambah capaian baru. Draf belum tersimpan sampai kamu memilih **Simpan perubahan**.
3. Logpilot menyamarkan email, nomor telepon, serta nomor berlabel NIM/NPM/NIK/KTP sebelum mengirim teks. Tautan dokumentasi dan rincian izin tidak dikirim. Tinjau informasi sensitif lain sebelum membuat draf.
4. Editor refleksi selalu menampilkan satu minggu kerja Senin sampai Jumat, terlepas dari rentang upload yang dipilih. Pilih **Buat draf dengan GroqCloud** untuk membuat atau membuat ulang refleksi. Hari yang belum memiliki entri ditandai agar kamu periksa sebelum menyetujui draf.
5. Tinjau dan sunting draf, lalu simpan serta setujui setelah isinya benar. Saat entri Jumat yang disetujui diotomasi, refleksi tersebut ikut diisi pada entri harian Jumat. Tahap penyelesaian logbook tetap manual.

API key hanya dibaca backend dari `backend/.env`. Jangan menaruh key di kode frontend, file README, screenshot, atau commit Git. Tanpa key yang valid, penggunaan AI menampilkan pesan yang dapat ditindaklanjuti; fitur dashboard lain tetap bisa digunakan.

### Jika GroqCloud gagal

- **API key belum diatur:** isi `GROQ_API_KEY` di `backend/.env`, lalu mulai ulang aplikasi.
- **API key ditolak:** pastikan key masih aktif dan tidak memiliki spasi atau tanda kutip tambahan.
- **Batas penggunaan tercapai:** dashboard menampilkan pesan batas penggunaan. SDK mencoba ulang kegagalan sementara hingga dua kali dengan jeda bertambah; setelah itu tunggu batas pulih sebelum membuat draf lagi.
- **Model tidak tersedia:** periksa ejaan `GROQ_MODEL` dan pilih ID model aktif di GroqCloud.
- **Koneksi atau waktu tunggu:** periksa koneksi internet, lalu coba buat ulang draf.
- **Jawaban kosong atau tidak sesuai:** periksa catatan sumber, lalu buat ulang atau tulis draf secara manual.
- **Refleksi tidak sesuai dengan catatan terbaru:** tinjau perubahan sumber, buat draf baru, atau sunting draf sebelum menyetujuinya.

Integrasi menggunakan [Groq Python SDK](https://github.com/groq/groq-python) dari backend dan memvalidasi keluaran JSON sebelum menyimpan draf. Lihat [panduan Groq](https://console.groq.com/docs/quickstart), [Structured Outputs](https://console.groq.com/docs/structured-outputs), dan [penanganan error SDK](https://github.com/groq/groq-python#handling-errors).

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
- Refleksi Jumat menggunakan data Senin–Jumat, menandai hari tanpa catatan, dan tetap berupa draf sampai diedit serta disetujui pengguna. Teks sensitif umum disamarkan sebelum dikirim ke GroqCloud.
- Setelah catatan harian disunting dan disetujui, panel **Isi logbook di portal** menampilkan pratinjau tanggal yang siap. Automation hanya mengisi dan menyimpan entri yang kamu setujui untuk rentang tersebut.
- Saat dimulai, jendela Chromium terbuka untuk login manual. Jika hasil Simpan belum pasti, automation berhenti dan meminta kamu memeriksa tanggal di portal sebelum memilih apakah entri tersimpan atau belum.
- Entri yang sudah ada tidak dikirim ulang. Kegagalan sebelum klik Simpan dapat dicoba lagi setelah ditinjau; hasil Simpan yang ambigu tidak pernah dicoba ulang otomatis.
- Impor PDF/CSV belum tersedia. Logpilot tidak akan menekan tombol “Selesaikan Logbook Magang”; finalisasi tetap dilakukan manual oleh pengguna.

### Browser untuk automation portal

Setup memasang Chromium melalui Playwright. Profil login tersimpan secara lokal di `backend/.browser-profile/` agar sesi portal tetap tersedia di antara penggunaan. Folder ini diabaikan Git. Tutup aplikasi sebelum menghapus profil jika ingin mengakhiri sesi tersimpan.

DaisyUI digunakan untuk komponen antarmuka; lihat [komponen DaisyUI](https://daisyui.com/components/) dan [panduan Next.js](https://daisyui.com/docs/install/nextjs/).
