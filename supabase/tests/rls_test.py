#!/usr/bin/env python3
"""Security-rule tests for supabase/schema.sql.

Runs against a plain Postgres that has the stand-in auth/storage schemas from tests/stub.sql
(Supabase's real ones behave the same for these rules). Each case runs as an API role
(anon or authenticated) with a given user id, exactly as PostgREST would.

usage: rls_test.py "psql -h HOST -p PORT -U postgres -d DB"
"""
import subprocess, sys, uuid

PSQL = sys.argv[1].split()
A, B, ADMIN = (str(uuid.uuid4()) for _ in range(3))
BAS = "st-louis-cathedral-basilica-of-st-louis-new-cathedral"
results = []

def run(sql, role="postgres", uid=None):
    pre = ""
    if role != "postgres":
        pre = f"set role {role}; select set_config('request.jwt.claim.sub', '{uid or ''}', false);\n"
    p = subprocess.run(PSQL + ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", pre + sql],
                       capture_output=True, text=True)
    out = [l for l in p.stdout.strip().splitlines() if l and l not in (uid or "-", "")]
    return p.returncode == 0, (out[-1] if out else ""), p.stderr.strip()

def check(name, ok):
    results.append((name, ok)); print(("PASS " if ok else "FAIL ") + name)

def allowed(name, sql, role="authenticated", uid=None, expect=None):
    ok, out, err = run(sql, role, uid)
    check(name, ok and (expect is None or out == str(expect)) or False)
    if not ok or (expect is not None and out != str(expect)): print("   ->", out, err[:200])

def denied(name, sql, role="authenticated", uid=None):
    ok, out, err = run(sql, role, uid)
    check(name, not ok)
    if ok: print("   -> unexpectedly succeeded:", out)

# setup: three users (trigger makes their profiles), B is admin
run(f"""insert into auth.users (id, email, raw_user_meta_data) values
  ('{A}','a@example.com','{{"full_name":"Anna Smith"}}'), ('{B}','b@example.com','{{}}'), ('{ADMIN}','admin@example.com','{{}}');
  insert into public.admins values ('{ADMIN}');""")

allowed("profile auto-created from Google name", f"select display_name from profiles where id='{A}'", "postgres", expect="Anna")
allowed("profile defaults to Pilgrim", f"select display_name from profiles where id='{B}'", "postgres", expect="Pilgrim")

# anon
allowed("anon can read basilicas", "select count(*) from basilicas", "anon", expect=94)
denied("anon cannot read profiles", "select count(*) from profiles", "anon")
denied("anon cannot read visits", "select count(*) from visits", "anon")
denied("anon cannot read photos", "select count(*) from photos", "anon")

# visits
allowed("A checks off a basilica", f"insert into visits (basilica_id, visited_on) values ('{BAS}', '2026-10-01')", uid=A)
denied("A cannot add a visit for B", f"insert into visits (user_id, basilica_id) values ('{B}', '{BAS}')", uid=A)
denied("visit for unknown basilica rejected", "insert into visits (basilica_id) values ('not-a-basilica')", uid=A)
denied("visit date in the future rejected", f"insert into visits (basilica_id, visited_on) values ('{BAS}', current_date + 30)", uid=B)
allowed("B sees none of A's visits", "select count(*) from visits", uid=B, expect=0)
allowed("A sees own visit", "select count(*) from visits", uid=A, expect=1)
allowed("B's update of A's visit touches nothing", f"update visits set note='x' where user_id='{A}' returning 1", uid=B, expect="")

