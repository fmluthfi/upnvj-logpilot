# API Automation Extension

Semua endpoint berjalan pada API lokal `http://127.0.0.1:8000`. Dashboard menyiapkan data dan batch; hanya Chrome Extension yang boleh mengambil snapshot untuk interaksi portal.

## Pairing

1. Dashboard meminta `POST /api/extension/pairing-code` dari origin `http://localhost:3000` atau `http://127.0.0.1:3000`.
2. Kode acak berlaku lima menit dan hanya dapat dipakai sekali melalui `POST /api/extension/pair` dengan `{ "code": "..." }`.
3. Respons pairing memuat bearer token satu kali. Backend hanya menyimpan hash token dan hash kode. Extension menyimpan token di konteks tepercaya miliknya; token tidak dikirim ke dashboard setelah pairing.
4. `GET /api/extension/pairing-status` memberi status aman untuk dashboard. `GET /api/extension/status` memerlukan `Authorization: Bearer <token>`.
5. `DELETE /api/extension/pair` memutus pairing dan memerlukan bearer token. Backend menolak pemutusan selama batch extension masih siap, berjalan, dijeda, atau dihentikan.

CORS membatasi origin dashboard, tetapi bukan autentikasi. Endpoint extension tetap memeriksa bearer token. Jangan meneruskan token, kode pairing, atau header Authorization ke content script maupun log.

## Batch dan klaim

`POST /api/runs/prepare` menerima `{ "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "confirmed": true }`. Backend memvalidasi ulang entri yang telah disetujui, membuat snapshot per entri, lalu mengunci entri sumber selama batch siap atau berjalan. Edit sesudah persiapan tidak mengubah snapshot. Retry ditolak jika data sumber berbeda dari snapshot.

`GET /api/extension/jobs/latest` membaca batch extension terbaru. `POST /api/extension/jobs/claim` memerlukan bearer token dan `{ "worker_id": "..." }`. Satu extension memegang paling banyak satu entri aktif. Respons berisi `run_id`, `run_entry_id`, `entry_id`, `save_attempted`, `lease_expires_at`, dan snapshot `entry`; respons `null` berarti belum ada entri yang dapat diklaim. Klaim aktif dari worker yang sama dikembalikan lagi agar service worker bisa pulih setelah disuspensi.

Lease berlaku dua menit. Kirim `POST /api/extension/jobs/{run_id}/entries/{run_entry_id}/heartbeat` secara berkala. Lease yang kedaluwarsa sebelum upaya Simpan dapat diklaim ulang. Lease yang kedaluwarsa sesudahnya mengubah entri menjadi `verification_needed`; extension lalu memeriksa portal tanpa menyimpan ulang. Hanya status `Menunggu Validasi` pada tanggal yang sama dan kecocokan seluruh field pada form revisi yang mengonfirmasi Simpan. Jika pemeriksaan itu gagal, batch tetap dijeda untuk ditinjau pengguna.

## Penyimpanan dan hasil

Sebelum menekan kontrol Simpan harian yang sudah diverifikasi, extension wajib memanggil `POST /api/extension/jobs/{run_id}/entries/{run_entry_id}/save-attempted`. Penandaan ini hanya boleh satu kali. Jika responsnya hilang atau endpoint menolak, jangan menekan Simpan; periksa status dan portal.

Laporkan hasil melalui `POST /api/extension/jobs/{run_id}/entries/{run_entry_id}/report`:

- `success`: hanya setelah upaya Simpan tercatat dan entri portal dapat diverifikasi. Untuk pemulihan lease, extension mengirim `portal_verified: true` hanya setelah status dan semua field cocok. Tidak perlu menunggu validasi dosen.
- `updated`: hanya setelah perbedaan entri yang sudah ada diperiksa per field, form revisi disimpan sekali, lalu semua field cocok saat form dibuka kembali.
- `already_present`: hanya bila semua field pada entri portal cocok dengan snapshot; tidak menekan Simpan lagi.
- `failed`: jika berhenti sebelum Simpan, entri aman untuk ditinjau dan dicoba ulang. Jika Simpan sudah dicatat, hasil diverifikasi sebelum batch dilanjutkan.
- `skipped`: perlu ditinjau dan tidak otomatis dicoba ulang.
- `unknown`: hasil yang tidak dapat dipastikan; setelah upaya Simpan, extension mencoba mencocokkan entri baca-saja sebelum meminta pemeriksaan manual.
- `paused` dan `stopped`: hanya untuk checkpoint sebelum upaya Simpan.

`GET /api/extension/jobs/{run_id}` membaca progres. `GET /api/extension/jobs/{run_id}/entries/{run_entry_id}` hanya mengembalikan snapshot untuk entri extension yang perlu verifikasi sesudah upaya Simpan. Hasil verifikasi dikirim lewat endpoint `report` yang sama; backend hanya menerima `portal_verified: true` untuk status `verification_needed` dan hasil sukses. Jika semua field cocok, batch melanjutkan klaim berikutnya otomatis. `POST /api/extension/jobs/{run_id}/control` menerima `pause`, `resume`, atau `stop` dan memerlukan bearer token. `POST /api/extension/jobs/{run_id}/retry-failed` menggunakan `{ "confirmed": true }` dan hanya mengulang entri gagal yang snapshot sumbernya belum berubah. Dashboard menggunakan `POST /api/runs/{run_id}/control` dengan kontrak aksi yang sama.

Tidak ada endpoint atau aksi extension untuk menyelesaikan/finalisasi logbook. Kontrol Simpan hanya boleh mengirim satu entri harian.

## Siklus hidup Manifest V3

Service worker menyimpan worker ID, klaim aktif, tab portal, langkah, dan penanda Simpan di `chrome.storage.local` dengan akses `TRUSTED_CONTEXTS`. Alarm satu menit dan pemeriksaan status popup memulihkan batch. Jika lease kedaluwarsa setelah Simpan, extension membuka form revisi untuk membaca field dan menutupnya dengan `Batal`; extension tidak menekan Simpan lagi. Batch otomatis berlanjut setelah verifikasi cocok. Content script hanya berkomunikasi dengan service worker melalui pesan bertipe dan tidak menerima bearer token.

Rujukan resmi Chrome:

- [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Cross-origin network requests dan host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)
