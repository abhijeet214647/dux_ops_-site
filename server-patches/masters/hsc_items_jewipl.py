# Create the HSC material items on jewipl with the same codes/settings as raisonigroup (the HSC code issues these codes).
# usage: cd ~/frappe-bench/sites && DRY=1 ../env/bin/python /tmp/hsc_items_jewipl.py   (drop DRY=1 to create)
import os, frappe

DRY = os.environ.get("DRY") == "1"
GROUP = "HSC Material"
ITEMS = [("Water Meter", "Nos"), ("FTA - L", "Nos"), ("FTA", "Nos"), ("DCE", "Nos"), ("Ball Valve", "Nos"),
         ("Brass Ferrule", "Nos"), ("MDPE Pipe (mtr)", "Meter")] + [(f"Saddle Size {d} MM", "Nos") for d in (63, 75, 90, 110, 125, 140, 160)]

frappe.init(site="jewipl.duxdigitech.in"); frappe.connect(); frappe.set_user("Administrator")
print("item_naming_by:", frappe.db.get_single_value("Stock Settings", "item_naming_by"))
print("UOMs:", {u: bool(frappe.db.exists("UOM", u)) for u in ("Nos", "Meter")})
created = []
try:
    if not frappe.db.exists("Item Group", GROUP):
        frappe.get_doc({"doctype": "Item Group", "item_group_name": GROUP, "parent_item_group": "All Item Groups", "is_group": 0}).insert()
        print("item group created:", GROUP)
    else:
        print("item group exists:", GROUP)
    for code, uom in ITEMS:
        if frappe.db.exists("Item", code):
            print("exists:", code, frappe.db.get_value("Item", code, ["item_group", "stock_uom", "is_stock_item", "disabled"], as_dict=1)); continue
        it = frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code, "item_group": GROUP, "stock_uom": uom,
                             "is_stock_item": 1, "include_item_in_manufacturing": 0, "valuation_rate": 0})
        it.insert(set_name=code)
        created.append((it.name, it.item_code))
    print("created:" if not DRY else "would create:", created)
    if DRY:
        frappe.db.rollback(); print("DRY RUN - rolled back")
    else:
        frappe.db.commit()
except Exception:
    frappe.db.rollback(); import traceback; traceback.print_exc()
frappe.destroy()
