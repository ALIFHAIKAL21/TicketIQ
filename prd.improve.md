# PRD Lanjutan — TicketIQ Backend Mini-SaaS

## 1. Tujuan dokumen

Dokumen ini adalah PRD lanjutan untuk mengembangkan backend TicketIQ setelah
fitur dan acceptance PRD saat ini selesai. Dokumen ini berfokus pada logic
aplikasi dan API NestJS yang dapat diuji lewat Swagger. Frontend belum termasuk
scope.

Roadmap ringkas fitur ada di [`improve.md`](improve.md). PRD awal tetap menjadi
acuan untuk menyelesaikan dan memverifikasi MVP saat ini:
[`PRD.md`](PRD.md).

### Gate sebelum memulai

Mulai PRD ini hanya setelah:

- acceptance PRD awal sudah lulus, termasuk demo klasifikasi dan fallback;
- backend build, lint, unit test, dan e2e test lulus;
- endpoint Swagger dan README backend sudah diverifikasi;
- database memiliki migration yang up-to-date.

Jangan menganggap status PRD awal selesai hanya karena implementasi sudah
ditulis; acceptance-nya juga harus dibuktikan.

### Catatan implementasi repository

- Tahap workflow, queue, koreksi kategori, SLA, dan workspace/auth sudah
  diimplementasikan; verifikasi backend dilakukan dengan build, lint, unit, dan
  e2e test.
- E2E memakai mock FastAPI. Demo klasifikasi langsung belum dapat dibuktikan
  pada checkout yang tidak memiliki artefak DistilBERT; jangan menjalankan ulang
  evaluasi test final yang sudah dikunci.
- Login memakai bearer access token 15 menit. Refresh token dan self-registration
  tidak termasuk MVP. Admin awal berasal dari seed environment; admin dapat
  membuat user AGENT untuk workspace-nya.
- User satu workspace; `workspaceId` selalu berasal dari user terautentikasi.
- SLA memakai kalender UTC: High 4 jam, Medium 24 jam, Low 72 jam. Reopen
  mempertahankan `dueAt` lama.

## 2. Visi produk

TicketIQ adalah support inbox untuk tim kecil. ML membantu triage awal, lalu
agent menangani tiket sampai selesai dan tim dapat meninjau riwayatnya.

Alur utama:

1. Tiket dibuat dan ML mengembalikan category serta urgency.
2. Tiket masuk antrean dengan status `NEW`.
3. Agent mengambil tiket, menambahkan catatan internal, dan mengubah status.
4. Tiket diselesaikan; detail dan riwayat aktivitas dapat diperiksa.
5. Tim mencari tiket, memantau antrean, lalu menggunakan koreksi kategori
   sebagai feedback untuk evaluasi ML.

## 3. Prinsip produk dan batasan

- ML membantu proses triage; agent tetap bertanggung jawab atas tindak lanjut.
- `urgency` tetap dihitung oleh rule FastAPI. NestJS menyimpan hasilnya dan
  tidak membuat ulang rule urgency.
- Koreksi manual pada kategori tidak boleh menghapus prediksi kategori awal.
- Activity history adalah audit log yang append-only, bukan event sourcing
  untuk membangun ulang seluruh state aplikasi.
- Controller NestJS tetap tipis; aturan bisnis berada di service.
- Perubahan data tiket dan event audit terkait disimpan secara transaksional.
- Semua filter dan scope akses divalidasi serta diterapkan di backend.
- Jangan menambah dependency atau module kecuali mendukung kebutuhan pada PRD
  ini.
- Tidak ada login, multi-workspace, atau endpoint mutasi yang boleh dianggap
  aman untuk publik sebelum tahap autentikasi dan isolasi workspace lulus.

## 4. Kondisi awal dan tools yang sudah tersedia

Backend saat ini menggunakan NestJS, TypeScript, PostgreSQL, Prisma, Swagger,
DTO validation, Jest, dan Supertest. Dependencies terkait sudah tercantum di
`backend/package.json`; jangan memasangnya ulang.

