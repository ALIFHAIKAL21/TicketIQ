# Modul Belajar Backend NestJS TicketIQ

Modul ini merangkum implementasi backend TicketIQ dari sorting/filtering
sampai workflow, SLA, autentikasi, dan isolasi workspace. Targetnya bukan
menghafal file, tetapi bisa menjelaskan alur request dan menulis ulang bagian
penting dengan tangan.

## Hasil belajar

Setelah belajar, kamu seharusnya bisa:

1. Menelusuri request dari HTTP sampai database dan kembali menjadi response.
2. Menjelaskan validasi DTO, query terparameterisasi, transaksi, dan error
   handling di NestJS.
3. Menjelaskan perbedaan category, urgency, status, dan SLA.
4. Menjelaskan bagaimana JWT, role, dan workspace membatasi akses.
5. Menulis ulang fitur kecil dan membuat test yang membuktikan perilakunya.

## Cara belajar cepat

Belajar dalam empat sesi. Buka file yang ditautkan saat membaca bagian itu,
kemudian tutup file dan jawab pertanyaan ringkas di akhir sesi.

| Sesi | Materi | Tujuan |
|---|---|---|
| 1 — 25 menit | Tahap 5: sorting, filter, pagination | Memahami query tiket |
| 2 — 25 menit | Tahap 6–8: errors, health, Swagger, tests | Memahami kualitas API |
| 3 — 35 menit | Workflow, activity, koreksi kategori, SLA | Memahami aturan bisnis |
| 4 — 35 menit | Auth, role, workspace, migration | Memahami keamanan dan data isolation |

Setelah setiap sesi, lakukan satu latihan tulis ulang tanpa menyalin kode.

## Peta request: satu model mental

Untuk endpoint HTTP yang terlindungi, alurnya seperti ini:

```text
HTTP request
  -> global AuthenticationGuard memeriksa bearer token
  -> JwtAuthProvider memvalidasi JWT dan memuat user terbaru dari database
  -> RolesGuard memeriksa role jika route membutuhkannya
  -> ValidationPipe memeriksa DTO/query
  -> Controller mengambil user dari @CurrentUser dan memanggil service
  -> Service menjalankan aturan bisnis serta query/transaction Prisma
  -> Exception filter membentuk response error
```

Komponen dan tanggung jawab:

- **Module** menyatukan controller dan provider yang saling membutuhkan.
- **Controller** adalah adapter HTTP: mengambil parameter, memanggil service,
  dan menentukan dokumentasi endpoint.
- **Service** menjalankan use case dan aturan domain.
- **DTO** adalah kontrak input/output HTTP, bukan model database.
- **PrismaService** adalah pintu akses database yang di-inject.
- **Guard** memutuskan boleh atau tidaknya request masuk.
- **Filter** mengubah exception menjadi bentuk response yang konsisten.

File utama: [app.module.ts](backend/src/app.module.ts),
[main.ts](backend/src/main.ts),
[ticket.controller.ts](backend/src/tickets/ticket.controller.ts), dan
[ticket.service.ts](backend/src/tickets/ticket.service.ts).

## Tahap 5 — Sorting, filter, dan pagination

### Sorting urgency

Urutan bisnis tidak boleh bergantung pada alfabet. SQL memakai mapping angka
yang eksplisit:

```sql
CASE urgency
  WHEN 'High' THEN 3
  WHEN 'Medium' THEN 2
  WHEN 'Low' THEN 1
END DESC
```

Setelah urgency, tiket diurutkan `createdAt DESC` lalu `id ASC`. Kolom `id`
adalah **tie-breaker**: jika dua tiket memiliki waktu yang sama, hasilnya
tetap deterministik. Tanpa tie-breaker, item dapat berpindah halaman di antara
request.

Implementasi berada di `findAll()` pada
[ticket.service.ts](backend/src/tickets/ticket.service.ts).

### Filter dan validasi

`FindTicketsQueryDto` mengubah teks query string menjadi tipe yang diharapkan,
memvalidasi enum serta batas pagination, lalu `buildWhereClause()` menyusun
filter menggunakan `Prisma.sql`.

