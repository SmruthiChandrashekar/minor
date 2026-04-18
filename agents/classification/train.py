import json
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, TrainingArguments, Trainer
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

# Load data
with open("data.json") as f:
    data = json.load(f)

# Label mapping
label_map = {
    "HR": 0,
    "POSH": 1,
    "Child Labour": 2,
    "Safety": 3,
    "Compliance": 4,
    "Other": 5
}

# Convert labels
for item in data:
    item["label"] = label_map[item["label"]]

dataset = Dataset.from_list(data)

# 🔥 Split dataset
dataset = dataset.train_test_split(test_size=0.2)
train_dataset = dataset["train"]
test_dataset = dataset["test"]

# Tokenizer
model_name = "distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)

def tokenize(example):
    return tokenizer(
        example["text"],
        truncation=True,
        padding="max_length",
        max_length=128   # 🔥 reduces memory
    )

train_dataset = train_dataset.map(tokenize)
test_dataset = test_dataset.map(tokenize)

train_dataset = train_dataset.rename_column("label", "labels")
test_dataset = test_dataset.rename_column("label", "labels")

train_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
test_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])

# Model
model = AutoModelForSequenceClassification.from_pretrained(
    model_name,
    num_labels=6
)

# 🔥 Evaluation metrics
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = logits.argmax(axis=1)

    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="weighted"
    )
    acc = accuracy_score(labels, preds)

    return {
        "accuracy": acc,
        "f1": f1,
        "precision": precision,
        "recall": recall
    }

# 🔥 TRAINING CONFIG (optimized for 2GB GPU)
training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=3,

    per_device_train_batch_size=2,          # 🔥 reduced
    per_device_eval_batch_size=2,

    gradient_accumulation_steps=4,          # 🔥 simulate bigger batch

    logging_steps=10,
    evaluation_strategy="epoch",
    save_strategy="epoch",

    fp16=True,                             # 🔥 half precision (less memory)

    load_best_model_at_end=True
)

# Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
    compute_metrics=compute_metrics
)

# Train
trainer.train()

# Evaluate
results = trainer.evaluate()
print("📊 Evaluation Results:", results)

# Save model
model.save_pretrained("model")
tokenizer.save_pretrained("model")

print("✅ Training complete")