| Tools/library yang tersedia | Pemakaian dalam PRD lanjutan |
|---|---|
| NestJS modules, controllers, providers | Pemisahan boundary API dan logic aplikasi |
| Prisma Client dan Prisma Migrate | Model data, query, migration, dan transaction |
| PostgreSQL | Relasi, enum, index, agregasi antrean |
| `class-validator` dan `class-transformer` | Validasi DTO dan query parameter |
| `@nestjs/swagger` | Kontrak API dan demo lewat Swagger |
| Jest dan `@nestjs/testing` | Unit test logic dan service |
| Supertest | E2E test HTTP |
| NestJS `Logger` | Log aplikasi; tidak menambah logger package |

### Prinsip dependency

Tahap 1–4 di bawah tidak memerlukan dependency runtime baru. Gunakan Prisma,
PostgreSQL, NestJS, dan library yang sudah tersedia.

Dependency autentikasi baru hanya ditambahkan ketika Tahap 5 dimulai dan
kontrak auth sudah disepakati. Keputusan implementasi tahap ini: gunakan
paket autentikasi first-party NestJS yang kompatibel dengan NestJS 12,
access token bearer singkat tanpa refresh token, serta throttling khusus
endpoint login.

## 5. Tahap 1 — Status, agent, assignment, dan activity history

### Tujuan

Membuat tiket dapat dikerjakan setelah dibuat: statusnya jelas, ada agent yang
bertanggung jawab, dan perubahan penting dapat diaudit.

### Scope

#### Status tiket

- Tambahkan enum status awal:
  - `NEW`
  - `IN_PROGRESS`
  - `RESOLVED`
- Tiket baru dimulai dengan `NEW`.
- Tetapkan transition yang diperbolehkan dan dokumentasikan, termasuk
  kebijakan reopen untuk tiket `RESOLVED`.
- Status bukan category atau urgency; ketiganya memiliki arti berbeda.

#### Agent dan assignment

- Tambahkan model agent dengan minimal ID, nama tampilan, email unik, status
  aktif/nonaktif, dan timestamp.
- Tiket boleh belum memiliki assignee.
- Assignment hanya menerima agent aktif.
- Perubahan assignment dicatat dalam activity history.
- Pengelolaan agent pada tahap ini ditujukan untuk demo lokal/internal.
  Autentikasi dan pembatasan akses publik baru masuk Tahap 5.

#### Catatan dan activity history

- Tambahkan catatan internal yang terkait dengan tiket.
- Activity history mencatat setidaknya:
  - tiket dibuat;
  - assignee ditetapkan atau diubah;
  - status berubah;
  - catatan internal dibuat;
  - koreksi kategori saat fitur itu hadir pada Tahap 3.
- Activity tidak dapat diedit atau dihapus lewat API biasa.
- Untuk perubahan tiket yang menghasilkan event, lakukan update dan insert
  event dalam satu Prisma transaction.
- Actor boleh belum tersedia sebelum auth; desain field actor agar dapat
  dikaitkan ke user saat Tahap 5. Jangan menerima identitas actor seolah
  terverifikasi dari request anonim.

### Contoh API

Path berikut adalah rancangan untuk membantu diskusi; sesuaikan dengan pola
endpoint yang sudah ada sebelum implementasi.

```text
GET    /agents
POST   /agents
PATCH  /agents/:id
PATCH  /tickets/:id/assignee
PATCH  /tickets/:id/status
POST   /tickets/:id/notes
GET    /tickets/:id/activity
```

### Acceptance

- Tiket baru memiliki status `NEW`.
- Status yang tidak dikenal atau transition yang tidak diizinkan ditolak.
- Tiket tidak ditemukan menghasilkan 404 dengan bentuk error global.
- Assignment ke agent aktif berhasil; assignment ke agent tidak ada/nonaktif
  ditolak.
