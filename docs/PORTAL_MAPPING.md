# Pemetaan Portal Kampus Berdampak

## Hasil inspeksi DOM read-only

Halaman logbook dibuka dalam sesi browser pengguna. Tanggal Jumat yang kosong dipilih dan form kosong dibuka untuk membaca struktur; tidak ada data yang diisi dan tombol simpan maupun finalisasi tidak ditekan.

| Bagian | Selector/temuan teramati | Status |
| --- | --- | --- |
| Konteks panel entri | `#lbhRail` (unik) | Teramati |
| Simpan harian | `#lbhRail #lbhBtnSave` (unik), nama tombol `Simpan`, tipe `button` | Teramati; efek simpan belum diuji |
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

Mapping kode menyimpan locator konteks `#lbhRail` dan tombol `#lbhBtnSave`, tetapi `mapping_verified=false`. Adapter submit selalu menolak aksi sampai implementasi dan verifikasi berikutnya selesai. Guard hanya menerima locator allowlist yang sama, konteks yang terverifikasi, satu kontrol, dan nama kontrol tepat `Simpan`.

## Hal yang belum terverifikasi

- Perilaku jaringan dan hasil portal setelah tombol `Simpan` ditekan.
- Indikator yang bisa dipakai untuk memastikan entri tersimpan dan mencegah duplikasi.
- Validasi server untuk setiap field wajib.
- Identitas tanggal pada kalender: sel hanya menampilkan angka hari tanpa atribut tanggal stabil, jadi bulan/tahun harus diverifikasi sebelum pemilihan.
- Batas panjang dan instruksi isi refleksi.

Sebelum adapter live dibuat, uji guard dengan mock portal dan pastikan halaman serta konteks harian diperiksa sebelum aksi simpan. Setiap perubahan DOM harus membuat otomasi berhenti. Aksi finalisasi logbook selalu dilarang.
