import json
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

# Load model
model_path = "model"
tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path)

# Device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

# Label mapping
label_map = {
    "HR": 0,
    "POSH": 1,
    "Child Labour": 2,
    "Safety": 3,
    "Compliance": 4,
    "Other": 5
}

reverse_map = {v: k for k, v in label_map.items()}

# 🔥 Prediction
def classify(text):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=128
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    pred = torch.argmax(outputs.logits).item()
    return reverse_map[pred]

# 🔥 Evaluation (uses TEST DATA, not training data)
def evaluate():
    with open("test_data.json") as f:   # ✅ IMPORTANT CHANGE
        data = json.load(f)

    y_true = []
    y_pred = []

    for item in data:
        text = item["text"]
        true_label = label_map[item["label"]]

        pred_label = classify(text)
        pred_label = label_map[pred_label]

        y_true.append(true_label)
        y_pred.append(pred_label)

    acc = accuracy_score(y_true, y_pred)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted"
    )

    print("\n📊 Evaluation Results (REAL):")
    print(f"Accuracy  : {acc:.4f}")
    print(f"Precision : {precision:.4f}")
    print(f"Recall    : {recall:.4f}")
    print(f"F1 Score  : {f1:.4f}")

# 🔥 Run
if __name__ == "__main__":

    # Test single prediction
    print("Prediction:", classify( "Uneven flooring and exposed wiring in the lobby area pose a risk of tripping and electrocution."))

    # Evaluate on unseen data
    evaluate()