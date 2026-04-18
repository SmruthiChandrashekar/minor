import asyncio
from supabase import create_client, Client

SUPABASE_URL = "https://qcnxzravgrjdpwfqamzn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbnh6cmF2Z3JqZHB3ZnFhbXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjMzMzQsImV4cCI6MjA4OTkzOTMzNH0.Sam3JHUp17-_lAdjQOA9jwFmTHSbuOFNohGIOaVkmVw"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Try fetching users
response = supabase.table("users").select("*").execute()
print("Data in users table:", response.data)

# Test query for anita@company.com
response = supabase.table("users").select("*").eq("email", "anita@company.com").execute()
print("Query for anita@company.com:", response.data)