Prinsip penting:

- Input client tetap menjadi parameter SQL, bukan ditempel ke string query.
- Filter workspace selalu ditambahkan dari user terautentikasi.
- Filter dapat digabung; semua kondisi disatukan dengan `AND`.
- `page` dan `limit` dihitung menjadi `OFFSET` dan `LIMIT`.
- Count dan data halaman memakai transaksi `RepeatableRead`, sehingga keduanya
  melihat snapshot database yang sama.

Lihat [find-tickets-query.dto.ts](backend/src/tickets/dto/find-tickets-query.dto.ts)
dan method `buildWhereClause()` di
[ticket.service.ts](backend/src/tickets/ticket.service.ts).

**Latihan:** tambahkan filter opsional `status`, validasi nilainya di DTO,
tambahkan parameter secara aman ke where clause, lalu tulis e2e test untuk
gabungan `status` + `urgency`.

## Tahap 6 — Error handling dan health

### Global exception filter

Exception filter mengubah error HTTP menjadi format umum:

```json
{
  "statusCode": 404,
  "message": "Pesan yang aman untuk client",
  "error": "Not Found"
}
```

Validation error menjadi 400, record tidak ada menjadi 404, dan error tidak
terduga menjadi 500 dengan pesan aman. Detail internal tidak dikirim ke client;
log server tetap dapat dipakai untuk investigasi.

Implementasi: [filter-exception.filter.ts](backend/src/common/filters/filter-exception.filter.ts).

### Health bukan readiness penuh

`GET /health` memeriksa apakah proses NestJS hidup serta mencoba probe ringan
ke FastAPI dengan timeout. NestJS menjawab HTTP 200 dengan
`mlService: "unreachable"` jika FastAPI mati. Ini sengaja membedakan:

- **Liveness:** API NestJS masih berjalan.
- **Dependency status:** FastAPI sedang dapat dijangkau atau tidak.

Endpoint ini public agar dapat dipakai monitor tanpa login. Tiket tetap dapat
dibuat saat ML mati karena fallback menjadi `UNCLASSIFIED`, `Medium`, dan
`isFallback: true`.

Implementasi: [health.controller.ts](backend/src/health/health.controller.ts)
dan [ml.client.service.ts](backend/src/ml-client/ml.client.service.ts).

**Latihan:** jelaskan mengapa health tetap 200 saat ML unreachable. Lalu
tambahkan test untuk timeout probe tanpa membuat request nyata ke FastAPI.

## Tahap 7 — Dokumentasi API dengan Swagger

Swagger dibuat dari metadata aplikasi di
[main.ts](backend/src/main.ts), lalu tersedia di `/api-docs`.

- `@ApiTags()` mengelompokkan endpoint.
- `@ApiOperation()` memberi ringkasan.
- `@ApiBody()` dan `@ApiQuery()` menjelaskan bentuk request.
- `@ApiCreatedResponse()`, `@ApiOkResponse()`, dan error decorators
  menjelaskan response.
- `@ApiProperty()` pada DTO membuat schema, contoh, enum, dan constraint.
- `.addBearerAuth()` dan `@ApiBearerAuth()` menjelaskan autentikasi.

Swagger mendokumentasikan kontrak; validasi sesungguhnya tetap dikerjakan
ValidationPipe dan guard saat request dijalankan.

**Latihan:** tambahkan contoh response 404 pada endpoint detail dan verifikasi
bahwa response tercantum di Swagger. Coba request tanpa token dan dengan token
melalui tombol **Authorize**.

## Tahap 8 — Testing

### Tiga jenis bukti

1. **Unit test domain:** aturan murni tanpa HTTP/database, misalnya
   `sla-policy.spec.ts` dan `ticket-status.spec.ts`.
2. **Unit test service/client:** dependency dimock; membuktikan branching atau
   bentuk query tanpa memanggil layanan luar.
3. **E2E test:** request HTTP nyata ke NestJS dan PostgreSQL test lokal.
   ML dimock agar test stabil dan tidak tergantung model/GPU/FastAPI.

