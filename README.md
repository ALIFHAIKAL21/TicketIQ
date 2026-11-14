# TicketIQ

TicketIQ adalah prototipe ticket triage. Service Python mengklasifikasikan
kategori tiket dengan DistilBERT dan menetapkan urgency dengan business rule.

## Struktur service

- [`ml-service/`](ml-service/): kode dan dependency Python untuk persiapan
  dataset, training model, evaluasi, dan FastAPI `POST /classify`. Mulai dari
  [panduan Python & ML](ml-service/README.md).
- `backend/`: tempat untuk NestJS backend pada tahap berikutnya. Belum
  diimplementasikan.

Dokumentasi project dan roadmap tetap berada di root: [PRD](PRD.md),
[agents](agents.md), dan [skills](skills.md).
