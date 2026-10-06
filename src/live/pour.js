/* Pour Card — LIVE (pipe_laying_inhouse). Same API as /pipe-laying/m (mobile_api) + the desk Pour Card Report and Material Transfer. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, { nf, esc, ic } = DX;
  const MA = "pipe_laying_inhouse.mobile_api.", PA = "pipe_laying_inhouse.api.", RP = "pipe_laying_inhouse.pipe_laying_inhouse.page.pour_card_report.pour_card_report.";
  const B = { projects: [], zones: [], components: [], contractors: [], pipe_items: [], acc_items: [], companies: [], caps: {}, mt: { warehouses: [], can_create: false, can_submit: false } };
  const byProject = (list, p) => list.filter(x => !p || x.project === p || !x.project);
  const dia = name => { const m = /(\d+)\s*mm/i.exec(name || "") || /(\d+)/.exec(name || ""); return m ? +m[1] : 0; };
  const lwd = (l, w, d) => (+l && +w && +d ? +l * +w * +d : 0);
  const isDist = c => /distribution/i.test(c || "");
  // quantities for one PIPE-ID batch — identical to the server formulas in add_laying_batch / calc_backfilling
  const Q = b => {
    const total = lwd(b.l, b.w, b.d), cc = lwd(b.cc_l, b.cc_w, b.cc_d), soft = lwd(b.sr_l, b.sr_w, b.sr_d), hard = lwd(b.hr_l, b.hr_w, b.hr_d);
    const murum = +b.inc_murum ? lwd(b.mu_l, b.mu_w, b.mu_d) : 0, pv = 3.14 * Math.pow(dia(b.pipe) / 1000, 2) / 4 * (+b.l || 0);
    return { total, cc, soft, hard, murum, soil: total - cc - soft - hard, pv, back: total - murum - pv };
  };
  const cardQ = c => (c.batches || []).reduce((s, b) => { const q = Q(b); s.len += +b.l || 0; s.exc += q.total; s.acc += (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0); return s; }, { len: 0, exc: 0, acc: 0 });
  const contractorName = id => { const c = B.contractors.find(x => x.name === id); return (c && (c.contractor || c.name)) || id || ""; };

  // get_card -> form doc with batches grouped by PIPE-ID
  const fromCard = c => {
    const by = {}, get = id => (by[id] = by[id] || { pipe_id: id, acc: [] });
    (c.pipe || []).forEach(p => Object.assign(get(p.pipe_id), { date: DX.day(p.date_of_pipelaying), pipe: p.pipe_details, l: p.length_of_pipemtr, w: p.width_of_pipemtr, d: p.depth_of_pipemtr, bedding: p.custom_bedding, strata: p.strata_name, remark: p.custom_remark || "" }));
    (c.soft || []).forEach(r => Object.assign(get(r.pipe_id), { sr_l: r.lengthmtr, sr_w: r.widthmtr, sr_d: r.depthmtr }));
    (c.hard || []).forEach(r => Object.assign(get(r.pipe_id), { hr_l: r.hard_rock_lengthmtr, hr_w: r.hard_rock_widthmtr, hr_d: r.hard_rock_depthmtr }));
    (c.murum || []).forEach(r => Object.assign(get(r.pipe_id), { inc_murum: 1, mu_l: r.hard_rock_lengthmtr, mu_w: r.hard_rock_widthmtr, mu_d: r.hard_rock_depthmtr }));
    (c.cc || []).forEach(r => Object.assign(get(r.pipe_id), { cc_l: r.cc_road_badding_length, cc_w: r.cc_road_badding_width, cc_d: r.cc_road_breaking_depth }));
    (c.acc || []).forEach(r => { get(r.pipe_id).acc.push({ item: r.accessories, qty: r.qauntity }); if (!by[r.pipe_id].date) by[r.pipe_id].date = DX.day(r.date_accessories); });
    const batches = Object.values(by).filter(b => b.pipe_id).sort((a, b) => String(a.pipe_id).localeCompare(String(b.pipe_id), undefined, { numeric: true }));
    return { name: c.name, docstatus: c.docstatus, townproject: c.project, zone_name: c.zone || "", component: c.component || "", select_contractor: c.contractor || "", from_junction: c.from_junction, to_junction: c.to_junction, custom_chainage_from: c.chainage_from || "", custom_chainage_to: c.chainage_to || "", company: c.company, attachment: c.attachment || "", material_issue: c.material_issue, total_quantity: c.total_quantity, date: DX.day(c.modified), modified: c.modified, can_write: c.can_write, can_submit: c.can_submit, backfill: c.backfill || [], batches };
  };
  const fromSummary = r => ({ name: r.name, docstatus: r.docstatus, townproject: r.project, zone_name: r.zone || "", component: r.component || "", select_contractor: r.contractor || "", from_junction: r.from_junction, to_junction: r.to_junction, material_issue: r.material_issue, total_quantity: r.total_quantity, date: DX.day(r.modified), modified: r.modified, owner: r.owner });

  const card = {
    key: "card", doctype: "Pour Card",
    entity: { singular: "Pour card", plural: "Pour cards", title: r => r.name, sub: r => `${r.component || r.townproject || ""} · ${r.from_junction || ""} → ${r.to_junction || ""}`, date: "date" },
    newLabel: "New pour card", submitBtn: "Lock entry", submitTitle: "Lock this pour card?", submitOk: "Lock entry", submitSub: "This entry will be locked. Changes can’t be made after submission.",
    get canCreate() { return B.caps.create !== false; },
    status: r => r.docstatus === 2 ? ["Cancelled", "err"] : r.docstatus === 1 ? ["Lock Entry", "ok"] : ["Saved", "iris"],
    statusKey: r => (r.docstatus === 1 ? "locked" : r.docstatus === 2 ? "cancelled" : "saved"),
    statusFilter: [["", "All"], ["saved", "Saved"], ["locked", "Lock Entry"], ["cancelled", "Cancelled"]],
    defaults: () => ({ company: B.caps.default_company || DX.M.defaultCompany, townproject: B.projects.length === 1 ? B.projects[0].name : "", batches: [] }),
    form: [
      { id: "proj", title: "Add project details", short: "Project", icon: "building", fields: [
        { f: "townproject", label: "Project", type: "link", req: true, options: () => B.projects.map(p => p.name) },
        { f: "component", label: "Select component", type: "link", parent: ["townproject"], options: d => byProject(B.components, d.townproject).map(c => c.name) },
        { f: "zone_name", label: "Zone name", type: "link", parent: ["townproject"], options: d => byProject(B.zones, d.townproject).map(z => z.name), showIf: d => isDist(d.component), hint: "Only for Distribution components." },
        { f: "select_contractor", label: "Select contractor", type: "link", req: true, parent: ["townproject"], options: d => byProject(B.contractors, d.townproject).map(c => ({ value: c.name, label: c.contractor || c.name, sub: c.project || "" })) },
        { f: "company", label: "Company", type: "link", options: () => B.companies.map(c => ({ value: c.name, label: c.name, sub: c.abbr })) },
        { f: "from_junction", label: "From junction", type: "text", req: true, ph: "e.g. 355 or MH-4" },
        { f: "to_junction", label: "To junction", type: "text", req: true, ph: "e.g. 432 or OHT" },
        { f: "custom_chainage_from", label: "Chainage from", type: "text", ph: "e.g. 4.2(9.2)" },
        { f: "custom_chainage_to", label: "Chainage to", type: "text", ph: "e.g. 449.5" },
        { f: "attachment", label: "Upload attachment", type: "photo", icon: "image", accept: "image/*,application/pdf" }
      ] }
    ],
    validate: d => {
      const e = {}, ch = /^[\d.()]*\d[\d.()]*$/;
      if (d.from_junction && d.to_junction && d.from_junction.trim() === d.to_junction.trim()) e.to_junction = "From Junction and To Junction cannot be same.";
      if (isDist(d.component) && !d.zone_name) e.zone_name = "Pick a zone for Distribution components.";
      ["custom_chainage_from", "custom_chainage_to"].forEach(f => { if (d[f] && !ch.test(String(d[f]).trim())) e[f] = "Only digits, a decimal point and brackets — like 4.2(9.2)."; });
      return e;
    },
    onSubmit: () => {},
    submitProblems: d => (d.batches || []).length ? [] : ["Add at least one laying detail (PIPE-ID) before locking."],
    submitLines: d => { const q = cardQ(d); return [["Pipe entries", nf((d.batches || []).length)], ["Pipe length (m)", nf(q.len, 2)], ["Total excavation (m³)", nf(q.exc, 3)], ["Accessory qty", nf(q.acc)]]; },
    lockBanner: d => d.material_issue ? "<b>Lock Entry</b> — Material Issue posted from the contractor’s warehouse." : `<b>Lock Entry</b> — card is submitted. Stock posting on lock is held on this site, so no Material Issue was created.`,
    detailActions: d => [d.docstatus === 0 && d.can_write !== false && { label: "Add laying details", icon: "plus", tone: "secondary", run: (x, ctx) => layingModal(x, ctx) }, (d.batches || []).length && { label: "Backfilling", icon: "layers", run: x => backfillModal(x) }],
    detailExtra: d => {
      const bs = d.batches || [];
      return DX.card(`Entries <span class="dx-num">(${bs.length})</span>`, bs.length ? DX.table([
        { f: "pipe_id", label: "Pipe ID", type: "mono" }, { f: "date", label: "Date", type: "date" }, { f: "pipe", label: "Pipe" },
        { label: "L × W × D (m)", type: "mono", get: b => `${nf(b.l, 2)} × ${nf(b.w, 2)} × ${nf(b.d, 2)}` },
        { label: "Excavation", type: "num", d: 3, get: b => Q(b).total, total: true, f: "_t" }, { label: "CC", type: "num", d: 3, get: b => Q(b).cc }, { label: "Soft rock", type: "num", d: 3, get: b => Q(b).soft, hideSm: true }, { label: "Hard rock", type: "num", d: 3, get: b => Q(b).hard, hideSm: true },
        { label: "Soil", type: "num", d: 3, get: b => Q(b).soil }, { label: "Pipe vol.", type: "num", d: 4, get: b => Q(b).pv, hideSm: true }, { label: "Accessories", type: "num", get: b => (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0) },
        ...(d.docstatus === 0 && d.can_write !== false ? [{ label: "", type: "html", get: b => `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-rmbatch="${esc(b.pipe_id)}" aria-label="Remove ${esc(b.pipe_id)}">${ic("trash", 14)}</button>` }] : [])
      ], bs.map(b => Object.assign({ _t: Q(b).total }, b))) : DX.empty("No laying details yet", "Use “Add laying details” — one entry = one PIPE-ID shared across excavation, rock, soil, CC and accessories."), { icon: "pipe", tone: "cyan", sub: "one row per PIPE-ID" }) + "<div style='height:16px'></div>";
    },
    bindDetail: (d, ctx) => ctx.on("click", async e => {
      const rm = e.target.closest("[data-rmbatch]"); if (!rm) return;
      e.stopPropagation();
      if (!(await DX.confirm({ title: `Remove ${rm.dataset.rmbatch}?`, sub: "Deletes every excavation, rock, soil, CC and accessory row of this PIPE-ID from the draft card.", ok: "Remove", tone: "danger" }))) return;
      try { await DX.call(MA + "delete_laying_batch", { pour_card: d.name, pipe_id: rm.dataset.rmbatch }); DX.toast(`Removed · <span class="dx-mono">${esc(rm.dataset.rmbatch)}</span>`); DX.invalidate(card); ctx.rerender(); } catch (err) { V.showProblems(err, "Couldn’t remove"); }
    }),
    api: {
      ttl: 30000,
      load: async () => (await DX.call(MA + "list_cards", { limit: 500 }, { get: true })).map(fromSummary),
      get: async name => fromCard(await DX.call(MA + "get_card", { name })),
      save: async d => {
        const payload = { townproject: d.townproject, zone_name: isDist(d.component) ? d.zone_name || null : null, village_name: null, component: d.component || null, select_contractor: d.select_contractor, from_junction: (d.from_junction || "").trim(), to_junction: (d.to_junction || "").trim(), custom_chainage_from: d.custom_chainage_from || "", custom_chainage_to: d.custom_chainage_to || "", company: d.company || null, attachment: d.attachment || null };
        if (d.name) payload.name = d.name;
        const r = await DX.call(MA + "save_card", { payload: DX.json(payload) });
        if (r.locked) throw new DX.ApiError(`${r.name} is locked and can’t be edited.`);
        if (r.deduped) DX.toast(`That card already exists — opened <span class="dx-mono">${esc(r.name)}</span>`);
        return { name: r.name, docstatus: r.docstatus };
      },
      submit: async name => DX.call(MA + "submit_card", { name })
    }
  };

  // "Pour Card Details" popup — one PIPE-ID across every table (server: add_laying_batch)
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
        { f: "pipe", label: "Pipe details", type: "link", req: true, span: 2, options: () => B.pipe_items.map(i => ({ value: i.name, label: i.item_name || i.name, sub: i.item_group })) },
        { f: "q_pv", label: "Pipe volume", type: "computed", unit: "m³", d: 4, calc: b => Q(b).pv, formula: "3.14 × (d/1000)² / 4 × L" },
        { f: "bedding", label: "Bedding depth (m)", type: "float", step: 0.001 },
        { f: "inc_murum", label: "Include murum", type: "check", on: "Murum bedding" },
        { f: "mu_l", label: "Murum · L", type: "float", step: 0.001, showIf: b => +b.inc_murum }, { f: "mu_w", label: "Murum · W", type: "float", step: 0.001, showIf: b => +b.inc_murum }, { f: "mu_d", label: "Murum · D", type: "float", step: 0.001, showIf: b => +b.inc_murum },
        { f: "q_back", label: "Backfilling", type: "computed", unit: "m³", d: 3, calc: b => Q(b).back, formula: "Total − Murum − Pipe volume" }
      ] },
      { id: "acc", title: "Accessory", short: "Accessory", icon: "box", cols: 3, fields: [
        { f: "accessory", label: "Accessory used", type: "link", span: 2, options: () => B.acc_items.map(i => ({ value: i.name, label: i.item_name || i.name, sub: i.item_group })) },
        { f: "accessory_qty", label: "Quantity", type: "int" },
        { f: "remark", label: "Remark", type: "text", span: 3 }
      ] }
    ],
    validate: b => {
      const e = {};
      [["cc_l", "CC road"], ["sr_l", "Soft rock"], ["hr_l", "Hard rock"], ["mu_l", "Murum"]].forEach(([f, l]) => { if (+b[f] > +b.l && +b.l) e[f] = `${l} length can’t be greater than the total pipe length.`; });
      if (+b.inc_murum && !(+b.mu_l && +b.mu_w && +b.mu_d)) e.mu_l = "Fill Murum length, width and depth.";
      if (b.accessory && !(+b.accessory_qty > 0)) e.accessory_qty = "Enter the accessory quantity.";
      if (Q(b).soil < 0) e.q_soil = "Soil excavation is negative — check CC / rock quantities.";
      return e;
    }
  };
  function layingModal(c) {
    return new Promise(resolve => {
      const b = DX.blank(LAY); Object.assign(b, { date: DX.TODAY, w: 0.65, cc_w: 0.65, sr_w: 0.65, hr_w: 0.65, mu_w: 0.65, accessory_qty: 0 });
      const uid = "batch-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 14);
      const m = DX.openModal({ title: "Pour card details", sub: `Adds a new PIPE-ID to ${esc(c.name)} — shared across excavation, rock, soil, CC and accessories.`, wide: true, body: DX.formHTML(LAY, b, "new"), foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Cancel</button><button class="dx-btn dx-btn-primary" data-lsave>${ic("plus", 15)}Add</button>`, onClose: () => resolve(false) });
      const steps = m.querySelector(".dx-steps"); if (steps) steps.remove();
      const F = DX.formCtl(LAY, b, "new", m);
      m.querySelector("[data-lsave]").addEventListener("click", async ev => {
        const errs = DX.validate(LAY, b); if (Object.keys(errs).length) return F.showErrors(errs);
        const done = DX.spin(ev.currentTarget, "Adding…");
        const values = { date: b.date, select_contractor: c.select_contractor, pipe_length: +b.l || 0, pipe_width: +b.w || 0, pipe_depth: +b.d || 0, cc_length: +b.cc_l || 0, cc_width: +b.cc_w || 0, cc_depth: +b.cc_d || 0, soft_length: +b.sr_l || 0, soft_width: +b.sr_w || 0, soft_depth: +b.sr_d || 0, hard_length: +b.hr_l || 0, hard_width: +b.hr_w || 0, hard_depth: +b.hr_d || 0, pipe_details: b.pipe, bedding_depth: +b.bedding || 0, strata_name: null, include_murum: +b.inc_murum ? 1 : 0, murum_length: +b.mu_l || 0, murum_width: +b.mu_w || 0, murum_depth: +b.mu_d || 0, accessories: b.accessory || "", accessories_qty: +b.accessory_qty || 0, remark: b.remark || "" };
        try {
          const r = await DX.call(MA + "add_laying_batch", { pour_card: c.name, values: DX.json(values), batch_uid: uid });
          // resolve before closing — closeModal fires onClose → resolve(false), which would skip the detail refresh
          resolve(true); DX.closeModal(); DX.toast(r.skipped ? "Already added." : `Laying details added · <span class="dx-mono">${esc(r.pipe_id)}</span>`);
        } catch (err) { done(); V.showProblems(err, "Couldn’t add laying details"); }
      });
    });
  }
  async function backfillModal(c) {
    let r;
    try { r = await DX.call(MA + "calc_backfilling", { pour_card: c.name, save: 0 }); } catch (err) { V.showProblems(err, "Couldn’t calculate backfilling"); return false; }
    const rows = (r.rows || []).map(x => ({ id: x.pipe_id, pipe: x.pipe_details, dia: x.diameter_mm, t: x.total_excavation, m: x.murum_qty, p: x.pipe_volume, k: x.backfilling_qty }));
    const m = DX.openModal({ title: "Backfilling", sub: "Backfilling = Total excavation − Murum − Pipe volume", wide: true, body: DX.table([{ f: "id", label: "Pipe ID", type: "mono" }, { f: "pipe", label: "Pipe" }, { f: "dia", label: "Dia (mm)", type: "num" }, { label: "Total exc.", type: "num", d: 3, f: "t", total: true }, { label: "Murum", type: "num", d: 3, f: "m", total: true }, { label: "Pipe vol.", type: "num", d: 4, f: "p", total: true }, { label: "Backfilling", type: "num", d: 3, f: "k", total: true }], rows, { foot: true }), foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Close</button><button class="dx-btn dx-btn-primary" data-bsave>${ic("check", 15)}Save to pour card</button>` });
    m.querySelector("[data-bsave]").addEventListener("click", async ev => {
      const done = DX.spin(ev.currentTarget, "Saving…");
      try { await DX.call(MA + "calc_backfilling", { pour_card: c.name, rows: DX.json(rows.map(x => x.id)), date: DX.TODAY, save: 1 }); DX.closeModal(); DX.toast("Backfilling saved to the pour card."); } catch (err) { done(); V.showProblems(err, "Couldn’t save backfilling"); }
    });
    return false;
  }

  const mt = {
    key: "mt", doctype: "Stock Entry · Material Transfer", lazy: true,
    entity: { singular: "Material transfer", plural: "Material transfers", title: r => `${DX.whLabel(r.from_wh) || "—"} → ${DX.whLabel(r.to_wh) || "—"}`, sub: r => `${r.nitems != null ? r.nitems : (r.items || []).length} items · ${r.name}`, date: "posting_date" },
    newLabel: "New transfer", submitLabel: "Save & submit", submitTitle: "Submit this transfer?", submitSub: "ERPNext stock rules run on submit — real stock moves between the warehouses.",
    get canCreate() { return !!B.mt.can_create; },
    get submittable() { return !!B.mt.can_submit; },
    defaults: () => ({ posting_date: DX.TODAY, company: B.mt.default_company || DX.M.defaultCompany, items: [{ item: "", qty: 1, uom: "", rate: 0 }] }),
    form: [{ id: "tr", title: "Transfer details", short: "Details", icon: "swap", fields: [
      { f: "company", label: "Company", type: "link", req: true, options: () => (B.mt.companies || B.companies).map(c => ({ value: c.name, label: c.name, sub: c.abbr })) }, { f: "posting_date", label: "Posting date", type: "date", req: true },
      { f: "from_wh", label: "Default source warehouse", type: "link", req: true, parent: ["company"], options: d => B.mt.warehouses.filter(w => !d.company || w.company === d.company).map(w => ({ value: w.name, label: DX.whLabel(w.name) })) }, { f: "to_wh", label: "Default target warehouse", type: "link", req: true, parent: ["company"], options: d => B.mt.warehouses.filter(w => !d.company || w.company === d.company).map(w => ({ value: w.name, label: DX.whLabel(w.name) })) },
      { f: "items", label: "Items", type: "table", span: "all", minRows: 1, rowLabel: "item", newRow: () => ({ item: "", qty: 1, uom: "", rate: 0 }), columns: [{ f: "item", label: "Item code", type: "select", options: () => B.pipe_items.concat(B.acc_items).map(i => ({ value: i.name, label: i.item_name || i.name })), onSet: r => { r.uom = (B.pipe_items.concat(B.acc_items).find(i => i.name === r.item) || {}).stock_uom || r.uom; } }, { f: "qty", label: "Qty", type: "float", total: true }, { f: "uom", label: "UOM", type: "select", options: () => [...new Set(B.pipe_items.concat(B.acc_items).map(i => i.stock_uom).filter(Boolean))] }, { f: "rate", label: "Basic rate", type: "float" }] }
    ] }],
    validate: d => (d.from_wh && d.from_wh === d.to_wh ? { to_wh: "Source and target warehouse must differ." } : (d.items || []).every(r => !(+r.qty > 0) || !r.item) ? { items: "At least one item needs a quantity above 0." } : {}),
    onSubmit: () => {},
    api: {
      load: async () => ((await DX.call(PA + "list_material_transfers", { limit: 200 })).rows || []).map(r => ({ name: r.name, docstatus: r.docstatus, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse, to_wh: r.to_warehouse, nitems: r.item_count, modified: r.modified })),
      get: async name => { const r = await DX.call(PA + "get_material_transfer", { name }); return { name: r.name, docstatus: r.docstatus, company: r.company, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse, to_wh: r.to_warehouse, items: (r.items || []).map(i => ({ item: i.item_code, qty: i.qty, uom: i.uom, rate: i.basic_rate || 0 })) }; },
      save: async d => {
        const uomOf = code => (B.pipe_items.concat(B.acc_items).find(i => i.name === code) || {}).stock_uom;
        const items = (d.items || []).filter(r => r.item && +r.qty > 0).map(r => ({ item_code: r.item, qty: +r.qty, uom: r.uom || uomOf(r.item) || null, basic_rate: +r.rate || null, s_warehouse: null, t_warehouse: null }));
        const r = await DX.call(PA + "save_material_transfer", { company: d.company, items: DX.json(items), posting_date: d.posting_date, from_warehouse: d.from_wh, to_warehouse: d.to_wh, name: d.name || undefined });
        return { name: r.name, docstatus: r.docstatus };
      },
      submit: async name => DX.call(PA + "submit_material_transfer", { name })
    }
  };

  // Pour Card Report — server-side (get_page_data), refetched when the dates change
  const REP = { key: "", rows: [], summary: null };
  const fetchReport = async (from, to) => {
    const key = from + "|" + to; if (REP.key === key) return;
    const all = []; let page = 1, res;
    do { res = await DX.call(RP + "get_page_data", { filters: DX.json({ from_date: from, to_date: to }), page, page_length: 100 }); all.push(...(res.rows || [])); page++; } while ((res.rows || []).length === 100 && all.length < 3000);
    REP.key = key; REP.summary = res.summary; REP.chart = res.chart || [];
    REP.rows = all.map(r => ({ name: r.pour_card, date: DX.day(r.entry_date), pipe_id: r.pipe_id, townproject: r.project, component: r.component, contractor: contractorName(r.contractor), junction: `${r.from_junction || ""} → ${r.to_junction || ""}`, pipe: r.pipe_details, len: +r.pipe_length || 0, exc: +r.total_excavation || 0, hard: +r.hard_rock_qty || 0, soft: +r.soft_rock_qty || 0, soil: +r.soil_qty || 0, murum: +r.murum_qty || 0, cc: +r.cc_breaking_qty || 0, acc: +r.accessory_qty || 0, st: r.entry_status }));
  };
  let DASH = null;

  const app = DX.register({
    key: "pour", title: "Pour Card", short: "Pour Card", icon: "card", hue: "blue", route: "/desk/pour-card-report",
    desc: "Pipe laying · excavation & backfilling", eyebrow: "Pipe laying · Pour cards",
    headline: `Every metre of pipe, on a <span class="dx-grad">pour card</span>`,
    intro: "Create the card, add laying details per PIPE-ID (excavation, rock, soil, CC road, accessory), then Lock Entry. Quantities are calculated live with the same formulas as the server.",
    docs: [card, mt],
    boot: async () => {
      const [m, caps, mtm] = await Promise.all([DX.call(MA + "get_masters", {}, { get: true }), DX.call(MA + "capabilities", {}, { get: true }), DX.call(MA + "mt_masters", {}, { get: true }).catch(() => null)]);
      Object.assign(B, m, { caps });
      if (mtm) B.mt = mtm;
    },
    kpis: () => { const cs = DX.rows(card), s = (DASH && DASH.summary) || {}; return [
      { label: "Pour cards", value: nf(cs.length), sub: `<span class="dx-num">${cs.filter(c => c.docstatus === 0).length}</span> saved, not locked`, icon: "card" },
      { label: "Pipe entries", value: nf(s.pipe_entries || 0), sub: "PIPE-IDs in the last 30 days", icon: "pipe", tone: "cyan" },
      { label: "Total pipe length", value: nf(s.total_pipe_length || 0, 1), unit: "m", sub: `Excavation <span class="dx-num">${nf(s.total_excavation || 0, 1)}</span> m³`, icon: "layers" },
      { label: "Locked entries", value: nf(cs.filter(c => c.docstatus === 1).length), sub: `<span class="dx-num">${cs.length ? Math.round(cs.filter(c => c.docstatus === 1).length / cs.length * 100) : 0}%</span> of cards`, icon: "lock", tone: "ok" }
    ]; },
    panels: () => { const bars = ((DASH && DASH.chart) || []).slice().sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date))).slice(0, 8).map(x => ({ label: DX.fmtDate(x.entry_date), value: +x.value || 0 })); return [DX.card("Pipe entries by date", DX.bars(bars), { icon: "chart", tone: "cyan", sub: "last 30 days" })]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", docs: ["card"], load: async () => { try { DASH = await DX.call(RP + "get_page_data", { filters: DX.json({ from_date: DX.addDays(DX.TODAY, -29), to_date: DX.TODAY }), page: 1, page_length: 10 }); } catch (_) { DASH = null; } } },
      { id: "cards", label: "Pour cards", icon: "list", type: "list", count: () => DX.rows(card).length, searchPh: "Search card, component, contractor, junction…",
        search: [r => r.name, r => r.component, r => r.townproject, r => contractorName(r.select_contractor), r => r.from_junction, r => r.to_junction],
        filters: [{ f: "townproject", label: "Project", options: () => B.projects.map(p => p.name), clears: ["component"] }, { f: "component", label: "Component", options: f => byProject(B.components, f.townproject).map(c => c.name) }],
        columns: [{ f: "name", label: "Pour card", type: "mono", strong: true }, { f: "townproject", label: "Project" }, { f: "component", label: "Component" }, { label: "Contractor", get: r => contractorName(r.select_contractor), trunc: true }, { label: "Junction", type: "mono", get: r => `${r.from_junction || ""} → ${r.to_junction || ""}` }, { f: "total_quantity", label: "Acc. qty", type: "num" }, { f: "date", label: "Updated", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(card, r) }],
        cardFoot: r => [`<span class="dx-mono">${esc(r.from_junction || "")} → ${esc(r.to_junction || "")}</span>`, `<span>${esc(r.component || r.townproject || "")}</span>`, `<span class="dx-mono">${DX.fmtDate(r.date)}</span>`] },
      { id: "new", label: "New pour card", icon: "plus", type: "form", doc: "card" },
      { id: "report", label: "Pour card report", icon: "chart", type: "report", group: "Insights", title: "Pour Card Report", noLink: true, remote: true, days: 29, date: "date",
        load: async () => { const f = V.reportFilters(app, app.screens.find(s => s.id === "report")); if (f.to > DX.TODAY) f.to = DX.TODAY; await fetchReport(f.from, f.to); },
        rows: () => REP.rows,
        filters: [{ f: "townproject", label: "Project", options: () => B.projects.map(p => p.name) }, { f: "st", label: "Entry status", options: ["Saved", "Lock Entry", "Cancelled"] }],
        kpis: rows => [{ label: "Pour cards", value: nf(new Set(rows.map(r => r.name)).size), icon: "card" }, { label: "Pipe entries", value: nf(rows.length), icon: "pipe", tone: "cyan" }, { label: "Total pipe length", value: nf(DX.sum(rows, "len"), 1), unit: "m", icon: "layers" }, { label: "Total excavation", value: nf(DX.sum(rows, "exc"), 2), unit: "m³", icon: "box", tone: "ok" }],
        columns: [{ f: "name", label: "Pour card", type: "mono", strong: true }, { f: "date", label: "Entry date", type: "date" }, { f: "pipe_id", label: "Pipe ID", type: "mono" }, { f: "component", label: "Component" }, { f: "contractor", label: "Contractor", trunc: true }, { f: "junction", label: "Junction", type: "mono" }, { f: "pipe", label: "Pipe" }, { f: "len", label: "Length (m)", type: "num", d: 2, total: true }, { f: "exc", label: "Excavation (m³)", type: "num", d: 3, total: true }, { f: "hard", label: "Hard rock", type: "num", d: 3, total: true, hideSm: true }, { f: "soft", label: "Soft rock", type: "num", d: 3, total: true, hideSm: true }, { f: "soil", label: "Soil", type: "num", d: 3, total: true }, { f: "cc", label: "CC breaking", type: "num", d: 3, total: true, hideSm: true }, { f: "acc", label: "Acc. qty", type: "num", total: true }, { f: "st", label: "Status" }] },
      { id: "transfers", label: "Material transfer", icon: "swap", type: "list", doc: "mt", group: "Stock", searchPh: "Search entry or warehouse…", columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { label: "From warehouse", trunc: true, get: r => DX.whLabel(r.from_wh) }, { label: "To warehouse", trunc: true, get: r => DX.whLabel(r.to_wh) }, { f: "posting_date", label: "Posting date", type: "date" }, { f: "nitems", label: "Items", type: "num" }, { label: "Status", type: "status", get: r => DX.statusOf(mt, r) }],
        banner: () => B.mt.can_create ? "" : `<div class="dx-note dx-note-warn">${ic("lock", 16)}<div>Your role can view transfers but can’t create Stock Entries — ask for the Stock User role.</div></div>` },
      { id: "masters", label: "Masters", icon: "database", type: "masters", group: "Stock", tabs: [
        { label: "Components at site", doctype: "Component at Site", rows: () => B.components, columns: [{ f: "name", label: "Component", strong: true }, { f: "project", label: "Project" }] },
        { label: "Zones", doctype: "Zone Details", rows: () => B.zones, columns: [{ f: "name", label: "Zone", strong: true }, { f: "project", label: "Project" }] },
        { label: "Contractors", doctype: "Contractor at Site", rows: () => B.contractors, columns: [{ f: "contractor", label: "Contractor", strong: true }, { f: "project", label: "Project" }] },
        { label: "Pipe items", doctype: "Item · DI / HDPE / MDPE", rows: () => B.pipe_items.map(p => Object.assign({ d: dia(p.name) }, p)), columns: [{ f: "name", label: "Item", strong: true }, { f: "item_group", label: "Group" }, { f: "d", label: "Dia (mm)", type: "num" }, { f: "stock_uom", label: "UOM" }] },
        { label: "Accessories", doctype: "Item · accessory groups", rows: () => B.acc_items, columns: [{ f: "name", label: "Accessory", strong: true }, { f: "item_group", label: "Group" }, { f: "stock_uom", label: "UOM" }] }
      ] }
    ]
  });
})();
