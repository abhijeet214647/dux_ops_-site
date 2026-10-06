// Builds the LIVE (ERP-connected) DUX Ops Suite for jewipl — deployed into the dux_portal app:
//   live/page/dux_ops_suite/{dux_ops_suite.js,.css,.json,.py,__init__.py}  → apps/dux_portal/dux_portal/dux_portal/page/dux_ops_suite/
//   live/public/ops/{ops.js,ops.css,dux-mark*.png}                          → apps/dux_portal/dux_portal/public/ops/   (served at /assets/dux_portal/ops/)
//   live/www/ops/{m.html,index.html}                                        → apps/dux_portal/dux_portal/www/ops/      (served at /ops/m)
const fs = require("fs");
const read = f => fs.readFileSync(f, "utf8");
const uri = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const marks = { light: uri("dux-mark-112.png"), white: uri("dux-mark-white-112.png") };
const LIVE_APPS = ["common", "hscnp", "pour", "peb", "concrete", "fuel", "hscin", "maint", "stock"];
const ORDER = `window.DX.apps.sort((a, b) => ["hscnp", "pour", "peb", "concrete", "fuelin", "hscin", "maint", "stock"].indexOf(a.key) - ["hscnp", "pour", "peb", "concrete", "fuelin", "hscin", "maint", "stock"].indexOf(b.key));`;
const BUILD = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const searchIcon = '<svg class="dx-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const sub = s => s.split("__MARK_LIGHT__").join(marks.light).split("__MARK_WHITE__").join(marks.white).split("__SEARCH_ICON__").join(searchIcon).split("__DX_BUILD__").join(BUILD);
// apps are defined AFTER get_suite_boot so every config is built from the real masters
const core = () => ["window.DX = window.DX || {}; window.DX.deferStart = true; window.DX.live = true;", read("src/engine.js"), read("src/views.js"), read("src/live/core.js"), "window.DX.defineApps = function () {\n" + LIVE_APPS.map(a => read(`src/live/${a}.js`)).join("\n;\n") + "\n;\n" + ORDER + "\n};"].join("\n;\n");
const check = (js, what) => { try { new Function(js); } catch (e) { console.error("JS SYNTAX ERROR in", what, e.message); process.exitCode = 1; } };
const mk = d => fs.mkdirSync(d, { recursive: true });

/* ------------------------------------------------ desk page */
let css = [read("src/base.css"), read("src/suite.css"), read("src/desktop.css")].join("\n");
const must = (from, to) => { if (!css.includes(from)) throw new Error("css anchor missing: " + from); css = css.split(from).join(to); };
must("html,body{margin:0;background:#F3F4F7}\nbody.dx-dark{background:#0A0D13}\n", `/* desk integration: full-bleed page; desk sidebar hidden while the suite is open */
.dx-page .page-head{display:none!important}
.dx-page .layout-main-section,.dx-page .layout-main-section-wrapper,.dx-page .page-body,.dx-page .page-content,.dx-page .page-wrapper{padding:0!important;margin:0!important;max-width:none!important}
.dx-page .container{max-width:none!important;padding-left:0!important;padding-right:0!important}
body.dx-focus .body-sidebar-container{display:none!important}
.dx-root label{margin:0}
.dx-root p{margin:0}
.dx-root h1,.dx-root h2,.dx-root h3{color:inherit}
`);
must(".dx-root{min-height:100vh;", ".dx-root{min-height:calc(100vh - var(--dx-top,0px));");
must(".dx-top{position:sticky;top:0;z-index:30;", ".dx-top{position:sticky;top:var(--dx-top,0px);z-index:30;");
must(".dx-rail{position:sticky;top:0;height:100vh;", ".dx-rail{position:sticky;top:var(--dx-top,0px);height:calc(100vh - var(--dx-top,0px));");
must(".dx-subnav{position:sticky;top:0;height:100vh;", ".dx-subnav{position:sticky;top:var(--dx-top,0px);height:calc(100vh - var(--dx-top,0px));");
must(".dx-scrim{position:fixed;inset:0;z-index:70;", ".dx-scrim{position:fixed;inset:0;z-index:1060;");
must(".dx-modalwrap{position:fixed;inset:0;z-index:71;", ".dx-modalwrap{position:fixed;inset:0;z-index:1061;");
must(".dx-pop{position:fixed;z-index:80;", ".dx-pop{position:fixed;z-index:1065;");
must(".dx-toasts{position:fixed;left:50%;bottom:24px;z-index:90;", ".dx-toasts{position:fixed;left:50%;bottom:24px;z-index:1070;");
must(".dx-section{scroll-margin-top:84px}", ".dx-section{scroll-margin-top:calc(84px + var(--dx-top,0px))}");
css = "/* DUX Ops Suite — desk page styles (DUX Digitech Design System tokens, scoped to .dx-root) */\n" + css;

