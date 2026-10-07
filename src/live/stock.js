/* Stock (dux_portal · suite_stock): receive material into a store, give it to a contractor, issue it,
   and see live balances + movements. Every save is a real ERPNext Stock Entry draft; submit moves the stock.
   The field apps (HSC, Pour Card, Concrete, PEB) post their own Material Issues — they show here with their source.
   Shown only on sites that switch it on (site_config ops_stock_enabled). */
(function () {
  "use strict";
  const DX = window.DX, { nf, esc, ic } = DX;
  const API = "dux_portal.dux_portal.page.dux_ops_suite.suite_stock.";
  const B = { company: "", companies: [], warehouses: [], items: [], can_create: false, can_submit: false, balance: [], ledger: [], kind: "" };
  const LABEL = { "Material Receipt": "Receive into store", "Material Transfer": "Give to contractor / move", "Material Issue": "Issue / consume" };
  const SHORT = { "Material Receipt": "Receipt", "Material Transfer": "Transfer", "Material Issue": "Issue" };
  const itemOf = code => B.items.find(i => i.name === code) || {};
  // fuel sources read "Fuel issue · 5 L Diesel · <vehicle>": litres on the first line, the vehicle under it, so neither is cut off
  const srcCell = r => {
    const s = r.source || "", p = s.split(" · ");
    if (!/^Fuel (issue|direct)$/.test(p[0]) || p.length < 3) return esc(s) || '<span class="dx-faint">—</span>';
    return `<div title="${esc(s)}">${esc(p.slice(0, 2).join(" · "))}</div><small class="dx-muted"><span hidden> · </span>${esc(p.slice(2).join(" · "))}</small>`;
  };
  const whOf = name => B.warehouses.find(w => w.name === name) || {};
  const whOpts = (d, kind) => B.warehouses.filter(w => (!d.company || w.company === d.company) && (!kind || w.kind === kind)).map(w => ({ value: w.name, label: DX.whLabel(w.name), sub: w.kind }));
  const itemOpts = () => B.items.map(i => ({ value: i.name, label: `${i.item_name || i.name}${i.stock_uom ? " (" + i.stock_uom + ")" : ""}` }));
  const isRec = d => d.purpose === "Material Receipt", isIss = d => d.purpose === "Material Issue";
  const loadBalance = async () => { const r = await DX.call(API + "get_balance", { company: B.company }); B.balance = r.rows || []; };
  const loadLedger = async () => { B.ledger = (await DX.call(API + "get_ledger", { company: B.company, limit: 300 })) || []; };

  const se = {
    key: "se", doctype: "Stock Entry", lazy: false,
    entity: { singular: "Stock entry", plural: "Stock entries", title: r => `${SHORT[r.purpose] || "Stock entry"} · ${r.name}`, sub: r => `${r.from_wh ? DX.whLabel(r.from_wh) : "—"} → ${r.to_wh ? DX.whLabel(r.to_wh) : "—"} · ${r.source || "Stock app"}`, date: "posting_date" },
    newLabel: "New stock entry", submitLabel: "Save & submit", submitTitle: "Submit this stock entry?", submitSub: "ERPNext stock rules run on submit — the stock really moves.",
    get canCreate() { return !!B.can_create; },
    get submittable() { return !!B.can_submit; },
    status: r => (r.docstatus === 1 ? ["Submitted", "ok"] : r.docstatus === 2 ? ["Cancelled", "err"] : ["Draft", ""]),
    defaults: () => ({ purpose: "Material Receipt", posting_date: DX.TODAY, company: B.company || DX.M.defaultCompany, from_wh: "", to_wh: "", remarks: "", items: [{ item: "", qty: 1, rate: 0 }] }),
    form: [{ id: "st", title: "Stock entry", short: "Entry", icon: "box", fields: [
      { f: "purpose", label: "What are you doing?", type: "select", req: true, options: Object.keys(LABEL).map(k => ({ value: k, label: LABEL[k] })), display: v => LABEL[v] || v },
      { f: "company", label: "Company", type: "link", req: true, options: () => B.companies.map(c => ({ value: c.name, label: c.name, sub: c.abbr })) },
      { f: "posting_date", label: "Posting date", type: "date", req: true },
      { f: "from_wh", label: "From warehouse", type: "link", req: true, parent: ["company"], showIf: d => !isRec(d), options: d => whOpts(d), display: v => DX.whLabel(v), hint: "Where the material is now (the store, or the contractor)." },
      { f: "to_wh", label: "To warehouse", type: "link", req: true, parent: ["company"], showIf: d => !isIss(d), options: d => whOpts(d), display: v => DX.whLabel(v), hint: "Giving material to a contractor? Pick the contractor’s warehouse." },
      { f: "remarks", label: "Remarks", type: "text", span: "all" },
      { f: "items", label: "Items", type: "table", span: "all", minRows: 1, rowLabel: "item", newRow: () => ({ item: "", qty: 1, rate: 0 }), columns: [
        { f: "item", label: "Item", type: "select", options: itemOpts },
        { f: "qty", label: "Qty", type: "float", total: true },
        { f: "rate", label: "Rate ₹ (receipt)", type: "float" },
        { f: "amount", label: "Amount ₹", calc: r => (+r.qty || 0) * (+r.rate || 0), d: 2, total: true }
      ] }
    ] }],
    validate: d => {
      const rows = (d.items || []).filter(r => r.item && +r.qty > 0);
      if (!rows.length) return { items: "Add at least one item with a quantity above 0." };
      if (!isRec(d) && !isIss(d) && d.from_wh && d.from_wh === d.to_wh) return { to_wh: "From and to warehouse must differ." };
      if (isRec(d) && rows.some(r => !(+r.rate > 0))) return { items: "Receiving into a store needs a rate on every item." };
      return {};
    },
    onSubmit: () => {},
    api: {
      load: async () => ((await DX.call(API + "list_entries", { limit: 300 })) || []).map(r => ({ name: r.name, docstatus: r.docstatus, purpose: r.stock_entry_type, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse, to_wh: r.to_warehouse, company: r.company, nitems: r.item_count, amount: r.amount, source: r.source, remarks: r.remarks, modified: r.modified })),
      get: async name => { const r = await DX.call(API + "get_entry", { name }); return { name: r.name, docstatus: r.docstatus, purpose: r.purpose, company: r.company, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse || (r.items[0] || {}).s_warehouse || "", to_wh: r.to_warehouse || (r.items[0] || {}).t_warehouse || "", remarks: r.remarks || "", source: r.source, items: (r.items || []).map(i => ({ item: i.item_code, qty: i.qty, rate: i.basic_rate || 0, amount: (+i.qty || 0) * (+i.basic_rate || 0) })) }; },
      save: async d => {
        const items = (d.items || []).filter(r => r.item && +r.qty > 0).map(r => ({ item_code: r.item, qty: +r.qty, basic_rate: +r.rate || 0 }));
        const r = await DX.call(API + "save_entry", { data: DX.json({ name: d.name || undefined, purpose: d.purpose, company: d.company, posting_date: d.posting_date, from_warehouse: d.from_wh, to_warehouse: d.to_wh, remarks: d.remarks, items }) });
        DX.invalidate(se); B.balance = []; return { name: r.name, docstatus: r.docstatus };
      },
      submit: async name => { const r = await DX.call(API + "submit_entry", { name }); B.balance = []; return r; }
    }
  };

  const balanceTable = (rows, maxh) => (rows.length ? DX.table([
    { label: "Warehouse", strong: true, trunc: true, get: r => DX.whLabel(r.warehouse) }, { f: "kind", label: "Type", hideSm: true },
    { f: "item_name", label: "Item", trunc: true }, { f: "qty", label: "Qty", type: "num", d: 2 }, { f: "uom", label: "UOM", hideSm: true },
    { f: "value", label: "Value", type: "money", total: true, hideSm: true }
  ], rows, { foot: true, maxh }) : DX.empty("No stock here yet", "Receive material into a store, then give it to a contractor."));
  const kindSeg = () => `<div class="dx-toolbar"><div class="dx-seg" role="tablist">${[["", "All"], ["Store", "Stores"], ["Contractor", "Contractors"]].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${B.kind === k}">${l}</button>`).join("")}</div></div>`;
  const bindKind = ctx => ctx.on("click", e => { const b = e.target.closest("[data-kind]"); if (b) { B.kind = b.dataset.kind; ctx.rerender(); } });
  const sumBy = (rows, kind) => DX.sum(rows.filter(r => r.kind === kind), "value");

  DX.register({
    key: "stock", title: "Stock", short: "Stock", icon: "box", hue: "amber", route: "/app/stock-entry",
    desc: "Store receipts · material to contractors · balances", eyebrow: "Stock · store & contractors",
    headline: `Material in, material <span class="dx-grad">out</span>`,
    intro: "Receive material into a store, give it to a contractor’s warehouse, and watch the HSC, Pour Card, Concrete and PEB entries issue it on submit.",
    docs: [se],
    boot: async () => { Object.assign(B, await DX.call(API + "get_stock_boot", {}, { get: true })); },
    kpis: () => { const rows = DX.rows(se), month = DX.TODAY.slice(0, 7); return [
      { label: "Store stock value", value: DX.money(sumBy(B.balance, "Store")), sub: `${nf(new Set(B.balance.filter(r => r.kind === "Store").map(r => r.item_code)).size)} items in stores`, icon: "building" },
      { label: "With contractors", value: DX.money(sumBy(B.balance, "Contractor")), sub: `${nf(new Set(B.balance.filter(r => r.kind === "Contractor").map(r => r.warehouse)).size)} contractor warehouses`, icon: "truck", tone: "cyan" },
      { label: "Entries this month", value: nf(rows.filter(r => r.docstatus === 1 && String(r.posting_date).slice(0, 7) === month).length), sub: `${nf(rows.filter(r => r.docstatus === 1 && r.source !== "Stock app" && String(r.posting_date).slice(0, 7) === month).length)} from the field apps`, icon: "swap" },
      { label: "Drafts", value: nf(rows.filter(r => r.docstatus === 0).length), sub: "saved, not submitted", icon: "edit", tone: "pending" }
    ]; },
    panels: () => [
      DX.card("Contractor stock", balanceTable(B.balance.filter(r => r.kind === "Contractor").slice(0, 10)), { icon: "truck", tone: "cyan", sub: "live balance", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="stock/balance">All balances${ic("right", 13)}</button>` }),
      DX.card("Latest entries", DX.table([{ f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => SHORT[r.purpose] || "" }, { label: "Source", type: "html", get: srcCell }, { f: "posting_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(se, r) }], DX.rows(se).slice(0, 8), { go: r => DX.entryRoute(se, r) }), { icon: "swap", tone: "iris" })
    ],
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", docs: ["se"], load: async () => { if (!B.balance.length) await loadBalance(); } },
      { id: "balance", label: "Stock balance", icon: "database", load: loadBalance, bind: bindKind,
        render: () => { const rows = B.balance.filter(r => !B.kind || r.kind === B.kind); return kindSeg() + DX.card("Stock balance", balanceTable(rows, "64vh"), { icon: "database", tone: "cyan", sub: `live · ${esc(B.company || "")}` }); } },
      { id: "entries", label: "Stock entries", icon: "list", type: "list", doc: "se", count: () => DX.rows(se).filter(r => r.docstatus === 0).length || null, searchPh: "Search entry, warehouse, source…",
        search: [r => r.name, r => DX.whLabel(r.from_wh), r => DX.whLabel(r.to_wh), r => r.source, r => SHORT[r.purpose]],
        filters: [{ f: "purpose", label: "Type", options: Object.keys(LABEL), display: v => SHORT[v] || v }],
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => SHORT[r.purpose] || "" }, { label: "From", trunc: true, get: r => DX.whLabel(r.from_wh) || "—" }, { label: "To", trunc: true, get: r => DX.whLabel(r.to_wh) || "—" }, { label: "Source", type: "html", get: srcCell, hideSm: true }, { f: "nitems", label: "Items", type: "num" }, { f: "posting_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(se, r) }],
        banner: () => B.can_create ? "" : `<div class="dx-note dx-note-warn">${ic("lock", 16)}<div>Your role can view stock but can’t create Stock Entries — ask for the Stock User role.</div></div>` },
      { id: "new", label: "New stock entry", icon: "plus", type: "form", doc: "se" },
      { id: "ledger", label: "Stock ledger", icon: "swap", load: loadLedger,
        render: () => DX.card("Stock ledger", `<div class="dx-meta"><span>Every movement for ${esc(B.company || "")}, newest first.</span></div>` + (B.ledger.length ? DX.table([
          { f: "posting_date", label: "Date", type: "date" }, { f: "voucher_no", label: "Entry", type: "mono" }, { label: "Source", type: "html", get: srcCell },
          { f: "item_code", label: "Item", trunc: true }, { label: "Warehouse", trunc: true, get: r => DX.whLabel(r.warehouse) },
          { label: "In / out", type: "html", get: r => `<span class="dx-num" style="color:var(${r.actual_qty < 0 ? "--err" : "--ok"})">${r.actual_qty > 0 ? "+" : ""}${nf(r.actual_qty, 2)}</span>` },
          { f: "qty_after_transaction", label: "Balance", type: "num", d: 2 }
        ], B.ledger, { maxh: "64vh" }) : DX.empty("No movements yet", "Submitted stock entries show here.")), { icon: "swap", tone: "iris" }) }
    ]
  });
})();
