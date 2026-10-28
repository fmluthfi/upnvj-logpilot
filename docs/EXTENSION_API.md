# API Automation Extension

Semua endpoint berjalan pada API lokal `http://127.0.0.1:8000`. Dashboard menyiapkan data dan batch; hanya Chrome Extension yang boleh mengambil snapshot untuk interaksi portal.

## Pairing

1. Dashboard meminta `POST /api/extension/pairing-code` dari origin `http://localhost:3000` atau `http://127.0.0.1:3000`.
2. Kode acak berlaku lima menit dan hanya dapat dipakai sekali melalui `POST /api/extension/pair` dengan `{ "code": "..." }`.
3. Respons pairing memuat bearer token satu kali. Backend hanya menyimpan hash token dan hash kode. Extension menyimpan token di konteks tepercaya miliknya; token tidak dikirim ke dashboard setelah pairing.
4. `GET /api/extension/pairing-status` memberi status aman untuk dashboard. `GET /api/extension/status` memerlukan `Authorization: Bearer <token>`.
5. `DELETE /api/extension/pair` memutus pairing dan memerlukan bearer token.

CORS membatasi origin dashboard, tetapi bukan autentikasi. Endpoint extension tetap memeriksa bearer token. Jangan meneruskan token, kode pairing, atau header Authorization ke content script maupun log.

## Batch dan klaim

`POST /api/runs/prepare` menerima `{ "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "confirmed": true }`. Backend memvalidasi ulang entri yang telah disetujui, membuat snapshot per entri, lalu mengunci entri sumber selama batch siap atau berjalan. Edit sesudah persiapan tidak mengubah snapshot. Retry ditolak jika data sumber berbeda dari snapshot.

`POST /api/extension/jobs/claim` memerlukan bearer token dan `{ "worker_id": "..." }`. Satu extension memegang paling banyak satu entri aktif. Respons berisi `run_id`, `run_entry_id`, `entry_id`, `lease_expires_at`, dan snapshot `entry`; respons `null` berarti belum ada entri yang dapat diklaim. Klaim aktif dari worker yang sama dikembalikan lagi agar service worker bisa pulih setelah disuspensi.

Lease berlaku dua menit. Kirim `POST /api/extension/jobs/{run_id}/entries/{run_entry_id}/heartbeat` secara berkala. Lease yang kedaluwarsa sebelum upaya Simpan dapat diklaim ulang. Lease yang kedaluwarsa setelah upaya Simpan mengubah entri menjadi `verification_needed` dan menghentikan batch sampai pengguna memeriksa portal.

## Penyimpanan dan hasil

Sebelum menekan kontrol Simpan harian yang sudah diverifikasi, extension wajib memanggil `POST /api/extension/jobs/{run_id}/entries/{run_entry_id}/save-attempted`. Penandaan ini hanya boleh satu kali. Jika responsnya hilang atau endpoint menolak, jangan menekan Simpan; periksa status dan portal.

Laporkan hasil melalui `POST /api/extension/jobs/{run_id}/entries/{run_entry_id}/report`:

- `success`: hanya setelah upaya Simpan tercatat dan persistensi diverifikasi.
- `already_present`: hanya bila aktivitas yang sama sudah terlihat pada tanggal tujuan sebelum pengisian; tidak menekan Simpan lagi.
- `failed`: jika berhenti sebelum Simpan, entri aman untuk ditinjau dan dicoba ulang. Jika Simpan sudah dicatat, hasil berubah menjadi pemeriksaan manual.
- `skipped`: perlu ditinjau dan tidak otomatis dicoba ulang.
- `unknown`: hasil yang tidak dapat dipastikan; setelah upaya Simpan, status wajib diperiksa manual.

`GET /api/extension/jobs/{run_id}` membaca progres. `POST /api/extension/jobs/{run_id}/control` menerima `pause`, `resume`, atau `stop` dan memerlukan bearer token. Dashboard menggunakan `POST /api/runs/{run_id}/control` dengan kontrak aksi yang sama.

Tidak ada endpoint atau aksi extension untuk menyelesaikan/finalisasi logbook. Kontrol Simpan hanya boleh mengirim satu entri harian.

## Siklus hidup Manifest V3

Service worker tidak boleh mengandalkan variabel global selama job berjalan. Pulihkan job dan worker ID dari extension storage, lanjutkan heartbeat melalui event/alarm, lalu minta status dari API setelah worker aktif kembali. Content script hanya berkomunikasi dengan service worker melalui pesan yang bertipe; ia tidak menerima bearer token.

Rujukan resmi Chrome:

- [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Cross-origin network requests dan host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)