const deskHtml = read("src/desktop.html");
const markup = sub(deskHtml.split("<body>")[1].split("<script>")[0].trim());
const pageJs = `// DUX Ops Suite — one desk page for 8 field apps (HSC NP-II, Pour Card, PEB, Concrete, Fuel Stock, HSC Inhouse, Maintenance, Fuel Inward).
// Build ${BUILD}. Each app talks to its OWN whitelisted API; this page adds the shell only. Source: C:\\Users\\HP\\dux-ops-suite (build-live.js).
${sub(core())}
;
${sub(read("src/desktop.js"))}
;
frappe.pages["dux-ops-suite"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({ parent: wrapper, title: __("DUX Ops Suite"), single_column: true });
  page.wrapper.addClass("dx-page");
  page.wrapper.find(".page-head").hide();
  $(page.main).css({ padding: 0, margin: 0 });
  page.main[0].innerHTML = ${JSON.stringify(markup)};
  const root = page.main[0].querySelector("#dxRoot");
  const setTop = () => { const nav = document.querySelector(".sticky-top"); const h = nav && nav.offsetParent !== null && /sticky|fixed/.test(getComputedStyle(nav).position) ? Math.round(nav.getBoundingClientRect().height) : 0; root.style.setProperty("--dx-top", h + "px"); };
  setTop(); window.addEventListener("resize", setTop);
  document.body.classList.add("dx-focus");
  window.DX.nav = {
    get: () => (frappe.get_route() || []).slice(1).join("/"),
    push: r => frappe.set_route("dux-ops-suite", ...String(r).split("/")),
    listen: fn => $(wrapper).on("show", () => { document.body.classList.add("dx-focus"); setTop(); fn(); })
  };
  $(wrapper).on("hide", () => document.body.classList.remove("dx-focus"));
  window.DX.bootSuite().then(() => window.DX.startDesktop()).catch(err => {
    root.querySelector("#dxView").innerHTML = '<div class="dx-card" style="margin:24px"><div class="dx-empty"><b>Couldn’t start DUX Ops Suite</b><p>' + window.DX.esc(err.message) + '</p></div></div>';
  });
};
`;
check(pageJs.replace(/^frappe\.pages[\s\S]*$/m, ""), "page");
mk("live/page/dux_ops_suite");
fs.writeFileSync("live/page/dux_ops_suite/dux_ops_suite.js", pageJs);
fs.writeFileSync("live/page/dux_ops_suite/dux_ops_suite.css", css);
fs.writeFileSync("live/page/dux_ops_suite/__init__.py", "");
fs.writeFileSync("live/page/dux_ops_suite/dux_ops_suite.json", JSON.stringify({ content: null, creation: "2026-09-30 16:00:00", docstatus: 0, doctype: "Page", idx: 0, modified: "2026-09-30 16:00:00", modified_by: "Administrator", module: "Dux Portal", name: "dux-ops-suite", owner: "Administrator", page_name: "dux-ops-suite", roles: [], script: null, standard: "Yes", style: null, system_page: 0, title: "DUX Ops Suite" }, null, 1) + "\n");

