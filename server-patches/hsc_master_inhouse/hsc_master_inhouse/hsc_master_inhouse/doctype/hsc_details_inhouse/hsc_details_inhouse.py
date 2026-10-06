# Copyright (c) 2025, Dux Digitech and contributors
# For license information, please see license.txt




# import frappe
# from frappe.model.document import Document

# class HSCDetailsInhouse(Document):

#     def after_insert(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")
#             stock_entry.from_warehouse = "Rites - JEWIPL"

#             for row in self.table_hqlm:

#                 # skip empty rows
#                 if not row.item_name or not row.quantity:
#                     continue

#                 stock_entry.append("items", {
#                     "item_code": row.item_name,   # ✅ direct use (THIS IS KEY 🔥)
#                     "qty": row.quantity,
#                     "uom": row.item_uom,
#                     "s_warehouse": "Rites - JEWIPL"
#                 })

#             if not stock_entry.items:
#                 frappe.throw("No items found in HSC table")

#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
#             frappe.throw(str(e))







# MAIN code he ye 30 march 2026 ka 

# import frappe
# from frappe.model.document import Document

# class HSCDetailsInhouse(Document):

#     def after_insert(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")
#             stock_entry.from_warehouse = "Rites - JEWIPL"

#             for row in self.table_hqlm:

#                 # skip empty rows
#                 if not row.item_name or not row.quantity:
#                     continue

#                 stock_entry.append("items", {
#                     "item_code": row.item_name,   # ✅ direct use (THIS IS KEY 🔥)
#                     "qty": row.quantity,
#                     "uom": row.item_uom
#                     # "s_warehouse": "Rites - JEWIPL"
#                 })

#             if not stock_entry.items:
#                 frappe.throw("No items found in HSC table")

#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
#             frappe.throw(str(e))





# main code he ye last ka 

# import frappe
# from frappe.model.document import Document

# class HSCDetailsInhouse(Document):

#     def after_insert(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")

#             # ✅ Contractor ke basis pe warehouse
#             warehouse = f"{self.hdi_contractor_name} - JEWIPL"
#             stock_entry.from_warehouse = warehouse

#             for row in self.table_hqlm:

#                 if not row.item_name or not row.quantity:
#                     continue

#                 stock_entry.append("items", {
#                     "item_code": row.item_name,
#                     "qty": row.quantity,
#                     "uom": row.item_uom,
#                     #  "s_warehouse": warehouse,   # ✅ dynamic
#                     "allow_zero_valuation_rate": 1
#                 })

#             if not stock_entry.items:
#                 frappe.throw("No items found in HSC table")

#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
#             frappe.throw(str(e))








# import frappe
# from frappe.model.document import Document

# class HSCDetailsInhouse(Document):

#     def after_insert(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")

#             # ✅ Contractor ke basis pe warehouse
#             warehouse = f"{self.hdi_contractor_name} - JEWIPL"
#             stock_entry.from_warehouse = warehouse

#             for row in self.table_hqlm:

#                 if not row.item_name or not row.quantity:
#                     continue

#                 stock_entry.append("items", {
#                     "item_code": row.item_name,
#                     "qty": row.quantity,
#                     "uom": row.item_uom,
#                     #  "s_warehouse": warehouse,   # ✅ dynamic
#                     "allow_zero_valuation_rate": 1
#                 })

#             if not stock_entry.items:
#                 frappe.throw("No items found in HSC table")

#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()
#             self.material_issue = stock_entry.name
#             self.db_update()

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
#             frappe.throw(str(e))


# import frappe
# from frappe.model.document import Document

# class HSCDetailsInhouse(Document):

#     def after_insert(self):
#         self.create_material_issue()

#     def create_material_issue(self):
#         try:
#             stock_entry = frappe.new_doc("Stock Entry")
#             stock_entry.stock_entry_type = "Material Issue"
#             stock_entry.company = frappe.defaults.get_user_default("Company")
#             stock_entry.custom_hsc_reference = self.name

#             for item_code, qty in [
#                 ("Water Meter", self.water_meter),
#                 ("FTA - L", self.ftal),
#                 ("DCE", self.dce),
#                 ("Ball Valve", self.ball_valve),
#                 ("Brass Ferrule", self.brass_ferrule),
#                 ("FTA", self.fta),
#             ]:
#                 if qty and qty > 0:
#                     stock_entry.append("items", {
#                         "item_code": item_code,
#                         "qty": qty,
#                         warehouse = self.hdi_contractor_name + " - " + company_abbr,
#                         "allow_zero_valuation_rate": 1
#                     })

