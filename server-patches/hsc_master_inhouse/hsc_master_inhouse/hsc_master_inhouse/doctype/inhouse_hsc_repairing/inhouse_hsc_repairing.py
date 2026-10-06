# Copyright (c) 2025, Dux Digitech and contributors
# For license information, please see license.txt


# import frappe
# from frappe.model.document import Document

# class InhouseHSCRepairing(Document):

#     # ✅ SAVE pe chalega
#     def after_insert(self):
#         self.create_material_issue()

#     # ✅ UPDATE pe duplicate avoid
#     def on_update(self):
#         if not self.material_issue:
#             self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             # 🔴 agar already bana hua hai to skip
#             if self.material_issue:
#                 return

#             # 🟢 Stock Entry create
#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")

#             # 🟢 Warehouse (Contractor wise)
#             warehouse = f"{self.ihr_contractor_name} - JEWIPL"

# 			# stock_entry.from_warehouse = warehouse

#             # 🟢 Child Table loop
#             for row in self.hsc_material_table:

#                 if not row.item_name or not row.quantity:
#                     continue

#                 stock_entry.append("items", {
#                     "item_code": row.item_name,
#                     "qty": row.quantity,
#                     "uom": row.item_uom,
#                     "s_warehouse": warehouse,
#                     "allow_zero_valuation_rate": 1
#                 })

#             # ❌ agar items nahi mile
#             if not stock_entry.items:
#                 frappe.throw("No items found in Material Table")

#             # 🟢 Save + Submit
#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#             # 🟢 Link save
#             self.material_issue = stock_entry.name
#             self.db_update()

#             frappe.msgprint(f"Stock Entry Created: {stock_entry.name}")

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
#             frappe.throw(str(e))













# import frappe
# from frappe.model.document import Document

# class InhouseHSCRepairing(Document):

#     def after_insert(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             # 🟢 Contractor check
#             if not self.ihr_contractor_name:
#                 frappe.throw("Contractor Name is required")

#             warehouse = f"{self.ihr_contractor_name} - JEWIPL"

#             # 🟢 Warehouse validation
#             if not frappe.db.exists("Warehouse", warehouse):
#                 frappe.throw(f"Warehouse not found: {warehouse}")

#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")

#             # ✅ HEADER LEVEL
#             stock_entry.from_warehouse = warehouse

#             for row in self.hsc_material_table:

#                 if not row.item_name or not row.quantity:
#                     continue

#                 stock_entry.append("items", {
#                     "item_code": row.item_name,
#                     "qty": row.quantity,
#                     "uom": row.item_uom,
#                     "s_warehouse": warehouse,   # ✅ MUST
#                     "allow_zero_valuation_rate": 1
#                 })

#             if not stock_entry.items:
#                 frappe.throw("No items found")

#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#             self.material_issue = stock_entry.name
#             self.db_update()

#             frappe.msgprint(f"Stock Entry Created: {stock_entry.name}")

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
#             frappe.throw(str(e))


# import frappe
# from frappe.model.document import Document

# class InhouseHSCRepairing(Document):

#     def on_submit(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         # ✅ HSC Reference check
#         if not self.hsc_reference:
#             frappe.throw("HSC Reference is required before submitting.")

#         # ✅ HSC Details Inhouse se store fetch karo
#         warehouse = frappe.db.get_value("HSC Details Inhouse", self.hsc_reference, "store")

#         if not warehouse:
#             frappe.throw(
#                 f"Store (Warehouse) not found in HSC Reference: <b>{self.hsc_reference}</b>. "
#                 f"Please set Store in the linked HSC Details Inhouse document first."
#             )

#         stock_entry = frappe.new_doc("Stock Entry")
#         stock_entry.stock_entry_type = "Material Issue"
#         stock_entry.company = frappe.defaults.get_user_default("Company")
#         stock_entry.custom_hsc_repairing = self.name

#         # ✅ Float fields
#         float_items = [
#             ("Brass Ferrule",   frappe.utils.flt(self.brass_ferrule)),
#             ("MDPE Pipe (mtr)", frappe.utils.flt(self.mdpe_pipe_mtr)),
#             ("FTA - L",         frappe.utils.flt(self.ftal)),
            
#         ]

#         for item_code, qty in float_items:
#             if qty > 0:
#                 if not frappe.db.exists("Item", item_code):
#                     frappe.throw(f"Item not found in system: <b>{item_code}</b>")
#                 stock_entry.append("items", {
#                     "item_code": item_code,
#                     "qty": qty,
#                     "s_warehouse": ihr_contractor_name,
#                     "allow_zero_valuation_rate": 1
#                 })

#         # ✅ Saddle Size
#         if self.saddle_size:
#             saddle_item = f"Saddle Size {self.saddle_size}"
#             if not frappe.db.exists("Item", saddle_item):
#                 frappe.throw(f"Item not found: <b>{saddle_item}</b>")
#             stock_entry.append("items", {
#                 "item_code": saddle_item,
#                 "qty": 1,
#                 "s_warehouse": ihr_contractor_name,
#                 "allow_zero_valuation_rate": 1
#             })

