"""
PEB Fabrication Tracker — backend API (v4 model).

v4 (member-level flow, single pipeline for every project):
  Stages: Cutting -> Fitting -> Welding -> Painting   (no Dispatch, no QC gates, no fab types)

  * BOQ is Member (C1, R1 ...) -> sub-parts (F1, F2, W ...). Each sub-part carries its raw
    material code + wastage % + per-member weight, all read from the uploaded sheet.
  * CUTTING is one entry per member: the user types how many members are being cut; the app
    consumes each sub-part's raw material for that many members
        raw_qty = sub_part_weight * member_count * (1 + wastage%)
    from the company raw store "Stores - JEW" (existing ERPNext stock, company-wide) as a
    Material Issue. Raw short / raw item missing -> clear error.
  * FITTING / WELDING / PAINTING are member-level counts only (no sub-parts, no raw). Each is
    validated against the previous stage's cumulative qty:  fit<=cut, weld<=fit, paint<=weld.
  * PAINTING posts the FINISHED MEMBER item (C1, R1 ...) BY WEIGHT (member_weight * count) into
    the project's Finished warehouse (project + company wise) as a Material Receipt.

  Warehouses: raw = one company store (Stores - JEW); finished = one per project.
  Items: raw plates (PL*-E250, group 'PEB Raw Material') + finished members (C1, R1 ..., group
  'PEB'). Sub-parts (F1, F2 ...) are BOQ descriptors only, never stock items.
"""
import re
import json
import frappe
from frappe import _
from frappe.utils import nowdate, flt, cint

PEB_DEFAULT_CO = "Jain Engineering Works"        # 147 default; override per-site via site_config "peb_company"
FINISHED_STORE = "Indore Palda"                  # physical store name (company abbr appended at runtime)


def _company():
    return frappe.conf.get("peb_company") or PEB_DEFAULT_CO


def _abbr():
    return frappe.get_cached_value("Company", _company(), "abbr") or "JEW"


def _raw_wh():
    return frappe.conf.get("peb_raw_warehouse") or ("Stores - " + _abbr())


def _finished_store_wh():
    return FINISHED_STORE + " - " + _abbr()


def _finished_store_cfg():
    """If site_config 'peb_finished_store' is set (e.g. 'Palda Factory - JEWPL'), finished members
    all go into that ONE store and the project is tracked on the stock entry (single-store mode).
    If unset, the per-project 'Indore Palda' group model is used (147 default — unchanged)."""
    return frappe.conf.get("peb_finished_store")


def _single_store():
    return bool(_finished_store_cfg())


def _finished_wh_name():
    """Resolved single-store warehouse name (abbr appended if the config omits it), else None."""
    cfg = _finished_store_cfg()
    if not cfg:
        return None
    return cfg if (" - " in cfg) else (cfg + " - " + _abbr())


def _root_wh():
    return "All Warehouses - " + _abbr()
STOCK_UOM = "Kg"
RAW_ITEM_GROUP = "PEB Raw Material"
MEMBER_ITEM_GROUP = "PEB Finished"      # finished member items (C1, R1 ...) live here
STAGES = ["Cutting", "Fitting", "Welding", "Painting"]
STAGE_QTY_FIELD = {"Cutting": "cut_qty", "Fitting": "fit_qty", "Welding": "weld_qty", "Painting": "paint_qty"}
STAGE_PREV_FIELD = {"Fitting": "cut_qty", "Welding": "fit_qty", "Painting": "weld_qty"}
STAGE_UNIT = {"Cutting": "pcs", "Fitting": "pcs", "Welding": "pcs", "Painting": "pcs"}  # member counts

RAW_MATERIALS = [
    {"code": "PL4-E250", "desc": "MS Plate 4mm - IS 2062 E250"},
    {"code": "PL5-E250", "desc": "MS Plate 5mm - IS 2062 E250"},
    {"code": "PL6-E250", "desc": "MS Plate 6mm - IS 2062 E250"},
    {"code": "PL8-E250", "desc": "MS Plate 8mm - IS 2062 E250"},
    {"code": "PL10-E250", "desc": "MS Plate 10mm - IS 2062 E250"},
    {"code": "PL12-E250", "desc": "MS Plate 12mm - IS 2062 E250"},
    {"code": "PL16-E250", "desc": "MS Plate 16mm - IS 2062 E250"},
    {"code": "PL20-E250", "desc": "MS Plate 20mm - IS 2062 E250"},
    {"code": "PL25-E250", "desc": "MS Plate 25mm - IS 2062 E250"},
    {"code": "BOLT-HSFG8.8", "desc": "HSFG Bolt & nut set 8.8 (bought finished)"},
]
TEAMS = ["Team Alpha", "Team Beta", "Team Gamma"]
TRANSPORTERS = ["Shree Road Carriers", "MP Logistics"]
MATERIALS = ["IS 2062 E250", "IS 2062 E350"]
GRADES = ["Fe 410 WA", "Fe 490 WB"]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _member_type(code):
    c = str(code).upper()
    if c.startswith("JB"):
        return "Jack Rafter"
    if c.startswith("JC"):
        return "Jack Column"
    if re.match(r"^R\d*[A-Z]?$", c):
        return "Rafter"
    if re.match(r"^C\d*[A-Z]?$", c):
        return "Column"
    if c.startswith("G"):
        return "Girder"
    return "Other"


