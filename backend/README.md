# TicketIQ Backend

NestJS REST API untuk menyimpan dan mengklasifikasikan tiket dukungan. Backend
mengirim teks tiket ke FastAPI, menyimpan kategori dan urgency yang dikembalikan,
serta tetap menerima tiket dengan nilai fallback jika ML service tidak tersedia.

## Prasyarat

- Node.js dan npm
- PostgreSQL yang sedang berjalan
- FastAPI TicketIQ dan artefak model yang sudah disiapkan

Ikuti panduan environment Python dan FastAPI di
[`ml-service/README.md`](../ml-service/README.md). Pada checkout baru, artefak
model tidak tersedia di Git dan perlu dibuat melalui pipeline ML sebelum
menjalankan FastAPI. Evaluasi test final hanya boleh dilakukan sekali; jangan
mengulang `evaluate_test_once.py` jika laporan test final sudah ada.

## Konfigurasi

Dari folder `backend`, salin template environment:

```powershell
Copy-Item .env.example .env
```

Edit `backend/.env` dan sesuaikan URL, user, password, serta nama database
PostgreSQL lokal. Database utama dan shadow database harus tersedia sebelum
migrasi dijalankan.

| Variabel | Kegunaan |
|---|---|
| `DATABASE_URL` | Koneksi aplikasi ke PostgreSQL |
| `SHADOW_DATABASE_URL` | Database shadow yang dipakai Prisma saat migrasi development |
| `ML_SERVICE_URL` | Base URL FastAPI, default template `http://127.0.0.1:8000` |

Jangan commit `.env` atau memasukkan kredensial database ke dokumentasi.

## Instalasi dan migrasi

Jalankan dari folder `backend`:

```powershell
npm install
npx prisma migrate dev
```

Perintah migrasi menerapkan migration yang tersedia ke database dan
menghasilkan Prisma Client.

## Menjalankan aplikasi lokal

Jalankan FastAPI lebih dahulu di terminal pertama. Dari root repository:

```powershell
.\.venv\Scripts\Activate.ps1
Set-Location .\ml-service
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Jika virtual environment atau artefak model belum tersedia, ikuti setup ML di
[`ml-service/README.md`](../ml-service/README.md) terlebih dahulu.

Di terminal kedua, jalankan NestJS dari root repository:

```powershell
Set-Location .\backend
npm run start:dev
```

NestJS berjalan di `http://localhost:3000` secara default. Swagger UI tersedia
di [`http://localhost:3000/api-docs`](http://localhost:3000/api-docs). Halaman
`GET /health` melaporkan status backend dan apakah FastAPI dapat dijangkau.

## Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/health` | Status backend dan konektivitas FastAPI |
| `POST` | `/tickets` | Validasi, klasifikasi tiket, lalu simpan ke PostgreSQL |
| `GET` | `/tickets` | Daftar tiket, urgency tertinggi lebih dahulu; tiket terbaru lebih dahulu jika urgency sama |
| `GET` | `/tickets/:id` | Detail tiket berdasarkan ID |

`GET /tickets` menerima filter query opsional:

```text
GET /tickets?category=PAYMENT&urgency=High
```

Nilai `category` harus salah satu enum kategori TicketIQ (termasuk
`UNCLASSIFIED`); `urgency` harus `Low`, `Medium`, atau `High`.

## Contoh request dan response

Buat tiket melalui PowerShell:

```powershell
$body = @{
  title = "Payment issue"
  description = "I need help with a payment that is still pending."
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/tickets `
  -ContentType "application/json" `
  -Body $body
```

Contoh response sukses (`201 Created`):

```json
{
  "id": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "title": "Payment issue",
  "description": "I need help with a payment that is still pending.",
  "category": "PAYMENT",
  "urgency": "High",
  "isFallback": false,
  "createdAt": "2026-11-19T10:00:00.000Z",
  "updatedAt": "2026-11-19T10:00:00.000Z"
}
```

Response aktual berisi ID dan timestamp yang dibuat oleh database.

## Graceful fallback

NestJS memberi FastAPI waktu maksimal 5 detik untuk klasifikasi. Jika FastAPI
gagal atau timeout, request pembuatan tiket tetap berhasil dan tiket disimpan
dengan:

```json
{
  "category": "UNCLASSIFIED",
  "urgency": "Medium",
  "isFallback": true
}
```

Urgency dihitung oleh FastAPI; NestJS hanya menyimpan hasil yang dikembalikan
service tersebut. `isFallback` menunjukkan apakah klasifikasi tiket itu
menggunakan nilai fallback.

## Error dan validasi

Semua error menggunakan bentuk response:

```json
{
  "statusCode": 400,
  "message": "Pesan error yang aman untuk client",
  "error": "Bad Request"
}
```

Validasi menolak `title` yang kurang dari 3 karakter dan `description` yang
kurang dari 10 karakter. Error tak terduga dikirim dengan pesan umum, tanpa
detail internal.

## Testing dan pemeriksaan

Pastikan `.env` valid dan PostgreSQL tersedia untuk e2e test. Dari folder
`backend`, jalankan:

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Unit test ML mem-mock HTTP request sehingga tidak membutuhkan FastAPI aktif.
E2E test menggunakan database PostgreSQL dan mock ML client; test menghapus
record yang dibuatnya.

## Batasan dan next steps

- Belum ada autentikasi/otorisasi; jangan mengekspos API ke jaringan publik
  tanpa proteksi.
- Frontend Next.js, Redis, Docker/CI-CD, autentikasi penuh, dan pgvector berada
  di luar scope MVP ini, sesuai [PRD](../PRD.md).
