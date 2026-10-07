/* HSC Inhouse — LIVE (hsc_master_inhouse.api.*, same API as /desk/dux-hsc-inhouse and /hsc/m). 12k+ installations → lists page on the server.
   Material Issue is switched off on jewipl (hsc_material_issue_enabled = 0), so submit only locks the record. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, { nf, esc, ic } = DX;
  const API = "hsc_master_inhouse.api.";
  const B = { masters: {}, counts: {}, permissions: {}, features: {}, role: "user", default_company: "", dash: null, rep: {} };
  const ms = k => B.masters[k] || [];
  const lbl = (k, v) => { if (!v) return ""; const o = ms(k).find(x => x.value === v); return o ? o.label : v; };
  const byTown = (k, t, field = "townproject") => ms(k).filter(x => !t || x[field] === t);
  const DIA = ["63 MM", "75 MM", "90 MM", "110 MM", "125 MM", "140 MM", "160 MM"];
  const flt = (f, label, unit) => ({ f, label, type: "float", step: 0.001, unit });
  const STATUS = { draft: "Draft", submitted: "Submitted", cancelled: "Cancelled" };
  const MAT = [["pipeDia", "dia"], ["waterMeter", "water_meter"], ["ftaL", "ftal"], ["fta", "fta"], ["saddleSize", "saddle_size"], ["mdpePipe", "mdpe_pipe_mtr"], ["dce", "dce"], ["ballValve", "ball_valve"], ["brassFerrule", "brass_ferrule"], ["ccLen", "cc_l"], ["ccWidth", "cc_w"], ["ccDepth", "cc_d"], ["soilLen", "soil_l"], ["soilWidth", "soil_w"], ["soilDepth", "soil_d"]];
  const TOP = [["date", "select_date"], ["company", "company"], ["town", "hdi_townproject"], ["zone", "hdi_zone_name"], ["ward", "hdi_ward_number"], ["area", "hdi_area_name"], ["fromJunction", "hdi_from_junction"], ["toJunction", "hdi_to_junction"], ["consumer", "hdi_house_owner_name"], ["connection", "hdi_types_of_connection"], ["cast", "hdi_select_ckhi"], ["ration", "hdi_ration_card"], ["mobile", "hdi_mobile_number"], ["aadhar", "hdi_aadhar_number"], ["address", "hdi_address"], ["contractor", "hdi_contractor_name"], ["supervisor", "hdi_supervisor_name"], ["remarks", "remark"], ["store", "store"], ["housePhoto", "house_photo"], ["connectionPhoto", "connection_photo"], ["aadharPhoto", "aadhar_card_photo"], ["connectionReceiptPhoto", "connection_receipt_photo"], ["electricityBillPhoto", "electricity_bill_photo"]];
  const fromInst = r => { const d = { name: r.id || r.name, docstatus: r.docstatus, material_issue: r.materialIssue, updated: r.updated, latitude: r.latitude, longitude: r.longitude }; TOP.forEach(([a, b]) => (d[b] = r[a] == null ? "" : r[a])); MAT.forEach(([a, b]) => (d[b] = (r.materials || {})[a] == null ? "" : r.materials[a])); d.select_date = DX.day(d.select_date); d.hdi_from_junction = d.hdi_from_junction || ""; d.hdi_to_junction = d.hdi_to_junction || ""; return d; };
  const toInst = d => { const o = { materials: {} }; if (d.name) o.id = d.name; TOP.forEach(([a, b]) => { if (!["connectionReceiptPhoto", "electricityBillPhoto", "store"].includes(a)) o[a] = d[b] == null ? "" : d[b]; }); MAT.forEach(([a, b]) => (o.materials[a] = d[b] == null ? "" : d[b])); return o; };
  const RMAP = [["hsc", "hsc_reference"], ["townproject", "ihr_townproject"], ["date", "select_date"], ["contractor", "ihr_contractor_name"], ["supervisor", "ihr_supervisor_name"], ["dia", "dia"], ["ccBreakingWidth", "cc_breaking_widthmm"], ["ccBreakingDepth", "cc_breaking_depthmm"], ["ccBreakingLength", "cc_breaking_lengthmtr"], ["brassFerrule", "brass_ferrule"], ["saddleSize", "saddle_size"], ["ftal", "ftal"], ["mdpePipe", "mdpe_pipe_mtr"], ["valve", "valve"]];
  const fromRep = r => { const d = { name: r.id || r.name, docstatus: r.docstatus, material_issue: r.materialIssue, updated: r.updated }; RMAP.forEach(([a, b]) => (d[b] = r[a] == null ? "" : r[a])); d.select_date = DX.day(d.select_date); return d; };
  const toRep = d => { const o = {}; if (d.name) o.id = d.name; RMAP.forEach(([a, b]) => (o[a] = d[b] == null ? "" : d[b])); return o; };
  const listQuery = (method, map, extra) => async p => {
    const filters = Object.assign({ status: p.status ? STATUS[p.status] : "All status", search: p.q || "", limit_start: p.start, include_total: 1 }, extra ? extra(p) : {});
    const r = await DX.call(API + method, { filters: DX.json(filters), limit: p.limit }, { get: true });
    const rows = Array.isArray(r) ? r : r.rows || [];
    return { rows: rows.map(map), total: Array.isArray(r) ? rows.length : r.total };
  };
  const stStatus = r => (r.docstatus === 2 ? ["Cancelled", "err"] : r.docstatus === 1 ? ["Submitted", "ok"] : ["Draft", ""]);
  const stKey = r => ["draft", "submitted", "cancelled"][r.docstatus || 0];
  const canAdmin = () => !!(B.permissions.can_admin || B.can_admin);

  const inst = {
    key: "inst", doctype: "HSC Details Inhouse",
    get canCreate() { return B.permissions.can_create_installation !== false; },
    entity: { singular: "Installation", plural: "Installations", title: r => r.hdi_house_owner_name || r.name, sub: r => `${lbl("towns", r.hdi_townproject)} · ${r.name}`, date: "select_date" },
    newLabel: "New installation", newTitle: "Create HSC installation", get submitSub() { return B.features.material_issue_enabled ? "Submitting locks the installation and posts the Material Issue — the materials leave the contractor’s warehouse." : "Submitting locks the installation. Material Issue is switched off for HSC on this site, so no stock moves."; },
    status: stStatus, statusKey: stKey, statusFilter: [["", "All status"], ["draft", "Draft"], ["submitted", "Submitted"], ["cancelled", "Cancelled"]],
    defaults: () => ({ select_date: DX.TODAY, company: B.default_company || DX.M.defaultCompany, hdi_types_of_connection: "HSC Connection" }),
    form: [
      { id: "c", title: "Consumer details", short: "Consumer", icon: "user", fields: [
        { f: "company", label: "Company", type: "link", options: () => ms("companies") }, { f: "select_date", label: "Date", type: "date" },
        { f: "hdi_townproject", label: "Town and project", type: "link", req: true, options: () => ms("towns").map(t => ({ value: t.value, label: t.label, group: t.project_name })) },
        { f: "hdi_zone_name", label: "Zone name", type: "link", parent: ["hdi_townproject"], options: d => byTown("zones", d.hdi_townproject, "hsc_townproject") },
        { f: "hdi_ward_number", label: "Ward number", type: "link", parent: ["hdi_townproject"], options: d => byTown("wards", d.hdi_townproject).map(w => ({ value: w.value, label: "Ward " + w.label })) },
        { f: "hdi_area_name", label: "Area name", type: "link", parent: ["hdi_ward_number"], options: d => byTown("areas", d.hdi_townproject).filter(a => !d.hdi_ward_number || a.ward_number === d.hdi_ward_number) },
        { f: "hdi_from_junction", label: "From junction", type: "int" }, { f: "hdi_to_junction", label: "To junction", type: "int" },
        { f: "hdi_house_owner_name", label: "House owner name", type: "text", req: true, onSet: d => (d.hdi_house_owner_name = String(d.hdi_house_owner_name).replace(/[^A-Za-z\s]/g, "")), hint: "Letters and spaces only." },
        { f: "hdi_types_of_connection", label: "Types of connection", type: "select", options: ["HSC Connection", "Temple", "Masjid", "School"], span: 2 },
        { f: "hdi_select_ckhi", label: "Cast", type: "select", options: ["General", "OBC", "ST", "SC"] },
        { f: "hdi_ration_card", label: "Ration card", type: "select", options: ["BPL", "APL"] },
        { f: "hdi_mobile_number", label: "Mobile number", type: "digits", len: 10 },
        { f: "hdi_aadhar_number", label: "Aadhar number", type: "digits", len: 12, mask: true, hint: "Must be unique across all installations." },
        { f: "hdi_address", label: "Address", type: "textarea", span: "all" }
      ] },
      { id: "m", title: "Material details", short: "Material", icon: "box", tone: "cyan", cols: 4, fields: [
        // same fields, order and labels as the HSC Inhouse page (/desk/dux-hsc-inhouse)
        { f: "dia", label: "Pipe DIA", type: "link", options: DIA }, flt("water_meter", "Water Meter"), flt("ftal", "FTA - L"), flt("fta", "FTA"),
        { f: "saddle_size", label: "Saddle Size", type: "link", options: DIA }, flt("mdpe_pipe_mtr", "MDPE Pipe (mtr)"), flt("dce", "DCE"), flt("ball_valve", "Ball Valve"),
        flt("brass_ferrule", "Brass Ferrule"), flt("cc_l", "CC Breaking Length (mtr)"), flt("cc_w", "CC Breaking Width (mtr)"), flt("cc_d", "CC Breaking Depth (mtr)"),
        flt("soil_l", "Soil Excavation Length"), flt("soil_w", "Soil Excavation Width"), flt("soil_d", "Soil Excavation Depth")
      ] },
      { id: "k", title: "Contractor details", short: "Contractor", icon: "building", fields: [
        { f: "hdi_contractor_name", label: "Contractor name", type: "link", parent: ["hdi_townproject"], options: d => byTown("contractors", d.hdi_townproject).map(c => ({ value: c.value, label: c.contractor || c.label })), onSet: d => contractorStore(d) },
        { f: "hdi_supervisor_name", label: "Supervisor name", type: "link", parent: ["hdi_townproject"], options: d => byTown("supervisors", d.hdi_townproject) },
        { f: "wh", label: "Store", type: "info", icon: "truck", html: d => (!d.hdi_contractor_name ? "Pick a contractor — it must belong to the selected town." : d._whErr ? `<span style="color:var(--err)">${esc(d._whErr)}</span>` : d._wh ? `Warehouse resolved: <b class="dx-mono">${esc(DX.whLabel(d._wh))}</b>` : "Resolving the contractor’s warehouse…") },
        { f: "remark", label: "Remarks", type: "textarea", span: "all" }
      ] },
      { id: "p", title: "Photos", short: "Photos", icon: "camera", cols: 4, fields: [
        { f: "house_photo", label: "House photo", type: "photo", icon: "home" }, { f: "connection_photo", label: "Connection photo", type: "photo", icon: "pipe" }, { f: "connection_receipt_photo", label: "Connection receipt", type: "photo", icon: "card" }, { f: "electricity_bill_photo", label: "Electricity bill", type: "photo", icon: "card" }, { f: "aadhar_card_photo", label: "Aadhar card", type: "photo", icon: "idcard" }
      ] }
    ],
    validate: d => (d.hdi_contractor_name && d._whErr ? { hdi_contractor_name: d._whErr } : {}),
    onSubmit: () => {},
    lockBanner: d => d.material_issue ? "<b>Submitted</b> — Material Issue posted from the contractor’s warehouse." : "<b>Submitted</b> — Material Issue is switched off for HSC on this site, so no stock was moved.",
    detailExtra: d => (d.latitude || d.longitude ? `<div class="dx-note">${ic("pin", 16)}<div>Location on record: <b class="dx-mono">${esc(d.latitude)}, ${esc(d.longitude)}</b></div></div>` : ""),
    detailActions: d => [d.docstatus === 1 && canAdmin() && { label: "Cancel", icon: "close", tone: "danger", run: async x => {
      // a submitted repair keeps the installation linked — say so plainly instead of the server's link error (which names record IDs)
      const open = await DX.call("frappe.client.get_count", { doctype: "Inhouse HSC Repairing", filters: DX.json({ hsc_reference: x.name, docstatus: 1 }) }).catch(() => 0);
      if (+open) { await DX.confirm({ title: "Cancel the repair first", sub: `This connection has ${open} submitted repair${+open > 1 ? "s" : ""}. Cancel the repair under HSC repairing, then cancel the installation.`, noOk: true }); return false; }
      if (!(await DX.confirm({ title: "Cancel this installation?", sub: "Cancelled records can’t be edited again.", ok: "Cancel installation", tone: "danger" }))) return false; await DX.call(API + "cancel_hsc_installation", { name: x.name }); DX.toast("Cancelled · " + esc(x.name)); } }],
    api: {
      counts: () => ({ all: B.counts.installations, draft: B.counts.installation_draft, submitted: B.counts.installation_submitted, cancelled: B.counts.installation_cancelled }),
      query: listQuery("get_hsc_installations", fromInst, p => ({ town: p.filters.hdi_townproject || "", from_date: p.from, to_date: p.to })),
      get: async name => fromInst(await DX.call(API + "get_hsc_doc", { doctype: "HSC Details Inhouse", name }, { get: true })),
      save: async (d, { isNew }) => {
        const prev = isNew ? {} : (DX.find(inst, d.name) || {});
        const r = fromInst(await DX.call(API + "save_hsc_installation", { data: DX.json(toInst(d)) }));
        // receipt + electricity bill photos can only be set with set_hsc_install_file_field
        for (const f of ["connection_receipt_photo", "electricity_bill_photo"]) if (d[f] && d[f] !== prev[f] && d[f] !== r[f]) await DX.call(API + "set_hsc_install_file_field", { name: r.name, fieldname: f, file_url: d[f] });
        refreshCounts();
        return r;
      },
      submit: async name => { const r = await DX.call(API + "submit_hsc_installation", { name }); refreshCounts(); return fromInst(r); }
    }
  };
  async function contractorStore(d) {
    d._wh = ""; d._whErr = "";
    if (!d.hdi_contractor_name) return;
    try { const r = await DX.call(API + "get_contractor_supplier_warehouse", { contractor: d.hdi_contractor_name, town_project: d.hdi_townproject, company: d.company }, { get: true }); d._wh = r.warehouse || ""; } catch (e) { d._whErr = e.message; }
    if (DX.activeForm) DX.activeForm.refresh();
  }
  // the form engine copies field definitions, so picked HSC rows are remembered here (not on the field)
  const SEEN = {};
  // link fields show the consumer, never the HSC record ID — names are fetched once per batch of rows
  const HSCN = {};
  const hscName = id => (id ? HSCN[id] || (SEEN[id] && SEEN[id].consumer) || "" : "");
  const fillHscNames = async ids => {
    const need = [...new Set((ids || []).filter(x => x && !(x in HSCN)))]; if (!need.length) return;
    try { const rows = await DX.call("frappe.client.get_list", { doctype: "HSC Details Inhouse", filters: DX.json([["name", "in", need]]), fields: DX.json(["name", "hdi_house_owner_name"]), limit_page_length: need.length }); (rows || []).forEach(r => (HSCN[r.name] = r.hdi_house_owner_name || "")); } catch (_) { /* labels fall back to "HSC connection" */ }
  };
  const hscPick = {
    f: "hsc_reference", label: "HSC no.", type: "link", req: true, span: 2, searchPh: "Search HSC, consumer, mobile…",
    search: async q => ((await DX.call(API + "search_hsc_installations_for_picker", { search: q, filters: DX.json({ search: q }), limit: 25 }, { get: true })).rows || []).map(r => (HSCN[r.id] = r.consumer || "", SEEN[r.id] = { value: r.id, label: r.consumer || "HSC connection", consumer: r.consumer || "", sub: [r.town_label, r.mobile ? "••" + String(r.mobile).slice(-4) : "", r.status].filter(Boolean).join(" · "), town: r.town, contractor: r.contractor, supervisor: r.supervisor })),
    options: d => { const seen = Object.values(SEEN); if (d.hsc_reference && !seen.some(x => x.value === d.hsc_reference)) seen.push({ value: d.hsc_reference, label: hscName(d.hsc_reference) || "HSC connection" }); return seen; },
    onSet: d => { const h = SEEN[d.hsc_reference]; if (h) Object.assign(d, { ihr_townproject: h.town || d.ihr_townproject, ihr_contractor_name: h.contractor || d.ihr_contractor_name, ihr_supervisor_name: h.supervisor || d.ihr_supervisor_name }); }
  };
  const rep = {
    key: "rep", doctype: "Inhouse HSC Repairing",
    get canCreate() { return B.permissions.can_create_repair !== false; },
    entity: { singular: "Repair", plural: "Repairs", title: r => String(r.name).trim(), sub: r => `${hscName(r.hsc_reference) || "HSC connection"} · ${lbl("towns", r.ihr_townproject)}`, date: "select_date" },
    newLabel: "New repairing", newTitle: "Create HSC repairing", submitBtn: "Submit / close",
    status: stStatus, statusKey: stKey, statusFilter: inst.statusFilter,
    defaults: () => ({ select_date: DX.TODAY }),
    form: [
      { id: "r", title: "Repairing details", short: "Repairing", icon: "wrench", fields: [
        { f: "select_date", label: "Date", type: "date" },
        hscPick,
        { f: "ihr_townproject", label: "Town / project", type: "link", options: () => ms("towns"), hint: "Filled from the selected HSC (the server always uses the HSC’s town)." },
        flt("dia", "Pipe DIA"), flt("cc_breaking_widthmm", "CC breaking width", "m"), flt("cc_breaking_depthmm", "CC breaking depth", "m"), flt("cc_breaking_lengthmtr", "CC breaking length", "m")
      ] },
      { id: "k", title: "Contractor details", short: "Contractor", icon: "building", fields: [
        { f: "ihr_contractor_name", label: "Contractor name", type: "link", options: d => byTown("contractors", d.ihr_townproject).map(c => ({ value: c.value, label: c.contractor || c.label })) }, { f: "ihr_supervisor_name", label: "Supervisor name", type: "link", options: d => byTown("supervisors", d.ihr_townproject) }
      ] },
      { id: "m", title: "Material details", short: "Material", icon: "box", tone: "cyan", cols: 4, fields: [flt("brass_ferrule", "Brass Ferrule"), { f: "saddle_size", label: "Saddle Size", type: "link", options: DIA }, flt("ftal", "FTA - L"), flt("mdpe_pipe_mtr", "MDPE Pipe (mtr)"), flt("valve", "Valve")] }
    ],
    onSubmit: () => {},
    detailActions: d => [d.docstatus === 1 && canAdmin() && { label: "Cancel", icon: "close", tone: "danger", run: async x => { if (!(await DX.confirm({ title: "Cancel this repair?", sub: "Cancelled records can’t be edited again.", ok: "Cancel repair", tone: "danger" }))) return false; await DX.call(API + "cancel_hsc_repairing", { name: x.name }); DX.toast("Cancelled · " + esc(x.name)); } }],
    api: {
      counts: () => ({ all: B.counts.repairs, draft: B.counts.repair_draft, submitted: B.counts.repair_submitted, cancelled: B.counts.repair_cancelled }),
      query: async p => { const r = await listQuery("get_hsc_repairs", fromRep, q => ({ town: q.filters.ihr_townproject || "" }))(p); await fillHscNames(r.rows.map(x => x.hsc_reference)); return r; },
      get: async name => { const d = fromRep(await DX.call(API + "get_hsc_doc", { doctype: "Inhouse HSC Repairing", name }, { get: true })); await fillHscNames([d.hsc_reference]); return d; },
      save: async d => { const r = fromRep(await DX.call(API + "save_hsc_repairing", { data: DX.json(toRep(d)) })); refreshCounts(); return r; },
      submit: async name => { const r = await DX.call(API + "submit_or_close_hsc_repairing", { name }); refreshCounts(); return fromRep(r); }
    }
  };
  const refreshCounts = () => DX.call(API + "get_dux_hsc_dashboard_counts", {}, { get: true }).then(c => { B.counts = c || B.counts; }, () => null);

  // reports come back as heads + array rows; link cells are IDs → labels via the masters
  const LINK_HEADS = { "Town/Project": "towns", "Zone Name": "zones", "Ward Number": "wards", "Area Name": "areas", "Contractor Name": "contractors" };
  const PHOTO = /photo$/i, MASK = /^(mobile number|aadhar number)$/i, NUM = /^(from junction|to junction|water meter|fta - l|fta|mdpe pipe \(mtr\)|dce|ball valve|brass ferrule|valve|cc breaking .*|soil excavation .*|pipe dia)$/i;
  const loadReport = async (type, f) => {
    const key = [type, f.from, f.to, f.town || "", f.lat || ""].join("|");
    if (B.rep[type] && B.rep[type].key === key) return;
    const r = await DX.call(API + "get_hsc_reports", { report_type: type, filters: DX.json({ from: f.from, to: f.to, town: f.town || "", zone: "", lat: f.lat || "" }) }, { get: true });
    const heads = r.heads || [], dateIdx = heads.findIndex(h => /date/i.test(h)), statusIdx = heads.indexOf("Status");
    const rows = (r.rows || []).map(a => { const o = { _date: DX.day(a[dateIdx]), name: a[0], docstatus: statusIdx > -1 ? ["Draft", "Submitted", "Cancelled"].indexOf(a[statusIdx]) : 0 }; heads.forEach((h, i) => (o["c" + i] = LINK_HEADS[h] ? lbl(LINK_HEADS[h], a[i]) : a[i])); return o; });
    const hi = heads.findIndex((h, i) => i > 0 && /^hsc no/i.test(h)); if (hi > -1) await fillHscNames(rows.map(o => o["c" + hi]));
    B.rep[type] = { key, heads, rows, summary: r.summary || {}, title: r.title };
  };
  const reportCols = type => ((B.rep[type] || {}).heads || []).map((h, i) => (i > 0 && /^hsc no/i.test(h) ? { label: "Consumer (HSC)", get: r => hscName(r["c" + i]) || "—", trunc: true } : /^material issue$/i.test(h) ? { label: h, type: "html", get: r => (r["c" + i] ? DX.status("Issued", "ok") : "<span class=\"dx-faint\">—</span>") } : /^amended from$/i.test(h) ? { label: h, get: r => (r["c" + i] ? "Amended" : "—") } : PHOTO.test(h) ? { label: h, type: "html", get: r => (r["c" + i] ? `<a class="dx-link" href="${esc(r["c" + i])}" target="_blank" rel="noopener">View</a>` : "") } : MASK.test(h) ? { f: "c" + i, label: h, type: "mask" } : /date/i.test(h) && !/updated/i.test(h) ? { f: "c" + i, label: h, type: "date" } : i === 0 ? { f: "c" + i, label: h, type: "mono", strong: true } : /^mdpe/i.test(h) || /^brass|^water meter|^valve/i.test(h) ? { f: "c" + i, label: h, type: "num", d: 2, total: true } : NUM.test(h) ? { f: "c" + i, label: h } : { f: "c" + i, label: h, trunc: /address|remarks|contractor|town/i.test(h) }));
  const townFilter = f => ({ f, label: "Town / project", options: () => ms("towns"), display: v => lbl("towns", v), remote: true });

  const MASTER_TABS = [
    ["Site project", "Site Project", "projects", [{ f: "label", label: "Project", strong: true }]],
    ["Town and project", "Town At Project", "towns", [{ f: "label", label: "Town - project", strong: true }, { f: "project_name", label: "Project" }, { f: "company_name", label: "Company" }]],
    ["Zones", "HSC Zone Details", "zones", [{ f: "label", label: "Zone", strong: true }, { label: "Town", get: r => lbl("towns", r.hsc_townproject) }]],
    ["Wards", "Ward at Town", "wards", [{ label: "Ward", strong: true, get: r => "Ward " + r.label }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Areas", "Area at Town", "areas", [{ f: "label", label: "Area", strong: true }, { label: "Ward", get: r => "Ward " + lbl("wards", r.ward_number) }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Contractors", "Contractor at Project", "contractors", [{ label: "Supplier / contractor", strong: true, get: r => r.contractor || r.label }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Supervisors", "Supervisor at Project", "supervisors", [{ f: "label", label: "Supervisor", strong: true }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Stores", "Store At Town", "stores", [{ f: "label", label: "Store", strong: true, type: "mono" }, { label: "Town", get: r => lbl("towns", r.townproject) }]]
  ].map(([label, doctype, k, columns]) => ({ label, doctype, rows: () => ms(k), columns }));

  DX.resolvers.push(v => { for (const k of ["towns", "zones", "wards", "areas", "contractors", "supervisors", "stores"]) { const o = ms(k).find(x => x.value === v); if (o) return k === "wards" ? "Ward " + o.label : k === "contractors" ? o.contractor || o.label : o.label; } return ""; });
  const app = DX.register({
    key: "hscin", title: "HSC Inhouse", short: "HSC Inhouse", icon: "home", hue: "cyan", route: "/desk/dux-hsc-inhouse",
    desc: "Installation · repairing · reports", eyebrow: "HSC operations", headline: `DUX HSC <span class="dx-grad">Inhouse</span>`,
    intro: "A clean page for HSC installation, repairing and reports. Town drives zone, ward, area, contractor and supervisor; picking an HSC in a repair fills its town and team.",
    docs: [inst, rep], noRecent: true,
    boot: async () => { const r = await DX.call(API + "get_dux_hsc_inhouse_initial_data", {}, { get: true }); Object.assign(B, { masters: r.masters || {}, counts: r.counts || {}, permissions: r.permissions || {}, features: r.features || {}, role: r.role, can_admin: r.can_admin, default_company: r.default_company, recentInst: (r.installations || []).map(fromInst), recentRep: (r.repairs || []).map(fromRep) }); },
    kpis: () => { const c = B.counts, s = (B.dash && B.dash.summary) || {}; return [
      { label: "Installations", value: nf(c.installations || 0), sub: `<span class="dx-num">${nf(c.installation_draft || 0)}</span> draft entries`, icon: "home" },
      { label: "Draft repairs", value: nf(c.repair_draft || 0), sub: `<span class="dx-num">${nf(c.repair_submitted || 0)}</span> submitted`, icon: "wrench", tone: "pending" },
      { label: "MDPE pipe this month", value: nf(s.mdpe || 0, 1), unit: "m", sub: `<span class="dx-num">${nf(s.count || 0)}</span> connections this month`, icon: "pipe", tone: "cyan" },
      { label: "Active towns", value: nf(new Set(((B.dash && B.dash.towns) || [])).size), sub: "with installations this month", icon: "pin", tone: "ok" }
    ]; },
    panels: () => { const by = {}; ((B.dash && B.dash.towns) || []).forEach(t => (by[t] = (by[t] || 0) + 1)); const recent = (B.recentInst || []).slice(0, 7); return [
      DX.card("Town-wise installations", Object.keys(by).length ? DX.bars(Object.entries(by).map(([k, v]) => ({ label: lbl("towns", k), value: v })).sort((a, b) => b.value - a.value).slice(0, 10)) : DX.empty("No installations this month", ""), { icon: "pin", tone: "cyan", sub: "this month" }),
      DX.card("Recent installations", recent.map(r => `<button class="dx-lrow" data-go="${esc(DX.entryRoute(inst, r))}"><div class="dx-lrow-main"><div class="dx-lrow-title">${esc(r.hdi_house_owner_name || r.name)}</div><div class="dx-lrow-sub">${esc(lbl("towns", r.hdi_townproject))} · ${esc(r.name)}</div></div><div class="dx-lrow-end">${DX.statusOf(inst, r)}<span class="dx-mono dx-muted" style="font-size:11.5px">${DX.fmtDate(r.select_date)}</span></div></button>`).join("") || DX.empty("No entries yet", ""), { icon: "clock", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="hscin/installations">View all${ic("right", 13)}</button>` })
    ]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "inst", group: "Main", docs: [],
        load: async () => { if (B.dash && Date.now() - B.dash.at < 120000) return; try { const r = await DX.call(API + "get_hsc_reports", { report_type: "installation", filters: DX.json({ from: DX.monthStart(), to: DX.TODAY }) }, { get: true }); const ti = (r.heads || []).indexOf("Town/Project"); B.dash = { at: Date.now(), summary: r.summary || {}, towns: ti > -1 ? (r.rows || []).map(a => a[ti]).filter(Boolean) : [] }; } catch (_) { B.dash = { at: Date.now(), summary: {}, towns: [] }; } } },
      { id: "installations", label: "HSC installation", icon: "home", type: "list", doc: "inst", group: "Main", count: () => B.counts.installations, searchPh: "Search HSC no., consumer, mobile…", filters: [{ f: "hdi_townproject", label: "Town / project", options: () => ms("towns"), display: v => lbl("towns", v) }],
        columns: [{ f: "name", label: "HSC no.", type: "mono", strong: true }, { f: "hdi_house_owner_name", label: "Consumer" }, { label: "Town and project", get: r => lbl("towns", r.hdi_townproject), trunc: true }, { label: "Contractor", get: r => lbl("contractors", r.hdi_contractor_name), trunc: true }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1 }, { f: "select_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(inst, r) }] },
      { id: "repairing", label: "HSC repairing", icon: "wrench", type: "list", doc: "rep", group: "Main", count: () => B.counts.repairs, searchPh: "Search ID, HSC no.…", dateFilter: false, filters: [{ f: "ihr_townproject", label: "Town / project", options: () => ms("towns"), display: v => lbl("towns", v) }],
        columns: [{ label: "HSC repairing no", type: "mono", strong: true, get: r => String(r.name).trim() }, { label: "Consumer (HSC)", get: r => hscName(r.hsc_reference) || "—", trunc: true }, { label: "Town / project", get: r => lbl("towns", r.ihr_townproject), trunc: true }, { label: "Contractor", get: r => lbl("contractors", r.ihr_contractor_name), trunc: true }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1 }, { f: "select_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(rep, r) }] },
      { id: "report", label: "Reports", icon: "chart", type: "report", doc: "inst", group: "Main", title: "HSC Inhouse Installation Report", monthDefault: true, masked: true, remote: true, noLink: true, date: "_date", docs: [], tabs: [{ id: "report", label: "Installation" }, { id: "represport", label: "Repairing" }],
        load: async () => { const f = V.reportFilters(app, app.screens.find(s => s.id === "report")); if (f.to > DX.TODAY) f.to = DX.TODAY; await loadReport("installation", f); },
        rows: () => (B.rep.installation || {}).rows || [],
        filters: [townFilter("town"), { f: "lat", label: "Latitude filter", options: [{ value: "has", label: "Has latitude" }, { value: "blank", label: "Blank latitude" }], display: v => (v === "has" ? "Has latitude" : "Blank latitude"), remote: true }],
        kpis: () => { const s = (B.rep.installation || {}).summary || {}; return [{ label: "No. of connections", value: nf(s.count || 0), icon: "home" }, { label: "Total MDPE pipe used", value: nf(s.mdpe || 0, 2), unit: "m", icon: "pipe", tone: "ok" }]; },
        get columns() { return reportCols("installation"); } },
      { id: "represport", label: "Repairing report", icon: "chart", type: "report", doc: "rep", group: "Main", title: "HSC In House Repairing Report", remote: true, noLink: true, date: "_date", docs: [], days: 3650, tabs: [{ id: "report", label: "Installation" }, { id: "represport", label: "Repairing" }],
        load: async () => { const f = V.reportFilters(app, app.screens.find(s => s.id === "represport")); await loadReport("repairing", f); },
        rows: () => (B.rep.repairing || {}).rows || [],
        filters: [townFilter("town")],
        kpis: rows => [{ label: "No. of repairs", value: nf(rows.length), icon: "wrench" }, { label: "Total MDPE pipe used", value: nf(((B.rep.repairing || {}).summary || {}).mdpe || 0, 2), unit: "m", icon: "pipe", tone: "ok" }],
        get columns() { return reportCols("repairing"); } },
      { id: "masters", label: "Masters & settings", icon: "settings", type: "masters", group: "Admin", tabs: MASTER_TABS }
    ]
  });
})();
