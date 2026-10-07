# Copyright (c) 2026, Dux Digitech and contributors
# For license information, please see license.txt

"""DUX Ops Suite — one desk page (/desk/dux-ops-suite) and one mobile page (/ops/m) for 8 field apps.

This module only answers "who can use which app", the shared masters and the Home
overview. Every entry, save, submit and report goes through each app's OWN
whitelisted API, so the business rules (stock entries, approvals, validations,
emails) stay in those apps.
"""

import frappe
from frappe.utils import cint, today

# suite app key -> the original desk page whose roles decide access
APP_PAGES = {
    "hscnp": "hsc-np-ii",
    "pour": "pour-card-report",
    "peb": "peb-fabrication-tracker",
    "concrete": "concrete-master",
    "fuelstock": "fuel-inward-direct-distribution",
    "hscin": "dux-hsc-inhouse",
    "maint": "dux-maintenance-master",
    "fuelin": "fuel-inward-direct-distribution",
}
# apps whose API is stricter than their page: the roles the API itself accepts
APP_ROLES = {
    "fuelin": {"System Manager", "Inward & Fuel Distributor", "Fuel Inward User"},
    "fuelstock": {"System Manager", "Inward & Fuel Distributor"},
}
# apps whose API needs read on a DocType (page has no roles)
APP_DOCTYPE = {"hscnp": "HSC Inhouse NP-ll"}


def _allowed_apps():
    roles = set(frappe.get_roles())
    admin = frappe.session.user == "Administrator"
    allowed = []
    for key, page in APP_PAGES.items():
        try:
            if key in APP_ROLES and not admin and not (roles & APP_ROLES[key]):
                continue
            if key in APP_DOCTYPE and not frappe.has_permission(APP_DOCTYPE[key], "read"):
                continue
            if frappe.db.exists("Page", page) and frappe.get_doc("Page", page).is_permitted():
                allowed.append(key)
        except Exception:
            frappe.clear_messages()
    # opt-in per site: the Stock app (store receipts, transfers to contractors, balances)
    if frappe.conf.get("ops_stock_enabled") and frappe.has_permission("Stock Entry", "read"):
        allowed.append("stock")
    return allowed


def _contractors():
    label = (
        "coalesce(nullif(contractor, ''), nullif(contractor_name, ''), name)"
        if frappe.db.has_column("Contractor at Project", "contractor_name")
        else "coalesce(nullif(contractor, ''), name)"
    )
    return [
        [c.name, (c.label or "").strip(), c.townproject]
        for c in frappe.db.sql(
            f"select name, {label} as label, townproject from `tabContractor at Project` order by name", as_dict=True
        )
    ]


@frappe.whitelist()
def get_suite_boot():
    if frappe.session.user == "Guest":
        frappe.throw("Please log in.", frappe.AuthenticationError)
    roles = frappe.get_roles()
    return {
        "user": frappe.session.user,
        "full_name": frappe.utils.get_fullname(frappe.session.user),
        "role": next(
            (r for r in ("System Manager", "HSC Admin", "Inward & Fuel Distributor", "Accounts Manager", "Accounts User", "Pipe Laying User", "Vehicle Maintenance User", "HSC Inhouse Operational Access") if r in roles),
            "User",
        ),
        "roles": roles,
        "apps": _allowed_apps(),
        "company": frappe.conf.get("ops_company") or frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company"),
        "today": today(),
        # HSC entries submitted from the suite issue stock from the contractor warehouse (see hsc_master_inhouse)
        "hsc_suite_stock": bool(cint(frappe.conf.get("hsc_ops_suite_stock"))),
        "masters": {
            "companies": [[c.name, c.abbr] for c in frappe.get_all("Company", fields=["name", "abbr"], order_by="name asc")],
            "projects": frappe.get_all("Site Project", pluck="name", order_by="name asc"),
            "towns": [
                [t.name, t.town_name or "", t.project_name or "", t.display_name or ""]
                for t in frappe.get_all("Town At Project", fields=["name", "town_name", "project_name", "display_name"], order_by="display_name asc", limit_page_length=0)
            ],
            "contractors": _contractors(),
        },
    }
