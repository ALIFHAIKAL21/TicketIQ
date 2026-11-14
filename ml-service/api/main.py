"""FastAPI inference service for TicketIQ category and urgency classification."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import torch
from fastapi import FastAPI, Request
from pydantic import BaseModel, Field, field_validator
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from urgency_rules import assign_urgency


PROJECT_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = PROJECT_DIR / "models" / "distilbert"
MAX_LENGTH = 128


class ClassifyRequest(BaseModel):
    ticket_text: str = Field(min_length=1)

    @field_validator("ticket_text")
    @classmethod
    def ticket_text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("ticket_text must not be blank")
        return value


class ClassifyResponse(BaseModel):
    category: str
    urgency: Literal["Low", "Medium", "High"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not MODEL_DIR.is_dir():
        raise FileNotFoundError(f"Trained DistilBERT model not found: {MODEL_DIR}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.to(device)
    model.eval()

    app.state.device = device
    app.state.tokenizer = tokenizer
    app.state.model = model
    print(f"TicketIQ inference device: {device}")
    yield


app = FastAPI(
    title="TicketIQ Classification API",
    description="Predict ticket category and assign rule-based urgency.",
    lifespan=lifespan,
)


@app.post("/classify", response_model=ClassifyResponse)
def classify_ticket(
    payload: ClassifyRequest,
    request: Request,
) -> ClassifyResponse:
    tokenizer = request.app.state.tokenizer
    model = request.app.state.model
    device = request.app.state.device

    inputs = tokenizer(
        payload.ticket_text,
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="pt",
    )
    inputs = {name: value.to(device) for name, value in inputs.items()}

    with torch.inference_mode():
        logits = model(**inputs).logits
        predicted_id = int(logits.argmax(dim=1).item())

    id_to_label = {
        int(label_id): label for label_id, label in model.config.id2label.items()
    }
    if predicted_id not in id_to_label:
        raise RuntimeError(f"Model returned an unknown category id: {predicted_id}")

    category = id_to_label[predicted_id]
    urgency = assign_urgency(payload.ticket_text, category)
    return ClassifyResponse(category=category, urgency=urgency)
