# TicketIQ

TicketIQ adalah prototipe ticket triage. FastAPI menggunakan DistilBERT untuk
mengklasifikasikan kategori tiket dan business rules untuk menentukan urgency.
NestJS menyediakan REST API untuk menyimpan, memfilter, dan mengurutkan tiket,
serta tetap menerima tiket ketika ML service tidak tersedia.

## Struktur service

- [`ml-service/`](ml-service/): persiapan dataset, training/evaluasi model,
  urgency rules, dan FastAPI `POST /classify`. Mulai dari
  [panduan Python & ML](ml-service/README.md).
- [`backend/`](backend/): NestJS API, Prisma/PostgreSQL, integrasi ML,
  graceful fallback, dan Swagger. Mulai dari
  [README backend](backend/README.md).

Dokumentasi project dan roadmap: [PRD](PRD.md), [agents](agents.md), dan
[skills](skills.md).
