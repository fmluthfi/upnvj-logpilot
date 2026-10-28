# Pemetaan Portal Kampus Berdampak

## Hasil inspeksi DOM read-only

Halaman logbook dibuka dalam sesi browser pengguna. Tanggal Jumat yang kosong dipilih dan form kosong dibuka untuk membaca struktur; tidak ada data yang diisi dan tombol simpan maupun finalisasi tidak ditekan.

| Bagian | Selector/temuan teramati | Status |
| --- | --- | --- |
| Konteks panel entri | `#lbhRail` (unik) | Teramati |
| Simpan harian | `#lbhRail #lbhBtnSave` (unik), nama tombol `Simpan`, tipe `button` | Selector dan konteks teramati; efek simpan belum diuji |
| Finalisasi | `#lbhStatusBar #lbhBtnFinish` (unik), nama tombol `Selesaikan Logbook Sekarang` | Dilarang; tidak disentuh |
| Pemilih tanggal | `#lbhCalGrid` (unik); sel hari tidak memiliki `data-date` atau `aria-label` | Cocokkan bulan/tahun dan pastikan angka hari hanya cocok satu kali |
| Waktu | `#fMulai` dan `#fSelesai`, keduanya `input[type=time]` | Ditandai wajib pada UI; nilai awal portal bukan bukti jam kerja |
| Uraian | `#fUraianField input` (unik), tombol poin `#lbhBtnAddUraian` | Ditandai wajib pada UI; uraian dapat memiliki poin tambahan |
| Hasil dan kendala | `#fHasil`, `#fKendala` | Hasil wajib; kendala opsional menurut UI |
| Dokumentasi | `#fDok`, `input[type=url]`, label tautan Google Drive | Wajib pada UI; bukan unggah berkas |
| Refleksi Jumat | `#fRefleksi`, satu textarea | Wajib pada Jumat menurut label UI; satu prompt terlihat |
| Verifikasi setelah simpan | Belum diperiksa | Belum ada entri yang disimpan |

Setiap selector di atas teramati pada DOM halaman yang sedang dibuka dan ditemukan satu kali dalam konteksnya. Form Jumat menampilkan `Refleksi Tambahan (wajib — hari Jumat)`. Form tanggal non-Jumat menampilkan field refleksi tanpa penanda wajib. Teks UI menandai waktu, uraian, hasil, dan dokumentasi sebagai wajib; field tidak memakai atribut HTML `required` pada inspeksi ini.

## Status implementasi

Mapping kode mengaktifkan hanya selector yang teramati. Sebelum menyimpan, adapter memeriksa URL portal, tanggal aktif pada panel, selector persis, nama tombol `Simpan`, dan jumlah kontrol. Jika pemeriksaan gagal, proses berhenti. Tidak ada selector umum untuk menyimpan.

Setelah klik, adapter menandai hasil tersimpan hanya jika uraian muncul tepat satu kali pada panel tanggal. Jika perubahan halaman, timeout, atau kesalahan browser membuat hasil tidak pasti, antrean berhenti dan pengguna harus memeriksa portal secara manual. Percobaan ulang hasil ambigu memerlukan konfirmasi bahwa pengguna sudah memeriksa dan entri memang tidak ada. Entri yang sudah terdeteksi tidak dikirim ulang.

## Hal yang belum terverifikasi

- Perilaku jaringan dan hasil portal setelah tombol `Simpan` ditekan.
- Indikator yang bisa dipakai untuk memastikan entri tersimpan dan mencegah duplikasi.
- Validasi server untuk setiap field wajib.
- Identitas tanggal pada kalender: sel hanya menampilkan angka hari tanpa atribut tanggal stabil, jadi bulan/tahun harus diverifikasi sebelum pemilihan.
- Batas panjang dan instruksi isi refleksi.

Efek simpan dan indikator portal sesudahnya belum diverifikasi dengan entri sungguhan. Pengujian memakai mock dan tidak mengirim entri. Perubahan DOM yang mengubah selector atau label harus membuat automation berhenti. Aksi finalisasi logbook selalu dilarang.
