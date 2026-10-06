/* Fuel — two apps over the same vehicle_inhouse data:
   · "Fuel Inward & Direct Distribution" (page fuel-inward-direct-distribution): purchase at the pump, invoice approval, payment options.
   · "Fuel Stock Entry" (page fuel-stock-entry — on jewipl it redirects to the page above): the stock view — drum inward into the site store,
     issue to vehicles (Fuel Distribution), store-wise balance and ledger. Both share one store of Fuel for Stock + Fuel Distribution rows. */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc, ic } = DX;
  const COMPANIES = [["ACTIVE INFRASTRUCTURES LIMITED", "AIL"], ["Jain Engineering Works (India) Private Limited", "JEWPL"]];
  const FUEL_TOWNS = ["TN-17", "TN-16", "TN-18", "TN-012", "TN-005", "TN-08", "TN-09", "TN-11", "TN-114", "TN-141", "TN-142", "TN-138", "TN-161", "TN-214"];
  const townOpts = () => M.townOpts(t => FUEL_TOWNS.includes(t.id));
  const PUMPS = { "MPUSIP - 3C": ["Kamala Filling Station", "Patel Petroleum", "Nilesh Kissan Sewa Kendra", "Ram Bagh Kissan Sewa Kendra", "Shri Vinayak Fuel Station"], "MPUSIP - 6J": ["Aadi Mahadev Petroleum", "Agroha Petroleum", "Keshav Filling Station", "SCLS Filling Station", "Sai Kripa Filling Station", "Shri Ram Petrol Pump", "Jatashankar Filling Station"], "MPUSIP - 7C": ["Garg Fuels", "Shiv Filling Station", "Urmalia Petroleum"], "MPJNM - NP - II": ["Hamara Pump", "Yuvraj Petroleum", "Apna Petrol Pump", "Keshar Shanti Filling Station"] };
  const pumpsFor = town => (M.town(town) ? PUMPS[M.town(town).project] || [] : []);
  const VEHICLES = ["Tractor - Hatpipliya - 0141", "BX80 9205 (No.4)", "BX80 9186 (No.1)", "TH76 3493", "Backhoe Loader - JCB - 0952", "Pickup 5186", "Pickup 0649", "Ajax Fiori-2639-4m³", "Poclain-210", "DG B3197 (No.-1)", "Bike - Hatpipliya", "Transit Miller - 1972", "Hydra Crane - 3475"];
  const RATES = { Diesel: 100.5, Petrol: 114.1, CNG: 102 };
  const storeOf = (town, company) => M.store(town, (COMPANIES.find(c => c[0] === company) || [0, "AIL"])[1]);
  const advance = {}; Object.values(PUMPS).flat().forEach((p, i) => (advance[p] = i % 3 === 0 ? 0 : (i * 7919) % 25000));
  const lastReading = (vehicle, rows) => Math.max(0, ...rows.filter(r => r.custom_vehicles === vehicle || r.fd_vehicle_name === vehicle).map(r => +r.custom_current_reading_km || +r.vehicle_reading_km || 0));
  let docSeq = 5000;

  const inwardDoc = over => Object.assign({
    key: "inward", store: "fuel.inward", doctype: "Fuel for Stock", autoSubmit: true, seqStart: 32420, naming: (d, n) => "FS-" + n,
    entity: { singular: "Fuel entry", plural: "Fuel entries", title: r => `${r.fuel_entry_type === "Vehicle" ? "Direct · " + r.custom_vehicles : "Inward · " + r.warehouse}`, sub: r => `${nf(r.quantity, 2)} L ${r.types_of_fuel} · ${r.custom_petrol_pump} · ${r.name}`, date: "date" },
    newLabel: "Add fuel entry", saveLabel: "Save entry", saveToast: s => `Entry <span class="dx-mono">${esc(s.name)}</span> saved — Purchase Receipt submitted, invoice sent for approval.`,
    status: r => (r.pi_status === "Approved" ? ["Approved", "ok"] : ["Approval pending", "pending"]), statusKey: r => (r.pi_status === "Approved" ? "approved" : "pending"),
    statusFilter: [["", "All"], ["pending", "Approval pending"], ["approved", "Approved"]],
    defaults: () => ({ fuel_entry_type: "Drum", date: DX.TODAY, company: COMPANIES[0][0], types_of_fuel: "Diesel", direct_reading_status: "Working", rateltr_ffs: RATES.Diesel }),
    form: [
      { id: "f", title: "Fuel inward / direct distribution", short: "Entry", sub: "complete each required field before saving", icon: "fuel", fields: [
        { f: "fuel_entry_type", label: "Fuel mode", type: "select", req: true, options: [{ value: "Drum", label: "Fuel inward (drum)" }, { value: "Vehicle", label: "Direct distribution (vehicle)" }], span: 2 },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "company", label: "Company", type: "link", req: true, options: COMPANIES.map(([c, a]) => ({ value: c, label: c, sub: a })) },
        { f: "fuel_station_town_name", label: "Town / project name", type: "link", req: true, options: townOpts, parent: ["company"] },
        { f: "custom_petrol_pump", label: "Petrol pump", type: "link", req: true, parent: ["fuel_station_town_name"], options: d => pumpsFor(d.fuel_station_town_name) },
        { f: "adv", label: "Supplier advance / outstanding", type: "info", icon: "rupee", html: d => { if (!d.custom_petrol_pump) return "Pick a petrol pump to see the supplier’s balance."; const a = advance[d.custom_petrol_pump] || 0; return a > 0 ? `Current supplier advance <b class="dx-mono">${DX.money(a, 2)}</b> · Outstanding payable <b class="dx-mono">₹0.00</b>` : `Current supplier advance <b class="dx-mono">₹0.00</b> · Outstanding payable <b class="dx-mono">${DX.money(3200, 2)}</b>`; }, span: 2 },
        { f: "custom_vehicles", label: "Vehicle name", type: "link", options: VEHICLES, showIf: d => d.fuel_entry_type === "Vehicle", onSet: d => (d.last_reading_km = lastReading(d.custom_vehicles, DX.rows({ id: "fuel.inward" }))) },
        { f: "direct_reading_status", label: "Reading status", type: "select", options: ["Working", "Not Working"], showIf: d => d.fuel_entry_type === "Vehicle" },
        { f: "custom_current_reading_km", label: "Current reading (KM)", type: "float", showIf: d => d.fuel_entry_type === "Vehicle" && d.direct_reading_status === "Working" },
        { f: "last_info", label: "Last reading", type: "info", icon: "gauge", showIf: d => d.fuel_entry_type === "Vehicle", html: d => d.custom_vehicles ? `Last reading <b class="dx-mono">${nf(d.last_reading_km || 0)} KM</b> — current must be greater.` : "Pick a vehicle to see its last reading." },
        { f: "types_of_fuel", label: "Types of fuel", type: "select", req: true, options: ["Diesel", "Petrol", "CNG"], onSet: d => (d.rateltr_ffs = RATES[d.types_of_fuel]) },
        { f: "quantity", label: "Quantity", type: "float", unit: "L", req: true },
        { f: "rateltr_ffs", label: "Rate", type: "float", unit: "₹/L", req: true },
        { f: "amount", label: "Amount", type: "computed", money: true, d: 2, calc: d => (+d.quantity || 0) * (+d.rateltr_ffs || 0), formula: "quantity × rate" },
        { f: "wh", label: "Store", type: "info", icon: "building", html: d => d.fuel_station_town_name ? `Store resolved automatically: <b class="dx-mono">${esc(storeOf(d.fuel_station_town_name, d.company))}</b>` : "Store is resolved from the town once you pick it." },
        { f: "custom_remark", label: "Remark", type: "text", req: true, span: 2 }
      ] },
      { id: "p", title: "Upload proof of purchase", short: "Proof", icon: "camera", cols: 4, fields: [
        { f: "upload_invoice__invoice_copy", label: "Invoice copy", type: "photo", icon: "card", hint: "Optional — can be uploaded later" },
        { f: "upload_fuel_station_proof__fuel_station_receipt", label: "Fuel station proof", type: "photo", req: true, icon: "fuel" },
        { f: "custom_upload_vehicle_reading", label: "Vehicle reading", type: "photo", icon: "gauge" },
        { f: "custom_qr_attachment", label: "QR attachment", type: "photo", icon: "grid" }
      ] }
    ],
    validate: d => { const e = {}; if (d.fuel_entry_type === "Vehicle") { if (!d.custom_vehicles) e.custom_vehicles = "Pick the vehicle."; if (d.direct_reading_status === "Working" && !(+d.custom_current_reading_km > (+d.last_reading_km || 0))) e.custom_current_reading_km = `Reading must be greater than last reading (${nf(d.last_reading_km || 0)} KM).`; } return e; },
    formNote: d => `${d.fuel_entry_type === "Vehicle" ? "Direct distribution · PR + PI + Material Issue" : "Fuel inward · PR + PI (stock into store)"} · <b>${DX.money((+d.quantity || 0) * (+d.rateltr_ffs || 0))}</b>`,
    onCreate: d => { d.warehouse = storeOf(d.fuel_station_town_name, d.company); d.amount = (+d.quantity || 0) * (+d.rateltr_ffs || 0); d.pr = "MAT-PRE-2026-0" + docSeq++; d.pi = "ACC-PINV-2026-0" + docSeq++; d.pi_status = "Approval pending"; if (d.fuel_entry_type === "Vehicle") d.mi = "MAT-STE-2026-0" + docSeq++; },
    detailActions: d => [d.pi_status !== "Approved" && { label: "Approve invoice", icon: "check", tone: "primary", run: x => approve(x) }, d.pi_status !== "Approved" && !d.payment_choice && { label: "Payment options", icon: "rupee", run: x => payOptions(x) }],
    detailExtra: d => DX.card("Documents", `<div class="dx-kv"><div class="k">Purchase Receipt</div><div class="v"><span class="dx-link">${esc(d.pr)}</span>${DX.status("Submitted", "ok")}</div><div class="k">Purchase Invoice</div><div class="v"><span class="dx-link">${esc(d.pi)}</span>${d.pi_status === "Approved" ? DX.status("Submitted", "ok") : DX.status("Draft · approval pending", "pending")}</div>${d.mi ? `<div class="k">Material Issue</div><div class="v"><span class="dx-link">${esc(d.mi)}</span>${DX.status("Submitted", "ok")}</div>` : ""}${d.payment_choice ? `<div class="k">Payment choice</div><div class="v">${esc(d.payment_choice)}</div>` : ""}<div class="k">Store</div><div class="v dx-mono">${esc(d.warehouse)}</div></div>`, { icon: "card", tone: "cyan", sub: "created automatically on save" }) + "<div style='height:16px'></div>",
    seed: () => { const g = DX.seeder(780), out = []; for (let i = 0; i < 40; i++) { const town = g.pick(FUEL_TOWNS), veh = g.chance(.62), fuel = veh ? (g.chance(.8) ? "Diesel" : "Petrol") : "Diesel", q = veh ? g.flt(5, 60, 2) : g.flt(80, 400, 0), rate = RATES[fuel] + g.flt(-1, 1), pump = g.pick(pumpsFor(town)), app = g.chance(.72);
        out.push({ name: "FS-" + (32380 + i), docstatus: 1, fuel_entry_type: veh ? "Vehicle" : "Drum", date: DX.addDays(DX.TODAY, -g.int(0, 34)), company: COMPANIES[g.chance(.85) ? 0 : 1][0], fuel_station_town_name: town, custom_petrol_pump: pump, custom_vehicles: veh ? g.pick(VEHICLES) : "", direct_reading_status: "Working", custom_current_reading_km: veh ? g.int(4000, 92000) : 0, types_of_fuel: fuel, quantity: q, rateltr_ffs: +rate.toFixed(2), amount: q * rate, custom_remark: veh ? "Fuel filled at pump" : "Drum inward for site", warehouse: storeOf(town, COMPANIES[0][0]), upload_fuel_station_proof__fuel_station_receipt: "demo:fuel", upload_invoice__invoice_copy: g.chance(.7) ? "demo:card" : "", pr: "MAT-PRE-2026-0" + (4000 + i), pi: "ACC-PINV-2026-0" + (3500 + i), pi_status: app ? "Approved" : "Approval pending", payment_choice: app ? (g.chance(.9) ? "Advance paid already" : "Pay now") : "", mi: veh ? "MAT-STE-2026-0" + (3900 + i) : "" }); }
      return out; }
  }, over || {});

  const distDoc = over => Object.assign({
    key: "dist", store: "fuel.dist", doctype: "Fuel Distribution", autoSubmit: true, seqStart: 388, naming: (d, n) => "FD-" + n,
    entity: { singular: "Fuel distribution", plural: "Fuel distributions", title: r => `${r.fd_vehicle_name}`, sub: r => `${nf(r.issued_quantity_ltr, 2)} L ${r.fd_fuel_type} · ${r.warehouse} · ${r.name}`, date: "fd_date" },
    newLabel: "Add fuel distribution", saveLabel: "Submit", status: () => ["Submitted", "ok"], statusFilter: [],
    saveToast: s => `Fuel Distribution <span class="dx-mono">${esc(s.name)}</span> submitted. Material Issue <span class="dx-mono">${esc(s.mi)}</span> created.`,
    defaults: () => ({ fd_date: DX.TODAY, company: COMPANIES[0][0], reading_status: "Working", fd_fuel_type: "Diesel" }),
    form: [
      { id: "s", title: "Fuel stock details", short: "Stock", icon: "droplet", fields: [
        { f: "fd_date", label: "Date", type: "date", req: true }, { f: "company", label: "Company", type: "link", req: true, options: COMPANIES.map(([c, a]) => ({ value: c, label: c, sub: a })) },
        { f: "fd_town_project", label: "Town / project name", type: "link", req: true, options: townOpts },
        { f: "stk", label: "In stock", type: "info", icon: "droplet", span: 2, html: d => { if (!d.fd_town_project) return "Pick a town to see the store’s stock."; const s = storeBalance(storeOf(d.fd_town_project, d.company)); return `<b class="dx-mono">${esc(storeOf(d.fd_town_project, d.company))}</b> · Diesel <b class="dx-mono">${nf(s.Diesel, 1)} L</b> · Petrol <b class="dx-mono">${nf(s.Petrol, 1)} L</b>`; } }
      ] },
      { id: "v", title: "Fuel distribution to vehicle", short: "Vehicle", icon: "truck", fields: [
        { f: "fd_vehicle_name", label: "Vehicle name", type: "link", req: true, options: VEHICLES },
        { f: "reading_status", label: "Reading status", type: "select", options: ["Working", "Not Working", "Not Applicable"] },
        { f: "fd_fuel_type", label: "Fuel type", type: "select", req: true, options: ["Petrol", "Diesel"] },
        { f: "vehicle_reading_km", label: "Current reading (KM)", type: "float", showIf: d => d.reading_status === "Working" },
        { f: "issued_quantity_ltr", label: "Issued quantity", type: "float", unit: "L", req: true },
        { f: "custom_remark", label: "Remark", type: "text", req: true, span: 2 },
        { f: "custom_attachment", label: "Upload vehicle reading", type: "photo", icon: "gauge" }, { f: "custom_additional_vehicle_reading", label: "Upload attachment", type: "photo", icon: "image" }
      ] }
    ],
    validate: d => { const e = {}; if (d.fd_town_project && +d.issued_quantity_ltr > 0) { const s = storeBalance(storeOf(d.fd_town_project, d.company)); if (+d.issued_quantity_ltr > s[d.fd_fuel_type]) e.issued_quantity_ltr = `Not enough ${d.fd_fuel_type} stock. Available ${nf(s[d.fd_fuel_type], 1)} L | Requested ${nf(d.issued_quantity_ltr, 1)} L.`; } if (d.reading_status === "Working" && d.fd_vehicle_name && !(+d.vehicle_reading_km > lastReading(d.fd_vehicle_name, DX.rows({ id: "fuel.dist" })))) e.vehicle_reading_km = "Reading must be greater than the last reading."; return e; },
    onCreate: d => { d.warehouse = storeOf(d.fd_town_project, d.company); d.mi = "MAT-STE-2026-0" + docSeq++; if (d.reading_status === "Not Working") DX.toast("Meter reading NOT WORKING — alert email sent to the fuel admins.", "err"); },
    detailExtra: d => DX.card("Documents", `<div class="dx-kv"><div class="k">Material Issue</div><div class="v"><span class="dx-link">${esc(d.mi)}</span>${DX.status("Submitted", "ok")}</div><div class="k">Store</div><div class="v dx-mono">${esc(d.warehouse)}</div><div class="k">Reading status</div><div class="v">${d.reading_status === "Not Working" ? DX.status("Meter reading: NOT WORKING", "pending") : esc(d.reading_status)}</div></div>`, { icon: "card", tone: "cyan" }) + "<div style='height:16px'></div>",
    seed: () => { const g = DX.seeder(387), out = []; for (let i = 0; i < 26; i++) { const town = g.pick(["TN-161", "TN-114", "TN-11", "TN-17", "TN-16"]), rs = g.pick(["Working", "Working", "Working", "Not Working", "Not Applicable"]);
        out.push({ name: "FD-" + (360 + i), docstatus: 1, fd_date: DX.addDays(DX.TODAY, -g.int(0, 30)), company: COMPANIES[0][0], fd_town_project: town, fd_vehicle_name: g.pick(VEHICLES), reading_status: rs, fd_fuel_type: g.chance(.85) ? "Diesel" : "Petrol", vehicle_reading_km: rs === "Working" ? g.int(3000, 90000) : 0, issued_quantity_ltr: g.flt(5, 45, 1), custom_remark: "Issued at site", warehouse: storeOf(town, COMPANIES[0][0]), mi: "MAT-STE-2026-0" + (3800 + i), custom_attachment: "demo:gauge" }); }
      return out; }
  }, over || {});

  // one doc object per app (routes differ) — same store ids so both apps see the same rows
  const inA = inwardDoc(), distA = distDoc();
  const inB = inwardDoc({ newLabel: "New drum inward", defaults: () => ({ fuel_entry_type: "Drum", date: DX.TODAY, company: COMPANIES[0][0], types_of_fuel: "Diesel", direct_reading_status: "Working", rateltr_ffs: RATES.Diesel }) }), distB = distDoc({ newLabel: "Issue fuel to vehicle" });
  const storeBalance = store => { const b = { Diesel: 0, Petrol: 0, CNG: 0 }; DX.rows(inA).filter(r => r.fuel_entry_type === "Drum" && r.warehouse === store).forEach(r => (b[r.types_of_fuel] += +r.quantity || 0)); DX.rows(distA).filter(r => r.warehouse === store).forEach(r => (b[r.fd_fuel_type] -= +r.issued_quantity_ltr || 0)); return b; };
  const stores = () => Array.from(new Set(DX.rows(inA).filter(r => r.fuel_entry_type === "Drum").map(r => r.warehouse).concat(DX.rows(distA).map(r => r.warehouse)))).sort();

  function approve(d) {
    return DX.confirm({ title: "Approve and submit the invoice?", sub: `${esc(d.pi)} · ${esc(d.custom_petrol_pump)} · ${DX.money(d.amount)}`, ok: "Approve", body: `<div class="dx-hint">${ic("rupee", 16)}<span>${advance[d.custom_petrol_pump] > 0 ? `Supplier advance of <b class="dx-mono">${DX.money(advance[d.custom_petrol_pump], 2)}</b> will be adjusted against this invoice (oldest first).` : "No unallocated advance — the invoice becomes payable."}</span></div>` })
      .then(ok => { if (!ok) return false; d.pi_status = "Approved"; if (!d.payment_choice) d.payment_choice = "Advance paid already"; advance[d.custom_petrol_pump] = Math.max(0, (advance[d.custom_petrol_pump] || 0) - d.amount); DX.toast(`${esc(d.pi)} approved and submitted`); return true; });
  }
  function payOptions(d) {
    return new Promise(resolve => {
      const a = advance[d.custom_petrol_pump] || 0;
      const m = DX.openModal({ title: "Payment options", wide: true, sub: `Purchase Invoice <b class="dx-mono">${esc(d.pi)}</b> · Supplier: ${esc(d.custom_petrol_pump)}`,
        body: `<div class="dx-grid dx-grid-2"><section class="dx-card dx-card-accent"><div class="dx-card-body"><div class="dx-eyebrow">Advance paid already</div><div class="dx-kpi-val" style="font-size:20px">${DX.money(a, 2)}</div><div class="dx-muted" style="font-size:12.5px;margin:4px 0 12px">Current ${esc(d.custom_petrol_pump)} advance (net)</div><button class="dx-btn dx-btn-primary" data-pay="advance">${ic("check", 15)}Paid</button></div></section>
          <section class="dx-card"><div class="dx-card-body"><div class="dx-eyebrow">Pay now</div><div class="dx-kpi-val" style="font-size:20px">${DX.money(d.amount, 2)}</div><div class="dx-muted" style="font-size:12.5px;margin:4px 0 12px">Scan the pump’s QR · records a Petty Cash Expense</div><button class="dx-btn dx-btn-secondary" data-pay="now">${ic("grid", 15)}Pay now</button></div></section></div>`,
        foot: `<span class="dx-muted" style="font-size:12px;margin-right:auto">Choose whichever option applies — the choice is locked once made.</span><button class="dx-btn dx-btn-ghost" data-modal-x>Close</button>` });
      m.addEventListener("click", e => { const b = e.target.closest("[data-pay]"); if (!b) return; d.payment_choice = b.dataset.pay === "advance" ? "Advance paid already" : "Pay now"; d.pi_status = "Approved"; if (b.dataset.pay === "advance") advance[d.custom_petrol_pump] = Math.max(0, a - d.amount); DX.closeModal(); DX.toast(b.dataset.pay === "advance" ? "Recorded — advance payment acknowledged." : `Payment recorded · Petty Cash Expense created · ${esc(d.pi)} submitted`); resolve(true); });
    });
  }
  const inwardCols = [{ f: "date", label: "Date", type: "date" }, { f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => (r.fuel_entry_type === "Vehicle" ? "Direct distribution" : "Fuel inward") }, { label: "Town / project", get: r => M.townLabel(r.fuel_station_town_name), trunc: true }, { f: "types_of_fuel", label: "Fuel" }, { f: "quantity", label: "Quantity (L)", type: "num", d: 2, total: true }, { f: "amount", label: "Amount", type: "money", total: true }, { label: "Approval", type: "status", get: r => DX.statusOf(inA, r) }];
  const distCols = [{ f: "fd_date", label: "Date", type: "date" }, { f: "name", label: "Entry", type: "mono", strong: true }, { label: "Town / project", get: r => M.townLabel(r.fd_town_project), trunc: true }, { f: "fd_vehicle_name", label: "Vehicle", trunc: true }, { f: "reading_status", label: "Reading" }, { f: "fd_fuel_type", label: "Fuel" }, { f: "issued_quantity_ltr", label: "Quantity (L)", type: "num", d: 1, total: true }, { f: "warehouse", label: "Store", trunc: true }, { f: "mi", label: "Material Issue", type: "mono" }];
  const pending = () => DX.rows(inA).filter(r => r.pi_status !== "Approved");

  DX.register({
    key: "fuelin", title: "Fuel Inward & Direct Distribution", short: "Fuel Inward", icon: "fuel", hue: "green", route: "/desk/fuel-inward-direct-distribution",
    desc: "Pump purchase · invoice approval · payment", eyebrow: "Fuel management", headline: `Fuel <span class="dx-grad">dashboard</span>`,
    intro: "Record fuel bought at the pump — into the site store (drum) or straight into a vehicle. Saving submits the Purchase Receipt and sends the invoice to Accounts for approval.",
    docs: [inA, distA],
    kpis: () => { const f = DX.rows(inA).filter(r => r.date >= DX.addDays(DX.TODAY, -30)); return [
      { label: "Total inward", value: nf(DX.sum(f.filter(r => r.fuel_entry_type === "Drum"), "quantity")), unit: "Ltr", sub: "Drum · last 30 days", icon: "droplet", tone: "cyan" },
      { label: "Total direct distribution", value: nf(DX.sum(f.filter(r => r.fuel_entry_type === "Vehicle"), "quantity")), unit: "Ltr", sub: "Vehicle · last 30 days", icon: "truck" },
      { label: "Total purchase amount", value: DX.money(DX.sum(f, "amount")), sub: "Both entry types", icon: "rupee", tone: "ok" },
      { label: "Pending invoice approvals", value: nf(pending().length), sub: "Purchase Invoices in draft", icon: "inbox", tone: "pending" }
    ]; },
    panels: () => { const by = {}; DX.rows(inA).forEach(r => { if (r.custom_vehicles) by[r.custom_vehicles] = (by[r.custom_vehicles] || 0) + (+r.quantity || 0); }); return [DX.card("Vehicle-wise summary", DX.bars(Object.entries(by).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8), { unit: "L", fmt: v => nf(v, 1) }), { icon: "truck", tone: "cyan", sub: "direct distribution" })]; },
    homeStat: () => ({ value: nf(pending().length), label: "invoices awaiting approval" }),
    attention: () => pending().slice(0, 5).map(r => ({ title: `${r.pi} · ${DX.money(r.amount)}`, sub: `${r.custom_petrol_pump} · ${r.name}`, go: DX.entryRoute(inA, r), tag: "Approval pending" })),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "inward" },
      { id: "inward", label: "Inward & direct", icon: "list", type: "list", doc: "inward", count: () => DX.rows(inA).length, searchPh: "Search entry, vehicle, PR or PI…", search: [r => r.name, r => r.custom_vehicles, r => r.pr, r => r.pi, r => r.custom_petrol_pump],
        filters: [{ f: "fuel_entry_type", label: "Entry type", options: [{ value: "Drum", label: "Fuel inward" }, { value: "Vehicle", label: "Direct distribution" }], display: v => (v === "Drum" ? "Fuel inward" : "Direct distribution") }, { f: "fuel_station_town_name", label: "Town / project", options: townOpts, display: M.townLabel }, { f: "types_of_fuel", label: "Fuel", options: ["Diesel", "Petrol", "CNG"] }],
        sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "quantity"), 1)}</span> L · <span class="dx-num">${DX.money(DX.sum(rows, "amount"))}</span>`, columns: inwardCols },
      { id: "add", label: "Add entry", icon: "plus", type: "form", doc: "inward" },
      { id: "distribution", label: "Fuel distribution", icon: "truck", type: "list", doc: "dist", group: "Distribution", searchPh: "Search entry, vehicle or material issue…", search: [r => r.name, r => r.fd_vehicle_name, r => r.mi], filters: [{ f: "fd_town_project", label: "Town / project", options: townOpts, display: M.townLabel }, { f: "reading_status", label: "Reading status", options: ["Working", "Not Working", "Not Applicable"] }], columns: distCols },
      { id: "approvals", label: "Invoice approvals", icon: "inbox", group: "Accounts", count: () => pending().length, render: () => DX.card("Invoice approvals", pending().map(r => `<div class="dx-appr"><div class="dx-appr-main"><div class="dx-appr-title">${esc(r.pi)} <span class="dx-muted" style="font-weight:400">· ${esc(r.name)}</span></div><div class="dx-appr-meta"><span>${esc(r.custom_petrol_pump)}</span><span>${esc(M.townLabel(r.fuel_station_town_name))}</span><span>${nf(r.quantity, 2)} L ${esc(r.types_of_fuel)}</span><span class="dx-mono">${DX.fmtDate(r.date)}</span></div></div><div class="dx-appr-amt">${DX.money(r.amount)}</div><div class="dx-appr-actions"><button class="dx-btn dx-btn-secondary dx-btn-sm" data-go="${esc(DX.entryRoute(inA, r))}">Open</button><button class="dx-btn dx-btn-secondary dx-btn-sm" data-payopt="${esc(r.name)}">${ic("rupee", 13)}Payment options</button><button class="dx-btn dx-btn-ok dx-btn-sm" data-approve="${esc(r.name)}">${ic("check", 13)}Approve</button></div></div>`).join("") || DX.empty("Nothing to approve", "Every fuel invoice has been approved."), { icon: "inbox", tone: "pending", sub: `${pending().length} draft Purchase Invoices · Accounts User / Manager` }),
        bind: ctx => ctx.on("click", async e => { const a = e.target.closest("[data-approve]"), p = e.target.closest("[data-payopt]"); if (a && await approve(DX.find(inA, a.dataset.approve))) ctx.rerender(); if (p && await payOptions(DX.find(inA, p.dataset.payopt))) ctx.rerender(); }) },
      { id: "report", label: "Reports", icon: "chart", type: "report", doc: "inward", group: "Reports", title: "Inward & Direct Distribution report", tabs: [{ id: "report", label: "Inward & direct distribution" }, { id: "fdreport", label: "Fuel distribution" }], filters: [{ f: "types_of_fuel", label: "Fuel", options: ["Diesel", "Petrol", "CNG"] }, { f: "warehouse", label: "Store", options: () => stores() }], sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "quantity"), 1)}</span> Ltr total`, columns: inwardCols.concat([{ f: "rateltr_ffs", label: "Rate", type: "num", d: 2 }, { f: "pi", label: "PI", type: "mono" }]) },
      { id: "fdreport", label: "Distribution report", icon: "chart", type: "report", doc: "dist", group: "Reports", date: "fd_date", title: "Fuel Distribution report", tabs: [{ id: "report", label: "Inward & direct distribution" }, { id: "fdreport", label: "Fuel distribution" }], filters: [{ f: "fd_fuel_type", label: "Fuel", options: ["Diesel", "Petrol"] }, { f: "reading_status", label: "Reading status", options: ["Working", "Not Working", "Not Applicable"] }], columns: distCols }
    ]
  });

  DX.register({
    key: "fuelstock", title: "Fuel Stock Entry", short: "Fuel Stock", icon: "droplet", hue: "amber", route: "/desk/fuel-stock-entry",
    desc: "Store-wise fuel stock · inward & issue", eyebrow: "Fuel stock", headline: `Know every litre in every <span class="dx-grad">store</span>`,
    intro: "Drum inward adds fuel to the site store; issuing to a vehicle (Fuel Distribution) takes it out. The balance per store is what the next issue is checked against.",
    docs: [inB, distB], noRecent: true,
    kpis: () => { const ss = stores().map(storeBalance); return [
      { label: "Diesel in stores", value: nf(ss.reduce((s, b) => s + b.Diesel, 0), 0), unit: "L", sub: `across <span class="dx-num">${ss.length}</span> stores`, icon: "droplet", tone: "cyan" },
      { label: "Petrol in stores", value: nf(ss.reduce((s, b) => s + b.Petrol, 0), 0), unit: "L", sub: "net of issues", icon: "droplet" },
      { label: "Inward this month", value: nf(DX.sum(DX.rows(inB).filter(r => r.fuel_entry_type === "Drum" && r.date >= DX.monthStart()), "quantity")), unit: "L", sub: "drum purchases", icon: "download", tone: "ok" },
      { label: "Issued this month", value: nf(DX.sum(DX.rows(distB).filter(r => r.fd_date >= DX.monthStart()), "issued_quantity_ltr")), unit: "L", sub: "to vehicles", icon: "truck", tone: "pending" }
    ]; },
    heroActions: () => `${DX.views.newBtn(inB)}<button class="dx-btn dx-btn-secondary" data-go="${DX.newRoute(distB)}">${ic("truck", 15)}Issue to vehicle</button>`,
    panels: () => [
      DX.card("Store-wise balance", DX.table([{ f: "s", label: "Store", strong: true }, { f: "d", label: "Diesel (L)", type: "num", d: 1 }, { f: "p", label: "Petrol (L)", type: "num", d: 1 }, { label: "Status", type: "status", get: r => (r.d < 50 ? DX.status("Low", "pending") : DX.status("OK", "ok")) }], stores().map(s => { const b = storeBalance(s); return { s, d: b.Diesel, p: b.Petrol }; }).sort((a, b) => b.d - a.d)), { icon: "database", tone: "cyan", sub: "inward − issued" }),
      DX.card("Latest movements", ledger().slice(0, 8).map(l => `<div class="dx-feed-row"><span class="dx-tile${l.dir > 0 ? " dx-tile-ok" : " dx-tile-pending"}">${ic(l.dir > 0 ? "download" : "truck", 14)}</span><div class="dx-feed-main"><div class="dx-feed-title">${l.dir > 0 ? "In" : "Out"} · <span class="dx-mono">${nf(l.qty, 1)} L</span> ${esc(l.fuel)}</div><div class="dx-feed-sub">${esc(l.store)} · ${esc(l.ref)}</div></div><div class="dx-feed-end"><span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(l.date)}</span></div></div>`).join(""), { icon: "swap" })
    ],
    homeStat: () => ({ value: nf(stores().map(storeBalance).reduce((s, b) => s + b.Diesel, 0)), label: "L diesel in stores" }),
    attention: () => stores().filter(s => storeBalance(s).Diesel < 50).slice(0, 3).map(s => ({ title: s, sub: `Diesel ${nf(storeBalance(s).Diesel, 1)} L left`, go: "fuelstock/stock", tag: "Low stock" })),
    screens: [
      { id: "stock", label: "Stock dashboard", icon: "grid", type: "dashboard", doc: "inward" },
      { id: "inward", label: "Drum inward", icon: "download", type: "list", doc: "inward", rows: rs => rs.filter(r => r.fuel_entry_type === "Drum"), searchPh: "Search entry, pump or store…", filters: [{ f: "warehouse", label: "Store", options: () => stores() }, { f: "types_of_fuel", label: "Fuel", options: ["Diesel", "Petrol"] }], columns: inwardCols.filter(c => c.label !== "Type").concat([{ f: "warehouse", label: "Store", trunc: true }]) },
      { id: "newinward", label: "New drum inward", icon: "plus", type: "form", doc: "inward" },
      { id: "issues", label: "Issue to vehicle", icon: "truck", type: "list", doc: "dist", group: "Issue", filters: [{ f: "warehouse", label: "Store", options: () => stores() }], columns: distCols },
      { id: "newissue", label: "New issue", icon: "plus", type: "form", doc: "dist", group: "Issue" },
      { id: "ledger", label: "Stock ledger", icon: "swap", group: "Issue", render: () => DX.card("Stock ledger", `<div class="dx-meta"><span>Every drum inward and vehicle issue, newest first — running balance per store and fuel.</span></div>` + DX.table([{ f: "date", label: "Date", type: "date" }, { f: "ref", label: "Voucher", type: "mono" }, { f: "store", label: "Store", trunc: true }, { f: "fuel", label: "Fuel" }, { label: "In (L)", type: "num", d: 1, get: l => (l.dir > 0 ? l.qty : "") }, { label: "Out (L)", type: "num", d: 1, get: l => (l.dir < 0 ? l.qty : "") }, { f: "bal", label: "Balance (L)", type: "num", d: 1 }], ledger(), { maxh: "68vh" }), { icon: "swap", tone: "cyan" }) }
    ]
  });
  function ledger() {
    const moves = DX.rows(inA).filter(r => r.fuel_entry_type === "Drum").map(r => ({ date: r.date, ref: r.name, store: r.warehouse, fuel: r.types_of_fuel, qty: +r.quantity, dir: 1 })).concat(DX.rows(distA).map(r => ({ date: r.fd_date, ref: r.name, store: r.warehouse, fuel: r.fd_fuel_type, qty: +r.issued_quantity_ltr, dir: -1 }))).sort((a, b) => a.date.localeCompare(b.date) || b.dir - a.dir);
    const bal = {}; moves.forEach(m => { const k = m.store + m.fuel; bal[k] = (bal[k] || 0) + m.dir * m.qty; m.bal = bal[k]; });
    return moves.reverse();
  }
})();
