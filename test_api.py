from fastapi.testclient import TestClient
from backend.main import app
import os
from supabase import create_client

url = 'https://qcnxzravgrjdpwfqamzn.supabase.co'
key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbnh6cmF2Z3JqZHB3ZnFhbXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjMzMzQsImV4cCI6MjA4OTkzOTMzNH0.Sam3JHUp17-_lAdjQOA9jwFmTHSbuOFNohGIOaVkmVw'
supabase = create_client(url, key)
res = supabase.auth.sign_in_with_password({'email': 'admin@puravankara.com', 'password': 'AdminPassword!123'})
token = res.session.access_token

client = TestClient(app)
response = client.get('/api/admin/trends?category=Management&severity=', headers={'Authorization': f'Bearer {token}'})
print("STATUS:", response.status_code)
print("BODY:", response.text)