def _inv_account():
    return frappe.get_cached_value("Company", _company(), "default_inventory_account")


def _ensure_wh_account(wh):
    if wh and frappe.db.get_value("Warehouse", wh, "account") != _inv_account():
        frappe.db.set_value("Warehouse", wh, "account", _inv_account())


def _ensure_finished_store():
    """The 'Indore Palda' store (group warehouse) that holds every project's finished members."""
    if not frappe.db.exists("Warehouse", _finished_store_wh()):
        root = _root_wh() if frappe.db.exists("Warehouse", _root_wh()) else None
        frappe.get_doc({"doctype": "Warehouse", "warehouse_name": FINISHED_STORE, "company": _company(),
                        "parent_warehouse": root, "is_group": 1}).insert(ignore_permissions=True)
    return _finished_store_wh()


def _ensure_finished_wh(proj):
    """Finished-goods warehouse for a project.
    Single-store mode (site_config peb_finished_store): every project's finished members go into
    that one leaf store (e.g. 'Palda Factory - JEWPL'); the project is tracked on the stock entry.
    Legacy mode (147): one Finished warehouse per project UNDER the 'Indore Palda' group store."""
    single = _finished_wh_name()
    if single:
        if not frappe.db.exists("Warehouse", single):
            frappe.throw(_("Configured finished store '{0}' does not exist on this site.").format(single))
        # don't touch the real warehouse's account: ERPNext falls back to the company default
        # inventory account at posting (same as the raw store, which also has account=None).
        if proj.get("finished_warehouse") != single:
            proj.finished_warehouse = single
            proj.save(ignore_permissions=True)
        return single
    store = _ensure_finished_store()
    base = (proj.project_name or "PEB")[:36].strip()
    wh_name = "%s Finished" % base
    full = wh_name + " - " + _abbr()
    if not frappe.db.exists("Warehouse", full):
        frappe.get_doc({"doctype": "Warehouse", "warehouse_name": wh_name, "company": _company(),
                        "parent_warehouse": store, "is_group": 0, "account": _inv_account()}).insert(ignore_permissions=True)
    else:
        _ensure_wh_account(full)
        if frappe.db.get_value("Warehouse", full, "parent_warehouse") != store:  # move under Indore Palda
            wdoc = frappe.get_doc("Warehouse", full)
            wdoc.parent_warehouse = store
            wdoc.save(ignore_permissions=True)
    if proj.get("finished_warehouse") != full:
        proj.finished_warehouse = full
        proj.save(ignore_permissions=True)
    return full


def _ensure_member_item(code, member_type=None, weight=None):
    """The finished member (C1, R1 ...) as an ERPNext Item, counted in Nos with a
    weight-per-unit so both count (Nos) and tonnage (Nos x weight) are available."""
    code = str(code or "").strip()
    if not code:
        return None
    if frappe.db.exists("Item", code):
        return code
    doc = {"doctype": "Item", "item_code": code,
           "item_name": "%s - %s" % (code, member_type or "Member"),
           "item_group": MEMBER_ITEM_GROUP, "stock_uom": "Nos", "is_stock_item": 1}
    if weight:
        doc["weight_per_unit"] = flt(weight)
        doc["weight_uom"] = STOCK_UOM
    fin_wh = _finished_wh_name()
    if fin_wh:  # single-store mode: the finished member defaults to the finished store (e.g. Palda Factory)
        doc["item_defaults"] = [{"company": _company(), "default_warehouse": fin_wh}]
    frappe.get_doc(doc).insert(ignore_permissions=True)
    return code


def _raw_onhand():
    """Company-wide raw stock (Bin) in the raw store, by item code."""
    rows = frappe.get_all("Bin", filters={"warehouse": _raw_wh()}, fields=["item_code", "actual_qty"])
    return {r.item_code: flt(r.actual_qty) for r in rows}


