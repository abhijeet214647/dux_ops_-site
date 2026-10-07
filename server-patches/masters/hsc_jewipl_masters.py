# jewipl: NP-II material items + one warehouse per HSC contractor ("<contractor> - JEWPL", the name the HSC / NP-II
# Material Issue looks up), so entries submitted from the DUX Ops Suite can issue from the contractor's own warehouse.
# usage: cd ~/frappe-bench/sites && DRY=1 ../env/bin/python /tmp/hsc_jewipl_masters.py   (drop DRY=1 to create)
import os, frappe

DRY = os.environ.get("DRY") == "1"
COMPANY = "Jain Engineering Works (India) Private Limited"
GROUP = "HSC Material"
NP_ITEMS = ["FTA-I", "GI Socket", "GI Elbow", "GI Nipple 9 inch", "GI Nipple 30 inch", "Tap", "Jointer"]

frappe.init(site="jewipl.duxdigitech.in"); frappe.connect(); frappe.set_user("Administrator")
abbr = frappe.db.get_value("Company", COMPANY, "abbr")
parent = f"All Warehouses - {abbr}"
print("abbr:", abbr, "| parent exists:", bool(frappe.db.exists("Warehouse", parent)), "| group exists:", bool(frappe.db.exists("Item Group", GROUP)))
try:
    items = []
    for code in NP_ITEMS:
        if frappe.db.exists("Item", code):
            print("item exists:", code); continue
        frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": GROUP, "stock_uom": "Nos",
                        "is_stock_item": 1, "include_item_in_manufacturing": 0, "valuation_rate": 0}).insert(set_name=code)
        items.append(code)
    labels = {}
    for r in frappe.get_all("Contractor at Project", fields=["name", "contractor", "contractor_name"], limit_page_length=0):
        label = (r.contractor or r.contractor_name or "").strip()
        if label and label.lower() != "null":  # CP-329 is literally named "null"
            labels.setdefault(label, []).append(r.name)
    made, had = [], []
    for label in sorted(labels):
        wh = f"{label} - {abbr}"
        if frappe.db.exists("Warehouse", wh):
            had.append(wh); continue
        frappe.get_doc({"doctype": "Warehouse", "warehouse_name": label, "parent_warehouse": parent, "company": COMPANY, "is_group": 0}).insert(ignore_permissions=True)
        made.append(wh)
    print(("would create" if DRY else "created"), "items:", items)
    print(("would create" if DRY else "created"), len(made), "warehouses:", made)
    print("already had:", had)
    if DRY:
        frappe.db.rollback(); print("DRY RUN - rolled back")
    else:
        frappe.db.commit()
except Exception:
    frappe.db.rollback(); import traceback; traceback.print_exc()
frappe.destroy()
