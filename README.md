# TicketIQ

TicketIQ adalah prototipe ticket triage. FastAPI menggunakan DistilBERT untuk
mengklasifikasikan kategori tiket dan business rules untuk menentukan urgency.
NestJS menyediakan REST API untuk menyimpan, memfilter, dan mengurutkan tiket,
serta tetap menerima tiket ketika ML service tidak tersedia. Backend kini
memiliki workflow support inbox, SLA kalender, koreksi kategori, bearer auth,
role admin/agent, dan isolasi workspace.

## Struktur service

- [`ml-service/`](ml-service/): persiapan dataset, training/evaluasi model,
  urgency rules, dan FastAPI `POST /classify`. Mulai dari
  [panduan Python & ML](ml-service/README.md).
- [`backend/`](backend/): NestJS API, Prisma/PostgreSQL, integrasi ML,
  graceful fallback, dan Swagger. Mulai dari
  [README backend](backend/README.md).

Dokumentasi project dan roadmap: [PRD](PRD.md), [agents](agents.md), dan
[skills](skills.md), [roadmap improvement](improve.md), dan
[PRD improvement](prd.improve.md). Modul belajar backend berbahasa Indonesia:
[modul belajar TicketIQ](MODUL_BELAJAR_NESTJS_TICKETIQ.md).
