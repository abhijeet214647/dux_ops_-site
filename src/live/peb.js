/* PEB Fabrication Tracker — LIVE (peb.peb.ft_api.*, v4 pipeline). Cutting consumes raw plate (Material Issue), Painting posts the
   finished member (Material Receipt) — both done by the server exactly like /app/peb-fabrication-tracker. */
(function () {
  "use strict";
  const DX = window.DX, { nf, esc, ic } = DX;
  const API = "peb.peb.ft_api.";
  const STAGES = ["Cutting", "Fitting", "Welding", "Painting"], KEY = { Cutting: "cut", Fitting: "fit", Welding: "weld", Painting: "paint" };
  const B = { teams: ["Team Alpha", "Team Beta", "Team Gamma"], raw_warehouse: "", fin_store: "", dash: null, det: {}, rep: { key: "", rows: [], fin: null } };
  const TYPE = code => /^JB/.test(code) ? "Jack Rafter" : /^JC/.test(code) ? "Jack Column" : /^R\d*[A-Z]?$/.test(code) ? "Rafter" : /^C\d*[A-Z]?$/.test(code) ? "Column" : /^G/.test(code) ? "Girder" : "Other";
  const mw = m => +m.weight || m.parts.reduce((s, p) => s + p.unit_wt * p.qty, 0);
  const counts = m => ({ cut: m.cut || 0, fit: m.fit || 0, weld: m.weld || 0, paint: m.paint || 0 });
  const fromMember = (m, project) => ({
    name: m.name, project, member_code: m.member_code, member_type: m.member_type || TYPE(m.member_code), member_qty: +m.member_qty || 1, weight: +m.member_weight_kg || 0,
    cut: +m.cut_qty || 0, fit: +m.fit_qty || 0, weld: +m.weld_qty || 0, paint: +m.paint_qty || 0, log: m.log || [],
    parts: (m.parts || []).map(p => ({ id: p.name, code: p.item_code, desc: p.desc || "", raw: p.raw_material || "", qty: +p.qty || 1, unit_wt: +p.unit_weight_kg || (+p.weight_kg || 0) / Math.max(1, +p.qty || 1), wastage: +p.wastage_pct || 0, cut: +p.cut_qty || 0, onhand: +p.raw_onhand || 0 }))
  });
  const loadDetail = async (name, force) => {
    if (!name) return null;
    if (!force && B.det[name] && Date.now() - B.det[name].at < 20000) return B.det[name];
    const r = await DX.call(API + "get_project_detail", { project: name });
    if (r.project && r.project.raw_warehouse) B.raw_warehouse = r.project.raw_warehouse;
    return (B.det[name] = { at: Date.now(), project: r.project, members: (r.members || []).map(m => fromMember(m, name)) });
  };
  const members = name => (B.det[name] ? B.det[name].members : []);

  const project = {
    key: "project", doctype: "PEB FT Project", canCreate: false,
    entity: { singular: "Project", plural: "Projects", title: r => r.name, sub: r => r.site || "—", date: "uploaded_on" },
    status: r => (r.status === "Closed" ? ["Closed", ""] : ["Open", "ok"]), statusKey: r => (r.status === "Closed" ? "closed" : "open"),
    statusFilter: [["", "All"], ["open", "Open"], ["closed", "Closed"]],
    detailActions: d => [{ label: d.status === "Closed" ? "Reopen" : "Close", icon: d.status === "Closed" ? "refresh" : "lock", run: async x => { const r = await DX.call(API + "toggle_project_status", { project: x.name }); DX.toast(`${esc(x.name)} ${r.status === "Closed" ? "closed" : "reopened"}`); } }, { label: "Open fabrication", icon: "flow", tone: "primary", run: (x, ctx) => { DX.state.pebProject = x.name; ctx.go("peb/fab"); return false; } }],
    detailExtra: d => { const ms = members(d.name); return DX.card("Members", ms.length ? DX.table([{ f: "member_code", label: "Member", type: "mono", strong: true }, { f: "member_type", label: "Type" }, { label: "Parts", type: "num", get: m => m.parts.length }, { label: "Wt / member (kg)", type: "num", d: 1, get: mw }, { f: "member_qty", label: "Target", type: "num" }, ...STAGES.map(s => ({ label: s, type: "num", get: m => counts(m)[KEY[s]] }))], ms) : DX.empty("No members yet", "Upload the BOQ for this project."), { icon: "beam", tone: "cyan", sub: `${ms.length} members` }) + "<div style='height:16px'></div>"; },
    api: {
      ttl: 30000,
      load: async () => (await DX.call(API + "list_projects")).map(p => Object.assign({}, p, { uploaded_on: DX.day(p.uploaded_on) || DX.day(p.creation) })),
      get: async name => { await DX.ensure(project); await loadDetail(name, true); return Object.assign({}, DX.find(project, name) || { name }); }
    }
  };
  const wo = {
    key: "wo", doctype: "PEB FT Work Order", canEdit: false, lazy: true, formDocs: ["project"],
    entity: { singular: "Work order", plural: "Work orders", title: r => r.client_wo_no, sub: r => r.project_name || r.project, date: "date_received" },
    status: r => (r.status === "Closed" ? ["Closed", "ok"] : ["Open", "pending"]), statusKey: r => (r.status === "Closed" ? "closed" : "open"), statusFilter: [["", "All"], ["open", "Open"], ["closed", "Closed"]],
    newLabel: "New work order", defaults: () => ({ date_received: DX.TODAY }),
    form: [{ id: "wo", title: "Work order", icon: "card", fields: [
      { f: "project", label: "Project", type: "link", req: true, options: () => DX.rows(project).map(p => p.name).concat(["— new project —"]) },
      { f: "new_project", label: "New project name", type: "text", req: true, showIf: d => d.project === "— new project —" },
      { f: "client_wo_no", label: "Client’s work order no.", type: "text", req: true, ph: "JEW/PO/2026/0142" },
      { f: "date_received", label: "Date received", type: "date" }, { f: "contracted_weight_mt", label: "Contracted weight (optional)", type: "float", unit: "MT", step: 0.001 },
      { f: "attachment", label: "Attachment", type: "photo", icon: "image", accept: "image/*,application/pdf" },
      { f: "remarks", label: "Remarks", type: "textarea", span: 2, ph: "Scope, revision no., validity…" }
    ] }],
    detailExtra: d => d.attachment ? `<div class="dx-note">${ic("file", 16)}<div>Attachment: <a class="dx-link" href="${esc(d.attachment)}" target="_blank" rel="noopener">${esc(d.attachment.split("/").pop())}</a></div></div>` : "",
    api: {
      load: async () => (await DX.call(API + "list_work_orders")).map(w => Object.assign({}, w, { date_received: DX.day(w.date_received) })),
      save: async d => { const r = await DX.call(API + "save_work_order", { client_wo_no: d.client_wo_no, project_name: d.project === "— new project —" ? (d.new_project || "").trim() : d.project, date_received: d.date_received || DX.TODAY, contracted_weight_mt: +d.contracted_weight_mt || 0, attachment: d.attachment || "", remarks: d.remarks || "" }); DX.invalidate(project); return { name: r.name }; }
    }
  };

  const projSel = () => { const ps = DX.rows(project).filter(p => p.status !== "Closed"); if (!ps.find(p => p.name === DX.state.pebProject)) DX.state.pebProject = ps[0] ? ps[0].name : ""; return DX.state.pebProject; };
  const projPicker = cur => `<div class="dx-toolbar"><div class="dx-field" style="min-width:280px"><span class="dx-label">Open project</span><button type="button" class="dx-combo" data-pebproj aria-expanded="false"><span class="dx-combo-val">${esc(cur || "Pick a project")}</span>${ic("down", 16)}</button></div><span class="dx-muted" style="font-size:12.5px;align-self:flex-end;padding-bottom:10px">Raw consumed from <b class="dx-mono">${esc(B.raw_warehouse || "the raw store")}</b>${B.fin_store ? ` · finished stock into <b class="dx-mono">${esc(B.fin_store)}</b>` : ""}</span></div>`;
  const bindProj = ctx => ctx.on("click", e => { const b = e.target.closest("[data-pebproj]"); if (b) DX.Combo.open(b, { title: "Open project", value: DX.state.pebProject, options: DX.rows(project).filter(p => p.status !== "Closed").map(p => ({ value: p.name, label: p.name, sub: `${p.members || 0} members · ${nf(p.tonnage || 0, 2)} MT` })), onPick: v => { DX.state.pebProject = v; ctx.rerender(); } }); });
  const loadCurrent = async () => { await DX.ensure(project); const cur = projSel(); if (cur) await loadDetail(cur); };

  function stageModal(m, stage, ctx) {
    const c = counts(m), idx = STAGES.indexOf(stage), prev = idx ? [c.cut, c.fit, c.weld][idx - 1] : Infinity, avail = prev - c[KEY[stage]];
    const head = `<div class="dx-grid" style="margin-bottom:14px"><div class="dx-field"><label class="dx-label">Team<span class="dx-req">*</span></label><select class="dx-input" data-sm="team">${B.teams.map(t => `<option>${esc(t)}</option>`).join("")}</select></div><div class="dx-field"><label class="dx-label">Date<span class="dx-req">*</span></label><input class="dx-input" type="date" data-sm="date" value="${DX.TODAY}" max="${DX.TODAY}"></div><div class="dx-field"><label class="dx-label">Remarks</label><input class="dx-input" data-sm="remarks"></div></div>`;
    const body = stage === "Cutting"
      ? head + `<div class="dx-tablewrap"><table class="dx-table"><thead><tr><th>Sub-part</th><th>Raw</th><th class="num">Wt / pc</th><th class="num">In stock (kg)</th><th class="num">Cut so far</th><th class="num">Quantity (pcs)</th></tr></thead><tbody>${m.parts.map((p, i) => `<tr><td class="strong">${esc(p.code)} <span class="dx-muted" style="font-weight:400">· ${esc(p.desc)}</span></td><td class="dx-mono dx-td-mono">${esc(p.raw || "—")}</td><td class="num">${nf(p.unit_wt, 1)}</td><td class="num" style="${p.onhand > 0 ? "" : "color:var(--err)"}">${nf(p.onhand)}</td><td class="num">${nf(p.cut)}</td><td class="num"><input class="dx-input dx-input-sm dx-mono" type="number" min="0" step="1" data-cutpc="${i}" value="${p.qty}" style="width:90px;text-align:right"></td></tr>`).join("")}</tbody></table></div><div class="dx-hint" style="margin-top:12px">${ic("box", 16)}<span>Total cutting this entry: <b class="dx-mono" data-cuttot></b></span></div>`
      : head + `<div class="dx-field"><label class="dx-label">Quantity (${esc(m.member_code)}) · max ${nf(avail)}<span class="dx-req">*</span></label><div class="dx-stepper dx-stepper-lg"><button type="button" data-sq="-1">${ic("minus", 16)}</button><input type="number" min="0" step="1" data-sq-in value="${Math.min(1, avail)}"><button type="button" data-sq="1">${ic("plus", 16)}</button></div><div class="dx-msg" data-sqmsg></div></div>`;
    const md = DX.openModal({ title: `Add ${stage} — ${m.member_code}`, sub: stage === "Cutting" ? "Enter pieces cut per sub-part. Raw plate is consumed per piece × (1 + wastage) — the server posts the Material Issue." : stage === "Painting" ? "Painting posts the finished member (Nos + kg) into the finished store." : `${stage} can’t exceed the previous stage.`, wide: stage === "Cutting", body, foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Cancel</button><button class="dx-btn dx-btn-primary" data-smsave>${ic("check", 15)}Add ${stage.toLowerCase()}</button>` });
    const tot = () => { const pcs = [...md.querySelectorAll("[data-cutpc]")].map(i => +i.value || 0); const kg = m.parts.reduce((s, p, i) => s + (p.raw ? p.unit_wt * pcs[i] * (1 + p.wastage / 100) : 0), 0); const t = md.querySelector("[data-cuttot]"); if (t) t.textContent = `${nf(pcs.reduce((a, b) => a + b, 0))} pcs · ${nf(kg, 1)} kg raw`; };
    tot();
    md.addEventListener("input", tot);
    md.addEventListener("click", e => { const b = e.target.closest("[data-sq]"); if (b) { const i = md.querySelector("[data-sq-in]"); i.value = Math.max(0, (+i.value || 0) + +b.dataset.sq); } });
    md.querySelector("[data-smsave]").addEventListener("click", async ev => {
      const team = md.querySelector('[data-sm="team"]').value, date = md.querySelector('[data-sm="date"]').value || DX.TODAY, remarks = md.querySelector('[data-sm="remarks"]').value;
      const args = { member: m.name, stage, date, team, remarks };
      if (stage === "Cutting") {
        const pcs = [...md.querySelectorAll("[data-cutpc]")].map(i => Math.max(0, parseInt(i.value, 10) || 0));
        if (!pcs.some(Boolean)) return DX.toast("Enter at least one piece to cut.", "err");
        const need = {}; m.parts.forEach((p, i) => { if (p.raw) need[p.raw] = (need[p.raw] || 0) + p.unit_wt * pcs[i] * (1 + p.wastage / 100); });
        const onhand = {}; m.parts.forEach(p => { if (p.raw) onhand[p.raw] = p.onhand; });
        const short = Object.entries(need).find(([r, kg]) => kg > (onhand[r] || 0) + 0.001);
        if (short) return DX.toast(`Only ${nf(onhand[short[0]] || 0)} kg ${esc(short[0])} in stock (${esc(B.raw_warehouse)}) — this cutting needs ${nf(short[1])} kg.`, "err");
        args.qty = 0; args.sub_qtys = DX.json(Object.fromEntries(m.parts.map((p, i) => [p.id, pcs[i]]).filter(([, v]) => v > 0)));
      } else {
        const q = Math.max(0, parseInt(md.querySelector("[data-sq-in]").value, 10) || 0);
        if (!q) return DX.toast("Enter a quantity above 0.", "err");
        if (q > avail) { const msg = md.querySelector("[data-sqmsg]"); msg.textContent = `${stage} can’t exceed ${STAGES[idx - 1]} qty — only ${avail} available (you tried ${q}).`; msg.style.color = "var(--err)"; return; }
        args.qty = q;
      }
      const done = DX.spin(ev.currentTarget, "Saving…");
      try {
        const r = await DX.call(API + "add_progress", args);
        DX.closeModal(); DX.toast(esc(r.msg || `${stage} recorded`) + (r.stock_entry ? ` · <span class="dx-mono">${esc(r.stock_entry)}</span>` : ""));
        await loadDetail(m.project, true); DX.invalidate(project); B.dash = null; B.rep.key = ""; ctx.rerender();
      } catch (err) { done(); DX.views.showProblems(err, `Couldn’t add ${stage.toLowerCase()}`); }
    });
  }

  /* ---- BOQ weight-sheet import: SheetJS + the same parser as the desk page (rowsToMembers), then import_boq validates & writes ---- */
  const loadXLSX = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("Couldn’t load the Excel reader — check the connection.")); document.head.appendChild(s); });
  function rowsToMembers(rows) {
    if (!rows.length) return { error: "Empty sheet.", columns: [] };
    const isMemberH = x => /member|rafter|mark|assembly|section/.test(x), isPartH = x => /part|item|component/.test(x);
    let head = -1;
    for (let i = 0; i < Math.min(rows.length, 12); i++) { const j = rows[i].map(x => String(x).toLowerCase()); if (j.some(isMemberH) && j.some(isPartH)) { head = i; break; } }
    if (head < 0) return { error: "Couldn't find a header row. Expected a member column (Rafter / Member / Mark) and a part column (Part Name / Item).", columns: (rows[0] || []).map(String) };
    const H = rows[head].map(x => String(x).toLowerCase().trim()), columns = rows[head].map(String);
    let projectName = "";
    for (let i = 0; i < head; i++) { const rr = (rows[i] || []).map(x => String(x == null ? "" : x)); const pi = rr.findIndex(x => /^\s*(project|site)\b/i.test(x)); if (pi > -1) { const val = rr.slice(pi + 1).find(x => x.trim()); if (val) { projectName = val.trim(); break; } } }
    const col = names => { for (const n of names) { const i = H.findIndex(h => h.includes(n)); if (i > -1) return i; } return -1; };
    const c = { member: col(["rafter", "member", "mark", "assembly"]), item: col(["part name", "part", "item", "component"]), desc: col(["desc"]), qty: col(["qty", "nos", "no."]), uw: col(["unit wt", "unit weight", "unitwt"]), wt: H.findIndex(h => h.includes("weight") && !h.includes("unit")), len: col(["length", "len"]), width: col(["width"]), thick: col(["thick", "thk"]), density: col(["density"]), area: col(["area"]), raw: col(["raw material", "raw"]), wast: col(["wast"]) };
    const missing = [];
    if (c.member < 0) missing.push("Member / Rafter");
    if (c.item < 0) missing.push("Part Name / Item");
    if (c.raw < 0 && c.thick < 0) missing.push("Raw Material (or Thickness to derive the plate)");
    if (c.uw < 0 && c.wt < 0 && (c.len < 0 || c.width < 0 || c.thick < 0)) missing.push("Weight (or Length+Width+Thick)");
    if (missing.length) return { error: "Missing column(s): " + missing.join(", "), columns };
    const num = v => { const n = Number(String(v == null ? "" : v).replace(/,/g, "").trim()); return isNaN(n) ? 0 : n; };
    const mmFromThick = t => { t = num(t); if (!t) return 0; return t < 1 ? Math.round(t * 1000) : Math.round(t); };
    const out = [], cellErr = []; let cur = null;
    for (let i = head + 1; i < rows.length; i++) {
      const r = rows[i], mcode = String(r[c.member] || "").trim(), item = String(r[c.item] || "").trim();
      if (mcode && (!cur || cur.code !== mcode)) { cur = { code: mcode, parts: [] }; out.push(cur); }
      if (!cur || !item) continue;
      const qty = num(r[c.qty]) || 1, len = c.len > -1 ? num(r[c.len]) : 0, width = c.width > -1 ? num(r[c.width]) : 0;
      const thickRaw = c.thick > -1 ? num(r[c.thick]) : 0, density = c.density > -1 ? (num(r[c.density]) || 7850) : 7850, mm = mmFromThick(thickRaw);
      if (c.wt > -1 && r[c.wt] !== "" && r[c.wt] != null && isNaN(Number(String(r[c.wt]).replace(/,/g, "").trim()))) cellErr.push({ row: i + 1, column: columns[c.wt] || "Weight", value: r[c.wt], message: "Weight is not a number" });
      let totalWt = c.wt > -1 ? num(r[c.wt]) : 0;
      if (!totalWt && c.uw > -1) totalWt = num(r[c.uw]) * qty;
      if (!totalWt && len && width && thickRaw) totalWt = len * width * (thickRaw < 1 ? thickRaw : thickRaw / 1000) * density * qty;
      let rawc = c.raw > -1 ? String(r[c.raw] || "").trim() : "";
      if (!rawc && mm) rawc = "PL" + mm + "-E250";
      cur.parts.push({ item, desc: c.desc > -1 ? r[c.desc] : "", qty, unit_weight_kg: qty ? +(totalWt / qty).toFixed(3) : totalWt, weight_kg: +totalWt.toFixed(3), length_m: len, width_m: width, thickness_mm: mm, area_sqm: c.area > -1 ? num(r[c.area]) : +(len * width).toFixed(4), density, raw_material: rawc, wastage_pct: c.wast > -1 ? num(r[c.wast]) : 0, _row: i + 1 });
    }
    return { members: out.filter(m => m.parts.length), columns, cellErr, project: projectName };
  }
  const errTable = errs => DX.table([{ f: "row", label: "Row", type: "num" }, { f: "column", label: "Column" }, { f: "value", label: "Value", type: "mono" }, { f: "message", label: "Problem" }], errs.slice(0, 200), { maxh: "46vh" });
  async function boqFile(file, ctx) {
    let parsed;
    try { const X = await loadXLSX(); const wb = X.read(await file.arrayBuffer(), { type: "array" }); parsed = rowsToMembers(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" })); } catch (e) { return DX.toast(esc(e.message || "Couldn’t read that file."), "err"); }
    if (parsed.error) return DX.openModal({ title: "Can’t import this sheet", body: `<p class="dx-muted" style="margin-bottom:10px">${esc(parsed.error)}</p>${parsed.columns.length ? `<div class="dx-eyebrow" style="margin-bottom:6px">Columns found</div><div class="dx-mono" style="font-size:12px">${esc(parsed.columns.join(" · "))}</div>` : ""}`, foot: `<button class="dx-btn dx-btn-secondary" data-modal-x>Close</button>` });
    if (parsed.cellErr.length) return DX.openModal({ title: "Fix these cells first", sub: `${parsed.cellErr.length} cell(s) in ${esc(file.name)}`, wide: true, body: errTable(parsed.cellErr), foot: `<button class="dx-btn dx-btn-secondary" data-modal-x>Close</button>` });
    if (!parsed.members.length) return DX.toast("No members found in that sheet.", "err");
    const parts = parsed.members.reduce((n, m) => n + m.parts.length, 0), kg = parsed.members.reduce((s, m) => s + m.parts.reduce((a, p) => a + (+p.weight_kg || 0), 0), 0);
    const def = parsed.project || DX.state.pebProject || file.name.replace(/\.[^.]+$/, "");
    const md = DX.openModal({ title: "Import BOQ", sub: `${esc(file.name)} · <span class="dx-num">${parsed.members.length}</span> members · <span class="dx-num">${parts}</span> parts · <span class="dx-num">${nf(kg / 1000, 2)}</span> MT`, wide: true,
      body: `<label class="dx-field" style="margin-bottom:14px"><span class="dx-label">Project / site name<span class="dx-req">*</span></span><input class="dx-input" data-boqname value="${esc(def)}"><span class="dx-hint">An existing project with this name gets its members updated (parts replaced); otherwise a new project is created.</span></label>${DX.table([{ f: "code", label: "Member", type: "mono", strong: true }, { label: "Type", get: m => TYPE(m.code) }, { label: "Parts", type: "num", get: m => m.parts.length }, { label: "Weight (kg)", type: "num", d: 1, get: m => m.parts.reduce((a, p) => a + (+p.weight_kg || 0), 0) }, { label: "Raw plates", get: m => [...new Set(m.parts.map(p => p.raw_material))].join(", "), trunc: true }], parsed.members, { maxh: "40vh" })}<div data-boqerr></div>`,
      foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Cancel</button><button class="dx-btn dx-btn-primary" data-boqgo>${ic("upload", 15)}Import ${parsed.members.length} members</button>` });
    md.querySelector("[data-boqgo]").addEventListener("click", async ev => {
      const name = md.querySelector("[data-boqname]").value.trim();
      if (!name) return DX.toast("Enter a project name.", "err");
      const done = DX.spin(ev.currentTarget, "Validating & importing…");
      try {
        const r = await DX.call(API + "import_boq", { members: DX.json(parsed.members), site_name: name, filename: file.name });
        if (!r.ok) { done(); md.querySelector("[data-boqerr]").innerHTML = `<div class="dx-eyebrow" style="margin:14px 0 6px;color:var(--err)">Nothing was imported — ${r.errors.length} problem(s)</div>` + errTable(r.errors || []); return; }
        DX.closeModal(); DX.toast(`Imported <b>${esc(r.project)}</b> · ${r.new_members} new, ${r.updated_members} updated members`);
        DX.state.pebProject = r.project; DX.invalidate(project); delete B.det[r.project]; B.dash = null; ctx.rerender();
      } catch (err) { done(); DX.views.showProblems(err, "Import failed"); }
    });
  }

  const app = DX.register({
    key: "peb", title: "PEB Fabrication", short: "PEB", icon: "beam", hue: "violet", route: "/app/peb-fabrication-tracker",
    desc: "BOQ · cutting → painting pipeline", eyebrow: "PEB fabrication tracker",
    headline: `Cut, fit, weld, paint — track every <span class="dx-grad">member</span>`,
    intro: "One pipeline for every project: Cutting (per sub-part, consumes raw plate) → Fitting → Welding → Painting (posts the finished member to stock). Each stage can’t exceed the one before it.",
    docs: [project, wo], noRecent: true,
    boot: async () => { try { const c = await DX.call(API + "get_fab_config"); if (c.teams && c.teams.length) B.teams = c.teams; B.raw_warehouse = c.raw_warehouse || ""; } catch (_) { /* defaults */ } },
    heroActions: () => `<button class="dx-btn dx-btn-primary" data-go="peb/fab">${ic("flow", 15)}Open fabrication</button><button class="dx-btn dx-btn-secondary" data-go="peb/boq">${ic("upload", 15)}Upload BOQ</button>`,
    kpis: () => { const d = B.dash || {}, ps = DX.rows(project); return [
      { label: "Active projects", value: nf(d.open_count != null ? d.open_count : ps.filter(p => p.status !== "Closed").length), sub: `<span class="dx-num">${nf((d.project_count || ps.length) - (d.open_count || 0))}</span> closed`, icon: "building" },
      { label: "Total tonnage (BOQ)", value: nf(d.total_mt || 0, 2), unit: "MT", sub: `<span class="dx-num">${nf(d.member_count || 0)}</span> members`, icon: "beam", tone: "cyan" },
      { label: "Finished stock", value: nf(d.finished_nos || 0), unit: "Nos", sub: `<span class="dx-num">${nf(d.finished_mt || 0, 2)}</span> MT painted & in stock`, icon: "box", tone: "ok" },
      { label: "Members painted", value: nf(((d.funnel || []).find(x => x.stage === "Painting") || {}).count || 0), sub: "finished so far", icon: "check" }
    ]; },
    panels: () => { const d = B.dash || {}; return [
      DX.card("Members by stage", DX.bars(STAGES.map(s => ({ label: s, value: +(((d.funnel || []).find(x => x.stage === s) || {}).count || 0) })), { unit: "members" }), { icon: "flow", tone: "cyan", sub: "cumulative, all projects" }),
      DX.card("Recent activity", (d.recent || []).map(l => `<div class="dx-feed-row"><span class="dx-tile${l.stage === "Painting" ? " dx-tile-ok" : ""}">${ic(l.stage === "Painting" ? "check" : "flow", 14)}</span><div class="dx-feed-main"><div class="dx-feed-title"><b class="dx-mono">${esc(l.member_code || l.item_code)}</b> → ${esc(l.stage)} ×${nf(l.qty)}</div><div class="dx-feed-sub">${esc(l.project_name || l.project || "")} · ${esc(l.team || "")}</div></div><div class="dx-feed-end"><span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(l.date)}</span></div></div>`).join("") || DX.empty("No progress yet", "Stage entries show up here."), { icon: "clock" })
    ]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "project", docs: ["project"], load: async () => { if (!B.dash) B.dash = await DX.call(API + "dashboard_data"); } },
      { id: "projects", label: "Projects", icon: "building", type: "list", doc: "project", dateFilter: false, searchPh: "Search project or site…",
        columns: [{ f: "name", label: "Project", strong: true }, { f: "site", label: "Client site" }, { f: "tonnage", label: "Tonnage (MT)", type: "num", d: 2 }, { f: "members", label: "Members", type: "num" }, { label: "Painted", type: "mono", get: p => `${nf(p.painted || 0)} / ${nf(p.target || 0)}` }, { label: "Status", type: "status", get: p => DX.statusOf(project, p) }] },
      { id: "boq", label: "BOQ", icon: "list", load: loadCurrent, render: () => {
        const cur = projSel(), ms = members(cur);
        return projPicker(cur) + `<section class="dx-card dx-card-accent" style="margin-bottom:16px"><div class="dx-card-head"><span class="dx-tile">${ic("upload", 15)}</span><h3>Upload BOQ <span class="dx-sub">· .xlsx / .xls / .csv weight sheet</span></h3></div><div class="dx-card-body"><label class="dx-photo" style="aspect-ratio:auto;min-height:110px">${ic("upload", 24)}<span class="dx-photo-b">Drop the weight sheet here or tap to choose</span><span style="font-size:11.5px">Columns: Member, Part name, Length, Width, Qty, Thick, Density, Weight — raw plate is derived from thickness (PL{mm}-E250)</span><input type="file" accept=".xlsx,.xls,.csv" data-boqfile></label></div></section>` +
          (cur ? DX.card(`${esc(cur)} · BOQ`, `<div class="dx-meta"><span><span class="dx-num">${ms.length}</span> members · <span class="dx-num">${ms.reduce((n, m) => n + m.parts.length, 0)}</span> parts · <span class="dx-num">${nf(ms.reduce((s, m) => s + mw(m) * m.member_qty, 0) / 1000, 2)}</span> MT</span></div>` + (ms.length ? `<div class="dx-tablewrap"><table class="dx-table"><thead><tr><th>Member / part</th><th>Item</th><th>Raw material</th><th class="num">Qty</th><th class="num">Unit wt (kg)</th><th class="num">Total wt (kg)</th></tr></thead><tbody>${ms.map(m => `<tr style="background:var(--th-bg)"><td class="strong"><span class="dx-mono">${esc(m.member_code)}</span> — ${esc(m.member_type)}</td><td></td><td></td><td class="num">${m.member_qty}</td><td class="num">${nf(mw(m), 1)}</td><td class="num">${nf(mw(m) * m.member_qty, 1)}</td></tr>${m.parts.map(p => `<tr><td style="padding-left:32px">${esc(p.desc || p.code)}</td><td class="dx-mono dx-td-mono">${esc(p.code)}</td><td class="dx-mono dx-td-mono">${esc(p.raw)} <span class="dx-muted">+${p.wastage}%</span></td><td class="num">${p.qty}</td><td class="num">${nf(p.unit_wt, 1)}</td><td class="num">${nf(p.unit_wt * p.qty, 1)}</td></tr>`).join("")}`).join("")}</tbody></table></div>` : DX.empty("No members yet", "Upload the weight sheet above.")), { icon: "beam", tone: "cyan" }) : DX.empty("No open project", "Upload a BOQ weight sheet to create the first project."));
      }, bind: ctx => { bindProj(ctx); ctx.on("change", e => { if (e.target.matches("[data-boqfile]") && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ""; boqFile(f, ctx); } }); } },
      { id: "fab", label: "Fabrication", icon: "flow", load: loadCurrent, render: () => {
        const cur = projSel(), ms = members(cur);
        return projPicker(cur) + (ms.map(m => { const c = counts(m), vals = [c.cut, c.fit, c.weld, c.paint], prev = [Infinity, c.cut, c.fit, c.weld];
          return `<section class="dx-card" style="margin-bottom:12px"><div class="dx-card-head"><span class="dx-tile dx-tile-cyan">${ic("beam", 15)}</span><h3><span class="dx-mono">${esc(m.member_code)}</span> — ${esc(m.member_type)} <span class="dx-sub">· ${m.parts.length} parts · ${nf(mw(m), 1)} kg/member · target ${m.member_qty}</span></h3><span class="dx-badge dx-badge-cyan">${c.paint}/${m.member_qty} painted</span></div>
            <div class="dx-card-body"><div class="dx-stagebar" style="--n:4">${STAGES.map((s, i) => `<div class="dx-stage${vals[i] >= m.member_qty ? " full" : ""}"><div class="dx-stage-k">${s}</div><div class="dx-stage-v">${nf(vals[i])}<small> / ${i ? nf(prev[i]) : m.member_qty}</small></div><div class="dx-bar"><i style="width:${Math.min(100, Math.round(vals[i] / m.member_qty * 100))}%"></i></div><button class="dx-btn dx-btn-ghost dx-btn-sm" style="margin-top:6px;padding:0 6px" data-stage="${esc(m.name)}|${s}" ${i && vals[i] >= prev[i] ? "disabled" : ""}>${ic("plus", 13)}Add</button></div>`).join("")}</div>
            <div class="dx-tablewrap" style="margin-top:12px"><table class="dx-table"><thead><tr><th>Sub-part</th><th>Cut from</th><th class="num">Wt / member (kg)</th><th class="num">Cut (pcs)</th><th class="num">Company stock (kg)</th></tr></thead><tbody>${m.parts.map(p => `<tr><td><span class="dx-mono">${esc(p.code)}</span> · ${esc(p.desc)}</td><td class="dx-mono dx-td-mono">${esc(p.raw || "—")} +${p.wastage}%</td><td class="num">${nf(p.unit_wt * p.qty, 1)}</td><td class="num">${nf(p.cut)}</td><td class="num" style="${p.onhand > 0 ? "" : "color:var(--err)"}">${nf(p.onhand)}</td></tr>`).join("")}</tbody></table></div></div></section>`; }).join("") || DX.empty("No members", cur ? "Upload the BOQ for this project first." : "No open project yet — upload a BOQ first."));
      }, bind: ctx => { bindProj(ctx); ctx.on("click", e => { const b = e.target.closest("[data-stage]"); if (!b) return; const [id, s] = b.dataset.stage.split("|"); const m = members(DX.state.pebProject).find(x => x.name === id); if (m) stageModal(m, s, ctx); }); } },
      { id: "workorders", label: "Work orders", icon: "card", type: "list", doc: "wo", docs: ["wo", "project"], searchPh: "Search WO, client WO no., project…", columns: [{ f: "name", label: "Work order", type: "mono", strong: true }, { f: "client_wo_no", label: "Client WO no." }, { label: "Project", get: r => r.project_name || r.project }, { f: "date_received", label: "Date received", type: "date" }, { f: "contracted_weight_mt", label: "Weight (MT)", type: "num", d: 2 }, { label: "Status", type: "status", get: r => DX.statusOf(wo, r) }] },
      { id: "reports", label: "Reports", icon: "chart", group: "Insights", docs: ["project"],
        load: async () => {
          const tab = DX.state.pebRep || "log", proj = DX.state.pebRepProj || "", stage = DX.state.pebRepStage || "", key = [tab, proj, stage].join("|");
          if (B.rep.key === key) return;
          if (tab === "log") B.rep.rows = await DX.call(API + "report_rows", { project: proj || "ALL", stage: stage || "ALL" });
          else { const ps = proj ? [proj] : DX.rows(project).map(p => p.name); const all = await Promise.all(ps.map(p => DX.call(API + "item_stock", { project: p }).then(r => (B.fin_store = r.warehouse || B.fin_store, (r.rows || []).map(x => Object.assign({ project: p }, x)))))); B.rep.fin = all.flat(); }
          B.rep.key = key;
        },
        render: () => {
          const tab = DX.state.pebRep || "log", rows = B.rep.rows || [], fin = B.rep.fin || [];
          return `<div class="dx-toolbar"><div class="dx-seg" role="tablist">${[["log", "Stage log"], ["fin", "Finished items"]].map(([k, l]) => `<button type="button" data-peb-rtab="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div><div class="dx-seg">${[""].concat(DX.rows(project).map(p => p.name)).map(p => `<button type="button" data-peb-rproj="${esc(p)}" aria-pressed="${(DX.state.pebRepProj || "") === p}">${esc(p || "All projects")}</button>`).join("")}</div>${tab === "log" ? `<div class="dx-seg">${[""].concat(STAGES).map(s => `<button type="button" data-peb-rstage="${s}" aria-pressed="${(DX.state.pebRepStage || "") === s}">${s || "All stages"}</button>`).join("")}</div>` : ""}</div>` +
            (tab === "log" ? DX.card("Stage log", `<div class="dx-meta"><span><span class="dx-num">${rows.length}</span> entries</span><button class="dx-btn dx-btn-ghost dx-btn-sm" data-peb-csv ${rows.length ? "" : "disabled"}>${ic("download", 14)}Export CSV</button></div>` + (rows.length ? DX.table([{ f: "date", label: "Date", type: "date" }, { f: "project", label: "Project" }, { f: "member", label: "Member", type: "mono" }, { f: "stage", label: "Stage" }, { f: "qty", label: "Qty", type: "num" }, { f: "unit", label: "Unit" }, { f: "team", label: "Team" }, { f: "remarks", label: "Remarks", trunc: true }], rows, { maxh: "62vh" }) : DX.empty("No entries", "Change the filters above.")), { icon: "list" })
              : DX.card("Finished items", `<div class="dx-meta"><span><span class="dx-num">${nf(DX.sum(fin, "nos"))}</span> Nos · <span class="dx-num">${nf(DX.sum(fin, "kg"), 1)}</span> kg total</span><span class="dx-muted dx-mono" style="font-size:11.5px">${esc(B.fin_store)}</span></div>` + (fin.length ? DX.table([{ f: "item", label: "Finished member", type: "mono", strong: true }, { f: "project", label: "Project" }, { f: "nos", label: "Qty (Nos)", type: "num", total: true }, { f: "kg", label: "Weight (kg)", type: "num", d: 1, total: true }], fin, { foot: true }) : DX.empty("Nothing painted yet", "Painted members show up here as finished stock.")), { icon: "box", tone: "ok" }));
        },
        bind: ctx => ctx.on("click", e => { const t = e.target.closest("[data-peb-rtab]"), p = e.target.closest("[data-peb-rproj]"), s = e.target.closest("[data-peb-rstage]"); if (t) DX.state.pebRep = t.dataset.pebRtab; if (p) DX.state.pebRepProj = p.dataset.pebRproj; if (s) DX.state.pebRepStage = s.dataset.pebRstage; if (t || p || s) return ctx.rerender(); if (e.target.closest("[data-peb-csv]")) DX.csv([{ f: "date", label: "Date" }, { f: "project", label: "Project" }, { f: "member", label: "Member" }, { f: "stage", label: "Stage" }, { f: "qty", label: "Qty" }, { f: "unit", label: "Unit" }, { f: "team", label: "Team" }, { f: "remarks", label: "Remarks" }], B.rep.rows || [], "peb-report.csv"); }) }
    ]
  });
  void app;
})();
