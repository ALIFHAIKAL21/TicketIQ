# TicketIQ Backend

NestJS REST API untuk support inbox TicketIQ. FastAPI mengklasifikasikan
kategori dan urgency; NestJS menyimpan tiket, mengelola workflow, dan membatasi
data ke workspace milik user yang sedang login.

## Stack

- NestJS 12, TypeScript, PostgreSQL, Prisma 6
- FastAPI ML client dengan timeout 5 detik dan fallback
- `@nestjs/authentication` untuk scrypt password hashing, bearer JWT, dan
  identitas request
- `@nestjs/throttler` untuk rate limit login
- Swagger, Jest, dan Supertest

Model DistilBERT tidak disimpan dalam Git. Ikuti setup dan instruksi dataset di
[`ml-service/README.md`](../ml-service/README.md) sebelum mencoba klasifikasi
ML live. Jangan menjalankan ulang evaluator test final yang sudah dikunci.

## Siapkan environment

Jalankan dari folder `backend`:

```powershell
Copy-Item .env.example .env
```

Isi konfigurasi PostgreSQL untuk `DATABASE_URL` dan `SHADOW_DATABASE_URL`.
Buat secret access token acak minimal 32 byte; contoh menggunakan Node:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Masukkan hasilnya ke `JWT_SECRET` di `.env`, pastikan
`BOOTSTRAP_ADMIN_EMAIL` terisi (contoh `admin@example.com`), lalu tetapkan
password admin bootstrap yang kuat (12–128 karakter). Script seed membaca
konfigurasi dari `.env`. Jangan commit `.env` atau menempelkan secret ke
dokumentasi.

| Variabel | Kegunaan |
|---|---|
| `DATABASE_URL` | Koneksi aplikasi ke PostgreSQL |
| `SHADOW_DATABASE_URL` | Database shadow untuk Prisma |
| `ML_SERVICE_URL` | Base URL FastAPI, contoh `http://127.0.0.1:8000` |
| `JWT_SECRET` | Secret HS256 minimal 32 byte; aplikasi gagal startup jika kosong/terlalu pendek |
| `BOOTSTRAP_ADMIN_EMAIL` | Email admin workspace demo |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password bootstrap admin, minimal 12 karakter |
| `AUTH_LOGIN_LIMIT` | Percobaan login per window, default `5` |
| `AUTH_LOGIN_TTL_MS` | Durasi window rate limit dalam milidetik, default `60000` |

`JWT_SECRET` dan kredensial bootstrap bersifat rahasia. Rate limiter memakai
storage in-memory untuk demo satu instance; deployment dengan banyak instance
memerlukan shared storage agar batas login konsisten.

## Instalasi, migrasi, dan akun admin

```powershell
npm install
npx prisma migrate deploy
npm run db:seed
```

Migration melakukan backfill data lama ke workspace demo sebelum membuat
`workspaceId` wajib. Seed membuat workspace dan admin awal secara idempotent.
Seed tidak mengganti password akun yang sudah ada; untuk mengganti password,
gunakan prosedur administrasi yang aman, bukan menjalankan seed berulang.

## Jalankan service

Jalankan FastAPI lebih dahulu di terminal pertama dari root repo:

