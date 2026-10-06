# Copyright (c) 2026, Dux Digitech and contributors
# For license information, please see license.txt

"""DUX Ops Suite — Stock: receive material into a store, give it to a contractor, issue it, and
see live balances and movements.

Every save builds a real ERPNext Stock Entry draft and submit runs ERPNext's own stock rules
(negative stock, valuation, warehouse-company match). The field apps (HSC, Pour Card, Concrete,
PEB) post their own Material Issues on submit; they show up here with their source.
Link values go out as names, never record IDs.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, nowdate, today

PURPOSES = ("Material Receipt", "Material Transfer", "Material Issue")

# documents that post a Stock Entry, so the list can say where an entry came from
SOURCES = (
    ("HSC Details Inhouse", "material_issue", "HSC Inhouse"),
    ("Inhouse HSC Repairing", "material_issue", "HSC repair"),
    ("HSC Inhouse NP-ll", "material_issue", "HSC NP-II"),
    ("Pour Card", "material_issue", "Pour Card"),
    ("Pour Card Town", "material_issue", "Pour Card Town"),
    ("Concrete Entry", "material_issue", "Concrete"),
)


def _company():
    return (
        frappe.conf.get("ops_company")
        or frappe.conf.get("hsc_company")
        or frappe.defaults.get_user_default("Company")
        or frappe.defaults.get_global_default("company")
    )


def _contractor_warehouses():
    """Warehouse names that belong to a contractor ("<contractor> - <abbr>")."""
    abbrs = {c.name: c.abbr for c in frappe.get_all("Company", fields=["name", "abbr"])}
    labels = set()
    if frappe.db.exists("DocType", "Contractor at Project"):
        meta = frappe.get_meta("Contractor at Project")
        fields = ["name"] + [f for f in ("contractor", "contractor_name") if meta.has_field(f)]
        for r in frappe.get_all("Contractor at Project", fields=fields, limit_page_length=0):
            labels.update(v for v in r.values() if v)
    if frappe.db.exists("DocType", "Contractor at Site"):
        labels.update(frappe.get_all("Contractor at Site", pluck="name", limit_page_length=0))
    return {f"{label} - {abbr}" for label in labels for abbr in abbrs.values() if abbr}


def _warehouses():
    contractor = _contractor_warehouses()
    rows = frappe.get_all("Warehouse", filters={"is_group": 0, "disabled": 0},
                          fields=["name", "company", "parent_warehouse"], order_by="name", limit_page_length=0)
    for r in rows:
        r["kind"] = "Contractor" if r.name in contractor else "Store"
    return rows


def _sources(names):
    out = {}
    if not names:
        return out
    for doctype, field, label in SOURCES:
        try:
            if not frappe.db.exists("DocType", doctype) or not frappe.get_meta(doctype).has_field(field):
                continue
            for r in frappe.get_all(doctype, filters={field: ["in", names]}, fields=["name", field]):
                out[r[field]] = f"{label} · {r.name}"
        except Exception:
            frappe.clear_messages()
    if frappe.db.exists("DocType", "PEB FT Progress Log"):
        for r in frappe.db.sql(
            """select l.stock_entry, l.stage, m.member_code from `tabPEB FT Progress Log` l
            left join `tabPEB FT Member` m on m.name = l.parent where l.stock_entry in %(n)s""",
            {"n": tuple(names)}, as_dict=True,
        ):
            out[r.stock_entry] = f"PEB {r.stage} · {r.member_code or ''}".strip()
    return out


def _check(ptype="read"):
    if not frappe.has_permission("Stock Entry", ptype):
        frappe.throw(_("You are not permitted to {0} Stock Entries.").format(ptype), frappe.PermissionError)


@frappe.whitelist()
def get_stock_boot():
    _check("read")
    items = frappe.get_all("Item", filters={"is_stock_item": 1, "disabled": 0, "has_variants": 0},
                           fields=["name", "item_name", "stock_uom", "item_group"], order_by="item_group, name",
                           limit_page_length=0)
    return {
        "company": _company(),
        "companies": frappe.get_all("Company", fields=["name", "abbr"], order_by="name"),
        "warehouses": _warehouses(),
        "items": items,
        "can_create": bool(frappe.has_permission("Stock Entry", "create")),
        "can_submit": bool(frappe.has_permission("Stock Entry", "submit")),
    }


@frappe.whitelist()
def list_entries(limit=300):
    _check("read")
    rows = frappe.get_list(
        "Stock Entry",
        filters={"stock_entry_type": ["in", PURPOSES]},
        fields=["name", "stock_entry_type", "posting_date", "from_warehouse", "to_warehouse", "company",
                "docstatus", "remarks", "modified"],
        order_by="posting_date desc, modified desc",
        limit_page_length=cint(limit) or 300,
    )
    names = [r.name for r in rows]
    if names:
        agg = {r.parent: r for r in frappe.db.sql(
            """select parent, count(*) n, sum(coalesce(amount, basic_amount, 0)) amt,
            min(s_warehouse) s_wh, min(t_warehouse) t_wh from `tabStock Entry Detail`
            where parent in %(n)s group by parent""", {"n": tuple(names)}, as_dict=True)}
        src = _sources(names)
        for r in rows:
            a = agg.get(r.name) or {}
            r["item_count"] = cint(a.get("n"))
            r["amount"] = flt(a.get("amt"))
            r["from_warehouse"] = r.from_warehouse or a.get("s_wh")
            r["to_warehouse"] = r.to_warehouse or a.get("t_wh")
            r["source"] = src.get(r.name) or "Stock app"
    return rows


@frappe.whitelist()
def get_entry(name):
    doc = frappe.get_doc("Stock Entry", name)
    doc.check_permission("read")
    return {
        "name": doc.name, "docstatus": doc.docstatus, "purpose": doc.stock_entry_type, "company": doc.company,
        "posting_date": str(doc.posting_date), "from_warehouse": doc.from_warehouse, "to_warehouse": doc.to_warehouse,
        "remarks": doc.remarks, "source": _sources([doc.name]).get(doc.name) or "Stock app",
        "items": [{"item_code": d.item_code, "item_name": d.item_name, "qty": d.qty, "uom": d.uom,
                   "basic_rate": d.basic_rate, "amount": d.amount, "s_warehouse": d.s_warehouse,
                   "t_warehouse": d.t_warehouse} for d in doc.items],
    }


@frappe.whitelist()
def save_entry(data):
    """Create or update a draft Material Receipt / Transfer / Issue."""
    d = frappe._dict(json.loads(data) if isinstance(data, str) else data)
    purpose = d.get("purpose")
    if purpose not in PURPOSES:
        frappe.throw(_("Choose what this entry does: receive, transfer or issue."))
    rows = [frappe._dict(r) for r in (d.get("items") or []) if r.get("item_code") and flt(r.get("qty")) > 0]
    if not rows:
        frappe.throw(_("Add at least one item with a quantity above 0."))
    src = d.get("from_warehouse") if purpose != "Material Receipt" else None
    tgt = d.get("to_warehouse") if purpose != "Material Issue" else None
    if purpose != "Material Receipt" and not src:
        frappe.throw(_("Choose the warehouse the material leaves from."))
    if purpose != "Material Issue" and not tgt:
        frappe.throw(_("Choose the warehouse the material goes into."))
    if src and tgt and src == tgt:
        frappe.throw(_("Source and target warehouse must differ."))
    if purpose == "Material Receipt":
        missing = [r.item_code for r in rows if flt(r.get("basic_rate")) <= 0]
        if missing:
            frappe.throw(_("Enter the rate for: {0}").format(", ".join(missing)))

    if d.get("name") and frappe.db.exists("Stock Entry", d.name):
        se = frappe.get_doc("Stock Entry", d.name)
        if cint(se.docstatus) != 0:
            frappe.throw(_("This entry is already submitted and can no longer be edited."))
        se.check_permission("write")
    else:
        _check("create")
        se = frappe.new_doc("Stock Entry")
    se.stock_entry_type = purpose
    se.purpose = purpose
    se.company = d.get("company") or _company()
    se.posting_date = d.get("posting_date") or nowdate()
    if se.posting_date != nowdate():
        se.set_posting_time = 1
    se.from_warehouse = src
    se.to_warehouse = tgt
    se.remarks = d.get("remarks")
    se.set("items", [])
    for r in rows:
        row = {"item_code": r.item_code, "qty": flt(r.qty), "s_warehouse": src, "t_warehouse": tgt}
        if purpose == "Material Receipt":
            row.update({"basic_rate": flt(r.basic_rate), "set_basic_rate_manually": 1})
        se.append("items", row)
    se.save()
    return {"name": se.name, "docstatus": se.docstatus}


@frappe.whitelist()
def submit_entry(name):
    se = frappe.get_doc("Stock Entry", name)
    se.check_permission("submit")
    if cint(se.docstatus) == 1:
        return {"name": se.name, "docstatus": 1, "skipped": True}
    se.submit()
    return {"name": se.name, "docstatus": se.docstatus}


@frappe.whitelist()
def get_balance(company=None):
    _check("read")
    company = company or _company()
    whs = {w.name: w for w in _warehouses() if w.company == company}
    if not whs:
        return {"company": company, "rows": []}
    bins = frappe.get_all("Bin", filters={"warehouse": ["in", list(whs)], "actual_qty": ["!=", 0]},
                          fields=["warehouse", "item_code", "actual_qty", "valuation_rate", "stock_value"],
                          limit_page_length=0)
    items = {i.name: i for i in frappe.get_all("Item", filters={"name": ["in", list({b.item_code for b in bins}) or ["-"]]},
                                                 fields=["name", "item_name", "stock_uom"])}
    rows = []
    for b in bins:
        it = items.get(b.item_code) or {}
        rows.append({"warehouse": b.warehouse, "kind": whs[b.warehouse].kind, "item_code": b.item_code,
                     "item_name": it.get("item_name") or b.item_code, "uom": it.get("stock_uom"),
                     "qty": flt(b.actual_qty), "rate": flt(b.valuation_rate), "value": flt(b.stock_value)})
    rows.sort(key=lambda r: (r["kind"] != "Store", r["warehouse"], r["item_code"]))
    return {"company": company, "rows": rows}


@frappe.whitelist()
def get_ledger(company=None, limit=300):
    _check("read")
    company = company or _company()
    rows = frappe.get_all(
        "Stock Ledger Entry",
        filters={"company": company, "is_cancelled": 0},
        fields=["posting_date", "posting_time", "voucher_type", "voucher_no", "item_code", "warehouse",
                "actual_qty", "qty_after_transaction", "stock_value_difference"],
        order_by="posting_date desc, posting_time desc, creation desc",
        limit_page_length=cint(limit) or 300,
    )
    src = _sources(list({r.voucher_no for r in rows if r.voucher_type == "Stock Entry"}))
    for r in rows:
        r["posting_date"] = str(r.posting_date)
        r["source"] = src.get(r.voucher_no) or (r.voucher_type if r.voucher_type != "Stock Entry" else "Stock app")
    return rows


def home():
    """Home card for the Stock app (used by suite_home)."""
    start = str(get_first_day(today()))
    rows = frappe.get_list("Stock Entry", filters={"stock_entry_type": ["in", PURPOSES], "docstatus": ["<", 2]},
                           fields=["name", "stock_entry_type", "posting_date", "docstatus", "modified"],
                           order_by="modified desc", limit_page_length=200)
    src = _sources([r.name for r in rows[:5]])
    drafts = [r for r in rows if r.docstatus == 0]
    label = {"Material Receipt": "Received into store", "Material Transfer": "Material transfer", "Material Issue": "Material issue"}
    return {
        "value": sum(1 for r in rows if r.docstatus == 1 and str(r.posting_date) >= start), "label": "stock entries this month",
        "today": sum(1 for r in rows if str(r.posting_date) == today()), "drafts": len(drafts),
        "attention": [{"title": r.name, "sub": f"Draft · {label[r.stock_entry_type]} · not submitted", "doc": "se", "name": r.name, "tag": "Submit pending"} for r in drafts[:4]],
        "attention_count": len(drafts),
        "recent": [{"title": f"{label[r.stock_entry_type]} · {r.name}", "sub": src.get(r.name) or "Stock app", "date": str(r.posting_date),
                    "status": ["Submitted", "ok"] if r.docstatus == 1 else ["Draft", ""], "doc": "se", "name": r.name} for r in rows[:5]],
    }
