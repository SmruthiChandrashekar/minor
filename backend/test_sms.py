import os
from dotenv import load_dotenv
load_dotenv()
from twilio.rest import Client

sid = os.environ.get('TWILIO_ACCOUNT_SID')
token = os.environ.get('TWILIO_AUTH_TOKEN')
frm = os.environ.get('TWILIO_FROM_NUMBER')
to_num = '+919019744374'

print(f"Sending from {frm} to {to_num}...")
try:
    client = Client(sid, token)
    msg = client.messages.create(body='Test from GRM', from_=frm, to=to_num)
    print("Success! SID:", msg.sid)
except Exception as e:
    print("Error:", str(e))