- Detail tiket mengembalikan status dan assignee.
- Activity history berurutan berdasarkan waktu dan menunjukkan perubahan yang
  berhasil.
- Bila penulisan activity gagal, perubahan terkait pada tiket ikut rollback.
- Swagger mencantumkan request DTO, response, enum, dan error yang relevan.
- Unit test menguji transition dan aturan assignment; e2e test menguji alur
  create → assign → note → status → history.

### Demo tahap

```text
POST /tickets
→ GET /tickets
→ PATCH /tickets/:id/assignee
→ POST /tickets/:id/notes
→ PATCH /tickets/:id/status
→ GET /tickets/:id/activity
```

## 6. Tahap 2 — Queue: pencarian, filter, pagination, summary

### Tujuan

Membuat endpoint antrean tetap praktis ketika data bertambah dan menyediakan
angka ringkas yang dihitung dari tiket sungguhan.

### Scope

- Pencarian teks pada `title` dan `description`.
- Filter gabungan berdasarkan status, category, urgency, assignee, dan
  `isFallback`.
- Pagination dengan `page` dan `limit`, nilai default serta batas maksimum
  yang terdokumentasi.
- Response list memiliki `data`, `page`, `limit`, `total`, dan jumlah halaman
  atau metadata pagination setara.
- Urutan tetap eksplisit: High → Medium → Low, kemudian `createdAt` terbaru.
  Tambahkan tie-breaker stabil seperti ID agar halaman tidak berubah-ubah
  ketika timestamp sama.
- Tambahkan endpoint summary untuk hitungan antrean, misalnya jumlah tiket
  per status dan tiket High yang belum selesai.
- Agregasi summary berasal dari PostgreSQL, bukan nilai hardcoded atau
  perhitungan terhadap satu halaman saja.
- Tambahkan index database hanya untuk pola filter yang benar-benar dipakai
  dan dapat dibuktikan lewat query.

### Contoh API

```text
GET /tickets?q=payment&status=NEW&urgency=High&page=1&limit=20
GET /tickets/summary
```

### Acceptance

- Filter dapat digabung dan hasilnya memenuhi semua kriteria.
- Query invalid dan nilai pagination di luar batas menghasilkan 400.
- `limit` maksimum mencegah response tanpa batas.
- Pagination dan sorting stabil ketika ada timestamp yang sama.
- Summary konsisten dengan record database, termasuk filter workspace setelah
  Tahap 5.
- Test mencakup hasil kosong, gabungan filter, boundary page/limit, summary,
  dan sorting.
- Query tetap parameterized; input tidak digabung langsung ke SQL string.

### Dependency tambahan

Tidak ada. Gunakan DTO, Prisma/PostgreSQL, query terparameterisasi, dan test
tools yang sudah ada. Jangan menambah pagination package untuk kebutuhan ini.

## 7. Tahap 3 — Koreksi kategori hasil ML

### Tujuan

Memberi agent cara memperbaiki category tanpa kehilangan hasil prediksi awal,
sehingga kualitas model dapat dievaluasi dari feedback nyata.

### Scope

- Simpan `predictedCategory` sebagai kategori awal dari FastAPI.
- Pertahankan `category` sebagai kategori final yang digunakan antrean.
- Saat tiket dibuat, keduanya berisi hasil prediksi; untuk fallback keduanya
  mengikuti status klasifikasi yang tersedia, dengan `isFallback` tetap
  menandai fallback.
- Sediakan aksi koreksi kategori yang memvalidasi enum dan mewajibkan alasan.
- Catat kategori sebelum/sesudah, alasan, waktu, dan actor ketika identitas
  actor tersedia.
- Jangan melakukan retraining otomatis atau memanggil training pipeline dari
  endpoint request.
- Confidence score hanya boleh didokumentasikan jika model/API benar-benar
  mengirim nilai yang terdefinisi dan tervalidasi. Jangan membuat angka
  perkiraan.

### Contoh API

```text
PATCH /tickets/:id/category
```

