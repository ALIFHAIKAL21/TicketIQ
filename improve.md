# TicketIQ — Backend Improvement Roadmap

Dokumen ini mencatat rencana pengembangan logic backend TicketIQ agar
berkembang dari API klasifikasi tiket menjadi mini-SaaS support inbox yang
realistis dan mudah didemokan.

Fokus tahap ini adalah **fitur bisnis dan API**, bukan tampilan frontend.
Endpoint dapat diuji lewat Swagger. Frontend dibuat setelah alur backend
matang.

> **Status:** rencana. Item di bawah ini belum dianggap selesai sebelum
> implementasi dan acceptance test-nya lulus.

## Gambaran produk

TicketIQ membantu tim support mengelola pekerjaan tiket:

1. Tiket dibuat dan kategori serta urgency diklasifikasikan.
2. Tiket masuk ke antrean dengan status yang jelas.
3. Agent mengambil tanggung jawab dan mencatat tindak lanjut.
4. Tiket diselesaikan, dan riwayat tindakannya tetap bisa diperiksa.
5. Tim dapat mencari tiket dan melihat kondisi antrean.

Prinsip penting:

- ML membantu proses triage; agent tetap mengelola dan memutuskan tindakan.
- `urgency` tetap dihitung oleh rule FastAPI, bukan diketik atau diprediksi
  ulang oleh NestJS.
- Fitur baru harus mendukung alur kerja tiket, bukan CRUD terpisah tanpa
  kegunaan yang jelas.
- Tiap tahap harus bisa dicoba dan diverifikasi lewat API/Swagger.

## Tahap 1 — Status, agent, assignment, dan activity history

### Tujuan

Mengelola pekerjaan setelah tiket dibuat: mengetahui tahap pengerjaan,
siapa yang bertanggung jawab, dan apa saja perubahan yang terjadi.

### Fitur

- Tambahkan status awal seperti `NEW`, `IN_PROGRESS`, dan `RESOLVED`.
- Buat aturan transisi status yang valid, termasuk apakah tiket `RESOLVED`
  boleh dibuka kembali.
- Tambahkan agent sebagai penanggung jawab tiket.
- Tiket dapat di-assign dan assignment dapat diubah.
- Agent yang tidak aktif tidak boleh menerima assignment baru.
- Tambahkan catatan internal untuk konteks dan tindak lanjut support.
- Simpan activity history yang mencatat kejadian penting, misalnya:
  - tiket dibuat;
  - tiket di-assign atau assignment diubah;
  - status berubah;
  - catatan internal ditambahkan.
- Simpan perubahan tiket dan event riwayatnya secara konsisten: bila salah
  satunya gagal, keduanya tidak boleh terlihat seolah berhasil.

### Contoh API

Nama/path berikut adalah contoh rancangan, belum kontrak final:

```text
GET    /agents
PATCH  /tickets/:id/assignee
PATCH  /tickets/:id/status
POST   /tickets/:id/notes
GET    /tickets/:id/activity
```

### Acceptance

- Tiket baru memiliki status awal yang ditetapkan.
- Perubahan status yang tidak diizinkan ditolak dengan error yang konsisten.
- Assignment hanya menerima agent yang tersedia.
- Detail tiket menampilkan status dan assignee terkini.
- Activity history menunjukkan perubahan penting secara kronologis.
- Jika penyimpanan event gagal, perubahan tiket tidak tertinggal tanpa riwayat.
- Unit/e2e test mencakup alur sukses, tiket tidak ditemukan, agent tidak valid,
  dan transisi status yang ditolak.

### Demo

```text
Buat tiket
→ cari tiket NEW
→ assign ke agent
→ tambahkan catatan
→ ubah status ke IN_PROGRESS
→ selesaikan tiket
→ lihat detail dan activity history
```

## Tahap 2 — Pencarian, filter, pagination, dan ringkasan antrean

### Tujuan

Membuat antrean tetap berguna ketika jumlah tiket bertambah, dan memudahkan
agent menemukan pekerjaan yang perlu ditangani.

### Fitur

- Pencarian teks pada field tiket yang disepakati, misalnya title dan
  description.
- Filter berdasarkan status, category, urgency, assignee, dan `isFallback`.
- Pagination dengan batas ukuran halaman yang aman.
- Sorting dengan urutan yang eksplisit dan stabil; urgency tetap
  High → Medium → Low, kemudian waktu terbaru.
- Endpoint ringkasan antrean yang menghitung data dari database, seperti
  jumlah tiket per status dan jumlah tiket High yang belum selesai.

### Contoh API

Nama/path berikut adalah contoh rancangan, belum kontrak final:

```text
GET /tickets?q=payment&status=NEW&urgency=High&page=1&limit=20
GET /tickets/summary
```

Response list sebaiknya menyertakan informasi pagination, seperti jumlah total,
halaman aktif, ukuran halaman, dan data halaman tersebut.