#             # ✅ Saddle Size Logic
#             if self.saddle_size:
#                 item_name = f"Saddle Size {self.saddle_size}"
#                 stock_entry.append("items", {
#                     "item_code": item_name,
#                     "qty": 1,
#                     "s_warehouse": self.hdi_contractor_name + " - WH",
#                     "allow_zero_valuation_rate": 1
#                 })

#             if not stock_entry.items:
#                 frappe.throw("No items found")

#             stock_entry.insert(ignore_permissions=True)
#             stock_entry.submit()

#             self.material_issue = stock_entry.name
#             self.db_update()

#         except Exception as e:
#             frappe.log_error(frappe.get_traceback(), "Material Issue Error")
# #             frappe.throw(str(e))


# # //doctype cancel code
# def on_cancel(self):
#     if self.material_issue:
#         try:
#             mi = frappe.get_doc("Stock Entry", self.material_issue)

#             if mi.docstatus == 1:  # submitted
#                 mi.cancel()

#         except Exception:
#             frappe.log_error(frappe.get_traceback(), "HSC Cancel Sync Error")



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

class HSCDetailsInhouse(Document):

    def after_insert(self):
        # sites that pin hsc_company post the Material Issue on submit only, never on save
        if not is_hsc_material_issue_enabled() or self.flags.get("skip_material_issue_on_save") or frappe.conf.get("hsc_company"):
            return
        self.create_material_issue()

    def before_submit(self):
        if is_hsc_material_issue_enabled() and not self.material_issue:
            self.create_material_issue()

    def create_material_issue(self):
        if not is_hsc_material_issue_enabled():
            return
        try:
            company = frappe.conf.get("hsc_company") or self.company or frappe.defaults.get_user_default("Company")
            if not company:
                frappe.throw("Company is required to create Material Issue")

            if not self.hdi_contractor_name:
                frappe.throw("Contractor is required to create Material Issue")

            company_abbr = frappe.get_cached_value("Company", company, "abbr")
            goods_in_transit = f"Goods In Transit - {company_abbr}"
            if frappe.conf.get("hsc_company"):
                # sites that pin hsc_company issue straight from the contractor's own warehouse
                warehouse = get_contractor_named_warehouse(self.hdi_contractor_name, company_abbr)
                if not warehouse:
                    frappe.throw(f"Contractor warehouse not found for {self.hdi_contractor_name} - open the contractor in HSC Masters and save it once to create the warehouse.")
            else:
                warehouse = self.store or (
                    goods_in_transit if frappe.db.exists("Warehouse", goods_in_transit) else None
                )
                warehouse = warehouse or get_or_create_contractor_warehouse(self.hdi_contractor_name, company)
            if not frappe.db.exists("Warehouse", warehouse):
                frappe.throw(f"Source Warehouse {warehouse} not found")

            stock_entry = frappe.new_doc("Stock Entry")
            stock_entry.stock_entry_type = "Material Issue"
            stock_entry.company = company
            if frappe.get_meta("Stock Entry").has_field("custom_hsc_reference"):
                stock_entry.custom_hsc_reference = self.name

            for item_code, qty in [
                ("Water Meter", self.water_meter),
                ("FTA - L", self.ftal),
                ("DCE", self.dce),
                ("Ball Valve", self.ball_valve),
                ("Brass Ferrule", self.brass_ferrule),
                ("FTA", self.fta),
            ]:
                if qty and qty > 0:
                    stock_entry.append("items", {
                        "item_code": item_code,
                        "qty": qty,
                        "s_warehouse": warehouse,
                        "allow_zero_valuation_rate": 1
                    })

            if self.saddle_size:
                item_name = f"Saddle Size {self.saddle_size}"
                stock_entry.append("items", {
                    "item_code": item_name,
                    "qty": 1,
                    "s_warehouse": warehouse,
                    "allow_zero_valuation_rate": 1
                })

            # sites that pin hsc_company also issue the MDPE pipe laid for the connection
            if frappe.conf.get("hsc_company") and flt(self.get("mdpe_pipe_mtr")) > 0:
                stock_entry.append("items", {
                    "item_code": "MDPE Pipe (mtr)",
                    "qty": flt(self.mdpe_pipe_mtr),
                    "s_warehouse": warehouse,
                    "allow_zero_valuation_rate": 1
                })

            if not stock_entry.items:
                frappe.throw("No items found")

            stock_entry.insert(ignore_permissions=True)
            stock_entry.submit()

            self.material_issue = stock_entry.name
            self.db_update()

        except Exception as e:
            frappe.log_error(frappe.get_traceback(), "Material Issue Error")
            frappe.throw(str(e))

    def on_cancel(self):
        if self.material_issue:
            try:
                mi = frappe.get_doc("Stock Entry", self.material_issue)
                if mi.docstatus == 1:
                    mi.cancel()
            except Exception:
                frappe.log_error(frappe.get_traceback(), "HSC Cancel Sync Error")