Contoh test sorting memeriksa mapping High=3, Medium=2, Low=1. E2E memeriksa
alur tiket, validasi, workflow, auth, role, tenant isolation, dan fallback.

Perintah dari folder `backend`:

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Test yang baik gagal ketika perilaku produk salah, bukan hanya ketika nama
field atau konstanta diubah.

## Improvement — Workflow dan audit history

### Status bukan category atau urgency

- **Category:** jenis masalah, misalnya `PAYMENT` atau `REFUND`.
- **Urgency:** prioritas triage dari rule FastAPI: High, Medium, Low.
- **Status:** tahap pekerjaan tim: `NEW`, `IN_PROGRESS`, `RESOLVED`.
- **SLA:** target waktu resolusi yang dihitung dari urgency.

Transisi status ada di
[ticket-status.ts](backend/src/tickets/domain/ticket-status.ts). API menolak
transisi yang dilarang, misalnya `NEW -> RESOLVED`. Reopen yang disepakati
adalah `RESOLVED -> IN_PROGRESS`.

### Activity history sebagai audit log

Assignment, status, catatan internal, koreksi category, dan pembuatan tiket
mencatat event. Perubahan data dan event ditulis dalam Prisma transaction:

```text
BEGIN
  update ticket
  insert ticket activity
COMMIT
```

Jika salah satu gagal, seluruh transaction rollback. Activity bersifat
append-only lewat API biasa; sequence dipakai sebagai tie-breaker saat dua
event memiliki timestamp sama. Actor diambil dari identitas JWT, bukan dari
field request buatan client.

Lihat `createActivity()` dan method mutasi dalam
[ticket.service.ts](backend/src/tickets/ticket.service.ts).

### Persaingan request

Status, assignment, dan category correction menggunakan conditional update
(`updateMany` dengan nilai lama pada kondisi `where`). Jika request lain lebih
dahulu mengubah state, jumlah baris yang ter-update bukan satu dan API
mengembalikan konflik. Ini bentuk optimistic concurrency control sederhana.

## Improvement — Koreksi kategori dan SLA

### Koreksi hasil ML

`predictedCategory` menyimpan prediksi awal dan tidak diubah. `category`
menyimpan pilihan final antrean. Koreksi memerlukan alasan dan membuat activity.
Urgency tidak berubah saat category dikoreksi karena urgency tetap milik rule
FastAPI.

### Policy SLA yang diterapkan

Policy domain di [sla-policy.ts](backend/src/tickets/domain/sla-policy.ts):

| Urgency | Deadline kalender |
|---|---:|
| High | 4 jam |
| Medium | 24 jam |
| Low | 72 jam |

Deadline disimpan di `dueAt` dengan waktu UTC. Overdue ditentukan saat query
dan status `RESOLVED` tidak dihitung sebagai overdue aktif. Saat tiket dibuka
ulang, `resolvedAt` dibersihkan tetapi `dueAt` lama dipertahankan: reopen tidak
memulai SLA baru. Kebijakan ini perlu dipahami sebelum mengubah status handler.

Filter `overdue=true` dan hitungan summary memakai kondisi database yang sama.
Tidak ada scheduler: overdue adalah hasil perbandingan waktu ketika API
dipanggil.

## Improvement — Auth, role, dan workspace

### Alur login

1. `POST /auth/login` menerima email/password dan dibatasi rate limit.
2. `PasswordHasher` memverifikasi hash scrypt; email salah dan password salah
   mendapat pesan yang sama.
3. `TokenService` menerbitkan JWT bearer 15 menit. Refresh token dimatikan.
4. `JwtAuthProvider` memvalidasi signature, issuer, audience, dan expiry.
5. Provider memuat user aktif dari database pada setiap request. Role dan
   workspace bukan fakta yang dipercaya dari request client.
6. `@CurrentUser()` menyediakan user ke controller.