/* ------------------------------------------------ /ops/m mobile page + assets */
const mcss = [read("src/base.css"), read("src/suite.css"), read("src/mobile.css")].join("\n");
const mjs = `// DUX Ops Suite /ops/m — build ${BUILD}\n${sub(core())}\n;\n${sub(read("src/mobile.js"))}\n;\n(function () {\n  const DX = window.DX;\n  DX.onAuthLost = () => location.replace("/login?redirect-to=" + encodeURIComponent("/ops/m" + location.hash));\n  DX.bootSuite().then(() => { document.getElementById("dxBoot") && document.getElementById("dxBoot").remove(); DX.startMobile(); }).catch(err => { if (err && /log ?in|Authentication|Not permitted|403/i.test(err.message)) return DX.onAuthLost(); document.getElementById("dxView").innerHTML = '<div class="dx-card"><div class="dx-empty"><b>Couldn’t start DUX Ops</b><p>' + DX.esc(err.message) + '</p><button class="dx-btn dx-btn-secondary" onclick="location.reload()">Try again</button></div></div>'; });\n})();\n`;
check(mjs, "mobile");
mk("live/public/ops");
fs.writeFileSync("live/public/ops/ops.js", mjs);
// open tabs poll this and reload into the new build (src/live/core.js · checkVersion)
fs.writeFileSync("live/public/ops/version.txt", BUILD + "\n");
fs.writeFileSync("live/public/ops/ops.css", mcss);
fs.copyFileSync("dux-mark-112.png", "live/public/ops/dux-mark.png");
const mobileHtml = read("src/mobile.html");
const mMarkup = sub(mobileHtml.split("<body>")[1].split("<script>")[0].trim()).replace('<main class="dx-m-view" id="dxView"></main>', '<main class="dx-m-view" id="dxView"><div id="dxBoot" class="dx-m-boot"><span class="dx-m-bootmark"></span></div></main>');
const www = `<!-- no-cache -->
<!-- no-breadcrumbs -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#FFFFFF">
<meta name="mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex, nofollow">
<title>DUX Ops</title>
<link rel="icon" href="/assets/dux_portal/ops/dux-mark.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;450;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/dux_portal/ops/ops.css?v=${BUILD}">
<style>html,body{margin:0;background:#E9EBF1}@media (prefers-color-scheme: dark){html,body{background:#05070B}}.dx-m-boot{display:grid;place-items:center;min-height:60vh}.dx-m-bootmark{width:56px;height:56px;border-radius:18px;background:linear-gradient(150deg,#6D5EF6,#4A3CD0);box-shadow:0 6px 18px rgba(109,94,246,.4);animation:dxbp 1.4s ease-in-out infinite}@keyframes dxbp{0%,100%{transform:scale(1)}50%{transform:scale(.9);opacity:.7}}</style>
</head>
<body>
${mMarkup}
<script>
  /* Frappe rewrites the comment below into \`frappe.csrf_token = "…"\`, so the global must exist first (no Python controller needed). */
  window.frappe = window.frappe || {};
</script>
<!-- csrf_token -->
<script>window.DX_CSRF = (window.frappe && window.frappe.csrf_token) || "";</script>
<script src="/assets/dux_portal/ops/ops.js?v=${BUILD}" defer></script>
</body>
</html>
`;
if (/\{\{|\{%|\{#/.test(www)) { console.error("Jinja markers found in m.html"); process.exitCode = 1; }
mk("live/www/ops");
fs.writeFileSync("live/www/ops/m.html", www);
fs.writeFileSync("live/www/ops/index.html", `<!-- no-cache -->\n<!-- no-breadcrumbs -->\n<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>DUX Ops</title><meta http-equiv="refresh" content="0; url=/ops/m"><meta name="robots" content="noindex, nofollow"></head>\n<body><script>location.replace('/ops/m' + location.hash);</script><noscript><a href="/ops/m">Open DUX Ops</a></noscript></body></html>\n`);
console.log("live build", BUILD, "apps:", LIVE_APPS.join(","), "| page js", (pageJs.length / 1024).toFixed(0) + "KB", "| ops.js", (mjs.length / 1024).toFixed(0) + "KB");
