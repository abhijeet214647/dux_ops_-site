/* HSC Inhouse (hsc_master_inhouse · page dux-hsc-inhouse, /hsc/m). Material Issue is switched off on jewipl (hsc_material_issue_enabled = 0). */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc } = DX;
  const HSC_TOWNS = ["TN-17", "TN-11", "TN-16", "TN-08", "TN-10", "TN-09", "TN-18", "TN-114", "TN-005", "TN-021"];
  const townOpts = () => M.townOpts(t => HSC_TOWNS.includes(t.id));
  const zonesFor = t => { const n = { "TN-10": 2, "TN-16": 2, "TN-09": 2 }[t] || 3; return Array.from({ length: n }, (_, i) => ({ value: `${t}-Z${i + 1}`, label: `${i + 1} - ${M.townLabel(t)}` })); };
  const wardsFor = t => Array.from({ length: t === "TN-09" ? 14 : 15 }, (_, i) => ({ value: `${t}-W${i + 1}`, label: `Ward ${i + 1}` }));
  const AREA_NAMES = ["Main Chapda Road, Near Bajarangh Chouraha", "Green Park", "Tanki Pura", "Talkies Colony", "Narsingh Ghat Main Road", "Krishna Pura", "Choti Masjid Road", "Main Market Road", "Bus Stand Area", "Gandhi Chowk", "Shiv Colony", "Ram Nagar"];
  const areasFor = w => { const n = +String(w).split("-W")[1] || 1; return [0, 1, 2].map(k => AREA_NAMES[(n * 3 + k) % AREA_NAMES.length]).map(a => ({ value: `${w}-${a}`, label: a })); };
  const labelOf = (list, v) => (list.find(x => x.value === v) || { label: v || "" }).label;
  const DIA = ["63 MM", "75 MM", "90 MM", "110 MM", "125 MM", "140 MM", "160 MM"];
  const flt = (f, label, unit) => ({ f, label, type: "float", step: 0.001, unit });

  const inst = {
    key: "inst", doctype: "HSC Details Inhouse", seqStart: 12797, naming: (d, n) => "HSC Inhouse-" + n,
    entity: { singular: "Installation", plural: "Installations", title: r => r.hdi_house_owner_name || r.name, sub: r => `${M.townLabel(r.hdi_townproject)} · ${r.name}`, date: "select_date" },
    newLabel: "New installation", newTitle: "Create HSC installation", submitSub: "Submitting locks the installation. Material Issue is switched off for HSC on this site, so no stock moves.",
    status: r => (r.docstatus === 2 ? ["Cancelled", "err"] : r.docstatus === 1 ? ["Submitted", "ok"] : ["Draft", ""]), statusKey: r => ["draft", "submitted", "cancelled"][r.docstatus || 0],
    statusFilter: [["", "All status"], ["draft", "Draft"], ["submitted", "Submitted"], ["cancelled", "Cancelled"]],
    defaults: () => ({ select_date: DX.TODAY, company: M.companies[0][0], hdi_types_of_connection: "HSC Connection" }),
    form: [
      { id: "c", title: "Consumer details", short: "Consumer", icon: "user", fields: [
        { f: "company", label: "Company", type: "link", options: M.companyOpts }, { f: "select_date", label: "Date", type: "date" },
        { f: "hdi_townproject", label: "Town and project", type: "link", req: true, options: townOpts },
        { f: "hdi_zone_name", label: "Zone name", type: "link", parent: ["hdi_townproject"], options: d => zonesFor(d.hdi_townproject) },
        { f: "hdi_ward_number", label: "Ward number", type: "link", parent: ["hdi_townproject"], options: d => wardsFor(d.hdi_townproject) },
        { f: "hdi_area_name", label: "Area name", type: "link", parent: ["hdi_ward_number"], options: d => areasFor(d.hdi_ward_number) },
        { f: "hdi_from_junction", label: "From junction", type: "text" }, { f: "hdi_to_junction", label: "To junction", type: "text" },
        { f: "hdi_house_owner_name", label: "House owner name", type: "text", req: true, onSet: d => (d.hdi_house_owner_name = String(d.hdi_house_owner_name).replace(/[^A-Za-z\s]/g, "")), hint: "Letters and spaces only." },
        { f: "hdi_types_of_connection", label: "Types of connection", type: "select", options: ["HSC Connection", "Temple", "Masjid", "School"], span: 2 },
        { f: "hdi_select_ckhi", label: "Cast", type: "select", options: ["General", "OBC", "ST", "SC"] },
        { f: "hdi_ration_card", label: "Ration card", type: "select", options: ["BPL", "APL"] },
        { f: "hdi_mobile_number", label: "Mobile number", type: "digits", len: 10 },
        { f: "hdi_aadhar_number", label: "Aadhar number", type: "digits", len: 12, mask: true, hint: "Must be unique across all installations." },
        { f: "gps", label: "Capture location", type: "gps" },
        { f: "hdi_address", label: "Address", type: "textarea", span: "all" }
      ] },
      { id: "m", title: "Material details", short: "Material", icon: "box", tone: "cyan", cols: 4, fields: [
        { f: "dia", label: "Pipe DIA", type: "link", options: DIA }, flt("water_meter", "Water meter"), flt("ftal", "FTA - L"), flt("fta", "FTA"),
        { f: "saddle_size", label: "Saddle size", type: "link", options: DIA }, flt("mdpe_pipe_mtr", "MDPE pipe", "m"), flt("dce", "DCE"), flt("ball_valve", "Ball valve"),
        flt("brass_ferrule", "Brass ferrule"), flt("cc_l", "CC breaking length", "m"), flt("cc_w", "CC breaking width", "m"), flt("cc_d", "CC breaking depth", "m"),
        flt("soil_l", "Soil excavation length", "m"), flt("soil_w", "Soil excavation width", "m"), flt("soil_d", "Soil excavation depth", "m")
      ] },
      { id: "k", title: "Contractor details", short: "Contractor", icon: "building", fields: [
        { f: "hdi_contractor_name", label: "Contractor name", type: "link", parent: ["hdi_townproject"], options: d => M.contractorOpts(d.hdi_townproject) },
        { f: "hdi_supervisor_name", label: "Supervisor name", type: "link", parent: ["hdi_townproject"], options: d => M.supervisorsFor(d.hdi_townproject) },
        { f: "wh", label: "Store", type: "info", icon: "truck", html: d => d.hdi_contractor_name ? `Warehouse resolved: <b class="dx-mono">${esc(d.hdi_contractor_name)} - JEWPL</b>` : "Pick a contractor — it must belong to the selected town." },
        { f: "remark", label: "Remarks", type: "textarea", span: "all" }
      ] },
      { id: "p", title: "Photos", short: "Photos", icon: "camera", cols: 4, fields: [
        { f: "house_photo", label: "House photo", type: "photo", icon: "home" }, { f: "connection_photo", label: "Connection photo", type: "photo", icon: "pipe" }, { f: "connection_receipt_photo", label: "Connection receipt", type: "photo", icon: "card" }, { f: "electricity_bill_photo", label: "Electricity bill", type: "photo", icon: "card" }, { f: "aadhar_card_photo", label: "Aadhar card", type: "photo", icon: "idcard" }
      ] }
    ],
    validate: d => (d.hdi_aadhar_number && DX.rows(inst).some(r => r.name !== d.name && r.hdi_aadhar_number === d.hdi_aadhar_number) ? { hdi_aadhar_number: "This Aadhar number is already used on another installation." } : {}),
    onSubmit: () => {},
    lockBanner: () => "<b>Submitted</b> — Material Issue is switched off for HSC on this site, so no stock was moved.",
    detailActions: d => [d.docstatus === 1 && { label: "Cancel", icon: "close", tone: "danger", run: x => DX.confirm({ title: "Cancel this installation?", sub: "Cancelled records can’t be edited again.", ok: "Cancel installation", tone: "danger" }).then(ok => { if (ok) { x.docstatus = 2; DX.toast("Cancelled · " + esc(x.name)); } return ok; }) }],
    seed: () => { const g = DX.seeder(1279), first = ["Ramesh", "Suresh", "Kamla", "Rajesh", "Sunita", "Mohan", "Geeta", "Harish", "Pooran", "Munni", "Lakhan", "Santosh", "Radha", "Bharat", "Hari", "Manoj"], last = ["Patidar", "Choudhary", "Malviya", "Rathore", "Sharma", "Yadav", "Ahirwar", "Kushwaha"], out = [];
      const weights = ["TN-17", "TN-17", "TN-17", "TN-11", "TN-11", "TN-16", "TN-16", "TN-08", "TN-10", "TN-09", "TN-18"];
      for (let i = 0; i < 70; i++) { const t = g.pick(weights), w = g.pick(wardsFor(t)).value, sub = g.chance(.14), dia = g.chance(.47) ? "110 MM" : g.chance(.8) ? "90 MM" : g.pick(DIA);
        out.push({ name: "HSC Inhouse-" + (12727 + i), docstatus: sub ? 1 : 0, select_date: DX.addDays(DX.TODAY, -g.int(0, 45)), company: M.companies[0][0], hdi_townproject: t, hdi_zone_name: g.pick(zonesFor(t)).value, hdi_ward_number: w, hdi_area_name: g.pick(areasFor(w)).value, hdi_house_owner_name: `${g.pick(first)} ${g.pick(last)}`, hdi_types_of_connection: g.chance(.97) ? "HSC Connection" : g.pick(["Temple", "Masjid", "School"]), hdi_select_ckhi: g.pick(["General", "OBC", "ST", "SC"]), hdi_ration_card: g.pick(["BPL", "APL"]), hdi_mobile_number: String(g.int(6, 9)) + g.int(100000000, 999999999), hdi_aadhar_number: String(g.int(200000000000, 999999999999)), dia, saddle_size: dia, mdpe_pipe_mtr: g.flt(2, 8, 1), water_meter: 1, ftal: 1, fta: g.chance(.5) ? 1 : 0, brass_ferrule: 1, ball_valve: g.chance(.4) ? 1 : 0, hdi_contractor_name: M.contractorOpts(t)[g.int(0, 2)].value, hdi_supervisor_name: M.supervisorsFor(t)[g.int(0, 2)].value, house_photo: g.chance(.7) ? "demo:house" : "", connection_photo: g.chance(.6) ? "demo:pipe" : "", gps: g.chance(.3) ? `${(22.9 + g.r() * .2).toFixed(7)},${(76.0 + g.r() * .2).toFixed(7)}` : "" }); }
      return out; }
  };
  const rep = {
    key: "rep", doctype: "Inhouse HSC Repairing", seqStart: 46, naming: (d, n) => "Inhouse Repairing-" + n,
    entity: { singular: "Repair", plural: "Repairs", title: r => r.name, sub: r => `${r.hsc_reference} · ${M.townLabel(r.ihr_townproject)}`, date: "select_date" },
    newLabel: "New repairing", newTitle: "Create HSC repairing", submitBtn: "Submit / close",
    status: inst.status, statusKey: inst.statusKey, statusFilter: inst.statusFilter,
    defaults: () => ({ select_date: DX.TODAY }),
    form: [
      { id: "r", title: "Repairing details", short: "Repairing", icon: "wrench", fields: [
        { f: "select_date", label: "Date", type: "date" },
        { f: "hsc_reference", label: "HSC no.", type: "link", req: true, span: 2, searchPh: "Search HSC, consumer, mobile, town, contractor…", options: () => DX.rows(inst).map(r => ({ value: r.name, label: `${r.name} - ${r.hdi_house_owner_name}`, sub: M.townLabel(r.hdi_townproject) })),
          onSet: d => { const h = DX.find(inst, d.hsc_reference); if (h) Object.assign(d, { ihr_townproject: h.hdi_townproject, ihr_contractor_name: h.hdi_contractor_name, ihr_supervisor_name: h.hdi_supervisor_name }); } },
        { f: "ihr_townproject", label: "Town / project", type: "link", options: townOpts, hint: "Filled from the selected HSC." },
        flt("dia", "Pipe DIA"), flt("cc_breaking_widthmm", "CC breaking width", "m"), flt("cc_breaking_depthmm", "CC breaking depth", "m"), flt("cc_breaking_lengthmtr", "CC breaking length", "m")
      ] },
      { id: "k", title: "Contractor details", short: "Contractor", icon: "building", fields: [
        { f: "ihr_contractor_name", label: "Contractor name", type: "link", options: d => M.contractorOpts(d.ihr_townproject) }, { f: "ihr_supervisor_name", label: "Supervisor name", type: "link", options: d => M.supervisorsFor(d.ihr_townproject || "TN-17") }
      ] },
      { id: "m", title: "Material details", short: "Material", icon: "box", tone: "cyan", cols: 4, fields: [flt("brass_ferrule", "Brass ferrule"), { f: "saddle_size", label: "Saddle size", type: "link", options: DIA }, flt("ftal", "FTA - L"), flt("mdpe_pipe_mtr", "MDPE pipe", "m"), flt("valve", "Valve")] }
    ],
    onSubmit: () => {},
    seed: () => { const g = DX.seeder(46), out = []; const hs = inst.seed(); for (let i = 0; i < 12; i++) { const h = g.pick(hs); out.push({ name: "Inhouse Repairing-" + (34 + i), docstatus: g.chance(.1) ? 1 : 0, select_date: DX.addDays(DX.TODAY, -g.int(0, 30)), hsc_reference: h.name, ihr_townproject: h.hdi_townproject, ihr_contractor_name: h.hdi_contractor_name, ihr_supervisor_name: h.hdi_supervisor_name, dia: 110, cc_breaking_lengthmtr: g.flt(0.5, 3, 1), cc_breaking_widthmm: 0.3, cc_breaking_depthmm: 0.2, brass_ferrule: 1, saddle_size: "110 MM", mdpe_pipe_mtr: g.flt(1, 5, 1), valve: g.chance(.3) ? 1 : 0 }); } return out; }
  };
  const MASTER_TABS = [
    { label: "Site project", doctype: "Site Project", rows: () => M.projects.map(p => ({ p, t: M.towns.filter(t => t.project === p).length })), columns: [{ f: "p", label: "Project", strong: true }, { f: "t", label: "Towns", type: "num" }] },
    { label: "Town and project", doctype: "Town At Project", rows: () => M.towns, columns: [{ f: "id", label: "ID", type: "mono" }, { f: "label", label: "Town - project", strong: true }, { f: "project", label: "Project" }] },
    { label: "Zones", doctype: "HSC Zone Details", rows: () => HSC_TOWNS.flatMap(zonesFor), columns: [{ f: "label", label: "Zone", strong: true }] },
    { label: "Wards", doctype: "Ward at Town", rows: () => HSC_TOWNS.slice(0, 4).flatMap(t => wardsFor(t).map(w => ({ w: w.label, t: M.townLabel(t) }))), columns: [{ f: "w", label: "Ward", strong: true }, { f: "t", label: "Town" }] },
    { label: "Contractors", doctype: "Contractor at Project", rows: () => M.contractors.filter(c => HSC_TOWNS.includes(c.town)).map(c => Object.assign({ tl: M.townLabel(c.town) }, c)), columns: [{ f: "id", label: "ID", type: "mono" }, { f: "name", label: "Supplier / contractor", strong: true }, { f: "tl", label: "Town" }] },
    { label: "Stores", doctype: "Store At Town", rows: () => HSC_TOWNS.map(t => ({ s: M.store(t), t: M.townLabel(t) })), columns: [{ f: "s", label: "Store", strong: true, type: "mono" }, { f: "t", label: "Town" }] }
  ];
  const mdpe = rows => DX.sum(rows, "mdpe_pipe_mtr");
  const instCols = [{ f: "name", label: "HSC no.", type: "mono", strong: true }, { f: "hdi_house_owner_name", label: "Consumer" }, { label: "Town and project", get: r => M.townLabel(r.hdi_townproject), trunc: true }, { label: "Contractor", get: r => M.contractorName(r.hdi_contractor_name), trunc: true }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1 }, { f: "select_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(inst, r) }];

  DX.register({
    key: "hscin", title: "HSC Inhouse", short: "HSC Inhouse", icon: "home", hue: "cyan", route: "/desk/dux-hsc-inhouse",
    desc: "Installation · repairing · reports", eyebrow: "HSC operations", headline: `DUX HSC <span class="dx-grad">Inhouse</span>`,
    intro: "A clean page for HSC installation, repairing and reports. Town drives zone, ward, area, contractor and supervisor; picking an HSC in a repair fills its town and team.",
    docs: [inst, rep],
    kpis: () => { const I = DX.rows(inst), R = DX.rows(rep); return [
      { label: "Installations", value: nf(I.length), sub: `<span class="dx-num">${I.filter(r => !r.docstatus).length}</span> draft entries`, icon: "home" },
      { label: "Draft repairs", value: nf(R.filter(r => !r.docstatus).length), sub: `<span class="dx-num">${R.filter(r => r.docstatus === 1).length}</span> submitted`, icon: "wrench", tone: "pending" },
      { label: "MDPE pipe used", value: nf(mdpe(I), 1), unit: "m", sub: `Avg <span class="dx-num">${I.length ? (mdpe(I) / I.length).toFixed(1) : 0}</span> m per connection`, icon: "pipe", tone: "cyan" },
      { label: "Active towns", value: nf(new Set(I.map(r => r.hdi_townproject)).size), sub: "with installations", icon: "pin", tone: "ok" }
    ]; },
    panels: () => { const I = DX.rows(inst), by = {}; I.forEach(r => (by[r.hdi_townproject] = (by[r.hdi_townproject] || 0) + 1)); return [DX.card("Town-wise installations", DX.bars(Object.entries(by).map(([k, v]) => ({ label: M.townLabel(k), value: v })).sort((a, b) => b.value - a.value)), { icon: "pin", tone: "cyan" }),
      DX.card("Quick create", `<div class="dx-appgrid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:0;padding:16px">${[["inst:new", "Installation", "Create HSC Details Inhouse draft.", "home"], ["rep:new", "Repairing", "Create Inhouse HSC Repairing ID.", "wrench"], ["masters", "Settings", "Project, town, ward, area, contractor and supervisor.", "settings"]].map(([r, t, s, i]) => `<button class="dx-appcard dx-hue-cyan" data-go="hscin/${r}"><div class="dx-appcard-top"><span class="dx-apptile">${DX.ic(i, 16)}</span><div><div class="dx-appcard-title">${t}</div><div class="dx-appcard-desc">${s}</div></div></div></button>`).join("")}</div>`, { icon: "plus", sub: "clean forms only" })]; },
    homeStat: () => ({ value: nf(DX.rows(inst).length), label: "installations" }),
    attention: () => DX.rows(rep).filter(r => !r.docstatus).slice(0, 3).map(r => ({ title: r.name, sub: `Draft repair · ${r.hsc_reference}`, go: DX.entryRoute(rep, r), tag: "Draft repair" })),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "inst", group: "Main" },
      { id: "installations", label: "HSC installation", icon: "home", type: "list", doc: "inst", group: "Main", count: () => DX.rows(inst).length, searchPh: "Search HSC, consumer, town…", search: [r => r.name, r => r.hdi_house_owner_name, r => r.hdi_mobile_number, r => M.townLabel(r.hdi_townproject), r => M.contractorName(r.hdi_contractor_name)], filters: [{ f: "hdi_townproject", label: "Town / project", options: townOpts, display: M.townLabel }], columns: instCols },
      { id: "repairing", label: "HSC repairing", icon: "wrench", type: "list", doc: "rep", group: "Main", searchPh: "Search ID, HSC, town…", search: [r => r.name, r => r.hsc_reference, r => M.townLabel(r.ihr_townproject)], columns: [{ f: "name", label: "HSC repairing no", type: "mono", strong: true }, { f: "hsc_reference", label: "HSC no.", type: "mono" }, { label: "Town / project", get: r => M.townLabel(r.ihr_townproject), trunc: true }, { label: "Contractor", get: r => M.contractorName(r.ihr_contractor_name), trunc: true }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1 }, { label: "Status", type: "status", get: r => DX.statusOf(rep, r) }] },
      { id: "report", label: "Reports", icon: "chart", type: "report", doc: "inst", group: "Main", title: "HSC Inhouse Installation Report", monthDefault: true, masked: true, date: "select_date", tabs: [{ id: "report", label: "Installation" }, { id: "represport", label: "Repairing" }],
        filters: [{ f: "hdi_townproject", label: "Town / project", options: townOpts, display: M.townLabel }, { f: "lat", label: "Latitude filter", options: ["Has latitude", "Blank latitude"], get: r => (r.gps ? "Has latitude" : "Blank latitude") }],
        kpis: rows => [{ label: "No. of connections", value: nf(rows.length), icon: "home" }, { label: "Total MDPE pipe used", value: nf(mdpe(rows), 2), unit: "m", icon: "pipe", tone: "ok" }],
        columns: [{ f: "name", label: "HSC no.", type: "mono", strong: true }, { f: "select_date", label: "Date", type: "date" }, { label: "Town / project", get: r => M.townLabel(r.hdi_townproject), trunc: true }, { label: "Ward", get: r => labelOf(wardsFor(r.hdi_townproject), r.hdi_ward_number) }, { f: "hdi_house_owner_name", label: "House owner" }, { f: "hdi_types_of_connection", label: "Connection" }, { f: "hdi_mobile_number", label: "Mobile", type: "mask" }, { f: "hdi_aadhar_number", label: "Aadhar", type: "mask" }, { f: "dia", label: "Pipe DIA" }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1, total: true }, { f: "water_meter", label: "Water meter", type: "num", total: true }, { f: "brass_ferrule", label: "Brass ferrule", type: "num", total: true }, { label: "Contractor", get: r => M.contractorName(r.hdi_contractor_name), trunc: true }, { label: "Status", get: r => ["Draft", "Submitted", "Cancelled"][r.docstatus || 0] }] },
      { id: "represport", label: "Repairing report", icon: "chart", type: "report", doc: "rep", group: "Main", title: "HSC In House Repairing Report", date: "select_date", tabs: [{ id: "report", label: "Installation" }, { id: "represport", label: "Repairing" }], filters: [{ f: "ihr_townproject", label: "Town / project", options: townOpts, display: M.townLabel }],
        kpis: rows => [{ label: "No. of repairs", value: nf(rows.length), icon: "wrench" }, { label: "Total MDPE pipe used", value: nf(mdpe(rows), 2), unit: "m", icon: "pipe", tone: "ok" }],
        columns: [{ f: "name", label: "Ticket", type: "mono", strong: true }, { f: "select_date", label: "Date", type: "date" }, { f: "hsc_reference", label: "HSC no.", type: "mono" }, { label: "Town / project", get: r => M.townLabel(r.ihr_townproject), trunc: true }, { label: "Contractor", get: r => M.contractorName(r.ihr_contractor_name), trunc: true }, { f: "dia", label: "Pipe DIA", type: "num" }, { f: "brass_ferrule", label: "Brass ferrule", type: "num", total: true }, { f: "saddle_size", label: "Saddle" }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1, total: true }, { f: "valve", label: "Valve", type: "num", total: true }] },
      { id: "masters", label: "Masters & settings", icon: "settings", type: "masters", group: "Admin", tabs: MASTER_TABS }
    ]
  });
})();
