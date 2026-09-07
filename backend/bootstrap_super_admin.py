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


def _list_auth_users():
    """
    Get all Supabase Auth users. Handles both old and new supabase-py SDK
    return types (list vs object with .users attribute).
    """
    resp = supabase.auth.admin.list_users()
    if isinstance(resp, list):
        return resp
    return getattr(resp, 'users', resp)


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
        
        try:
            all_users = _list_auth_users()
            existing_user = next((u for u in all_users if getattr(u, 'email', None) == email), None)
            
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
        all_users = _list_auth_users()
        existing_user = next((u for u in all_users if getattr(u, 'email', None) == email), None)
        
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


def seed_department_admins():
    """
    Seed admin accounts for all 6 departments, including general department admins
    and distinct tier admins (L1, L2, L3, HEAD) for Option B.

    Uses SEED_ADMIN_PASSWORD env var (default: development-only password).
    Each admin gets:
      - A Supabase Auth account
      - A row in the users table with role='admin', department, and admin_tier
    """
    password = os.environ.get("SEED_ADMIN_PASSWORD", "DeptAdmin!Dev123")

    depts = ["CRM", "CSD", "ESG", "HR", "Investors", "IC"]
    tiers = ["L1", "L2", "L3", "HEAD"]

    accounts_to_seed = []

    # 1. General Department Admins (all-tier overview)
    for dept in depts:
        accounts_to_seed.append({
            "department": dept,
            "admin_tier": None,
            "name": f"{dept} Admin",
            "email": f"{dept.lower()}_admin@puravankara.com",
        })

    # 2. Distinct Tier Admins (Option B)
    for dept in depts:
        for tier in tiers:
            name_label = f"{dept} Department Head" if tier == "HEAD" else f"{dept} {tier} Admin"
            accounts_to_seed.append({
                "department": dept,
                "admin_tier": tier,
                "name": name_label,
                "email": f"{dept.lower()}_{tier.lower()}@puravankara.com",
            })

    print(f"\n--- Seeding Department & Tier Admins ({len(accounts_to_seed)} accounts) ---")

    for acc in accounts_to_seed:
        email = acc["email"]
        name = acc["name"]
        department = acc["department"]
        admin_tier = acc["admin_tier"]
        tier_label = admin_tier if admin_tier else "General"

        try:
            # Check if Auth account exists
            all_users = _list_auth_users()
            existing_user = next((u for u in all_users if getattr(u, 'email', None) == email), None)

            if existing_user:
                uid = existing_user.id
                print(f"[EXISTS] {email} (uid: {uid})")
            else:
                new_user_resp = supabase.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "email_confirm": True
                })
                uid = new_user_resp.user.id
                print(f"[CREATED] {email} (uid: {uid})")

            # Prepare user row payload
            user_payload = {
                "user_id": uid,
                "email": email,
                "name": name,
                "role": "admin",
                "user_type": "Internal",
                "department": department,
            }
            if admin_tier:
                user_payload["admin_tier"] = admin_tier

            # Ensure users table row exists
            user_row = supabase.table("users").select("*").eq("user_id", uid).execute()
            if not user_row.data:
                try:
                    supabase.table("users").insert(user_payload).execute()
                    print(f"  -> Added to users table as admin/{department} [{tier_label}]")
                except Exception as insert_err:
                    if "admin_tier" in str(insert_err):
                        # Fallback without admin_tier if migration hasn't been run yet
                        user_payload.pop("admin_tier", None)
                        supabase.table("users").insert(user_payload).execute()
                        print(f"  -> Added without admin_tier (run 011_add_admin_tier.sql to enable tier column)")
                    else:
                        raise insert_err
            else:
                existing = user_row.data[0]
                update_fields = {}
                if existing.get("role") != "admin":
                    update_fields["role"] = "admin"
                if existing.get("department") != department:
                    update_fields["department"] = department
                if admin_tier and existing.get("admin_tier") != admin_tier:
                    update_fields["admin_tier"] = admin_tier

                if update_fields:
                    try:
                        supabase.table("users").update(update_fields).eq("user_id", uid).execute()
                        print(f"  -> Updated {list(update_fields.keys())} for {email}")
                    except Exception as update_err:
                        if "admin_tier" in str(update_err):
                            update_fields.pop("admin_tier", None)
                            if update_fields:
                                supabase.table("users").update(update_fields).eq("user_id", uid).execute()
                            print(f"  -> Column 'admin_tier' not found in users table. Run 011_add_admin_tier.sql")
                        else:
                            raise update_err
                else:
                    print(f"  -> Already configured correctly [{tier_label}]")

        except Exception as e:
            print(f"[ERROR] Failed to seed {email}: {str(e)}")

    print("Department and tier admin seeding complete.")


if __name__ == "__main__":
    print("--- Puravankara GRM Admin Migration ---")
    migrate_existing_admins()
    setup_super_admin()
    seed_department_admins()
    print("\nMigration Complete.")

