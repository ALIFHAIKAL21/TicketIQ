PRD — TicketIQ Backend (NestJS) MVP Showcase
Lanjutan dari roadmap 5 hari TicketIQ — fokus backend NestJS hingga siap showcase. Next.js menyusul terpisah.
1. Konteks
ML service sudah selesai dan berjalan (Hari 1 roadmap, done):
• FastAPI POST /classify aktif di ml-service/api/main.py
• Model DistilBERT, test accuracy 0.9969, macro-F1 0.9973
• Urgency dihitung rule-based di ml-service/urgency_rules.py, terverifikasi cocok di seluruh dataset
• Kontrak API ML: input {"ticket_text": string} → output {"category": string, "urgency": "Low"|"Medium"|"High"}
PRD ini mencakup backend NestJS saja, dari nol sampai siap didemokan (showcase-ready). Next.js, Redis, Docker/CI-CD, auth lengkap, dan pgvector sengaja di luar scope PRD ini (sudah diputuskan sebagai next steps di tahap sebelumnya).
2. Tujuan
Backend NestJS yang bisa:
1.  Menerima tiket baru, meneruskan ke FastAPI untuk diklasifikasi, menyimpan hasilnya
2.  Menampilkan daftar tiket terurut berdasarkan urgency
3.  Tetap berjalan dengan aman meski FastAPI down (graceful degradation)
4.  Punya dokumentasi API yang jelas sehingga mudah di-demo tanpa perlu Next.js dulu
3. Arsitektur Ringkas
Client (Postman / curl, Next.js menyusul)
      |
      v
NestJS API
  |-- TicketsModule (controller, service, DTO)
  |-- PrismaService (akses PostgreSQL)
  |-- MlClientService (HTTP client ke FastAPI, timeout + fallback)
      |
      v
FastAPI /classify  (sudah selesai, tidak diubah)
      |
      v
