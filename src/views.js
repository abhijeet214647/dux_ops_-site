/* DUX Ops Suite — generic screens shared by the desktop page and the /m app.
   An app has docs[] (one per DocType it manages) and screens[] (its nav). Screens point at a doc by key.
   ctx = { app, host, mode: "desk"|"mobile", go(route), chrome({crumbs,title,actions}) }
   Routes: app/screen · app/doc:new · app/doc:edit/<name> · app/doc:entry/<name> */
(function () {
  "use strict";
  const DX = window.DX, { esc, nf, ic } = DX;
  const V = (DX.views = {});
  const S = (DX.state = DX.state || {});
  const st = key => (S[key] = S[key] || { filters: {}, page: 0, reveal: false, masterTab: 0, masterQ: "" });

  /* ---------------------------------------------------------------- registry + store */
  DX.register = app => {
    app.docs = (app.docs || []).map(d => Object.assign(d, { app, id: d.store || app.key + "." + d.key }));
    DX.apps.push(app);
    return app;
  };
  DX.store = {};
  DX.rows = doc => {
    if (!DX.store[doc.id]) DX.store[doc.id] = { rows: doc.seed ? doc.seed() : [], seq: doc.seqStart || 1000 };
    return DX.store[doc.id].rows;
  };
  DX.find = (doc, name) => DX.rows(doc).find(r => r.name === name);
  DX.docOf = (app, k) => (k ? app.docs.find(d => d.key === k) : app.docs[0]);
  DX.entryRoute = (doc, r) => `${doc.app.key}/${doc.key}:entry/${encodeURIComponent(r.name)}`;
  DX.newRoute = doc => `${doc.app.key}/${doc.key}:new`;
  DX.editRoute = (doc, r) => `${doc.app.key}/${doc.key}:edit/${encodeURIComponent(r.name)}`;
  /* ---- live data layer: a doc with doc.api {load, get, save, submit, remove} talks to the ERP; without it, rows live in memory ---- */
  class ApiError extends Error { constructor(msg, fields, list) { super(msg); this.fields = fields || {}; if (list) this.list = list; } }
  DX.ApiError = ApiError;
  DX.htmlToText = s => { const el = document.createElement("div"); el.innerHTML = String(s == null ? "" : s).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr)>/gi, "\n"); return (el.textContent || "").replace(/\n{2,}/g, "\n").trim(); };
  DX.serverMessage = j => {
    const out = [];
    try { if (j && j._server_messages) JSON.parse(j._server_messages).forEach(m => { try { const o = JSON.parse(m); out.push(o.message || m); } catch (_) { out.push(m); } }); } catch (_) { /* unparseable */ }
    if (!out.length && j && j.exception) out.push(String(j.exception).replace(/^[\w.]+(Error|Exception):\s*/, ""));
    if (!out.length && j && j.message && typeof j.message === "string") out.push(j.message);
    return DX.htmlToText(out.join("\n")) || "Something went wrong — please try again.";
  };
  // POST /api/method/<method> with the session cookie + CSRF token (works in desk and in www pages)
  DX.call = async (method, args = {}, opts = {}) => {
    const body = new URLSearchParams();
    Object.entries(args).forEach(([k, v]) => { if (v === undefined) return; body.append(k, typeof v === "object" && v !== null ? JSON.stringify(v) : v); });
    const token = (window.frappe && frappe.csrf_token) || window.DX_CSRF || "";
    let res, j = {};
    try {
      res = await fetch("/api/method/" + method + (opts.get && String(body) ? "?" + body : ""), { method: opts.get ? "GET" : "POST", credentials: "same-origin", headers: Object.assign({ Accept: "application/json", "X-Frappe-CSRF-Token": token }, opts.get ? {} : { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }), body: opts.get ? undefined : body });
    } catch (e) { throw new ApiError("Can’t reach the server — check your connection."); }
    try { j = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (res.status === 403 && /login|session/i.test(JSON.stringify(j)) && DX.onAuthLost) DX.onAuthLost();
    if (!res.ok || j.exc || j.exception) { const msg = DX.serverMessage(j); const lines = msg.split("\n").filter(Boolean); throw new ApiError(msg, {}, lines.length > 1 ? lines : null); }
    return j.message;
  };
  DX.upload = async (file, opts = {}) => {
    const fd = new FormData();
    fd.append("file", file, opts.filename || file.name || "photo.jpg");
    fd.append("is_private", opts.isPrivate === false ? "0" : "1");
    fd.append("folder", "Home/Attachments");
    ["doctype", "docname", "fieldname"].forEach(k => { if (opts[k]) fd.append(k, opts[k]); });
    const res = await fetch("/api/method/upload_file", { method: "POST", body: fd, credentials: "same-origin", headers: { Accept: "application/json", "X-Frappe-CSRF-Token": (window.frappe && frappe.csrf_token) || window.DX_CSRF || "" } });
    let j = {}; try { j = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok || !j.message || !j.message.file_url) throw new ApiError(DX.serverMessage(j) || "Upload failed.");
    return j.message.file_url;
  };
  DX.live = DX.live || false;
  DX.ensure = async (doc, force) => {
    if (!doc.api || !doc.api.load) { DX.rows(doc); return; }
    const s = (DX.store[doc.id] = DX.store[doc.id] || { rows: [], seq: 0 });
    if (!force && s.loaded && Date.now() - s.loaded < (doc.api.ttl || 60000)) return;
    s.rows = (await doc.api.load()) || []; s.loaded = Date.now();
  };
  DX.invalidate = doc => { const s = DX.store[doc.id]; if (s) s.loaded = 0; doc._ver = (doc._ver || 0) + 1; };
  DX.getFull = async (doc, name) => {
    if (doc.api && doc.api.get) { const d = await doc.api.get(name); if (d) { const rows = DX.rows(doc), i = rows.findIndex(r => r.name === d.name); if (i >= 0) rows[i] = Object.assign(rows[i], d); } return d; }
    if (doc.api && doc.api.load) await DX.ensure(doc);
    return DX.find(doc, name);
  };
  DX.save = async (doc, d) => {
    if (DX.pending && DX.pending.size) await Promise.all([...DX.pending]);
    if (DX.live && Object.values(d).some(v => typeof v === "string" && v.startsWith("blob:"))) throw new ApiError("A photo didn’t upload — remove it and add it again.");
    if (doc.api && doc.api.save) { const saved = await doc.api.save(JSON.parse(JSON.stringify(d)), { isNew: !d.name }); DX.invalidate(doc); return saved; }
    return DX.saveLocal(doc, d);
  };
  DX.saveLocal = (doc, d) => {
    const rows = DX.rows(doc), store = DX.store[doc.id];
    const clean = JSON.parse(JSON.stringify(d)); delete clean._new;
    clean.modified = DX.TODAY + " " + new Date().toTimeString().slice(0, 5);
    if (!d.name) {
      clean.name = doc.naming ? doc.naming(clean, ++store.seq) : `${doc.prefix || "DOC"}-${++store.seq}`;
      if (rows.some(r => r.name === clean.name)) throw new Error(`An entry named “${clean.name}” already exists${doc.dupHint ? " — " + doc.dupHint : ""}.`);
      clean.docstatus = doc.autoSubmit ? 1 : 0; clean.owner = "you"; clean.creation = clean.modified;
      if (doc.onCreate) doc.onCreate(clean, store);
      rows.unshift(clean);
    } else {
      const i = rows.findIndex(r => r.name === d.name);
      if (rows[i].docstatus === 2 || (rows[i].docstatus === 1 && !doc.editSubmitted)) throw new Error(rows[i].docstatus === 2 ? "Cancelled entries cannot be edited." : "Submitted entries are locked and cannot be edited.");
      rows[i] = Object.assign(rows[i], clean);
      if (doc.onUpdate) doc.onUpdate(rows[i], store);
    }
    return DX.find(doc, clean.name);
  };
  DX.submit = async (doc, name) => {
    if (doc.api && doc.api.submit) { const r = await doc.api.submit(name); DX.invalidate(doc); return r || { name }; }
    const d = DX.find(doc, name);
    const problems = doc.submitProblems ? doc.submitProblems(d) : [];
    if (problems.length) throw Object.assign(new Error(problems.join("\n")), { list: problems });
    d.docstatus = 1;
    if (doc.onSubmit) doc.onSubmit(d, DX.store[doc.id]);
    return d;
  };
  DX.remove = async (doc, name) => { if (doc.api && doc.api.remove) { await doc.api.remove(name); DX.invalidate(doc); } const rows = DX.rows(doc), i = rows.findIndex(r => r.name === name); if (i >= 0) rows.splice(i, 1); };
  const title = (doc, r) => (doc.entity.title ? doc.entity.title(r) : r.name);
  const sub = (doc, r) => (doc.entity.sub ? doc.entity.sub(r) : "");
  const dateOf = (doc, r) => r[doc.entity.date || "date"];
  DX.titleOf = title; DX.subOf = sub; DX.dateOf = dateOf;
  DX.statusOf = (doc, row) => { const s = doc.status ? doc.status(row) : row.docstatus === 2 ? ["Cancelled", "err"] : row.docstatus === 1 ? ["Submitted", "ok"] : ["Draft", ""]; return s ? DX.status(s[0], s[1]) : ""; };
  DX.statusKey = (doc, r) => (doc.statusKey ? doc.statusKey(r) : r.docstatus === 2 ? "cancelled" : r.docstatus === 1 ? "submitted" : "draft");
  DX.canSubmit = doc => !!doc.onSubmit && doc.submittable !== false && !doc.autoSubmit;

  /* ---------------------------------------------------------------- helpers */
  V.skeleton = host => { host.innerHTML = `<div class="dx-card"><div class="dx-card-body" style="display:grid;gap:14px">${[92, 74, 56, 92].map(w => `<div class="dx-skel" style="width:${w}%"></div>`).join("")}</div></div>`; };
  const newBtn = (V.newBtn = (doc, cls = "") => doc && doc.form && doc.canCreate !== false ? `<button class="dx-btn dx-btn-primary ${cls}" data-go="${DX.newRoute(doc)}">${ic("plus", 15)}${esc(doc.newLabel || "New " + doc.entity.singular.toLowerCase())}</button>` : "");
  const crumbApp = app => ({ label: app.title, go: app.key + "/" + app.screens[0].id });
  const screenFor = (app, type, docKey) => app.screens.find(s => s.type === type && (!docKey || (s.doc || app.docs[0].key) === docKey));
  const recentRows = (doc, n = 7) => DX.rows(doc).slice().sort((a, b) => String(dateOf(doc, b) || "").localeCompare(String(dateOf(doc, a) || "")) || String(b.name).localeCompare(String(a.name))).slice(0, n);
  V.recentList = (doc, n = 7) => recentRows(doc, n).map(r => `<button class="dx-lrow" data-go="${esc(DX.entryRoute(doc, r))}"><div class="dx-lrow-main"><div class="dx-lrow-title">${esc(title(doc, r))}</div><div class="dx-lrow-sub">${esc(sub(doc, r))}</div></div><div class="dx-lrow-end">${DX.statusOf(doc, r)}<span class="dx-mono dx-muted" style="font-size:11.5px">${DX.fmtDate(dateOf(doc, r))}</span></div></button>`).join("") || DX.empty("No entries yet", "Create the first entry to see it here.");

  /* ---------------------------------------------------------------- dashboard */
  V.dashboard = (ctx, screen) => {
    const { app } = ctx, doc = DX.docOf(app, screen.doc);
    ctx.chrome({ crumbs: [{ label: app.title }], title: screen.title || "Dashboard", actions: newBtn(doc, "dx-hide-m") });
    const k = app.kpis ? app.kpis(ctx) : [];
    const panels = app.panels ? app.panels(ctx) : [];
    const listScreen = screenFor(app, "list", doc.key), rep = app.screens.find(s => s.type === "report");
    ctx.host.innerHTML = `
      <section class="dx-hero"><div><div class="dx-eyebrow">${esc(app.eyebrow || app.title)}</div><h1>${app.headline || esc(app.title)}</h1>${app.intro ? `<p>${app.intro}</p>` : ""}</div>
        <div class="dx-hero-actions">${(app.heroActions ? app.heroActions(ctx) : newBtn(doc))}${rep ? `<button class="dx-btn dx-btn-secondary" data-go="${app.key}/${rep.id}">${ic("chart", 15)}${esc(rep.label)}</button>` : ""}</div></section>
      ${k.length ? `<section class="dx-kpis" style="grid-template-columns:repeat(${Math.min(4, k.length)},minmax(0,1fr))">${k.map(DX.kpi).join("")}</section>` : ""}
      <section class="dx-cols">${panels[0] || ""}
        ${app.noRecent ? (panels[1] || "") : DX.card(screen.recentTitle || "Recent " + doc.entity.plural.toLowerCase(), V.recentList(doc), { icon: "clock", action: listScreen ? `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="${app.key}/${listScreen.id}">View all${ic("right", 13)}</button>` : "" })}
      </section>
      ${panels.slice(app.noRecent ? 2 : 1).join("")}`;
    if (app.bindDashboard) app.bindDashboard(ctx);
  };

  /* ---------------------------------------------------------------- list */
  const PAGE = 20;
  V.list = (ctx, screen) => {
    const { app } = ctx, doc = DX.docOf(app, screen.doc), s = st(app.key + ":" + screen.id), f = s.filters;
    ctx.chrome({ crumbs: [crumbApp(app), { label: screen.label }], title: screen.title || screen.label, actions: newBtn(doc, "dx-hide-m") });
    const remote = !!(doc.api && doc.api.query && !screen.rows);
    const base = remote ? [] : screen.rows ? screen.rows(DX.rows(doc)) : DX.rows(doc);
    const statuses = screen.statuses || doc.statusFilter || (doc.onSubmit ? [["", "All"], ["draft", "Draft"], ["submitted", "Submitted"]] : []);
    const skey = screen.statusKey || (r => DX.statusKey(doc, r));
    const rc = remote ? (s.rcounts || (doc.api.counts && doc.api.counts()) || null) : null;
    const counts = Object.fromEntries(statuses.map(([v]) => [v, remote ? (rc && rc[v || "all"] != null ? rc[v || "all"] : "") : v ? base.filter(r => skey(r) === v).length : base.length]));
    const filters = screen.filters || [];
    ctx.host.innerHTML = `
      ${screen.banner ? screen.banner(ctx) : ""}
      <div class="dx-toolbar">
        <label class="dx-search">${ic("search", 16)}<input data-q type="search" placeholder="${esc(screen.searchPh || "Search…")}" value="${esc(f.q || "")}" aria-label="Search"></label>
        ${statuses.length ? `<div class="dx-seg" role="group" aria-label="Status">${statuses.map(([v, l]) => `<button type="button" data-lstatus="${esc(v)}" aria-pressed="${(f.status || "") === v}">${esc(l)}${counts[v] !== "" ? `<span class="dx-mono">${counts[v]}</span>` : ""}</button>`).join("")}</div>` : ""}
      </div>
      ${filters.length || screen.dateFilter !== false ? `<div class="dx-filters">${filters.map(x => `<div class="dx-field"><span class="dx-label">${esc(x.label)}</span><button type="button" class="dx-combo" data-lfilter="${x.f}" aria-expanded="false"><span class="dx-combo-val ${f[x.f] ? "" : "ph"}">${esc(f[x.f] ? (x.display ? x.display(f[x.f]) : f[x.f]) : "All")}</span>${ic("down", 16)}</button></div>`).join("")}
        ${screen.dateFilter !== false ? `<label class="dx-field"><span class="dx-label">From date</span><input class="dx-input" type="date" data-ldate="from" value="${esc(f.from || "")}"></label><label class="dx-field"><span class="dx-label">To date</span><input class="dx-input" type="date" data-ldate="to" value="${esc(f.to || "")}"></label>` : ""}</div>` : ""}
      <div class="dx-card" data-results></div>`;
    let rseq = 0;
    const draw = () => {
      const q = String(f.q || "").toLowerCase().trim();
      if (remote) {
        const params = { q: String(f.q || "").trim(), status: f.status || "", filters: Object.fromEntries(filters.map(x => [x.f, f[x.f] || ""])), from: f.from || "", to: f.to || "", start: s.page * PAGE, limit: PAGE };
        const key = JSON.stringify(params) + "#" + (doc._ver || 0);
        if (s.rkey !== key || !s.rrows) {
          const my = ++rseq, box = ctx.host.querySelector("[data-results]");
          box.innerHTML = `<div class="dx-card-body" style="display:grid;gap:12px">${[88, 70, 80].map(w => `<div class="dx-skel" style="width:${w}%"></div>`).join("")}</div>`;
          doc.api.query(params).then(res => { if (my !== rseq || !box.isConnected) return; s.rkey = key; s.rrows = res.rows || []; s.rtotal = res.total != null ? res.total : s.rrows.length; if (res.counts) s.rcounts = res.counts; draw(); }, err => { if (my !== rseq || !box.isConnected) return; box.innerHTML = DX.empty("Couldn’t load entries", esc(err.message), `<button class="dx-btn dx-btn-secondary dx-btn-sm" data-lretry>Try again</button>`); });
          return;
        }
      }
      const rows = remote ? s.rrows : base.filter(r => (!f.status || skey(r) === f.status) && filters.every(x => !f[x.f] || (x.get ? x.get(r) : r[x.f]) === f[x.f]) &&
        (!f.from || String(dateOf(doc, r)) >= f.from) && (!f.to || String(dateOf(doc, r)) <= f.to) &&
        (!q || (screen.search || [r2 => r2.name, r2 => title(doc, r2), r2 => sub(doc, r2)]).map(fn => (typeof fn === "function" ? fn(r) : r[fn]) || "").join(" ").toLowerCase().includes(q)))
        .sort((a, b) => String(dateOf(doc, b) || "").localeCompare(String(dateOf(doc, a) || "")) || String(b.name).localeCompare(String(a.name)));
      s.visible = rows;
      const pills = [];
      if (f.status) pills.push(DX.pill("filter", "Status", (statuses.find(x => x[0] === f.status) || [0, f.status])[1], "status", "iris"));
      filters.forEach(x => { if (f[x.f]) pills.push(DX.pill(x.icon || "layers", x.label, x.display ? x.display(f[x.f]) : f[x.f], x.f, "cyan")); });
      if (f.from || f.to) pills.push(DX.pill("calendar", "Date", `${f.from ? DX.fmtDate(f.from) : "…"} → ${f.to ? DX.fmtDate(f.to) : "…"}`, "date", "pending", true));
      if (f.q) pills.push(DX.pill("search", "Search", `“${f.q}”`, "q"));
      const total = remote ? s.rtotal : rows.length;
      const pages = Math.max(1, Math.ceil(total / PAGE)); if (!remote) s.page = Math.min(s.page, pages - 1);
      const slice = remote ? rows : rows.slice(s.page * PAGE, s.page * PAGE + PAGE);
      const sum = screen.sum ? screen.sum(rows) : "";
      const plural = doc.entity.plural.toLowerCase(), singular = doc.entity.singular.toLowerCase();
      ctx.host.querySelector("[data-results]").innerHTML = `
        <div class="dx-filterbar"><div class="dx-eyebrow dx-filterbar-label">${ic("filter", 13)}Showing results for</div><div class="dx-pills">${pills.join("") || `<span class="dx-pill"><span class="dx-tile">${ic("list", 13)}</span><span class="dx-pill-v">All ${esc(plural)}</span></span>`}${pills.length ? `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-lclear>Clear all</button>` : ""}</div></div>
        <div class="dx-meta"><span>Found <span class="dx-num">${nf(total)}</span> ${esc(total === 1 ? singular : plural)}${sum ? " · " + sum : ""}</span><button class="dx-btn dx-btn-ghost dx-btn-sm" data-lcsv ${rows.length ? "" : "disabled"}>${ic("download", 14)}Export CSV</button></div>
        ${rows.length ? `<div class="dx-swap">${DX.table(screen.columns, slice, { go: r => DX.entryRoute(doc, r) })}</div>
          <div class="dx-cards">${slice.map(r => `<button class="dx-ecard" data-go="${esc(DX.entryRoute(doc, r))}"><div class="dx-ecard-top"><div style="min-width:0"><div class="dx-ecard-name">${esc(title(doc, r))}</div><div class="dx-ecard-sub">${esc(sub(doc, r))}</div></div>${DX.statusOf(doc, r)}</div><div class="dx-ecard-foot">${(screen.cardFoot ? screen.cardFoot(r) : [`<span class="dx-mono">${DX.fmtDate(dateOf(doc, r))}</span>`]).join("")}</div></button>`).join("")}</div>
          <div class="dx-pager"><span><span class="dx-mono">${s.page * PAGE + 1}–${Math.min(total, s.page * PAGE + PAGE)}</span> of <span class="dx-mono">${nf(total)}</span></span><div class="dx-pager-btns"><button class="dx-ibtn" data-lpage="-1" aria-label="Previous page" ${s.page ? "" : "disabled"}>${ic("chevron", 15)}</button><button class="dx-ibtn" data-lpage="1" aria-label="Next page" ${s.page < pages - 1 ? "" : "disabled"}>${ic("right", 15)}</button></div></div>`
          : DX.empty(pills.length ? "Nothing matches these filters" : "No entries yet", pills.length ? "Remove a filter pill above or try a different search." : "Entries you create show up here.", pills.length ? `<button class="dx-btn dx-btn-secondary dx-btn-sm" data-lclear>Clear filters</button>` : newBtn(doc, "dx-btn-sm"))}`;
    };
    draw();
    const qi = ctx.host.querySelector("[data-q]"); let t;
    qi.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.q = qi.value; s.page = 0; draw(); }, 150); });
    ctx.on("change", e => { const d = e.target.closest("[data-ldate]"); if (d) { f[d.dataset.ldate] = d.value; s.page = 0; draw(); } });
    ctx.on("click", e => {
      const t2 = e.target;
      const b = t2.closest("[data-lstatus]"); if (b) { f.status = b.dataset.lstatus; s.page = 0; ctx.host.querySelectorAll("[data-lstatus]").forEach(x => x.setAttribute("aria-pressed", x === b)); return draw(); }
      const fl = t2.closest("[data-lfilter]");
      if (fl) { const x = filters.find(y => y.f === fl.dataset.lfilter); const o = DX.opts(typeof x.options === "function" ? x.options(f) : x.options); o.allowClear = true; return DX.Combo.open(fl, { title: "Filter by " + x.label.toLowerCase(), value: f[x.f], options: o, onPick: v => { f[x.f] = v; (x.clears || []).forEach(c => (f[c] = "")); s.page = 0; V.list(ctx.fresh(), screen); } }); }
      const un = t2.closest("[data-unpill]"); if (un) { const k = un.dataset.unpill; if (k === "date") f.from = f.to = ""; else f[k] = ""; filters.filter(x => x.f === k).forEach(x => (x.clears || []).forEach(c => (f[c] = ""))); s.page = 0; return V.list(ctx.fresh(), screen); }
      if (t2.closest("[data-lclear]")) { s.filters = {}; s.page = 0; return V.list(ctx.fresh(), screen); }
      if (t2.closest("[data-lretry]")) { s.rkey = ""; return draw(); }
      if (t2.closest("[data-lcsv]")) return DX.csv(screen.csv || screen.columns, s.visible || [], `${app.key}-${screen.id}.csv`);
      const pg = t2.closest("[data-lpage]"); if (pg) { s.page += +pg.dataset.lpage; draw(); ctx.host.querySelector("[data-results]").scrollIntoView({ block: "start", behavior: "smooth" }); }
    });
  };

  /* ---------------------------------------------------------------- form */
  V.form = async (ctx, doc, name) => {
    const { app } = ctx;
    let d = DX.blank(doc), mode = "new";
    if (name) { const x = await DX.getFull(doc, name); if (!x) throw new Error("Entry not found."); if (x.docstatus === 2 || (x.docstatus === 1 && !doc.editSubmitted)) return ctx.go(DX.entryRoute(doc, x)); d = JSON.parse(JSON.stringify(x)); mode = "edit"; }
    else if (doc.defaults) Object.assign(d, doc.defaults());
    ctx.chrome({ crumbs: [crumbApp(app), ...(name ? [{ label: name, go: DX.entryRoute(doc, d) }, { label: "Edit" }] : [{ label: doc.newLabel || "New " + doc.entity.singular.toLowerCase() }])], title: name ? "Edit " + doc.entity.singular.toLowerCase() : (doc.newTitle || "New " + doc.entity.singular.toLowerCase()), actions: "" });
    const canSubmit = DX.canSubmit(doc);
    ctx.host.innerHTML = (doc.formBanner ? doc.formBanner(d) : "") + DX.formHTML(doc, d, mode) + `<div class="dx-actionbar"><div class="dx-actionbar-note" data-note></div><button type="button" class="dx-btn dx-btn-ghost dx-hide-sm" data-fcancel>Cancel</button><button type="button" class="dx-btn ${canSubmit ? "dx-btn-secondary" : "dx-btn-primary"}" data-fsave>${ic("check", 15)}${esc(doc.saveLabel || (canSubmit ? "Save draft" : "Save"))}</button>${canSubmit ? `<button type="button" class="dx-btn dx-btn-primary" data-fsubmit>${ic("lock", 15)}${esc(doc.submitLabel || "Save & submit")}</button>` : ""}</div>`;
    const F = DX.formCtl(doc, d, mode, ctx.host);
    ctx.form = F;
    F.onPaint = () => { const n = ctx.host.querySelector("[data-note]"); if (n) n.innerHTML = doc.formNote ? doc.formNote(d) : (mode === "edit" ? `Editing <b>${esc(d.name)}</b>` : `New ${esc(doc.entity.singular.toLowerCase())}`); };
    F.onPaint();
    const save = async submit => {
      const errs = DX.validate(doc, d, submit);
      if (Object.keys(errs).length) return F.showErrors(errs);
      if (submit && !(await V.confirmSubmit(doc, d))) return;
      if (!submit && doc.confirmSave && !(await doc.confirmSave(d))) return;
      let saved;
      busy(true);
      try { saved = await DX.save(doc, d); } catch (e) { busy(false); if (e.fields && Object.keys(e.fields).length) return F.showErrors(e.fields); if (doc.dupField && /already exists|duplicate/i.test(e.message)) { return F.showErrors({ [doc.dupField]: e.message }); } return e.list ? V.showProblems(e, "Couldn’t save") : DX.toast(esc(e.message), "err"); }
      F.dirty = false; ctx.form = null;
      if (submit) { try { const r = await DX.submit(doc, saved.name); DX.toast(doc.submitToast ? doc.submitToast(Object.assign({}, saved, r || {})) : `Submitted · <span class="dx-mono">${esc(saved.name)}</span>`); } catch (e) { DX.toast(`Saved as draft · ${esc(saved.name)}`); V.showProblems(e); } }
      else DX.toast(doc.saveToast ? doc.saveToast(saved) : `${canSubmit ? "Draft saved" : "Saved"} · <span class="dx-mono">${esc(saved.name)}</span>`);
      ctx.go(doc.afterSave ? doc.afterSave(saved) : DX.entryRoute(doc, saved));
    };
    const busy = on => ctx.host.querySelectorAll(".dx-actionbar .dx-btn").forEach(b => { b.disabled = on; if (on && b.matches("[data-fsave],[data-fsubmit]")) { b.dataset.label = b.innerHTML; b.innerHTML = ic("refresh", 15) + "Saving…"; } else if (!on && b.dataset.label) b.innerHTML = b.dataset.label; });
    ctx.host.querySelector("[data-fsave]").addEventListener("click", () => save(false));
    const sb = ctx.host.querySelector("[data-fsubmit]"); if (sb) sb.addEventListener("click", () => save(true));
    ctx.host.querySelector("[data-fcancel]").addEventListener("click", () => ctx.go(name ? DX.entryRoute(doc, d) : ctx.back()));
  };
  V.showProblems = (e, t) => { if (e.list) DX.openModal({ title: t || "Couldn’t submit yet", body: `<div class="dx-issue">${e.list.map(p => `<div class="dx-issue-row" style="color:var(--err)"><span>${esc(p)}</span></div>`).join("")}</div>`, foot: `<button class="dx-btn dx-btn-secondary" data-modal-x>Close</button>` }); else DX.toast(esc(e.message), "err"); };
  V.confirmSubmit = (doc, d) => {
    const problems = doc.submitProblems ? doc.submitProblems(d) : [];
    const lines = doc.submitLines ? doc.submitLines(d) : [];
    return DX.confirm({
      title: problems.length ? "Can’t submit yet" : (doc.submitTitle || "Submit this entry?"), noOk: problems.length > 0, ok: doc.submitOk || "Submit",
      sub: problems.length ? "Fix these first — the entry stays a draft." : (doc.submitSub || "Submitting locks the entry. It can’t be edited afterwards."),
      body: `${problems.length ? `<div class="dx-issue" style="margin-bottom:12px">${problems.map(p => `<div class="dx-issue-row" style="color:var(--err)"><span>${esc(p)}</span></div>`).join("")}</div>` : ""}${lines.length ? `${doc.submitLinesTitle ? `<div class="dx-eyebrow" style="margin-bottom:8px">${esc(doc.submitLinesTitle)}</div>` : ""}<div class="dx-issue">${lines.map(([k, v]) => `<div class="dx-issue-row"><span>${esc(k)}</span><span class="dx-num">${v}</span></div>`).join("")}</div>` : ""}${doc.submitNote ? `<p class="dx-muted" style="font-size:12.5px;margin-top:10px">${doc.submitNote(d)}</p>` : ""}`
    });
  };

  /* ---------------------------------------------------------------- detail */
  V.detail = async (ctx, doc, name) => {
    const { app } = ctx, d = await DX.getFull(doc, name);
    if (!d) throw new Error(`${doc.entity.singular} “${name}” not found.`);
    const locked = d.docstatus === 2 || (d.docstatus === 1 && !doc.editSubmitted);  // a cancelled record is never editable
    const canSubmit = d.docstatus === 0 && DX.canSubmit(doc);
    const canEdit = !locked && doc.form && doc.canEdit !== false;
    ctx.chrome({ crumbs: [crumbApp(app), { label: doc.entity.plural, go: (screenFor(app, "list", doc.key) ? app.key + "/" + screenFor(app, "list", doc.key).id : null) }, { label: d.name }], title: title(doc, d), actions: canEdit ? `<button class="dx-btn dx-btn-secondary dx-hide-m" data-go="${DX.editRoute(doc, d)}">${ic("edit", 15)}Edit</button>` : "" });
    const acts = (doc.detailActions ? doc.detailActions(d) : []).filter(Boolean);
    ctx.host.innerHTML = `
      <section class="dx-card dx-card-accent">
        ${doc.lockBanner && d.docstatus === 1 ? `<div class="dx-lock">${ic("lock", 16)}<span>${doc.lockBanner(d)}</span></div>` : ""}
        <div class="dx-dhead"><div class="dx-dhead-main"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="dx-eyebrow">${esc(doc.doctype || doc.entity.singular)}</span>${DX.statusOf(doc, d)}<span class="dx-mono dx-muted" style="font-size:11.5px">${esc(d.name)}</span></div>
          <h2>${esc(title(doc, d))}</h2><div class="dx-dhead-meta">${dateOf(doc, d) ? `<span>${ic("calendar", 14)}<span class="dx-mono">${DX.fmtDate(dateOf(doc, d))}</span></span>` : ""}${sub(doc, d) ? `<span>${ic("pin", 14)}${esc(sub(doc, d))}</span>` : ""}</div></div>
          <div class="dx-dhead-actions">${canEdit ? `<button class="dx-btn dx-btn-secondary" data-go="${DX.editRoute(doc, d)}">${ic("edit", 15)}Edit</button>` : ""}${acts.map((a, i) => `<button class="dx-btn dx-btn-${a.tone || "secondary"}" data-dact="${i}">${ic(a.icon || "check", 15)}${esc(a.label)}</button>`).join("")}${canSubmit ? `<button class="dx-btn dx-btn-primary" data-dsubmit>${ic("lock", 15)}${esc(doc.submitBtn || "Submit")}</button>` : ""}</div></div>
      </section>
      ${doc.detailExtra ? doc.detailExtra(d) : ""}
      <div class="dx-dgrid">${doc.form ? DX.detailHTML(doc, d) : ""}</div>`;
    ctx.on("click", async e => {
      const ph = e.target.closest("[data-lbv]"); if (ph) return DX.lightbox(ph.dataset.lbv, ph.dataset.lbl, ph.dataset.lbi);
      const a = e.target.closest("[data-dact]"); if (a) { let r; try { r = await acts[+a.dataset.dact].run(d, ctx); } catch (err) { return V.showProblems(err, "Couldn’t complete that"); } if (r !== false) { DX.invalidate(doc); ctx.rerender(); } return; }
      if (e.target.closest("[data-dsubmit]")) {
        const errs = DX.validate(doc, d, true);
        if (Object.keys(errs).length) return V.showProblems({ list: Object.values(errs) }, "Complete the entry before submitting");
        if (!(await V.confirmSubmit(doc, d))) return;
        const btn = e.target.closest("[data-dsubmit]"); btn.disabled = true; btn.innerHTML = ic("refresh", 15) + "Submitting…";
        try { const r = await DX.submit(doc, d.name); DX.toast(doc.submitToast ? doc.submitToast(Object.assign({}, d, r || {})) : `Submitted · <span class="dx-mono">${esc(d.name)}</span>`); ctx.rerender(); } catch (err) { btn.disabled = false; btn.innerHTML = ic("lock", 15) + esc(doc.submitBtn || "Submit"); V.showProblems(err); }
      }
    });
    if (doc.bindDetail) doc.bindDetail(d, ctx);
  };

  /* ---------------------------------------------------------------- report */
  // report filters live in DX.state so a remote screen.load(ctx) can read them before the first paint
  V.reportFilters = (app, screen) => { const s = st(app.key + ":" + screen.id); if (!s.init) { s.filters = Object.assign({ from: screen.monthDefault ? DX.monthStart() : DX.addDays(DX.TODAY, -(screen.days || 30)), to: screen.monthDefault ? DX.monthEnd() : DX.TODAY }, screen.defaults || {}); s.init = 1; } return s.filters; };
  V.report = (ctx, screen) => {
    const { app } = ctx, doc = DX.docOf(app, screen.doc), s = st(app.key + ":" + screen.id);
    V.reportFilters(app, screen);
    const redraw = () => (screen.remote ? ctx.rerender() : V.report(ctx.fresh(), screen));
    const f = s.filters, dk = screen.date || doc.entity.date || "date";
    ctx.chrome({ crumbs: [crumbApp(app), { label: screen.label }], title: screen.title || screen.label, actions: "" });
    const all = screen.rows ? screen.rows(DX.rows(doc), f) : DX.rows(doc);
    const rows = all.filter(r => (!f.from || String(r[dk]) >= f.from) && (!f.to || String(r[dk]) <= f.to) && (screen.filters || []).every(x => x.remote || !f[x.f] || (x.get ? x.get(r) : r[x.f]) === f[x.f]))
      .sort((a, b) => String(b[dk]).localeCompare(String(a[dk])));
    s.visible = rows;
    const k = screen.kpis ? screen.kpis(rows) : [];
    ctx.host.innerHTML = `
      ${screen.tabs ? `<div class="dx-toolbar"><div class="dx-seg" role="tablist">${screen.tabs.map(t => `<button type="button" data-go="${app.key}/${t.id}" aria-pressed="${t.id === screen.id}">${esc(t.label)}</button>`).join("")}</div></div>` : ""}
      <div class="dx-filters">
        <label class="dx-field"><span class="dx-label">From date</span><input class="dx-input" type="date" data-rdate="from" value="${esc(f.from || "")}"></label>
        <label class="dx-field"><span class="dx-label">To date</span><input class="dx-input" type="date" data-rdate="to" value="${esc(f.to || "")}"></label>
        ${(screen.filters || []).map(x => `<div class="dx-field"><span class="dx-label">${esc(x.label)}</span><button type="button" class="dx-combo" data-rfilter="${x.f}" aria-expanded="false"><span class="dx-combo-val ${f[x.f] ? "" : "ph"}">${esc(f[x.f] ? (x.display ? x.display(f[x.f]) : f[x.f]) : "All")}</span>${ic("down", 16)}</button></div>`).join("")}
      </div>
      ${k.length ? `<section class="dx-kpis" style="grid-template-columns:repeat(${Math.min(4, k.length)},minmax(0,1fr))">${k.map(DX.kpi).join("")}</section>` : ""}
      ${screen.before ? screen.before(rows) : ""}
      <section class="dx-card">
        <div class="dx-filterbar"><div class="dx-eyebrow dx-filterbar-label">${ic("filter", 13)}Showing results for</div><div class="dx-pills">${DX.pill("calendar", "Date", `${f.from ? DX.fmtDate(f.from) : "…"} → ${f.to ? DX.fmtDate(f.to) : "…"}`, "", "pending", true)}${(screen.filters || []).filter(x => f[x.f]).map(x => DX.pill(x.icon || "layers", x.label, x.display ? x.display(f[x.f]) : f[x.f], x.f, "cyan")).join("")}</div></div>
        <div class="dx-meta"><span>Found <span class="dx-num">${nf(rows.length)}</span> ${rows.length === 1 ? "row" : "rows"}${screen.sum ? " · " + screen.sum(rows) : ""}</span><span style="display:flex;gap:6px">${screen.masked ? `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-rreveal>${ic(s.reveal ? "eyeoff" : "eye", 14)}${s.reveal ? "Mask IDs" : "Show full IDs"}</button>` : ""}<button class="dx-btn dx-btn-ghost dx-btn-sm" data-rcsv ${rows.length ? "" : "disabled"}>${ic("download", 14)}Export CSV</button></span></div>
        ${rows.length ? DX.table(screen.columns.map(c => (c.type === "mask" && s.reveal ? Object.assign({}, c, { type: "mono" }) : c)), rows, { go: screen.noLink ? null : r => DX.entryRoute(doc, r), foot: screen.columns.some(c => c.total), maxh: "62vh" }) : DX.empty("No rows in this range", "Widen the dates or remove a filter.")}
      </section>${screen.after ? screen.after(rows) : ""}`;
    ctx.on("change", e => { const d = e.target.closest("[data-rdate]"); if (d) { f[d.dataset.rdate] = d.value; redraw(); } });
    ctx.on("click", e => {
      const fl = e.target.closest("[data-rfilter]");
      if (fl) { const x = screen.filters.find(y => y.f === fl.dataset.rfilter); const o = DX.opts(typeof x.options === "function" ? x.options(f) : x.options); o.allowClear = true; return DX.Combo.open(fl, { title: x.label, value: f[x.f], options: o, onPick: v => { f[x.f] = v; (x.clears || []).forEach(c => (f[c] = "")); (x.remote ? redraw : () => V.report(ctx.fresh(), screen))(); } }); }
      const un = e.target.closest("[data-unpill]"); if (un) { f[un.dataset.unpill] = ""; const x = (screen.filters || []).find(y => y.f === un.dataset.unpill); return x && x.remote ? redraw() : V.report(ctx.fresh(), screen); }
      if (e.target.closest("[data-rreveal]")) { s.reveal = !s.reveal; return V.report(ctx.fresh(), screen); }
      if (e.target.closest("[data-rcsv]")) DX.csv(screen.columns, s.visible, `${app.key}-${screen.id}.csv`);
    });
  };

  /* ---------------------------------------------------------------- masters */
  V.masters = (ctx, screen) => {
    const { app } = ctx, s = st(app.key + ":" + screen.id);
    const tabs = screen.tabs, tab = tabs[s.masterTab] || tabs[0];
    const tdoc = tab.doc ? DX.docOf(app, tab.doc) : null;
    ctx.chrome({ crumbs: [crumbApp(app), { label: screen.label }], title: screen.title || screen.label, actions: "" });
    const q = (s.masterQ || "").toLowerCase().trim();
    const all = tdoc ? DX.rows(tdoc) : tab.rows();
    const rows = all.filter(r => !q || tab.columns.map(c => (c.get ? c.get(r) : r[c.f]) || "").join(" ").toLowerCase().includes(q));
    ctx.host.innerHTML = `
      <div class="dx-toolbar"><div class="dx-seg" role="tablist" aria-label="Master lists">${tabs.map((t, i) => `<button type="button" role="tab" data-mtab="${i}" aria-pressed="${t === tab}">${esc(t.label)}<span class="dx-mono">${(t.doc ? DX.rows(DX.docOf(app, t.doc)) : t.rows()).length}</span></button>`).join("")}</div>
        <label class="dx-search" style="flex:1 1 220px">${ic("search", 16)}<input data-mq type="search" placeholder="Search ${esc(tab.label.toLowerCase())}…" value="${esc(s.masterQ || "")}" aria-label="Search"></label>${tdoc && tdoc.form ? newBtn(tdoc) : ""}</div>
      <section class="dx-card"><div class="dx-meta"><span>Showing <span class="dx-num">${rows.length}</span> ${esc(tab.label.toLowerCase())}</span><span class="dx-muted dx-mono" style="font-size:11.5px">${esc(tab.doctype || (tdoc && tdoc.doctype) || "")}</span></div>
        ${rows.length ? DX.table(tab.columns, rows, { maxh: "66vh", go: tdoc ? r => DX.entryRoute(tdoc, r) : null }) : DX.empty("Nothing matches", "Try a shorter search.")}</section>`;
    ctx.on("click", e => { const b = e.target.closest("[data-mtab]"); if (b) { s.masterTab = +b.dataset.mtab; s.masterQ = ""; V.masters(ctx.fresh(), screen); } });
    const mq = ctx.host.querySelector("[data-mq]"); let t;
    mq.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { s.masterQ = mq.value; V.masters(ctx.fresh(), screen); const n = ctx.host.querySelector("[data-mq]"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); });
  };

  /* ---------------------------------------------------------------- dispatcher */
  V.run = async (ctx, screenId, param) => {
    const { app } = ctx;
    if (DX.live) { V.skeleton(ctx.host); if (app.boot && !app._booted) { await app.boot(ctx); app._booted = true; } }
    const m = /^([\w-]+):(new|edit|entry)$/.exec(screenId || "");
    if (m) {
      const doc = DX.docOf(app, m[1]);
      if (!doc) throw new Error("Unknown document type.");
      ctx.doc = doc;
      // lists a form reads for its options / guards (e.g. vehicles + last readings) — load them before painting
      if (m[2] !== "entry" && doc.formDocs) await Promise.all(doc.formDocs.map(k => DX.docOf(app, k)).filter(Boolean).map(x => DX.ensure(x)));
      if (m[2] === "new") return V.form(ctx, doc, null);
      if (m[2] === "edit") return V.form(ctx, doc, param);
      return V.detail(ctx, doc, param);
    }
    const screen = app.screens.find(s => s.id === screenId) || app.screens[0];
    ctx.screen = screen;
    const needs = screen.docs ? screen.docs.map(k => DX.docOf(app, k)) : screen.type === "dashboard" ? app.docs.filter(x => !x.lazy) : screen.type === "masters" ? screen.tabs.filter(t => t.doc).map(t => DX.docOf(app, t.doc)) : ["list", "report"].includes(screen.type) ? [DX.docOf(app, screen.doc)] : [];
    await Promise.all(needs.filter(Boolean).map(x => DX.ensure(x)));
    if (screen.load) await screen.load(ctx);
    if (screen.type === "dashboard") return V.dashboard(ctx, screen);
    if (screen.type === "list") return V.list(ctx, screen);
    if (screen.type === "report") return V.report(ctx, screen);
    if (screen.type === "masters") return V.masters(ctx, screen);
    if (screen.type === "form") return V.form(ctx, DX.docOf(app, screen.doc), null);
    ctx.chrome({ crumbs: [crumbApp(app), { label: screen.label }], title: screen.title || screen.label, actions: screen.actions ? screen.actions(ctx) : "" });
    ctx.host.innerHTML = screen.render(ctx);
    if (screen.bind) screen.bind(ctx);
  };
})();