def _ensure_erp_project(name):
    """Ensure an ERPNext Project exists for this peb project so its name saves on the stock entry's
    Project link field. Returns the Project docname (to set on Stock Entry.project)."""
    name = (name or "").strip()
    if not name:
        return None
    existing = frappe.db.get_value("Project", {"project_name": name}, "name")
    if existing:
        return existing
    try:
        doc = frappe.get_doc({"doctype": "Project", "project_name": name, "company": _company()})
        doc.insert(ignore_permissions=True)
        return doc.name
    except Exception:
        return frappe.db.get_value("Project", {"project_name": name}, "name")


def _post_stock_entry(purpose, rows, remark=None, project=None, peb_project=None):
    d = {"doctype": "Stock Entry", "stock_entry_type": purpose, "company": _company(),
         "remarks": remark, "items": rows}
    if project:
        d["project"] = project
    if peb_project and frappe.get_meta("Stock Entry").has_field("custom_peb_project"):
        d["custom_peb_project"] = peb_project  # custom "PEB Project" link (only on sites that have the field)
    doc = frappe.get_doc(d)
    _mute = frappe.flags.mute_messages  # suppress ERPNext's "rate updated to zero" info popups (validation errors still raise)
    frappe.flags.mute_messages = True
    try:
        doc.insert(ignore_permissions=True)
        doc.submit()
    finally:
        frappe.flags.mute_messages = _mute
    return doc.name


def _member_weight(mdoc):
    """Weight of ONE member = sum of its sub-parts' weights."""
    return sum(flt(p.weight_kg) or (flt(p.unit_weight_kg) * flt(p.qty)) for p in mdoc.table_parts)


def _member_raw_need(mdoc, member_count):
    """Raw consumed to cut `member_count` members, grouped by raw code (with wastage)."""
    need = {}
    for p in mdoc.table_parts:
        code = (p.raw_material or "").strip()
        if not code:
            continue
        per_member = flt(p.weight_kg) or (flt(p.unit_weight_kg) * flt(p.qty))
        need[code] = need.get(code, 0) + per_member * flt(member_count) * (1 + flt(p.wastage_pct) / 100.0)
    return need


def _member_unit_cost(mdoc):
    """Raw cost of ONE finished member: raw kg (with wastage) x the raw plate's valuation at the raw store."""
    cost = 0.0
    for code, kg in _member_raw_need(mdoc, 1).items():
        rate = flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": _raw_wh()}, "valuation_rate")) \
            or flt(frappe.db.get_value("Item", code, "valuation_rate"))
        cost += kg * rate
    return round(cost, 2)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_fab_config():
    return {
        "stages": STAGES,
        "raw_materials": RAW_MATERIALS,
        "teams": TEAMS,
        "transporters": TRANSPORTERS,
        "materials": MATERIALS,
        "grades": GRADES,
        "raw_warehouse": _raw_wh(),
    }


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
@frappe.whitelist()
def list_projects():
    projects = frappe.get_all("PEB FT Project",
                              fields=["name", "project_name", "site", "status", "fabrication_started",
                                      "contracted_weight_mt", "uploaded_on", "creation"],
                              order_by="creation desc")
    if not projects:
        return []
    names = [p.name for p in projects]
    members = frappe.get_all("PEB FT Member", filters={"project": ["in", names]},
                             fields=["name", "project", "member_qty", "paint_qty", "member_weight_kg"])
    agg = {p.name: {"members": 0, "parts": 0, "weight": 0.0, "painted": 0.0, "target": 0.0} for p in projects}
    mids = [m.name for m in members]
    part_count = {}
    if mids:
        for r in frappe.get_all("PEB FT Part", filters={"parent": ["in", mids]}, fields=["parent"]):
            part_count[r.parent] = part_count.get(r.parent, 0) + 1
    for m in members:
        a = agg[m.project]
        a["members"] += 1
        a["parts"] += part_count.get(m.name, 0)
        a["weight"] += flt(m.member_weight_kg) * flt(m.member_qty or 1)
        a["painted"] += flt(m.paint_qty)
        a["target"] += flt(m.member_qty or 1)
    out = []
    for p in projects:
        a = agg[p.name]
        out.append({**p, **a, "tonnage": round(a["weight"] / 1000.0, 3)})
    return out


@frappe.whitelist()
def toggle_project_status(project):
    doc = frappe.get_doc("PEB FT Project", project)
    doc.status = "Closed" if doc.status == "Open" else "Open"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"status": doc.status}


@frappe.whitelist()
def list_open_projects_for_fabrication():
    return frappe.get_all("PEB FT Project", filters={"status": "Open"},
                          fields=["name", "project_name"], order_by="project_name asc")


