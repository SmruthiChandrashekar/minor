import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# =========================
# LOAD MODEL
# =========================
import os

base_dir = os.path.dirname(__file__)
model_path = os.path.join(base_dir, "../../severity_model")

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path)

model.eval()

# =========================
# LABEL MAP (REVERSE)
# =========================
label_map = {
    0: "Policy",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Critical"
}

# =========================
# PREDICT FUNCTION
# =========================
def predict(text):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=64
    )

    with torch.no_grad():
        outputs = model(**inputs)

    logits = outputs.logits
    pred = torch.argmax(logits, dim=1).item()

    return label_map[pred]


# =========================
# INTERACTIVE TEST
# =========================
while True:
    text = input("\nEnter complaint: ")

    if text.lower() in ["exit", "quit"]:
        break

    severity = predict(text)

    print("🔥 Predicted Severity:", severity)