# AGENTS.md — Konteks Dataset TicketIQ

## Dataset yang Digunakan

- **Nama:** Bitext Customer Support LLM Chatbot Training Dataset
- **Sumber:** HuggingFace Hub — repo `bitext/Bitext-customer-support-llm-chatbot-training-dataset`
- **Lisensi:** CDLA-Sharing 1.0 (bebas dipakai untuk riset/portofolio)
- **Ukuran asli:** 26.872 baris
- **Kolom tersedia:** `instruction` (teks tiket/pertanyaan), `category` (11 kelas), `intent`, `response`, `flags`
- **Cara akses:** library `datasets` dari HuggingFace — `load_dataset("bitext/Bitext-customer-support-llm-chatbot-training-dataset")`. Tidak perlu unduh file manual.

## Kategori Dataset Asli (11 kelas)

`ACCOUNT`, `ORDER`, `REFUND`, `CONTACT`, `PAYMENT`, `FEEDBACK`, `SHIPPING`, `INVOICE`, `DELIVERY`, `SUBSCRIPTION`, `CANCEL`

## Target Output Dataset

| Item | Spesifikasi |
|---|---|
| Jumlah sampel | 8.000 baris (stratified per kategori) |
| Kolom akhir | `ticket_text`, `category`, `urgency` |
| Split | 80% train / 20% test, stratified per kombinasi `category` + `urgency` |

## Aturan yang Harus Diikuti Agent

1. **Jangan random sampling biasa.** Distribusi kategori di dataset asli tidak rata (ACCOUNT ~22%, CANCEL ~3.5%). Sampling WAJIB stratified per kategori agar kelas minoritas tetap terwakili proporsional.
2. Kolom `urgency` **tidak ada** di dataset asli — harus dibuat lewat rule-based labeling. Lihat `skills.md` untuk detail aturan lengkap.
3. Hapus duplikat dan baris kosong pada kolom `instruction`/`category` sebelum sampling.
4. Split train/test harus stratified juga (kombinasi `category` + `urgency`), bukan random split biasa.
5. Simpan hasil akhir di folder `ml-service/data/` sebagai CSV terpisah: `ticketiq_full.csv`, `ticketiq_train.csv`, `ticketiq_test.csv`.
6. Data test tidak boleh pernah dipakai untuk training — hanya untuk evaluasi akhir model.

## Koreksi Penting

Model ML **hanya melatih klasifikasi `category`**. Kolom `urgency` TIDAK dilatih dengan ML — selalu dihitung ulang dengan rule yang sama persis seperti saat menyiapkan dataset (lihat `skills.md` Skill 2), baik saat training maupun saat inferensi di production.

## Target Tahap Training Model

| Item | Spesifikasi |
|---|---|
| Model yang dilatih | (1) Baseline: TF-IDF + Logistic Regression. (2) Utama: fine-tuned DistilBERT |
| Target klasifikasi | `category` saja (11 kelas) |
| Metrik evaluasi | Accuracy dan F1-score macro (bukan F1 biasa, karena kelas tidak seimbang) |
| Output | Model terlatih tersimpan ke disk + 1 endpoint `POST /classify` (FastAPI) |
| Kontrak API `/classify` | Input: teks tiket mentah. Proses: jalankan model kategori -> terapkan rule urgency dari Skill 2 pada (teks, kategori hasil prediksi). Output: `{"category": ..., "urgency": ...}` |

## Aturan Tambahan untuk Agent

7. Latih dan evaluasi **kedua** model (baseline dan DistilBERT), laporkan accuracy + F1 macro keduanya untuk perbandingan — jangan hanya melatih satu lalu berhenti.
8. API `/classify` dibangun terpisah dari NestJS (gunakan FastAPI/Python), karena library ML (scikit-learn, transformers, torch) adalah ekosistem Python. NestJS memanggil API ini lewat HTTP, bukan menjalankan model langsung di Node.
9. Urgency TIDAK diminta ke model maupun ke API eksternal apa pun saat inferensi — selalu dihitung dari fungsi rule yang sama seperti di tahap dataset.

## Hasil Validation & Keputusan Model Final

