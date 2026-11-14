# SKILLS.md — Dataset Preparation untuk TicketIQ

## Skill 1: Stratified Sampling per Kategori

**Tujuan:** mengurangi dataset besar (26.872 baris) menjadi subset lebih kecil (8.000 baris) tanpa merusak proporsi tiap kategori.

**Langkah:**
1. Kelompokkan data berdasarkan kolom `category`.
2. Hitung `fraksi = target_n_samples / total_baris_dataset`.
3. Dari tiap kelompok kategori, ambil sampel sejumlah `fraksi × jumlah_baris_kelompok_tersebut` — bukan jumlah tetap yang sama untuk semua kategori.
4. Gabungkan semua hasil sampel per kelompok menjadi satu dataset akhir.

**Contoh ilustrasi:** kalau kategori ACCOUNT adalah 22% dari total dataset asli, maka ACCOUNT juga harus tetap ~22% dari dataset hasil sampling — bukan diambil dengan proporsi acak atau jumlah rata sama rata antar kategori.

**Kenapa ini penting:** tanpa stratifikasi, kategori dengan baris sedikit (CANCEL, SUBSCRIPTION) berisiko kurang terwakili di data latih, sehingga model menjadi bias dan buruk khusus untuk mengenali kategori tersebut.

## Skill 2: Rule-Based Urgency Labeling

**Tujuan:** menambahkan label `urgency` (Low/Medium/High) karena dataset asli tidak menyediakan kolom ini.

**Urutan pengecekan** (dari atas ke bawah, berhenti begitu satu aturan cocok):

1. **Keyword check** pada teks tiket (`instruction`). Jika mengandung kata/frasa berikut → `urgency = High`, apapun kategorinya:
   `urgent`, `urgently`, `asap`, `immediately`, `right now`, `not working`, `broken`, `fraud`, `fraudulent`, `unauthorized`, `locked out`, `lost`, `stolen`, `charged twice`, `scam`, `angry`, `furious`, `complain`/`complaint`, atau kata `refund` yang dikombinasikan dengan `now`/`asap`/`immediately`.

2. **Jika tidak ada keyword di atas**, fallback ke kategori sebagai sinyal cadangan:
   - `REFUND`, `PAYMENT`, `CANCEL` → **High** (uang/akses langsung terganggu)
   - `ACCOUNT`, `ORDER`, `SHIPPING`, `INVOICE`, `SUBSCRIPTION`, `CONTACT` → **Medium** (operasional, tidak darurat)
   - Kategori lain (`FEEDBACK`, `DELIVERY`) → **Low** (informatif, bukan masalah aktif)

**Catatan desain:** ini murni logika if-else yang bisa ditelusuri (explainable), bukan hasil model ML. Pendekatan ini sengaja dipisah dari klasifikasi kategori (yang dipelajari model) karena urgensi punya logika yang cukup sederhana untuk ditulis eksplisit dan perlu bisa diaudit — pola hybrid ML + business rule yang umum dipakai di sistem production.

## Skill 3: Train/Test Split Stratified

**Tujuan:** memastikan evaluasi model representatif dan mendeteksi overfitting secara valid.

**Langkah:**
1. Buat kolom gabungan sementara sebagai kunci stratifikasi: `category + "_" + urgency`.
2. Split 80% train / 20% test menggunakan kunci gabungan tersebut sebagai parameter `stratify`.
3. Simpan train set dan test set sebagai file CSV terpisah.

**Catatan:** test set tidak boleh pernah dilihat atau digunakan saat training — hanya dipakai untuk evaluasi akhir setelah model selesai dilatih.

## Skill 4: Training & Evaluasi Model Kategori

**Tujuan:** melatih model yang bisa memprediksi `category` dari teks tiket, lalu membandingkan dua pendekatan.

**Model 1 — Baseline (TF-IDF + Logistic Regression):**
1. Ubah `ticket_text` jadi vektor numerik dengan TF-IDF vectorizer (fit hanya di data train).
2. Latih Logistic Regression multi-kelas di atas vektor tersebut, target = `category`.
3. Simpan vectorizer dan model (format `.pkl`) agar bisa dimuat ulang tanpa retrain.

**Model 2 — Fine-tuned DistilBERT:**
1. Muat model pretrained `distilbert-base-uncased` beserta tokenizer-nya.
2. Tambahkan classification head untuk 11 kelas `category`.
3. Fine-tune beberapa epoch (mulai dari 2-3 epoch) menggunakan data train, memanfaatkan GPU jika tersedia.
4. Simpan model hasil fine-tune (format HuggingFace: folder berisi config + weights + tokenizer) agar bisa dimuat ulang.

**Evaluasi untuk memilih model (wajib untuk kedua model):**
1. Sisihkan sebagian data train sebagai **validation set** (bukan test set) — validation inilah yang dipakai berulang kali untuk membandingkan model dan membuat keputusan.
2. Prediksi `category` pada validation set.
3. Hitung accuracy dan **F1-score macro** (rata-rata F1 per kelas tanpa pembobotan jumlah data, supaya kelas minoritas seperti CANCEL tetap dihitung adil).
4. Catat confusion matrix untuk melihat kategori mana yang paling sering tertukar.
5. Bandingkan hasil kedua model dalam satu tabel ringkas, lalu putuskan model mana yang dipakai (lihat Skill 4b untuk kriteria memilih saat selisih skor kecil).