#         # ✅ Items empty check
#         if not stock_entry.items:
#             frappe.throw("No valid items to issue.")

#         try:
#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#             frappe.db.set_value(
#                 self.doctype, self.name,
#                 "material_issue", stock_entry.name,
#                 update_modified=False
#             )

#             frappe.msgprint(
#                 f"Material Issue created: <b>{stock_entry.name}</b>",
#                 alert=True
#             )

#         except Exception:
#             frappe.log_error(frappe.get_traceback(), "Repairing Material Issue Error")
#             frappe.throw("Material Issue failed. Check Error Log for details.")

#     # ✅ Cancel Sync
#     def on_cancel(self):
#         if self.material_issue:
#             try:
#                 mi = frappe.get_doc("Stock Entry", self.material_issue)
#                 if mi.docstatus == 1:
#                     mi.cancel()
#             except Exception:
#                 frappe.log_error(frappe.get_traceback(), "Repairing Cancel Sync Error")
#                 frappe.throw("Material Issue cancel failed. Check Error Log.")





# import frappe
# from frappe.model.document import Document

# class InhouseHSCRepairing(Document):

#     def on_submit(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         # ✅ HSC Reference check
#         if not self.hsc_reference:
#             frappe.throw("HSC Reference is required before submitting.")

#         # ✅ Warehouse = contractor name + company abbr
#         company = frappe.defaults.get_user_default("Company")
#         company_abbr = frappe.get_value("Company", company, "abbr")
#         warehouse = self.ihr_contractor_name + " - " + company_abbr  # ✅ "Abhijeet - JEWIPL"

#         if not warehouse:
#             frappe.throw(
#                 f"Contractor Name not found. Please set Contractor in the document first."
#             )

#         stock_entry = frappe.new_doc("Stock Entry")
#         stock_entry.stock_entry_type = "Material Issue"
#         stock_entry.company = company
#         stock_entry.custom_hsc_repairing = self.name

#         # ✅ Float fields
#         float_items = [
#             ("Brass Ferrule",   frappe.utils.flt(self.brass_ferrule)),
#             ("MDPE Pipe (mtr)", frappe.utils.flt(self.mdpe_pipe_mtr)),
#             ("FTA - L",         frappe.utils.flt(self.ftal)),
#         ]

#         for item_code, qty in float_items:
#             if qty > 0:
#                 if not frappe.db.exists("Item", item_code):
#                     frappe.throw(f"Item not found in system: <b>{item_code}</b>")
#                 stock_entry.append("items", {
#                     "item_code": item_code,
#                     "qty": qty,
#                     "s_warehouse": warehouse,  # ✅ Fix
#                     "allow_zero_valuation_rate": 1
#                 })

#         # ✅ Saddle Size
#         if self.saddle_size:
#             saddle_item = f"Saddle Size {self.saddle_size}"
#             if not frappe.db.exists("Item", saddle_item):
#                 frappe.throw(f"Item not found: <b>{saddle_item}</b>")
#             stock_entry.append("items", {
#                 "item_code": saddle_item,
#                 "qty": 1,
#                 "s_warehouse": warehouse,  # ✅ Fix
#                 "allow_zero_valuation_rate": 1
#             })

#         # ✅ Items empty check
#         if not stock_entry.items:
#             frappe.throw("No valid items to issue.")

#         try:
#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#             frappe.db.set_value(
#                 self.doctype, self.name,
#                 "material_issue", stock_entry.name,
#                 update_modified=False
#             )

#             frappe.msgprint(
#                 f"Material Issue created: <b>{stock_entry.name}</b>",
#                 alert=True
#             )

#         except Exception:
#             frappe.log_error(frappe.get_traceback(), "Repairing Material Issue Error")
#             frappe.throw("Material Issue failed. Check Error Log for details.")

#     # ✅ Cancel Sync
#     def on_cancel(self):
#         if self.material_issue:
#             try:
#                 mi = frappe.get_doc("Stock Entry", self.material_issue)
#                 if mi.docstatus == 1:
#                     mi.cancel()
#             except Exception:
#                 frappe.log_error(frappe.get_traceback(), "Repairing Cancel Sync Error")
#                 frappe.throw("Material Issue cancel failed. Check Error Log.")
                
                
                
                
                
                
                
                
                
import frappe
from frappe.model.document import Document
from frappe.utils import cint, flt
from hsc_master_inhouse.hsc_master_inhouse.doctype.contractor_at_project.contractor_at_project import (
    get_contractor_named_warehouse,
    get_or_create_contractor_warehouse,
)


def is_hsc_material_issue_enabled():
    value = frappe.conf.get("hsc_material_issue_enabled")
    return True if value is None else bool(cint(value))


