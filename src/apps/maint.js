/* DUX Maintenance Master (dux_maintenance_master · page dux-maintenance-master). Entries are drafts only — saving posts no stock. */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc } = DX;
  const TYPES = ["BIKE", "CAR", "BACKHOE LOADER", "HYVA", "AJAX FIORI", "MINI Excavator", "EXCAVATOR", "MILLER", "MOBILE CONCRETE MIXTURE PLANT", "PICKUP", "BOLERO", "BOLERO PICKUP", "TRACTOR-1", "TRACTOR TROLLY", "HYDRA CRANE", "CONCRETE PUMP", "CONCRETE MIXTURE", "GENERATOR", "BREAKER", "BUTT FUSION", "HYDRO TESTING PUMP", "WATER PUMP", "CRANE", "TRUCK", "BULLDOZER", "VIBRATOR MACHINE"];
  const SERVICE = ["Regular Service", "Breakdown Repair", "Accident Repair", "Tyre Change"];
  const SCHEDULED = ["Regular Service", "Tyre Change"];
  const VENDORS = ["LOCAL PARTY", "LOCAL MECHANIC", "LOCAL VENDOR", "New Indore Earthmovers", "JABBAR AUTO ELECTRICALS", "AYUSH ENTERPRISES", "MONU MACHINERY STORE", "LEYLAND AUTO GARAGE", "NEW RAJAT AUTO PARTS", "Kisan Auto Parts", "RYAN ENGINEERING", "SAI BABA ENGINEERING WORKSHOP", "OSAKA TYRES", "CHOURASIA TYRES & TROLLEY", "Singhal Auto Parts", "RAAJ DIESELS"];
  const WORK = ["OIL FILTER, FUEL FILTER, AIR FILTER SET, ENGINE OIL-15 LTR CHANGE", "ALTERNATOR REPAIR CHARGES PART WITH LABOUR BOTH", "HYDRAULIC PIPE REPAIRING & WELDING CHARGES", "REAR TYRE, TUBE & FLAP PURCHASE", "FIP & NOZZLE REPAIRING CHARGES", "BUCKET PIN WITH NUT BOLT PURCHASE", "PUNCTURE CHARGES", "NEW SELF STARTOR PURCHASE", "BATTERY CHARGE AMOUNT"];
  const MT_TOWNS = ["TN-114", "TN-17", "TN-9001", "TN-10", "TN-08", "TN-35872", "TN-161", "TN-09", "TN-11", "TN-141"];
  const compName = v => [v.type_of_vehicle, v.model_name, v.vehicle_number].filter(Boolean).join(" - ");

  const vehicle = {
    key: "vehicle", doctype: "Vehicle Master", naming: d => d.vehicle_number.trim().toUpperCase(), dupField: "vehicle_number",
    entity: { singular: "Vehicle", plural: "Vehicles", title: r => r.vehicle_name || compName(r), sub: r => `${r.brand || "—"} · ${M.townLabel(r.townproject)}`, date: "modified" },
    newLabel: "Add vehicle", status: () => null,
    defaults: () => ({ company: M.companies[0][0], year: String(new Date().getFullYear()) }),
    form: [{ id: "v", title: "Vehicle master", short: "Vehicle", icon: "truck", fields: [
      { f: "company", label: "Company", type: "link", options: M.companyOpts }, { f: "model_name", label: "Model name", type: "text" },
      { f: "townproject", label: "Town / project", type: "link", parent: ["company"], options: () => M.townOpts(t => MT_TOWNS.includes(t.id)) },
      { f: "year", label: "Purchase year", type: "link", options: () => Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => String(new Date().getFullYear() - i)) },
      { f: "vehicle_number", label: "Vehicle number", type: "text", req: true, lockOnEdit: true, ph: "e.g. MP-09 GH-1056", hint: "Unique — becomes the record name." },
      { f: "type_of_vehicle", label: "Type of vehicle", type: "link", options: TYPES },
      { f: "fuel_type", label: "Fuel type", type: "select", options: [{ value: "", label: "—" }, "DIESEL", "PETROL", "CNG", "ELECTRIC"] },
      { f: "brand", label: "Brand", type: "text" },
      { f: "vehicle_name", label: "Vehicle name", type: "computed", text: true, calc: compName, ph: "TYPE - MODEL - NUMBER" }
    ] }],
    seed: () => [["MP-09 GH-1056", "BACKHOE LOADER", "TH 86", "TATA HITACHI", "TN-17"], ["MP-09 GH 9205", "BACKHOE LOADER", "SHINRAI BX 80", "TATA HITACHI", "TN-114"], ["MP-09 GH-9186", "BACKHOE LOADER", "SHINRAI BX 80", "TATA HITACHI", "TN-10"], ["MP-13 DA-0857", "BACKHOE LOADER", "4 AXLE", "JCB", "TN-08"], ["MP-09 HH-1874", "HYVA", "LX 2523", "TATA", "TN-114"], ["MP-09 HH-2336", "HYVA", "2518T", "ASHOK LEYLAND", "TN-9001"], ["MP-09 HH-2118", "HYVA", "PRO 6025T", "EICHER", "TN-9001"], ["MP-09 HH-1972", "MILLER", "TERRA 25G", "EICHER", "TN-161"], ["CG-10 DA-3475", "HYDRA CRANE", "LIFT TALL", "JCB", "TN-35872"], ["MP-09 CC-6629", "CAR", "SWIFT", "MARUTI", "TN-35872"], ["MP-13 ZV-2471", "CAR", "HARRIER", "TATA", "TN-17"], ["CG-10-R-1350", "BOLERO", "MAX PICKUP", "MAHINDRA", "TN-09"], ["MP-13 AC-3187", "TRACTOR-1", "7250 DI", "MESSEY FERGUSON", "TN-11"], ["PA-29", "EXCAVATOR", "EC210B", "VOLVO", "TN-114"], ["PA-25", "EXCAVATOR", "JS-140", "JCB", "TN-10"], ["PA-54", "AJAX FIORI", "AGRO 2000", "AJAX", "TN-141"], ["MP-09-QS-9429", "BIKE", "CD 110", "HONDA", "TN-17"]]
      .map(([n, t, m, b, town], i) => ({ name: n, vehicle_number: n, type_of_vehicle: t, model_name: `${m} [${b}]`, brand: b, townproject: town, company: M.companies[0][0], year: String(2016 + (i % 9)), fuel_type: t === "BIKE" || t === "CAR" ? "PETROL" : "DIESEL", vehicle_name: compName({ type_of_vehicle: t, model_name: `${m} [${b}]`, vehicle_number: n }), modified: DX.addDays(DX.TODAY, -60 + i) }))
  };
  const lastOf = (vn, exclude) => DX.rows(entry).filter(e => e.vehicle === vn && e.name !== exclude && +e.vehicle_reading_km > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  const total = d => DX.sum(d.repair_items || [], r => (+r.qty || 0) * (+r.rate || 0));

  const entry = {
    key: "entry", doctype: "Maintenance Entry", seqStart: 899, naming: (d, n) => "ME-" + String(n).padStart(4, "0"),
    entity: { singular: "Maintenance entry", plural: "Maintenance entries", title: r => `${r.service_type} · ${(DX.find(vehicle, r.vehicle) || {}).vehicle_name || r.vehicle}`, sub: r => `${M.townLabel(r.townproject)} · ${r.name}`, date: "date" },
    newLabel: "New maintenance entry", status: () => null, statusFilter: [],
    defaults: () => ({ company: M.companies[0][0], date: DX.TODAY, service_type: "Regular Service", invoice_date: DX.TODAY, repair_items: [] }),
    form: [
      { id: "d", title: "Details", short: "Details", icon: "wrench", fields: [
        { f: "company", label: "Company", type: "link", options: M.companyOpts },
        { f: "townproject", label: "Town / project", type: "link", req: true, parent: ["company"], options: () => M.townOpts(t => MT_TOWNS.includes(t.id)) },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "service_type", label: "Service type", type: "select", options: SERVICE, span: 2 },
        { f: "store", label: "Store", type: "link", parent: ["townproject"], options: d => [M.store(d.townproject)] },
        { f: "vehicle", label: "Vehicle", type: "link", req: true, parent: ["townproject"], span: 2, options: () => DX.rows(vehicle).map(v => ({ value: v.name, label: v.vehicle_name, sub: v.brand })), searchPh: "Search type, model or number…",
          onSet: d => { const l = lastOf(d.vehicle, d.name); d.vehicle_reading_km = l ? +l.vehicle_reading_km : 0; } },
        { f: "vehicle_reading_km", label: "Current reading (KM)", type: "int", req: true, reqMsg: "Enter the current KM reading." },
        { f: "last", label: "Last recorded", type: "info", icon: "gauge", span: 2, html: d => { if (!d.vehicle) return "Select a vehicle to see its last reading."; const l = lastOf(d.vehicle, d.name); return l ? `Last recorded: <b class="dx-mono">${nf(l.vehicle_reading_km)} KM</b> (<span class="dx-mono">${esc(l.name)}</span>) — the new reading can’t be lower.` : "No previous reading found for this vehicle."; } },
        { f: "next_service_km", label: "Next service KM", type: "int", showIf: d => SCHEDULED.includes(d.service_type) }
      ] },
      { id: "i", title: "Invoice", short: "Invoice", icon: "card", fields: [
        { f: "vendor_name", label: "Vendor name", type: "link", options: VENDORS, hint: "Suppliers in group “Maintenance Vendor”." }, { f: "invoice_no", label: "Invoice no", type: "text" }, { f: "invoice_date", label: "Invoice date", type: "date" },
        { f: "invoice_attachment", label: "Invoice attachment", type: "photo", icon: "card" }, { f: "remark", label: "Remark", type: "textarea", span: 2 }
      ] },
      { id: "r", title: "Repair items", short: "Repairs", icon: "box", tone: "cyan", fields: [
        { f: "repair_items", label: "Repair items", type: "table", span: "all", minRows: 1, rowLabel: "repair item", newRow: () => ({ item_description: "", qty: 1, type: "Service", rate: 0, remarks: "" }),
          columns: [{ f: "item_description", label: "Item description", type: "text" }, { f: "qty", label: "Qty", type: "float" }, { f: "type", label: "Type", type: "select", options: ["Spare Part", "Service", "Labour"] }, { f: "rate", label: "Rate (₹)", type: "float" }, { f: "amount", label: "Amount (₹)", calc: r => (+r.qty || 0) * (+r.rate || 0), total: true }, { f: "remarks", label: "Remarks", type: "text" }] },
        { f: "total_repairing_amount", label: "Repair total", type: "computed", money: true, d: 2, calc: total }
      ] }
    ],
    validate: d => { const e = {}; const l = d.vehicle && lastOf(d.vehicle, d.name); if (l && +d.vehicle_reading_km < +l.vehicle_reading_km) e.vehicle_reading_km = `Reading can’t be less than the last reading (${nf(l.vehicle_reading_km)} KM, ${l.name}).`; if ((d.repair_items || []).some(r => !(+r.qty > 0) || !(+r.rate > 0))) e.repair_items = "Every repair item needs a quantity and rate above 0."; if (!SCHEDULED.includes(d.service_type)) d.next_service_km = 0; return e; },
    formNote: d => `${(d.repair_items || []).length} repair items in draft · <b>${DX.money(total(d), 2)}</b>`,
    seed: () => { const g = DX.seeder(899), vs = vehicle.seed(), out = [], km = {}; vs.forEach(v => (km[v.name] = g.int(8000, 60000)));
      for (let i = 0; i < 48; i++) { const v = g.pick(vs), st = g.chance(.8) ? "Breakdown Repair" : g.chance(.6) ? "Regular Service" : "Tyre Change", amt = g.chance(.1) ? g.int(20000, 90000) : g.int(300, 9000); km[v.name] += g.int(150, 900);
        out.push({ name: "ME-" + String(850 + i).padStart(4, "0"), date: DX.addDays(DX.TODAY, -g.int(0, 75)), company: M.companies[0][0], townproject: v.townproject, store: M.store(v.townproject), service_type: st, vehicle: v.name, vehicle_reading_km: g.chance(.6) ? km[v.name] : 0, next_service_km: SCHEDULED.includes(st) ? km[v.name] + g.int(200, 3000) : 0, vendor_name: g.pick(VENDORS), invoice_no: g.chance(.6) ? "INV-" + g.int(100, 999) : "", invoice_date: DX.TODAY, repair_items: [{ item_description: st === "Tyre Change" ? "REAR TYRE, TUBE & FLAP PURCHASE" : g.pick(WORK), qty: 1, type: "Service", rate: amt, remarks: "" }] }); }
      return out.map(e => Object.assign(e, { total_repairing_amount: total(e) })); }
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
      { label: "Vehicles serviced", value: nf(new Set(r.map(e => e.vehicle)).size), sub: "distinct vehicles", icon: "check", tone: "ok" },
      { label: "Total repair amount", value: DX.money(amt), sub: `Avg <span class="dx-num">${DX.money(r.length ? amt / r.length : 0)}</span> per entry`, icon: "rupee", tone: "pending" }
    ]; },
    panels: () => { const up = upcoming(), all = DX.rows(entry); const byType = SERVICE.map(s => ({ label: s, value: all.filter(e => e.service_type === s).length, sub: DX.money(DX.sum(all.filter(e => e.service_type === s), "total_repairing_amount")) })); const byV = {}; all.forEach(e => (byV[e.vehicle] = (byV[e.vehicle] || 0) + (+e.total_repairing_amount || 0)));
      return [
        DX.card("Upcoming service — next 10 days", up.length ? DX.table([{ label: "Vehicle", get: x => x.v.vehicle_name, strong: true, trunc: true }, { label: "Current KM", type: "num", get: x => x.cur }, { label: "Next service KM", type: "num", get: x => x.next }, { label: "Status", type: "status", get: x => (x.remaining <= 0 ? DX.status(`Overdue by ${nf(-x.remaining)} KM`, "err") : DX.status(`Due in ~${x.due} days (${nf(x.remaining)} KM)`, "pending")) }, { label: "Last service", get: x => `${x.last.service_type} · ${DX.fmtDate(x.last.date)}` }], up) : DX.empty("Nothing due", "No vehicles are estimated to be due for service within the next 10 days."), { icon: "calendar", tone: "pending", sub: "from KM readings" }),
        `<section class="dx-cols">${DX.card("Service type-wise summary", DX.bars(byType, { unit: "entries" }), { icon: "layers", tone: "cyan" })}${DX.card("Repair amount by vehicle", DX.bars(Object.entries(byV).map(([k, v]) => ({ label: (DX.find(vehicle, k) || {}).vehicle_name || k, value: v })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: v => DX.money(v) }), { icon: "rupee" })}</section>`
      ]; },
    homeStat: () => ({ value: nf(upcoming().length), label: "vehicles due for service" }),
    attention: () => upcoming().slice(0, 4).map(x => ({ title: x.v.vehicle_name, sub: x.remaining <= 0 ? `Overdue by ${nf(-x.remaining)} KM` : `Due in ~${x.due} days`, go: "maint/dashboard", tag: x.remaining <= 0 ? "Overdue" : "Service due", tone: x.remaining <= 0 ? "err" : "pending" })),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "entry" },
      { id: "vehicles", label: "Vehicle master", icon: "truck", type: "list", doc: "vehicle", dateFilter: false, count: () => DX.rows(vehicle).length, searchPh: "Search number, name, brand, model…", search: [r => r.vehicle_number, r => r.vehicle_name, r => r.brand, r => r.model_name, r => r.type_of_vehicle],
        filters: [{ f: "type_of_vehicle", label: "Type of vehicle", options: TYPES }, { f: "townproject", label: "Town / project", options: () => M.townOpts(t => MT_TOWNS.includes(t.id)), display: M.townLabel }],
        columns: [{ f: "vehicle_name", label: "Vehicle name", strong: true, trunc: true }, { f: "vehicle_number", label: "Vehicle number", type: "mono" }, { f: "type_of_vehicle", label: "Type" }, { f: "brand", label: "Brand" }, { f: "model_name", label: "Model", hideSm: true }, { f: "year", label: "Year", type: "mono" }, { label: "Town / project", get: r => M.townLabel(r.townproject), trunc: true }] },
      { id: "entries", label: "Maintenance entry", icon: "list", type: "list", doc: "entry", count: () => DX.rows(entry).length, searchPh: "Search entry, vehicle, vendor, invoice…", search: [r => r.name, r => (DX.find(vehicle, r.vehicle) || {}).vehicle_name, r => r.vendor_name, r => r.invoice_no, r => r.service_type],
        filters: [{ f: "service_type", label: "Service type", options: SERVICE }], sum: rows => `<span class="dx-num">${DX.money(DX.sum(rows, "total_repairing_amount"))}</span>`,
        columns: [{ f: "name", label: "Maintenance entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Vehicle", get: r => (DX.find(vehicle, r.vehicle) || {}).vehicle_name || r.vehicle, trunc: true }, { f: "service_type", label: "Service type" }, { f: "vendor_name", label: "Vendor", trunc: true }, { f: "invoice_no", label: "Invoice no", type: "mono" }, { f: "total_repairing_amount", label: "Repair total", type: "money" }] },
      { id: "new", label: "New entry", icon: "plus", type: "form", doc: "entry" },
      { id: "report", label: "Report", icon: "chart", type: "report", doc: "entry", group: "Insights", days: 30, filters: [{ f: "service_type", label: "Service type", options: SERVICE }],
        kpis: rows => [{ label: "Maintenance entries", value: nf(rows.length), icon: "list" }, { label: "Vehicles serviced", value: nf(new Set(rows.map(e => e.vehicle)).size), icon: "truck", tone: "cyan" }, { label: "Total repair amount", value: DX.money(DX.sum(rows, "total_repairing_amount")), icon: "rupee", tone: "ok" }, { label: "Average per entry", value: DX.money(rows.length ? DX.sum(rows, "total_repairing_amount") / rows.length : 0), icon: "chart" }],
        before: rows => `<section class="dx-cols" style="margin-bottom:16px">${DX.card("Service type distribution", DX.bars(SERVICE.map(s => ({ label: s, value: rows.filter(e => e.service_type === s).length }))), { icon: "layers", tone: "cyan" })}${DX.card("Repair amount by vehicle", DX.bars(Object.entries(rows.reduce((m, e) => ((m[e.vehicle] = (m[e.vehicle] || 0) + (+e.total_repairing_amount || 0)), m), {})).map(([k, v]) => ({ label: (DX.find(vehicle, k) || {}).vehicle_name || k, value: v })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: v => DX.money(v) }), { icon: "rupee" })}</section>`,
        columns: [{ f: "name", label: "Maintenance entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Vehicle", get: r => (DX.find(vehicle, r.vehicle) || {}).vehicle_name || r.vehicle, trunc: true }, { f: "service_type", label: "Service type" }, { f: "vendor_name", label: "Vendor", trunc: true }, { f: "invoice_no", label: "Invoice no", type: "mono" }, { f: "total_repairing_amount", label: "Repair total", type: "money", total: true }] }
    ]
  });
})();
