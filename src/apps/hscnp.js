/* HSC NP-II (hsc_np · page hsc-np-ii) — house service connections, MPJNM NP-II. */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc } = DX;
  const NP = DX.NP; // real Zone / Village / Khirak Village NP-ll masters
  const villagesOf = {}, zoneOfVillage = {}, khiraksOf = {};
  NP.villages.forEach(([v, z]) => { (villagesOf[z] = villagesOf[z] || []).push(v); zoneOfVillage[v] = z; });
  NP.khiraks.forEach(([k, v]) => (khiraksOf[v] = khiraksOf[v] || []).push(k));
  const npTowns = ["TN-161", "TN-214"];
  const contractors = () => M.contractors.filter(c => npTowns.includes(c.town)).map(c => ({ value: c.id, label: c.name, sub: c.id, group: M.town(c.town).town }));
  const FITTINGS = [["brass_ferrule", "Brass ferrule", "Brass Ferrule"], ["int_kfob", "FTA I type", "FTA-I"], ["fta_l_type", "FTA L type", "FTA - L"], ["gi_socket", "GI socket", "GI Socket"], ["gi_elbow", "GI elbow", "GI Elbow"], ["gi_nipple_nine", 'GI nipple 9"', "GI Nipple 9 inch"], ["gi_nipple_thirty", 'GI nipple 30"', "GI Nipple 30 inch"], ["tap", "Tap", "Tap"], ["jointer", "Jointer", "Jointer"]];
  const SADDLES = ["ElectroFusion Saddle 90MM", "ElectroFusion Saddle 110MM", "ElectroFusion Saddle 125MM", "ElectroFusion Saddle 160MM"];
  const photos = d => ["house_photo", "connection_photo", "aadhar_photo", "samagra_photo"].filter(f => d[f]).length;

  const conn = {
    key: "conn", doctype: "HSC Inhouse NP-ll", prefix: "HSC",
    entity: { singular: "Connection", plural: "Connections", title: r => r.name, sub: r => `${r.village_name} · ${r.zone_name}`, date: "date" },
    newLabel: "New connection", newTitle: "New connection entry", dupField: "house_owner_name", dupHint: "add the father’s name (Name/Father) to keep it unique",
    naming: d => String(d.house_owner_name).replace(/\s+/g, " ").trim(),
    defaults: () => ({ date: DX.TODAY, company: M.companies[0][0], project: "MPJNM - NP - II" }),
    form: [
      { id: "where", title: "Where is the connection?", short: "Location", sub: "zone → village → khirak", icon: "pin", fields: [
        { f: "zone_name", label: "Zone", type: "link", req: true, options: () => NP.zones.map(z => ({ value: z, label: z, sub: (villagesOf[z] || []).length + " villages" })) },
        { f: "village_name", label: "Village", type: "link", req: true, parent: ["zone_name"], options: d => (villagesOf[d.zone_name] || []).slice().sort().map(v => ({ value: v, label: v, sub: (khiraksOf[v] || []).length + " khiraks" })) },
        { f: "khirak_name", label: "Khirak", type: "link", parent: ["village_name"], options: d => (khiraksOf[d.village_name] || []).slice().sort() },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "project", label: "Project", type: "link", options: M.projects },
        { f: "company", label: "Company", type: "link", options: M.companyOpts },
        { f: "hdi_contractor_name", label: "Contractor", type: "link", reqSubmit: true, span: 2, options: contractors, searchPh: "Search name, CP code or town…" },
        { f: "wh_info", label: "", type: "info", icon: "truck", html: d => d.hdi_contractor_name ? `Stock issues from <b class="dx-mono" style="font-size:12px">${esc(d.hdi_contractor_name)} - JEWPL</b>` : "Pick a contractor to see the source warehouse." }
      ] },
      { id: "who", title: "Consumer details", short: "Consumer", icon: "user", fields: [
        { f: "house_owner_name", label: "House owner name", type: "text", req: true, span: 2, lockOnEdit: true, ph: "e.g. Ramesh Ahirwar/Kalu", hint: "Use Name/Father’s name — this becomes the record ID and must be unique." },
        { f: "mobile_no", label: "Mobile number", type: "digits", len: 10 },
        { f: "samagra_id", label: "Samagra ID", type: "digits", len: 9, mask: true },
        { f: "aadhar_number", label: "Aadhaar number", type: "digits", len: 12, mask: true, span: 2 }
      ] },
      { id: "mat", title: "Materials used", short: "Materials", sub: "issued from stock on submit", icon: "box", tone: "cyan", cols: 3, fields: [
        { f: "mdpe_pipemtr", label: "MDPE pipe (metres)", type: "int", big: true, req: true, reqMsg: "Enter the MDPE pipe length in metres." },
        { f: "electrofusion_saddle", label: "ElectroFusion saddle", type: "select", span: 2, options: [{ value: "", label: "None" }].concat(SADDLES.map(s => ({ value: s, label: s.replace("ElectroFusion Saddle ", "").replace("MM", " mm") }))), hint: "Recorded on the entry only — not issued from stock." },
        ...FITTINGS.map(([f, label]) => ({ f, label, type: "int" }))
      ] },
      { id: "pics", title: "Photos", short: "Photos", sub: "tap a slot to open the camera", icon: "camera", cols: 4, fields: [
        { f: "house_photo", label: "House", type: "photo", icon: "home" }, { f: "connection_photo", label: "Connection", type: "photo", icon: "pipe" },
        { f: "aadhar_photo", label: "Aadhaar card", type: "photo", icon: "idcard" }, { f: "samagra_photo", label: "Samagra card", type: "photo", icon: "idcard" }
      ] },
      { id: "gps", title: "GPS location", short: "GPS", sub: "capture while standing at the house", icon: "target", cols: 2, fields: [
        { f: "gps", label: "Latitude, longitude", type: "gps", req: true, span: 2 }
      ] }
    ],
    submitTitle: "Submit this connection?", submitOk: "Submit & issue stock", submitSub: "Submitting locks the entry and creates a Stock Entry (Material Issue).", submitLinesTitle: "Will be issued",
    submitLines: d => [["MDPE Pipe (mtr)", d.mdpe_pipemtr]].concat(FITTINGS.map(([f, , item]) => [item, d[f]])).filter(l => +l[1] > 0).map(([k, v]) => [k, nf(v)]),
    submitNote: d => d.electrofusion_saddle ? `${esc(d.electrofusion_saddle)} is recorded on the entry but not issued from stock.` : "",
    onSubmit: (d, st) => { d.material_issue = "MAT-STE-2026-0" + (4100 + st.seq++); },
    submitToast: d => `Submitted · Material Issue <span class="dx-mono">${esc(d.material_issue)}</span> created`,
    lockBanner: d => `<b>Submitted</b> — materials issued via <span class="dx-link">${esc(d.material_issue)}</span>`,
    formNote: d => `${[d.mdpe_pipemtr].concat(FITTINGS.map(([f]) => d[f])).filter(v => +v > 0).length} material lines · ${photos(d)}/4 photos`,
    seed: () => {
      const g = DX.seeder(2609), first = ["Ramesh", "Suresh", "Kamla", "Rajesh", "Sunita", "Mohan", "Geeta", "Harish", "Pooran", "Munni", "Lakhan", "Santosh", "Radha", "Bharat", "Hari", "Manoj", "Rekha", "Pushpa", "Gopal", "Seema"], last = ["Ahirwar", "Kushwaha", "Yadav", "Rajak", "Kewat", "Prajapati", "Lodhi", "Pal"], fa = ["Kalu", "Nathu", "Halke", "Gulab", "Moti Lal", "Ram Singh", "Hukum"];
      const cons = contractors(), out = [];
      for (let i = 0; i < 46; i++) {
        let n; do { n = `${g.pick(first)} ${g.pick(last)}/${g.pick(fa)}`; } while (out.some(x => x.name === n));
        const z = g.pick(NP.zones), v = g.pick(villagesOf[z]), ks = khiraksOf[v] || [], sub = g.chance(.33), sparse = !sub && g.chance(.35);
        const d = { name: n, house_owner_name: n, docstatus: sub ? 1 : 0, date: DX.addDays(DX.TODAY, -g.int(0, 45)), company: M.companies[0][0], project: "MPJNM - NP - II", zone_name: z, village_name: v, khirak_name: ks.length && g.chance(.85) ? g.pick(ks) : "",
          mobile_no: String(g.int(6, 9)) + g.int(100000000, 999999999), samagra_id: String(g.int(100000000, 999999999)), aadhar_number: String(g.int(200000000000, 999999999999)),
          hdi_contractor_name: sparse && g.chance(.5) ? "" : g.pick(cons).value, mdpe_pipemtr: g.int(6, 38), electrofusion_saddle: g.chance(.85) ? SADDLES[g.chance(.6) ? 0 : g.int(1, 3)] : "",
          house_photo: sparse && g.chance(.5) ? "" : "demo:house", connection_photo: sparse ? "" : "demo:connection", aadhar_photo: "demo:aadhar", samagra_photo: sparse && g.chance(.6) ? "" : "demo:samagra",
          gps: `${(25.1936 + (g.r() - .5) * .18).toFixed(7)},${(78.7429 + (g.r() - .5) * .18).toFixed(7)}`, material_issue: sub ? "MAT-STE-2026-0" + (4000 + i) : "" };
        FITTINGS.forEach(([f]) => (d[f] = ["brass_ferrule", "gi_socket", "gi_nipple_nine", "tap"].includes(f) ? 1 : f === "gi_elbow" ? g.int(1, 2) : f === "jointer" ? g.int(0, 2) : g.chance(.5) ? 1 : 0));
        out.push(d);
      }
      return out;
    }
  };

  const app = DX.register({
    key: "hscnp", title: "HSC NP-II", short: "HSC NP-II", icon: "pin", hue: "iris", route: "/desk/hsc-np-ii",
    desc: "House connections · MPJNM NP-II", eyebrow: "MPJNM · NP-II · House service connections",
    headline: `Record every house <span class="dx-grad">connection</span>`,
    intro: `Field entries across <span class="dx-num">${NP.zones.length}</span> zones and <span class="dx-num">${NP.villages.length}</span> villages. Drafts stay editable until you submit them — submitting issues the materials from the contractor’s store.`,
    docs: [conn],
    kpis: () => {
      const rows = DX.rows(conn), drafts = rows.filter(r => !r.docstatus), pipe = DX.sum(rows, "mdpe_pipemtr");
      return [
        { label: "Connections", value: nf(rows.length), sub: `<span class="dx-num">+${rows.filter(r => r.date >= DX.addDays(DX.TODAY, -6)).length}</span> in the last 7 days`, icon: "home" },
        { label: "Drafts", value: nf(drafts.length), sub: `<span class="dx-num">${drafts.filter(r => photos(r) < 4).length}</span> still missing photos`, icon: "edit", tone: "pending" },
        { label: "Submitted", value: nf(rows.length - drafts.length), sub: `Material issued for <span class="dx-num">${rows.length ? Math.round((rows.length - drafts.length) / rows.length * 100) : 0}%</span>`, icon: "check", tone: "ok" },
        { label: "MDPE pipe laid", value: nf(pipe), unit: "m", sub: `Avg <span class="dx-num">${rows.length ? (pipe / rows.length).toFixed(1) : 0}</span> m per house`, icon: "pipe", tone: "cyan" }
      ];
    },
    panels: () => {
      const rows = DX.rows(conn);
      const zones = NP.zones.map(z => ({ label: z, sub: (villagesOf[z] || []).length + " villages", value: rows.filter(r => r.zone_name === z).length })).sort((a, b) => b.value - a.value).slice(0, 8);
      const mats = [["MDPE pipe", DX.sum(rows, "mdpe_pipemtr"), "m"]].concat(FITTINGS.map(([f, l]) => [l, DX.sum(rows, f), "nos"]));
      return [
        DX.card("Zone-wise progress", DX.bars(zones), { icon: "layers", tone: "cyan", sub: `top 8 of ${NP.zones.length}`, action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="hscnp/masters">All zones</button>` }),
        DX.card("Materials used", `<div class="dx-mgrid">${mats.map(([l, v, u]) => `<div class="dx-mcell"><div class="dx-mcell-label">${esc(l)}</div><div class="dx-mcell-val">${nf(v)}<small>${u}</small></div></div>`).join("")}</div>`, { icon: "box", sub: "all entries (drafts + submitted)" })
      ];
    },
    homeStat: () => ({ value: nf(DX.rows(conn).length), label: "connections" }),
    attention: () => DX.rows(conn).filter(r => !r.docstatus && photos(r) < 4).slice(0, 6).map(r => ({ title: r.name, sub: `Draft · ${photos(r)}/4 photos`, go: DX.entryRoute(conn, r), tag: "Photos missing" })),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard" },
      { id: "entries", label: "Entries", icon: "list", type: "list", count: () => DX.rows(conn).length, searchPh: "Search name, mobile, village, contractor…",
        search: [r => r.name, r => r.mobile_no, r => r.village_name, r => r.zone_name, r => r.khirak_name, r => M.contractorName(r.hdi_contractor_name)],
        filters: [{ f: "zone_name", label: "Zone", options: NP.zones, clears: ["village_name"] }, { f: "village_name", label: "Village", icon: "pin", options: f => (f.zone_name ? villagesOf[f.zone_name] : NP.villages.map(v => v[0])).slice().sort() }],
        sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "mdpe_pipemtr"))}</span> m MDPE pipe`,
        columns: [{ f: "name", label: "House owner", strong: true }, { f: "zone_name", label: "Zone" }, { f: "village_name", label: "Village" }, { f: "khirak_name", label: "Khirak", hideSm: true }, { label: "Contractor", get: r => r.hdi_contractor_name ? M.contractorName(r.hdi_contractor_name) : "", trunc: true }, { f: "mdpe_pipemtr", label: "MDPE (m)", type: "num" }, { label: "Photos", get: r => `${photos(r)}/4`, type: "mono" }, { f: "date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(conn, r) }],
        cardFoot: r => [`<span><span class="dx-num">${nf(r.mdpe_pipemtr)}</span> m pipe</span>`, `<span>Photos <span class="dx-mono">${photos(r)}/4</span></span>`, `<span class="dx-mono">${DX.fmtDate(r.date)}</span>`] },
      { id: "new", label: "New entry", icon: "plus", type: "form", doc: "conn" },
      { id: "report", label: "Report", icon: "chart", type: "report", group: "Insights", title: "HSCN NP ll Report", monthDefault: true, masked: true,
        filters: [{ f: "zone_name", label: "Zone", options: NP.zones, clears: ["village_name"] }, { f: "village_name", label: "Village", options: f => (f.zone_name ? villagesOf[f.zone_name] : NP.villages.map(v => v[0])).slice().sort() }],
        kpis: rows => [{ label: "Total MDPE pipe used", value: nf(DX.sum(rows, "mdpe_pipemtr")), unit: "m", sub: "Report summary · same as ERPNext", icon: "pipe", tone: "cyan" }, { label: "Connections", value: nf(rows.length), sub: `<span class="dx-num">${rows.filter(r => r.docstatus).length}</span> submitted`, icon: "home" }, { label: "Photos complete", value: rows.length ? Math.round(rows.filter(r => photos(r) === 4).length / rows.length * 100) : 0, unit: "%", sub: "All 4 photos attached", icon: "camera", tone: "ok" }],
        columns: [{ f: "date", label: "Date", type: "date" }, { f: "project", label: "Project" }, { f: "zone_name", label: "Zone" }, { f: "village_name", label: "Village" }, { f: "house_owner_name", label: "House owner", strong: true }, { f: "mdpe_pipemtr", label: "MDPE (m)", type: "num", total: true }, { f: "samagra_id", label: "Samagra ID", type: "mask" }, { f: "aadhar_number", label: "Aadhaar", type: "mask" }, { label: "Saddle", get: r => r.electrofusion_saddle ? r.electrofusion_saddle.replace("ElectroFusion Saddle ", "") : "" }].concat(FITTINGS.map(([f, l]) => ({ f, label: l, type: "num", total: true }))).concat([{ f: "gps", label: "Lat, long", type: "mono" }]) },
      { id: "masters", label: "Masters", icon: "database", type: "masters", group: "Insights", tabs: [
        { label: "Zones", doctype: "Zone Details NP-ll", rows: () => NP.zones.map(z => ({ z, v: (villagesOf[z] || []).length, e: DX.rows(conn).filter(r => r.zone_name === z).length })), columns: [{ f: "z", label: "Zone", strong: true }, { label: "Project", get: () => "MPJNM - NP - II" }, { f: "v", label: "Villages", type: "num" }, { f: "e", label: "Entries", type: "num" }] },
        { label: "Villages", doctype: "Village Details NP-ll", rows: () => NP.villages.map(([v, z]) => ({ v, z, k: (khiraksOf[v] || []).length })).sort((a, b) => a.v.localeCompare(b.v)), columns: [{ f: "v", label: "Village", strong: true }, { f: "z", label: "Zone" }, { f: "k", label: "Khiraks", type: "num" }] },
        { label: "Khirak villages", doctype: "Khirak Village NP-ll", rows: () => NP.khiraks.map(([k, v]) => ({ k, v, z: zoneOfVillage[v] })).sort((a, b) => a.k.localeCompare(b.k)), columns: [{ f: "k", label: "Khirak", strong: true }, { f: "v", label: "Village" }, { f: "z", label: "Zone" }] }
      ] }
    ]
  });
  void app;
})();
