# Laporan Persiapan Data dan Training Model TicketIQ

**Status:** training dan evaluasi validation selesai  
**Tanggal:** 12 November 2026

## 1. Tujuan

TicketIQ adalah prototipe ticket triage. Model memprediksi `category` dari teks tiket. Label `urgency` dibuat dengan aturan yang dapat ditelusuri dan tidak menjadi target training.

## 2. Dataset

Sumber data adalah Bitext Customer Support LLM Chatbot Training Dataset dari Hugging Face. Dari 26.872 baris sumber, baris kosong dan duplikat dibuang sehingga tersisa 24.635 baris unik. Sampling stratified per kategori menghasilkan 8.000 tiket dengan kolom `ticket_text`, `category`, dan `urgency`.

Pembagian dataset yang disiapkan:

| File | Baris | Kegunaan |
|---|---:|---|
| `ticketiq_train.csv` | 6.400 | Sumber data untuk training dan validation |
| `ticketiq_test.csv` | 1.600 | Evaluasi akhir; sudah digunakan satu kali |
| `ticketiq_model_train.csv` | 5.120 | Melatih kedua model |
| `ticketiq_validation.csv` | 1.280 | Membandingkan kedua model |

Validation disisihkan dari data train dengan stratifikasi berdasarkan `category`. Test set tetap terpisah dan tidak dibaca oleh skrip training.

## 3. Model dan konfigurasi

- **Baseline:** TF-IDF + Logistic Regression.
- **Model utama:** DistilBERT `distilbert-base-uncased`, fine-tuned selama 3 epoch pada NVIDIA RTX 4050 menggunakan CUDA 12.8.
- Kedua model hanya memprediksi 11 kelas `category`.
- Konfigurasi DistilBERT: batch size 8, learning rate `2e-5`, dan panjang maksimum 128 token. Pada 6.400 tiket training/validation, panjang terpanjang yang terukur adalah 31 token.

## 4. Hasil validation

| Model | Accuracy | Macro-F1 |
|---|---:|---:|
| TF-IDF + Logistic Regression | 0.9953 | 0.9948 |
| DistilBERT | 0.9984 | 0.9987 |

Pada validation, baseline salah mengklasifikasikan 6 tiket dan DistilBERT salah mengklasifikasikan 2 tiket. Detail pasangan kategori yang tertukar tersedia di confusion matrix masing-masing model.

DistilBERT mendapat skor lebih tinggi pada validation, tetapi selisihnya kecil: sekitar 0,31 poin persentase pada accuracy. Dataset ini berbasis template dan cukup mudah dikenali dari teks; skor tinggi ini **belum membuktikan** performa pada tiket nyata atau dampak bisnis. Gunakan hasil ini sebagai pembanding prototipe, bukan klaim kesiapan produksi.

## 5. Evaluasi final test

Setelah DistilBERT dipilih, model dievaluasi **satu kali** pada 1.600 baris `ticketiq_test.csv`:

| Model | Accuracy | Macro-F1 |
|---|---:|---:|
| DistilBERT | 0.9969 | 0.9973 |

Ini adalah angka final untuk README, bukan skor validation. Jangan gunakan test set untuk retraining atau tuning.

## 6. Hasil yang tersimpan

- Skrip training: [`train_models.py`](../train_models.py)
- Evaluator final satu kali: [`evaluate_test_once.py`](../evaluate_test_once.py)
- API FastAPI: [`api/main.py`](../api/main.py)
- Rule urgency bersama: [`urgency_rules.py`](../urgency_rules.py)
- Dependensi API: [`requirements-api.txt`](../requirements-api.txt)
- Dependensi training GPU: [`requirements-training.txt`](../requirements-training.txt)
- Tabel skor: [`validation_scores.csv`](./validation_scores.csv)
- Tabel skor final test: [`test_scores.csv`](./test_scores.csv)
- Confusion matrix TF-IDF: [`tfidf_logistic_regression_confusion_matrix.csv`](./tfidf_logistic_regression_confusion_matrix.csv)
- Confusion matrix DistilBERT: [`distilbert_confusion_matrix.csv`](./distilbert_confusion_matrix.csv)
- Confusion matrix final test: [`distilbert_test_confusion_matrix.csv`](./distilbert_test_confusion_matrix.csv)
- Model TF-IDF: [`tfidf_logistic_regression.joblib`](../models/tfidf_logistic_regression.joblib)
- Model DistilBERT: [`models/distilbert/`](../models/distilbert/)

Untuk menjalankan training dari root repository:

```powershell
.\.venv\Scripts\Activate.ps1
python .\ml-service\train_models.py
```

## 7. Status API

FastAPI `POST /classify` sudah dibuat di [`api/main.py`](../api/main.py). Model dimuat sekali saat service mulai; endpoint memprediksi kategori, lalu memakai fungsi bersama [`urgency_rules.py`](../urgency_rules.py) untuk urgency.

Uji HTTP langsung dengan teks contoh baru berhasil:

```json
{"ticket_text": "I need help with my payment"}
```

```json
{"category": "PAYMENT", "urgency": "High"}
```

Teks kosong ditolak dengan HTTP 422. Rule urgency yang digunakan API juga telah dicocokkan dengan label pada seluruh 8.000 baris dataset.

## 8. Acuan tahap selanjutnya

1. Implementasikan NestJS di folder `backend/`, lalu hubungkan ke FastAPI melalui HTTP dan gunakan hasil `category` serta `urgency` untuk filter antrean tiket.
2. Sebelum mengklaim manfaat untuk pengguna nyata, uji prototipe dengan tiket representatif yang dianonimkan dan kategori yang diverifikasi manusia.