def get_repairing_source_warehouse(doc, hsc_details):
    company = hsc_details.company
    if not company:
        frappe.throw(
            f"Company not found in HSC Reference: <b>{doc.hsc_reference}</b>. "
            f"Please set Company in the linked HSC Details Inhouse document first."
        )

    company_abbr = frappe.db.get_value("Company", company, "abbr")
    if not company_abbr:
        frappe.throw(f"Company abbreviation not found for: <b>{company}</b>")

    if frappe.conf.get("hsc_company"):
        # sites that pin hsc_company issue repairs from the contractor's own warehouse
        contractor = hsc_details.hdi_contractor_name or doc.ihr_contractor_name
        warehouse = get_contractor_named_warehouse(contractor, company_abbr)
        if warehouse:
            return warehouse
        frappe.throw(f"Contractor warehouse not found for <b>{contractor or '-'}</b>. Open the contractor in HSC Masters and save it once to create the warehouse.")

    store = hsc_details.store
    if store:
        if frappe.db.exists("Warehouse", store):
            return store

        warehouse_code = store.rsplit(" - ", 1)[0].strip()
        warehouse = f"{warehouse_code} - {company_abbr}"
        if frappe.db.exists("Warehouse", warehouse):
            return warehouse

    goods_in_transit = f"Goods In Transit - {company_abbr}"
    if frappe.db.exists("Warehouse", goods_in_transit):
        return goods_in_transit

    contractor = hsc_details.hdi_contractor_name or doc.ihr_contractor_name
    if contractor:
        return get_or_create_contractor_warehouse(contractor, company)

    frappe.throw(
        "Valid Source Warehouse not found. Please set Store or ensure "
        f"{goods_in_transit} / contractor warehouse exists."
    )


class InhouseHSCRepairing(Document):

    def on_submit(self):
        if is_hsc_material_issue_enabled():
            self.create_material_issue()

    def create_material_issue(self):
        if not is_hsc_material_issue_enabled():
            return
        try:
            # Duplicate Material Issue create na ho
            if self.material_issue:
                return

            # HSC Reference required
            if not self.hsc_reference:
                frappe.throw("HSC Reference is required before submitting.")

            hsc_details = frappe.db.get_value(
                "HSC Details Inhouse",
                self.hsc_reference,
                ["store", "company", "hdi_contractor_name"],
                as_dict=True
            )
            if not hsc_details:
                frappe.throw(f"HSC Reference not found: <b>{self.hsc_reference}</b>")

            company = hsc_details.company
            warehouse = get_repairing_source_warehouse(self, hsc_details)

            stock_entry = frappe.new_doc("Stock Entry")
            stock_entry.stock_entry_type = "Material Issue"
            stock_entry.company = company

            # Stock Entry me custom_hsc_repairing field hai to hi set karega
            if frappe.get_meta("Stock Entry").has_field("custom_hsc_repairing"):
                stock_entry.custom_hsc_repairing = self.name

            items = [
                ("Brass Ferrule", flt(self.brass_ferrule)),
                ("MDPE Pipe (mtr)", flt(self.mdpe_pipe_mtr)),
                ("FTA - L", flt(self.ftal)),
            ]
            # sites that pin hsc_company also issue the valve replaced in the repair
            if frappe.conf.get("hsc_company"):
                items.append(("Ball Valve", flt(self.get("valve"))))

            for item_code, qty in items:
                if qty > 0:
                    if not frappe.db.exists("Item", item_code):
                        frappe.throw(f"Item not found in system: <b>{item_code}</b>")

                    stock_entry.append("items", {
                        "item_code": item_code,
                        "qty": qty,
                        "s_warehouse": warehouse,
                        "allow_zero_valuation_rate": 1
                    })

            if self.saddle_size:
                saddle_item = f"Saddle Size {self.saddle_size}"

                if not frappe.db.exists("Item", saddle_item):
                    frappe.throw(f"Item not found: <b>{saddle_item}</b>")

                stock_entry.append("items", {
                    "item_code": saddle_item,
                    "qty": 1,
                    "s_warehouse": warehouse,
                    "allow_zero_valuation_rate": 1
                })

            if not stock_entry.items:
                frappe.throw("No valid items to issue.")

            stock_entry.insert(ignore_permissions=True)
            stock_entry.submit()

            self.db_set("material_issue", stock_entry.name, update_modified=False)

            frappe.msgprint(
                f"Material Issue created: <b>{stock_entry.name}</b>",
                alert=True
            )

        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                "Inhouse HSC Repairing Material Issue Error"
            )
            raise

    def on_cancel(self):
        if self.material_issue:
            try:
                mi = frappe.get_doc("Stock Entry", self.material_issue)

                if mi.docstatus == 1:
                    mi.cancel()

            except Exception:
                frappe.log_error(
                    frappe.get_traceback(),
                    "Inhouse HSC Repairing Cancel Sync Error"
                )
                frappe.throw("Material Issue cancel failed. Check Error Log.")
                
                
                
                
                
                
                