# ---------------------------------------------------------------------------
# Project detail (members -> sub-parts + stage counts)
# ---------------------------------------------------------------------------
@frappe.whitelist()
def get_project_detail(project):
    # defensive: empty/unknown project (e.g. a clean site with 0 projects) -> empty result, no popup
    if not project or not frappe.db.exists("PEB FT Project", project):
        return {"project": None, "members": []}
    proj = frappe.get_doc("PEB FT Project", project)
    onhand = _raw_onhand()
    members = frappe.get_all("PEB FT Member", filters={"project": project},
                             fields=["name", "member_code", "member_type", "material", "grade"],
                             order_by="member_code asc")
    out_members = []
    for m in members:
        mdoc = frappe.get_doc("PEB FT Member", m.name)
        parts = [{
            "name": r.name, "item_code": r.item_code, "desc": r.part_desc, "qty": r.qty,
            "unit_weight_kg": r.unit_weight_kg, "weight_kg": r.weight_kg or (flt(r.unit_weight_kg) * flt(r.qty)),
            "length_m": r.length_m, "area_sqm": r.area_sqm, "density": r.density,
            "thickness_mm": flt(r.thickness_mm), "width_mm": flt(r.width_mm),
            "raw_material": r.raw_material, "wastage_pct": r.wastage_pct, "cut_qty": flt(r.cut_qty),
            "raw_onhand": flt(onhand.get(r.raw_material, 0)),
        } for r in mdoc.table_parts]
        log = [{"stage": r.stage, "date": str(r.date), "team": r.team, "qty": r.qty,
                "unit": r.unit, "remarks": r.remarks} for r in mdoc.table_log]
        out_members.append({
            "name": m.name, "member_code": m.member_code, "member_type": m.member_type,
            "material": m.material, "grade": m.grade,
            "member_qty": cint(mdoc.member_qty or 1), "member_weight_kg": round(_member_weight(mdoc), 2),
            "cut_qty": flt(mdoc.cut_qty), "fit_qty": flt(mdoc.fit_qty),
            "weld_qty": flt(mdoc.weld_qty), "paint_qty": flt(mdoc.paint_qty),
            "parts": parts, "log": log,
        })
    return {
        "project": {"name": proj.name, "project_name": proj.project_name, "status": proj.status,
                    "site": proj.site, "stages": STAGES, "raw_warehouse": _raw_wh(),
                    "uploaded_on": str(proj.uploaded_on or "")},
        "members": out_members,
    }


