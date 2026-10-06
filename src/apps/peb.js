/* PEB Fabrication Tracker (peb · page peb-fabrication-tracker, v4 pipeline). */
(function () {
  "use strict";
  const DX = window.DX, { nf, esc, ic } = DX;
  const STAGES = ["Cutting", "Fitting", "Welding", "Painting"], KEY = { Cutting: "cut", Fitting: "fit", Welding: "weld", Painting: "paint" };
  const TEAMS = ["Team Alpha", "Team Beta", "Team Gamma"];
  const RAW_STORE = "Stores - JEWPL", FIN_STORE = "Palda Factory - JEWPL";
  const raw = {}; ["PL4", "PL5", "PL6", "PL8", "PL10", "PL12", "PL16", "PL20", "PL25"].forEach(p => (raw[p + "-E250"] = 5000));
  const LOG = [];
  const TYPE = code => /^JB/.test(code) ? "Jack Rafter" : /^JC/.test(code) ? "Jack Column" : /^R/.test(code) ? "Rafter" : /^C/.test(code) ? "Column" : /^G/.test(code) ? "Girder" : "Other";
  const mw = m => m.parts.reduce((s, p) => s + p.unit_wt * p.qty, 0);
  const completeCut = m => Math.min(...m.parts.map(p => Math.floor((p.cut || 0) / p.qty)));
  const counts = m => ({ cut: completeCut(m), fit: m.fit || 0, weld: m.weld || 0, paint: m.paint || 0 });

  const project = {
    key: "project", doctype: "PEB FT Project", naming: d => d.project_name.trim(), dupField: "project_name",
    entity: { singular: "Project", plural: "Projects", title: r => r.name, sub: r => r.site || "—", date: "uploaded_on" },
    status: r => (r.status === "Closed" ? ["Closed", ""] : ["Open", "ok"]), statusKey: r => (r.status === "Closed" ? "closed" : "open"),
    statusFilter: [["", "All"], ["open", "Open"], ["closed", "Closed"]],
    defaults: () => ({ status: "Open", uploaded_on: DX.TODAY }),
    form: [{ id: "p", title: "Project", icon: "building", fields: [
      { f: "project_name", label: "Project / site name", type: "text", req: true, lockOnEdit: true, span: 2 }, { f: "site", label: "Client site", type: "text" },
      { f: "contracted_weight_mt", label: "Contracted weight", type: "float", unit: "MT", step: 0.001 }, { f: "status", label: "BOQ status", type: "select", options: ["Open", "Closed"] }, { f: "uploaded_on", label: "Uploaded on", type: "date" }
    ] }],
    detailActions: d => [{ label: d.status === "Closed" ? "Reopen" : "Close", icon: d.status === "Closed" ? "refresh" : "lock", run: x => { x.status = x.status === "Closed" ? "Open" : "Closed"; DX.toast(`${esc(x.name)} ${x.status === "Closed" ? "closed" : "reopened"}`); } }, { label: "Open fabrication", icon: "flow", tone: "primary", run: (x, ctx) => { DX.state.pebProject = x.name; ctx.go("peb/fab"); return false; } }],
    detailExtra: d => { const ms = members(d.name); return DX.card("Members", DX.table([{ f: "member_code", label: "Member", type: "mono", strong: true }, { label: "Type", get: m => TYPE(m.member_code) }, { label: "Parts", type: "num", get: m => m.parts.length }, { label: "Wt / member (kg)", type: "num", d: 1, get: mw }, { f: "member_qty", label: "Target", type: "num" }, ...STAGES.map(s => ({ label: s, type: "num", get: m => counts(m)[KEY[s]] }))], ms), { icon: "beam", tone: "cyan", sub: `${ms.length} members` }) + "<div style='height:16px'></div>"; },
    seed: () => [
      { name: "Betul Site Shed", project_name: "Betul Site Shed", site: "Betul, MP", contracted_weight_mt: 6.6, status: "Open", uploaded_on: DX.addDays(DX.TODAY, -20) },
      { name: "Crane Gantry Structure - J/1564", project_name: "Crane Gantry Structure - J/1564", site: "Palda, Indore", contracted_weight_mt: 11.33, status: "Open", uploaded_on: DX.addDays(DX.TODAY, -9) }
    ]
  };
  const member = {
    key: "member", doctype: "PEB FT Member", hideFromQuick: true, canCreate: false,
    entity: { singular: "Member", plural: "Members", title: r => `${r.member_code} — ${TYPE(r.member_code)}`, sub: r => r.project, date: "date" },
    status: r => { const c = counts(r); return c.paint >= r.member_qty ? ["Painted", "ok"] : c.cut || r.fit ? ["In progress", "pending"] : ["Not started", ""]; },
    seed: () => {
      const P = (code, desc, rawc, qty, wt, wast = 3) => ({ code, desc, raw: rawc, qty, unit_wt: wt, wastage: wast, cut: 0 });
      const mk = (project, member_code, member_qty, parts, prog) => Object.assign({ name: `${project}::${member_code}`, project, member_code, member_qty, parts, fit: 0, weld: 0, paint: 0, date: DX.TODAY }, prog || {});
      const out = [
        mk("Betul Site Shed", "C1", 4, [P("F1", "Flange plate", "PL10-E250", 2, 28.4), P("W1", "Web plate", "PL8-E250", 1, 62.1), P("T1", "Stiffener", "PL6-E250", 4, 2.3), P("B1", "Base plate", "PL16-E250", 1, 22.4)]),
        mk("Betul Site Shed", "C2", 4, [P("F1", "Flange plate", "PL10-E250", 2, 26.8), P("W1", "Web plate", "PL8-E250", 1, 58.7), P("B1", "Base plate", "PL16-E250", 1, 22.4)]),
        mk("Betul Site Shed", "R1", 6, [P("F1", "Top flange", "PL8-E250", 1, 31.2), P("F2", "Bottom flange", "PL8-E250", 1, 31.2), P("W1", "Web plate", "PL6-E250", 1, 70.4), P("P1", "End plate", "PL12-E250", 2, 7.6)]),
        mk("Betul Site Shed", "R1A", 2, [P("F1", "Top flange", "PL8-E250", 1, 31.3), P("F2", "Bottom flange", "PL8-E250", 1, 31.3), P("W1", "Web plate", "PL6-E250", 1, 70.3), P("P1", "End plate", "PL12-E250", 2, 7.6)]),
        mk("Betul Site Shed", "JB1", 2, [P("F1", "Flange", "PL10-E250", 2, 44.1), P("W1", "Web", "PL8-E250", 1, 88.6), P("P1", "End plate", "PL16-E250", 2, 12.2)]),
        mk("Betul Site Shed", "JC1", 2, [P("F1", "Flange", "PL12-E250", 2, 71.5), P("W1", "Web", "PL10-E250", 1, 142.0), P("B1", "Base plate", "PL20-E250", 1, 33.6)]),
        mk("Crane Gantry Structure - J/1564", "CR1", 3, [P("F1", "Top flange", "PL20-E250", 1, 118.0), P("F2", "Bottom flange", "PL16-E250", 1, 94.5), P("W1", "Web", "PL10-E250", 1, 166.2), P("T1", "Stiffener", "PL8-E250", 8, 3.9)]),
        mk("Crane Gantry Structure - J/1564", "BC1", 4, [P("F1", "Flange", "PL16-E250", 2, 52.3), P("W1", "Web", "PL12-E250", 1, 96.4), P("B1", "Base plate", "PL25-E250", 1, 48.0)]),
        mk("Crane Gantry Structure - J/1564", "RR1", 6, [P("F1", "Flange", "PL8-E250", 2, 21.7), P("W1", "Web", "PL6-E250", 1, 40.2)])
      ];
      // some progress so the pipeline has shape
      const prog = { "Betul Site Shed::C1": [4, 3, 2, 2], "Betul Site Shed::C2": [4, 2, 1, 0], "Betul Site Shed::R1": [6, 5, 5, 3], "Betul Site Shed::R1A": [1, 0, 0, 0], "Crane Gantry Structure - J/1564::CR1": [2, 1, 0, 0], "Crane Gantry Structure - J/1564::BC1": [1, 0, 0, 0] };
      out.forEach(m => { const p = prog[m.name]; if (!p) return; m.parts.forEach(pt => (pt.cut = pt.qty * p[0])); [m.fit, m.weld, m.paint] = [p[1], p[2], p[3]]; STAGES.forEach((s, i) => { if (p[i]) LOG.push({ date: DX.addDays(DX.TODAY, -(8 - i * 2)), project: m.project, member: m.member_code, stage: s, qty: p[i], team: TEAMS[i % 3], remarks: s === "Cutting" ? "Cut all sub-parts" : "" }); }); });
      return out;
    }
  };
  const members = p => DX.rows(member).filter(m => m.project === p);
  const wo = {
    key: "wo", doctype: "PEB FT Work Order", naming: (d, n) => "WO-2026-" + String(n).padStart(5, "0"), seqStart: 2,
    entity: { singular: "Work order", plural: "Work orders", title: r => r.client_wo_no, sub: r => r.project, date: "date_received" },
    status: r => (r.status === "Closed" ? ["Closed", "ok"] : ["Open", "pending"]), statusKey: r => (r.status === "Closed" ? "closed" : "open"), statusFilter: [["", "All"], ["open", "Open"], ["closed", "Closed"]],
    newLabel: "New work order", defaults: () => ({ date_received: DX.TODAY, status: "Open" }),
    form: [{ id: "wo", title: "Work order", icon: "card", fields: [
      { f: "project", label: "Project", type: "link", req: true, options: () => DX.rows(project).map(p => p.name).concat(["— new project —"]) },
      { f: "new_project", label: "New project name", type: "text", req: true, showIf: d => d.project === "— new project —" },
      { f: "client_wo_no", label: "Client’s work order no.", type: "text", req: true, ph: "JEW/PO/2026/0142" },
      { f: "date_received", label: "Date received", type: "date" }, { f: "contracted_weight_mt", label: "Contracted weight (optional)", type: "float", unit: "MT", step: 0.001 },
      { f: "status", label: "Status", type: "select", options: ["Open", "Closed"] }, { f: "attachment", label: "Attachment", type: "photo", icon: "image" },
      { f: "remarks", label: "Remarks", type: "textarea", span: 2, ph: "Scope, revision no., validity…" }
    ] }],
    onCreate: d => { if (d.project === "— new project —" && d.new_project) { d.project = d.new_project.trim(); if (!DX.find(project, d.project)) DX.rows(project).unshift({ name: d.project, project_name: d.project, contracted_weight_mt: d.contracted_weight_mt || 0, status: "Open", uploaded_on: DX.TODAY }); } },
    seed: () => [{ name: "WO-2026-00001", client_wo_no: "JEW/PO/2026/0118", project: "Betul Site Shed", date_received: DX.addDays(DX.TODAY, -24), contracted_weight_mt: 6.6, status: "Open" }, { name: "WO-2026-00002", client_wo_no: "MEGH/WO/J-1564", project: "Crane Gantry Structure - J/1564", date_received: DX.addDays(DX.TODAY, -10), contracted_weight_mt: 11.33, status: "Open" }]
  };

  const projSel = () => { const ps = DX.rows(project).filter(p => p.status !== "Closed"); if (!ps.find(p => p.name === DX.state.pebProject)) DX.state.pebProject = ps[0] ? ps[0].name : ""; return DX.state.pebProject; };
  const projPicker = cur => `<div class="dx-toolbar"><div class="dx-field" style="min-width:280px"><span class="dx-label">Open project</span><button type="button" class="dx-combo" data-pebproj aria-expanded="false"><span class="dx-combo-val">${esc(cur || "Pick a project")}</span>${ic("down", 16)}</button></div><span class="dx-muted" style="font-size:12.5px;align-self:flex-end;padding-bottom:10px">Raw consumed from <b class="dx-mono">${RAW_STORE}</b> · finished stock into <b class="dx-mono">${FIN_STORE}</b></span></div>`;
  const bindProj = ctx => ctx.on("click", e => { const b = e.target.closest("[data-pebproj]"); if (b) DX.Combo.open(b, { title: "Open project", value: DX.state.pebProject, options: DX.rows(project).filter(p => p.status !== "Closed").map(p => ({ value: p.name, label: p.name, sub: members(p.name).length + " members" })), onPick: v => { DX.state.pebProject = v; ctx.rerender(); } }); });

  function stageModal(m, stage, ctx) {
    const c = counts(m), idx = STAGES.indexOf(stage), prev = idx ? [c.cut, c.fit, c.weld][idx - 1] : Infinity, avail = prev - c[KEY[stage]];
    const today = DX.TODAY;
    const head = `<div class="dx-grid" style="margin-bottom:14px"><div class="dx-field"><label class="dx-label">Team<span class="dx-req">*</span></label><select class="dx-input" data-sm="team">${TEAMS.map(t => `<option>${t}</option>`).join("")}</select></div><div class="dx-field"><label class="dx-label">Date<span class="dx-req">*</span></label><input class="dx-input" type="date" data-sm="date" value="${today}"></div><div class="dx-field"><label class="dx-label">Remarks</label><input class="dx-input" data-sm="remarks"></div></div>`;
    const body = stage === "Cutting"
      ? head + `<div class="dx-tablewrap"><table class="dx-table"><thead><tr><th>Sub-part</th><th>Raw</th><th class="num">Wt / pc</th><th class="num">In stock</th><th class="num">Cut so far</th><th class="num">Quantity (pcs)</th></tr></thead><tbody>${m.parts.map((p, i) => `<tr><td class="strong">${esc(p.code)} <span class="dx-muted" style="font-weight:400">· ${esc(p.desc)}</span></td><td class="dx-mono dx-td-mono">${esc(p.raw)}</td><td class="num">${nf(p.unit_wt, 1)}</td><td class="num" style="${raw[p.raw] > 0 ? "" : "color:var(--err)"}">${nf(raw[p.raw])}</td><td class="num">${nf(p.cut || 0)}</td><td class="num"><input class="dx-input dx-input-sm dx-mono" type="number" min="0" step="1" data-cutpc="${i}" value="${p.qty}" style="width:90px;text-align:right"></td></tr>`).join("")}</tbody></table></div><div class="dx-hint" style="margin-top:12px">${ic("box", 16)}<span>Total cutting this entry: <b class="dx-mono" data-cuttot></b></span></div>`
      : head + `<div class="dx-field"><label class="dx-label">Quantity (${esc(m.member_code)}) · max ${nf(avail)}<span class="dx-req">*</span></label><div class="dx-stepper dx-stepper-lg"><button type="button" data-sq="-1">${ic("minus", 16)}</button><input type="number" min="0" step="1" data-sq-in value="${Math.min(1, avail)}"><button type="button" data-sq="1">${ic("plus", 16)}</button></div><div class="dx-msg" data-sqmsg></div></div>`;
    const md = DX.openModal({ title: `Add ${stage} — ${m.member_code}`, sub: stage === "Cutting" ? "Enter pieces cut per sub-part. Raw plate is consumed per piece × (1 + wastage)." : stage === "Painting" ? "Painting posts the finished member (Nos + kg) into the finished store." : `${stage} can’t exceed the previous stage.`, wide: stage === "Cutting", body, foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Cancel</button><button class="dx-btn dx-btn-primary" data-smsave>${ic("check", 15)}Add ${stage.toLowerCase()}</button>` });
    const tot = () => { const pcs = [...md.querySelectorAll("[data-cutpc]")].map(i => +i.value || 0); const kg = m.parts.reduce((s, p, i) => s + p.unit_wt * pcs[i] * (1 + p.wastage / 100), 0); const t = md.querySelector("[data-cuttot]"); if (t) t.textContent = `${nf(pcs.reduce((a, b) => a + b, 0))} pcs · ${nf(kg, 1)} kg raw`; };
    tot();
    md.addEventListener("input", tot);
    md.addEventListener("click", e => { const b = e.target.closest("[data-sq]"); if (b) { const i = md.querySelector("[data-sq-in]"); i.value = Math.max(0, (+i.value || 0) + +b.dataset.sq); } });
    md.querySelector("[data-smsave]").addEventListener("click", () => {
      const team = md.querySelector('[data-sm="team"]').value, date = md.querySelector('[data-sm="date"]').value, remarks = md.querySelector('[data-sm="remarks"]').value;
      if (stage === "Cutting") {
        const pcs = [...md.querySelectorAll("[data-cutpc]")].map(i => Math.max(0, parseInt(i.value, 10) || 0));
        if (!pcs.some(Boolean)) return DX.toast("Enter at least one piece to cut.", "err");
        const need = {}; m.parts.forEach((p, i) => { need[p.raw] = (need[p.raw] || 0) + p.unit_wt * pcs[i] * (1 + p.wastage / 100); });
        const short = Object.entries(need).find(([r, kg]) => kg > (raw[r] || 0));
        if (short) return DX.toast(`Only ${nf(raw[short[0]] || 0)} kg ${esc(short[0])} in stock (${RAW_STORE}) — this cutting needs ${nf(short[1])} kg.`, "err");
        Object.entries(need).forEach(([r, kg]) => (raw[r] -= kg)); m.parts.forEach((p, i) => (p.cut = (p.cut || 0) + pcs[i]));
        LOG.unshift({ date, project: m.project, member: m.member_code, stage, qty: pcs.reduce((a, b) => a + b, 0), team, remarks: remarks || `Cut ${m.parts.map((p, i) => pcs[i] ? `${p.code}×${pcs[i]}` : "").filter(Boolean).join(", ")}; consumed ${nf(Object.values(need).reduce((a, b) => a + b, 0), 1)} kg` });
        DX.toast(`Cutting recorded · Material Issue from <span class="dx-mono">${RAW_STORE}</span>`);
      } else {
        const q = Math.max(0, parseInt(md.querySelector("[data-sq-in]").value, 10) || 0);
        if (!q) return DX.toast("Enter a quantity above 0.", "err");
        if (q > avail) { md.querySelector("[data-sqmsg]").textContent = `${stage} can’t exceed ${STAGES[idx - 1]} qty — only ${avail} available (you tried ${q}).`; md.querySelector("[data-sqmsg]").style.color = "var(--err)"; return; }
        m[KEY[stage]] = (m[KEY[stage]] || 0) + q;
        LOG.unshift({ date, project: m.project, member: m.member_code, stage, qty: q, team, remarks });
        DX.toast(stage === "Painting" ? `Painted ${q} Nos (${nf(mw(m) * q, 1)} kg) of finished ${esc(m.member_code)} added to ${FIN_STORE}` : `${stage} ×${q} recorded`);
      }
      DX.closeModal(); ctx.rerender();
    });
  }

  DX.register({
    key: "peb", title: "PEB Fabrication", short: "PEB", icon: "beam", hue: "violet", route: "/app/peb-fabrication-tracker",
    desc: "BOQ · cutting → painting pipeline", eyebrow: "PEB fabrication tracker",
    headline: `Cut, fit, weld, paint — track every <span class="dx-grad">member</span>`,
    intro: "One pipeline for every project: Cutting (per sub-part, consumes raw plate) → Fitting → Welding → Painting (posts the finished member to stock). Each stage can’t exceed the one before it.",
    docs: [project, member, wo], noRecent: true,
    heroActions: () => `<button class="dx-btn dx-btn-primary" data-go="peb/fab">${ic("flow", 15)}Open fabrication</button>`,
    kpis: () => { const ps = DX.rows(project), ms = DX.rows(member), ton = ms.reduce((s, m) => s + mw(m) * m.member_qty, 0) / 1000, paint = DX.sum(ms, "paint"), pmt = ms.reduce((s, m) => s + mw(m) * (m.paint || 0), 0) / 1000; return [
      { label: "Active projects", value: nf(ps.filter(p => p.status !== "Closed").length), sub: `<span class="dx-num">${ps.filter(p => p.status === "Closed").length}</span> closed`, icon: "building" },
      { label: "Total tonnage (BOQ)", value: nf(ton, 2), unit: "MT", sub: `<span class="dx-num">${ms.length}</span> members`, icon: "beam", tone: "cyan" },
      { label: "Finished stock", value: nf(paint), unit: "Nos", sub: `<span class="dx-num">${nf(pmt, 2)}</span> MT painted & in stock`, icon: "box", tone: "ok" },
      { label: "Members painted", value: nf(paint), sub: "finished so far", icon: "check" }
    ]; },
    panels: () => { const ms = DX.rows(member), tot = STAGES.map(s => ({ label: s, value: ms.reduce((n, m) => n + counts(m)[KEY[s]], 0) })); return [
      DX.card("Members by stage", DX.bars(tot, { unit: "members" }), { icon: "flow", tone: "cyan", sub: "cumulative, all projects" }),
      DX.card("Recent activity", LOG.slice(0, 8).map(l => `<div class="dx-feed-row"><span class="dx-tile${l.stage === "Painting" ? " dx-tile-ok" : ""}">${ic(l.stage === "Painting" ? "check" : "flow", 14)}</span><div class="dx-feed-main"><div class="dx-feed-title"><b class="dx-mono">${esc(l.member)}</b> → ${esc(l.stage)} ×${l.qty}</div><div class="dx-feed-sub">${esc(l.project)} · ${esc(l.team)}</div></div><div class="dx-feed-end"><span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(l.date)}</span></div></div>`).join("") || DX.empty("No progress yet", "Stage entries show up here."), { icon: "clock" })
    ]; },
    homeStat: () => ({ value: nf(DX.rows(member).reduce((s, m) => s + mw(m) * m.member_qty, 0) / 1000, 1), label: "MT in BOQ" }),
    attention: () => DX.rows(member).filter(m => { const c = counts(m); return c.cut > c.fit; }).slice(0, 4).map(m => ({ title: `${m.member_code} · ${m.project}`, sub: `${counts(m).cut - counts(m).fit} cut, waiting for fitting`, go: "peb/fab", tag: "Fitting due", tone: "iris" })),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "project" },
      { id: "projects", label: "Projects", icon: "building", type: "list", doc: "project", dateFilter: false, searchPh: "Search project or site…",
        columns: [{ f: "name", label: "Project", strong: true }, { f: "site", label: "Client site" }, { label: "Tonnage (MT)", type: "num", d: 2, get: p => members(p.name).reduce((s, m) => s + mw(m) * m.member_qty, 0) / 1000 }, { label: "Members", type: "num", get: p => members(p.name).length }, { label: "Painted", type: "mono", get: p => `${DX.sum(members(p.name), "paint")} / ${DX.sum(members(p.name), "member_qty")}` }, { label: "Status", type: "status", get: p => DX.statusOf(project, p) }] },
      { id: "boq", label: "BOQ", icon: "list", render: () => {
        const cur = projSel(), ms = members(cur);
        return projPicker(cur) + `<section class="dx-card dx-card-accent" style="margin-bottom:16px"><div class="dx-card-head"><span class="dx-tile">${ic("upload", 15)}</span><h3>Upload BOQ <span class="dx-sub">· .xlsx / .xls / .csv weight sheet</span></h3></div><div class="dx-card-body"><label class="dx-photo" style="aspect-ratio:auto;min-height:110px">${ic("upload", 24)}<span class="dx-photo-b">Drop the weight sheet here or tap to choose</span><span style="font-size:11.5px">Columns: Member, Part name, Length, Width, Qty, Thick, Density, Weight — raw plate is derived from thickness (PL{mm}-E250)</span><input type="file" accept=".xlsx,.xls,.csv" data-boqfile></label></div></section>` +
          DX.card(`${esc(cur)} · BOQ`, `<div class="dx-meta"><span><span class="dx-num">${ms.length}</span> members · <span class="dx-num">${ms.reduce((n, m) => n + m.parts.length, 0)}</span> parts · <span class="dx-num">${nf(ms.reduce((s, m) => s + mw(m) * m.member_qty, 0) / 1000, 2)}</span> MT</span><span class="dx-muted">Material IS 2062 E250</span></div>` + `<div class="dx-tablewrap"><table class="dx-table"><thead><tr><th>Member / part</th><th>Item</th><th>Raw material</th><th class="num">Qty</th><th class="num">Unit wt (kg)</th><th class="num">Total wt (kg)</th></tr></thead><tbody>${ms.map(m => `<tr style="background:var(--th-bg)"><td class="strong"><span class="dx-mono">${esc(m.member_code)}</span> — ${esc(TYPE(m.member_code))}</td><td></td><td></td><td class="num">${m.member_qty}</td><td class="num">${nf(mw(m), 1)}</td><td class="num">${nf(mw(m) * m.member_qty, 1)}</td></tr>${m.parts.map(p => `<tr><td style="padding-left:32px">${esc(p.desc)}</td><td class="dx-mono dx-td-mono">${esc(p.code)}</td><td class="dx-mono dx-td-mono">${esc(p.raw)} <span class="dx-muted">+${p.wastage}%</span></td><td class="num">${p.qty}</td><td class="num">${nf(p.unit_wt, 1)}</td><td class="num">${nf(p.unit_wt * p.qty, 1)}</td></tr>`).join("")}`).join("")}</tbody></table></div>`, { icon: "beam", tone: "cyan" });
      }, bind: ctx => { bindProj(ctx); ctx.on("change", e => { if (e.target.matches("[data-boqfile]") && e.target.files[0]) DX.toast(`Parsed <b>${esc(e.target.files[0].name)}</b> — in the live page this validates every raw item and imports members + parts.`); }); } },
      { id: "fab", label: "Fabrication", icon: "flow", render: () => {
        const cur = projSel(), ms = members(cur);
        return projPicker(cur) + (ms.map(m => { const c = counts(m), vals = [c.cut, c.fit, c.weld, c.paint], prev = [Infinity, c.cut, c.fit, c.weld];
          return `<section class="dx-card" style="margin-bottom:12px"><div class="dx-card-head"><span class="dx-tile dx-tile-cyan">${ic("beam", 15)}</span><h3><span class="dx-mono">${esc(m.member_code)}</span> — ${esc(TYPE(m.member_code))} <span class="dx-sub">· ${m.parts.length} parts · ${nf(mw(m), 1)} kg/member · target ${m.member_qty}</span></h3><span class="dx-badge dx-badge-cyan">${c.paint}/${m.member_qty} painted</span></div>
            <div class="dx-card-body"><div class="dx-stagebar" style="--n:4">${STAGES.map((s, i) => `<div class="dx-stage${vals[i] >= m.member_qty ? " full" : ""}"><div class="dx-stage-k">${s}</div><div class="dx-stage-v">${vals[i]}<small> / ${i ? prev[i] : m.member_qty}</small></div><div class="dx-bar"><i style="width:${Math.round(vals[i] / m.member_qty * 100)}%"></i></div><button class="dx-btn dx-btn-ghost dx-btn-sm" style="margin-top:6px;padding:0 6px" data-stage="${esc(m.name)}|${s}" ${i && vals[i] >= prev[i] ? "disabled" : ""}>${ic("plus", 13)}Add</button></div>`).join("")}</div>
            <div class="dx-tablewrap" style="margin-top:12px"><table class="dx-table"><thead><tr><th>Sub-part</th><th>Cut from</th><th class="num">Wt / member (kg)</th><th class="num">Cut (pcs)</th><th class="num">Company stock (kg)</th></tr></thead><tbody>${m.parts.map(p => `<tr><td><span class="dx-mono">${esc(p.code)}</span> · ${esc(p.desc)}</td><td class="dx-mono dx-td-mono">${esc(p.raw)} +${p.wastage}%</td><td class="num">${nf(p.unit_wt * p.qty, 1)}</td><td class="num">${nf(p.cut || 0)}</td><td class="num" style="${raw[p.raw] > 0 ? "" : "color:var(--err)"}">${nf(raw[p.raw])}</td></tr>`).join("")}</tbody></table></div></div></section>`; }).join("") || DX.empty("No members", "Upload the BOQ for this project first."));
      }, bind: ctx => { bindProj(ctx); ctx.on("click", e => { const b = e.target.closest("[data-stage]"); if (!b) return; const [id, s] = b.dataset.stage.split("|"); stageModal(DX.find(member, id), s, ctx); }); } },
      { id: "workorders", label: "Work orders", icon: "card", type: "list", doc: "wo", searchPh: "Search WO, client WO no., project…", columns: [{ f: "name", label: "Work order", type: "mono", strong: true }, { f: "client_wo_no", label: "Client WO no." }, { f: "project", label: "Project" }, { f: "date_received", label: "Date received", type: "date" }, { f: "contracted_weight_mt", label: "Weight (MT)", type: "num", d: 2 }, { label: "Status", type: "status", get: r => DX.statusOf(wo, r) }] },
      { id: "reports", label: "Reports", icon: "chart", group: "Insights", render: () => {
        DX.rows(member); const tab = DX.state.pebRep || "log";
        const rows = LOG.filter(l => (!DX.state.pebRepProj || l.project === DX.state.pebRepProj) && (!DX.state.pebRepStage || l.stage === DX.state.pebRepStage));
        const fin = DX.rows(member).filter(m => (m.paint || 0) > 0 && (!DX.state.pebRepProj || m.project === DX.state.pebRepProj));
        return `<div class="dx-toolbar"><div class="dx-seg" role="tablist">${[["log", "Stage log"], ["fin", "Finished items"]].map(([k, l]) => `<button type="button" data-peb-rtab="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div><div class="dx-seg">${[""].concat(DX.rows(project).map(p => p.name)).map(p => `<button type="button" data-peb-rproj="${esc(p)}" aria-pressed="${(DX.state.pebRepProj || "") === p}">${esc(p || "All projects")}</button>`).join("")}</div>${tab === "log" ? `<div class="dx-seg">${[""].concat(STAGES).map(s => `<button type="button" data-peb-rstage="${s}" aria-pressed="${(DX.state.pebRepStage || "") === s}">${s || "All stages"}</button>`).join("")}</div>` : ""}</div>` +
          (tab === "log" ? DX.card("Stage log", `<div class="dx-meta"><span><span class="dx-num">${rows.length}</span> entries</span><button class="dx-btn dx-btn-ghost dx-btn-sm" data-peb-csv>${ic("download", 14)}Export CSV</button></div>` + (rows.length ? DX.table([{ f: "date", label: "Date", type: "date" }, { f: "project", label: "Project" }, { f: "member", label: "Member", type: "mono" }, { f: "stage", label: "Stage" }, { f: "qty", label: "Qty", type: "num" }, { f: "team", label: "Team" }, { f: "remarks", label: "Remarks", trunc: true }], rows) : DX.empty("No entries", "Change the filters above.")), { icon: "list" })
            : DX.card("Finished items", `<div class="dx-meta"><span><span class="dx-num">${DX.sum(fin, "paint")}</span> Nos · <span class="dx-num">${nf(fin.reduce((s, m) => s + mw(m) * m.paint, 0), 1)}</span> kg total</span><span class="dx-muted dx-mono" style="font-size:11.5px">${FIN_STORE}</span></div>` + DX.table([{ f: "member_code", label: "Finished member", type: "mono", strong: true }, { f: "project", label: "Project" }, { f: "paint", label: "Qty (Nos)", type: "num", total: true }, { label: "Weight (kg)", type: "num", d: 1, get: m => mw(m) * m.paint }], fin, { foot: true }), { icon: "box", tone: "ok" }));
      }, bind: ctx => ctx.on("click", e => { const t = e.target.closest("[data-peb-rtab]"), p = e.target.closest("[data-peb-rproj]"), s = e.target.closest("[data-peb-rstage]"); if (t) DX.state.pebRep = t.dataset.pebRtab; if (p) DX.state.pebRepProj = p.dataset.pebRproj; if (s) DX.state.pebRepStage = s.dataset.pebRstage; if (t || p || s) return ctx.rerender(); if (e.target.closest("[data-peb-csv]")) DX.csv([{ f: "date", label: "Date" }, { f: "project", label: "Project" }, { f: "member", label: "Member" }, { f: "stage", label: "Stage" }, { f: "qty", label: "Qty" }, { f: "team", label: "Team" }, { f: "remarks", label: "Remarks" }], LOG, "peb-report.csv"); }) }
    ]
  });
})();
