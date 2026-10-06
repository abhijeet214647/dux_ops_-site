# Copyright (c) 2026, Dux Digitech and contributors
# For license information, please see license.txt

"""DUX Ops Suite — Home overview per app (value, today, drafts, needs-attention, recent activity).

Link values are always sent as display names, never record IDs.
"""

import frappe
from frappe.utils import flt, get_first_day, today

from dux_portal.dux_portal.page.dux_ops_suite.dux_ops_suite import _allowed_apps


def _count(doctype, filters=None):
    return len(frappe.get_list(doctype, filters=filters or {}, pluck="name", limit_page_length=0))


def _st(docstatus, draft="Draft", done="Submitted"):
    return [done, "ok"] if docstatus == 1 else ["Cancelled", "err"] if docstatus == 2 else [draft, ""]


def _home_hscnp():
    dt = "HSC Inhouse NP-ll"
    rows = frappe.get_list(dt, filters={"docstatus": ["<", 2]}, fields=["name", "docstatus", "date", "zone_name", "village_name", "house_photo", "connection_photo", "aadhar_photo", "samagra_photo"], limit_page_length=0, order_by="modified desc")
    missing = [d for d in rows if d.docstatus == 0 and not all([d.house_photo, d.connection_photo, d.aadhar_photo, d.samagra_photo])]
    return {
        "value": len(rows), "label": "connections",
        "today": sum(1 for d in rows if str(d.date) == today()), "drafts": sum(1 for d in rows if d.docstatus == 0),
        "attention": [{"title": d.name, "sub": "Draft · photos missing", "doc": "conn", "name": d.name, "tag": "Photos missing"} for d in missing[:5]], "attention_count": len(missing),
        "recent": [{"title": d.name, "sub": f"{d.village_name or ''} · {d.zone_name or ''}", "date": str(d.date or ""), "status": _st(d.docstatus), "doc": "conn", "name": d.name} for d in rows[:5]],
    }


def _home_pour():
    rows = frappe.get_list("Pour Card", filters={"docstatus": ["<", 2]}, fields=["name", "docstatus", "from_junction", "to_junction", "component", "townproject", "modified"], limit_page_length=0, order_by="modified desc")
    saved = [d for d in rows if d.docstatus == 0]
    return {
        "value": len(rows), "label": "pour cards",
        "today": sum(1 for d in rows if str(d.modified)[:10] == today()), "drafts": len(saved),
        "attention": [{"title": d.name, "sub": f"Saved · {d.from_junction or ''} → {d.to_junction or ''} · not locked", "doc": "card", "name": d.name, "tag": "Lock pending"} for d in saved[:5]], "attention_count": len(saved),
        "recent": [{"title": d.name, "sub": f"{d.component or d.townproject or ''} · {d.from_junction or ''} → {d.to_junction or ''}", "date": str(d.modified)[:10], "status": _st(d.docstatus, "Saved", "Lock Entry"), "doc": "card", "name": d.name} for d in rows[:5]],
    }


def _home_peb():
    ms = frappe.get_list("PEB FT Member", fields=["name", "project", "member_code", "member_qty", "member_weight_kg", "cut_qty", "fit_qty", "weld_qty", "paint_qty"], limit_page_length=0)
    mt = sum(flt(m.member_weight_kg) * flt(m.member_qty) for m in ms) / 1000
    waiting = [m for m in ms if flt(m.cut_qty) > flt(m.fit_qty) or flt(m.fit_qty) > flt(m.weld_qty) or flt(m.weld_qty) > flt(m.paint_qty)]
    logs = frappe.db.sql(
        """select l.stage, l.date, l.qty, l.unit, m.member_code, m.project
        from `tabPEB FT Progress Log` l join `tabPEB FT Member` m on m.name = l.parent
        order by l.date desc, l.creation desc limit 5""",
        as_dict=True,
    )
    nxt = lambda m: "Fitting" if flt(m.cut_qty) > flt(m.fit_qty) else "Welding" if flt(m.fit_qty) > flt(m.weld_qty) else "Painting"
    return {
        "value": round(mt, 1), "label": "MT in BOQ",
        "today": sum(1 for l in logs if str(l.date) == today()), "drafts": 0,
        "attention": [{"title": f"{m.member_code} · {m.project}", "sub": f"waiting for {nxt(m).lower()}", "screen": "fab", "tag": f"{nxt(m)} due", "tone": "iris"} for m in waiting[:4]], "attention_count": len(waiting),
        "recent": [{"title": f"{l.member_code} · {l.stage}", "sub": f"{l.project} · {flt(l.qty):g} {l.unit or ''}", "date": str(l.date or ""), "status": ["Logged", "ok"], "screen": "fab"} for l in logs],
    }


