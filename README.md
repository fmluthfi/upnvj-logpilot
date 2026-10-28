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

1. Buat atau pilih API key melalui [Google AI Studio](https://aistudio.google.com/apikey). Ikuti petunjuk autentikasi key Google jika proyek meminta langkah tambahan.
2. Buka `backend/.env` dan isi:

       GEMINI_API_KEY=key-dari-google-ai-studio
       GEMINI_MODEL=model-id-yang-tersedia

3. Pilih `GEMINI_MODEL` dari [daftar model Gemini API](https://ai.google.dev/gemini-api/docs/models). Ketersediaan model, kuota, dan biaya dapat berbeda menurut proyek dan berubah dari waktu ke waktu; periksa informasi terbaru di AI Studio sebelum memilih.
4. Simpan key hanya di `backend/.env`. Jangan menaruhnya di kode frontend, README, screenshot, atau commit Git. File `.env` diabaikan Git.

Saat ini aplikasi belum mengirim permintaan ke Gemini; key boleh dibiarkan kosong dan tidak dibutuhkan untuk menjalankan dashboard. Integrasi refleksi Gemini direncanakan pada Phase 4. Backend akan menjadi satu-satunya bagian aplikasi yang membaca key.

## Setup Google Docs

1. Buka atau buat proyek di [Google Cloud Console](https://console.cloud.google.com/).
2. Aktifkan **Google Docs API** dari **APIs & Services → Library**.
3. Atur layar persetujuan OAuth. Jika status aplikasi masih *Testing*, tambahkan akun Google yang akan dipakai sebagai pengguna uji.
4. Buat OAuth client dengan jenis aplikasi **Desktop app**, lalu unduh file JSON-nya.
5. Simpan file tersebut sebagai `backend/.local/google-oauth-client.json`. Folder `.local` diabaikan Git; jangan unggah file ini ke repository.
6. Jalankan Logpilot, pilih **Hubungkan Google Docs**, lalu setujui akses baca pada browser yang terbuka.
7. Tempel URL atau ID dokumen ke dashboard. Akun Google yang terhubung harus memiliki akses lihat ke dokumen itu.

Logpilot meminta scope `documents.readonly`; dokumen asli tidak diubah. Token persetujuan disimpan di `backend/.local/google-token.json` pada komputer ini dan juga diabaikan Git. Hapus file token itu untuk memutus koneksi. Untuk menghubungkan lagi, ulangi langkah koneksi dari dashboard.

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
- Impor CSV/PDF dan pengiriman entri ke portal belum tersedia. Otomasi tidak akan pernah menekan tombol “Selesaikan Logbook Magang”.

DaisyUI digunakan untuk komponen antarmuka; lihat [komponen DaisyUI](https://daisyui.com/components/) dan [panduan Next.js](https://daisyui.com/docs/install/nextjs/).
