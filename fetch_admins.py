import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('backend/.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_KEY')
supabase = create_client(url, key)

res = supabase.table('users').select('name, email, role, department').execute()
for u in res.data:
    print(f"{u.get('name')} | {u.get('email')} | {u.get('role')} | {u.get('department')}")