def _home_concrete():
    rows = frappe.get_list("Concrete Entry", filters={"docstatus": ["<", 2]}, fields=["name", "docstatus", "date", "concrete_grade", "quantity_of_concrete"], limit_page_length=0, order_by="modified desc")
    drafts = [r for r in rows if r.docstatus == 0]
    return {
        "value": round(sum(flt(r.quantity_of_concrete) for r in rows if r.docstatus == 1), 1), "label": "m³ poured",
        "today": sum(1 for r in rows if str(r.date) == today()), "drafts": len(drafts),
        "attention": [{"title": r.name, "sub": f"{r.concrete_grade} · {flt(r.quantity_of_concrete):g} m³ · draft, stock not issued", "doc": "ce", "name": r.name, "tag": "Submit pending"} for r in drafts[:4]], "attention_count": len(drafts),
        "recent": [{"title": f"{r.concrete_grade} · {flt(r.quantity_of_concrete):g} m³", "sub": r.name, "date": str(r.date or ""), "status": _st(r.docstatus), "doc": "ce", "name": r.name} for r in rows[:5]],
    }


def _home_fuelstock():
    start = str(get_first_day(today()))
    rows = frappe.get_list("Fuel Distribution", filters={"docstatus": 1, "fd_date": [">=", start]}, fields=["name", "fd_date", "issued_quantity_ltr", "fd_fuel_type", "fd_vehicle_name"], limit_page_length=0, order_by="fd_date desc, modified desc")
    vehicles = {v.name: v.vehicle_display_name for v in frappe.get_all("Vehicle Details", filters={"name": ["in", [r.fd_vehicle_name for r in rows[:5] if r.fd_vehicle_name] or ["-"]]}, fields=["name", "vehicle_display_name"])}
    return {
        "value": round(sum(flt(r.issued_quantity_ltr) for r in rows)), "label": "L issued this month",
        "today": sum(1 for r in rows if str(r.fd_date) == today()), "drafts": 0,
        "attention": [], "attention_count": 0,
        "recent": [{"title": f"{r.name} · {flt(r.issued_quantity_ltr):g} L {r.fd_fuel_type or ''}", "sub": vehicles.get(r.fd_vehicle_name) or "Vehicle", "date": str(r.fd_date or ""), "status": ["Submitted", "ok"], "doc": "dist", "name": r.name} for r in rows[:5]],
    }


def _home_hscin():
    reps = frappe.get_list("Inhouse HSC Repairing", filters={"docstatus": 0}, fields=["name", "hsc_reference"], limit_page_length=50, order_by="modified desc")
    recent = frappe.get_list("HSC Details Inhouse", fields=["name", "docstatus", "select_date", "hdi_house_owner_name"], limit_page_length=5, order_by="modified desc")
    # link fields show the consumer, never the HSC record ID
    refs = list({r.hsc_reference for r in reps[:3] if r.hsc_reference})
    consumer = dict(frappe.get_all("HSC Details Inhouse", filters={"name": ["in", refs]}, fields=["name", "hdi_house_owner_name"], as_list=True)) if refs else {}
    return {
        "value": _count("HSC Details Inhouse", {"docstatus": ["<", 2]}), "label": "installations",
        "today": _count("HSC Details Inhouse", {"select_date": today()}), "drafts": _count("HSC Details Inhouse", {"docstatus": 0}),
        "attention": [{"title": r.name.strip(), "sub": f"Draft repair · {consumer.get(r.hsc_reference) or 'HSC connection'}", "doc": "rep", "name": r.name, "tag": "Draft repair"} for r in reps[:3]], "attention_count": len(reps),
        "recent": [{"title": r.hdi_house_owner_name or r.name, "sub": r.name, "date": str(r.select_date or ""), "status": _st(r.docstatus), "doc": "inst", "name": r.name} for r in recent],
    }