PostgreSQL (tabel tickets)
4. Functional Requirements
ID
Requirement
Prioritas
FR1
POST /tickets — submit tiket baru (title, description), otomatis terklasifikasi
Wajib
FR2
GET /tickets — list semua tiket, terurut urgency (High → Medium → Low), lalu terbaru dulu
Wajib
FR3
GET /tickets/:id — detail satu tiket
Wajib
FR4
GET /health — health check sederhana (status NestJS + bisa cek konektivitas ke FastAPI)
Wajib
FR5
Filter GET /tickets?category=&urgency= (query param opsional)
Nice-to-have
FR6
Dokumentasi API otomatis (Swagger/OpenAPI)
Wajib untuk showcase
5. Non-Functional Requirements
Area
Ketentuan
Timeout ke FastAPI
5 detik, lalu fallback
Fallback saat FastAPI gagal/timeout
category = "UNCLASSIFIED", urgency = "Medium" — tiket tetap tersimpan, tidak gagal total
Konfigurasi
ML_SERVICE_URL, DATABASE_URL lewat environment variable (.env), tidak hardcode
Validasi input
title wajib (min 3 karakter), description wajib (min 10 karakter), pakai class-validator
Format error
Konsisten: { "statusCode": number, "message": string, "error": string } di semua endpoint
Sorting urgency
Mapping numerik eksplisit: High=3, Medium=2, Low=1 — bukan alfabetis
Auth
MVP: tanpa auth dulu (catat di README sebagai next step), atau API key sederhana jika ingin ada sedikit proteksi
6. Data Model (Prisma Schema)
model Ticket {
  id          String   @id @default(uuid())
  title       String
  description String
  category    String   // hasil dari FastAPI, atau "UNCLASSIFIED" jika fallback
  urgency     String   // "Low" | "Medium" | "High"
  isFallback  Boolean  @default(false) // true jika FastAPI gagal saat tiket ini dibuat
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
Field isFallback sengaja ditambahkan — berguna untuk menandai tiket mana yang perlu diklasifikasi ulang manual nanti, dan jadi bukti nyata bahwa graceful degradation benar-benar diimplementasikan (bisa ditunjukkan saat demo).
7. Kontrak API Detail
POST /tickets
Request:
{ "title": "Pembayaran saya hilang", "description": "Saya sudah bayar tapi status masih pending sejak kemarin" }
Response (201):
{
  "id": "uuid",
  "title": "Pembayaran saya hilang",
  "description": "...",
  "category": "PAYMENT",
  "urgency": "High",
  "isFallback": false,
  "createdAt": "2026-11-14T..."
}
GET /tickets
Response (200): array tiket, terurut urgency (High→Medium→Low) lalu createdAt (terbaru dulu). Query opsional: ?category=PAYMENT&urgency=High.
GET /tickets/:id
Response (200): satu objek tiket. 404 jika tidak ditemukan.
GET /health
Response (200):
{ "status": "ok", "mlService": "reachable" | "unreachable" }
8. Tahapan Development (Agent Mengerjakan Berurutan)
Setiap tahap punya target jelas. Agent menyelesaikan satu tahap penuh (termasuk acceptance criteria-nya) sebelum lanjut ke tahap berikutnya.
Tahap 1 — Project Setup
[ ] Init project NestJS baru di `backend/`, terpisah dari `ml-service/`
[ ] Install dependency inti: @nestjs/config, @nestjs/axios, class-validator, class-transformer, @prisma/client, prisma
[ ] Setup .env dan .env.example berisi DATABASE_URL, ML_SERVICE_URL
[ ] Setup ConfigModule global agar env var bisa diakses di seluruh app
Acceptance: npm run start:dev jalan tanpa error, endpoint default NestJS (GET /) bisa diakses.
Tahap 2 — Database Schema
[ ] Tulis Prisma schema sesuai bagian 6 di atas
[ ] Jalankan migration pertama (prisma migrate dev)
[ ] Buat PrismaModule + PrismaService yang bisa di-inject ke module lain
Acceptance: tabel Ticket sudah ada di database, bisa diverifikasi lewat prisma studio atau query manual.
Tahap 3 — Tickets Module (Tanpa ML Dulu)
[ ] Generate TicketsModule, TicketsController, TicketsService
[ ] Buat CreateTicketDto dengan validasi (title, description) sesuai bagian 5
[ ] Implementasi POST /tickets yang menyimpan tiket tanpa klasifikasi dulu (category/urgency sementara null atau default) — supaya CRUD dasar bisa dites dulu secara terpisah dari integrasi ML
[ ] Implementasi GET /tickets dan GET /tickets/:id
Acceptance: bisa submit tiket lewat Postman dan melihatnya muncul di GET /tickets, validasi DTO menolak input tidak valid dengan pesan error yang jelas.
Tahap 4 — Integrasi FastAPI (Ml Client)
[ ] Buat MlClientService (pakai HttpService dari @nestjs/axios) yang memanggil POST {ML_SERVICE_URL}/classify
[ ] Set timeout 5 detik pada request ini
[ ] Implementasikan fallback: jika request gagal/timeout, kembalikan { category: "UNCLASSIFIED", urgency: "Medium" } dan set isFallback: true
[ ] Hubungkan MlClientService ke TicketsService.create() — setiap tiket baru otomatis diklasifikasi sebelum disimpan
Acceptance: submit tiket dengan teks jelas (contoh: "saya butuh refund sekarang") menghasilkan category/urgency yang benar dari model. Matikan FastAPI secara sengaja lalu submit tiket lagi — tiket tetap tersimpan dengan isFallback: true dan nilai default, request tidak error 500.
Tahap 5 — Sorting & Filtering
[ ] Implementasikan mapping numerik urgency (High=3, Medium=2, Low=1) untuk ORDER BY di query GET /tickets
[ ] Tambahkan query param opsional category dan urgency untuk filter (FR5)
Acceptance: GET /tickets menampilkan tiket High di paling atas, lalu Medium, lalu Low; dalam urgency yang sama, terbaru di atas.
Tahap 6 — Error Handling & Health Check
[ ] Buat global exception filter agar semua error punya format response konsisten (bagian 5)
[ ] Implementasikan GET /health yang juga mengecek konektivitas ke FastAPI (request ringan/ping dengan timeout singkat)
Acceptance: error 400/404/500 semuanya mengembalikan shape JSON yang sama; GET /health menunjukkan status unreachable saat FastAPI dimatikan.
Tahap 7 — Dokumentasi API (Swagger)
[ ] Setup @nestjs/swagger, dekorasi DTO dan controller agar muncul di /api-docs
[ ] Pastikan semua endpoint (termasuk contoh request/response) terdokumentasi otomatis
Acceptance: buka /api-docs di browser, semua endpoint bisa dicoba langsung dari situ (tanpa Postman).
Tahap 8 — Testing Dasar
[ ] Unit test untuk MlClientService (mock HTTP call: skenario sukses dan skenario fallback)
[ ] Unit test untuk fungsi mapping urgency (sorting)
[ ] Minimal 1 e2e test: submit tiket → cek muncul di list
Acceptance: npm run test dan npm run test:e2e lulus semua.
Tahap 9 — Dokumentasi README Backend
[ ] Tulis README backend: cara install, cara run (termasuk pastikan FastAPI jalan duluan), contoh request/response, penjelasan singkat fallback behavior
[ ] Cantumkan link ke /api-docs (Swagger)
Acceptance: orang lain yang belum pernah lihat proyek ini bisa menjalankan backend hanya dengan mengikuti README.
9. Definition of Done — Backend Siap Showcase
[ ] Semua 9 tahap di atas selesai dengan acceptance criteria terpenuhi
[ ] Demo end-to-end manual berhasil: submit 3 tiket dengan urgensi berbeda (High/Medium/Low) lewat Swagger, lalu GET /tickets menampilkan urutan yang benar
[ ] Demo graceful degradation berhasil: FastAPI dimatikan, tiket tetap bisa disubmit dengan isFallback: true
[ ] README backend lengkap dan sudah diverifikasi bisa diikuti dari nol
[ ] Tidak ada console.log debug atau kode yang dikomentari tertinggal di codebase
10. Eksplisit Out of Scope (Next Steps, Jangan Dikerjakan di PRD Ini)
• Frontend Next.js (PRD terpisah, menyusul)
• Redis (caching/rate limiting)
• Docker + CI/CD
• Autentikasi JWT penuh / multi-tenant
• pgvector / semantic search
Item-item ini tetap dicantumkan sebagai "Next Steps" di README backend, bukan dihapus dari rencana besar — hanya ditunda sesuai keputusan MVP 5 hari sebelumnya.
11. NestJS Best Practices & Dependency Minimal (Industry-Standard)
Prinsip di bagian ini berlaku di SEMUA tahap pada bagian 8 — bukan tahap terpisah, tapi standar kualitas kode yang harus dipegang agent dari Tahap 1.
Dependency yang dipakai (minimal, semuanya mainstream di industri)
Dependency
Fungsi
Kenapa ini, bukan yang lain
@nestjs/config
Load & validasi environment variable
Standar resmi NestJS, tidak perlu dotenv manual
@nestjs/axios + rxjs
HTTP client ke FastAPI
Built-in NestJS wrapper untuk axios, terintegrasi dengan DI
class-validator + class-transformer
Validasi & transformasi DTO
Pasangan standar de-facto NestJS untuk validasi request
@prisma/client + prisma
ORM & migration
Sudah diputuskan di PRD awal, type-safe
@nestjs/swagger
Dokumentasi API otomatis
Wajib untuk showcase tanpa perlu Postman collection terpisah
@nestjs/testing + jest + supertest
Unit & e2e testing
Default bawaan Nest CLI, tidak perlu testing framework lain
Sengaja TIDAK dipakai (supaya tetap minimal, sesuai scope MVP): @nestjs/cqrs, @nestjs/graphql, @nestjs/microservices, @nestjs/jwt (auth lengkap ditunda), @nestjs/bull/queue library, ORM lain selain Prisma. Menambah ini di MVP showcase backend sederhana justru dianggap over-engineering, bukan nilai plus.
Prinsip Clean Code & Arsitektur
1.  Controller tetap tipis. Controller HANYA menerima request, memanggil satu method service, dan mengembalikan hasil. Tidak ada logika bisnis di controller.
2.  Service berisi logika bisnis murni, tidak langsung bergantung ke Prisma Client secara literal di banyak tempat — akses database selalu lewat PrismaService yang di-inject.
3.  MlClientService dibuat sebagai class dengan interface eksplisit (ClassificationResult { category: string; urgency: string; isFallback: boolean }) sebagai return type — supaya gampang di-mock saat unit test tanpa benar-benar memanggil HTTP.
4.  Gunakan TypeScript enum untuk Urgency (Low, Medium, High) alih-alih string bebas, supaya mapping numerik sorting (bagian 5) aman secara tipe dan tidak ada typo string yang lolos compile-time.
5.  DTO terpisah dari model Prisma. CreateTicketDto punya field sendiri (title, description), tidak langsung memakai Prisma model sebagai DTO — memisahkan "bentuk data dari luar" dan "bentuk data di database".
6.  Satu global exception filter, bukan try-catch berulang di tiap controller — konsistensi format error (bagian 5) didapat dari satu tempat terpusat.
7.  ValidationPipe dipasang global (app.useGlobalPipes(new ValidationPipe())), bukan manual validasi per endpoint.
8.  Logging pakai Logger bawaan NestJS (tanpa dependency tambahan) — catat setiap panggilan ke FastAPI: sukses (dengan hasil) atau fallback (dengan alasan gagal/timeout). Ini pengganti ringan dari observability stack (Prometheus/Grafana) yang sudah diputuskan di luar scope MVP, tapi tetap memberi jejak yang bisa ditunjukkan saat demo.
9.  Satu module = satu tanggung jawab. TicketsModule untuk fitur tiket, PrismaModule untuk akses database, MlClientModule (atau digabung ke dalam TicketsModule jika ingin lebih ringkas) untuk komunikasi ke FastAPI — jangan semua logic ditumpuk di satu module besar.
10.  Konsisten penamaan file mengikuti konvensi Nest CLI: *.controller.ts, *.service.ts, *.module.ts, *.dto.ts, *.spec.ts — jangan campur gaya penamaan lain.
Definition of Done Tambahan (Clean Code)
[ ] Tidak ada logika bisnis di controller — semua delegasi ke service
[ ] Urgency dan Category memakai enum/union type, bukan string bebas tanpa batasan
[ ] MlClientService punya interface return type yang jelas dan sudah di-unit-test dengan mock (bukan hanya dites manual lewat Postman)
[ ] Tidak ada dependency di luar daftar minimal pada tabel di atas tanpa alasan eksplisit
[ ] ESLint + Prettier default dari Nest CLI jalan tanpa error (npm run lint)