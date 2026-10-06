// Builds the two single-file deliverables:
//   dist/DUX-Ops-Suite.html         — combined desktop custom page (all 8 apps)
//   dist/DUX-Ops-Suite-Mobile.html  — /m mobile app (APK target) with app picker + tabs
const fs = require("fs");
const read = f => fs.readFileSync(f, "utf8");
const uri = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const marks = { light: uri("dux-mark-112.png"), white: uri("dux-mark-white-112.png") };
const np = JSON.parse(read("data.json"));
const npData = JSON.stringify({ zones: np.zones, villages: np.villages, khiraks: np.khiraks }).replace(/<\//g, "<\\/");
const APPS = ["common", "hscnp", "pour", "peb", "concrete", "fuel", "hscin", "maint"].filter(a => fs.existsSync(`src/apps/${a}.js`));
const searchIcon = '<svg class="dx-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

// rail order = the order the user listed the apps
const ORDER = `window.DX.apps.sort((a, b) => ["hscnp", "pour", "peb", "concrete", "fuelstock", "hscin", "maint", "fuelin"].indexOf(a.key) - ["hscnp", "pour", "peb", "concrete", "fuelstock", "hscin", "maint", "fuelin"].indexOf(b.key));`;
function bundle(shell, cssFiles) {
  const css = cssFiles.map(read).join("\n");
  let js = [read("src/engine.js"), `window.DX.NP = ${npData};`, read("src/views.js"), ...APPS.map(a => read(`src/apps/${a}.js`)), ORDER, read(`src/${shell}.js`)].join("\n;\n");
  js = js.split("__MARK_LIGHT__").join(marks.light).split("__MARK_WHITE__").join(marks.white);
  let html = read(`src/${shell}.html`);
  html = html.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js).split("__SEARCH_ICON__").join(searchIcon)
    .split("__MARK_LIGHT__").join(marks.light).split("__MARK_WHITE__").join(marks.white);
  try { new Function(js); } catch (e) { console.error("JS SYNTAX ERROR in", shell, e.message); process.exitCode = 1; }
  return html;
}
fs.mkdirSync("dist", { recursive: true });
const out = [["desktop", ["src/base.css", "src/suite.css", "src/desktop.css"], "DUX-Ops-Suite.html"], ["mobile", ["src/base.css", "src/suite.css", "src/mobile.css"], "DUX-Ops-Suite-Mobile.html"]];
for (const [shell, css, name] of out) {
  if (!fs.existsSync(`src/${shell}.js`)) continue;
  const html = bundle(shell, css);
  fs.writeFileSync("dist/" + name, html);
  console.log(name, (html.length / 1024).toFixed(0) + " KB", "apps:", APPS.length - 1);
}
