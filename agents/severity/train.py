import json
import os
import shutil
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    EarlyStoppingCallback
)
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

# 🔥 (optional but safe) clear old checkpoints
if os.path.exists("./results"):
    shutil.rmtree("./results")

# Load data
with open("severity_data_expanded.json") as f:
    data = json.load(f)

# Label mapping
label_map = {
    "Low": 0,
    "Medium": 1,
    "High": 2,
    "Critical": 3,
    "Policy": 4
}

# Convert labels
for item in data:
    item["label"] = label_map[item["label"]]

dataset = Dataset.from_list(data)

# Split dataset
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
        max_length=128
    )

train_dataset = train_dataset.map(tokenize)
test_dataset = test_dataset.map(tokenize)

train_dataset = train_dataset.rename_column("label", "labels")
test_dataset = test_dataset.rename_column("label", "labels")

train_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
test_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])

# 🔥 Model with dropout added
model = AutoModelForSequenceClassification.from_pretrained(
    model_name,
    num_labels=5,
    hidden_dropout_prob=0.3,
    attention_probs_dropout_prob=0.3
)

# Metrics
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

# 🔥 Training config (only anti-overfitting changes)
training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=2,                  # 🔥 reduced

    per_device_train_batch_size=2,
    per_device_eval_batch_size=2,
    gradient_accumulation_steps=4,

    logging_steps=10,
    evaluation_strategy="epoch",
    save_strategy="epoch",

    fp16=True,

    weight_decay=0.01,                  # 🔥 added

    load_best_model_at_end=True
)

# 🔥 Trainer with early stopping
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=1)]
)

# Train
trainer.train(resume_from_checkpoint=False)

# Evaluate
results = trainer.evaluate()
print("📊 Evaluation Results:", results)

# Save model
model.save_pretrained("model")
tokenizer.save_pretrained("model")

print("✅ Training complete")