# ---------------------------------------------------------------------------
# Import BOQ — validates raw materials exist in ERPNext; returns per-row errors.
# `members`: [{code, type, material, grade, member_qty,
#              parts:[{item,desc,qty,unit_weight_kg,length_m,area_sqm,density,raw_material,wastage_pct, _row}]}]
# ---------------------------------------------------------------------------
@frappe.whitelist()
def import_boq(members, site_name=None, filename=None, preset_project=None):
    if isinstance(members, str):
        members = json.loads(members)
    if not members:
        frappe.throw(_("No members were parsed from that file."))

    # ---- validation pass: raw materials must exist as ERPNext Items ----
    errors = []
    raw_seen = {}
    for m in members:
        for p in (m.get("parts") or []):
            raw = str(p.get("raw_material") or p.get("rawMaterial") or "").strip()
            if not raw:
                errors.append({"row": p.get("_row"), "column": "Raw Material", "value": "",
                               "message": "Raw material is blank for %s / %s" % (m.get("code"), p.get("item"))})
                continue
            if raw not in raw_seen:
                raw_seen[raw] = frappe.db.exists("Item", raw)
            if not raw_seen[raw]:
                errors.append({"row": p.get("_row"), "column": "Raw Material", "value": raw,
                               "message": "Raw material '%s' is not an Item in ERPNext (%s / %s)" % (raw, m.get("code"), p.get("item"))})
    if errors:
        return {"ok": False, "errors": errors, "imported": 0}

    # ---- create / update the project ----
    if preset_project:
        proj = frappe.get_doc("PEB FT Project", preset_project)
        matched = True
    else:
        name = (site_name or "").strip() or _name_from_filename(filename)
        existing = frappe.db.get_value("PEB FT Project", {"project_name": name}, "name")
        if existing:
            proj = frappe.get_doc("PEB FT Project", existing)
            matched = True
        else:
            proj = frappe.get_doc({"doctype": "PEB FT Project", "project_name": name, "status": "Open"})
            proj.insert(ignore_permissions=True)
            matched = False
    _ensure_finished_wh(proj)

    new_members = updated_members = total_parts = 0
    for m in members:
        code = str(m.get("code") or "").strip()
        if not code:
            continue
        parts_payload = m.get("parts") or []
        total_parts += len(parts_payload)
        existing_name = frappe.db.get_value("PEB FT Member", {"project": proj.name, "member_code": code}, "name")
        if existing_name:
            mdoc = frappe.get_doc("PEB FT Member", existing_name)
            mdoc.set("table_parts", [])
            updated_members += 1
        else:
            mdoc = frappe.get_doc({"doctype": "PEB FT Member", "project": proj.name, "member_code": code})
            new_members += 1
        mdoc.member_type = _member_type(code)
        mdoc.material = m.get("material") or mdoc.material
        mdoc.grade = m.get("grade") or mdoc.grade
        mdoc.member_qty = cint(m.get("member_qty") or m.get("qty") or 1)
        for p in parts_payload:
            qty = flt(p.get("qty") or 1)
            unit_wt = flt(p.get("unit_weight_kg") or p.get("unitWt"))
            total_wt = flt(p.get("weight_kg")) or (unit_wt * qty)
            length_m = flt(p.get("length_m") or p.get("lengthM"))
            width_m = flt(p.get("width_m") or p.get("widthM"))
            thickness_mm = flt(p.get("thickness_mm") or p.get("thicknessMm"))
            mdoc.append("table_parts", {
                "item_code": str(p.get("item") or p.get("item_code") or "").strip(),
                "part_name": str(p.get("item") or "").strip(), "part_desc": p.get("desc"),
                "qty": qty, "unit_weight_kg": unit_wt, "weight_kg": total_wt,
                "length_m": length_m, "length_mm": round(length_m * 1000, 1),
                "width_mm": round(width_m * 1000, 1), "thickness_mm": thickness_mm,
                "area_sqm": flt(p.get("area_sqm") or p.get("areaSqm")),
                "density": flt(p.get("density") or 7850),
                "raw_material": str(p.get("raw_material") or p.get("rawMaterial") or "").strip(),
                "wastage_pct": flt(p.get("wastage_pct") or p.get("wastagePct")),
            })
        mdoc.member_weight_kg = round(_member_weight(mdoc), 2)
        mdoc.finished_item = _ensure_member_item(code, mdoc.member_type)
        mdoc.save(ignore_permissions=True)

    proj.uploaded_on = nowdate()
    proj.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "errors": [], "project": proj.project_name, "matched": matched,
            "members": len(members), "parts": total_parts,
            "new_members": new_members, "updated_members": updated_members}


def _name_from_filename(fname):
    n = re.sub(r"\.[^.]+$", "", str(fname or ""))
    n = re.sub(r"\([^)]*\)", "", n).strip()
    n = re.sub(r"^R\d+[-\s]*", "", n, flags=re.I)
    n = re.sub(r"weight\s*sheet", "", n, flags=re.I)
    n = re.sub(r"^[-_\s]+|[-_\s]+$", "", n)
    n = re.sub(r"[-_]+", " ", n).strip()
    return n or "New Site"


