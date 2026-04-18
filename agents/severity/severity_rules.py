def check_critical(text: str):
    text = text.lower()

    if any(word in text for word in ["child", "minor", "underage"]):
        return "Critical"

    if any(word in text for word in ["death", "fatal", "dead"]):
        return "Critical"

    return None