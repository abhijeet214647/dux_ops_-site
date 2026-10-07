/* DUX Ops Suite — desktop shell: app rail + per-app sub-nav + header (search, quick create) + Home. */
window.DX.startDesktop = function () {
  const U0 = window.DX.userCard ? window.DX.userCard() : {};
  const USER = { name: U0.name || "Site admin", role: U0.role || (U0.name ? "" : "System Manager"), initials: (U0.name || "Site admin").split(/s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() };
  "use strict";
  const DX = window.DX, { esc, nf, ic } = DX, V = DX.views;
  const root = document.getElementById("dxRoot");
  DX.mount(root);
  const view = root.querySelector("#dxView");
  let current = null;

  /* ---------------------------------------------------------------- routing */
  // The route lives in memory and renders immediately; the URL hash/history is only a mirror (so it also works in sandboxed previews).
  const hashRoute = () => { try { return location.hash.replace(/^#\/?/, ""); } catch (_) { return ""; } };
  // DX.nav lets a host (the Frappe desk page) own the URL; default = hash/history mirror
  const NAV = DX.nav || { get: hashRoute, push: route => { try { if (hashRoute() !== route) history.pushState(null, "", "#/" + route); } catch (_) { /* sandboxed viewer — keep in-memory route only */ } }, listen: fn => { window.addEventListener("popstate", fn); window.addEventListener("hashchange", fn); } };
  let ROUTE = NAV.get() || "home";
  const parse = () => {
    const parts = ROUTE.split("/");
    const a = parts[0] || "home", s = parts[1] || "", p = parts.slice(2).join("/");
    return { a, s, p: p ? decodeURIComponent(p) : "" };
  };
  async function go(route) {
    if (current && current.form && current.form.dirty) {
      const ok = await DX.confirm({ title: "Discard this entry?", sub: "You have unsaved changes. Leaving now will lose them.", ok: "Discard changes", tone: "danger" });
      if (!ok) return;
      current.form.dirty = false;
    }
    ROUTE = route;
    NAV.push(route);
    render();
  }
  DX.go = go;

  /* ---------------------------------------------------------------- chrome */
  const MARK = `<span class="dx-mark"><img class="m-light" src="__MARK_LIGHT__" alt="DUX"><img class="m-white" src="__MARK_WHITE__" alt=""></span>`;
  function chrome({ crumbs, title, actions }) {
    root.querySelector("#dxCrumbs").innerHTML = crumbs.map((c, i) => (i ? `<span aria-hidden="true">/</span>` : "") + (c.go ? `<button data-go="${esc(c.go)}">${esc(c.label)}</button>` : `<span>${esc(c.label)}</span>`)).join("");
    root.querySelector("#dxTitle").textContent = title;
    root.querySelector("#dxTopActions").innerHTML = (actions || "") + `<button class="dx-btn dx-btn-secondary dx-hide-m" data-act="quick">${ic("plus", 15)}New</button><button class="dx-ibtn" data-act="theme" title="Switch theme" aria-label="Switch theme">${ic(root.dataset.theme === "dark" ? "sun" : "moon", 16)}</button>`;
    document.title = title + " · DUX Ops Suite";
  }
  function paintRail(a) {
    root.querySelector("#dxRail").innerHTML = `
      <div class="dx-rail-mark" title="DUX Ops Suite">${MARK}</div>
      <button class="dx-railbtn" data-go="home" aria-current="${a === "home"}" title="Home"><span class="dx-apptile dx-hue-iris">${ic("home", 18)}</span><span>Home</span></button>
      <div class="dx-rail-sep"></div>
      ${DX.apps.map(app => { const n = app.attentionCount ? app.attentionCount() : app.attention ? app.attention().length : 0; return `<button class="dx-railbtn dx-hue-${app.hue}" data-go="${app.key}/${app.screens[0].id}" aria-current="${a === app.key}" title="${esc(app.title)}"><span class="dx-apptile">${ic(app.icon, 18)}</span><span>${esc(app.short)}</span>${n ? `<i class="dx-rail-dot" aria-label="${n} need attention"></i>` : ""}</button>`; }).join("")}
      <div class="dx-rail-foot">${window.frappe && frappe.set_route ? `<a class="dx-ibtn dx-ibtn-ghost" href="/desk" title="Back to the ERP desk" aria-label="Back to the ERP desk">${ic("grid", 16)}</a>` : ""}<button class="dx-ibtn dx-ibtn-ghost" data-act="theme" title="Switch theme" aria-label="Switch theme">${ic(root.dataset.theme === "dark" ? "sun" : "moon", 16)}</button><span class="dx-avatar" title="${esc(USER.name + (USER.role ? " · " + USER.role : ""))}">${esc(USER.initials)}</span></div>`;
  }
  function paintSubnav(app, s) {
    const nav = root.querySelector("#dxSub");
    if (!app) {
      nav.innerHTML = `<div class="dx-subhead"><span class="dx-apptile dx-apptile-lg dx-hue-iris">${ic("apps", 20)}</span><div><div class="dx-subtitle">DUX Ops Suite</div><div class="dx-subdesc">${DX.apps.length} apps${DX.M && DX.M.abbr && DX.M.abbr(DX.M.defaultCompany) ? " · " + esc(DX.M.abbr(DX.M.defaultCompany)) : ""}</div></div></div>
        <div class="dx-eyebrow dx-nav-label">Apps</div>
        ${DX.apps.map(x => `<button class="dx-nav dx-hue-${x.hue}" data-go="${x.key}/${x.screens[0].id}"><span class="dx-apptile dx-apptile-sm">${ic(x.icon, 14)}</span><span>${esc(x.title)}</span></button>`).join("")}
        <div class="dx-subfoot"><div class="dx-muted" style="font-size:12px;line-height:1.5">One page for every field app. Pick an app from the rail — each keeps its own screens, forms and reports.</div></div>`;
      return;
    }
    const groups = [];
    app.screens.forEach(sc => { const g = sc.group || "Workspace"; let grp = groups.find(x => x.g === g); if (!grp) groups.push((grp = { g, items: [] })); grp.items.push(sc); });
    const activeId = s.includes(":") ? (app.screens.find(sc => sc.type === "list" && (sc.doc || app.docs[0].key) === s.split(":")[0]) || {}).id : (s || app.screens[0].id);
    nav.innerHTML = `<div class="dx-subhead dx-hue-${app.hue}"><span class="dx-apptile dx-apptile-lg">${ic(app.icon, 20)}</span><div style="min-width:0"><div class="dx-subtitle">${esc(app.title)}</div><div class="dx-subdesc">${esc(app.desc)}</div></div></div>
      ${groups.map(grp => `<div class="dx-eyebrow dx-nav-label">${esc(grp.g)}</div>${grp.items.map(sc => { const cnt = sc.count ? sc.count() : null; return `<button class="dx-nav" data-go="${sc.type === "form" ? DX.newRoute(DX.docOf(app, sc.doc)) : app.key + "/" + sc.id}" aria-current="${sc.id === activeId || (sc.type === "form" && s === (sc.doc || app.docs[0].key) + ":new") ? "page" : "false"}">${ic(sc.icon || "list", 18)}<span>${esc(sc.label)}</span>${cnt != null ? `<span class="dx-navcount">${nf(cnt)}</span>` : ""}</button>`; }).join("")}`).join("")}
      <div class="dx-subfoot">${app.route ? `<a class="dx-nav" href="${esc(app.route)}" target="_blank" rel="noopener">${ic("external", 18)}<span>Open in ERPNext</span></a>` : ""}<div class="dx-muted dx-mono" style="font-size:11px;padding:0 12px">${esc(app.route || "")}</div></div>`;
    // compact tab strip for narrower screens
    root.querySelector("#dxTabs").innerHTML = app.screens.map(sc => `<button type="button" data-go="${sc.type === "form" ? DX.newRoute(DX.docOf(app, sc.doc)) : app.key + "/" + sc.id}" aria-pressed="${sc.id === activeId}">${ic(sc.icon || "list", 14)}${esc(sc.label)}</button>`).join("");
  }

  /* ---------------------------------------------------------------- home */
  const allDocs = () => DX.apps.flatMap(a => a.docs.filter(d => !d.hideFromHome).map(d => ({ app: a, doc: d })));
  async function renderHome(host) {
    if (DX.loadHome) { V.skeleton(host); await DX.loadHome(); }
    chrome({ crumbs: [{ label: "DUX Ops Suite" }], title: "Home", actions: "" });
    root.querySelector("#dxTabs").innerHTML = "";
    const attention = DX.apps.flatMap(a => (a.attention ? a.attention() : []).map(x => Object.assign({ app: a }, x)));
    const recent = allDocs().flatMap(({ app, doc }) => DX.rows(doc).slice(0, 40).map(r => ({ app, doc, r, d: String(DX.dateOf(doc, r) || "") }))).sort((x, y) => y.d.localeCompare(x.d) || String(y.r.modified || "").localeCompare(String(x.r.modified || ""))).slice(0, 10);
    const T = DX.homeTotals ? DX.homeTotals() : null;
    const todayCount = T ? T.today : allDocs().reduce((n, { doc }) => n + DX.rows(doc).filter(r => DX.dateOf(doc, r) === DX.TODAY).length, 0);
    const drafts = T ? T.drafts : allDocs().reduce((n, { doc }) => n + (DX.canSubmit(doc) ? DX.rows(doc).filter(r => r.docstatus === 0).length : 0), 0);
    const attTotal = T ? T.att : attention.length;
    const recentRows = DX.homeRecent ? DX.homeRecent().map(x => `<button class="dx-feed-row dx-hue-${x.app.hue}" data-go="${esc(x.go)}"><span class="dx-apptile">${ic(x.app.icon, 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">${esc(x.title)}</div><div class="dx-feed-sub">${esc(x.app.short)} · ${esc(x.sub)}</div></div><div class="dx-feed-end">${x.status ? DX.status(x.status[0], x.status[1]) : ""}<span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(x.date)}</span></div></button>`).join("") : null;
    const hour = new Date().getHours();
    host.innerHTML = `
      <section class="dx-hero"><div><div class="dx-eyebrow">DUX Ops Suite${(() => { const c = (DX.userCard && DX.userCard().company) || (DX.M && DX.M.defaultCompany) || ""; return c ? " · " + esc(c) : ""; })()}</div><h1>Every site app, in <span class="dx-grad">one</span> place</h1>
        <p>${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}. HSC connections, pour cards, PEB fabrication, concrete, fuel and vehicle maintenance — pick an app to work in, or start from what needs attention.</p></div>
        <div class="dx-hero-actions">${((DX.BOOT && DX.BOOT.links) || []).map(l => `<a class="dx-btn dx-btn-secondary" href="${esc(l.route)}">${ic(l.icon || "external", 15)}${esc(l.label)}</a>`).join("")}<button class="dx-btn dx-btn-primary" data-act="quick">${ic("plus", 15)}New entry</button></div></section>
      <section class="dx-kpis">
        ${DX.kpi({ label: "Entries today", value: nf(todayCount), sub: `Across ${DX.apps.length === 8 ? "all 8" : "your " + DX.apps.length} apps`, icon: "calendar" })}
        ${DX.kpi({ label: "Needs attention", value: nf(attTotal), sub: "Approvals, pending issues, due services", icon: "bell", tone: "pending" })}
        ${DX.kpi({ label: "Drafts to submit", value: nf(drafts), sub: "Saved but not yet submitted", icon: "edit" })}
        ${DX.kpi({ label: "Apps", value: nf(DX.apps.length), sub: "Same login, same design", icon: "apps", tone: "cyan" })}
      </section>
      <section class="dx-appgrid">${DX.apps.map(a => { const st = a.homeStat ? a.homeStat() : null; const n = a.attentionCount ? a.attentionCount() : a.attention ? a.attention().length : 0; return `<button class="dx-appcard dx-hue-${a.hue}" data-go="${a.key}/${a.screens[0].id}"><div class="dx-appcard-top"><span class="dx-apptile dx-apptile-lg">${ic(a.icon, 20)}</span><div style="min-width:0"><div class="dx-appcard-title">${esc(a.title)}</div><div class="dx-appcard-desc">${esc(a.desc)}</div></div></div>${st ? `<div class="dx-appcard-stat"><b>${st.value}</b><span>${esc(st.label)}</span>${n ? `<span class="dx-status dx-status-pending" style="margin-left:auto">${n} pending</span>` : ""}</div>` : ""}</button>`; }).join("")}</section>
      <section class="dx-cols">
        ${DX.card("Needs attention", attention.slice(0, 9).map(x => `<button class="dx-feed-row dx-hue-${x.app.hue}" data-go="${esc(x.go)}"><span class="dx-apptile">${ic(x.app.icon, 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">${esc(x.title)}</div><div class="dx-feed-sub">${esc(x.app.title)} · ${esc(x.sub)}</div></div><div class="dx-feed-end">${DX.status(x.tag || "Pending", x.tone || "pending")}</div></button>`).join("") || DX.empty("All clear", "Nothing is waiting on you right now."), { icon: "bell", tone: "pending", sub: `${nf(attTotal)} items` })}
        ${DX.card("Recent activity", recentRows != null ? recentRows || DX.empty("Nothing yet", "New entries show up here.") : recent.map(({ app, doc, r }) => `<button class="dx-feed-row dx-hue-${app.hue}" data-go="${esc(DX.entryRoute(doc, r))}"><span class="dx-apptile">${ic(app.icon, 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">${esc(DX.titleOf(doc, r))}</div><div class="dx-feed-sub">${esc(app.short)} · ${esc(doc.entity.singular)} · ${esc(DX.subOf(doc, r))}</div></div><div class="dx-feed-end">${DX.statusOf(doc, r)}<span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(DX.dateOf(doc, r))}</span></div></button>`).join(""), { icon: "clock" })}
      </section>`;
  }

  /* ---------------------------------------------------------------- global search + quick create */
  function openSearch(input) {
    const q = input.value.toLowerCase().trim();
    let pop = root.querySelector(".dx-searchpop");
    if (!q) { if (pop) pop.remove(); return; }
    const hits = allDocs().flatMap(({ app, doc }) => DX.rows(doc).filter(r => [r.name, DX.titleOf(doc, r), DX.subOf(doc, r)].join(" ").toLowerCase().includes(q)).slice(0, 4).map(r => ({ app, doc, r }))).slice(0, 12);
    if (!pop) { pop = document.createElement("div"); pop.className = "dx-pop dx-searchpop"; root.appendChild(pop); }
    const r0 = input.getBoundingClientRect();
    Object.assign(pop.style, { top: r0.bottom + 6 + "px", left: r0.left + "px", width: Math.max(r0.width, 420) + "px" });
    pop.innerHTML = `<div class="dx-pop-list">${hits.map(({ app, doc, r }) => `<button type="button" class="dx-opt dx-hue-${app.hue}" data-go="${esc(DX.entryRoute(doc, r))}"><span class="dx-apptile dx-apptile-sm">${ic(app.icon, 13)}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(DX.titleOf(doc, r))} <span class="dx-muted" style="font-size:12px">· ${esc(DX.subOf(doc, r))}</span></span><small>${esc(app.short)}</small></button>`).join("") || `<div class="dx-pop-empty">No entries match “${esc(input.value)}”.</div>`}</div>`;
  }
  function quickCreate(btn) {
    const opts = DX.apps.flatMap(a => a.docs.filter(d => d.form && d.canCreate !== false && !d.hideFromQuick).map(d => ({ value: DX.newRoute(d), label: d.newLabel || "New " + d.entity.singular.toLowerCase(), sub: a.short, group: a.title })));
    DX.Combo.open(btn, { title: "Create new", options: opts, placeholder: "Search what to create…", onPick: v => go(v) });
  }

  /* ---------------------------------------------------------------- render */
  function makeCtx(app, host, s, p) {
    const ctx = { app, host, mode: "desk", go, chrome: x => { if (host.isConnected) chrome(x); }, on: (ev, fn) => host.addEventListener(ev, fn), rerender: render, back: () => app.key + "/" + app.screens[0].id };
    ctx.fresh = () => { const h = document.createElement("div"); h.className = "dx-viewbody"; view.replaceChildren(h); const c = makeCtx(app, h, s, p); current = c; return c; };
    return ctx;
  }
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    DX.Combo.close(); DX.closeModal();
    const sp = root.querySelector(".dx-searchpop"); if (sp) sp.remove();
    const { a, s, p } = parse();
    const app = a === "home" ? null : DX.get(a);
    paintRail(app ? app.key : "home");
    paintSubnav(app, s);
    root.classList.toggle("dx-formmode", /:(new|edit)$/.test(s));
    // Home already lists every app (rail + cards) — drop the app sub-nav column there
    root.classList.toggle("dx-homemode", !app);
    view.classList.remove("dx-enter"); void view.offsetWidth; view.classList.add("dx-enter");
    const host = document.createElement("div"); host.className = "dx-viewbody"; view.replaceChildren(host);
    try {
      if (!app) { current = null; await renderHome(host); }
      else { current = makeCtx(app, host, s, p); await V.run(current, s, p); if (seq === renderSeq) paintSubnav(app, s); }
    } catch (err) {
      if (seq !== renderSeq) return;
      console.error(err);
      host.innerHTML = `<div class="dx-card"><div class="dx-empty"><span class="dx-tile dx-tile-pending">${ic("alert", 22)}</span><b>Couldn’t open this screen</b><p>${esc(err.message)}</p><button class="dx-btn dx-btn-secondary" data-go="home">${ic("back", 15)}Back to home</button></div></div>`;
    }
    window.scrollTo(0, 0);
  }

  root.addEventListener("click", e => {
    const t = e.target;
    const g = t.closest("[data-go]");
    if (g && !t.closest(".dx-pill-x")) { e.preventDefault(); const sp = root.querySelector(".dx-searchpop"); if (sp) sp.remove(); const si = root.querySelector("#dxSearch"); if (si && g.closest(".dx-searchpop")) si.value = ""; return go(g.dataset.go); }
    const act = t.closest("[data-act]");
    if (act && act.dataset.act === "theme") return setTheme(root.dataset.theme === "dark" ? "light" : "dark");
    if (act && act.dataset.act === "quick") return quickCreate(act);
  });
  root.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-go],[role=button][data-lbv]")) { e.preventDefault(); e.target.click(); } });
  const si = root.querySelector("#dxSearch");
  si.addEventListener("input", () => openSearch(si));
  si.addEventListener("keydown", e => { if (e.key === "Escape") { si.value = ""; openSearch(si); } if (e.key === "Enter") { const first = root.querySelector(".dx-searchpop [data-go]"); if (first) first.click(); } });
  document.addEventListener("mousedown", e => { const sp = root.querySelector(".dx-searchpop"); if (sp && !sp.contains(e.target) && e.target !== si) sp.remove(); });
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); si.focus(); } });
  window.addEventListener("beforeunload", e => { if (current && current.form && current.form.dirty) { e.preventDefault(); e.returnValue = ""; } });

  function setTheme(t) {
    root.dataset.theme = t;
    document.body.classList.toggle("dx-dark", t === "dark");
    try { localStorage.setItem("dx-theme", t); } catch (_) { /* storage unavailable */ }
    root.querySelectorAll('[data-act="theme"]').forEach(b => (b.innerHTML = ic(t === "dark" ? "sun" : "moon", 16)));
  }
  let saved = null;
  try { saved = localStorage.getItem("dx-theme"); } catch (_) { /* storage unavailable */ }
  setTheme(saved === "dark" ? "dark" : "light");
  const fromUrl = () => { const h = NAV.get() || "home"; if (h !== ROUTE) { ROUTE = h; render(); } };
  NAV.listen(fromUrl);
  DX.refresh = render;
  render();
};
if (!window.DX.deferStart) window.DX.startDesktop();

