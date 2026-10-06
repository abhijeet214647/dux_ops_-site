# Copy jewipl's Pour Card permissions (+ the Pipe Laying User role's pipe-laying master perms) to raisonigroup.
# usage: scp this file to /tmp on the server, then: cd ~/frappe-bench/sites && DRY=1 ../env/bin/python /tmp/copy_pour_perms.py  (drop DRY=1 to apply)
import os, json, datetime, frappe
from frappe.permissions import setup_custom_perms

DRY = os.environ.get("DRY") == "1"
FIELDS = ["role", "permlevel", "read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export",
          "import", "share", "print", "email", "if_owner", "select"]

frappe.init(site="jewipl.duxdigitech.in"); frappe.connect()
pour_rows = frappe.get_all("Custom DocPerm", filters={"parent": "Pour Card"}, fields=FIELDS)
pl_rows = frappe.get_all("Custom DocPerm", filters={"role": "Pipe Laying User"}, fields=["parent"] + FIELDS)
roles = {r: frappe.get_doc("Role", r).as_dict() for r in ("Pipe Laying User", "Demo User")}
frappe.destroy()

# Pour Card: jewipl's full set; other doctypes: only the Pipe Laying User row
plan = {"Pour Card": pour_rows}
for r in pl_rows:
    if r.parent != "Pour Card":
        plan.setdefault(r.parent, []).append({k: r[k] for k in FIELDS})

frappe.init(site="raisonigroup.duxdigitech.in"); frappe.connect()
backup = {}
for dt in plan:
    backup[dt] = frappe.get_all("Custom DocPerm", filters={"parent": dt}, fields=FIELDS)
if not DRY:
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"/home/frappe/pour_perms_backup_raisonigroup_{ts}.json"
    json.dump({"custom_docperm_before": backup, "note": "doctypes with [] had standard perms only; deleting their Custom DocPerm rows restores that"}, open(path, "w"), indent=1, default=str)
    print("backup", path)

for r, d in roles.items():
    if frappe.db.exists("Role", r):
        print("role exists:", r)
    else:
        print(("would create" if DRY else "create") + " role:", r)
        if not DRY:
            frappe.get_doc({"doctype": "Role", "role_name": r, "desk_access": d.desk_access, "two_factor_auth": d.two_factor_auth}).insert(ignore_permissions=True)

for dt, rows in plan.items():
    if not frappe.db.exists("DocType", dt):
        print(f"[{dt}] doctype missing on raisonigroup - skipped"); continue
    had_custom = bool(backup[dt])
    if not had_custom and not DRY:
        setup_custom_perms(dt)  # keep the doctype's current standard perms as custom rows first
    current = frappe.get_all("Custom DocPerm", filters={"parent": dt}, fields=FIELDS) if had_custom or not DRY else \
        frappe.get_all("DocPerm", filters={"parent": dt}, fields=FIELDS)
    for row in rows:
        same = [c for c in current if c.role == row["role"] and c.permlevel == row["permlevel"]]
        if same:
            diff = {k: (same[0][k], row[k]) for k in FIELDS if same[0][k] != row[k]}
            if diff and dt == "Pour Card":
                print(f"[{dt}] {row['role']} differs {diff} -> " + ("would update" if DRY else "update"))
                if not DRY:
                    name = frappe.db.get_value("Custom DocPerm", {"parent": dt, "role": row["role"], "permlevel": row["permlevel"]})
                    frappe.db.set_value("Custom DocPerm", name, {k: row[k] for k in FIELDS})
            else:
                print(f"[{dt}] {row['role']} already present" + (f" (differs {diff}, left as is)" if diff else ""))
            continue
        print(f"[{dt}] " + ("would add" if DRY else "add") + f" {row['role']} " + "".join(k[0].upper() for k in FIELDS[2:] if row[k]))
        if not DRY:
            frappe.get_doc(dict(row, doctype="Custom DocPerm", parent=dt, parenttype="DocType", parentfield="permissions")).insert(ignore_permissions=True)
    if not DRY:
        frappe.clear_cache(doctype=dt)
if not DRY:
    frappe.db.commit()
    print("after Pour Card:", [(p.role, "S" if p.submit else "-", "C" if p.cancel else "-") for p in frappe.get_all("Custom DocPerm", filters={"parent": "Pour Card"}, fields=["role", "submit", "cancel"])])
frappe.destroy()