| Model | Validation Accuracy | Validation Macro-F1 |
|---|---:|---:|
| TF-IDF + Logistic Regression | 0.9953 | 0.9948 |
| DistilBERT (fine-tuned, 3 epoch) | 0.9984 | 0.9987 |

**Model yang dipilih untuk di-serve: DistilBERT.** Selisih skor validation kecil (~0,31 poin persentase) dan secara statistik nyaris tidak bermakna di dataset sekecil ini — jadi ini bukan keputusan "mana yang lebih akurat", tapi trade-off deployment yang disengaja:

- DistilBERT dipilih untuk menunjukkan kemampuan fine-tuning transformer secara end-to-end (nilai portofolio lebih kuat)
- Trade-off yang harus dicatat eksplisit di README: DistilBERT jauh lebih berat (±260MB, butuh `torch`+`transformers`, idealnya ada GPU/optimized CPU untuk latensi rendah) dibanding TF-IDF+LogReg yang ringan dan cukup CPU biasa. Untuk skala production dengan traffic tinggi, TF-IDF+LogReg sebenarnya pilihan yang lebih hemat resource — sebutkan ini sebagai kesadaran trade-off, bukan kelemahan yang tidak disadari.
- TF-IDF+LogReg tetap disimpan sebagai baseline pembanding di laporan, tidak dihapus.

## Aturan Tambahan — Evaluasi Final & Tahap Berikutnya

10. **Evaluasi model terpilih (DistilBERT) SATU KALI SAJA** pada `ticketiq_test.csv` sebelum model dianggap final. Jangan pernah tuning ulang atau retrain berdasarkan hasil test set ini — kalau itu terjadi, test set sudah tercemar (data leakage) dan angkanya tidak valid lagi untuk dilaporkan.
11. Angka yang dilaporkan di README final adalah hasil **test set** (bukan validation) untuk model DistilBERT yang dipilih.
12. Setelah evaluasi test set selesai dan dicatat, baru lanjut bungkus DistilBERT + rule urgency ke dalam service FastAPI `POST /classify` sesuai kontrak di atas.
13. Setelah FastAPI jalan, baru lanjut ke integrasi NestJS (Hari 2 roadmap) — jangan loncat ke integrasi sebelum evaluasi test set & API classify selesai dan teruji.

## Status: Hari 1 Selesai

- Evaluasi final test set (1.600 tiket): **accuracy 0.9969, macro-F1 0.9973** untuk DistilBERT — konsisten dengan validation, tidak ada indikasi overfitting.
- Urgency rule terverifikasi cocok pada seluruh 8.000 baris dataset.
- FastAPI `POST /classify` sudah berjalan di `ml-service/api/main.py`, menggabungkan prediksi kategori (DistilBERT) + `ml-service/urgency_rules.py`.
- Evaluator & skrip training sudah dikunci dari retraining/evaluasi ulang otomatis terhadap model terpilih.

## Target Tahap Hari 2: Integrasi NestJS <-> FastAPI

| Item | Spesifikasi |
|---|---|
| Alur | Client -> NestJS (validasi input) -> HTTP call ke FastAPI `/classify` -> simpan hasil ke DB -> response |
| Timeout ke FastAPI | Singkat (contoh: 5 detik) |
| Fallback saat FastAPI gagal/timeout | Simpan tiket dengan `category = "UNCLASSIFIED"`, `urgency = "Medium"` (default aman) — jangan gagalkan seluruh request |
| Urutan sorting urgency | High=3, Medium=2, Low=1 (mapping eksplisit, BUKAN alfabetis — alfabetis akan salah urut: High, Low, Medium) |
| Konfigurasi URL FastAPI | Lewat environment variable `ML_SERVICE_URL`, tidak di-hardcode |
| Logika urgency di NestJS | TIDAK diduplikasi — NestJS hanya membaca hasil `urgency` yang sudah dihitung FastAPI |

## Aturan Tambahan untuk Agent

14. Implementasikan fallback graceful degradation saat FastAPI tidak merespons dalam batas timeout — jangan biarkan request tiket gagal total hanya karena ML service down.
15. Gunakan mapping numerik eksplisit untuk urutan urgency saat query/sorting database, jangan mengandalkan urutan string alfabetis.
16. URL endpoint FastAPI harus dikonfigurasi lewat environment variable, bukan nilai hardcoded di kode.