/* Fuel — LIVE (vehicle_inhouse · page fuel-inward-direct-distribution). Two suite apps over the same records:
   · Fuel Inward & Direct Distribution — pump purchase (Drum → store, Vehicle → direct), invoice approval.
   · Fuel Stock Entry — store balances, drum inward, issue to vehicle (Fuel Distribution).
   Every create goes through the page's own API, which posts PR / PI / Material Issue and sends its notifications. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, { nf, esc, ic } = DX;
  const P = "vehicle_inhouse.vehicle_inhouse.page.fuel_inward_direct_distribution.fuel_inward_direct_distribution.";
  const FUEL_COMPANIES = ["ACTIVE INFRASTRUCTURES LIMITED", "Jain Engineering Works (India) Private Limited"];
  const B = { meta: null, towns: {}, pumps: {}, bal: {}, stock: null, stockAt: 0 };
  const meta = () => B.meta || { filter_options: { towns: [], vehicles: [], fuel_types: ["Diesel", "Petrol"], companies: [] } };
  const repaint = () => { if (DX.activeForm) DX.activeForm.refresh(); };
  const townLabel = id => { const t = (meta().filter_options.towns || []).find(x => x.value === id); return t ? t.label : DX.M.townLabel(id); };
  const vehicleLabel = id => { const v = (meta().filter_options.vehicles || []).find(x => x.value === id); return v ? v.label : id || ""; };
  DX.resolvers.push(v => { const o = (meta().filter_options.vehicles || []).find(x => x.value === v) || (meta().filter_options.towns || []).find(x => x.value === v); return o ? o.label : ""; });
  // the fuel companies configured on this site (server meta.fuel_companies = site_config "fuel_companies", else AIL/JEW); a site without any offers its own companies
  const fuelCompanies = () => { const have = DX.M.companies.map(c => c[0]), list = ((B.meta && B.meta.fuel_companies) || FUEL_COMPANIES).filter(c => have.includes(c)); return list.length ? list : have; };
  const companyOpts = () => fuelCompanies().map(c => ({ value: c, label: c, sub: DX.M.abbr(c) }));
  const q = (m, filters) => DX.call(P + m, { doctype: "Town At Project", txt: "", searchfield: "name", start: 0, page_len: 500, filters: DX.json(filters) });
  const loadTowns = async (company, applicable) => { const k = company + "|" + applicable; if (!B.towns[k]) B.towns[k] = ((await q("get_jain_town_projects", { company, applicable_for: applicable })) || []).map(([value, label]) => ({ value, label })); return B.towns[k]; };
  const loadPumps = async town => { if (!town) return []; if (!B.pumps[town]) B.pumps[town] = ((await DX.call(P + "get_petrol_pumps_for_town", { doctype: "Petrol Pump", txt: "", searchfield: "name", start: 0, page_len: 200, filters: DX.json({ town }) })) || []).map(([value, label]) => ({ value, label })); return B.pumps[town]; };
  const money = v => DX.money(v, 2);
  // linked documents open in ERPNext but never print their record ID
  const deskLink = (dt, name) => (name ? `<a class="dx-link" href="/app/${dt}/${encodeURIComponent(name)}" target="_blank" rel="noopener">Open</a> ` : `<span class="dx-faint">—</span>`);
  const issued = v => (v ? DX.status("Issued", "ok") : "<span class=\"dx-faint\">—</span>");
  const invoiceState = r => (!r.pi ? "<span class=\"dx-faint\">—</span>" : r.pi_pending ? DX.status("Approval pending", "pending") : DX.status("Approved", "ok"));

  /* ---- Fuel for Stock (Drum / Vehicle) ---- */
  const fromInward = r => ({ name: r.name, docstatus: 1, fuel_entry_type: r.entry_type, date: DX.day(r.date), company: r.company, fuel_station_town_name: r.town_project_id, town_label: r.town_project_label || r.town_project, custom_petrol_pump: r.petrol_pump, supplier: r.supplier, custom_vehicles: r.vehicle_id || "", vehicle_label: r.vehicle_label && r.vehicle_label !== "-" ? r.vehicle_label : "", types_of_fuel: r.fuel_type, quantity: +r.quantity || 0, rateltr_ffs: +r.rate || 0, amount: +r.amount || 0, warehouse: r.warehouse, pr: r.purchase_receipt || "", pi: r.purchase_invoice || "", pi_pending: !!r.purchase_invoice_pending, mi: r.material_issue || "", custom_remark: r.remark || "", custom_current_reading_km: r.custom_current_reading_km || r.current_reading_km || 0, last_reading_km: r.last_reading_km || 0, upload_invoice__invoice_copy: r.invoice_copy_url || r.invoice_file || "", upload_fuel_station_proof__fuel_station_receipt: r.fuel_station_proof_url || r.fuel_station_proof_file || "", custom_qr_attachment: r.qr_attachment_file || "", custom_upload_vehicle_reading: r.vehicle_reading_file || "", modified: r.modified });
  const piState = r => (!r.pi ? "none" : r.pi_pending ? "pending" : "approved");
  const WINDOW = () => ({ from_date: DX.addDays(DX.monthStart(), -31), to_date: DX.TODAY });
  const inwardDoc = over => Object.assign({
    key: "inward", store: "fuel.inward", doctype: "Fuel for Stock", canEdit: false,
    get canCreate() { return !!meta().can_create; },
    entity: { singular: "Fuel entry", plural: "Fuel entries", title: r => (r.fuel_entry_type === "Vehicle" ? "Direct · " + (r.vehicle_label || r.custom_vehicles) : "Inward · " + (r.warehouse || r.town_label || "")), sub: r => `${nf(r.quantity, 2)} L ${r.types_of_fuel || ""} · ${r.custom_petrol_pump || ""} · ${r.name}`, date: "date" },
    newLabel: "Add fuel entry", saveLabel: "Save entry",
    saveToast: s => `Entry <span class="dx-mono">${esc(s.name)}</span> saved — Purchase Receipt submitted, invoice sent for approval.`,
    status: r => ({ none: ["No invoice", ""], pending: ["Approval pending", "pending"], approved: ["Approved", "ok"] })[piState(r)], statusKey: piState,
    statusFilter: [["", "All"], ["pending", "Approval pending"], ["approved", "Approved"]],
    defaults: () => ({ fuel_entry_type: "Drum", date: DX.TODAY, company: meta().default_company || fuelCompanies()[0], types_of_fuel: (meta().filter_options.fuel_types || ["Diesel"])[0] || "Diesel", direct_reading_status: "Working" }),
    confirmSave: d => DX.confirm({ title: "Save this fuel entry?", ok: "Save entry", sub: "This posts real documents in ERPNext — it can only be undone by a Fuel Admin.",
      body: `<div class="dx-issue">${[["Mode", d.fuel_entry_type === "Vehicle" ? "Direct distribution (vehicle)" : "Fuel inward (drum)"], ["Amount", money((+d.quantity || 0) * (+d.rateltr_ffs || 0))], ["Purchase Receipt", "created & submitted"], ["Purchase Invoice", "draft — sent to Accounts for approval"]].concat(d.fuel_entry_type === "Vehicle" ? [["Material Issue", "created & submitted"]] : []).map(([k, v]) => `<div class="dx-issue-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div><p class="dx-muted" style="font-size:12.5px;margin-top:10px">Accounts users get an approval alert and the payment-options email is sent.</p>` }),
    form: [
      { id: "f", title: "Fuel inward / direct distribution", short: "Entry", sub: "complete each required field before saving", icon: "fuel", fields: [
        { f: "fuel_entry_type", label: "Fuel mode", type: "select", req: true, options: [{ value: "Drum", label: "Fuel inward (drum)" }, { value: "Vehicle", label: "Direct distribution (vehicle)" }], span: 2 },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "company", label: "Company", type: "link", req: true, options: companyOpts },
        { f: "fuel_station_town_name", label: "Town / project name", type: "link", req: true, parent: ["company"], load: d => loadTowns(d.company, "Fuel for Stock"), options: d => B.towns[d.company + "|Fuel for Stock"] || [], onSet: d => resolveStore(d) },
        { f: "custom_petrol_pump", label: "Petrol pump", type: "link", req: true, parent: ["fuel_station_town_name"], load: d => loadPumps(d.fuel_station_town_name), options: d => B.pumps[d.fuel_station_town_name] || [], onSet: d => supplierBalance(d) },
        { f: "adv", label: "Supplier advance / outstanding", type: "info", icon: "rupee", span: 2, html: d => { if (!d.custom_petrol_pump) return "Pick a petrol pump to see the supplier’s balance."; const b = B.bal[d.company + "|" + d.custom_petrol_pump]; return b ? `Current supplier advance <b class="dx-mono">${money(b.adv)}</b> · Outstanding payable <b class="dx-mono">${money(b.out)}</b>` : "Loading the supplier’s balance…"; } },
        { f: "custom_vehicles", label: "Vehicle name", type: "link", options: () => meta().filter_options.vehicles || [], showIf: d => d.fuel_entry_type === "Vehicle", onSet: d => lastReading(d, "custom_vehicles", d.fuel_station_town_name) },
        { f: "direct_reading_status", label: "Reading status", type: "select", options: ["Working", "Not Working"], showIf: d => d.fuel_entry_type === "Vehicle" },
        { f: "custom_current_reading_km", label: "Current reading (KM)", type: "float", showIf: d => d.fuel_entry_type === "Vehicle" && d.direct_reading_status === "Working" },
        { f: "last_info", label: "Last reading", type: "info", icon: "clock", showIf: d => d.fuel_entry_type === "Vehicle", html: d => (d.custom_vehicles ? (d.last_reading_km == null ? "Loading the last reading…" : `Last reading <b class="dx-mono">${nf(d.last_reading_km || 0)} KM</b> — current must be greater.`) : "Pick a vehicle to see its last reading.") },
        { f: "types_of_fuel", label: "Types of fuel", type: "select", req: true, options: () => meta().filter_options.fuel_types || ["Diesel", "Petrol"] },
        { f: "quantity", label: "Quantity", type: "float", unit: "L", req: true, step: 0.01 },
        { f: "rateltr_ffs", label: "Rate", type: "float", unit: "₹/L", req: true, step: 0.01 },
        { f: "amount", label: "Amount", type: "computed", money: true, d: 2, calc: d => (+d.quantity || 0) * (+d.rateltr_ffs || 0), formula: "quantity × rate" },
        { f: "wh", label: "Store", type: "info", icon: "building", html: d => (!d.fuel_station_town_name ? "Store is resolved from the town once you pick it." : d._whErr ? `<span style="color:var(--err)">${esc(d._whErr)}</span>` : d._wh ? `Store resolved automatically: <b class="dx-mono">${esc(d._wh)}</b>` : "Resolving the store…") },
        { f: "custom_remark", label: "Remark", type: "text", req: true, span: 2 }
      ] },
      { id: "p", title: "Upload proof of purchase", short: "Proof", icon: "camera", cols: 4, fields: [
        { f: "upload_invoice__invoice_copy", label: "Invoice copy", type: "photo", icon: "card", hint: "Optional — can be uploaded later" },
        { f: "upload_fuel_station_proof__fuel_station_receipt", label: "Fuel station proof", type: "photo", req: true, icon: "fuel" },
        { f: "custom_upload_vehicle_reading", label: "Vehicle reading", type: "photo", icon: "clock", accept: "image/*,video/*" },
        { f: "custom_qr_attachment", label: "QR attachment", type: "photo", icon: "grid", accept: "image/*,.heic,.heif,application/pdf" }
      ] }
    ],
    validate: d => {
      const e = {}, num = /^(\d+\.?\d*|\.\d+)$/;
      ["quantity", "rateltr_ffs"].forEach(f => { if (d[f] !== "" && d[f] != null && !num.test(String(d[f]).replace(/,/g, ""))) e[f] = "Enter a plain number."; });
      if (d.fuel_station_town_name && d._whErr) e.fuel_station_town_name = d._whErr;
      if (d.fuel_entry_type === "Vehicle") { if (!d.custom_vehicles) e.custom_vehicles = "Pick the vehicle."; if (d.direct_reading_status === "Working" && !(+d.custom_current_reading_km > (+d.last_reading_km || 0))) e.custom_current_reading_km = `Reading must be greater than last reading (${nf(d.last_reading_km || 0)} KM).`; }
      return e;
    },
    formNote: d => `${d.fuel_entry_type === "Vehicle" ? "Direct distribution · PR + PI + Material Issue" : "Fuel inward · PR + PI (stock into store)"} · <b>${DX.money((+d.quantity || 0) * (+d.rateltr_ffs || 0))}</b>`,
    detailActions: d => [d.docstatus !== 2 && meta().can_approve_invoices && d.pi_pending && { label: "Approve invoice", icon: "check", tone: "primary", run: x => approve(x) }, d.docstatus !== 2 && !d.upload_invoice__invoice_copy && { label: "Upload invoice copy", icon: "upload", run: x => uploadInvoice(x) }],
    detailExtra: d => DX.card("Documents", `<div class="dx-kv"><div class="k">Purchase Receipt</div><div class="v">${deskLink("purchase-receipt", d.pr)}${d.pr ? DX.status("Submitted", "ok") : ""}</div><div class="k">Purchase Invoice</div><div class="v">${deskLink("purchase-invoice", d.pi)}${d.pi ? (d.pi_pending ? DX.status("Draft · approval pending", "pending") : DX.status("Submitted", "ok")) : ""}</div>${d.mi ? `<div class="k">Material Issue</div><div class="v">${deskLink("stock-entry", d.mi)}${DX.status("Submitted", "ok")}</div>` : ""}<div class="k">Supplier</div><div class="v">${esc(d.supplier || "—")}</div><div class="k">Store</div><div class="v dx-mono">${esc(d.warehouse || "—")}</div></div>`, { icon: "card", tone: "cyan", sub: "created automatically on save" }) + (d.pi_pending ? `<div class="dx-note" style="margin-top:14px">${ic("rupee", 16)}<div>Payment options (advance / pay now by QR) are chosen from the link emailed for this invoice.</div></div>` : "") + "<div style='height:16px'></div>",
    api: {
      ttl: 45000,
      load: async () => ((await DX.call(P + "get_fuel_inward_direct_distribution_dashboard", { filters: DX.json(Object.assign({ report_scope: "inward_direct" }, WINDOW())) })).rows || []).map(fromInward),
      get: async name => { await DX.ensure(inA); const r = DX.find(inA, name); if (r) return r; const d = await DX.call("frappe.client.get", { doctype: "Fuel for Stock", name }); return { name: d.name, docstatus: d.docstatus, fuel_entry_type: d.fuel_entry_type, date: DX.day(d.date), company: d.company, fuel_station_town_name: d.fuel_station_town_name, town_label: townLabel(d.fuel_station_town_name), custom_petrol_pump: d.custom_petrol_pump, supplier: d.supplier_name, custom_vehicles: d.custom_vehicles, vehicle_label: vehicleLabel(d.custom_vehicles), types_of_fuel: d.types_of_fuel, quantity: d.quantity, rateltr_ffs: d.rateltr_ffs, amount: d.amount, warehouse: d.warehouse, custom_remark: d.custom_remark, upload_invoice__invoice_copy: d.upload_invoice__invoice_copy, upload_fuel_station_proof__fuel_station_receipt: d.upload_fuel_station_proof__fuel_station_receipt }; },
      save: async d => {
        const clean = v => String(v == null ? "" : v).replace(/,/g, "").trim();
        const data = { fuel_entry_type: d.fuel_entry_type, date: d.date, company: d.company, fuel_station_town_name: d.fuel_station_town_name, custom_petrol_pump: d.custom_petrol_pump, custom_remark: d.custom_remark, types_of_fuel: d.types_of_fuel, quantity: clean(d.quantity), rateltr_ffs: clean(d.rateltr_ffs), warehouse: d._wh || "", amount: (+clean(d.quantity) || 0) * (+clean(d.rateltr_ffs) || 0), upload_invoice__invoice_copy: d.upload_invoice__invoice_copy || "", upload_fuel_station_proof__fuel_station_receipt: d.upload_fuel_station_proof__fuel_station_receipt || "", custom_upload_vehicle_reading: d.custom_upload_vehicle_reading || "", custom_qr_attachment: d.custom_qr_attachment || "", payment_to_be_done: 0 };
        if (d.fuel_entry_type === "Vehicle") Object.assign(data, { custom_vehicles: d.custom_vehicles, direct_reading_status: d.direct_reading_status || "Working", custom_current_reading_km: d.direct_reading_status === "Working" ? +d.custom_current_reading_km || 0 : +d.last_reading_km || 0, last_reading_km: +d.last_reading_km || 0 });
        const r = await DX.call(P + "create_fuel_inward_direct_distribution_entry", { data: DX.json(data) });
        DX.invalidate(inA); B.stock = null; if (DX.homeData) DX.loadHome(true);
        return { name: r.entry, docs: r.documents };
      }
    }
  }, over || {});

  /* ---- Fuel Distribution (issue from store stock) ---- */
  const fromDist = r => ({ name: r.name, docstatus: r.docstatus != null ? r.docstatus : 1, fd_date: DX.day(r.date), company: r.company, fd_town_project: r.town_project_id, town_label: r.town_project_label || r.town_project, fd_vehicle_name: r.vehicle_id, vehicle_label: r.vehicle_label || r.vehicle, fd_fuel_type: r.fuel_type, issued_quantity_ltr: +r.quantity || 0, warehouse: r.warehouse, reading_status: r.reading_status, mi: r.material_issue || "", custom_remark: r.remark || "", custom_attachment: r.attachment_file || "", modified: r.modified });
  const distDoc = over => Object.assign({
    key: "dist", store: "fuel.dist", doctype: "Fuel Distribution", canEdit: false, lazy: true,
    get canCreate() { return !!meta().can_use_fuel_distribution; },
    entity: { singular: "Fuel distribution", plural: "Fuel distributions", title: r => r.vehicle_label || r.fd_vehicle_name, sub: r => `${nf(r.issued_quantity_ltr, 2)} L ${r.fd_fuel_type || ""} · ${r.warehouse || ""} · ${r.name}`, date: "fd_date" },
    newLabel: "Add fuel distribution", saveLabel: "Submit", status: () => ["Submitted", "ok"], statusFilter: [],
    saveToast: s => `Fuel Distribution <span class="dx-mono">${esc(s.name)}</span> submitted${s.mi ? " · Material Issue created" : ""}.`,
    defaults: () => ({ fd_date: DX.TODAY, company: meta().default_company || fuelCompanies()[0], reading_status: "Working", fd_fuel_type: "Diesel" }),
    confirmSave: d => DX.confirm({ title: "Submit this fuel distribution?", ok: "Submit", sub: "Deducts the fuel from the store now (Material Issue) and records Fuel for Vehicle.", body: `<div class="dx-issue">${[["Vehicle", vehicleLabel(d.fd_vehicle_name)], ["Issued", `${nf(d.issued_quantity_ltr, 2)} L ${d.fd_fuel_type}`], ["Store", d._wh || "—"]].map(([k, v]) => `<div class="dx-issue-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div>${d.reading_status === "Not Working" ? `<p class="dx-muted" style="font-size:12.5px;margin-top:10px;color:var(--pending)">Reading status “Not Working” emails the fuel admins.</p>` : ""}` }),
    form: [
      { id: "s", title: "Fuel stock details", short: "Stock", icon: "droplet", fields: [
        { f: "fd_date", label: "Date", type: "date", req: true }, { f: "company", label: "Company", type: "link", req: true, options: companyOpts, onSet: d => distStock(d) },
        { f: "fd_town_project", label: "Town / project name", type: "link", req: true, parent: ["company"], load: d => loadTowns(d.company, "Fuel Distribution"), options: d => B.towns[d.company + "|Fuel Distribution"] || [], onSet: d => distStock(d) },
        { f: "stk", label: "In stock", type: "info", icon: "droplet", span: 2, html: d => { if (!d.fd_town_project) return "Pick a town to see the store’s stock."; if (d._stkErr) return `<span style="color:var(--err)">${esc(d._stkErr)}</span>`; if (!d._stk) return "Loading the store’s stock…"; return `<b class="dx-mono">${esc(d._stk.warehouse || "—")}</b> · Diesel <b class="dx-mono">${nf(d._stk.available_stock_ltr, 1)} L</b> · Petrol <b class="dx-mono">${nf(d._stk.fd_petrol_in_stock, 1)} L</b>`; } }
      ] },
      { id: "v", title: "Fuel distribution to vehicle", short: "Vehicle", icon: "truck", fields: [
        { f: "fd_vehicle_name", label: "Vehicle name", type: "link", req: true, options: () => meta().filter_options.vehicles || [], onSet: d => lastReading(d, "fd_vehicle_name", d.fd_town_project) },
        { f: "reading_status", label: "Reading status", type: "select", options: ["Working", "Not Working", "Not Applicable"] },
        { f: "fd_fuel_type", label: "Fuel type", type: "select", req: true, options: ["Petrol", "Diesel"] },
        { f: "vehicle_reading_km", label: "Current reading (KM)", type: "float", showIf: d => d.reading_status === "Working" },
        { f: "last_info", label: "Last reading", type: "info", icon: "clock", html: d => (d.fd_vehicle_name ? (d.last_reading_km == null ? "Loading the last reading…" : `Last reading <b class="dx-mono">${nf(d.last_reading_km || 0)} KM</b>`) : "Pick a vehicle to see its last reading.") },
        { f: "issued_quantity_ltr", label: "Issued quantity", type: "float", unit: "L", req: true, step: 0.01 },
        { f: "custom_remark", label: "Remark", type: "text", req: true, span: 2 },
        { f: "custom_attachment", label: "Upload vehicle reading", type: "photo", icon: "clock", accept: "image/*,video/*" }, { f: "custom_additional_vehicle_reading", label: "Upload attachment", type: "photo", icon: "image", accept: "image/*,video/*" }
      ] }
    ],
    validate: d => {
      const e = {};
      if (d._stk && +d.issued_quantity_ltr > 0) { const have = d.fd_fuel_type === "Petrol" ? +d._stk.fd_petrol_in_stock : +d._stk.available_stock_ltr; if (+d.issued_quantity_ltr > have) e.issued_quantity_ltr = `Not enough ${d.fd_fuel_type} stock. Available ${nf(have, 1)} L | Requested ${nf(d.issued_quantity_ltr, 1)} L.`; }
      if (d._stkErr) e.fd_town_project = d._stkErr;
      if (d.reading_status === "Working" && d.fd_vehicle_name && !(+d.vehicle_reading_km > (+d.last_reading_km || 0))) e.vehicle_reading_km = `Reading must be greater than the last reading (${nf(d.last_reading_km || 0)} KM).`;
      return e;
    },
    detailExtra: d => DX.card("Documents", `<div class="dx-kv"><div class="k">Material Issue</div><div class="v">${deskLink("stock-entry", d.mi)}${d.mi ? DX.status("Submitted", "ok") : ""}</div><div class="k">Store</div><div class="v dx-mono">${esc(d.warehouse || "—")}</div><div class="k">Town / project</div><div class="v">${esc(d.town_label || "—")}</div><div class="k">Reading status</div><div class="v">${d.reading_status === "Not Working" ? DX.status("Meter reading: NOT WORKING", "pending") : esc(d.reading_status || "—")}</div></div>`, { icon: "card", tone: "cyan" }) + "<div style='height:16px'></div>",
    api: {
      ttl: 45000,
      load: async () => ((await DX.call(P + "get_fuel_distribution_report", { filters: DX.json(WINDOW()) })).rows || []).map(fromDist),
      // the report rows carry no meter readings — read them from the document for the detail page
      get: async name => {
        await DX.ensure(distA); const r = DX.find(distA, name);
        let d; try { d = await DX.call("frappe.client.get", { doctype: "Fuel Distribution", name }); } catch (err) { if (r) return r; throw err; }
        const base = r || fromDist({ name: d.name, docstatus: d.docstatus, date: d.fd_date, company: d.company, town_project_id: d.fd_town_project, vehicle_id: d.fd_vehicle_name, fuel_type: d.fd_fuel_type, quantity: d.issued_quantity_ltr, warehouse: d.warehouse, reading_status: d.reading_status, material_issue: d.custom_material_issue, remark: d.custom_remark, attachment_file: d.custom_attachment, modified: d.modified });
        return Object.assign({}, base, { vehicle_reading_km: d.vehicle_reading_km, last_reading_km: d.last_reading_km, custom_additional_vehicle_reading: d.custom_additional_vehicle_reading || base.custom_additional_vehicle_reading || "" });
      },
      save: async d => {
        const data = { fd_date: d.fd_date, company: d.company, fd_town_project: d.fd_town_project, available_stock_ltr: d._stk ? d._stk.available_stock_ltr : 0, fd_petrol_in_stock: d._stk ? d._stk.fd_petrol_in_stock : 0, fd_vehicle_name: d.fd_vehicle_name, fd_fuel_type: d.fd_fuel_type, reading_status: d.reading_status || "Working", issued_quantity_ltr: String(d.issued_quantity_ltr).replace(/,/g, ""), vehicle_reading_km: d.reading_status === "Working" ? +d.vehicle_reading_km || 0 : "", last_reading_km: +d.last_reading_km || 0, warehouse: d._wh || "", custom_remark: d.custom_remark, custom_attachment: d.custom_attachment || "", custom_additional_vehicle_reading: d.custom_additional_vehicle_reading || "" };
        const r = await DX.call(P + "create_and_submit_fuel_distribution", { data: DX.json(data) });
        DX.invalidate(distA); B.stock = null; if (DX.homeData) DX.loadHome(true);
        return { name: r.name, mi: r.material_issue };
      }
    }
  }, over || {});

  // async lookups — each writes onto the form doc and repaints the info blocks
  async function resolveStore(d) {
    d._wh = ""; d._whErr = "";
    if (!d.company || !d.fuel_station_town_name) return;
    try { const r = await DX.call(P + "get_fuel_warehouse", { company: d.company, town_project: d.fuel_station_town_name, applicable_for: "Fuel for Stock" }); d._wh = r.warehouse || (r.enabled === false ? "Chosen by the server" : ""); } catch (e) { d._whErr = e.message; }
    repaint();
  }
  async function supplierBalance(d) {
    const k = d.company + "|" + d.custom_petrol_pump; if (!d.custom_petrol_pump || B.bal[k]) return repaint();
    try { const [a, o] = await Promise.all([DX.call(P + "get_current_supplier_advance", { company: d.company, supplier: d.custom_petrol_pump }), DX.call(P + "get_opening_invoice_outstanding", { company: d.company, supplier: d.custom_petrol_pump })]); B.bal[k] = { adv: +a.current_advance || 0, out: +o.outstanding_payable || 0 }; } catch (_) { B.bal[k] = { adv: 0, out: 0 }; }
    repaint();
  }
  async function lastReading(d, field, town) {
    d.last_reading_km = null; repaint();
    try { const r = await DX.call(P + "get_vehicle_last_reading", { vehicle: d[field] || "", town_project: town || "" }); d.last_reading_km = +r.last_reading_km || 0; } catch (_) { d.last_reading_km = 0; }
    repaint();
  }
  async function distStock(d) {
    d._stk = null; d._stkErr = ""; d._wh = "";
    if (!d.company || !d.fd_town_project) return repaint();
    try { d._stk = await DX.call(P + "get_fuel_distribution_stock", { town_project: d.fd_town_project, company: d.company }); d._wh = d._stk.warehouse || ""; } catch (e) { d._stkErr = e.message; }
    repaint();
  }
  function approve(d) {
    return DX.confirm({ title: "Approve and submit the invoice?", sub: `${esc(d.supplier || d.custom_petrol_pump)} · ${DX.money(d.amount)}`, ok: "Approve", body: `<div class="dx-hint">${ic("rupee", 16)}<span>Submits the Purchase Invoice. Unless “Pay now” was chosen from the email, the supplier’s oldest unallocated advance is adjusted against it.</span></div>` })
      .then(async ok => { if (!ok) return false; const r = await DX.call(P + "approve_fuel_inward_direct_distribution_invoice", { entry_name: d.name }); DX.toast(esc(r.message || "Invoice approved.")); DX.invalidate(inA); if (DX.homeData) DX.loadHome(true); return true; });
  }
  function uploadInvoice(d) {
    return new Promise((resolve, reject) => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,.heic,.heif";
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return resolve(false);
        try { DX.toast("Uploading the invoice copy…"); const url = await DX.upload(await DX.shrink(f)); const r = await DX.call(P + "update_fuel_inward_direct_distribution_invoice", { entry_name: d.name, invoice_file: url }); DX.toast(esc(r.message || "Invoice copy uploaded.")); DX.invalidate(inA); resolve(true); } catch (e) { reject(e); }
      };
      inp.click();
    });
  }

  // ONE suite app for fuel: pump purchase (Drum / Vehicle), store stock, issue to vehicle, approvals and reports
  const inA = inwardDoc(), distA = distDoc();
  const canDist = () => !!meta().can_use_fuel_distribution;
  const bootFuel = async app => {
    if (!B.meta) B.meta = await DX.call(P + "get_fuel_inward_direct_distribution_meta");
    if (!B.meta.can_use_fuel_distribution) app.screens = app.screens.filter(s => !s.needsDist);
    if (!B.meta.can_approve_invoices) app.screens = app.screens.filter(s => s.id !== "approvals");
  };
  const pending = () => DX.rows(inA).filter(r => r.pi_pending);
  const inwardCols = [{ f: "date", label: "Date", type: "date" }, { f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => (r.fuel_entry_type === "Vehicle" ? "Direct distribution" : "Fuel inward") }, { f: "town_label", label: "Town / project", trunc: true }, { f: "types_of_fuel", label: "Fuel" }, { f: "quantity", label: "Quantity (L)", type: "num", d: 2, total: true }, { f: "amount", label: "Amount", type: "money", total: true }, { label: "Approval", type: "status", get: r => DX.statusOf(inA, r) }];
  const distCols = [{ f: "fd_date", label: "Date", type: "date" }, { f: "name", label: "Entry", type: "mono", strong: true }, { f: "town_label", label: "Town / project", trunc: true }, { f: "vehicle_label", label: "Vehicle", trunc: true }, { f: "reading_status", label: "Reading" }, { f: "fd_fuel_type", label: "Fuel" }, { f: "issued_quantity_ltr", label: "Quantity (L)", type: "num", d: 1, total: true }, { f: "warehouse", label: "Store", trunc: true }, { label: "Material Issue", type: "html", get: r => issued(r.mi) }];
  const stores = () => Array.from(new Set(DX.rows(inA).filter(r => r.fuel_entry_type === "Drum").map(r => r.warehouse).concat(DX.rows(distA).map(r => r.warehouse)).filter(Boolean))).sort();
  // real store balances (Bin) for every town the user can issue from — cached for 2 minutes
  const loadStock = async () => {
    if (B.stock && Date.now() - B.stockAt < 120000) return;
    const m = meta(), company = m.default_company || fuelCompanies()[0];
    const towns = (m.allowed_distribution_towns && m.allowed_distribution_towns.length ? m.allowed_distribution_towns : m.allowed_towns || []).slice(0, 60);
    const out = [];
    for (let i = 0; i < towns.length; i += 8) await Promise.all(towns.slice(i, i + 8).map(t => DX.call(P + "get_fuel_distribution_stock", { town_project: t, company }).then(r => { if (r && r.warehouse) out.push({ s: r.warehouse, town: townLabel(t), d: +r.available_stock_ltr || 0, p: +r.fd_petrol_in_stock || 0 }); }, () => null)));
    B.stock = out.sort((a, b) => b.d - a.d); B.stockAt = Date.now(); B.stockCompany = company;
  };
  // every fuel movement with the vehicle it went to: drum inward (in), issue to vehicle (out), and direct at the pump —
  // a direct entry receives the fuel into the town store and issues it to the vehicle at once, so it shows both
  function ledger() {
    const inward = DX.rows(inA).map(r => {
      const qty = +r.quantity || 0, direct = r.fuel_entry_type === "Vehicle";
      return { date: r.date, ref: r.name, kind: direct ? "Direct at pump" : "Drum inward", vehicle: direct ? r.vehicle_label || vehicleLabel(r.custom_vehicles) : "", store: r.warehouse, fuel: r.types_of_fuel, qty, inQ: qty, outQ: direct ? qty : 0, dir: direct ? 0 : 1 };
    });
    const issues = DX.rows(distA).filter(r => r.docstatus !== 2).map(r => { const qty = +r.issued_quantity_ltr || 0; return { date: r.fd_date, ref: r.name, kind: "Issue to vehicle", vehicle: r.vehicle_label || vehicleLabel(r.fd_vehicle_name), store: r.warehouse, fuel: r.fd_fuel_type, qty, inQ: 0, outQ: qty, dir: -1 }; });
    return inward.concat(issues).sort((a, b) => b.date.localeCompare(a.date) || a.dir - b.dir);
  }
  const storeTable = (rows, maxh) => ((rows || []).length ? DX.table([{ f: "s", label: "Store", strong: true }, { f: "town", label: "Town / project", hideSm: true }, { f: "d", label: "Diesel (L)", type: "num", d: 1, total: true }, { f: "p", label: "Petrol (L)", type: "num", d: 1, total: true }, { label: "Status", type: "status", get: r => (r.d < 50 ? DX.status("Low", "pending") : DX.status("OK", "ok")) }], rows, { foot: true, maxh }) : DX.empty("No store balances", "No fuel store is configured for your towns yet."));
  const movements = n => ledger().slice(0, n).map(l => `<div class="dx-feed-row"><span class="dx-tile${l.dir > 0 ? " dx-tile-ok" : " dx-tile-pending"}">${ic(l.dir > 0 ? "download" : "truck", 14)}</span><div class="dx-feed-main"><div class="dx-feed-title">${l.dir > 0 ? "In" : l.dir < 0 ? "Out" : "Direct"} · <span class="dx-mono">${nf(l.qty, 1)} L</span> ${esc(l.fuel)}</div><div class="dx-feed-sub">${l.vehicle ? esc(l.vehicle) + " · " : ""}${esc(l.store)}</div></div><div class="dx-feed-end"><span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(l.date)}</span></div></div>`).join("") || DX.empty("No movements", "");
  const vehicleSummary = () => { const by = {}; DX.rows(inA).forEach(r => { if (r.fuel_entry_type === "Vehicle") { const k = r.vehicle_label || r.custom_vehicles; by[k] = (by[k] || 0) + (+r.quantity || 0); } }); return DX.card("Vehicle-wise summary", DX.bars(Object.entries(by).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8), { unit: "L", fmt: v => nf(v, 1) }), { icon: "truck", tone: "cyan", sub: "direct distribution at the pump" }); };

  const app = DX.register({
    key: "fuelin", title: "Fuel", short: "Fuel", icon: "fuel", hue: "green", route: "/desk/fuel-inward-direct-distribution",
    desc: "Pump purchase · store stock · issue to vehicle", eyebrow: "Fuel management", headline: `Fuel <span class="dx-grad">dashboard</span>`,
    intro: "Record fuel bought at the pump — into the site store (drum) or straight into a vehicle — and issue store fuel to vehicles. A pump entry submits the Purchase Receipt and sends the invoice to Accounts; every issue posts a Material Issue from the store.",
    docs: [inA, distA], noRecent: true,
    boot: () => bootFuel(app),
    heroActions: () => `${V.newBtn(inA)}${canDist() ? `<button class="dx-btn dx-btn-secondary" data-go="${DX.newRoute(distA)}">${ic("truck", 15)}Issue to vehicle</button>` : ""}`,
    kpis: () => {
      const f = DX.rows(inA).filter(r => r.date >= DX.addDays(DX.TODAY, -30));
      const k = [
        { label: "Total inward", value: nf(DX.sum(f.filter(r => r.fuel_entry_type === "Drum"), "quantity")), unit: "Ltr", sub: `Drum · last 30 days · <span class="dx-num">${DX.money(DX.sum(f, "amount"))}</span> purchased`, icon: "droplet", tone: "cyan" },
        { label: "Direct distribution", value: nf(DX.sum(f.filter(r => r.fuel_entry_type === "Vehicle"), "quantity")), unit: "Ltr", sub: "Pump → vehicle · last 30 days", icon: "truck" }
      ];
      if (canDist()) k.push({ label: "Diesel in stores", value: nf(DX.sum(B.stock || [], "d")), unit: "L", sub: `<span class="dx-num">${nf(DX.sum(DX.rows(distA).filter(r => r.fd_date >= DX.monthStart()), "issued_quantity_ltr"))}</span> L issued to vehicles this month`, icon: "database", tone: "ok" });
      else k.push({ label: "Total purchase amount", value: DX.money(DX.sum(f, "amount")), sub: "Both entry types · last 30 days", icon: "rupee", tone: "ok" });
      k.push({ label: "Pending invoice approvals", value: nf(pending().length), sub: "Purchase Invoices in draft", icon: "inbox", tone: "pending" });
      return k;
    },
    panels: () => (canDist()
      ? [DX.card("Store-wise balance", storeTable((B.stock || []).slice(0, 8)), { icon: "database", tone: "cyan", sub: `live stock · ${esc(B.stockCompany || "")}`, action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="fuelin/stock">All stores${ic("right", 13)}</button>` }),
        DX.card("Latest movements", movements(8), { icon: "swap", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="fuelin/ledger">Stock ledger${ic("right", 13)}</button>` }),
        `<div style="height:16px"></div>${vehicleSummary()}`]
      : [vehicleSummary(), DX.card("Recent fuel entries", V.recentList(inA, 8), { icon: "clock", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="fuelin/inward">View all${ic("right", 13)}</button>` })]),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "inward", docs: ["inward"], load: async () => { if (canDist()) await Promise.all([DX.ensure(distA), loadStock()]); } },
      { id: "inward", label: "Inward & direct", icon: "list", type: "list", doc: "inward", group: "Pump purchase", count: () => DX.rows(inA).length, searchPh: "Search entry, vehicle, PR or PI…", search: [r => r.name, r => r.vehicle_label, r => r.pr, r => r.pi, r => r.custom_petrol_pump, r => r.supplier],
        banner: () => `<div class="dx-note">${ic("calendar", 16)}<div>Showing entries from <b>${DX.fmtDate(WINDOW().from_date)}</b> to today. Older entries are in the full report on the ERP page.</div></div>`,
        filters: [{ f: "fuel_entry_type", label: "Entry type", options: [{ value: "Drum", label: "Fuel inward" }, { value: "Vehicle", label: "Direct distribution" }], display: v => (v === "Drum" ? "Fuel inward" : "Direct distribution") }, { f: "town_label", label: "Town / project", options: () => [...new Set(DX.rows(inA).map(r => r.town_label).filter(Boolean))].sort() }, { f: "types_of_fuel", label: "Fuel", options: () => meta().filter_options.fuel_types || ["Diesel", "Petrol"] }],
        sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "quantity"), 1)}</span> L · <span class="dx-num">${DX.money(DX.sum(rows, "amount"))}</span>`, columns: inwardCols },
      { id: "add", label: "Add fuel entry", icon: "plus", type: "form", doc: "inward", group: "Pump purchase" },
      { id: "stock", label: "Store balance", icon: "database", group: "Store & issue", needsDist: true, load: loadStock, render: () => DX.card("Store-wise balance", storeTable(B.stock, "68vh"), { icon: "database", tone: "cyan", sub: `live stock · ${esc(B.stockCompany || "")} · inward − issued` }) },
      { id: "distribution", label: "Fuel distribution", icon: "truck", type: "list", doc: "dist", group: "Store & issue", needsDist: true, searchPh: "Search entry, vehicle or material issue…", search: [r => r.name, r => r.vehicle_label, r => r.mi], filters: [{ f: "town_label", label: "Town / project", options: () => [...new Set(DX.rows(distA).map(r => r.town_label).filter(Boolean))].sort() }, { f: "reading_status", label: "Reading status", options: ["Working", "Not Working", "Not Applicable"] }], columns: distCols },
      { id: "newissue", label: "Issue to vehicle", icon: "plus", type: "form", doc: "dist", group: "Store & issue", needsDist: true },
      { id: "ledger", label: "Stock ledger", icon: "swap", group: "Store & issue", needsDist: true, docs: ["inward", "dist"], render: () => DX.card("Stock ledger", `<div class="dx-meta"><span>Drum inward, issues to vehicles and direct pump fills since ${DX.fmtDate(WINDOW().from_date)}, newest first.</span></div>` + DX.table([{ f: "date", label: "Date", type: "date" }, { f: "ref", label: "Voucher", type: "mono" }, { f: "kind", label: "Type" }, { label: "Vehicle", trunc: true, strong: true, get: l => l.vehicle || "—" }, { f: "store", label: "Store", trunc: true }, { f: "fuel", label: "Fuel" }, { label: "In (L)", type: "num", d: 1, get: l => l.inQ || "" }, { label: "Out (L)", type: "num", d: 1, get: l => l.outQ || "" }], ledger(), { maxh: "68vh" }), { icon: "swap", tone: "cyan" }) },
      { id: "approvals", label: "Invoice approvals", icon: "inbox", group: "Accounts", docs: ["inward"], count: () => pending().length, render: () => DX.card("Invoice approvals", pending().map(r => `<div class="dx-appr"><div class="dx-appr-main"><div class="dx-appr-title">${esc(r.supplier || r.custom_petrol_pump)} <span class="dx-muted" style="font-weight:400">· ${r.fuel_entry_type === "Vehicle" ? "Direct distribution" : "Fuel inward"}</span></div><div class="dx-appr-meta"><span>${esc(r.town_label || "")}</span><span>${nf(r.quantity, 2)} L ${esc(r.types_of_fuel)}</span><span class="dx-mono">${DX.fmtDate(r.date)}</span></div></div><div class="dx-appr-amt">${DX.money(r.amount)}</div><div class="dx-appr-actions"><button class="dx-btn dx-btn-secondary dx-btn-sm" data-go="${esc(DX.entryRoute(inA, r))}">Open</button><button class="dx-btn dx-btn-ok dx-btn-sm" data-approve="${esc(r.name)}">${ic("check", 13)}Approve</button></div></div>`).join("") || DX.empty("Nothing to approve", "Every fuel invoice in this window has been approved."), { icon: "inbox", tone: "pending", sub: `${pending().length} draft Purchase Invoices · Accounts User / Manager` }),
        bind: ctx => ctx.on("click", async e => { const a = e.target.closest("[data-approve]"); if (!a) return; try { if (await approve(DX.find(inA, a.dataset.approve))) ctx.rerender(); } catch (err) { V.showProblems(err, "Couldn’t approve"); } }) },
      { id: "report", label: "Inward report", icon: "chart", type: "report", doc: "inward", group: "Reports", title: "Inward & Direct Distribution report", tabs: [{ id: "report", label: "Inward & direct distribution" }, { id: "fdreport", label: "Fuel distribution" }], filters: [{ f: "types_of_fuel", label: "Fuel", options: () => meta().filter_options.fuel_types || ["Diesel", "Petrol"] }, { f: "warehouse", label: "Store", options: () => stores() }], sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "quantity"), 1)}</span> Ltr total`, columns: inwardCols.concat([{ f: "rateltr_ffs", label: "Rate", type: "num", d: 2 }, { label: "Invoice", type: "html", get: r => invoiceState(r) }]) },
      { id: "fdreport", label: "Distribution report", icon: "chart", type: "report", doc: "dist", group: "Reports", date: "fd_date", needsDist: true, title: "Fuel Distribution report", tabs: [{ id: "report", label: "Inward & direct distribution" }, { id: "fdreport", label: "Fuel distribution" }], filters: [{ f: "fd_fuel_type", label: "Fuel", options: ["Diesel", "Petrol"] }, { f: "reading_status", label: "Reading status", options: ["Working", "Not Working", "Not Applicable"] }], columns: distCols }
    ]
  });
})();
