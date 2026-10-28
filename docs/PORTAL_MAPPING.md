# Pemetaan Portal Kampus Berdampak

## Hasil inspeksi DOM read-only

Halaman logbook dibuka dalam sesi browser pengguna. Tanggal Jumat yang kosong dipilih dan form kosong dibuka untuk membaca struktur; tidak ada data yang diisi dan tombol simpan maupun finalisasi tidak ditekan.

| Bagian | Selector/temuan teramati | Status |
| --- | --- | --- |
| Konteks panel entri | `#lbhRail` (unik) | Teramati |
| Simpan harian | `#lbhRail #lbhBtnSave` (unik), nama tombol `Simpan`, tipe `button` | Selector dan konteks teramati; efek simpan belum diuji |
| Finalisasi | `#lbhStatusBar #lbhBtnFinish` (unik), nama tombol `Selesaikan Logbook Sekarang` | Dilarang; tidak disentuh |
| Pemilih tanggal | `#lbhCalGrid` (unik); sel hari tidak memiliki `data-date` atau `aria-label` | Cocokkan bulan/tahun dan pastikan angka hari hanya cocok satu kali |
| Tambah entri kosong | `#lbhBtnAdd` (unik), nama `Tambah Entri`, tipe `button` | Hanya dipakai ketika panel menampilkan `Belum ada entri` |
| Waktu | `#fMulai` dan `#fSelesai`, keduanya `input[type=time]` | Ditandai wajib pada UI; nilai awal portal bukan bukti jam kerja |
| Uraian | `#fUraianField input` (unik), tombol poin `#lbhBtnAddUraian` | Ditandai wajib pada UI; uraian dapat memiliki poin tambahan |
| Hasil dan kendala | `#fHasil`, `#fKendala` | Hasil wajib; kendala opsional menurut UI |
| Dokumentasi | `#fDok`, `input[type=url]`, label tautan Google Drive | Wajib pada UI; bukan unggah berkas |
| Refleksi Jumat | `#fRefleksi`, satu textarea | Wajib pada Jumat menurut label UI; satu prompt terlihat |
| Tutup form tanpa menyimpan | `#lbhBtnCancel` (unik), nama `Batal`, tipe `button` | Dipakai hanya untuk membuang form yang dibuka dan diisi oleh extension sebelum Simpan |
| Verifikasi setelah simpan | Form harus tertutup dan uraian tampil tepat satu kali pada `#lbhRail` | Konfirmasi DOM; persistensi server belum diverifikasi |

Setiap selector di atas teramati pada DOM halaman yang sedang dibuka dan ditemukan satu kali dalam konteksnya. Form Jumat menampilkan `Refleksi Tambahan (wajib — hari Jumat)`. Form tanggal non-Jumat menampilkan field refleksi tanpa penanda wajib. Teks UI menandai waktu, uraian, hasil, dan dokumentasi sebagai wajib; field tidak memakai atribut HTML `required` pada inspeksi ini.

## Status implementasi

Mapping extension mengaktifkan hanya selector yang teramati. Sebelum menekan Simpan, adapter memeriksa URL portal, tanggal aktif pada panel, selector persis, nama dan tipe tombol, konteks panel, visibilitas, status aktif, serta teks dan atribut yang dapat menunjukkan finalisasi. Pemeriksaan diulang setelah penanda upaya Simpan tercatat. Jika pemeriksaan gagal, proses berhenti. Tidak ada selector umum untuk menyimpan.

Automation hanya mengisi entri pada tanggal dengan panel `Belum ada entri`. Jika tanggal sudah berisi uraian yang sama, entri tidak dikirim ulang. Jika tanggal berisi kegiatan berbeda, entri dilewati untuk ditinjau. Setelah klik, hasil dianggap sukses hanya ketika form tertutup dan uraian tampil tepat satu kali pada panel tanggal. Jika perubahan halaman, timeout, atau kesalahan browser membuat hasil tidak pasti, antrean berhenti dan pengguna harus memeriksa portal secara manual. Percobaan ulang hasil ambigu memerlukan konfirmasi bahwa pengguna sudah memeriksa dan entri memang tidak ada.

## Hal yang belum terverifikasi

- Perilaku jaringan dan hasil server setelah tombol `Simpan` ditekan. Sukses saat ini didasarkan pada keadaan DOM setelah form ditutup, bukan pemeriksaan jaringan terpisah.
- Indikator server yang bisa dipakai untuk memastikan entri tersimpan dan mencegah duplikasi.
- Validasi server untuk setiap field wajib.
- Identitas tanggal pada kalender: sel hanya menampilkan angka hari tanpa atribut tanggal stabil, jadi bulan/tahun harus diverifikasi sebelum pemilihan.
- Batas panjang dan instruksi isi refleksi.

Efek simpan belum diverifikasi dengan entri sungguhan. Pengujian guard memakai kontrol mock dan tidak mengirim entri. Perubahan DOM yang mengubah selector atau label harus membuat automation berhenti. Aksi finalisasi logbook selalu dilarang.
