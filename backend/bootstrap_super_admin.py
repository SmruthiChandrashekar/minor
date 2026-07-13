import os
from dotenv import load_dotenv
from supabase import create_client, Client
import sys

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL")
# MUST use the service role key for admin operations
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env")
    sys.exit(1)

# Initialize Supabase Admin Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def migrate_existing_admins():
    print("Checking for existing admins to migrate...")
    # Fetch all admins from users table
    response = supabase.table("users").select("*").in_("role", ["admin", "hr", "safety"]).execute()
    admins = response.data
    
    if not admins:
        print("No existing admins found.")
        return

    print(f"Found {len(admins)} existing admins/privileged users. Migrating to Supabase Auth...")
    
    for admin in admins:
        email = admin.get("email")
        if not email:
            print(f"Skipping admin {admin.get('user_id')} - no email.")
            continue
            
        print(f"Processing {email}...")
        
        # Check if user already exists in Supabase Auth by trying to create them.
        # Alternatively, we can use the admin list users endpoint, but create_user is simpler
        # and returns an error if they exist. However, the best way in the Python SDK is to list users.
        # We can fetch all users:
        try:
            # We will use invite_user_by_email to avoid setting a password and force them to reset it.
            # But the python SDK doesn't have a direct `invite_user_by_email` yet in some versions.
            # Let's try `create_user` with a random password, and if it fails because it exists, we skip.
            # If it succeeds, we update the user_id in the `users` table.
            # Since the requirement is to check first:
            
            # The python SDK supabase.auth.admin.list_users() exists.
            users_resp = supabase.auth.admin.list_users()
            existing_user = next((u for u in users_resp.users if u.email == email), None)
            
            if existing_user:
                print(f"User {email} already exists in Supabase Auth (uid: {existing_user.id}).")
                new_uid = existing_user.id
            else:
                # Create user in Auth
                print(f"Creating Auth account for {email}...")
                new_user_resp = supabase.auth.admin.create_user({
                    "email": email,
                    "password": "TemporaryPassword!123", # They will need to reset this
                    "email_confirm": True
                })
                new_uid = new_user_resp.user.id
                print(f"Created Auth user with uid: {new_uid}")
            
            # Update the users table to link the new UID
            # We can't easily change the primary key (user_id) if there are foreign keys.
            # Let's check if the user_id is the same.
            old_uid = admin.get("user_id")
            if str(old_uid) != str(new_uid):
                print(f"Updating user_id in users table from {old_uid} to {new_uid}...")
                # To bypass PK constraints, we might need to insert a new row and delete the old one,
                # but if there are foreign keys (like grievances.assigned_to, grievances.user_id),
                # we have to update them too.
                # Actually, Supabase UUIDs are generated, but we can't change the PK if it cascades.
                # If ON DELETE CASCADE is set, deleting the old user deletes their grievances!
                # Wait! We shouldn't change the users table's PK. We can update the Supabase Auth to use the existing UUID!
                # No, Supabase Auth generates its own UUIDs.
                
                # Best approach for migration:
                # Update the `user_id` column in `users` table.
                # In PostgreSQL, you CAN update a primary key if the foreign keys are set to ON UPDATE CASCADE.
                # But looking at 001_create_grievances.sql, it's `ON DELETE CASCADE`, not ON UPDATE CASCADE.
                # So updating the PK will fail.
                # Let's instead update the `users` row by doing an insert-and-reassign.
                
                # 1. Insert new user row
                new_admin_data = admin.copy()
                new_admin_data["user_id"] = new_uid
                
                # Check if new row already exists
                check_new = supabase.table("users").select("*").eq("user_id", new_uid).execute()
                if not check_new.data:
                    supabase.table("users").insert(new_admin_data).execute()
                
                # 2. Update grievances
                supabase.table("grievances").update({"user_id": new_uid}).eq("user_id", old_uid).execute()
                supabase.table("grievances").update({"assigned_to": new_uid}).eq("assigned_to", old_uid).execute()
                
                # 3. Delete old user row
                supabase.table("users").delete().eq("user_id", old_uid).execute()
                
                print(f"Migration for {email} completed successfully. Please instruct them to reset their password.")
            else:
                print(f"User {email} is already linked correctly.")
                
        except Exception as e:
            print(f"Failed to migrate {email}: {str(e)}")

def setup_super_admin():
    email = os.environ.get("SUPER_ADMIN_EMAIL", "superadmin@puravankara.com")
    password = os.environ.get("SUPER_ADMIN_PASSWORD", "ChangeMeImmediately!123")
    
    print(f"\nSetting up Super Admin: {email}")
    
    try:
        users_resp = supabase.auth.admin.list_users()
        existing_user = next((u for u in users_resp.users if u.email == email), None)
        
        if existing_user:
            print(f"Super admin Auth account already exists (uid: {existing_user.id})")
            uid = existing_user.id
        else:
            new_user_resp = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True
            })
            uid = new_user_resp.user.id
            print(f"Created new Super Admin Auth account.")
            
        # Check if users table has this super admin
        user_row = supabase.table("users").select("*").eq("user_id", uid).execute()
        if not user_row.data:
            supabase.table("users").insert({
                "user_id": uid,
                "email": email,
                "name": "Super Admin",
                "role": "super_admin",
                "user_type": "Internal",
                "department": "IT"
            }).execute()
            print("Added super_admin to users table.")
        else:
            # Ensure role is super_admin
            if user_row.data[0].get("role") != "super_admin":
                supabase.table("users").update({"role": "super_admin"}).eq("user_id", uid).execute()
                print("Updated existing user to super_admin role.")
            else:
                print("Super admin already configured in users table.")
                
    except Exception as e:
        print(f"Failed to setup super admin: {str(e)}")

if __name__ == "__main__":
    print("--- Puravankara GRM Admin Migration ---")
    migrate_existing_admins()
    setup_super_admin()
    print("\nMigration Complete.")
