/* Concrete Master — LIVE (concrete_master.concrete_master.api.*). Every endpoint answers {ok, data} / {ok:false, message}. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, M = DX.M, { nf, esc, ic } = DX;
  const API = "concrete_master.concrete_master.api.";
  const call = async (m, a) => DX.okData(await DX.call(API + m, a || {}));
  const B = { grades: ["M5", "M7.5", "M10", "M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50"], cc: [], subs: {} };
  const townOpts = () => M.townOpts();
  const townLabel = (id, r) => (r && r.projecttown_label) || M.townLabel(id);
  const contractorLabel = (id, r) => (r && r.contractor_label) || M.contractorName(id);
  const matRow = m => ({ material: m.material, label: m.material_label || m.material, rate: +m.concrete_rate || 0, uom: m.uom, stock: +m.stock_balance || 0, consumption: +m.consumption || 0, wh: m.source_warehouse || "" });
  const fromRow = r => Object.assign({}, r, { date: DX.day(r.date), quantity_of_concrete: +r.quantity_of_concrete || 0 });
  const DETAIL = {};
  const detail = async name => { const d = await call("get_concrete_entry_detail", { name }); const x = fromRow(d); x.materials = (d.material_consumption || []).map(matRow); x._wh = (x.materials.find(m => m.wh) || {}).wh || ""; DETAIL[name] = { at: d.modified, doc: x }; return x; };

  const gm = {
    key: "gm", doctype: "Concrete Grade Map", canCreate: false, lazy: true, hideFromHome: true, status: () => null,
    entity: { singular: "Grade map", plural: "Grade maps", title: r => `${r.concrete_grade} · ${townLabel(r.townproject, { projecttown_label: r.townproject_label })}`, sub: r => `${r.material_count || (r.details || []).length} materials · ${r.name}`, date: "modified" },
    detailExtra: d => DX.card("Material per m³", (d.details || []).length ? DX.table([{ f: "label", label: "Material", strong: true }, { f: "rate", label: "Rate (per m³)", type: "num", d: 3 }, { f: "uom", label: "UOM" }, { f: "stock", label: "Stock", type: "num" }], d.details) : DX.empty("No material rows", ""), { icon: "layers", tone: "cyan" }) + DX.handoff("Grade maps are created and edited in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"),
    api: {
      ttl: 120000,
      load: async () => (await call("list_grade_maps", { limit: 500 })).map(r => Object.assign({}, r, { modified: DX.day(r.modified) })),
      get: async name => { await DX.ensure(gm); const row = DX.find(gm, name) || {}; let details = []; try { const r = await call("get_grade_materials", { projecttown: row.townproject, concrete_grade: row.concrete_grade, quantity_of_concrete: 1 }); details = (r.materials || []).map(matRow); } catch (_) { /* map without rows */ } return Object.assign({}, row, { details }); }
    }
  };
  const cc = {
    key: "cc", doctype: "Civil Component Master", canCreate: false, lazy: true, hideFromHome: true, status: () => null,
    entity: { singular: "Civil component", plural: "Civil components", title: r => r.civil_component_label || r.name, sub: r => `${r.townproject_label || M.townLabel(r.townproject)} · ${r.sub_component_count != null ? r.sub_component_count : (r.subs || []).length} sub components`, date: "modified" },
    detailExtra: d => DX.card("Sub components", (d.subs || []).length ? DX.table([{ f: "label", label: "Sub component", strong: true }], d.subs) : DX.empty("None", ""), { icon: "building" }) + DX.handoff("Civil components are created in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"),
    api: {
      ttl: 120000,
      load: async () => { const rows = (await call("list_civil_components_master", { limit: 500 })).map(r => Object.assign({}, r, { modified: DX.day(r.modified) })); B.cc = rows; return rows; },
      get: async name => { await DX.ensure(cc); return Object.assign({}, DX.find(cc, name) || { name }, { subs: (await call("get_sub_components", { civil_component: name })).map(s => ({ label: s.label || s.name })) }); },
    }
  };
  const loadSubs = async d => { if (!d.civil_component || B.subs[d.civil_component]) return; B.subs[d.civil_component] = (await call("get_sub_components", { civil_component: d.civil_component, projecttown: d.projecttown })).map(s => s.value || s.name); };

  const ce = {
    key: "ce", doctype: "Concrete Entry",
    entity: { singular: "Concrete entry", plural: "Concrete entries", title: r => `${r.concrete_grade || ""} · ${nf(r.quantity_of_concrete, 2)} m³`, sub: r => `${townLabel(r.projecttown, r)} · ${contractorLabel(r.contractor, r)}`, date: "date" },
    newLabel: "New concrete entry", submitLabel: "Submit entry", submitTitle: "Submit this concrete entry?", submitOk: "Submit & issue stock", submitSub: "Submitting creates a Stock Entry (Material Issue) for every material with consumption above 0.", submitLinesTitle: "Material Issue lines",
    defaults: () => ({ date: DX.TODAY, materials: [] }),
    form: [
      { id: "d", title: "Details", short: "Details", icon: "mixer", fields: [
        { f: "date", label: "Date", type: "date", req: true }, { f: "projecttown", label: "Project / town", type: "link", req: true, options: townOpts, onSet: d => { d.materials = []; } },
        { f: "contractor", label: "Contractor", type: "link", req: true, parent: ["projecttown"], options: d => M.contractorOpts(d.projecttown), hint: "Shows the contractor name — saves the Contractor at Project mapping ID." },
        { f: "civil_component", label: "Civil component", type: "link", req: true, parent: ["projecttown"], options: d => B.cc.filter(c => c.townproject === d.projecttown).map(c => ({ value: c.name, label: c.civil_component_label || c.name, sub: (c.sub_component_count || 0) + " sub components" })), onSet: d => { d.materials = []; } },
        { f: "sub_component", label: "Sub component", type: "link", req: true, parent: ["civil_component"], load: loadSubs, options: d => B.subs[d.civil_component] || [] },
        { f: "concrete_grade", label: "Concrete grade", type: "link", req: true, options: () => B.grades, onSet: d => { d.materials = []; } },
        { f: "quantity_of_concrete", label: "Quantity of concrete", type: "float", unit: "m³", req: true, step: 0.001 }
      ] },
      { id: "m", title: "Material consumption", short: "Materials", sub: "calculated vs stock vs actual", icon: "box", tone: "cyan", fields: [
        { f: "materials", label: "Materials", type: "table", span: "all", noAdd: true, reqMsg: "Click “Add consumption” to load materials from the grade map.", req: true,
          fill: { label: "Add consumption", icon: "refresh", run: async d => {
            if (!d.projecttown || !d.contractor || !d.concrete_grade || !(+d.quantity_of_concrete > 0)) throw new Error("Pick project/town, contractor, grade and quantity first.");
            const r = await call("get_grade_materials", { projecttown: d.projecttown, concrete_grade: d.concrete_grade, quantity_of_concrete: d.quantity_of_concrete, contractor: d.contractor });
            d._wh = r.source_warehouse || "";
            const prev = Object.fromEntries((d.materials || []).map(m => [m.material, m.consumption]));
            return (r.materials || []).map(m => Object.assign(matRow(m), { consumption: prev[m.material] || 0 }));
          }, done: d => `Loaded ${d.materials.length} materials from the grade map${d._wh ? " · stock from " + esc(DX.whLabel(d._wh)) : ""}.` },
          columns: [{ f: "label", label: "Material", type: "text", ro: true }, { f: "rate", label: "Rate", type: "float", ro: true, d: 3 }, { f: "calc", label: "Calculated qty", calc: (r, d) => (+d.quantity_of_concrete || 0) * (+r.rate || 0), d: 3, total: true }, { f: "uom", label: "UOM", type: "text", ro: true }, { f: "stock", label: "Stock", type: "float", ro: true, d: 2 }, { f: "consumption", label: "Consumption", type: "float", total: true }] }
      ] }
    ],
    validate: (d, sub) => (sub && !(d.materials || []).some(r => +r.consumption > 0) ? { materials: "No consumption value entered!" } : (d.materials || []).some(r => +r.consumption < 0) ? { materials: "Consumption cannot be negative." } : (d.materials || []).some(r => +r.consumption > (+r.stock || 0)) ? { materials: "Consumption is more than the stock available in the contractor’s warehouse." } : {}),
    onSubmit: () => {},
    submitLines: d => (d.materials || []).filter(r => +r.consumption > 0).map(r => [`${r.label} (${r.uom})`, nf(r.consumption, 3)]),
    submitNote: d => (d._wh ? `Source warehouse: <b class="dx-mono">${esc(DX.whLabel(d._wh))}</b>` : ""),
    submitToast: d => d.material_issue ? `Submitted · Material Issue <span class="dx-mono">${esc(d.material_issue)}</span> created` : `Submitted · <span class="dx-mono">${esc(d.name)}</span>`,
    lockBanner: d => `<b>Submitted</b> — ${d.material_issue ? `Material Issue <span class="dx-link">${esc(d.material_issue)}</span>. ` : ""}Cancelling this entry cancels the Material Issue too.`,
    api: {
      ttl: 30000,
      load: async () => (await call("list_concrete_entries", { limit: 500 })).map(fromRow),
      get: detail,
      save: async d => {
        const q = +d.quantity_of_concrete || 0;
        const data = { name: d.name || null, date: d.date, projecttown: d.projecttown, contractor: d.contractor, civil_component: d.civil_component, sub_component: d.sub_component, concrete_grade: d.concrete_grade, quantity_of_concrete: q, material_consumption: (d.materials || []).map(m => ({ material: m.material, concrete_rate: +m.rate || 0, calculated_quantity: q * (+m.rate || 0), uom: m.uom, stock_balance: +m.stock || 0, consumption: +m.consumption || 0 })) };
        const r = await call("save_concrete_entry", { data: DX.json(data) });
        return { name: r.name, docstatus: r.docstatus, material_issue: r.material_issue };
      },
      submit: async name => call("submit_concrete_entry", { name })
    }
  };
  const qty = rows => DX.sum(rows, "quantity_of_concrete");
  const topBy = (rows, key, lbl) => { const m = {}; rows.forEach(r => (m[r[key]] = (m[r[key]] || 0) + (+r.quantity_of_concrete || 0))); return Object.entries(m).map(([k, v]) => ({ label: lbl(k, rows.find(r => r[key] === k)), value: v })).sort((a, b) => b.value - a.value).slice(0, 6); };
  // consumption report needs each entry's material rows — fetched on demand (cached by modified time)
  const loadDetails = async rows => {
    const need = rows.filter(r => !DETAIL[r.name] || DETAIL[r.name].at !== r.modified).slice(0, 120);
    for (let i = 0; i < need.length; i += 6) await Promise.all(need.slice(i, i + 6).map(r => detail(r.name).catch(() => null)));
  };
  const mats = r => (DETAIL[r.name] && DETAIL[r.name].doc.materials) || [];

  const app = DX.register({
    key: "concrete", title: "Concrete Master", short: "Concrete", icon: "mixer", hue: "slate", route: "/desk/concrete-master",
    desc: "Concrete entry · grade maps · material issue", eyebrow: "Concrete master · site operations",
    headline: `Pour concrete, issue <span class="dx-grad">materials</span>`,
    intro: "Record each pour by project, component and grade. “Add consumption” pulls the grade map (material per m³), shows calculated qty against live stock, and submitting posts the Material Issue.",
    docs: [ce, gm, cc],
    boot: async () => { const [o] = await Promise.all([call("get_master_options").catch(() => null), DX.ensure(cc)]); if (o && o.grades && o.grades.length) B.grades = o.grades; },
    kpis: () => { const rows = DX.rows(ce), sub = rows.filter(r => r.docstatus === 1); return [
      { label: "Entries", value: nf(rows.length), sub: "Loaded from recent records", icon: "list" },
      { label: "Draft", value: nf(rows.filter(r => r.docstatus === 0).length), sub: "Ready to review", icon: "edit", tone: "pending" },
      { label: "Submitted", value: nf(sub.length), sub: "Material Issue posted", icon: "check", tone: "ok" },
      { label: "Concrete poured", value: nf(qty(sub), 1), unit: "m³", sub: `<span class="dx-num">${nf(qty(rows), 1)}</span> m³ incl. drafts`, icon: "mixer", tone: "cyan" }
    ]; },
    panels: () => { const rows = DX.rows(ce); const byGrade = {}; rows.forEach(r => (byGrade[r.concrete_grade] = (byGrade[r.concrete_grade] || 0) + (+r.quantity_of_concrete || 0))); return [
      DX.card("Grade-wise summary", DX.bars(Object.entries(byGrade).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), { unit: "m³", fmt: v => nf(v, 2) }), { icon: "layers", tone: "cyan" }),
      `<section class="dx-cols">${DX.card("Top projects by quantity", DX.bars(topBy(rows, "projecttown", townLabel), { unit: "m³", fmt: v => nf(v, 1) }), { icon: "building" })}${DX.card("Top contractors by quantity", DX.bars(topBy(rows, "contractor", contractorLabel), { unit: "m³", fmt: v => nf(v, 1) }), { icon: "user" })}</section>`
    ]; },
    screens: [
      { id: "overview", label: "Overview", icon: "grid", type: "dashboard", doc: "ce", docs: ["ce"] },
      { id: "entries", label: "Concrete entry", icon: "list", type: "list", doc: "ce", group: "Concrete", count: () => DX.rows(ce).length, searchPh: "Search entry, project, contractor, grade…",
        search: [r => r.name, r => townLabel(r.projecttown, r), r => contractorLabel(r.contractor, r), r => r.concrete_grade, r => r.civil_component],
        filters: [{ f: "projecttown", label: "Project / town", options: townOpts, display: M.townLabel }, { f: "concrete_grade", label: "Grade", options: () => B.grades }],
        sum: rows => `<span class="dx-num">${nf(qty(rows), 2)}</span> m³`,
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Project", get: r => townLabel(r.projecttown, r), trunc: true }, { label: "Contractor", get: r => contractorLabel(r.contractor, r), trunc: true }, { label: "Component", get: r => `${r.civil_component || ""} · ${r.sub_component || ""}`, hideSm: true }, { f: "concrete_grade", label: "Grade" }, { f: "quantity_of_concrete", label: "Qty (m³)", type: "num", d: 2 }, { f: "material_issue", label: "Material Issue", type: "mono" }, { label: "Status", type: "status", get: r => DX.statusOf(ce, r) }] },
      { id: "new", label: "New concrete entry", icon: "plus", type: "form", doc: "ce", group: "Concrete" },
      { id: "grademap", label: "Grade map", icon: "layers", type: "list", doc: "gm", group: "Masters", dateFilter: false, statuses: [], banner: () => DX.handoff("New grade maps are added in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"), columns: [{ f: "name", label: "Name", type: "mono", strong: true }, { label: "Project / town", get: r => r.townproject_label || M.townLabel(r.townproject) }, { f: "concrete_grade", label: "Grade" }, { f: "material_count", label: "Materials", type: "num" }] },
      { id: "components", label: "Civil component", icon: "building", type: "list", doc: "cc", group: "Masters", dateFilter: false, statuses: [], banner: () => DX.handoff("New civil components are added in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"), columns: [{ label: "Component", strong: true, get: r => r.civil_component_label || r.name }, { label: "Project / town", get: r => r.townproject_label || M.townLabel(r.townproject) }, { f: "sub_component_count", label: "Sub components", type: "num" }] },
      { id: "report", label: "Consumption report", icon: "chart", type: "report", doc: "ce", group: "Masters", days: 45, remote: true,
        load: async () => { await DX.ensure(ce); const f = V.reportFilters(app, app.screens.find(s => s.id === "report")); await loadDetails(DX.rows(ce).filter(r => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to))); },
        filters: [{ f: "projecttown", label: "Project / town", options: townOpts, display: M.townLabel }, { f: "concrete_grade", label: "Grade", options: () => B.grades }],
        kpis: rows => [{ label: "Concrete", value: nf(qty(rows), 2), unit: "m³", icon: "mixer", tone: "cyan" }, { label: "Entries", value: nf(rows.length), icon: "list" }, { label: "Cement issued", value: nf(rows.filter(r => r.docstatus === 1).reduce((s, r) => s + mats(r).filter(m => /cement/i.test(m.material + " " + m.label)).reduce((a, m) => a + (+m.consumption || 0), 0), 0), 1), unit: "Bag", icon: "box", tone: "ok" }],
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Project", get: r => townLabel(r.projecttown, r), trunc: true }, { label: "Contractor", get: r => contractorLabel(r.contractor, r), trunc: true }, { f: "concrete_grade", label: "Grade" }, { f: "quantity_of_concrete", label: "Qty (m³)", type: "num", d: 2, total: true }, { label: "Status", get: r => (r.docstatus === 1 ? "Submitted" : r.docstatus === 2 ? "Cancelled" : "Draft") }],
        after: rows => { const agg = {}; rows.forEach(r => mats(r).forEach(m => { const a = (agg[m.material] = agg[m.material] || { material: m.label, uom: m.uom, calc: 0, cons: 0, stock: m.stock }); a.calc += (+r.quantity_of_concrete || 0) * (+m.rate || 0); a.cons += +m.consumption || 0; })); const list = Object.values(agg); return "<div style='height:16px'></div>" + DX.card("Material-wise totals", list.length ? DX.table([{ f: "material", label: "Material", strong: true }, { f: "uom", label: "UOM" }, { f: "calc", label: "Calculated", type: "num", d: 2 }, { f: "cons", label: "Consumed", type: "num", d: 2 }, { f: "stock", label: "Stock (contractor store)", type: "num", d: 2 }], list) : DX.empty("No material rows in this range", ""), { icon: "box", tone: "cyan", sub: "calculated vs consumed vs stock" }); } }
    ]
  });
  void ic;
})();