# ---------------------------------------------------------------------------
# Add progress — member-level.  Cutting consumes raw; Painting produces the finished member.
# ---------------------------------------------------------------------------
@frappe.whitelist()
def add_progress(member, stage, qty=0, date=None, team=None, remarks=None, sub_qtys=None):
    stage = (stage or "").strip()
    if stage not in STAGES:
        frappe.throw(_("Unknown stage: {0}").format(stage))
    qty = flt(qty)
    mdoc = frappe.get_doc("PEB FT Member", member)
    proj = frappe.get_doc("PEB FT Project", mdoc.project)

    cur_field = STAGE_QTY_FIELD[stage]
    stock_entry = None
    log_remarks = remarks
    if stage != "Cutting" and qty <= 0:
        frappe.throw(_("Enter how many members ({0}).").format(stage))

    if stage == "Cutting":
        # per-sub-part cutting: sub_qtys = {part_row_name: pieces_cut}
        if isinstance(sub_qtys, str):
            sub_qtys = json.loads(sub_qtys or "{}")
        sub_qtys = sub_qtys or {}
        parts_by = {p.name: p for p in mdoc.table_parts}
        inc, need = {}, {}
        for key, q in sub_qtys.items():
            q = flt(q)
            if q <= 0:
                continue
            p = parts_by.get(key)
            if not p:
                continue
            inc[key] = q
            code = (p.raw_material or "").strip()
            unit = flt(p.unit_weight_kg) or (flt(p.weight_kg) / max(1.0, flt(p.qty)))
            if code:
                need[code] = need.get(code, 0) + unit * q * (1 + flt(p.wastage_pct) / 100.0)
        if not inc:
            frappe.throw(_("Enter a cutting quantity for at least one sub-part."))
        onhand = _raw_onhand()
        for code, q in need.items():
            avail = flt(onhand.get(code, 0))
            if q > avail + 0.001:
                frappe.throw(_("Only {0} kg {1} in stock ({2}) — this cutting needs {3} kg.")
                             .format(round(avail, 1), code, _raw_wh(), round(q, 1)))
        rows = [{"item_code": code, "qty": round(q, 3), "uom": STOCK_UOM,
                 "s_warehouse": _raw_wh(), "allow_zero_valuation_rate": 1} for code, q in need.items() if q > 0]
        if rows:
            stock_entry = _post_stock_entry("Material Issue", rows,
                                            remark="PEB Cutting %s · Project: %s" % (mdoc.member_code, proj.project_name),
                                            project=_ensure_erp_project(proj.project_name),
                                            peb_project=proj.name)
        for key, q in inc.items():
            parts_by[key].cut_qty = flt(parts_by[key].cut_qty) + q
        # a member counts as "cut" (ready to fit) only when EVERY sub-part is cut in its per-member ratio
        comp = min(int(flt(p.cut_qty) / max(1.0, flt(p.qty))) for p in mdoc.table_parts) if mdoc.table_parts else 0
        mdoc.cut_qty = comp
        consumed_desc = " + ".join("%s kg %s" % (round(q, 1), c) for c, q in need.items()) or "no raw"
        pieces_desc = ", ".join("%s×%d" % (parts_by[k].item_code, int(v)) for k, v in inc.items())
        if not log_remarks:
            log_remarks = "Cut %s; consumed %s" % (pieces_desc, consumed_desc)
        msg = _("{0}: cut {1} — consumed {2}. Complete members ready to fit: {3}.").format(
            mdoc.member_code, pieces_desc, consumed_desc, comp)
        qty = sum(inc.values())  # log the total pieces cut in this entry
    else:
        prev_field = STAGE_PREV_FIELD[stage]
        prev_qty = flt(mdoc.get(prev_field))
        if flt(mdoc.get(cur_field)) + qty > prev_qty + 0.001:
            done = flt(mdoc.get(cur_field))
            frappe.throw(_("{0} can't exceed {1} qty — {2} already {3}, {4} available (you tried {5}).")
                         .format(stage, prev_field.replace("_qty", "").title(),
                                 stage.lower(), int(done), int(prev_qty - done), int(qty)))
        if stage == "Painting":
            fwh = _ensure_finished_wh(proj)
            mwt = _member_weight(mdoc)
            item = _ensure_member_item(mdoc.member_code, mdoc.member_type, mwt)
            wt = round(mwt * qty, 2)
            se_proj = _ensure_erp_project(proj.project_name)
            row = {"item_code": item, "qty": qty, "uom": "Nos", "t_warehouse": fwh,
                   "basic_rate": round(mwt * 50, 2), "allow_zero_valuation_rate": 1}
            if frappe.conf.get("peb_finished_valuation"):
                # sites that opt in value the finished member at the raw plate cost consumed to make it
                unit_cost = _member_unit_cost(mdoc)
                if unit_cost > 0:
                    row.update({"basic_rate": unit_cost, "allow_zero_valuation_rate": 0, "set_basic_rate_manually": 1})
            stock_entry = _post_stock_entry("Material Receipt", [row],
                remark="PEB Painted %s x%d · Project: %s" % (mdoc.member_code, int(qty), proj.project_name),
                project=se_proj, peb_project=proj.name)
            msg = _("{0}: painted {1} Nos ({2} kg) of finished {0} added to {3}.").format(
                mdoc.member_code, int(qty), wt, fwh)
        else:
            msg = _("{0}: {1} {2} recorded.").format(mdoc.member_code, stage.lower(), int(qty))

    if stage != "Cutting":  # Cutting already set cut_qty = complete-members above
        mdoc.set(cur_field, flt(mdoc.get(cur_field)) + qty)
    mdoc.append("table_log", {"part_name": mdoc.member_code, "item_code": mdoc.member_code, "stage": stage,
                              "date": date or nowdate(), "team": team, "qty": qty, "unit": "pcs",
                              "remarks": log_remarks, "stock_entry": stock_entry})
    mdoc.save(ignore_permissions=True)
    if not proj.fabrication_started:
        proj.fabrication_started = 1
        proj.save(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "stage": stage, "stock_entry": stock_entry, "msg": msg}


