"""Shared rule-based urgency labeling for dataset preparation and inference."""

import re


FALLBACK_URGENCY = {
    "REFUND": "High",
    "PAYMENT": "High",
    "CANCEL": "High",
    "ACCOUNT": "Medium",
    "ORDER": "Medium",
    "SHIPPING": "Medium",
    "INVOICE": "Medium",
    "SUBSCRIPTION": "Medium",
    "CONTACT": "Medium",
    "FEEDBACK": "Low",
    "DELIVERY": "Low",
}

HIGH_URGENCY_PATTERN = re.compile(
    r"\b(?:urgent|urgently|asap|immediately|right\s+now|not\s+working|"
    r"broken|fraud|fraudulent|unauthorized|locked\s+out|lost|stolen|"
    r"charged\s+twice|scam|angry|furious|complain(?:t)?)\b",
    flags=re.IGNORECASE,
)
REFUND_PATTERN = re.compile(r"\brefund\b", flags=re.IGNORECASE)
IMMEDIATE_PATTERN = re.compile(
    r"\b(?:now|asap|immediately)\b", flags=re.IGNORECASE
)


def assign_urgency(ticket_text: str, category: str) -> str:
    """Apply the exact rule-based urgency order defined in skills.md."""
    if HIGH_URGENCY_PATTERN.search(ticket_text) or (
        REFUND_PATTERN.search(ticket_text) and IMMEDIATE_PATTERN.search(ticket_text)
    ):
        return "High"
    return FALLBACK_URGENCY[category]
