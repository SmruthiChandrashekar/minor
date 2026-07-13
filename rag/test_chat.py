from chat_handler import handle_low

while True:
    user_input = input("\nYou: ")

    if user_input.lower() in ["exit", "quit"]:
        break

    response = handle_low(user_input)

    print("\nBot:", response)