### Acceptance

- Filter dapat digabung dan hasilnya sesuai semua kriteria.
- Parameter pagination tidak menerima nilai di luar batas yang ditetapkan.
- Sorting sama pada setiap request dengan data yang sama.
- Ringkasan dihitung dari tiket yang benar, tidak memakai angka contoh
  hardcoded.
- Test mencakup filter gabungan, pagination, sorting, dan hasil kosong.

## Tahap 3 — Koreksi hasil ML oleh manusia

### Tujuan

Memberi agent cara memperbaiki kategori yang salah tanpa menghapus jejak
prediksi awal model.

### Fitur

- Simpan kategori prediksi model secara terpisah dari kategori final tiket.
- Sediakan aksi untuk mengoreksi kategori final dengan alasan.
- Catat siapa yang mengoreksi, kapan, kategori awal, dan kategori baru.
- Gunakan data koreksi sebagai bahan evaluasi atau dataset feedback di masa
  depan; jangan melakukan retraining otomatis dari request aplikasi.
- Jangan menampilkan confidence score kecuali ML service benar-benar
  mengembalikan score yang didefinisikan dan tervalidasi.

### Acceptance

- Koreksi kategori tidak menimpa catatan prediksi awal.
- Koreksi memerlukan kategori valid dan alasan yang tidak kosong.
- Perubahan tercatat di activity history.
- Laporan dapat membedakan hasil prediksi awal dan kategori final.

> `urgency` tidak ikut dikoreksi melalui fitur ini. Nilainya tetap berasal dari
> rule FastAPI. Jika kelak ada prioritas operasional manual, gunakan field
> terpisah agar makna `urgency` tetap konsisten.

## Tahap 4 — SLA sederhana

### Tujuan

Membantu tim mengenali tiket yang perlu ditangani sebelum terlambat.

### Fitur

- Tentukan kebijakan waktu respons berdasarkan urgency.
- Simpan waktu jatuh tempo yang diperlukan untuk menghitung keterlambatan.
- Sediakan filter/ringkasan tiket yang overdue.
- Tentukan dengan jelas status mana yang menghentikan atau menyelesaikan
  perhitungan SLA.

### Acceptance

- Deadline dihitung dari aturan yang terdokumentasi.
- Tiket overdue ditentukan berdasarkan waktu dan status aktual.
- Unit test mencakup batas waktu, perubahan status, dan tiket yang sudah
  selesai.

Mulai dengan SLA sederhana. Kalender hari libur, jam kerja per zona waktu,
notifikasi otomatis, dan scheduler dapat ditunda sampai kebutuhan dasarnya
terbukti.

## Tahap 5 — Workspace dan autentikasi sebelum deployment multi-tim

### Tujuan

Memisahkan data antar tim dan membatasi tindakan berdasarkan identitas serta
role pengguna.

### Fitur

- Workspace menjadi batas kepemilikan tiket, agent, dan activity history.
- User menjadi anggota workspace dengan role awal seperti `ADMIN` dan
  `AGENT`.
- Semua query dan perubahan data dibatasi oleh workspace di backend.
- Swagger mendokumentasikan autentikasi dan dapat digunakan dengan token.

### Acceptance keamanan

- User dari workspace lain tidak dapat membaca atau mengubah tiket.
- Pembatasan workspace diterapkan pada semua endpoint terkait, bukan hanya
  di UI.
- Role yang tidak berhak ditolak.
- E2E test membuktikan isolasi data antar-workspace.

Model workspace/agent perlu dipertimbangkan saat merancang assignment agar
struktur data tidak perlu dirombak ketika autentikasi ditambahkan. Namun,
autentikasi penuh baru menjadi wajib sebelum aplikasi dibuka untuk banyak tim
atau dipublikasikan.

## Urutan kerja yang disarankan

1. **Berikutnya:** status + agent/assignment + activity history.
2. **Setelah alur tiket berjalan:** pencarian/filter/pagination + ringkasan
   antrean.
3. **Setelah triage stabil:** koreksi hasil ML, lalu SLA sederhana.
4. **Sebelum deployment multi-tim:** workspace, autentikasi, role, dan
   pengujian isolasi tenant.
5. **Setelah backend matang:** implementasikan frontend menggunakan API dan
   alur yang sudah diuji.

## Bukan prioritas saat ini

Jangan menambah fitur hanya agar jumlah modul terlihat banyak. Untuk tahap
awal, tunda:

- billing dan subscription plan;
- live chat, email integration, atau notifikasi realtime;
- automasi kompleks dan background job;
- Redis, microservices tambahan, atau infrastruktur yang belum dibutuhkan;
- file attachment dan fitur customer portal.

Tambahkan fitur-fitur tersebut hanya jika alur ticket inbox inti sudah bekerja
dan ada kebutuhan yang jelas.
