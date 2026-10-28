# Keamanan dan data lokal

- Aplikasi hanya ditujukan untuk `localhost`; backend akan bind ke `127.0.0.1`.
- Kredensial kampus, token OAuth, kunci GroqCloud, profil browser, database lokal, log, dan screenshot diagnostik tidak boleh masuk Git.
- Google Docs akan memakai izin baca saja saat integrasi Phase 2 dibuat. Belum ada koneksi OAuth atau akses dokumen aktif.
- Login portal dilakukan manual. Kata sandi dan cookie sesi tidak dicatat di log atau database aplikasi.
- Pengiriman ke portal belum diimplementasikan. Selector yang teramati dicatat, tetapi `mapping_verified=false` dan guard menolak semua upaya simpan.
- Finalisasi logbook tidak termasuk dalam daftar aksi yang diizinkan.
- Jangan kirim data ke layanan AI sebelum data disanitasi dan pengguna menyetujui refleksi yang dihasilkan.

Lihat [PORTAL_MAPPING.md](PORTAL_MAPPING.md) untuk bukti yang dibutuhkan sebelum adapter live dapat dibuat.
