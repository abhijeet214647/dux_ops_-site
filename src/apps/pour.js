/* Pour Card (pipe_laying_inhouse · pour-card-report, material-transfer, /pipe-laying/m). */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc, ic } = DX;
  const PIPES = ["80mm DI", "100mm DI", "125mm DI", "150mm DI", "200mm DI", "250mm DI", "300mm DI", "400mm DI", "90mm HDPE", "110mm HDPE", "160mm HDPE", "200mm HDPE", "250mm HDPE", "315mm HDPE", "63mm MDPE"];
  const ACCS = ["Air Valve 100", "All Socket Tee 200x200x200", "Sluice Valve 150 MM", "MJ Collar 150 MM", "MS Clamp 200 MM", "EF Reducer 110 x 160 MM", "EF Bend 45° (110MM)", "Tyton Ring 150 MM", "Rabbar Packing 200 MM", "EF End Cap 110 MM", "Water Meter 15 MM"];
  const COMPONENTS = { "MPUSIP - 6J": ["CWFM - Satai", "CWFM - Khargapur", "CWFM - Jatara", "CWFM - Bijawar", "CWPM", "Distribution - Bijawar", "Distribution - Jatara"], "MPJNM - NP - II": ["Clear Water", "Distribution Network", "Raw Water"] };
  const ZONES = { "MPUSIP - 6J": ["Zone - 6J"], "MPJNM - NP - II": ["Bhopalpura", "Birora Khet", "Chomo Bhata", "Dirguwan", "Madiya Khas", "Ladwari Khas"] };
  const WAREHOUSES = ["Stores - JEWPL", "Palda Factory - JEWPL", "MPUSIP - 6J - JEWPL", "Kharagpur - MPUSIP - 6J - JEWPL", "Satai - JEWPL", "Jatara - JEWPL", "Zone-1 - MPJNM - NP - II - JEWPL", "Zone-2 - MPJNM - NP - II - JEWPL"];
  const siteContractors = p => M.contractors.filter(c => M.town(c.town).project === p).slice(0, 4).map(c => ({ value: c.id, label: c.name, sub: c.id }));
  const dia = name => { const m = /(\d+)\s*mm/i.exec(name || "") || /(\d+)/.exec(name || ""); return m ? +m[1] : 0; };
  const lwd = (l, w, d) => (+l && +w && +d ? +l * +w * +d : 0);
  // quantities for one PIPE-ID batch (desk popup = mobile = server formulas)
  const Q = b => {
    const total = lwd(b.l, b.w, b.d), cc = lwd(b.cc_l, b.cc_w, b.cc_d), soft = lwd(b.sr_l, b.sr_w, b.sr_d), hard = lwd(b.hr_l, b.hr_w, b.hr_d);
    const murum = +b.inc_murum ? lwd(b.mu_l, b.mu_w, b.mu_d) : 0, pv = 3.14 * Math.pow(dia(b.pipe) / 1000, 2) / 4 * (+b.l || 0);
    return { total, cc, soft, hard, murum, soil: total - cc - soft - hard, pv, back: total - murum - pv };
  };
  const cardQ = c => (c.batches || []).reduce((s, b) => { const q = Q(b); s.len += +b.l || 0; s.exc += q.total; s.acc += (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0); return s; }, { len: 0, exc: 0, acc: 0 });

  const card = {
    key: "card", doctype: "Pour Card", prefix: "PC", seqStart: 33550, naming: (d, n) => "PC-" + n,
    entity: { singular: "Pour card", plural: "Pour cards", title: r => r.name, sub: r => `${r.component || r.townproject} · ${r.from_junction} → ${r.to_junction}`, date: "date" },
    newLabel: "New pour card", submitBtn: "Lock entry", submitTitle: "Lock this pour card?", submitOk: "Lock entry", submitSub: "This entry will be locked. Changes can’t be made after submission.",
    status: r => r.docstatus === 2 ? ["Cancelled", "err"] : r.docstatus === 1 ? ["Lock Entry", "ok"] : ["Saved", "iris"],
    statusKey: r => (r.docstatus === 1 ? "locked" : r.docstatus === 2 ? "cancelled" : "saved"),
    statusFilter: [["", "All"], ["saved", "Saved"], ["locked", "Lock Entry"], ["cancelled", "Cancelled"]],
    defaults: () => ({ date: DX.TODAY, company: M.companies[0][0], townproject: "MPUSIP - 6J", batches: [] }),
    form: [
      { id: "proj", title: "Add project details", short: "Project", icon: "building", fields: [
        { f: "townproject", label: "Project", type: "link", req: true, options: () => Object.keys(COMPONENTS) },
        { f: "component", label: "Select component", type: "link", parent: ["townproject"], options: d => COMPONENTS[d.townproject] || [] },
        { f: "zone_name", label: "Zone name", type: "link", parent: ["townproject"], options: d => ZONES[d.townproject] || [], showIf: d => /^Distribution - /.test(d.component || ""), hint: "Only for Distribution components." },
        { f: "select_contractor", label: "Select contractor", type: "link", req: true, parent: ["townproject"], options: d => siteContractors(d.townproject) },
        { f: "company", label: "Company", type: "link", options: M.companyOpts },
        { f: "date", label: "Date", type: "date" },
        { f: "from_junction", label: "From junction", type: "text", req: true, ph: "e.g. 355 or MH-4" },
        { f: "to_junction", label: "To junction", type: "text", req: true, ph: "e.g. 432 or OHT" },
        { f: "custom_chainage_from", label: "Chainage from", type: "text", ph: "e.g. 4.2(9.2)" },
        { f: "custom_chainage_to", label: "Chainage to", type: "text", ph: "e.g. 449.5" },
        { f: "attach_jojl", label: "Upload attachment", type: "photo", icon: "image" }
      ] }
    ],
    validate: (d) => {
      const e = {};
      if (d.from_junction && d.to_junction && d.from_junction.trim() === d.to_junction.trim()) e.to_junction = "From Junction and To Junction cannot be same.";
      const dup = DX.rows(card).find(r => r.name !== d.name && r.docstatus !== 2 && r.from_junction === d.from_junction && r.to_junction === d.to_junction && d.from_junction);
      if (dup) e.to_junction = `This junction pair already exists on ${dup.name}.`;
      if (/^Distribution - /.test(d.component || "") && !d.zone_name) e.zone_name = "Pick a zone for Distribution components.";
      return e;
    },
    submitProblems: d => (d.batches || []).length ? [] : ["Add at least one laying detail (PIPE-ID) before locking."],
    submitLines: d => { const q = cardQ(d); return [["Pipe entries", nf((d.batches || []).length)], ["Pipe length (m)", nf(q.len, 2)], ["Total excavation (m³)", nf(q.exc, 3)], ["Accessory qty", nf(q.acc)]]; },
    onSubmit: () => {},
    lockBanner: () => `<b>Lock Entry</b> — card is submitted. Stock posting on lock is currently held, so no Material Issue is created.`,
    detailActions: d => [d.docstatus === 0 && { label: "Add laying details", icon: "plus", tone: "secondary", run: (x, ctx) => layingModal(x, ctx) }, (d.batches || []).length && { label: "Backfilling", icon: "layers", run: x => backfillModal(x) }],
    detailExtra: d => {
      const bs = d.batches || [];
      return DX.card(`Entries <span class="dx-num">(${bs.length})</span>`, bs.length ? DX.table([
        { f: "pipe_id", label: "Pipe ID", type: "mono" }, { f: "date", label: "Date", type: "date" }, { f: "pipe", label: "Pipe" },
        { label: "L × W × D (m)", type: "mono", get: b => `${nf(b.l, 2)} × ${nf(b.w, 2)} × ${nf(b.d, 2)}` },
        { label: "Excavation", type: "num", d: 3, get: b => Q(b).total, total: true, f: "_t" }, { label: "CC", type: "num", d: 3, get: b => Q(b).cc }, { label: "Soft rock", type: "num", d: 3, get: b => Q(b).soft, hideSm: true }, { label: "Hard rock", type: "num", d: 3, get: b => Q(b).hard, hideSm: true },
        { label: "Soil", type: "num", d: 3, get: b => Q(b).soil }, { label: "Pipe vol.", type: "num", d: 4, get: b => Q(b).pv, hideSm: true }, { label: "Accessories", type: "num", get: b => (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0) }
      ], bs.map(b => Object.assign({ _t: Q(b).total }, b))) : DX.empty("No laying details yet", "Use “Add laying details” — one entry = one PIPE-ID shared across excavation, rock, soil, CC and accessories."), { icon: "pipe", tone: "cyan", sub: "one row per PIPE-ID" }) + "<div style='height:16px'></div>";
    },
    seed: () => {
      const g = DX.seeder(3355), out = [];
      const junc = [["355", "432"], ["432", "4495"], ["01", "OHT"], ["IPS", "01"], ["12", "18"], ["18", "27"], ["MH-4", "MH-7"], ["27", "31"], ["40", "46"], ["46", "52"], ["5", "9"], ["9", "13"]];
      junc.forEach(([fj, tj], i) => {
        const proj = i < 7 ? "MPUSIP - 6J" : "MPJNM - NP - II", comp = g.pick(COMPONENTS[proj]), date = DX.addDays(DX.TODAY, -g.int(0, 40));
        const batches = Array.from({ length: g.int(1, 3) }, (_, k) => ({ pipe_id: "PIPE-" + String(i * 3 + k + 1).padStart(3, "0"), date, pipe: g.pick(PIPES.slice(0, 9)), l: g.int(20, 90), w: 0.65, d: g.flt(0.9, 1.4), cc_l: g.chance(.5) ? g.int(5, 15) : 0, cc_w: 0.65, cc_d: 0.15, sr_l: g.chance(.4) ? g.int(3, 10) : 0, sr_w: 0.65, sr_d: 0.3, hr_l: g.chance(.2) ? g.int(2, 6) : 0, hr_w: 0.65, hr_d: 0.3, inc_murum: g.chance(.5) ? 1 : 0, mu_l: 10, mu_w: 0.65, mu_d: 0.15, acc: g.chance(.6) ? [{ item: g.pick(ACCS), qty: g.int(1, 6) }] : [] }));
        out.push({ name: "PC-" + (33530 + i), docstatus: i < 5 ? 1 : 0, date, company: M.companies[0][0], townproject: proj, component: comp, zone_name: /^Distribution/.test(comp) ? ZONES[proj][0] : "", select_contractor: siteContractors(proj)[i % 3].value, from_junction: fj, to_junction: tj, custom_chainage_from: i === 1 ? "432" : "", custom_chainage_to: i === 1 ? "449.5" : "", attach_jojl: "", batches });
      });
      return out;
    }
  };
  const pipeSeq = () => 1 + Math.max(0, ...DX.rows(card).flatMap(c => (c.batches || []).map(b => +String(b.pipe_id).replace(/\D/g, "") || 0)));

  // "Pour Card Details" popup — one PIPE-ID across every table
  const LAY = {
    key: "laying", entity: { singular: "Laying detail" },
    form: [
      { id: "exc", title: "Excavation details", short: "Excavation", icon: "layers", cols: 4, fields: [
        { f: "date", label: "Date", type: "date", req: true }, { f: "l", label: "Length (m)", type: "float", req: true, step: 0.001 }, { f: "w", label: "Width (m)", type: "float", req: true, step: 0.001 }, { f: "d", label: "Depth (m)", type: "float", req: true, step: 0.001 },
        { f: "q_total", label: "Total excavation", type: "computed", unit: "m³", d: 3, calc: b => Q(b).total, formula: "L × W × D" },
        { f: "cc_l", label: "CC road · L", type: "float", step: 0.001 }, { f: "cc_w", label: "CC · W", type: "float", step: 0.001 }, { f: "cc_d", label: "CC · D", type: "float", step: 0.001 },
        { f: "sr_l", label: "Soft rock · L", type: "float", step: 0.001 }, { f: "sr_w", label: "Soft rock · W", type: "float", step: 0.001 }, { f: "sr_d", label: "Soft rock · D", type: "float", step: 0.001 },
        { f: "q_cc", label: "CC qty", type: "computed", unit: "m³", d: 3, calc: b => Q(b).cc },
        { f: "hr_l", label: "Hard rock · L", type: "float", step: 0.001 }, { f: "hr_w", label: "Hard rock · W", type: "float", step: 0.001 }, { f: "hr_d", label: "Hard rock · D", type: "float", step: 0.001 },
        { f: "q_soil", label: "Soil excavation", type: "computed", unit: "m³", d: 3, calc: b => Q(b).soil, formula: "Total − CC − Soft − Hard" }
      ] },
      { id: "lay", title: "Laying & backfilling", short: "Laying", icon: "pipe", tone: "cyan", cols: 4, fields: [
        { f: "pipe", label: "Pipe details", type: "link", req: true, span: 2, options: PIPES },
        { f: "q_pv", label: "Pipe volume", type: "computed", unit: "m³", d: 4, calc: b => Q(b).pv, formula: "3.14 × (d/1000)² / 4 × L" },
        { f: "inc_murum", label: "Include murum", type: "check", on: "Murum bedding" },
        { f: "mu_l", label: "Murum · L", type: "float", step: 0.001, showIf: b => +b.inc_murum }, { f: "mu_w", label: "Murum · W", type: "float", step: 0.001, showIf: b => +b.inc_murum }, { f: "mu_d", label: "Murum · D", type: "float", step: 0.001, showIf: b => +b.inc_murum },
        { f: "q_back", label: "Backfilling", type: "computed", unit: "m³", d: 3, calc: b => Q(b).back, formula: "Total − Murum − Pipe volume" }
      ] },
      { id: "acc", title: "Accessories", short: "Accessories", icon: "box", cols: 2, fields: [
        { f: "acc", label: "Accessories used", type: "table", span: "all", rowLabel: "accessory", columns: [{ f: "item", label: "Accessory", type: "select", options: ACCS }, { f: "qty", label: "Quantity", type: "int", total: true }] }
      ] }
    ],
    validate: b => { const e = {}; [["cc_l", "CC road"], ["sr_l", "Soft rock"], ["hr_l", "Hard rock"], ["mu_l", "Murum"]].forEach(([f, l]) => { if (+b[f] > +b.l && +b.l) e[f] = `${l} length can’t be greater than the total pipe length.`; }); if (Q(b).soil < 0) e.q_soil = "Soil excavation is negative — check CC / rock quantities."; return e; }
  };
  function layingModal(c) {
    return new Promise(resolve => {
      const b = DX.blank(LAY); Object.assign(b, { date: DX.TODAY, w: 0.65, cc_w: 0.65, sr_w: 0.65, hr_w: 0.65, mu_w: 0.65, acc: [] });
      const id = "PIPE-" + String(pipeSeq()).padStart(3, "0");
      const m = DX.openModal({ title: "Pour card details", sub: `Adds <span class="dx-mono">${id}</span> to ${esc(c.name)} — shared across excavation, rock, soil, CC and accessories.`, wide: true, body: DX.formHTML(LAY, b, "new"), foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Cancel</button><button class="dx-btn dx-btn-primary" data-lsave>${ic("plus", 15)}Add</button>` });
      m.querySelector(".dx-steps").remove();
      const F = DX.formCtl(LAY, b, "new", m);
      m.querySelector("[data-lsave]").addEventListener("click", () => {
        const errs = DX.validate(LAY, b); if (Object.keys(errs).length) return F.showErrors(errs);
        c.batches = (c.batches || []).concat(Object.assign({ pipe_id: id }, b)); DX.closeModal();
        DX.toast(`Laying details added · <span class="dx-mono">${id}</span>`); resolve(true);
      });
    });
  }
  function backfillModal(c) {
    const rows = (c.batches || []).map(b => ({ b, q: Q(b) }));
    DX.openModal({ title: "Backfilling", sub: "Backfilling = Total excavation − Murum − Pipe volume", wide: true, body: DX.table([{ label: "Pipe ID", type: "mono", get: x => x.b.pipe_id }, { label: "Pipe", get: x => x.b.pipe }, { label: "Dia (mm)", type: "num", get: x => dia(x.b.pipe) }, { label: "Total exc.", type: "num", d: 3, f: "t", total: true }, { label: "Murum", type: "num", d: 3, f: "m", total: true }, { label: "Pipe vol.", type: "num", d: 4, f: "p", total: true }, { label: "Backfilling", type: "num", d: 3, f: "k", total: true }], rows.map(x => Object.assign(x, { t: x.q.total, m: x.q.murum, p: x.q.pv, k: x.q.back })), { foot: true }), foot: `<button class="dx-btn dx-btn-primary" data-modal-x>${ic("check", 15)}Save to pour card</button>` });
    return Promise.resolve(false);
  }

  const mt = {
    key: "mt", doctype: "Stock Entry · Material Transfer", prefix: "MAT-STE", seqStart: 620, naming: (d, n) => "MAT-STE-2026-00" + n,
    entity: { singular: "Material transfer", plural: "Material transfers", title: r => `${r.from_wh} → ${r.to_wh}`, sub: r => `${(r.items || []).length} items · ${r.name}`, date: "posting_date" },
    newLabel: "New transfer", submitLabel: "Save & submit", submitTitle: "Submit this transfer?", submitSub: "ERPNext stock rules run on submit.",
    defaults: () => ({ posting_date: DX.TODAY, company: M.companies[0][0], items: [{ item: "", qty: 1, uom: "Nos", rate: 0 }] }),
    form: [{ id: "tr", title: "Transfer details", short: "Details", icon: "swap", fields: [
      { f: "company", label: "Company", type: "link", req: true, options: M.companyOpts }, { f: "posting_date", label: "Posting date", type: "date", req: true },
      { f: "from_wh", label: "Default source warehouse", type: "link", req: true, options: WAREHOUSES }, { f: "to_wh", label: "Default target warehouse", type: "link", req: true, options: WAREHOUSES },
      { f: "items", label: "Items", type: "table", span: "all", minRows: 1, rowLabel: "item", newRow: () => ({ item: "", qty: 1, uom: "Nos", rate: 0 }), columns: [{ f: "item", label: "Item code", type: "select", options: PIPES.concat(ACCS) }, { f: "qty", label: "Qty", type: "float", total: true }, { f: "uom", label: "UOM", type: "select", options: ["Nos", "Mtr", "Kg"] }, { f: "rate", label: "Basic rate", type: "float" }] }
    ] }],
    validate: d => (d.from_wh && d.from_wh === d.to_wh ? { to_wh: "Source and target warehouse must differ." } : (d.items || []).every(r => !(+r.qty > 0)) ? { items: "At least one item needs a quantity above 0." } : {}),
    onSubmit: () => {},
    seed: () => { const g = DX.seeder(62), out = []; for (let i = 0; i < 8; i++) out.push({ name: "MAT-STE-2026-00" + (600 + i), docstatus: i < 6 ? 1 : 0, posting_date: DX.addDays(DX.TODAY, -g.int(0, 35)), company: M.companies[0][0], from_wh: "Stores - JEWPL", to_wh: g.pick(WAREHOUSES.slice(2)), items: [{ item: g.pick(PIPES), qty: g.int(20, 200), uom: "Mtr", rate: 0 }, { item: g.pick(ACCS), qty: g.int(2, 20), uom: "Nos", rate: 0 }] }); return out; }
  };

  const pipeRows = () => DX.rows(card).flatMap(c => (c.batches || []).map(b => { const q = Q(b); return { name: c.name, card: c, date: b.date, pipe_id: b.pipe_id, townproject: c.townproject, component: c.component, contractor: M.contractorName(c.select_contractor), junction: `${c.from_junction} → ${c.to_junction}`, pipe: b.pipe, len: +b.l, exc: q.total, hard: q.hard, soft: q.soft, soil: q.soil, murum: q.murum, cc: q.cc, acc: (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0), st: c.docstatus === 1 ? "Lock Entry" : "Saved" }; }));

  DX.register({
    key: "pour", title: "Pour Card", short: "Pour Card", icon: "card", hue: "blue", route: "/desk/pour-card-report",
    desc: "Pipe laying · excavation & backfilling", eyebrow: "Pipe laying · Pour cards",
    headline: `Every metre of pipe, on a <span class="dx-grad">pour card</span>`,
    intro: "Create the card, add laying details per PIPE-ID (excavation, rock, soil, CC road, accessories), then Lock Entry. Quantities are calculated live exactly like the desk popup.",
    docs: [card, mt],
    kpis: () => { const cs = DX.rows(card), q = cs.map(cardQ); return [
      { label: "Pour cards", value: nf(cs.length), sub: `<span class="dx-num">${cs.filter(c => c.date === DX.TODAY).length}</span> created today`, icon: "card" },
      { label: "Pipe entries", value: nf(cs.reduce((n, c) => n + (c.batches || []).length, 0)), sub: "PIPE-IDs across all cards", icon: "pipe", tone: "cyan" },
      { label: "Total pipe length", value: nf(DX.sum(q, "len")), unit: "m", sub: `Excavation <span class="dx-num">${nf(DX.sum(q, "exc"), 1)}</span> m³`, icon: "layers" },
      { label: "Locked entries", value: nf(cs.filter(c => c.docstatus === 1).length), sub: `<span class="dx-num">${cs.length ? Math.round(cs.filter(c => c.docstatus === 1).length / cs.length * 100) : 0}%</span> of cards`, icon: "lock", tone: "ok" }
    ]; },
    panels: () => { const byDate = {}; pipeRows().forEach(p => (byDate[p.date] = (byDate[p.date] || 0) + 1)); const bars = Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).map(([d, v]) => ({ label: DX.fmtDate(d), value: v })); return [DX.card("Pipe entries by date", DX.bars(bars), { icon: "chart", tone: "cyan", sub: "last 8 working days" })]; },
    homeStat: () => ({ value: nf(DX.rows(card).length), label: "pour cards" }),
    attention: () => DX.rows(card).filter(c => c.docstatus === 0).slice(0, 4).map(c => ({ title: c.name, sub: `Saved · ${c.from_junction} → ${c.to_junction} · not locked`, go: DX.entryRoute(card, c), tag: "Lock pending" })),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard" },
      { id: "cards", label: "Pour cards", icon: "list", type: "list", count: () => DX.rows(card).length, searchPh: "Search card, component, contractor, junction…",
        search: [r => r.name, r => r.component, r => r.townproject, r => M.contractorName(r.select_contractor), r => r.from_junction, r => r.to_junction],
        filters: [{ f: "townproject", label: "Project", options: Object.keys(COMPONENTS), clears: ["component"] }, { f: "component", label: "Component", options: f => (f.townproject ? COMPONENTS[f.townproject] : Object.values(COMPONENTS).flat()) }],
        columns: [{ f: "name", label: "Pour card", type: "mono", strong: true }, { f: "townproject", label: "Project" }, { f: "component", label: "Component" }, { label: "Contractor", get: r => M.contractorName(r.select_contractor), trunc: true }, { label: "Junction", type: "mono", get: r => `${r.from_junction} → ${r.to_junction}` }, { label: "Pipes", type: "num", get: r => (r.batches || []).length }, { label: "Excavation (m³)", type: "num", d: 2, get: r => cardQ(r).exc }, { f: "date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(card, r) }],
        cardFoot: r => [`<span class="dx-mono">${esc(r.from_junction)} → ${esc(r.to_junction)}</span>`, `<span><span class="dx-num">${(r.batches || []).length}</span> pipes</span>`, `<span class="dx-mono">${DX.fmtDate(r.date)}</span>`] },
      { id: "new", label: "New pour card", icon: "plus", type: "form", doc: "card" },
      { id: "report", label: "Pour card report", icon: "chart", type: "report", group: "Insights", title: "Pour Card Report", noLink: true, rows: () => pipeRows(),
        filters: [{ f: "townproject", label: "Project", options: Object.keys(COMPONENTS) }, { f: "st", label: "Entry status", options: ["Saved", "Lock Entry"] }],
        kpis: rows => [{ label: "Pour cards", value: nf(new Set(rows.map(r => r.name)).size), icon: "card" }, { label: "Pipe entries", value: nf(rows.length), icon: "pipe", tone: "cyan" }, { label: "Total pipe length", value: nf(DX.sum(rows, "len")), unit: "m", icon: "layers" }, { label: "Total excavation", value: nf(DX.sum(rows, "exc"), 2), unit: "m³", icon: "box", tone: "ok" }],
        columns: [{ f: "name", label: "Pour card", type: "mono", strong: true }, { f: "date", label: "Entry date", type: "date" }, { f: "pipe_id", label: "Pipe ID", type: "mono" }, { f: "component", label: "Component" }, { f: "contractor", label: "Contractor", trunc: true }, { f: "junction", label: "Junction", type: "mono" }, { f: "pipe", label: "Pipe" }, { f: "len", label: "Length (m)", type: "num", d: 2, total: true }, { f: "exc", label: "Excavation (m³)", type: "num", d: 3, total: true }, { f: "hard", label: "Hard rock", type: "num", d: 3, total: true, hideSm: true }, { f: "soft", label: "Soft rock", type: "num", d: 3, total: true, hideSm: true }, { f: "soil", label: "Soil", type: "num", d: 3, total: true }, { f: "cc", label: "CC breaking", type: "num", d: 3, total: true, hideSm: true }, { f: "acc", label: "Acc. qty", type: "num", total: true }, { f: "st", label: "Status" }] },
      { id: "transfers", label: "Material transfer", icon: "swap", type: "list", doc: "mt", group: "Stock", searchPh: "Search entry or warehouse…", columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "from_wh", label: "From warehouse", trunc: true }, { f: "to_wh", label: "To warehouse", trunc: true }, { f: "posting_date", label: "Posting date", type: "date" }, { label: "Items", type: "num", get: r => (r.items || []).length }, { label: "Status", type: "status", get: r => DX.statusOf(mt, r) }] },
      { id: "masters", label: "Masters", icon: "database", type: "masters", group: "Stock", tabs: [
        { label: "Components at site", doctype: "Component at Site", rows: () => Object.entries(COMPONENTS).flatMap(([p, cs]) => cs.map(c => ({ c, p }))), columns: [{ f: "c", label: "Component", strong: true }, { f: "p", label: "Project" }] },
        { label: "Zones", doctype: "Zone Details", rows: () => Object.entries(ZONES).flatMap(([p, zs]) => zs.map(z => ({ z, p }))), columns: [{ f: "z", label: "Zone", strong: true }, { f: "p", label: "Project" }] },
        { label: "Pipe items", doctype: "Item · DI / HDPE / MDPE", rows: () => PIPES.map(p => ({ p, d: dia(p), g: p.split(" ").pop() })), columns: [{ f: "p", label: "Item", strong: true }, { f: "g", label: "Group" }, { f: "d", label: "Dia (mm)", type: "num" }] },
        { label: "Accessories", doctype: "Item · accessory groups", rows: () => ACCS.map(a => ({ a })), columns: [{ f: "a", label: "Accessory", strong: true }] }
      ] }
    ]
  });
})();