def _home_maint():
    since = str(frappe.utils.add_days(today(), -30))
    rows = frappe.get_list("Maintenance Entry", filters={"date": [">=", since]}, fields=["name", "date", "vehicle", "service_type", "total_repairing_amount"], limit_page_length=0, order_by="date desc, modified desc")
    return {
        "value": len(rows), "label": "entries in 30 days",
        "today": sum(1 for r in rows if str(r.date) == today()), "drafts": 0,
        "attention": [], "attention_count": 0,
        "recent": [{"title": f"{r.vehicle or ''} · {r.service_type or ''}", "sub": f"{r.name} · ₹{flt(r.total_repairing_amount):,.0f}", "date": str(r.date or ""), "status": ["Saved", ""], "doc": "entry", "name": r.name} for r in rows[:5]],
    }


def _home_fuelin(include_distribution=False):
    """Fuel is ONE suite app: pump purchases (Fuel for Stock) plus, for distributors, store issues (Fuel Distribution)."""
    start = str(get_first_day(today()))
    fs = frappe.get_list("Fuel for Stock", filters={"docstatus": 1, "date": [">=", start], "fuel_entry_type": ["in", ["Drum", "Vehicle"]]}, fields=["name", "date", "fuel_entry_type", "quantity", "types_of_fuel", "amount"], limit_page_length=0, order_by="date desc, modified desc")
    names = [f.name for f in fs]
    pis = []
    if names and frappe.get_meta("Purchase Invoice").has_field("custom_fuel_stock_ref"):
        pis = frappe.get_all("Purchase Invoice", filters={"docstatus": 0, "custom_fuel_stock_ref": ["in", names]}, fields=["name", "supplier", "grand_total", "custom_fuel_stock_ref"], order_by="posting_date desc")
    out = {
        "value": round(sum(flt(f.quantity) for f in fs)), "label": "L inward this month",
        "today": sum(1 for f in fs if str(f.date) == today()), "drafts": 0,
        "attention": [{"title": f"{p.supplier} · ₹{flt(p.grand_total):,.0f}", "sub": "Fuel purchase invoice · waiting for Accounts", "doc": "inward", "name": p.custom_fuel_stock_ref, "tag": "Approval pending"} for p in pis[:5]], "attention_count": len(pis),
        "recent": [{"title": f"{f.name} · {flt(f.quantity):g} L {f.types_of_fuel or ''}", "sub": ("Fuel inward" if f.fuel_entry_type == "Drum" else "Direct distribution") + f" · ₹{flt(f.amount):,.0f}", "date": str(f.date or ""), "status": ["Submitted", "ok"], "doc": "inward", "name": f.name} for f in fs[:5]],
    }
    if include_distribution:
        dist = _home_fuelstock()
        out["today"] += dist["today"]
        out["recent"] = sorted(out["recent"] + dist["recent"], key=lambda x: x["date"], reverse=True)[:5]
    return out


def _home_stock():
    from dux_portal.dux_portal.page.dux_ops_suite import suite_stock

    return suite_stock.home()


HOME = {"hscnp": _home_hscnp, "pour": _home_pour, "peb": _home_peb, "concrete": _home_concrete, "fuelstock": _home_fuelstock, "hscin": _home_hscin, "maint": _home_maint, "fuelin": _home_fuelin, "stock": _home_stock}


@frappe.whitelist()
def get_suite_home():
    out = {}
    allowed = _allowed_apps()
    for key in allowed:
        if key == "fuelstock":  # merged into the single "fuelin" Fuel app
            continue
        try:
            out[key] = _home_fuelin("fuelstock" in allowed) if key == "fuelin" else HOME[key]()
        except Exception:
            frappe.clear_messages()
            out[key] = {"value": "—", "label": "", "today": 0, "drafts": 0, "attention": [], "attention_count": 0, "recent": []}
    return out
