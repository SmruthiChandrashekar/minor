import bcrypt

password = "admin123"
hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
hash_str = hashed.decode("utf-8")

# Generate the SQL directly
sql = f"UPDATE users SET password = '{hash_str}' WHERE role = 'admin';"
print(sql)

with open("admin_password_sql.txt", "w") as f:
    f.write(sql + "\n")
    f.write(f"\n-- Hash: {hash_str}\n")
    f.write(f"-- Password: admin123\n")

print("\nSQL saved to admin_password_sql.txt")
