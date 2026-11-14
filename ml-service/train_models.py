"""Train and compare TicketIQ category models using a validation split."""

from __future__ import annotations

import random
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer


ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
MODEL_DIR = ROOT_DIR / "models"
REPORT_DIR = ROOT_DIR / "reports"

SOURCE_TRAIN_FILE = DATA_DIR / "ticketiq_train.csv"
MODEL_TRAIN_FILE = DATA_DIR / "ticketiq_model_train.csv"
VALIDATION_FILE = DATA_DIR / "ticketiq_validation.csv"

BASELINE_MODEL_FILE = MODEL_DIR / "tfidf_logistic_regression.joblib"
DISTILBERT_DIR = MODEL_DIR / "distilbert"
SCORES_FILE = REPORT_DIR / "validation_scores.csv"

DISTILBERT_NAME = "distilbert-base-uncased"
RANDOM_STATE = 42
VALIDATION_SIZE = 0.20
MAX_LENGTH = 128
BATCH_SIZE = 8
EPOCHS = 3
LEARNING_RATE = 2e-5


def make_validation_split() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split only the existing train CSV; the test CSV is never loaded."""
    data = pd.read_csv(SOURCE_TRAIN_FILE)
    if not {"ticket_text", "category"}.issubset(data.columns):
        raise ValueError(f"{SOURCE_TRAIN_FILE} needs ticket_text and category columns")

    model_train, validation = train_test_split(
        data,
        test_size=VALIDATION_SIZE,
        random_state=RANDOM_STATE,
        stratify=data["category"],
    )
    model_train = model_train.reset_index(drop=True)
    validation = validation.reset_index(drop=True)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    model_train.to_csv(MODEL_TRAIN_FILE, index=False)
    validation.to_csv(VALIDATION_FILE, index=False)
    print(
        f"Data split: {len(model_train)} training rows, "
        f"{len(validation)} validation rows"
    )
    return model_train, validation


def save_validation_results(
    model_name: str,
    actual: list[str],
    predicted: list[str],
    categories: list[str],
) -> dict[str, float | str]:
    """Save accuracy, macro-F1, and a confusion matrix for one model."""
    scores = {
        "model": model_name,
        "accuracy": accuracy_score(actual, predicted),
        "f1_macro": f1_score(
            actual,
            predicted,
            labels=categories,
            average="macro",
            zero_division=0,
        ),
    }

    matrix = confusion_matrix(actual, predicted, labels=categories)
    matrix_frame = pd.DataFrame(
        matrix,
        index=categories,
        columns=categories,
    )
    matrix_frame.index.name = "actual_category"
    matrix_frame.to_csv(REPORT_DIR / f"{model_name}_confusion_matrix.csv")
    return scores


def train_tfidf_logistic_regression(
    model_train: pd.DataFrame,
    validation: pd.DataFrame,
    categories: list[str],
) -> dict[str, float | str]:
    """Fit the baseline pipeline and measure it on the validation rows."""
    model = Pipeline(
        [
            ("tfidf", TfidfVectorizer()),
            ("classifier", LogisticRegression(max_iter=1000)),
        ]
    )
    model.fit(model_train["ticket_text"], model_train["category"])

    predictions = model.predict(validation["ticket_text"])
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, BASELINE_MODEL_FILE)
    print(f"Saved TF-IDF + Logistic Regression model: {BASELINE_MODEL_FILE}")

    return save_validation_results(
        "tfidf_logistic_regression",
        validation["category"].tolist(),
        predictions.tolist(),
        categories,
    )


class TicketDataset(Dataset):
    """Tokenized ticket texts and their category IDs for PyTorch."""

    def __init__(
        self,
        texts: list[str],
        labels: list[int],
        tokenizer: AutoTokenizer,
    ) -> None:
        self.tokens = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
            return_tensors="pt",
        )
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self) -> int:
        return len(self.labels)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        item = {key: value[index] for key, value in self.tokens.items()}
        item["labels"] = self.labels[index]
        return item


def train_distilbert(
    model_train: pd.DataFrame,
    validation: pd.DataFrame,
    categories: list[str],
    device: torch.device,
) -> dict[str, float | str]:
    """Fine-tune DistilBERT and measure it on the validation rows."""
    label_to_id = {category: index for index, category in enumerate(categories)}
    train_labels = [label_to_id[label] for label in model_train["category"]]
    validation_labels = [label_to_id[label] for label in validation["category"]]

    tokenizer = AutoTokenizer.from_pretrained(DISTILBERT_NAME)
    train_data = TicketDataset(
        model_train["ticket_text"].tolist(),
        train_labels,
        tokenizer,
    )
    validation_data = TicketDataset(
        validation["ticket_text"].tolist(),
        validation_labels,
        tokenizer,
    )
    train_loader = DataLoader(
        train_data,
        batch_size=BATCH_SIZE,
        shuffle=True,
    )
    validation_loader = DataLoader(
        validation_data,
        batch_size=BATCH_SIZE,
        shuffle=False,
    )

    model = AutoModelForSequenceClassification.from_pretrained(
        DISTILBERT_NAME,
        num_labels=len(categories),
        id2label={index: label for label, index in label_to_id.items()},
        label2id=label_to_id,
    )
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            batch = {key: value.to(device) for key, value in batch.items()}
            optimizer.zero_grad(set_to_none=True)
            output = model(**batch)
            output.loss.backward()
            optimizer.step()
            total_loss += output.loss.item()

        average_loss = total_loss / len(train_loader)
        print(f"DistilBERT epoch {epoch + 1}/{EPOCHS}, loss={average_loss:.4f}")

    model.eval()
    predicted_ids: list[int] = []
    with torch.no_grad():
        for batch in validation_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            logits = model(input_ids=input_ids, attention_mask=attention_mask).logits
            predicted_ids.extend(logits.argmax(dim=1).cpu().tolist())

    DISTILBERT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(DISTILBERT_DIR)
    tokenizer.save_pretrained(DISTILBERT_DIR)
    print(f"Saved fine-tuned DistilBERT model: {DISTILBERT_DIR}")

    predicted_categories = [categories[index] for index in predicted_ids]
    return save_validation_results(
        "distilbert",
        validation["category"].tolist(),
        predicted_categories,
        categories,
    )


def main() -> None:
    if (REPORT_DIR / "test_scores.csv").exists():
        raise RuntimeError(
            "The final test score is already recorded. Do not retrain this "
            "selected model; start a new experiment with a fresh test set."
        )

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is not available in this Python environment. "
            "Install dependencies from requirements-training.txt in the project "
            "virtual environment before training."
        )

    random.seed(RANDOM_STATE)
    np.random.seed(RANDOM_STATE)
    torch.manual_seed(RANDOM_STATE)
    torch.cuda.manual_seed_all(RANDOM_STATE)
    device = torch.device("cuda")
    print(f"Training DistilBERT on GPU: {torch.cuda.get_device_name(0)}")

    model_train, validation = make_validation_split()
    categories = sorted(model_train["category"].unique())
    if len(categories) != 11:
        raise ValueError(f"Expected 11 categories, found {len(categories)}")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    results = [
        train_tfidf_logistic_regression(model_train, validation, categories),
        train_distilbert(model_train, validation, categories, device),
    ]

    scores = pd.DataFrame(results)
    scores.to_csv(SCORES_FILE, index=False)
    print("\nValidation results:")
    print(scores.to_string(index=False, float_format=lambda value: f"{value:.4f}"))
    print(f"Saved comparison and scores: {SCORES_FILE}")
    print("The held-out test CSV was not loaded or used.")


if __name__ == "__main__":
    main()