# photos
pathA = f"{A}/{BAS}/one.jpg"; thumbA = f"{A}/{BAS}/one.t.jpg"
allowed("A uploads a file to own folder", f"insert into storage.objects (bucket_id, name) values ('member-photos', '{pathA}'), ('member-photos', '{thumbA}')", uid=A)
denied("A cannot upload into B's folder", f"insert into storage.objects (bucket_id, name) values ('member-photos', '{B}/{BAS}/x.jpg')", uid=A)
allowed("A adds photo row (pending)", f"insert into photos (basilica_id, storage_path, caption) values ('{BAS}', '{pathA}', 'West front') returning status", uid=A, expect="pending")
denied("A cannot add photo pre-approved", f"insert into photos (basilica_id, storage_path, status) values ('{BAS}', '{A}/{BAS}/two.jpg', 'approved')", uid=A)
denied("photo path must be in own folder", f"insert into photos (basilica_id, storage_path) values ('{BAS}', '{B}/{BAS}/x.jpg')", uid=A)
denied("odd file names rejected", f"insert into photos (basilica_id, storage_path) values ('{BAS}', '{A}/{BAS}/../x.jpg')", uid=A)
denied("photo needs a visit first", f"insert into photos (basilica_id, storage_path) values ('{BAS}', '{B}/{BAS}/y.jpg')", uid=B)
denied("A cannot approve own photo by update", "update photos set status='approved'", uid=A)
denied("A cannot call review_photo", f"select review_photo((select id from photos limit 1), 'approved')", uid=A)
allowed("B cannot see A's pending photo", "select count(*) from photos", uid=B, expect=0)
allowed("B cannot read A's pending file", "select count(*) from storage.objects", uid=B, expect=0)
allowed("admin sees pending photo", "select count(*) from photos where status='pending'", uid=ADMIN, expect=1)
allowed("admin approves", f"select review_photo((select id from photos where storage_path='{pathA}'), 'approved')", uid=ADMIN)
allowed("B now sees approved photo", "select count(*) from photos", uid=B, expect=1)
allowed("B can read approved file and its thumbnail", "select count(*) from storage.objects", uid=B, expect=2)
allowed("gallery count shows approved photo to B", "select n from gallery_counts()", uid=B, expect=1)
denied("anon cannot call gallery_counts", "select * from gallery_counts()", "anon")
allowed("B sees uploader's display name", f"select p.display_name from photos ph join profiles p on p.id=ph.user_id", uid=B, expect="Anna")
allowed("anon still sees no photos", "select count(*) from basilicas where false", "anon", expect=0)
denied("anon cannot read files", "select count(*) from storage.objects", "anon")
allowed("B cannot delete A's photo (no rows)", "delete from photos returning 1", uid=B, expect="")
allowed("recaption sends photo back to queue", f"update photos set caption='Night' where storage_path='{pathA}' returning status", uid=A, expect="pending")
allowed("B no longer sees it", "select count(*) from photos", uid=B, expect=0)
allowed("A renames self", f"update profiles set display_name='Anna S.' where id='{A}' returning display_name", uid=A, expect="Anna S.")
allowed("A cannot rename B (no rows)", f"update profiles set display_name='X' where id='{B}' returning 1", uid=A, expect="")
denied("A cannot make self admin", f"insert into admins values ('{A}')", uid=A)
allowed("is_admin false for A", "select is_admin()", uid=A, expect="f")
allowed("is_admin true for admin", "select is_admin()", uid=ADMIN, expect="t")
denied("display name length enforced", f"update profiles set display_name=repeat('x',41) where id='{A}'", uid=A)

# 30-photo cap
run(f"insert into visits (user_id, basilica_id) values ('{B}', '{BAS}')")
run("insert into photos (user_id, basilica_id, storage_path) select '%s', '%s', '%s/%s/'||g||'.jpg' from generate_series(1,30) g" % (B, BAS, B, BAS))
denied("31st photo for one basilica rejected", f"insert into photos (basilica_id, storage_path) values ('{BAS}', '{B}/{BAS}/31.jpg')", uid=B)

# admins can remove an inappropriate photo and its files
allowed("admin deletes a member's photo", f"delete from photos where user_id='{B}' and storage_path like '%/1.jpg' returning 1", uid=ADMIN, expect=1)
run(f"insert into storage.objects (bucket_id, name) values ('member-photos', '{B}/{BAS}/2.jpg')")
allowed("admin deletes the file", f"delete from storage.objects where name='{B}/{BAS}/2.jpg' returning 1", uid=ADMIN, expect=1)
allowed("member cannot delete another's file (no rows)", f"delete from storage.objects where name like '{A}/%' returning 1", uid=B, expect="")

# account deletion cascades
allowed("deleting a user removes their data", f"delete from auth.users where id='{A}'; select count(*) from photos where user_id='{A}'", "postgres", expect=0)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