Request rancangan:

```json
{
  "category": "REFUND",
  "reason": "The customer is requesting a refund for a duplicate charge."
}
```

### Acceptance

- Koreksi mengubah category final tanpa menghapus predictedCategory.
- Nilai kategori invalid atau reason kosong ditolak.
- Koreksi menghasilkan activity history dalam transaction yang sama.
- Response detail dan summary menggunakan kategori final.
- Laporan/test dapat membedakan prediksi awal dan hasil akhir.
- `urgency` tidak berubah akibat koreksi kategori; urgency tetap berasal dari
  rule FastAPI.

## 8. Tahap 4 — SLA resolusi sederhana

### Tujuan

Menandai tiket yang melewati target penyelesaian tanpa menambahkan sistem
scheduler sebelum benar-benar diperlukan.

### Keputusan wajib sebelum implementasi

Tentukan target waktu untuk tiap urgency dan apakah hitungan memakai waktu
kalender atau jam kerja. Nilai ini adalah kebijakan produk, jadi jangan
mengarang angka di dalam implementasi.

Keputusan produk yang sudah disepakati:

- SLA memakai waktu kalender UTC.
- High: 4 jam; Medium: 24 jam; Low: 72 jam.
- Ketika tiket dibuka ulang dari `RESOLVED` ke `IN_PROGRESS`, `dueAt` lama
  dipertahankan. Reopen tidak memulai SLA baru.
- Perubahan kategori tidak mengubah urgency maupun deadline SLA.

### Scope

- Definisikan target resolusi High, Medium, dan Low dalam satu tempat
  konfigurasi/policy yang tervalidasi.
- Simpan waktu target yang relevan (`dueAt`) dan waktu penyelesaian (`resolvedAt`).
- Tentukan apakah perubahan urgency yang sah (misalnya penghitungan ulang
  rule) memperbarui due date; catat kebijakan tersebut.
- Tiket overdue ditentukan dari `dueAt`, status, dan waktu saat query.
- Tambahkan filter `overdue` atau ringkasan overdue pada queue.
- Untuk tahap ini, gunakan kalender waktu sederhana. Business hours, hari
  libur, notifikasi, scheduler, dan background queue berada di luar scope.

### Acceptance

- Perhitungan deadline mengikuti policy yang disepakati dan memakai waktu
  UTC secara konsisten.
- Tiket yang sudah resolved tidak dihitung sebagai overdue aktif.
- Batas waktu diuji dengan clock/time yang deterministik.
- Perubahan status dan tanggal penyelesaian memperbarui hasil overdue dengan
  benar.
- API mendokumentasikan arti SLA dan filter overdue.

### Dependency tambahan

Tidak ada. Gunakan `Date`/timestamp PostgreSQL dan fungsi domain yang bisa
di-unit-test. Jangan menambah date library atau scheduler hanya untuk SLA
kalender sederhana.

## 9. Tahap 5 — Workspace, autentikasi, role, dan isolasi tenant

### Tujuan

Mempersiapkan API untuk beberapa tim dengan akses yang terautentikasi dan
data yang benar-benar terisolasi.

### Model domain

- Workspace adalah batas kepemilikan data.
- User dapat menjadi anggota workspace dengan role minimal `ADMIN` atau
  `AGENT`.
- Ticket, agent, activity, dan data summary harus dapat dikaitkan ke workspace.
- Tentukan relasi agent dengan user agar assignment dapat menunjukkan anggota
  workspace yang sebenarnya.
- `Agent.userId` adalah relasi opsional satu-ke-satu untuk data lama; anggota
  baru yang dibuat lewat admin memiliki pasangan Agent dalam transaction yang
  sama.
- Jangan mengandalkan `workspaceId` yang dikirim client sebagai bukti akses.
  Ambil konteks workspace dari user yang sudah terautentikasi, lalu validasi
  membership.

### Auth MVP