# ---------------------------------------------------------------------------
# Stock views
# ---------------------------------------------------------------------------
@frappe.whitelist()
def raw_availability():
    """Company-wide raw stock (existing ERPNext stock in the raw store)."""
    onhand = _raw_onhand()
    desc = {r["code"]: r["desc"] for r in RAW_MATERIALS}
    codes = sorted(set(list(onhand.keys()) + [r["code"] for r in RAW_MATERIALS]))
    rows = [{"code": c, "desc": desc.get(c, c), "qty": flt(onhand.get(c, 0))} for c in codes]
    return {"warehouse": _raw_wh(), "rows": rows}


@frappe.whitelist()
def item_stock(project):
    """Finished members for a project — both Nos and kg."""
    if not project or not frappe.db.exists("PEB FT Project", project):
        return {"warehouse": _finished_wh_name(), "rows": []}
    if _single_store():
        # one shared store can't separate projects by Bin -> scope by painted members (app truth)
        rows = []
        for m in frappe.get_all("PEB FT Member", filters={"project": project, "paint_qty": [">", 0]},
                                fields=["member_code", "paint_qty", "member_weight_kg"], order_by="member_code asc"):
            nos = flt(m.paint_qty)
            rows.append({"item": m.member_code, "nos": nos, "kg": round(nos * flt(m.member_weight_kg), 1)})
        return {"warehouse": _finished_wh_name(), "rows": rows}
    proj = frappe.get_doc("PEB FT Project", project)
    wh = proj.finished_warehouse
    mw = {m.member_code: flt(m.member_weight_kg) for m in frappe.get_all(
        "PEB FT Member", filters={"project": project}, fields=["member_code", "member_weight_kg"])}
    rows = []
    if wh:
        for r in frappe.get_all("Bin", filters={"warehouse": wh, "actual_qty": [">", 0]}, fields=["item_code", "actual_qty"], order_by="item_code"):
            nos = flt(r.actual_qty)
            rows.append({"item": r.item_code, "nos": nos, "kg": round(nos * mw.get(r.item_code, 0), 1)})
    return {"warehouse": wh, "rows": rows}


@frappe.whitelist()
def list_items():
    items = frappe.get_all("Item", filters={"item_group": MEMBER_ITEM_GROUP},
                           fields=["item_code", "item_name", "stock_uom"], order_by="item_code asc")
    usage = frappe.db.sql("select member_code, count(distinct project) c from `tabPEB FT Member` group by member_code", as_dict=True)
    used = {u.member_code: u.c for u in usage}
    for it in items:
        it["used_in"] = used.get(it.item_code, 0)
    return items


@frappe.whitelist()
def list_raw_materials():
    onhand = _raw_onhand()
    return [{"code": r["code"], "desc": r["desc"], "uom": STOCK_UOM, "qty": flt(onhand.get(r["code"], 0))}
            for r in RAW_MATERIALS]


# ---------------------------------------------------------------------------
# Work Orders
# ---------------------------------------------------------------------------
@frappe.whitelist()
def list_work_orders():
    rows = frappe.get_all("PEB FT Work Order",
                          fields=["name", "client_wo_no", "project", "date_received",
                                  "contracted_weight_mt", "attachment", "status", "remarks"],
                          order_by="creation desc")
    for r in rows:
        r["project_name"] = frappe.db.get_value("PEB FT Project", r.project, "project_name") or r.project
        r["date_received"] = str(r.date_received or "")
    return rows


@frappe.whitelist()
def save_work_order(client_wo_no, project_name, date_received=None, contracted_weight_mt=0,
                    attachment=None, remarks=None):
    project_name = (project_name or "").strip()
    client_wo_no = (client_wo_no or "").strip()
    if not project_name:
        frappe.throw(_("Enter the project name."))
    if not client_wo_no:
        frappe.throw(_("Enter the client's work order no."))
    pname = frappe.db.get_value("PEB FT Project", {"project_name": project_name}, "name")
    if not pname:
        proj = frappe.get_doc({"doctype": "PEB FT Project", "project_name": project_name, "status": "Open",
                               "contracted_weight_mt": flt(contracted_weight_mt)})
        proj.insert(ignore_permissions=True)
        _ensure_finished_wh(proj)
        pname = proj.name
    wo = frappe.get_doc({"doctype": "PEB FT Work Order", "client_wo_no": client_wo_no, "project": pname,
                         "date_received": date_received or nowdate(), "contracted_weight_mt": flt(contracted_weight_mt),
                         "attachment": attachment, "remarks": remarks, "status": "Open"})
    wo.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"ok": True, "name": wo.name, "project": project_name}