Komponen utama: [auth.module.ts](backend/src/auth/auth.module.ts),
[auth.service.ts](backend/src/auth/auth.service.ts),
[jwt-auth.provider.ts](backend/src/auth/jwt-auth.provider.ts), dan
[auth.controller.ts](backend/src/auth/auth.controller.ts).

`JWT_SECRET` wajib ada dan minimal 32 byte; startup gagal jika tidak valid.
Password dan token tidak dicatat atau dikembalikan selain access token login.
Bootstrap admin dibuat lewat seed, public self-registration tidak tersedia.
Admin membuat user AGENT dengan `POST /auth/members`; user dan Agent terhubung
dalam satu transaksi.

`@nestjs/throttler` membatasi login menjadi 5 request per 60 detik secara
default; nilainya bisa diatur dengan `AUTH_LOGIN_LIMIT` dan
`AUTH_LOGIN_TTL_MS`. Storage rate limit in-memory cocok untuk satu process,
bukan deployment multi-instance.

### Role

Role minimal:

- `ADMIN`: mengelola akun member dan direktori agent.
- `AGENT`: menangani tiket dan membaca antrean workspace.

`@Roles()` menetapkan policy endpoint dan `RolesGuard` memeriksa role dari
user yang sudah diverifikasi. Role tidak diambil dari body atau query.

### Isolasi workspace

`workspaceId` berasal dari `@CurrentUser()`. Controller meneruskannya ke
service; semua query dan mutasi menambahkan kondisi workspace. Client tidak
bisa memilih workspace dengan mengirim `workspaceId`.

Migration:

1. Membuat workspace demo dengan ID tetap untuk bootstrap.
2. Mengisi workspace pada tiket, agent, note, dan activity lama.
3. Mengubah `workspaceId` menjadi NOT NULL.
4. Menambahkan relasi opsional satu-ke-satu `Agent.userId` ↔ `User`.

Resource dari workspace lain sengaja menjawab 404. Pesan ini tidak
mengonfirmasi bahwa ID resource tenant lain benar-benar ada.

**Latihan:** tambahkan endpoint ringkas baru. Sebelum menulis query, jawab:
“Dari mana workspaceId berasal?” Setelah selesai, tambahkan e2e yang
menggunakan dua workspace dan membuktikan data tidak bocor.

## Urutan tulis ulang yang disarankan

1. Tulis ulang DTO query dan satu filter enum.
2. Tulis ulang query sorting numerik dengan tie-breaker.
3. Tulis ulang test unit yang membuktikan urutan High/Medium/Low.
4. Tulis ulang global exception filter dan satu test 404.
5. Tambahkan `@ApiBearerAuth()` dan response docs pada satu endpoint.
6. Tulis ulang policy status dan test transisi valid/tidak valid.
7. Tulis ulang satu mutasi dengan transaction + activity.
8. Tulis ulang auth flow login dan test token invalid/expired.
9. Tulis ulang tenant isolation pada list, detail, dan mutasi.

Jalankan build, lint, unit, dan e2e setelah tiap 2–3 langkah. Jangan mengubah
beberapa layer sekaligus jika belum memahami error yang muncul.

## Pertanyaan cek pemahaman

1. Kenapa sorting urgency perlu `CASE`, dan kenapa `id` menjadi tie-breaker?
2. Apa perbedaan validasi DTO dan pengecekan aturan bisnis?
3. Kenapa count dan data pagination memakai satu snapshot database?
4. Kenapa ticket dan activity harus ditulis dalam transaction?
5. Apa beda category, urgency, status, dan dueAt?
6. Kenapa actor/workspace berasal dari JWT yang diverifikasi, bukan body?
7. Kenapa role dimuat ulang dari database setiap request?
8. Bagaimana e2e membuktikan user workspace B tidak bisa membaca tiket A?
9. Mengapa health dapat HTTP 200 walau FastAPI unreachable?
10. Mengapa tidak perlu retraining model ketika category dikoreksi?

Jika bisa menjawab pertanyaan-pertanyaan ini dengan menunjuk file dan test
yang membuktikannya, kamu sudah memahami alur utama backend—bukan sekadar
mengenali syntax.
