"""Run the final DistilBERT evaluation on ticketiq_test.csv once."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer


ROOT_DIR = Path(__file__).resolve().parent
TEST_FILE = ROOT_DIR / "data" / "ticketiq_test.csv"
MODEL_DIR = ROOT_DIR / "models" / "distilbert"
REPORT_DIR = ROOT_DIR / "reports"
SCORES_FILE = REPORT_DIR / "test_scores.csv"
CONFUSION_MATRIX_FILE = REPORT_DIR / "distilbert_test_confusion_matrix.csv"

BATCH_SIZE = 16
MAX_LENGTH = 128


def main() -> None:
    if SCORES_FILE.exists() or CONFUSION_MATRIX_FILE.exists():
        raise FileExistsError(
            "Final test evaluation output already exists. Do not run this "
            "evaluation again; the test set is reserved for one final report."
        )

    if not TEST_FILE.is_file() or not MODEL_DIR.is_dir():
        raise FileNotFoundError("Test CSV or selected DistilBERT model was not found")

    data = pd.read_csv(TEST_FILE)
    if not {"ticket_text", "category"}.issubset(data.columns):
        raise ValueError(f"{TEST_FILE} needs ticket_text and category columns")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Evaluating the selected DistilBERT model on {device}")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.to(device)
    model.eval()

    id_to_label = {
        int(label_id): label for label_id, label in model.config.id2label.items()
    }
    categories = [id_to_label[index] for index in sorted(id_to_label)]
    if len(categories) != 11:
        raise ValueError(f"Expected 11 model categories, found {len(categories)}")
    if len(data) != 1_600:
        raise ValueError(f"Expected 1,600 test rows, found {len(data)}")

    predictions: list[str] = []
    texts = data["ticket_text"].tolist()
    with torch.inference_mode():
        for start in range(0, len(texts), BATCH_SIZE):
            batch_texts = texts[start : start + BATCH_SIZE]
            inputs = tokenizer(
                batch_texts,
                truncation=True,
                padding=True,
                max_length=MAX_LENGTH,
                return_tensors="pt",
            )
            inputs = {name: value.to(device) for name, value in inputs.items()}
            logits = model(**inputs).logits
            predicted_ids = logits.argmax(dim=1).cpu().tolist()
            predictions.extend(id_to_label[index] for index in predicted_ids)

    actual = data["category"].tolist()
    scores = pd.DataFrame(
        [
            {
                "model": "distilbert",
                "split": "test",
                "samples": len(data),
                "accuracy": accuracy_score(actual, predictions),
                "f1_macro": f1_score(
                    actual,
                    predictions,
                    labels=categories,
                    average="macro",
                    zero_division=0,
                ),
            }
        ]
    )

    matrix = confusion_matrix(actual, predictions, labels=categories)
    matrix_frame = pd.DataFrame(matrix, index=categories, columns=categories)
    matrix_frame.index.name = "actual_category"

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    scores.to_csv(SCORES_FILE, index=False)
    matrix_frame.to_csv(CONFUSION_MATRIX_FILE)

    print(scores.to_string(index=False, float_format=lambda value: f"{value:.4f}"))
    print(f"Saved final test scores: {SCORES_FILE}")
    print(f"Saved final test confusion matrix: {CONFUSION_MATRIX_FILE}")
    print("Do not retrain or tune using this test result.")


if __name__ == "__main__":
    main()
