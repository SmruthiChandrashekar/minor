import random
import json

categories = {
    "HR": [
        "salary not credited",
        "payment delayed",
        "leave not approved",
        "manager not responding",
        "attendance issue",
        "bonus not received"
    ],
    "POSH": [
        "harassment at workplace",
        "inappropriate messages",
        "uncomfortable behavior",
        "verbal abuse by manager",
        "misconduct by colleague"
    ],
    "Child Labour": [
        "underage workers at site",
        "children working illegally",
        "minor employed at construction",
        "child labour observed",
        "kids working at workplace"
    ],
    "Safety": [
        "unsafe working conditions",
        "workers not wearing helmets",
        "risk of accident",
        "equipment not safe",
        "dangerous construction site"
    ],
    "Compliance": [
        "illegal activities happening",
        "policy violation",
        "rules not followed",
        "regulatory issue",
        "non compliance observed"
    ],
    "Other": [
        "general complaint",
        "system issue",
        "misc problem",
        "random issue",
        "uncategorized complaint"
    ]
}

templates = [
    "There is {}",
    "I want to report {}",
    "Facing issue with {}",
    "This is regarding {}",
    "Complaint about {}",
    "Problem related to {}",
    "Serious concern about {}"
]

data = []

samples_per_category = 500 // len(categories)

for category, phrases in categories.items():
    for _ in range(samples_per_category):
        phrase = random.choice(phrases)
        template = random.choice(templates)
        sentence = template.format(phrase)

        data.append({
            "text": sentence,
            "label": category
        })

# Shuffle dataset
random.shuffle(data)

# Save to file
with open("data.json", "w") as f:
    json.dump(data, f, indent=2)

print("✅ Generated 500 samples!")