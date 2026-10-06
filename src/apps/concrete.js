/* Concrete Master (concrete_master · page concrete-master). */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc } = DX;
  const GRADES = ["M5", "M7.5", "M10", "M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50"];
  const ITEMS = [["CVG-CEMENT-OPC", "Cement (OPC)", "Bag"], ["CVG-CEMENT-PPC", "Cement (PPC)", "Bag"], ["AGS-SAND", "Sand", "CFT"], ["AGS-GITTI-20MM", "Gitti 20 MM", "CFT"], ["AGS-GITTI-10MM", "Gitti 10mm", "CFT"], ["AGS-GITTI-DUST", "Gitti Dust", "CFT"]];
  const itemLabel = c => (ITEMS.find(i => i[0] === c) || [c, c])[1];
  const uomOf = c => (ITEMS.find(i => i[0] === c) || [0, 0, "Nos"])[2];
  const CE_TOWNS = ["TN-35872", "TN-145", "TN-146", "TN-8286", "TN-161", "TN-17"];
  const stock = {}; ITEMS.forEach(([c], i) => (stock[c] = [640, 420, 2600, 3100, 1800, 900][i]));
  const townOpts = () => M.townOpts(t => CE_TOWNS.includes(t.id));

  const gm = {
    key: "gm", doctype: "Concrete Grade Map", naming: (d, n) => "CGM" + String(n).padStart(5, "0"), seqStart: 4,
    entity: { singular: "Grade map", plural: "Grade maps", title: r => `${r.concrete_grade} · ${M.townLabel(r.townproject)}`, sub: r => `${(r.details || []).length} materials · ${r.name}`, date: "modified" },
    newLabel: "New grade map",
    form: [{ id: "g", title: "Concrete grade map", short: "Grade", icon: "layers", fields: [
      { f: "townproject", label: "Project / town", type: "link", req: true, options: townOpts },
      { f: "concrete_grade", label: "Concrete grade", type: "link", req: true, options: GRADES },
      { f: "details", label: "Material per m³", type: "table", span: "all", minRows: 1, rowLabel: "material", newRow: () => ({ material: "", rate: 0, uom: "" }), columns: [{ f: "material", label: "Material", type: "select", options: ITEMS.map(([c, l, u]) => ({ value: c, label: `${l} (${u})` })) }, { f: "rate", label: "Rate (per m³)", type: "float" }, { f: "uom", label: "UOM", type: "select", options: ["Bag", "CFT", "Kg", "Nos", "trolley"] }] }
    ] }],
    validate: d => (DX.rows(gm).some(g => g.name !== d.name && g.townproject === d.townproject && g.concrete_grade === d.concrete_grade) ? { concrete_grade: "A grade map for this town and grade already exists." } : {}),
    seed: () => { const mk = (n, t, g, rows) => ({ name: n, townproject: t, concrete_grade: g, modified: DX.addDays(DX.TODAY, -30), details: rows.map(([m, r]) => ({ material: m, rate: r, uom: uomOf(m) })) });
      return [mk("CGM00001", "TN-35872", "M5", [["AGS-SAND", 20]]), mk("CGM00002", "TN-35872", "M20", [["CVG-CEMENT-OPC", 8], ["AGS-SAND", 15], ["AGS-GITTI-20MM", 20], ["AGS-GITTI-10MM", 10]]), mk("CGM00003", "TN-145", "M25", [["CVG-CEMENT-OPC", 9.5], ["AGS-SAND", 14], ["AGS-GITTI-20MM", 21], ["AGS-GITTI-10MM", 10]]), mk("CGM00004", "TN-161", "M15", [["CVG-CEMENT-PPC", 6.5], ["AGS-SAND", 16], ["AGS-GITTI-20MM", 30]])]; }
  };
  const cc = {
    key: "cc", doctype: "Civil Component Master", naming: d => d.civil_component.trim(), dupField: "civil_component",
    entity: { singular: "Civil component", plural: "Civil components", title: r => r.name, sub: r => `${M.townLabel(r.townproject)} · ${(r.subs || []).length} sub components`, date: "modified" },
    newLabel: "New civil component",
    form: [{ id: "c", title: "Civil component", short: "Component", icon: "building", fields: [
      { f: "townproject", label: "Project / town", type: "link", req: true, options: townOpts }, { f: "civil_component", label: "Civil component", type: "text", req: true, lockOnEdit: true },
      { f: "subs", label: "Sub components", type: "table", span: "all", minRows: 1, rowLabel: "sub component", columns: [{ f: "sub_component_name", label: "Sub component name", type: "text" }] }
    ] }],
    seed: () => [["Construction", "TN-35872", ["Cement", "Pipe", "Rod"]], ["Intake Well", "TN-145", ["Footing", "Column", "Slab"]], ["WTP", "TN-146", ["PCC", "Footing", "Beam", "Slab"]], ["OHT / ESR", "TN-8286", ["Footing", "Column", "Beam", "Slab"]], ["Pump House", "TN-161", ["PCC", "Column", "Slab"]], ["Boundary Wall", "TN-17", ["Footing", "PCC"]]].map(([n, t, s]) => ({ name: n, civil_component: n, townproject: t, modified: DX.addDays(DX.TODAY, -40), subs: s.map(x => ({ sub_component_name: x })) }))
  };
  const ce = {
    key: "ce", doctype: "Concrete Entry", prefix: "CE", seqStart: 21, naming: (d, n) => "CE-" + String(n).padStart(4, "0"),
    entity: { singular: "Concrete entry", plural: "Concrete entries", title: r => `${r.concrete_grade} · ${nf(r.quantity_of_concrete, 2)} m³`, sub: r => `${M.townLabel(r.projecttown)} · ${M.contractorName(r.contractor)}`, date: "date" },
    newLabel: "New concrete entry", submitLabel: "Submit entry", submitTitle: "Submit this concrete entry?", submitOk: "Submit & issue stock", submitSub: "Submitting creates a Stock Entry (Material Issue) for every material with consumption above 0.", submitLinesTitle: "Material Issue lines",
    defaults: () => ({ date: DX.TODAY, materials: [] }),
    form: [
      { id: "d", title: "Details", short: "Details", icon: "mixer", fields: [
        { f: "date", label: "Date", type: "date", req: true }, { f: "projecttown", label: "Project / town", type: "link", req: true, options: townOpts, onSet: d => (d.materials = []) },
        { f: "contractor", label: "Contractor", type: "link", req: true, parent: ["projecttown"], options: d => M.contractorOpts(d.projecttown), hint: "Shows the contractor name — saves the Contractor at Project mapping ID." },
        { f: "civil_component", label: "Civil component", type: "link", req: true, parent: ["projecttown"], options: d => DX.rows(cc).filter(c => c.townproject === d.projecttown).map(c => c.name), onSet: d => (d.materials = []) },
        { f: "sub_component", label: "Sub component", type: "link", req: true, parent: ["civil_component"], options: d => ((DX.find(cc, d.civil_component) || {}).subs || []).map(s => s.sub_component_name) },
        { f: "concrete_grade", label: "Concrete grade", type: "link", req: true, options: GRADES, onSet: d => (d.materials = []) },
        { f: "quantity_of_concrete", label: "Quantity of concrete", type: "float", unit: "m³", req: true, step: 0.001 }
      ] },
      { id: "m", title: "Material consumption", short: "Materials", sub: "calculated vs stock vs actual", icon: "box", tone: "cyan", fields: [
        { f: "materials", label: "Materials", type: "table", span: "all", noAdd: true, reqMsg: "Click “Add consumption” to load materials from the grade map.", req: true,
          fill: { label: "Add consumption", icon: "refresh", run: d => {
            if (!d.projecttown || !d.contractor || !d.concrete_grade || !(+d.quantity_of_concrete > 0)) throw new Error("Pick project/town, contractor, grade and quantity first.");
            const map = DX.rows(gm).find(g => g.townproject === d.projecttown && g.concrete_grade === d.concrete_grade);
            if (!map) throw new Error("Concrete Grade Map not found for selected Project/Town and Grade.");
            return map.details.map(x => ({ material: x.material, rate: x.rate, uom: x.uom, stock: stock[x.material] || 0, consumption: 0 }));
          }, done: d => `Loaded ${d.materials.length} materials from the grade map.` },
          columns: [{ f: "material", label: "Material", type: "select", options: ITEMS.map(([c, l]) => ({ value: c, label: l })) }, { f: "rate", label: "Rate", type: "float", ro: true, d: 3 }, { f: "calc", label: "Calculated qty", calc: (r, d) => (+d.quantity_of_concrete || 0) * (+r.rate || 0), d: 3, total: true }, { f: "uom", label: "UOM", type: "text", ro: true }, { f: "stock", label: "Stock", type: "float", ro: true, d: 0 }, { f: "consumption", label: "Consumption", type: "float", total: true }] }
      ] }
    ],
    validate: (d, sub) => (sub && !(d.materials || []).some(r => +r.consumption > 0) ? { materials: "No consumption value entered!" } : (d.materials || []).some(r => +r.consumption > (+r.stock || 0)) ? { materials: "Consumption is more than the stock available in the contractor’s warehouse." } : {}),
    submitLines: d => (d.materials || []).filter(r => +r.consumption > 0).map(r => [`${itemLabel(r.material)} (${r.uom})`, nf(r.consumption, 3)]),
    submitNote: d => `Source warehouse: <b class="dx-mono">${esc(d.contractor || "")} - JEWPL</b>`,
    onSubmit: (d, st) => { d.material_issue = "MAT-STE-2026-00" + (700 + st.seq++); (d.materials || []).forEach(r => (stock[r.material] = Math.max(0, (stock[r.material] || 0) - (+r.consumption || 0)))); },
    submitToast: d => `Submitted · Material Issue <span class="dx-mono">${esc(d.material_issue)}</span> created`,
    lockBanner: d => `<b>Submitted</b> — Material Issue <span class="dx-link">${esc(d.material_issue)}</span>. Cancelling this entry cancels the Material Issue too.`,
    seed: () => { const g = DX.seeder(2525), out = []; const combos = [["TN-35872", "Construction", "Cement", "M5"], ["TN-35872", "Construction", "Rod", "M20"], ["TN-145", "Intake Well", "Footing", "M25"], ["TN-145", "Intake Well", "Slab", "M25"], ["TN-161", "Pump House", "Column", "M15"], ["TN-146", "WTP", "PCC", "M10"], ["TN-8286", "OHT / ESR", "Beam", "M25"]];
      for (let i = 0; i < 16; i++) { const [t, c, s, gr] = combos[i % combos.length], q = g.flt(4, 28, 3), map = { M5: [["AGS-SAND", 20]], M20: [["CVG-CEMENT-OPC", 8], ["AGS-SAND", 15], ["AGS-GITTI-20MM", 20]], M25: [["CVG-CEMENT-OPC", 9.5], ["AGS-SAND", 14], ["AGS-GITTI-20MM", 21]], M15: [["CVG-CEMENT-PPC", 6.5], ["AGS-SAND", 16]], M10: [["CVG-CEMENT-OPC", 5], ["AGS-SAND", 18]] }[gr];
        const sub = i < 6; out.push({ name: "CE-" + String(i + 5).padStart(4, "0"), docstatus: sub ? 1 : 0, date: DX.addDays(DX.TODAY, -g.int(0, 40)), projecttown: t, contractor: M.contractorOpts(t)[i % 2].value, civil_component: c, sub_component: s, concrete_grade: gr, quantity_of_concrete: q, material_issue: sub ? "MAT-STE-2026-00" + (680 + i) : "", materials: map.map(([m, r]) => ({ material: m, rate: r, uom: uomOf(m), stock: stock[m], consumption: sub ? +(q * r * g.flt(.95, 1.05)).toFixed(2) : 0 })) }); }
      return out; }
  };
  const qty = rows => DX.sum(rows, "quantity_of_concrete");
  const topBy = (rows, key, lbl) => { const m = {}; rows.forEach(r => (m[r[key]] = (m[r[key]] || 0) + (+r.quantity_of_concrete || 0))); return Object.entries(m).map(([k, v]) => ({ label: lbl(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 6); };

  DX.register({
    key: "concrete", title: "Concrete Master", short: "Concrete", icon: "mixer", hue: "slate", route: "/desk/concrete-master",
    desc: "Concrete entry · grade maps · material issue", eyebrow: "Concrete master · JEWPL operations",
    headline: `Pour concrete, issue <span class="dx-grad">materials</span>`,
    intro: "Record each pour by project, component and grade. “Add consumption” pulls the grade map (material per m³), shows calculated qty against live stock, and submitting posts the Material Issue.",
    docs: [ce, gm, cc],
    kpis: () => { const rows = DX.rows(ce), sub = rows.filter(r => r.docstatus === 1); return [
      { label: "Entries", value: nf(rows.length), sub: "Loaded from recent records", icon: "list" },
      { label: "Draft", value: nf(rows.length - sub.length), sub: "Ready to review", icon: "edit", tone: "pending" },
      { label: "Submitted", value: nf(sub.length), sub: "Material Issue posted", icon: "check", tone: "ok" },
      { label: "Concrete poured", value: nf(qty(sub), 1), unit: "m³", sub: `<span class="dx-num">${nf(qty(rows), 1)}</span> m³ incl. drafts`, icon: "mixer", tone: "cyan" }
    ]; },
    panels: () => { const rows = DX.rows(ce); const byGrade = {}; rows.forEach(r => (byGrade[r.concrete_grade] = (byGrade[r.concrete_grade] || 0) + (+r.quantity_of_concrete || 0))); return [
      DX.card("Grade-wise summary", DX.bars(Object.entries(byGrade).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), { unit: "m³", fmt: v => nf(v, 2) }), { icon: "layers", tone: "cyan" }),
      `<section class="dx-cols">${DX.card("Top projects by quantity", DX.bars(topBy(rows, "projecttown", M.townLabel), { unit: "m³", fmt: v => nf(v, 1) }), { icon: "building" })}${DX.card("Top contractors by quantity", DX.bars(topBy(rows, "contractor", M.contractorName), { unit: "m³", fmt: v => nf(v, 1) }), { icon: "user" })}</section>`
    ]; },
    homeStat: () => ({ value: nf(qty(DX.rows(ce).filter(r => r.docstatus === 1)), 1), label: "m³ poured" }),
    attention: () => DX.rows(ce).filter(r => r.docstatus === 0).slice(0, 3).map(r => ({ title: r.name, sub: `${r.concrete_grade} · ${nf(r.quantity_of_concrete, 2)} m³ · draft, stock not issued`, go: DX.entryRoute(ce, r), tag: "Submit pending" })),
    screens: [
      { id: "overview", label: "Overview", icon: "grid", type: "dashboard", doc: "ce" },
      { id: "entries", label: "Concrete entry", icon: "list", type: "list", doc: "ce", group: "Concrete", count: () => DX.rows(ce).length, searchPh: "Search entry, project, contractor, grade…",
        search: [r => r.name, r => M.townLabel(r.projecttown), r => M.contractorName(r.contractor), r => r.concrete_grade, r => r.civil_component],
        filters: [{ f: "projecttown", label: "Project / town", options: townOpts, display: M.townLabel }, { f: "concrete_grade", label: "Grade", options: GRADES }],
        sum: rows => `<span class="dx-num">${nf(qty(rows), 2)}</span> m³`,
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Project", get: r => M.townLabel(r.projecttown), trunc: true }, { label: "Contractor", get: r => M.contractorName(r.contractor), trunc: true }, { label: "Component", get: r => `${r.civil_component} · ${r.sub_component}`, hideSm: true }, { f: "concrete_grade", label: "Grade" }, { f: "quantity_of_concrete", label: "Qty (m³)", type: "num", d: 2 }, { f: "material_issue", label: "Material Issue", type: "mono" }, { label: "Status", type: "status", get: r => DX.statusOf(ce, r) }] },
      { id: "new", label: "New concrete entry", icon: "plus", type: "form", doc: "ce", group: "Concrete" },
      { id: "grademap", label: "Grade map", icon: "layers", type: "list", doc: "gm", group: "Masters", dateFilter: false, statuses: [], columns: [{ f: "name", label: "Name", type: "mono", strong: true }, { label: "Project / town", get: r => M.townLabel(r.townproject) }, { f: "concrete_grade", label: "Grade" }, { label: "Materials", type: "num", get: r => (r.details || []).length }] },
      { id: "components", label: "Civil component", icon: "building", type: "list", doc: "cc", group: "Masters", dateFilter: false, statuses: [], columns: [{ f: "name", label: "Component", strong: true }, { label: "Project / town", get: r => M.townLabel(r.townproject) }, { label: "Sub components", get: r => (r.subs || []).map(s => s.sub_component_name).join(", ") }] },
      { id: "report", label: "Consumption report", icon: "chart", type: "report", doc: "ce", group: "Masters", days: 45,
        filters: [{ f: "projecttown", label: "Project / town", options: townOpts, display: M.townLabel }, { f: "concrete_grade", label: "Grade", options: GRADES }],
        kpis: rows => [{ label: "Concrete", value: nf(qty(rows), 2), unit: "m³", icon: "mixer", tone: "cyan" }, { label: "Entries", value: nf(rows.length), icon: "list" }, { label: "Cement issued", value: nf(rows.reduce((s, r) => s + (r.materials || []).filter(m => /CEMENT/.test(m.material)).reduce((a, m) => a + (+m.consumption || 0), 0), 0), 1), unit: "Bag", icon: "box", tone: "ok" }],
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Project", get: r => M.townLabel(r.projecttown), trunc: true }, { label: "Contractor", get: r => M.contractorName(r.contractor), trunc: true }, { f: "concrete_grade", label: "Grade" }, { f: "quantity_of_concrete", label: "Qty (m³)", type: "num", d: 2, total: true }, { label: "Status", get: r => (r.docstatus === 1 ? "Submitted" : "Draft") }],
        after: rows => { const agg = {}; rows.forEach(r => (r.materials || []).forEach(m => { const a = (agg[m.material] = agg[m.material] || { material: itemLabel(m.material), uom: m.uom, calc: 0, cons: 0 }); a.calc += (+r.quantity_of_concrete || 0) * (+m.rate || 0); a.cons += +m.consumption || 0; })); const list = Object.entries(agg).map(([k, a]) => Object.assign(a, { stock: stock[k] || 0 })); return "<div style='height:16px'></div>" + DX.card("Material-wise totals", DX.table([{ f: "material", label: "Material", strong: true }, { f: "uom", label: "UOM" }, { f: "calc", label: "Calculated", type: "num", d: 2 }, { f: "cons", label: "Consumed", type: "num", d: 2 }, { f: "stock", label: "In stock", type: "num" }], list), { icon: "box", tone: "cyan", sub: "calculated vs consumed vs stock" }); } }
    ]
  });
})();
