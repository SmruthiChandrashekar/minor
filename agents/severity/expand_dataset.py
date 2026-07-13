import json
import random
from tqdm import tqdm
import os

# =========================
# PATH SETUP
# =========================
base_dir = os.path.dirname(__file__)
file_path = os.path.join(base_dir, "severity_data.json")

# Save in ROOT
root_path = os.path.abspath(os.path.join(base_dir, "../../"))
output_path = os.path.join(root_path, "severity_data_expanded.json")

# =========================
# LOAD DATA
# =========================
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

# =========================
# GROUP BY LABEL
# =========================
label_groups = {}

for item in data:
    label = item["label"]
    label_groups.setdefault(label, []).append(item["text"])

# =========================
# AUGMENTATION
# =========================
def augment(text):
    variations = []

    variations.append(text)
    variations.append(text.lower())
    variations.append(text.capitalize())

    variations.append("there is an issue where " + text)
    variations.append("it has been observed that " + text)

    if "worker" in text:
        variations.append(text.replace("worker", "employee"))

    if "site" in text:
        variations.append(text.replace("site", "workplace"))

    return list(set(variations))

# =========================
# BALANCED EXPANSION
# =========================
TARGET_PER_CLASS = 2000

expanded = []

for label, texts in label_groups.items():
    print(f"Expanding label: {label}")

    generated = []

    while len(generated) < TARGET_PER_CLASS:
        text = random.choice(texts)
        aug_texts = augment(text)

        for t in aug_texts:
            generated.append(t)
            if len(generated) >= TARGET_PER_CLASS:
                break

    # Trim to exact size
    generated = generated[:TARGET_PER_CLASS]

    for t in generated:
        expanded.append({
            "text": t,
            "label": label
        })

# =========================
# FINAL SHUFFLE
# =========================
random.shuffle(expanded)

# =========================
# SAVE
# =========================
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(expanded, f, indent=2)

print("✅ Balanced dataset created")
print(f"📊 Total samples: {len(expanded)}")
print(f"📁 Saved at: {output_path}")