- Login dengan email dan password.
- Hash password sebelum disimpan.
- Keluarkan access token bearer dengan masa berlaku yang dikonfigurasi.
- Sediakan endpoint minimal `POST /auth/login` dan `GET /auth/me`.
- Tidak ada public self-registration pada MVP; pembuatan awal user/workspace
  melalui proses bootstrap/seed yang aman.
- Tidak menambah refresh-token flow sampai ada kebutuhan produk dan desain
  penyimpanan/revocation yang jelas.
- Swagger mendukung bearer token untuk mencoba endpoint terlindungi.

### Dependency tambahan yang dipakai

Tambahkan hanya saat Tahap 5 dimulai dan periksa peer dependency terhadap
versi NestJS proyek:

| Package | Jenis | Kegunaan |
|---|---|---|
| `@nestjs/authentication` `^0.1.6` | runtime | Scrypt `PasswordHasher`, issuer dan verifier bearer JWT, `@Public()`, dan `@CurrentUser()`; first-party NestJS |
| `@nestjs/throttler` `^6.8.0` | runtime | Membatasi percobaan login (5 request/menit per IP pada MVP ini) |

`@nestjs/authentication` menyediakan scrypt dengan parameter default OWASP
(`N=2^17`, `r=8`, `p=1`) dan JWT pendek. Access token berlaku 15 menit; refresh
token sengaja dimatikan agar tidak ada token jangka panjang yang memerlukan
storage/revocation tambahan. Karena itu client perlu login kembali setelah
token kedaluwarsa. Role `ADMIN`/`AGENT` dibatasi dengan decorator dan guard
NestJS yang tipis; belum diperlukan policy engine terpisah.

Rate limiter saat ini menggunakan storage in-memory, sesuai demo satu instance.
Deployment multi-instance perlu shared throttler storage agar limit berlaku
konsisten di semua instance; Redis tetap tidak ditambahkan hanya untuk MVP.

### Security requirements

- Password tidak pernah disimpan atau dicatat dalam log dalam bentuk teks.
- Secret JWT wajib berasal dari environment/secret store, tidak boleh
  di-hardcode; aplikasi harus gagal startup bila konfigurasi wajib tidak ada.
- Token diverifikasi melalui guard; identitas/role tidak dipercaya dari body
  request.
- Admin dan agent hanya dapat melakukan aksi sesuai role.
- Semua akses ticket, agent, activity, dan summary dibatasi ke workspace
  anggota yang sedang login.
- Periksa kepemilikan workspace pada detail, list, update, correction, notes,
  assignment, dan summary.
- Login diberi rate limit; error login tidak membocorkan apakah email
  terdaftar.
- Endpoint Swagger tidak menjadi jalan pintas melewati guard.

### Acceptance keamanan

- Login sukses mengembalikan token; password salah menghasilkan error aman.
- Endpoint terlindungi menolak request tanpa token/ber-token invalid.
- Role tidak berhak mendapat 403.
- User workspace A tidak dapat membaca atau mengubah resource workspace B,
  termasuk melalui ID yang diketahui langsung.
- User nonaktif tidak dapat memakai access token sebelumnya; role dibaca ulang
  dari database pada setiap request, bukan dipercaya dari claim JWT.
- E2E test membuktikan isolasi tenant pada list, detail, update, activity, dan
  summary.
- Admin dapat membuat anggota AGENT dalam workspace yang sama; password tidak
  pernah disimpan atau dikembalikan dalam bentuk plaintext.
- Hash password dapat diverifikasi tetapi tidak dapat dipakai untuk
  memperoleh password asli.
- Login rate limit teruji dan memiliki batas yang terdokumentasi.

## 10. Dependency yang tidak ditambahkan dalam PRD ini

Untuk menjaga stack minimal, jangan menambahkan kecuali ada kebutuhan baru
yang dibuktikan:

- ORM kedua atau query builder lain selain Prisma;
- `nestjs-paginate` untuk pagination sederhana;
- event sourcing/CQRS untuk activity history biasa;
- BullMQ, Redis, atau scheduler untuk SLA yang hanya dihitung saat query;
- microservice tambahan untuk modul yang masih satu aplikasi;
- logger package tambahan; gunakan NestJS `Logger`;
- email/SMS provider, billing, live chat, atau frontend package.

## 11. Struktur module NestJS yang disarankan

Pertahankan satu backend modular, bukan satu module untuk setiap tabel:

- `TicketsModule`: ticket workflow, assignment, category correction, dan
  operasi domain tiket.
- `AgentsModule`: daftar agent yang dapat menerima assignment.
- `ActivityModule` boleh dipisah bila kebutuhan audit/note berkembang; pada
  awal dapat menjadi bagian domain Tickets.
- `AnalyticsModule` untuk queue summary setelah query dan batas datanya jelas.
- `SlaModule` tidak wajib untuk SLA kalender sederhana; ekstrak hanya bila
  policy berkembang.
- `AuthModule` dan `WorkspacesModule` ditambahkan pada Tahap 5.

Controller menangani transport HTTP dan delegasi. Service menjalankan aturan
bisnis. Prisma access tetap melalui `PrismaService`.

## 12. Migration, backward compatibility, dan data

- Setiap perubahan schema dibuat sebagai Prisma migration yang dapat
  ditinjau.
- Migration yang menambah status harus memberi nilai awal yang konsisten pada
  tiket lama, misalnya `NEW`.
- Jangan menghapus atau menafsirkan ulang nilai category/urgency yang sudah
  tersimpan.
- Sebelum perubahan yang mengubah data, definisikan migration/backfill dan
  cara verifikasinya.
- Periksa migration pada database lokal/test sebelum merge.
- Jangan memakai database produksi untuk test e2e.

## 13. Testing dan quality gate

Gunakan tool yang telah tersedia:

- Jest untuk unit test aturan transition, SLA, auth policy, dan mapping.
- `@nestjs/testing` untuk provider/module tests dengan dependency mock.
- Supertest untuk e2e HTTP dan authorization.
- PostgreSQL test database untuk menguji query, sorting, transaction, dan
  isolasi workspace secara nyata.
- Swagger sebagai kontrak API yang diperbarui setiap endpoint/DTO berubah.
- Prisma migration untuk perubahan schema.

Setiap tahap harus menjalankan sekurang-kurangnya:

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Tambahkan test yang membuktikan perilaku yang diminta, bukan hanya keberadaan
field atau konstanta.

## 14. Definition of Done

PRD lanjutan dianggap selesai jika:

- Tahap 1–5 yang disepakati sudah diimplementasikan berurutan dan acceptance
  masing-masing lulus.
- Alur tiket lengkap dapat didemokan lewat Swagger tanpa frontend.
- Fallback ML dan semantik urgency dari PRD awal tetap benar.
- Activity history konsisten dan tidak dapat diubah lewat API biasa.
- Search/filter/pagination/summary diuji dengan PostgreSQL.
- Koreksi category mempertahankan prediction awal.
- SLA mengikuti policy yang telah diputuskan dan diuji pada batas waktu.
- Sebelum multi-workspace dipublikasikan, auth, role, dan isolasi tenant
  terbukti lewat e2e tests.
- Build, lint, unit, e2e, migration, Swagger, dan README sesuai hasil akhir.
- Tidak ada secret, kredensial, atau data sensitif dalam repository/log.

## 15. Urutan implementasi

1. Pastikan acceptance PRD awal selesai.
2. Implementasikan status + agent/assignment + activity history.
3. Implementasikan queue search/filter/pagination + summary.
4. Implementasikan koreksi kategori dan jejak feedback ML.
5. Sepakati policy SLA, lalu implementasikan SLA kalender sederhana.
6. Tambahkan workspace/auth/role dan buktikan isolasi tenant sebelum
   deployment multi-tim.
7. Setelah backend matang, gunakan kontrak API ini untuk membangun frontend.
