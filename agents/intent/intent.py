def detect_intent(text: str):
    text = text.lower().strip()

    question_words = ["what", "how", "when", "where", "why", "who"]

    # If ends with ? → Query
    if text.endswith("?"):
        return "Query"

    # If starts with question word → Query
    if any(text.startswith(word) for word in question_words):
        return "Query"

    return "Complaint"