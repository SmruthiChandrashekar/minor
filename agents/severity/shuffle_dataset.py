import json
import random
import os

file_path = os.path.join(os.path.dirname(__file__), "severity_data.json")

with open(file_path, "r") as f:
    data = json.load(f)

random.shuffle(data)

with open(file_path, "w") as f:
    json.dump(data, f, indent=2)

print("✅ severity_data.json shuffled successfully!")