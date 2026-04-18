from fastapi import APIRouter
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

router = APIRouter()

# 🔥 Load model ONCE (important)
model_path = "../agents/classification/model"

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

# Label mapping
reverse_map = {
    0: "HR",
    1: "POSH",
    2: "Child Labour",
    3: "Safety",
    4: "Compliance",
    5: "Other"
}

# Request schema
class ComplaintRequest(BaseModel):
    text: str

# 🔥 API endpoint
@router.post("/classify")
def classify_complaint(request: ComplaintRequest):

    inputs = tokenizer(
        request.text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=128
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    pred = torch.argmax(outputs.logits).item()

    return {
        "category": reverse_map[pred]
    }