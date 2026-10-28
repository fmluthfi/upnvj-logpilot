# Keamanan dan data lokal

- Aplikasi hanya ditujukan untuk `localhost`; backend akan bind ke `127.0.0.1`.
- Kredensial kampus, token OAuth, kunci GroqCloud, profil browser, database lokal, log, dan screenshot diagnostik tidak boleh masuk Git.
- Google Docs memakai OAuth `documents.readonly`; dokumen sumber hanya dibaca dan token tersimpan di `.local` yang diabaikan Git.
- Portal dibuka pada jendela Chromium yang terlihat; login dilakukan manual. Playwright memakai profil lokal `.browser-profile`; kata sandi dan cookie sesi tidak dicatat di log atau database aplikasi.
- Automation hanya memproses entri harian yang sudah disetujui, lengkap, dan lolos pratinjau. Sebelum klik, adapter memeriksa URL portal, tanggal aktif, selector persis, nama tombol `Simpan`, dan jumlah kontrol.
- Jika hasil klik Simpan tidak pasti, automation berhenti. Entri hanya dapat dicoba ulang setelah pengguna memeriksa portal dan menyatakan entri tidak ada. Entri yang sudah terdeteksi tidak dikirim ulang.
- Automation tidak memanggil atau memilih tombol finalisasi. Penyelesaian logbook tetap manual.
- Jangan kirim data ke layanan AI sebelum data disanitasi dan pengguna menyetujui refleksi yang dihasilkan.

Lihat [PORTAL_MAPPING.md](PORTAL_MAPPING.md) untuk selector portal yang teramati dan batas verifikasi saat ini.
