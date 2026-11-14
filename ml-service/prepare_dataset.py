"""Build the TicketIQ dataset from the Bitext dataset on Hugging Face."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from datasets import load_dataset
from sklearn.model_selection import train_test_split
from urgency_rules import assign_urgency


DATASET_ID = "bitext/Bitext-customer-support-llm-chatbot-training-dataset"
TARGET_SAMPLES = 8_000
TEST_SIZE = 0.20
RANDOM_STATE = 42
OUTPUT_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_COLUMNS = ["ticket_text", "category", "urgency"]

CATEGORIES = {
    "ACCOUNT",
    "ORDER",
    "REFUND",
    "CONTACT",
    "PAYMENT",
    "FEEDBACK",
    "SHIPPING",
    "INVOICE",
    "DELIVERY",
    "SUBSCRIPTION",
    "CANCEL",
}

def load_and_clean_source() -> pd.DataFrame:
    dataset = load_dataset(DATASET_ID)
    if "train" not in dataset:
        raise ValueError(f"{DATASET_ID} does not contain the expected train split")

    source = dataset["train"].to_pandas()
    required_columns = {"instruction", "category"}
    missing_columns = required_columns - set(source.columns)
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing_columns)}")

    source = source[["instruction", "category"]].copy()
    source["instruction"] = source["instruction"].astype("string").str.strip()
    source["category"] = source["category"].astype("string").str.strip()
    source = source.dropna(subset=["instruction", "category"])
    source = source[
        (source["instruction"] != "") & (source["category"] != "")
    ].drop_duplicates(subset=["instruction", "category"])

    unexpected_categories = set(source["category"].unique()) - CATEGORIES
    missing_categories = CATEGORIES - set(source["category"].unique())
    if unexpected_categories or missing_categories:
        raise ValueError(
            "Source category mismatch: "
            f"unexpected={sorted(unexpected_categories)}, "
            f"missing={sorted(missing_categories)}"
        )
    if len(source) < TARGET_SAMPLES:
        raise ValueError(
            f"Only {len(source):,} valid unique rows remain; "
            f"{TARGET_SAMPLES:,} are required"
        )

    return source.reset_index(drop=True)


def stratified_sample(source: pd.DataFrame) -> pd.DataFrame:
    category_sizes = source["category"].value_counts().sort_index()
    quotas = category_sizes * (TARGET_SAMPLES / len(source))
    allocation = quotas.astype(int)
    remaining = TARGET_SAMPLES - int(allocation.sum())
    remainders = (quotas - allocation).sort_values(
        ascending=False, kind="stable"
    )
    for category in remainders.index[:remaining]:
        allocation.loc[category] += 1

    sampled = pd.concat(
        [
            group.sample(
                n=int(allocation.loc[category]),
                random_state=RANDOM_STATE,
            )
            for category, group in source.groupby("category", sort=True)
        ],
        ignore_index=True,
    )
    if len(sampled) != TARGET_SAMPLES:
        raise RuntimeError(
            f"Stratified sampling produced {len(sampled)} rows, "
            f"expected {TARGET_SAMPLES}"
        )
    return sampled


def split_dataset(sampled: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    full = sampled.rename(columns={"instruction": "ticket_text"})[
        ["ticket_text", "category"]
    ].copy()
    full["urgency"] = [
        assign_urgency(ticket_text, category)
        for ticket_text, category in zip(full["ticket_text"], full["category"])
    ]

    strata = full["category"] + "_" + full["urgency"]
    counts = strata.value_counts()
    if (counts < 2).any():
        too_small = counts[counts < 2].to_dict()
        raise ValueError(
            "Cannot stratify the train/test split; these category/urgency "
            f"groups have fewer than 2 rows: {too_small}"
        )

    train, test = train_test_split(
        full,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=strata,
    )
    return (
        full.reset_index(drop=True),
        train.reset_index(drop=True),
        test.reset_index(drop=True),
    )


def validate_outputs(
    full: pd.DataFrame, train: pd.DataFrame, test: pd.DataFrame
) -> None:
    expected_sizes = (TARGET_SAMPLES, 6_400, 1_600)
    for name, frame, expected_size in zip(
        ("full", "train", "test"), (full, train, test), expected_sizes
    ):
        if list(frame.columns) != OUTPUT_COLUMNS:
            raise RuntimeError(f"{name} has unexpected columns: {list(frame.columns)}")
        if len(frame) != expected_size:
            raise RuntimeError(
                f"{name} has {len(frame)} rows; expected {expected_size}"
            )
        if frame.isna().any().any() or (frame["ticket_text"].str.strip() == "").any():
            raise RuntimeError(f"{name} contains empty or missing values")

    if full.duplicated(subset=["ticket_text", "category"]).any():
        raise RuntimeError("The full dataset contains duplicate tickets")
    train_tickets = set(zip(train["ticket_text"], train["category"]))
    test_tickets = set(zip(test["ticket_text"], test["category"]))
    if not train_tickets.isdisjoint(test_tickets):
        raise RuntimeError("Train and test datasets overlap")

    full_counts = full.groupby(["category", "urgency"]).size()
    test_counts = test.groupby(["category", "urgency"]).size()
    if set(full_counts.index) != set(test_counts.index):
        raise RuntimeError("Train/test split does not preserve every stratum")
    if ((test_counts - full_counts * TEST_SIZE).abs() > 1).any():
        raise RuntimeError("Train/test split is not balanced across strata")


def write_and_verify_outputs(
    full: pd.DataFrame, train: pd.DataFrame, test: pd.DataFrame
) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = {
        "ticketiq_full.csv": full,
        "ticketiq_train.csv": train,
        "ticketiq_test.csv": test,
    }

    for filename, frame in outputs.items():
        path = OUTPUT_DIR / filename
        frame.to_csv(path, index=False)
        saved = pd.read_csv(path)
        if list(saved.columns) != OUTPUT_COLUMNS or len(saved) != len(frame):
            raise RuntimeError(f"CSV verification failed for {path}")


def main() -> None:
    source = load_and_clean_source()
    sampled = stratified_sample(source)
    full, train, test = split_dataset(sampled)
    validate_outputs(full, train, test)
    write_and_verify_outputs(full, train, test)

    print(f"Clean unique source rows: {len(source):,}")
    print(f"Generated rows: full={len(full):,}, train={len(train):,}, test={len(test):,}")
    print(f"Output directory: {OUTPUT_DIR}")
    print("Category counts:")
    print(full["category"].value_counts().sort_index().to_string())
    print("Urgency counts:")
    print(full["urgency"].value_counts().to_string())


if __name__ == "__main__":
    main()
