# Sumber logbook dan konversi CSV

## Kebutuhan

PDF contoh yang diberikan menjadi salah satu contoh input. Parser berikutnya harus tetap bisa membaca logbook dengan susunan tabel atau nama kolom berbeda, lalu menyediakan preview dan pemetaan field sebelum hasil dipakai oleh otomasi.

## Bentuk contoh yang ditemukan

Contoh PDF terdiri dari beberapa halaman, metadata identitas pada halaman awal, lalu tabel harian dengan kolom minggu, tanggal, uraian kegiatan/luaran, dan tanda tangan. Nilai minggu tampak kosong pada baris lanjutan, teks uraian membungkus ke beberapa baris, tabel berlanjut melewati batas halaman, dan baris tanggal mendatang dapat kosong. Tanda tangan tidak diekstrak atau diotomasi.

## Aturan desain import

- Gunakan Google Docs API terstruktur untuk sumber Google Docs. PDF dan CSV menjadi adapter import tambahan, bukan alasan untuk meratakan semua sumber menjadi teks tanpa struktur.
- Jangan mengunci parser pada judul, urutan kolom, jumlah kolom, atau label persis dari PDF contoh.
- Deteksi kandidat kolom tanggal, aktivitas/luaran, minggu, hasil, kendala, dan dokumentasi dari header serta bentuk isi. Bila tidak yakin, minta pengguna memetakan kolom dari preview; jangan menebak atau membuang isi.
- Pertahankan teks asli, nomor baris/halaman sumber, dan hash sumber agar konflik setelah sinkronisasi terlihat.
- Normalisasi tanggal Indonesia dan teks multiline; gabungkan lanjutan halaman hanya bila batas baris dapat dibuktikan.
- Isi minggu yang kosong hanya boleh diwarisi ketika struktur menunjukkan sel gabungan/lanjutan yang sama.
- Abaikan baris tanpa aktivitas untuk tanggal mendatang. Kategori seperti izin/sakit tidak boleh menjadi entri kerja biasa.
- CSV dibuat dari data yang sudah dipreview. Field ambigu tetap memerlukan koreksi pengguna sebelum disetujui untuk otomasi.
- Semua adapter sumber menghasilkan rekaman kanonis yang sama; adapter portal menerima rekaman tersebut tanpa bergantung pada template asal.

Implementasi import dan ekspor CSV berada di Phase 2, bukan Phase 0/1.
