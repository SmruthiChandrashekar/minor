import os
import sys
import dotenv
from supabase import create_client

dotenv.load_dotenv(os.path.join('backend', '.env'))
c = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])

# Wait, Supabase client REST API doesn't support raw SQL execution directly
# unless there is an RPC function. Does `exec_sql` exist?
try:
    res = c.rpc('exec_sql', {'sql_string': "SELECT 1"}).execute()
    print("exec_sql exists:", res)
except Exception as e:
    print("exec_sql error:", e)