# ---------------------------------------------------------------------------
# Dashboard + Reports
# ---------------------------------------------------------------------------
@frappe.whitelist()
def dashboard_data():
    projects = frappe.get_all("PEB FT Project", fields=["name", "project_name", "status"])
    members = frappe.get_all("PEB FT Member",
                             fields=["name", "project", "member_code", "member_qty", "member_weight_kg",
                                     "cut_qty", "fit_qty", "weld_qty", "paint_qty"])
    funnel = {s: 0.0 for s in STAGES}
    total_weight = 0.0
    for m in members:
        total_weight += flt(m.member_weight_kg) * flt(m.member_qty or 1)
        # a member "sits" at its furthest-not-complete stage; count members per current stage by remaining
        funnel["Cutting"] += flt(m.cut_qty)
        funnel["Fitting"] += flt(m.fit_qty)
        funnel["Welding"] += flt(m.weld_qty)
        funnel["Painting"] += flt(m.paint_qty)
    item_count = frappe.db.count("Item", {"item_group": MEMBER_ITEM_GROUP})
    # real finished stock (painted members actually in stock) across all project finished warehouses
    fin_nos = fin_kg = 0.0
    if _single_store():
        # single shared store -> finished stock from painted members (app truth)
        for m in members:
            fin_nos += flt(m.paint_qty)
            fin_kg += flt(m.paint_qty) * flt(m.member_weight_kg)
    else:
        wmap = {(m.project, m.member_code): flt(m.member_weight_kg) for m in members}
        for p in projects:
            fw = frappe.db.get_value("PEB FT Project", p.name, "finished_warehouse")
            if not fw:
                continue
            for b in frappe.get_all("Bin", filters={"warehouse": fw, "actual_qty": [">", 0]}, fields=["item_code", "actual_qty"]):
                fin_nos += flt(b.actual_qty)
                fin_kg += flt(b.actual_qty) * wmap.get((p.name, b.item_code), 0)
    recent = frappe.db.sql("""
        select l.stage, l.date, l.team, l.item_code, l.qty, m.member_code, m.project
        from `tabPEB FT Progress Log` l join `tabPEB FT Member` m on l.parent = m.name
        order by l.date desc, l.creation desc limit 8""", as_dict=True)
    for r in recent:
        r["project_name"] = frappe.db.get_value("PEB FT Project", r.project, "project_name") or r.project
        r["date"] = str(r.date or "")
    return {
        "project_count": len(projects), "open_count": sum(1 for p in projects if p.status == "Open"),
        "member_count": len(members), "total_weight": total_weight, "total_mt": round(total_weight / 1000.0, 2),
        "item_count": item_count, "finished_nos": round(fin_nos, 0), "finished_mt": round(fin_kg / 1000.0, 3),
        "funnel": [{"stage": s, "count": round(funnel[s], 0)} for s in STAGES],
        "recent": recent,
    }


@frappe.whitelist()
def report_rows(project=None, stage=None):
    logs = frappe.db.sql("""
        select l.date, l.stage, l.item_code, l.qty, l.unit, l.team, l.remarks, m.member_code, m.project
        from `tabPEB FT Progress Log` l join `tabPEB FT Member` m on l.parent = m.name
        order by l.date desc, l.creation desc""", as_dict=True)
    pname = {}
    out = []
    for r in logs:
        proj_name = pname.get(r.project)
        if proj_name is None:
            proj_name = frappe.db.get_value("PEB FT Project", r.project, "project_name") or r.project
            pname[r.project] = proj_name
        if project and project not in ("ALL", "") and proj_name != project:
            continue
        if stage and stage not in ("ALL", "") and r.stage != stage:
            continue
        out.append({"date": str(r.date or ""), "project": proj_name, "member": r.member_code,
                    "stage": r.stage, "qty": r.qty, "unit": r.unit, "team": r.team, "remarks": r.remarks})
    return out


@frappe.whitelist()
def search_all(q):
    q = (q or "").strip()
    if not q:
        return {"projects": [], "members": [], "items": []}
    like = "%" + q + "%"
    projects = frappe.db.sql("select name, project_name from `tabPEB FT Project` where project_name like %s order by project_name limit 8", like, as_dict=True)
    members = frappe.db.sql("select m.name, m.member_code, m.project, p.project_name from `tabPEB FT Member` m "
                            "join `tabPEB FT Project` p on p.name=m.project where m.member_code like %s order by m.member_code limit 10", like, as_dict=True)
    items = frappe.db.sql_list("select distinct member_code from `tabPEB FT Member` where member_code like %s order by member_code limit 10", like)
    return {"projects": projects, "members": members, "items": items}
