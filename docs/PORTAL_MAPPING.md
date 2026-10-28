# Pemetaan Portal Kampus Berdampak

## Hasil inspeksi DOM read-only

Halaman logbook dibuka dalam sesi browser pengguna. Form entri baru dan form revisi dibuka hanya untuk membaca struktur. Form revisi ditutup memakai tombol `Batal`; tidak ada perubahan yang disimpan dan tombol finalisasi tidak disentuh.

| Bagian | Selector/temuan teramati | Status |
| --- | --- | --- |
| Konteks panel entri | `#lbhRail` (unik) | Teramati |
| Simpan harian | `#lbhRail #lbhBtnSave` (unik), nama tombol `Simpan`, tipe `button` | Selector dan konteks teramati; efek simpan belum diuji |
| Finalisasi | `#lbhStatusBar #lbhBtnFinish` (unik), nama tombol `Selesaikan Logbook Sekarang` | Dilarang; tidak disentuh |
| Pemilih tanggal | `#lbhCalGrid` (unik); sel hari tidak memiliki `data-date` atau `aria-label` | Cocokkan bulan/tahun dan pastikan angka hari hanya cocok satu kali |
| Tambah entri kosong | `#lbhBtnAdd` (unik), nama `Tambah Entri`, tipe `button` | Hanya dipakai ketika panel menampilkan `Belum ada entri` |
| Revisi entri yang sudah ada | `#lbhRail #lbhBtnEdit` (unik), nama `✎ Ubah Entri`, tipe `button` | Teramati pada entri berstatus `Menunggu Validasi`; membuka heading `Revisi Entri` |
| Status tersimpan | Tombol dalam `#lbhRail` dengan teks persis `Menunggu Validasi` | Dibaca saja; tidak pernah diklik |
| Waktu | `#fMulai` dan `#fSelesai`, keduanya `input[type=time]` | Ditandai wajib pada UI; nilai awal portal bukan bukti jam kerja |
| Uraian | `#fUraianField input` (unik), tombol poin `#lbhBtnAddUraian` | Ditandai wajib pada UI; uraian dapat memiliki poin tambahan |
| Hasil dan kendala | `#fHasil`, `#fKendala` | Hasil wajib; kendala opsional menurut UI |
| Dokumentasi | `#fDok`, `input[type=url]`, label tautan Google Drive | Wajib pada UI; bukan unggah berkas |
| Refleksi Jumat | `#fRefleksi`, satu textarea | Wajib pada Jumat menurut label UI; satu prompt terlihat |
| Tutup form tanpa menyimpan | `#lbhRail #lbhBtnCancel` (unik), nama `Batal`, tipe `button` | Digunakan untuk menutup form pemeriksaan/revisi tanpa menyimpan |
| Verifikasi setelah simpan | Form harus tertutup, uraian tampil tepat satu kali, dan status tanggal dibaca dari panel | Jika lease kedaluwarsa, status `Menunggu Validasi` dan semua field revisi harus cocok sebelum batch lanjut; form ditutup dengan `Batal` |

Setiap selector di atas teramati pada DOM halaman yang sedang dibuka dan ditemukan satu kali dalam konteksnya. Form Jumat menampilkan `Refleksi Tambahan (wajib — hari Jumat)`. Form tanggal non-Jumat menampilkan field refleksi tanpa penanda wajib. Teks UI menandai waktu, uraian, hasil, dan dokumentasi sebagai wajib; field tidak memakai atribut HTML `required` pada inspeksi ini.

## Status implementasi

Mapping extension mengaktifkan hanya selector yang teramati. Sebelum menekan Simpan, adapter memeriksa URL portal, tanggal aktif pada panel, selector persis, nama dan tipe tombol, konteks panel, visibilitas, status aktif, serta teks dan atribut yang dapat menunjukkan finalisasi. Revisi hanya boleh memakai tombol Simpan saat heading `Revisi Entri` terlihat. Pemeriksaan diulang setelah penanda upaya Simpan tercatat. Jika pemeriksaan gagal, proses berhenti. Tidak ada selector umum untuk menyimpan.

Automation membandingkan jam, uraian, hasil, kendala, dokumentasi, dan refleksi di form revisi. Jika semua cocok dengan snapshot yang disetujui, Simpan tidak ditekan. Jika ada perbedaan, extension mengisi form `Revisi Entri`, menekan hanya tombol Simpan harian yang terverifikasi, lalu membuka ulang form untuk memeriksa seluruh nilainya. Entri dengan lebih dari satu poin uraian atau field yang tidak dapat dibaca dilewati tanpa disimpan. Entri baru hanya dibuat pada tanggal yang menampilkan `Belum ada entri`, sehingga perbedaan data tidak membuat duplikat. Jika hasil Simpan sempat tidak pasti, extension hanya menandai entri tersimpan dan melanjutkan antrean saat status `Menunggu Validasi` dan semua field cocok; selain itu antrean berhenti untuk pemeriksaan pengguna.

## Hal yang belum terverifikasi

- Perilaku jaringan dan hasil server setelah tombol `Simpan` ditekan. Sukses saat ini didasarkan pada keadaan DOM setelah form ditutup, bukan pemeriksaan jaringan terpisah.
- Konfirmasi persistensi di luar status UI portal; status `Menunggu Validasi` dan kecocokan form adalah bukti tampilan, bukan pemeriksaan jaringan terpisah.
- Validasi server untuk setiap field wajib.
- Identitas tanggal pada kalender: bulan/tahun harus diverifikasi sebelum pemilihan tanggal.
- Batas panjang dan instruksi isi refleksi.

Efek simpan belum diverifikasi dengan entri sungguhan. Pengujian guard memakai kontrol mock dan tidak mengirim entri. Perubahan DOM yang mengubah selector atau label harus membuat automation berhenti. Aksi finalisasi logbook selalu dilarang.