**Catatan desain:** model hanya memprediksi `category`. Kolom `urgency` tidak pernah menjadi target training — selalu dihitung dari Skill 2 setelah kategori diketahui.

## Skill 4b: Memilih Model Saat Selisih Skor Kecil

**Tujuan:** memutuskan model mana yang di-serve ketika selisih accuracy/F1 antar model kecil (secara statistik nyaris tidak bermakna).

**Prinsip:** jangan memilih model hanya karena angkanya sedikit lebih tinggi. Pertimbangkan trade-off deployment:
1. Ukuran model dan dependency (model ringan berbasis sklearn vs model berat berbasis transformer+torch).
2. Kecepatan inferensi dan kebutuhan hardware saat serving (CPU biasa cukup, atau butuh GPU/optimisasi).
3. Nilai cerita teknis untuk portofolio (fine-tuning transformer menunjukkan kemampuan lebih luas dibanding model klasik).

**Keputusan untuk TicketIQ:** DistilBERT dipilih untuk di-serve meski selisih skor validation dengan baseline kecil (~0,31 poin persentase pada accuracy), dengan pertimbangan nilai portofolio dari fine-tuning transformer. Trade-off (model lebih berat, butuh `torch`+`transformers`) dicatat eksplisit di README, bukan disembunyikan. Baseline TF-IDF+Logistic Regression tetap disimpan sebagai pembanding, tidak dihapus dari repo.

## Skill 4c: Evaluasi Final di Test Set

**Tujuan:** mengukur performa model yang sudah dipilih (DistilBERT) pada data yang benar-benar belum pernah dilihat dalam proses apa pun sebelumnya — ini angka yang dilaporkan sebagai hasil akhir.

**Langkah:**
1. Pastikan model sudah final dipilih (lihat Skill 4b) **sebelum** menyentuh test set — tidak ada iterasi/tuning setelah tahap ini.
2. Jalankan prediksi `category` model terpilih pada `ticketiq_test.csv` — **hanya satu kali**.
3. Hitung accuracy dan F1-score macro pada test set, catat sebagai angka final.
4. **Jangan pernah retrain atau tuning ulang berdasarkan hasil test set ini.** Kalau dilakukan, test set dianggap "tercemar" (data leakage) dan angkanya tidak valid lagi untuk dilaporkan sebagai estimasi performa yang jujur.
5. Angka hasil test set inilah yang ditulis di README final — bukan angka validation, yang hanya dipakai untuk proses pemilihan model.

## Skill 5: Membungkus Model jadi API Inferensi

**Tujuan:** menyediakan satu endpoint yang bisa dipanggil NestJS untuk mengklasifikasi tiket baru secara real-time.

**Langkah:**
1. Muat model terlatih (pilih yang hasil evaluasinya lebih baik, biasanya DistilBERT) beserta vectorizer/tokenizer-nya sekali saat API dinyalakan (bukan setiap request, supaya cepat).
2. Buat endpoint `POST /classify` dengan body berisi teks tiket mentah.
3. Di dalam endpoint: jalankan model untuk memprediksi `category`, lalu panggil fungsi `assign_urgency()` dari Skill 2 dengan input (teks tiket, kategori hasil prediksi) untuk mendapatkan `urgency`.
4. Kembalikan response JSON: `{"category": "...", "urgency": "..."}`.
5. API ini dibangun dengan FastAPI (Python) karena library ML ada di ekosistem Python — berjalan sebagai service terpisah dari NestJS, dipanggil lewat HTTP biasa.

## Skill 6: Integrasi NestJS <-> FastAPI dengan Graceful Degradation

**Tujuan:** menghubungkan backend utama (NestJS) ke service ML (FastAPI) secara andal, termasuk saat service ML bermasalah.

**Langkah:**
1. Buat HTTP client di NestJS (module Ticket) yang memanggil `POST /classify` milik FastAPI, dengan base URL diambil dari environment variable (`ML_SERVICE_URL`), bukan hardcoded.
2. Set timeout singkat (contoh: 5 detik) untuk panggilan ini — jangan biarkan request tiket menggantung lama kalau FastAPI lambat merespons.
3. **Jika panggilan berhasil:** simpan tiket dengan `category` dan `urgency` persis dari hasil FastAPI, tanpa menghitung ulang apa pun di sisi NestJS.
4. **Jika panggilan gagal atau timeout:** jangan gagalkan seluruh request pembuatan tiket. Simpan tiket dengan nilai default: `category = "UNCLASSIFIED"`, `urgency = "Medium"`. Ini pola *graceful degradation* — sistem tetap berfungsi walau satu komponennya bermasalah.
5. Saat mengurutkan tiket berdasarkan urgency (untuk dashboard atau query database), gunakan mapping numerik eksplisit: `High = 3`, `Medium = 2`, `Low = 1`. Jangan mengandalkan urutan alfabetis string, karena urutan alfabetis dari "High", "Low", "Medium" tidak merepresentasikan prioritas yang benar.

**Catatan desain:** logika rule urgency tidak pernah diduplikasi di NestJS — satu-satunya sumber kebenaran untuk urgency tetap `ml-service/urgency_rules.py` di sisi FastAPI (kecuali untuk nilai default fallback di atas, yang murni untuk menjaga sistem tetap berjalan, bukan hasil klasifikasi).