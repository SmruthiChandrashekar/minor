import torch
from agents.severity.severity_rules import check_critical

def get_severity(text, tokenizer, model, device, severity_map):

    # 🔥 Rule override
    critical = check_critical(text)
    if critical:
        return critical

    # 🔥 ML model
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

    return severity_map[pred]