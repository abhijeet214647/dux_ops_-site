/* DUX Ops Suite — LIVE boot. Loads who-can-use-what + shared masters from dux_portal, then defines the apps
   (DX.defineApps) so every config is built from real ERP masters. Each app then talks to its own whitelisted API. */
(function () {
  "use strict";
  const DX = window.DX, { esc } = DX;
  const SUITE = "dux_portal.dux_portal.page.dux_ops_suite.dux_ops_suite.";
  DX.live = true;
  DX.onAuthLost = DX.onAuthLost || (() => { if (window.frappe && frappe.app) return; location.href = "/login?redirect-to=" + encodeURIComponent(location.pathname + location.hash); });

  // Frappe envelopes differ per app: some return {ok:false,message}, others throw — normalise both into ApiError.
  DX.okData = r => { if (r && r.ok === false) throw new DX.ApiError(DX.htmlToText(r.message || "Request failed.")); return r && Object.prototype.hasOwnProperty.call(r, "data") ? r.data : r; };
  DX.json = v => JSON.stringify(v == null ? {} : v);
  DX.day = v => (v ? String(v).slice(0, 10) : "");
  DX.num = v => { const n = +v; return isFinite(n) ? n : 0; };
  DX.spin = (btn, label) => { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = DX.ic("refresh", 15).replace("<svg", "<svg data-spin") + esc(label || "Working…"); return () => { btn.disabled = false; btn.innerHTML = btn.dataset.label; }; };

  DX.bootSuite = async () => {
    const boot = (DX.BOOT = await DX.call(SUITE + "get_suite_boot"));
    if (boot.today) DX.TODAY = boot.today;
    DX.defineApps();
    const allowed = new Set(boot.apps || []);
    DX.apps.splice(0, DX.apps.length, ...DX.apps.filter(a => allowed.has(a.key)));
    if (!DX.apps.length) throw new Error("Your user has no access to any of the suite apps yet — ask your ERP admin for the app role.");
    DX.apps.forEach(a => {
      const h = () => (DX.homeData && DX.homeData[a.key]) || null;
      const toGo = x => { const d = x.doc && DX.docOf(a, x.doc); return d && x.name ? DX.entryRoute(d, { name: x.name }) : `${a.key}/${x.screen || a.screens[0].id}`; };
      a.homeStat = () => { const d = h(); return d ? { value: typeof d.value === "number" ? DX.nf(d.value, d.value % 1 ? 1 : 0) : esc(d.value), label: d.label } : null; };
      a.attention = () => { const d = h(); return d ? (d.attention || []).map(x => Object.assign({ go: toGo(x) }, x)) : []; };
      a.attentionCount = () => { const d = h(); return d ? d.attention_count || 0 : 0; };
      a.recent = () => { const d = h(); return d ? (d.recent || []).map(x => Object.assign({ go: toGo(x) }, x)) : []; };
    });
  };
  let homeAt = 0;
  DX.loadHome = async force => {
    if (!force && DX.homeData && Date.now() - homeAt < 60000) return;
    try { DX.homeData = await DX.call("dux_portal.dux_portal.page.dux_ops_suite.suite_home.get_suite_home"); homeAt = Date.now(); } catch (e) { DX.homeData = DX.homeData || {}; DX.toast(esc(e.message), "err"); }
  };
  DX.homeTotals = () => { const d = DX.homeData || {}; return DX.apps.reduce((t, a) => { const x = d[a.key] || {}; t.today += x.today || 0; t.drafts += x.drafts || 0; t.att += x.attention_count || 0; return t; }, { today: 0, drafts: 0, att: 0 }); };
  DX.homeRecent = () => DX.apps.flatMap(a => (a.recent ? a.recent() : []).map(x => Object.assign({ app: a }, x))).sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 10);
  DX.userCard = () => ({ name: (DX.BOOT && DX.BOOT.full_name) || "", email: (DX.BOOT && DX.BOOT.user) || "", role: (DX.BOOT && DX.BOOT.role) || "", company: (DX.BOOT && DX.BOOT.company) || "" });

  // An open tab keeps running the old code after a deploy (desk caches page JS, and the SPA never
  // reloads). build-live writes its stamp to /assets/dux_portal/ops/version.txt; when that moves on,
  // reload — but only while no form has unsaved changes.
  DX.BUILD = "__DX_BUILD__";
  let newer = false;
  const checkVersion = async () => {
    if (newer) return;
    try {
      const v = (await (await fetch("/assets/dux_portal/ops/version.txt?ts=" + Date.now(), { cache: "no-store", credentials: "same-origin" })).text()).trim();
      if (/^\d{14}$/.test(v) && v > DX.BUILD) newer = true;
    } catch (_) { /* offline — try again later */ }
  };
  DX.reloadIfNewer = () => {
    if (!newer || (DX.activeForm && DX.activeForm.dirty)) return false;
    DX.toast("Updating DUX Ops Suite to the latest version…");
    try { localStorage.removeItem("_page:dux-ops-suite"); } catch (_) { /* storage blocked */ }
    setTimeout(() => location.reload(), 1200);
    return true;
  };
  const tick = () => checkVersion().then(DX.reloadIfNewer);
  if (!window.__dxVersionWatch) { // the desk can evaluate the page script more than once
    window.__dxVersionWatch = true;
    setInterval(tick, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
    setTimeout(tick, 15000);
  }

  // a note block for screens that hand off to the original page (rare admin tools)
  DX.handoff = (text, route, label) => `<div class="dx-note">${DX.ic("external", 16)}<div>${text} <a class="dx-link" href="${esc(route)}" target="_blank" rel="noopener">${esc(label || "Open the full page")}</a></div></div>`;
})();
