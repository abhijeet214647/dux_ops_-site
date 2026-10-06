/* DUX Ops Suite — /m mobile app (APK target): pick your apps → they become bottom tabs; each app keeps its own screens. */
window.DX.startMobile = function () {
  "use strict";
  const DX = window.DX, { esc, nf, ic } = DX, V = DX.views;
  const root = document.getElementById("dxRoot");
  DX.mount(root);
  DX.forceSheet = true;
  const view = root.querySelector("#dxView");
  const LINK = location.origin + "/ops/m";
  const MAX_TABS = 4;
  let current = null;

  /* ---------------------------------------------------------------- app selection (per device) */
  const load = () => { try { const v = JSON.parse(localStorage.getItem("dx-m-apps") || "null"); return Array.isArray(v) ? v.filter(k => DX.get(k)) : null; } catch (_) { return null; } };
  const save = list => { try { localStorage.setItem("dx-m-apps", JSON.stringify(list)); } catch (_) { /* storage unavailable — selection lasts this session */ } };
  let chosen = load();
  const mine = () => (chosen || []).map(k => DX.get(k)).filter(Boolean);

  /* ---------------------------------------------------------------- routing */
  // The route lives in memory and renders immediately; the URL hash/history is only a mirror (works in sandboxed previews and the APK WebView).
  const hashRoute = () => { try { return location.hash.replace(/^#\/?/, ""); } catch (_) { return ""; } };
  let ROUTE = hashRoute() || "home";
  const parse = () => { const parts = ROUTE.split("/"); return { a: parts[0] || "home", s: parts[1] || "", p: parts.slice(2).join("/") ? decodeURIComponent(parts.slice(2).join("/")) : "" }; };
  async function go(route) {
    if (current && current.form && current.form.dirty) {
      const ok = await DX.confirm({ title: "Discard this entry?", sub: "You have unsaved changes.", ok: "Discard", tone: "danger" });
      if (!ok) return; current.form.dirty = false;
    }
    ROUTE = route;
    try { if (hashRoute() !== route) history.pushState(null, "", "#/" + route); } catch (_) { /* sandboxed viewer — keep in-memory route only */ }
    render();
  }
  DX.go = go;

  /* ---------------------------------------------------------------- chrome */
  const MARK = `<span class="dx-mark"><img class="m-light" src="__MARK_LIGHT__" alt="DUX"><img class="m-white" src="__MARK_WHITE__" alt=""></span>`;
  function top({ app, title, crumb, back }) {
    root.querySelector("#dxTop").innerHTML = `<button class="dx-ibtn dx-ibtn-ghost" data-act="drawer" aria-label="Open menu" aria-expanded="false">${ic("menu", 20)}</button>${back ? `<button class="dx-ibtn dx-ibtn-ghost" data-go="${esc(back)}" aria-label="Back">${ic("back", 18)}</button>` : app ? `<span class="dx-apptile dx-hue-${app.hue}">${ic(app.icon, 17)}</span>` : MARK}
      <div class="dx-m-toptitle"><div class="dx-eyebrow">${esc(crumb || (app ? app.title : "DUX Ops Suite"))}</div><div class="dx-m-h">${esc(title)}</div></div>
      <button class="dx-ibtn dx-ibtn-ghost" data-act="theme" aria-label="Switch theme">${ic(root.dataset.theme === "dark" ? "sun" : "moon", 17)}</button>`;
    document.title = title + " · DUX Ops";
  }
  function chips(app, activeId) {
    const el = root.querySelector("#dxChips");
    if (!app) { el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = app.screens.map(sc => `<button type="button" data-go="${sc.type === "form" ? DX.newRoute(DX.docOf(app, sc.doc)) : app.key + "/" + sc.id}" aria-pressed="${sc.id === activeId}">${ic(sc.icon || "list", 14)}${esc(sc.label)}</button>`).join("");
    const a = el.querySelector('[aria-pressed="true"]'); if (a) a.scrollIntoView({ inline: "center", block: "nearest" });
  }
  function tabbar(activeKey) {
    const apps = mine(), shown = apps.slice(0, MAX_TABS - 1), more = apps.length > shown.length;
    root.querySelector("#dxTabbar").innerHTML = `<button class="dx-m-tab" data-go="home" aria-current="${activeKey === "home"}">${ic("home", 20)}<span>Home</span></button>
      ${shown.map(a => `<button class="dx-m-tab dx-hue-${a.hue}" data-go="${a.key}/${a.screens[0].id}" aria-current="${activeKey === a.key}"><span class="dx-m-tabicon">${ic(a.icon, 20)}</span><span>${esc(a.short)}</span></button>`).join("")}
      <button class="dx-m-tab" data-go="more" aria-current="${activeKey === "more" || (more && apps.slice(shown.length).some(a => a.key === activeKey))}">${ic(more ? "apps" : "settings", 20)}<span>${more ? "More" : "Settings"}</span></button>`;
  }

  /* ---------------------------------------------------------------- sidebar (drawer): every app + current app's screens + tab-bar ticks */
  DX.ICONS.menu = '<path d="M4 7h16M4 12h16M4 17h11"/>';
  const drawerEl = root.querySelector("#dxDrawer");
  let activeScreen = "";
  function paintDrawer() {
    const { a } = parse(), inTabs = k => (chosen || []).includes(k);
    drawerEl.innerHTML = `
      <div class="dx-m-drawhead">${MARK}<div class="dx-m-drawwho"><div class="dx-m-drawtitle">DUX Ops Suite</div><div class="dx-m-drawsub">${esc((() => { const u = DX.userCard ? DX.userCard() : {}; return u.name ? u.name + (u.role ? " · " + u.role : "") : "Site admin · System Manager"; })())}</div></div><button class="dx-ibtn dx-ibtn-ghost" data-act="drawer-close" aria-label="Close menu">${ic("close", 18)}</button></div>
      <nav class="dx-m-drawnav">
        <button class="dx-m-drawrow" data-go="home" aria-current="${a === "home"}"><span class="dx-tile">${ic("home", 16)}</span><span class="dx-m-drawlabel">Home</span></button>
        <div class="dx-eyebrow dx-m-drawsec">Apps <span class="dx-muted" style="text-transform:none;letter-spacing:0;font-weight:400">· tick = on tab bar</span></div>
        ${DX.apps.map(app => `<div class="dx-m-drawapp dx-hue-${app.hue}" aria-current="${a === app.key}">
            <button class="dx-m-drawrow" data-go="${app.key}/${app.screens[0].id}"><span class="dx-apptile">${ic(app.icon, 16)}</span><span class="dx-m-drawlabel">${esc(app.title)}<small>${esc(app.desc)}</small></span></button>
            <button class="dx-m-check" data-drawtab="${app.key}" aria-pressed="${inTabs(app.key)}" aria-label="${inTabs(app.key) ? "Remove " + esc(app.title) + " from" : "Add " + esc(app.title) + " to"} tab bar">${ic("check", 13)}</button>
          </div>
          ${a === app.key ? `<div class="dx-m-drawscreens">${app.screens.map(sc => `<button class="dx-m-drawsub-row" data-go="${sc.type === "form" ? DX.newRoute(DX.docOf(app, sc.doc)) : app.key + "/" + sc.id}" aria-current="${sc.id === activeScreen}">${ic(sc.icon || "list", 15)}<span>${esc(sc.label)}</span></button>`).join("")}</div>` : ""}`).join("")}
        <div class="dx-eyebrow dx-m-drawsec">Settings</div>
        <button class="dx-m-drawrow" data-go="pick"><span class="dx-tile">${ic("apps", 16)}</span><span class="dx-m-drawlabel">Choose apps for tab bar</span></button>
        <button class="dx-m-drawrow" data-go="more"><span class="dx-tile">${ic("settings", 16)}</span><span class="dx-m-drawlabel">Settings</span></button>
        <button class="dx-m-drawrow" data-act="theme"><span class="dx-tile">${ic(root.dataset.theme === "dark" ? "sun" : "moon", 16)}</span><span class="dx-m-drawlabel">${root.dataset.theme === "dark" ? "Light theme" : "Dark theme"}</span></button>
      </nav>`;
  }
  function openDrawer() { paintDrawer(); root.classList.add("dx-m-draweropen"); drawerEl.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; const cur = drawerEl.querySelector('.dx-m-drawapp[aria-current="true"]'); if (cur) cur.scrollIntoView({ block: "center" }); setTimeout(() => { const f = drawerEl.querySelector("[data-act='drawer-close']"); if (f) f.focus(); }, 60); }
  function closeDrawer() { if (!root.classList.contains("dx-m-draweropen")) return; root.classList.remove("dx-m-draweropen"); drawerEl.setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }
  // edge swipe → open, swipe left on the drawer → close
  let sx = null, sy = 0;
  document.addEventListener("touchstart", e => { const t = e.touches[0], rootLeft = root.getBoundingClientRect().left; sx = t.clientX; sy = t.clientY; sx = root.classList.contains("dx-m-draweropen") || t.clientX - rootLeft < 22 ? t.clientX : null; }, { passive: true });
  document.addEventListener("touchend", e => { if (sx == null) return; const t = e.changedTouches[0], dx = t.clientX - sx; if (Math.abs(t.clientY - sy) < 60) { if (dx > 60 && !root.classList.contains("dx-m-draweropen")) openDrawer(); if (dx < -60) closeDrawer(); } sx = null; }, { passive: true });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  /* ---------------------------------------------------------------- screens */
  function picker(host, first) {
    top({ title: first ? "Choose your apps" : "Edit my apps", crumb: first ? "Welcome" : "Settings", back: first ? "" : "more" });
    chips(null);
    const sel = new Set(chosen || []);
    // placement label for a ticked app: first 3 ticked (in list order) sit on the tab bar, the rest under More
    const place = k => { const order = DX.apps.map(a => a.key).filter(x => sel.has(x)), i = order.indexOf(k); return i < 0 ? "" : i < MAX_TABS - 1 ? `Tab ${i + 1}` : "In More"; };
    const draw = () => {
      host.innerHTML = `<section class="dx-m-intro">${first ? `<div class="dx-m-hello">${MARK}<div><div class="dx-eyebrow">DUX Ops Suite</div><h1>Pick the apps you work in</h1></div></div>` : ""}<p>Tick the apps you use. The first ${MAX_TABS - 1} ticked apps go on the bottom tab bar, the rest under More — every app is always in the ☰ menu. Tap <b>Open</b> to jump straight into an app.</p></section>
        <div class="dx-m-pickhead"><span><span class="dx-num">${sel.size}</span> of ${DX.apps.length} selected</span><button type="button" class="dx-btn dx-btn-ghost dx-btn-sm" data-pickall>${sel.size === DX.apps.length ? "Clear all" : "Select all"}</button></div>
        <div class="dx-m-pick">${DX.apps.map(a => { const on = sel.has(a.key); return `<label class="dx-m-pickcard dx-hue-${a.hue}" aria-selected="${on}">
            <input type="checkbox" class="dx-m-cbinput" data-pickcb="${a.key}" ${on ? "checked" : ""} aria-label="Select ${esc(a.title)}">
            <span class="dx-m-cb" aria-hidden="true">${ic("check", 14)}</span>
            <span class="dx-apptile">${ic(a.icon, 18)}</span>
            <span class="dx-m-pickmain"><span class="dx-m-picktitle">${esc(a.title)}</span><span class="dx-m-pickdesc">${on ? `<b class="dx-m-place">${place(a.key)}</b> · ` : ""}${esc(a.desc)}</span></span>
            <button type="button" class="dx-btn dx-btn-ghost dx-btn-sm dx-m-openbtn" data-pick="${a.key}" aria-label="Open ${esc(a.title)}">Open${ic("right", 13)}</button>
          </label>`; }).join("")}</div>
        <div class="dx-m-pickbar">${first ? "" : `<button type="button" class="dx-btn dx-btn-ghost" data-go="more">Cancel</button>`}<button type="button" class="dx-btn dx-btn-primary" data-pickdone ${sel.size ? "" : "disabled"}>${ic("check", 15)}${first ? "Continue" : "Save"} · <span class="dx-mono">${sel.size}</span> selected</button></div>`;
    };
    draw();
    const commit = () => { chosen = DX.apps.map(a => a.key).filter(k => sel.has(k)); save(chosen); };
    host.addEventListener("change", e => { const cb = e.target.closest("[data-pickcb]"); if (!cb) return; if (cb.checked) sel.add(cb.dataset.pickcb); else sel.delete(cb.dataset.pickcb); draw(); });
    host.addEventListener("click", e => {
      const p = e.target.closest("[data-pick]"); if (p) { e.preventDefault(); const app = DX.get(p.dataset.pick); sel.add(app.key); commit(); return go(`${app.key}/${app.screens[0].id}`); }
      if (e.target.closest("[data-pickall]")) { if (sel.size === DX.apps.length) sel.clear(); else DX.apps.forEach(a => sel.add(a.key)); return draw(); }
      if (e.target.closest("[data-pickdone]")) { commit(); DX.toast(`Saved · ${chosen.length} app${chosen.length > 1 ? "s" : ""} selected`); go("home"); }
    });
  }
  async function home(host) {
    if (DX.loadHome) { V.skeleton(host); await DX.loadHome(); }
    top({ title: "Home" }); chips(null);
    const apps = mine(), hour = new Date().getHours();
    const attention = apps.flatMap(a => (a.attention ? a.attention() : []).map(x => Object.assign({ app: a }, x)));
    const attTotal = apps.reduce((n, a) => n + (a.attentionCount ? a.attentionCount() : a.attention ? a.attention().length : 0), 0);
    const quick = apps.flatMap(a => a.docs.filter(d => d.form && d.canCreate !== false && !d.hideFromQuick).slice(0, 1).map(d => ({ a, d })));
    host.innerHTML = `<section class="dx-m-intro"><div class="dx-eyebrow">${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}</div><h1>Your <span class="dx-grad">apps</span></h1></section>
      <div class="dx-m-tiles">${apps.map(a => { const s = a.homeStat ? a.homeStat() : null, n = a.attentionCount ? a.attentionCount() : a.attention ? a.attention().length : 0; return `<button class="dx-m-tile dx-hue-${a.hue}" data-go="${a.key}/${a.screens[0].id}"><div class="dx-m-tiletop"><span class="dx-apptile">${ic(a.icon, 18)}</span>${n ? `<span class="dx-status dx-status-pending">${n}</span>` : ""}</div><div class="dx-m-tiletitle">${esc(a.short)}</div>${s ? `<div class="dx-m-tilestat"><b>${s.value}</b> ${esc(s.label)}</div>` : ""}</button>`; }).join("")}
        <button class="dx-m-tile dx-m-tile-add" data-go="pick">${ic("plus", 20)}<div class="dx-m-tiletitle">Edit apps</div></button></div>
      ${quick.length ? `<div class="dx-eyebrow dx-m-sec">Quick create</div><div class="dx-m-quick">${quick.map(({ a, d }) => `<button class="dx-m-q dx-hue-${a.hue}" data-go="${DX.newRoute(d)}"><span class="dx-apptile dx-apptile-sm">${ic("plus", 14)}</span><span>${esc(d.newLabel || "New " + d.entity.singular.toLowerCase())}</span></button>`).join("")}</div>` : ""}
      <div class="dx-eyebrow dx-m-sec">Needs attention · <span class="dx-num">${attTotal}</span></div>
      <section class="dx-card">${attention.slice(0, 8).map(x => `<button class="dx-feed-row dx-hue-${x.app.hue}" data-go="${esc(x.go)}"><span class="dx-apptile">${ic(x.app.icon, 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">${esc(x.title)}</div><div class="dx-feed-sub">${esc(x.app.short)} · ${esc(x.sub)}</div></div>${DX.status(x.tag || "Pending", x.tone || "pending")}</button>`).join("") || DX.empty("All clear", "Nothing is waiting on you in your apps.")}</section>`;
  }
  function more(host) {
    top({ title: "Settings", crumb: "More" }); chips(null);
    const apps = mine(), extra = apps.slice(MAX_TABS - 1);
    host.innerHTML = `${extra.length ? `<div class="dx-eyebrow dx-m-sec">More apps</div><section class="dx-card">${extra.map(a => `<button class="dx-feed-row dx-hue-${a.hue}" data-go="${a.key}/${a.screens[0].id}"><span class="dx-apptile">${ic(a.icon, 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">${esc(a.title)}</div><div class="dx-feed-sub">${esc(a.desc)}</div></div>${ic("right", 16)}</button>`).join("")}</section>` : ""}
      <div class="dx-eyebrow dx-m-sec">My apps</div>
      <section class="dx-card"><button class="dx-feed-row" data-go="pick"><span class="dx-tile">${ic("apps", 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">Choose apps for my tab bar</div><div class="dx-feed-sub">${apps.map(a => a.short).join(" · ")}</div></div>${ic("right", 16)}</button></section>
      <div class="dx-eyebrow dx-m-sec">Account</div>
      <section class="dx-card"><div class="dx-kv">${(() => { const u = DX.userCard ? DX.userCard() : { name: "Site admin", role: "System Manager", company: "Jain Engineering Works (India) Pvt Ltd" }; return `<div class="k">User</div><div class="v">${esc(u.name || u.email)}</div><div class="k">Role</div><div class="v">${esc(u.role)}</div><div class="k">Company</div><div class="v">${esc(u.company)}</div>`; })()}<div class="k">App link</div><div class="v"><span class="dx-mono" style="font-size:12px;word-break:break-all">${esc(LINK)}</span></div><div class="k">Theme</div><div class="v"><button class="dx-switch" role="switch" data-act="theme" aria-checked="${root.dataset.theme === "dark"}"><i></i><span>Dark theme</span></button></div></div></section>
      ${DX.live ? `<section class="dx-card" style="margin-top:12px"><button class="dx-feed-row" data-act="logout"><span class="dx-tile dx-tile-pending">${ic("lock", 15)}</span><div class="dx-feed-main"><div class="dx-feed-title">Sign out</div><div class="dx-feed-sub">End this session on this phone</div></div></button></section>` : ""}
      <p class="dx-muted" style="font-size:12px;text-align:center;margin:18px 0 8px">DUX Ops Suite · one APK for all 8 apps · updates over the air</p>`;
  }

  /* ---------------------------------------------------------------- render */
  function makeCtx(app, host, s, p) {
    const ctx = { app, host, mode: "mobile", go, on: (ev, fn) => host.addEventListener(ev, fn), rerender: render, back: () => app.key + "/" + app.screens[0].id,
      chrome: ({ title }) => { if (!host.isConnected) return; const isDoc = /:(new|edit|entry)$/.test(s); top({ app, title, crumb: app.title, back: isDoc ? (s.endsWith(":entry") ? (app.screens.find(x => x.type === "list" && (x.doc || app.docs[0].key) === s.split(":")[0]) ? app.key + "/" + app.screens.find(x => x.type === "list" && (x.doc || app.docs[0].key) === s.split(":")[0]).id : app.key + "/" + app.screens[0].id) : (s.endsWith(":edit") ? DX.entryRoute(DX.docOf(app, s.split(":")[0]), { name: p }) : app.key + "/" + app.screens[0].id)) : "" }); } };
    ctx.fresh = () => { const h = document.createElement("div"); h.className = "dx-viewbody"; view.replaceChildren(h); const c = makeCtx(app, h, s, p); current = c; return c; };
    return ctx;
  }
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    DX.Combo.close(); DX.closeModal(); closeDrawer(); activeScreen = "";
    const { a, s, p } = parse();
    const host = document.createElement("div"); host.className = "dx-viewbody"; view.replaceChildren(host);
    root.classList.remove("dx-formmode");
    if (!chosen || !chosen.length || a === "pick") { current = null; root.classList.add("dx-m-onboard"); tabbar(""); picker(host, !chosen || !chosen.length); window.scrollTo(0, 0); return; }
    root.classList.remove("dx-m-onboard");
    const app = a === "home" || a === "more" ? null : DX.get(a);
    tabbar(app ? app.key : a);
    try {
      if (a === "more") { current = null; more(host); }
      else if (!app) { current = null; await home(host); }
      else {
        root.classList.toggle("dx-formmode", /:(new|edit)$/.test(s));
        const activeId = s.includes(":") ? ((app.screens.find(x => x.type === "form" && (x.doc || app.docs[0].key) === s.split(":")[0] && s.endsWith(":new")) || app.screens.find(x => x.type === "list" && (x.doc || app.docs[0].key) === s.split(":")[0]) || {}).id) : (s || app.screens[0].id);
        chips(app, activeId); activeScreen = activeId;
        current = makeCtx(app, host, s, p); await V.run(current, s, p);
        if (seq === renderSeq) chips(app, activeId);
      }
    } catch (err) {
      if (seq !== renderSeq) return;
      console.error(err);
      host.innerHTML = `<div class="dx-card"><div class="dx-empty"><span class="dx-tile dx-tile-pending">${ic("alert", 22)}</span><b>Couldn’t open this screen</b><p>${esc(err.message)}</p><button class="dx-btn dx-btn-secondary" data-go="home">${ic("back", 15)}Home</button></div></div>`;
    }
    window.scrollTo(0, 0);
  }
  root.addEventListener("click", e => {
    const g = e.target.closest("[data-go]");
    if (g && !e.target.closest(".dx-pill-x")) { e.preventDefault(); return go(g.dataset.go); }
    const t = e.target.closest('[data-act="theme"]'); if (t) { setTheme(root.dataset.theme === "dark" ? "light" : "dark"); if (t.closest("#dxDrawer")) paintDrawer(); return; }
    const dr = e.target.closest('[data-act="drawer"]'); if (dr) return root.classList.contains("dx-m-draweropen") ? closeDrawer() : openDrawer();
    if (e.target.closest('[data-act="drawer-close"]')) return closeDrawer();
    if (e.target.closest('[data-act="logout"]')) { DX.confirm({ title: "Sign out?", sub: "You’ll need your ERP login to open the apps again.", ok: "Sign out" }).then(ok => { if (!ok) return; fetch("/api/method/logout", { method: "POST", credentials: "same-origin", headers: { "X-Frappe-CSRF-Token": (window.frappe && frappe.csrf_token) || window.DX_CSRF || "" } }).finally(() => { try { localStorage.removeItem("dx-m-apps"); } catch (_) { /* storage unavailable */ } location.replace("/login?redirect-to=" + encodeURIComponent("/ops/m")); }); }); return; }
    const pin = e.target.closest("[data-drawtab]");
    if (pin) { const k = pin.dataset.drawtab, list = new Set(chosen || []); if (list.has(k)) { if (list.size === 1) return DX.toast("Keep at least one app on the tab bar.", "err"); list.delete(k); } else list.add(k); chosen = DX.apps.map(x => x.key).filter(x => list.has(x)); save(chosen); paintDrawer(); tabbar(parse().a === "home" || parse().a === "more" ? parse().a : parse().a); DX.toast(list.has(k) ? `${esc(DX.get(k).short)} added to the tab bar` : `${esc(DX.get(k).short)} removed from the tab bar`); }
  });
  window.addEventListener("beforeunload", e => { if (current && current.form && current.form.dirty) { e.preventDefault(); e.returnValue = ""; } });
  function setTheme(t) {
    root.dataset.theme = t; document.body.classList.toggle("dx-dark", t === "dark");
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#11151E" : "#FFFFFF";
    try { localStorage.setItem("dx-theme", t); } catch (_) { /* storage unavailable */ }
    root.querySelectorAll('[data-act="theme"]').forEach(b => { if (b.closest("#dxDrawer")) return; if (b.classList.contains("dx-switch")) b.setAttribute("aria-checked", t === "dark"); else b.innerHTML = ic(t === "dark" ? "sun" : "moon", 17); });
  }
  let saved = null; try { saved = localStorage.getItem("dx-theme"); } catch (_) { /* storage unavailable */ }
  setTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const fromUrl = () => { const h = hashRoute() || "home"; if (h !== ROUTE) { ROUTE = h; render(); } };
  window.addEventListener("popstate", fromUrl);
  window.addEventListener("hashchange", fromUrl);
  render();
};
if (!window.DX.deferStart) window.DX.startMobile();