```powershell
.\.venv\Scripts\Activate.ps1
Set-Location .\ml-service
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Di terminal kedua:

```powershell
Set-Location .\backend
npm run start:dev
```

NestJS berjalan di `http://localhost:3000`. Swagger UI ada di
[`http://localhost:3000/api-docs`](http://localhost:3000/api-docs);
`GET /health` tetap public dan menunjukkan apakah FastAPI dapat dijangkau.
Endpoint lain memerlukan access token bearer. Gunakan
`BOOTSTRAP_ADMIN_EMAIL` dan `BOOTSTRAP_ADMIN_PASSWORD` untuk login, lalu klik
**Authorize** di Swagger dan masukkan token.

Dashboard visual minimal tersedia di [`http://localhost:3000`](http://localhost:3000).
Dashboard ini disajikan langsung oleh NestJS dari `public/` dan memakai
JavaScript browser biasa untuk memanggil API yang sama; tidak ada framework
frontend atau proses build frontend tambahan.

### Login dan autentikasi API

```powershell
$loginBody = @{
  email = "admin@example.com"
  password = "GANTI_DENGAN_PASSWORD_BOOTSTRAP"
} | ConvertTo-Json

$login = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/auth/login `
  -ContentType "application/json" `
  -Body $loginBody

$headers = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri http://localhost:3000/auth/me -Headers $headers
```

Access token berlaku 15 menit. Refresh token sengaja tidak digunakan pada MVP;
setelah access token kedaluwarsa, client login kembali. Password di-hash
dengan scrypt dan tidak pernah dikembalikan oleh API. Login menerima maksimal
5 request per 60 detik secara default.

Admin dapat membuat akun `AGENT` melalui `POST /auth/members`. User dan record
Agent terkait dibuat dalam satu transaksi, pada workspace admin yang sedang
login. Public self-registration tidak tersedia.

## Endpoint

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/health` | Public | Status NestJS dan konektivitas FastAPI |
| `POST` | `/auth/login` | Public + rate limit | Login dan terbitkan JWT |
| `GET` | `/auth/me` | Bearer | Profil user/workspace aktif |
| `POST` | `/auth/members` | Admin | Membuat user AGENT dan record agent |
| `GET` | `/agents` | Bearer | Daftar agent dalam workspace |
| `POST` | `/agents` | Admin | Membuat agent direktori dalam workspace |
| `GET`, `PATCH` | `/agents/:id` | Bearer/Admin untuk update | Baca/update agent dalam workspace |
| `POST` | `/tickets` | Bearer | Klasifikasi ML, hitung deadline, simpan tiket |
| `GET` | `/tickets` | Bearer | Pencarian, filter, pagination, sorting |
| `GET` | `/tickets/summary` | Bearer | Ringkasan antrean workspace |
| `GET` | `/tickets/:id` | Bearer | Detail tiket |
| `PATCH` | `/tickets/:id/assignee` | Bearer | Assign/unassign agent satu workspace |
| `PATCH` | `/tickets/:id/status` | Bearer | Ubah status dan catat activity |
| `POST` | `/tickets/:id/notes` | Bearer | Tambahkan catatan internal |
| `PATCH` | `/tickets/:id/category` | Bearer | Koreksi category tanpa menimpa prediksi |
| `GET` | `/tickets/:id/activity` | Bearer | Baca riwayat activity append-only |

Contoh query antrean:

```text
GET /tickets?q=payment&status=NEW&category=PAYMENT&urgency=High&overdue=true&page=1&limit=20
```

Urgency diurutkan eksplisit High → Medium → Low, kemudian waktu terbaru dan ID
sebagai tie-breaker. SLA kalender UTC: High 4 jam, Medium 24 jam, Low 72 jam.
Tiket `RESOLVED` bukan overdue aktif; saat reopen, deadline lama dipertahankan.

## Submit tiket

Contoh PowerShell setelah login:

```powershell
$body = @{
  title = "Payment issue"
  description = "I need help with a payment that is still pending."
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/tickets `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

FastAPI tetap menjadi satu-satunya sumber category dan urgency. Jika tidak
terjangkau atau timeout, tiket tetap tersimpan dengan `category =
"UNCLASSIFIED"`, `urgency = "Medium"`, dan `isFallback = true`.

## Isolasi dan akses

Workspace diambil dari user yang terautentikasi, tidak dari body atau query
client. List, summary, detail, workflow, correction, activity, assignment,
dan agent queries selalu dibatasi pada workspace tersebut. ID resource dari
workspace lain menghasilkan `404`. Role dibaca ulang dari database untuk
setiap request; user nonaktif tidak dapat memakai token sebelumnya.

## Validasi

Pastikan PostgreSQL tersedia dan `.env` memiliki `DATABASE_URL` serta
`JWT_SECRET`. Jalankan dari folder `backend`:

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Unit test memakai mock untuk HTTP ML client dan aturan domain. E2E memakai
PostgreSQL lokal, token test, dan mock ML client sehingga tidak perlu
menjalankan FastAPI. E2E menghapus record yang dibuatnya.

## Batasan MVP

- Access token hanya berlaku 15 menit; belum ada refresh-token flow atau
  self-registration.
- Rate limit in-memory hanya konsisten pada satu process.
- Business-hours SLA, scheduler/notifikasi, billing, dan frontend belum
  termasuk; lihat [`prd.improve.md`](../prd.improve.md).
