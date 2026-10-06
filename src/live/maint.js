/* DUX Maintenance Master — LIVE (dux_maintenance_master page API). Entries stay draft (no submit API) — saving posts no stock.
   Every write returns the full boot payload, so both lists refresh from the response. */
(function () {
  "use strict";
  const DX = window.DX, { nf, esc } = DX;
  const API = "dux_maintenance_master.dux_maintenance_master.page.dux_maintenance_master.dux_maintenance_master.";
  const TYPES = ["CAR", "TRUCK", "BIKE", "CRANE", "BULLDOZER", "BUTT FUSION", "HYVA", "EXCAVATOR", "BACKHOE LOADER", "WATER PUMP", "TRACTOR-1", "TRACTOR-2", "TRACTOR-3", "TRACTOR TROLLY", "MOBILE CONCRETE MIXTURE PLANT", "AJAX FIORI", "MINI Excavator", "CUTTER MACHINE-1", "CUTTER MACHINE-2", "CUTTER MACHINE-3", "CUTTER MACHINE-4", "CUTTER MACHINE-5", "CUTTER MACHINE-6", "VIBRATOR MACHINE", "LOADING AUTO", "BOLERO", "BOLERO PICKUP", "MILLER", "HYDRA CRANE", "MOBILE CONCRETE MIXTURE", "CONCRETE MIXTURE", "CONCRETE PUMP", "PICKUP", "ELECTRIC MOTOR", "GENERATOR", "BREAKER", "HYDRO TESTING PUMP", "HAND GRINDER", "AC INDOOR UNIT", "AC OUTDOOR UNIT"];
  const SERVICE = ["Regular Service", "Breakdown Repair", "Accident Repair", "Tyre Change"];
  const SCHEDULED = ["Regular Service", "Tyre Change"];
  const B = { companies: [], default_company: "", town_projects: [], stores: [], suppliers: [], at: 0, pending: null };
  const compName = v => [v.type_of_vehicle, v.model_name, v.vehicle_number].filter(Boolean).join(" - ");
  const townLabel = id => (B.town_projects.find(t => t.name === id) || {}).label || DX.M.townLabel(id);
  const fromVehicle = v => Object.assign({}, v, { townproject: v.town_project, year: v.year ? String(v.year) : "", modified: DX.day(v.modified) });
  const fromEntry = e => Object.assign({}, e, { townproject: e.town_project, date: DX.day(e.date), invoice_date: DX.day(e.invoice_date), vehicle_reading_km: e.vehicle_reading, total_repairing_amount: +e.repair_total || 0, repair_items: (e.repair_items || []).map(r => ({ item_description: r.item_description || "", qty: +r.qty || 0, type: r.type || "Service", rate: +r.rate || 0, remarks: r.remarks || "", attachment: r.attachment || "" })) });
  // the suite's company (site_config ops_company, else the user default) wins when maintenance offers it
  const defCompany = () => { const names = B.companies.map(c => (c && typeof c === "object" ? c.value || c.name : c)), boot = DX.BOOT && DX.BOOT.company; return boot && names.includes(boot) ? boot : B.default_company || DX.M.defaultCompany; };
  // one boot payload feeds both docs; writes hand back a fresh boot too
  const apply = boot => {
    Object.assign(B, { companies: boot.companies || [], default_company: boot.default_company || "", town_projects: boot.town_projects || [], stores: boot.stores || [], suppliers: boot.suppliers || [], at: Date.now() });
    DX.store[vehicle.id] = { rows: (boot.vehicles || []).map(fromVehicle), seq: 0, loaded: Date.now() };
    DX.store[entry.id] = { rows: (boot.entries || []).map(fromEntry), seq: 0, loaded: Date.now() };
  };
  const bootData = async () => { if (!B.pending) B.pending = DX.call(API + "get_boot_data", {}, { get: true }).then(apply).finally(() => { B.pending = null; }); return B.pending; };
  DX.resolvers.push(v => (B.town_projects.find(t => t.name === v) || {}).label);
  const vName = id => { const v = DX.find(vehicle, id); return (v && v.vehicle_name) || id || ""; };
  const lastOf = (vn, exclude) => DX.rows(entry).filter(e => e.vehicle === vn && e.name !== exclude).sort((a, b) => b.date.localeCompare(a.date) || String(b.creation || "").localeCompare(String(a.creation || "")))[0];
  const total = d => DX.sum(d.repair_items || [], r => (+r.qty || 0) * (+r.rate || 0));
  const num = v => /^\d+(\.\d+)?$/.test(String(v == null ? "" : v).trim());

  const vehicle = {
    key: "vehicle", doctype: "Vehicle Master", dupField: "vehicle_number",
    entity: { singular: "Vehicle", plural: "Vehicles", title: r => r.vehicle_name || compName(r), sub: r => `${r.brand || "—"} · ${townLabel(r.townproject)}`, date: "modified" },
    newLabel: "Add vehicle", status: () => null,
    defaults: () => ({ company: defCompany(), year: String(new Date().getFullYear()) }),
    form: [{ id: "v", title: "Vehicle master", short: "Vehicle", icon: "truck", fields: [
      { f: "company", label: "Company", type: "link", options: () => B.companies }, { f: "model_name", label: "Model name", type: "text" },
      { f: "townproject", label: "Town / project", type: "link", parent: ["company"], options: d => B.town_projects.filter(t => !d.company || t.company === d.company).map(t => ({ value: t.name, label: t.label })) },
      { f: "year", label: "Purchase year", type: "link", options: () => Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => String(new Date().getFullYear() - i)) },
      { f: "vehicle_number", label: "Vehicle number", type: "text", req: true, lockOnEdit: true, ph: "e.g. MP-09 GH-1056", hint: "Unique — becomes the record name." },
      { f: "type_of_vehicle", label: "Type of vehicle", type: "link", options: TYPES },
      { f: "fuel_type", label: "Fuel type", type: "select", options: [{ value: "", label: "—" }, "DIESEL", "PETROL", "CNG", "ELECTRIC"] },
      { f: "brand", label: "Brand", type: "text" },
      { f: "vehicle_name", label: "Vehicle name", type: "computed", text: true, calc: compName, ph: "TYPE - MODEL - NUMBER" }
    ] }],
    api: {
      ttl: 60000,
      load: async () => { await bootData(); return DX.store[vehicle.id].rows; },
      save: async d => { const r = await DX.call(API + "save_vehicle", { data: DX.json({ name: d.name || "", company: d.company || "", model_name: d.model_name || "", town_project: d.townproject || "", year: d.year || "", vehicle_number: (d.vehicle_number || "").trim(), type_of_vehicle: d.type_of_vehicle || "", brand: d.brand || "", fuel_type: d.fuel_type || "", powerapps_id: d.powerapps_id || "" }) }); if (r.boot) apply(r.boot); return { name: r.name }; }
    }
  };
  const entry = {
    key: "entry", doctype: "Maintenance Entry", formDocs: ["entry", "vehicle"],
    entity: { singular: "Maintenance entry", plural: "Maintenance entries", title: r => `${r.service_type || ""} · ${vName(r.vehicle)}`, sub: r => `${townLabel(r.townproject)} · ${r.name}`, date: "date" },
    newLabel: "New maintenance entry", status: () => null, statusFilter: [],
    defaults: () => ({ company: defCompany(), date: DX.TODAY, service_type: "Regular Service", invoice_date: DX.TODAY, repair_items: [] }),
    form: [
      { id: "d", title: "Details", short: "Details", icon: "wrench", fields: [
        { f: "company", label: "Company", type: "link", options: () => B.companies },
        { f: "townproject", label: "Town / project", type: "link", req: true, parent: ["company"], options: d => B.town_projects.filter(t => !d.company || t.company === d.company).map(t => ({ value: t.name, label: t.label })) },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "service_type", label: "Service type", type: "select", options: SERVICE, span: 2 },
        { f: "store", label: "Store", type: "link", parent: ["townproject"], options: d => B.stores.filter(s => !d.townproject || s.town_project === d.townproject).map(s => s.name) },
        { f: "vehicle", label: "Vehicle", type: "link", req: true, span: 2, options: () => DX.rows(vehicle).map(v => ({ value: v.name, label: v.vehicle_name || v.name, sub: [v.brand, v.vehicle_number].filter(Boolean).join(" · ") })), searchPh: "Search type, model or number…",
          onSet: d => { const l = lastOf(d.vehicle, d.name); d.vehicle_reading_km = l ? +l.vehicle_reading_km || 0 : 0; } },
        { f: "vehicle_reading_km", label: "Current reading (KM)", type: "int", req: true, reqMsg: "Enter the current KM reading." },
        { f: "last", label: "Last recorded", type: "info", icon: "clock", span: 2, html: d => { if (!d.vehicle) return "Select a vehicle to see its last reading."; const l = lastOf(d.vehicle, d.name); return l ? `Last recorded: <b class="dx-mono">${nf(l.vehicle_reading_km)} KM</b> (<span class="dx-mono">${esc(l.name)}</span>, ${DX.fmtDate(l.date)}) — the new reading can’t be lower.` : "No previous reading found for this vehicle."; } },
        { f: "next_service_km", label: "Next service KM", type: "int", showIf: d => SCHEDULED.includes(d.service_type) }
      ] },
      { id: "i", title: "Invoice", short: "Invoice", icon: "card", fields: [
        { f: "vendor_name", label: "Vendor name", type: "link", options: () => B.suppliers, hint: "Suppliers in group “Maintenance Vendor”." }, { f: "invoice_no", label: "Invoice no", type: "text" }, { f: "invoice_date", label: "Invoice date", type: "date" },
        { f: "invoice_attachment", label: "Invoice attachment", type: "photo", icon: "card", accept: "image/*,application/pdf" }, { f: "remark", label: "Remark", type: "textarea", span: 2 }
      ] },
      { id: "r", title: "Repair items", short: "Repairs", icon: "box", tone: "cyan", fields: [
        { f: "repair_items", label: "Repair items", type: "table", span: "all", minRows: 1, rowLabel: "repair item", newRow: () => ({ item_description: "", qty: 1, type: "Service", rate: 0, remarks: "" }),
          columns: [{ f: "item_description", label: "Item description", type: "text" }, { f: "qty", label: "Qty", type: "float" }, { f: "type", label: "Type", type: "select", options: ["Spare Part", "Service", "Labour"] }, { f: "rate", label: "Rate (₹)", type: "float" }, { f: "amount", label: "Amount (₹)", calc: r => (+r.qty || 0) * (+r.rate || 0), total: true }, { f: "remarks", label: "Remarks", type: "text" }] },
        { f: "total_repairing_amount", label: "Repair total", type: "computed", money: true, d: 2, calc: total }
      ] }
    ],
    validate: d => { const e = {}; const l = d.vehicle && lastOf(d.vehicle, d.name); if (l && +d.vehicle_reading_km < +l.vehicle_reading_km) e.vehicle_reading_km = `Reading can’t be less than the last reading (${nf(l.vehicle_reading_km)} KM, ${l.name}).`; if (+d.vehicle_reading_km < 0) e.vehicle_reading_km = "Current Reading (KM) cannot be negative."; if ((d.repair_items || []).some(r => !(+r.qty > 0) || !(+r.rate > 0) || !num(r.qty) || !num(r.rate))) e.repair_items = "Every repair item needs a quantity and rate above 0 (plain numbers)."; if (!SCHEDULED.includes(d.service_type)) d.next_service_km = 0; return e; },
    formNote: d => `${(d.repair_items || []).length} repair items · <b>${DX.money(total(d), 2)}</b>`,
    detailExtra: d => (d.invoice_attachment ? `<div class="dx-note">${DX.ic("file", 16)}<div>Invoice attachment: <a class="dx-link" href="${esc(d.invoice_attachment)}" target="_blank" rel="noopener">${esc(String(d.invoice_attachment).split("/").pop())}</a></div></div>` : ""),
    api: {
      ttl: 60000,
      load: async () => { await bootData(); return DX.store[entry.id].rows; },
      save: async d => {
        const data = { name: d.name || "", company: d.company || "", town_project: d.townproject || "", date: d.date, service_type: d.service_type, store: d.store || "", vehicle: d.vehicle, vehicle_reading: String(parseInt(d.vehicle_reading_km, 10) || 0), vehicle_location: "", vendor_name: d.vendor_name || "", invoice_no: d.invoice_no || "", invoice_date: d.invoice_date || "", invoice_attachment: d.invoice_attachment || "", next_service_km: SCHEDULED.includes(d.service_type) ? String(parseInt(d.next_service_km, 10) || 0) : "", remark: d.remark || "" };
        const items = (d.repair_items || []).map(r => ({ item_description: r.item_description || "", qty: String(+r.qty), type: r.type || "Service", rate: String(+r.rate), amount: (+r.qty || 0) * (+r.rate || 0), remarks: r.remarks || "", attachment: r.attachment || "" }));
        const r = await DX.call(API + "save_maintenance_entry", { data: DX.json(data), repair_items: DX.json(items) });
        if (r.boot) apply(r.boot);
        return { name: r.name };
      }
    }
  };
  // Upcoming service: latest reading vs next-service KM, avg km/day from reading history
  const upcoming = () => DX.rows(vehicle).map(v => {
    const es = DX.rows(entry).filter(e => e.vehicle === v.name && +e.vehicle_reading_km > 0).sort((a, b) => b.date.localeCompare(a.date));
    const sched = DX.rows(entry).filter(e => e.vehicle === v.name && SCHEDULED.includes(e.service_type) && +e.next_service_km > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!es.length || !sched) return null;
    const latest = es[0], earlier = es.find(e => e.date < latest.date && +e.vehicle_reading_km <= +latest.vehicle_reading_km);
    const days = earlier ? (new Date(latest.date) - new Date(earlier.date)) / 864e5 : 0, perDay = days ? (latest.vehicle_reading_km - earlier.vehicle_reading_km) / days : 40;
    const remaining = sched.next_service_km - latest.vehicle_reading_km, due = Math.ceil(remaining / Math.max(perDay, 1));
    return { v, cur: +latest.vehicle_reading_km, next: +sched.next_service_km, remaining, due, last: sched };
  }).filter(x => x && (x.remaining <= 0 || x.due <= 10)).sort((a, b) => a.due - b.due || a.remaining - b.remaining);
  const inRange = () => DX.rows(entry).filter(e => e.date >= DX.addDays(DX.TODAY, -30));

  DX.register({
    key: "maint", title: "Maintenance Master", short: "Maintenance", icon: "wrench", hue: "rose", route: "/desk/dux-maintenance-master",
    desc: "Vehicle master · service & repair entries", eyebrow: "Maintenance", headline: `Maintenance <span class="dx-grad">dashboard</span>`,
    intro: "Every service, breakdown, accident and tyre change per vehicle — with the invoice and repair items. The last-reading guard stops a KM reading from going down.",
    docs: [entry, vehicle],
    kpis: () => { const r = inRange(), amt = DX.sum(r, "total_repairing_amount"); return [
      { label: "Total vehicles", value: nf(DX.rows(vehicle).length), sub: "in Vehicle Master", icon: "truck" },
      { label: "Maintenance entries", value: nf(r.length), sub: "last 30 days", icon: "list", tone: "cyan" },
      { label: "Vehicles serviced", value: nf(new Set(r.map(e => e.vehicle)).size), sub: "distinct vehicles · 30 days", icon: "check", tone: "ok" },
      { label: "Total repair amount", value: DX.money(amt), sub: `Avg <span class="dx-num">${DX.money(r.length ? amt / r.length : 0)}</span> per entry`, icon: "rupee", tone: "pending" }
    ]; },
    panels: () => { const up = upcoming(), all = DX.rows(entry); const byType = SERVICE.map(s => ({ label: s, value: all.filter(e => e.service_type === s).length, sub: DX.money(DX.sum(all.filter(e => e.service_type === s), "total_repairing_amount")) })); const byV = {}; all.forEach(e => (byV[e.vehicle] = (byV[e.vehicle] || 0) + (+e.total_repairing_amount || 0)));
      return [
        DX.card("Upcoming service — next 10 days", up.length ? DX.table([{ label: "Vehicle", get: x => x.v.vehicle_name, strong: true, trunc: true }, { label: "Current KM", type: "num", get: x => x.cur }, { label: "Next service KM", type: "num", get: x => x.next }, { label: "Status", type: "status", get: x => (x.remaining <= 0 ? DX.status(`Overdue by ${nf(-x.remaining)} KM`, "err") : DX.status(`Due in ~${x.due} days (${nf(x.remaining)} KM)`, "pending")) }, { label: "Last service", get: x => `${x.last.service_type} · ${DX.fmtDate(x.last.date)}` }], up) : DX.empty("Nothing due", "No vehicles are estimated to be due for service within the next 10 days."), { icon: "calendar", tone: "pending", sub: "from KM readings" }),
        `<section class="dx-cols">${DX.card("Service type-wise summary", DX.bars(byType, { unit: "entries" }), { icon: "layers", tone: "cyan" })}${DX.card("Repair amount by vehicle", DX.bars(Object.entries(byV).map(([k, v]) => ({ label: vName(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: v => DX.money(v) }), { icon: "rupee" })}</section>`
      ]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "entry" },
      { id: "vehicles", label: "Vehicle master", icon: "truck", type: "list", doc: "vehicle", dateFilter: false, count: () => DX.rows(vehicle).length, searchPh: "Search number, name, brand, model…", search: [r => r.vehicle_number, r => r.vehicle_name, r => r.brand, r => r.model_name, r => r.type_of_vehicle],
        filters: [{ f: "type_of_vehicle", label: "Type of vehicle", options: TYPES }, { f: "townproject", label: "Town / project", options: () => B.town_projects.map(t => ({ value: t.name, label: t.label })), display: townLabel }],
        columns: [{ f: "vehicle_name", label: "Vehicle name", strong: true, trunc: true }, { f: "vehicle_number", label: "Vehicle number", type: "mono" }, { f: "type_of_vehicle", label: "Type" }, { f: "brand", label: "Brand" }, { f: "model_name", label: "Model", hideSm: true }, { f: "year", label: "Year", type: "mono" }, { label: "Town / project", get: r => townLabel(r.townproject), trunc: true }] },
      { id: "entries", label: "Maintenance entry", icon: "list", type: "list", doc: "entry", docs: ["entry", "vehicle"], count: () => DX.rows(entry).length, searchPh: "Search entry, vehicle, vendor, invoice…", search: [r => r.name, r => vName(r.vehicle), r => r.vendor_name, r => r.invoice_no, r => r.service_type],
        filters: [{ f: "service_type", label: "Service type", options: SERVICE }], sum: rows => `<span class="dx-num">${DX.money(DX.sum(rows, "total_repairing_amount"))}</span>`,
        columns: [{ f: "name", label: "Maintenance entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Vehicle", get: r => vName(r.vehicle), trunc: true }, { f: "service_type", label: "Service type" }, { f: "vendor_name", label: "Vendor", trunc: true }, { f: "invoice_no", label: "Invoice no", type: "mono" }, { f: "total_repairing_amount", label: "Repair total", type: "money" }] },
      { id: "new", label: "New entry", icon: "plus", type: "form", doc: "entry" },
      { id: "report", label: "Report", icon: "chart", type: "report", doc: "entry", group: "Insights", days: 30, docs: ["entry", "vehicle"], filters: [{ f: "service_type", label: "Service type", options: SERVICE }],
        kpis: rows => [{ label: "Maintenance entries", value: nf(rows.length), icon: "list" }, { label: "Vehicles serviced", value: nf(new Set(rows.map(e => e.vehicle)).size), icon: "truck", tone: "cyan" }, { label: "Total repair amount", value: DX.money(DX.sum(rows, "total_repairing_amount")), icon: "rupee", tone: "ok" }, { label: "Average per entry", value: DX.money(rows.length ? DX.sum(rows, "total_repairing_amount") / rows.length : 0), icon: "chart" }],
        before: rows => `<section class="dx-cols" style="margin-bottom:16px">${DX.card("Service type distribution", DX.bars(SERVICE.map(s => ({ label: s, value: rows.filter(e => e.service_type === s).length }))), { icon: "layers", tone: "cyan" })}${DX.card("Repair amount by vehicle", DX.bars(Object.entries(rows.reduce((m, e) => ((m[e.vehicle] = (m[e.vehicle] || 0) + (+e.total_repairing_amount || 0)), m), {})).map(([k, v]) => ({ label: vName(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: v => DX.money(v) }), { icon: "rupee" })}</section>`,
        columns: [{ f: "name", label: "Maintenance entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Vehicle", get: r => vName(r.vehicle), trunc: true }, { f: "service_type", label: "Service type" }, { f: "vendor_name", label: "Vendor", trunc: true }, { f: "invoice_no", label: "Invoice no", type: "mono" }, { f: "total_repairing_amount", label: "Repair total", type: "money", total: true }] }
    ]
  });
})();
