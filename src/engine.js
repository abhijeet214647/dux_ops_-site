/* DUX Ops Suite — shared engine (desktop + mobile).
   Config-driven renderers for dashboards, lists, forms, detail, reports and masters,
   plus the DUX primitives (icons, combo, modal, toast). Apps register via DX.app({...}). */
(function () {
  "use strict";
  const DX = (window.DX = window.DX || {});
  DX.apps = [];
  DX.app = cfg => { DX.apps.push(cfg); return cfg; };
  DX.get = key => DX.apps.find(a => a.key === key);

  /* ---------------------------------------------------------------- utils */
  const esc = (DX.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const nf = (DX.nf = (n, d = 0) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
  DX.money = (n, d = 0) => "₹" + nf(n, d);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const isoDay = (DX.isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const TODAY = (DX.TODAY = isoDay(new Date()));
  DX.addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDay(d); };
  DX.monthStart = () => TODAY.slice(0, 8) + "01";
  DX.monthEnd = () => { const d = new Date(TODAY + "T00:00:00"); return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  DX.fmtDate = iso => { if (!iso) return "—"; const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d} ${MON[+m - 1]} ${y}`; };
  DX.digits = v => String(v == null ? "" : v).replace(/\D/g, "");
  DX.maskId = v => { const s = String(v || ""); if (s.length <= 4) return s; const dots = "•".repeat(s.length - 4); return (s.length === 12 ? dots.replace(/(.{4})/g, "$1 ").trim() : dots) + " " + s.slice(-4); };
  DX.rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  DX.seeder = seed => { const r = DX.rng(seed); return { r, pick: a => a[Math.floor(r() * a.length)], int: (a, b) => a + Math.floor(r() * (b - a + 1)), flt: (a, b, d = 2) => +(a + r() * (b - a)).toFixed(d), chance: p => r() < p }; };
  DX.sum = (rows, f) => rows.reduce((s, r) => s + (+(typeof f === "function" ? f(r) : r[f]) || 0), 0);
  DX.groupCount = (rows, f) => { const m = {}; rows.forEach(r => { const k = typeof f === "function" ? f(r) : r[f]; if (k) m[k] = (m[k] || 0) + 1; }); return m; };
  DX.isImg = v => /^(blob:|data:image)/.test(String(v)) || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)(\?|$)/i.test(String(v));
  DX.resolvers = [];
  DX.label = v => { if (v == null || v === "") return ""; for (const r of DX.resolvers) { try { const x = r(v); if (x) return x; } catch (_) { /* ignore */ } } return v; };
  // warehouses named after a Contractor at Project ("CP-22206 - JEWPL") read as the contractor’s name
  DX.whLabel = w => String(w || "").replace(/^(CP-\d+)(?= - )/, id => { const n = DX.label(id); return n && n !== id ? n : id; });
  DX.pending = new Set(); // in-flight photo uploads; DX.save waits for them
  // Phone photos are 3–12 MB: re-encode to ≤1600 px JPEG before upload (keeps the original if the browser can’t decode it, e.g. HEIC)
  DX.shrink = (file, max = 1600) => new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 350000) return resolve(file);
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { try { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => { URL.revokeObjectURL(url); resolve(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.82); } catch (_) { URL.revokeObjectURL(url); resolve(file); } };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
  DX.uid = (p = "") => p + Math.random().toString(36).slice(2, 8).toUpperCase();

  /* ---------------------------------------------------------------- icons
     DUX thin-stroke set (24×24, 1.7 stroke). Base glyphs verbatim from components/brand/Icon.jsx; the rest drawn in the same style. */
  DX.ICONS = {
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    truck: '<path d="M3 7h11v8H3z"/><path d="M14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
    building: '<path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M15 9h3a1 1 0 0 1 1 1v11"/><path d="M9 8h2M9 12h2M9 16h2"/><path d="M3 21h18"/>',
    rupee: '<path d="M7 5h10M7 9h10M16 5c0 4-3.5 5-6.5 5L16 19"/><path d="M7 9h3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sparkle: '<path d="M12 3l1.6 4.8L18 9.4l-4.4 1.6L12 16l-1.6-5L6 9.4l4.4-1.6z"/><path d="M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>', moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    chevron: '<path d="m15 18-6-6 6-6"/>', layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 20v-4h4"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
    download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', chart: '<path d="M3.5 20.5h17"/><path d="M7 16.5v-5M12 16.5V6.5M17 16.5v-8"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    file: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5M9 13h6M9 16.5h4"/>',
    play: '<circle cx="12" cy="12" r="8.5"/><path d="m10.2 8.8 5 3.2-5 3.2z"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/>', alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    phone: '<path d="M5 4h3.5l1.6 4.2-2.2 1.4a11 11 0 0 0 6.5 6.5l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
    idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14 10h4M14 13.5h3"/>',
    pipe: '<path d="M3 8.5h6.5a2.5 2.5 0 0 1 2.5 2.5v2a2.5 2.5 0 0 0 2.5 2.5H21"/><path d="M3 5.5v6M21 12.5v6"/>',
    home: '<path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20 20 4"/>',
    minus: '<path d="M5 12h14"/>', down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    fuel: '<path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15"/><path d="M3 20h12"/><path d="M6.5 8h5"/><path d="M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
    droplet: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
    wrench: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l1.1 1.1-8.9 8.9a2.1 2.1 0 0 1-3-3l8.9-8.9z"/><path d="M14.5 5.5 17 3l4 4-2.5 2.5"/>',
    beam: '<path d="M4 6h16M4 18h16"/><path d="M12 6v12"/><path d="M8 6v1.5M16 6v1.5M8 18v-1.5M16 18v-1.5"/>',
    mixer: '<path d="M3 17h10l2-6h4l2 3v3h-2"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17" cy="18.5" r="1.6"/><path d="M5 11l5-5 3 3-5 5z"/>',
    card: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    flow: '<circle cx="5.5" cy="12" r="2"/><circle cx="18.5" cy="6" r="2"/><circle cx="18.5" cy="18" r="2"/><path d="M7.5 12h4l5-5.2M11.5 12l5 5.2"/>',
    inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>', gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 13 4-4"/><path d="M4 17h2M18 17h2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    apps: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    upload: '<path d="M12 20V9"/><path d="m7 13 5-5 5 5"/><path d="M5 4h14"/>', dots: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>'
  };
  const ic = (DX.ic = (n, s = 18) => `<svg class="dx-ico" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DX.ICONS[n] || DX.ICONS.sparkle}</svg>`);

  /* ---------------------------------------------------------------- primitives */
  let root = null;
  DX.mount = el => { root = el; };
  DX.$ = (s, el) => (el || root).querySelector(s);
  DX.$$ = (s, el) => Array.from((el || root).querySelectorAll(s));

  DX.toast = (msg, tone = "ok") => {
    const box = DX.$(".dx-toasts");
    const t = document.createElement("div");
    t.className = "dx-toast";
    t.innerHTML = `<span class="dx-tile dx-tile-${tone === "err" ? "pending" : "ok"}">${ic(tone === "err" ? "alert" : "check", 15)}</span><span>${msg}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, tone === "err" ? 3800 : 2600);
  };
  let modalClose = null;
  DX.openModal = ({ title, sub, body, foot, wide, onClose }) => {
    DX.closeModal();
    const scrim = document.createElement("div"); scrim.className = "dx-scrim";
    const wrap = document.createElement("div"); wrap.className = "dx-modalwrap";
    wrap.innerHTML = `<div class="dx-modal${wide ? " dx-modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="dx-modal-head"><div style="flex:1;min-width:0"><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ""}</div><button class="dx-ibtn dx-ibtn-ghost" data-modal-x aria-label="Close">${ic("close", 16)}</button></div>
      <div class="dx-modal-body">${body}</div>${foot ? `<div class="dx-modal-foot">${foot}</div>` : ""}</div>`;
    root.append(scrim, wrap);
    const onKey = e => { if (e.key === "Escape") DX.closeModal(); };
    wrap.addEventListener("click", e => { if (e.target === wrap || e.target.closest("[data-modal-x]")) DX.closeModal(); });
    document.addEventListener("keydown", onKey);
    modalClose = () => { scrim.remove(); wrap.remove(); document.removeEventListener("keydown", onKey); modalClose = null; if (onClose) onClose(); };
    const m = wrap.querySelector(".dx-modal");
    const f = m.querySelector("[autofocus]") || m.querySelector(".dx-modal-foot .dx-btn-primary");
    if (f) setTimeout(() => f.focus(), 30);
    return m;
  };
  DX.closeModal = () => { if (modalClose) modalClose(); };
  DX.confirm = ({ title, sub, body = "", ok = "Confirm", tone = "primary", noOk }) => new Promise(resolve => {
    let done = false;
    const m = DX.openModal({ title, sub, body, foot: `<button class="dx-btn dx-btn-ghost" data-c="0">${noOk ? "Close" : "Cancel"}</button>${noOk ? "" : `<button class="dx-btn dx-btn-${tone}" data-c="1">${ok}</button>`}` });
    const prev = modalClose;
    modalClose = () => { prev(); if (!done) resolve(false); };
    m.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; done = true; resolve(b.dataset.c === "1"); DX.closeModal(); });
  });

  /* searchable combo / bottom sheet */
  const Combo = (DX.Combo = {
    pop: null, scrim: null, trigger: null, opts: [], onPick: null, active: -1,
    open(trigger, { options, value, onPick, title, placeholder, sheet, search }) {
      this.close();
      this.trigger = trigger; this.opts = options; this.onPick = onPick; this.value = value; this.search = search || null; this.seq = 0;
      sheet = sheet || DX.forceSheet || window.matchMedia("(max-width:640px)").matches;
      const pop = document.createElement("div");
      pop.className = "dx-pop" + (sheet ? " dx-sheet" : "");
      pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", title || "Choose");
      pop.innerHTML = `${sheet ? `<div class="dx-sheet-grab"></div><div class="dx-sheet-title">${esc(title || "Choose")}</div>` : ""}
        <div class="dx-pop-search">${ic("search", 15)}<input type="search" placeholder="${esc(placeholder || "Search…")}" aria-label="Search options" autocomplete="off"></div>
        <div class="dx-pop-list" role="listbox"></div>`;
      if (sheet) { this.scrim = document.createElement("div"); this.scrim.className = "dx-scrim"; this.scrim.addEventListener("click", () => this.close()); root.appendChild(this.scrim); }
      root.appendChild(pop); this.pop = pop;
      trigger.setAttribute("aria-expanded", "true");
      const input = pop.querySelector("input");
      let t;
      // search(q) -> Promise<options>: the server filters (large masters such as 12k HSC numbers)
      const remote = q => { const my = ++this.seq; this.pop.querySelector(".dx-pop-list").innerHTML = `<div class="dx-pop-empty">Searching…</div>`; Promise.resolve(this.search(q)).then(list => { if (my !== this.seq || !this.pop) return; this.opts = list || []; this.renderList(q); }, err => { if (my === this.seq && this.pop) this.pop.querySelector(".dx-pop-list").innerHTML = `<div class="dx-pop-empty">${esc(err.message)}</div>`; }); };
      input.addEventListener("input", () => { if (!this.search) return this.renderList(input.value); clearTimeout(t); t = setTimeout(() => remote(input.value.trim()), 260); });
      if (this.search) remote("");
      input.addEventListener("keydown", e => this.key(e));
      pop.addEventListener("click", e => { const o = e.target.closest(".dx-opt"); if (o) this.pick(o.dataset.v); });
      if (!this.search) this.renderList("");
      if (!sheet) this.place();
      if (!sheet || options.length > 8) setTimeout(() => input.focus(), 20);
    },
    renderList(q) {
      const list = this.pop.querySelector(".dx-pop-list"), s = q.toLowerCase().trim();
      const shown = this.search ? this.opts : this.opts.filter(o => !s || (o.label + " " + (o.sub || "") + " " + o.value).toLowerCase().includes(s));
      let html = "", g = null;
      if (!s && this.opts.allowClear) html += `<button type="button" class="dx-opt" data-v=""><span class="dx-muted">Clear selection</span></button>`;
      shown.slice(0, 400).forEach(o => {
        if (o.group && o.group !== g) { g = o.group; html += `<div class="dx-eyebrow dx-pop-group">${esc(g)}</div>`; }
        html += `<button type="button" class="dx-opt" role="option" data-v="${esc(o.value)}" aria-selected="${o.value === this.value}"><span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</button>`;
      });
      list.innerHTML = html || `<div class="dx-pop-empty">Nothing matches “${esc(q)}”.</div>`;
      this.active = -1;
      const sel = list.querySelector('[aria-selected="true"]'); if (sel && !s) sel.scrollIntoView({ block: "nearest" });
    },
    key(e) {
      const items = DX.$$(".dx-opt", this.pop);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.active = Math.max(0, Math.min(items.length - 1, this.active + (e.key === "ArrowDown" ? 1 : -1)));
        items.forEach((it, i) => it.classList.toggle("active", i === this.active));
        if (items[this.active]) items[this.active].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") { e.preventDefault(); const it = items[this.active >= 0 ? this.active : 0]; if (it) this.pick(it.dataset.v); }
      else if (e.key === "Escape") { e.preventDefault(); this.close(true); }
    },
    pick(v) { const cb = this.onPick, t = this.trigger; this.close(); if (cb) cb(v); if (t && t.isConnected) t.focus(); },
    place(keep) {
      if (!this.pop || this.pop.classList.contains("dx-sheet")) return;
      const r = this.trigger.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) {
        if (!keep) return this.close();
        // keyboard pushed the trigger out of view: bring it back (the scroll re-places the popover)
        return this.trigger.scrollIntoView({ block: "nearest" });
      }
      const w = Math.min(Math.max(r.width, 280), innerWidth - 16);
      this.pop.style.width = w + "px";
      this.pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
      const below = innerHeight - r.bottom, h = Math.min(340, this.pop.scrollHeight);
      if (below < h + 12 && r.top > below) { this.pop.style.top = ""; this.pop.style.bottom = (innerHeight - r.top + 6) + "px"; }
      else { this.pop.style.bottom = ""; this.pop.style.top = (r.bottom + 6) + "px"; }
    },
    close(refocus) {
      if (this.pop) this.pop.remove(); if (this.scrim) this.scrim.remove();
      if (this.trigger) { this.trigger.setAttribute("aria-expanded", "false"); if (refocus) this.trigger.focus(); }
      this.pop = this.scrim = null; this.trigger = null;
    }
  });
  window.addEventListener("scroll", () => Combo.place(), true);
  // The phone keyboard resizes the page HEIGHT only (APK adjustResize, /ops/m interactive-widget=resizes-content),
  // and it opens the moment the search box is focused — so keep the combo open then; close only when the WIDTH changes (rotation / window resize).
  let comboW = innerWidth;
  window.addEventListener("resize", () => { if (innerWidth !== comboW) { comboW = innerWidth; return Combo.close(); } Combo.place(true); });
  document.addEventListener("mousedown", e => { if (Combo.pop && !Combo.pop.contains(e.target) && e.target !== Combo.trigger && !(Combo.trigger && Combo.trigger.contains(e.target))) Combo.close(); });
  DX.opts = (list, sub) => list.map(v => (typeof v === "object" ? v : { value: v, label: v, sub: sub ? sub(v) : "" }));

  /* ---------------------------------------------------------------- display blocks */
  const TONES = { ok: "dx-status-ok", pending: "dx-status-pending", err: "dx-status-err", iris: "dx-status-iris", cyan: "dx-status-cyan", draft: "" };
  DX.status = (label, tone) => `<span class="dx-status ${TONES[tone] || ""}">${esc(label)}</span>`;
  DX.statusOf = (app, row) => { const s = app.status ? app.status(row) : null; return s ? DX.status(s[0], s[1]) : ""; };
  DX.kpi = ({ label, value, unit, sub, icon, tone }) => `<div class="dx-card dx-kpi"><div class="dx-kpi-top"><span class="dx-eyebrow">${label}</span><span class="dx-tile${tone ? " dx-tile-" + tone : ""}">${ic(icon || "chart", 15)}</span></div><div class="dx-kpi-val">${value}${unit ? `<small>${unit}</small>` : ""}</div>${sub ? `<div class="dx-kpi-sub">${sub}</div>` : ""}</div>`;
  DX.num = (v, d = 0) => `<span class="dx-num">${nf(v, d)}</span>`;
  DX.empty = (t, p, btn) => `<div class="dx-empty"><span class="dx-tile">${ic("search", 20)}</span><b>${t}</b><p>${p}</p>${btn || ""}</div>`;
  DX.bars = (rows, { unit = "", max, fmt } = {}) => {
    const m = max || Math.max(1, ...rows.map(r => r.value));
    return rows.map(r => `<div class="dx-barrow"><div class="dx-barrow-label">${esc(r.label)}${r.sub ? `<span>${esc(r.sub)}</span>` : ""}</div><div class="dx-bar"><i style="width:${Math.max(2, Math.round(r.value / m * 100))}%"></i></div><span class="dx-num dx-barrow-val">${fmt ? fmt(r.value) : nf(r.value)}${unit ? `<small> ${unit}</small>` : ""}</span></div>`).join("") || DX.empty("No data yet", "Numbers appear here once entries are recorded.");
  };
  DX.card = (title, body, { icon = "layers", tone = "", sub = "", action = "", accent = false, pad = false } = {}) =>
    `<section class="dx-card${accent ? " dx-card-accent" : ""}"><div class="dx-card-head"><span class="dx-tile${tone ? " dx-tile-" + tone : ""}">${ic(icon, 15)}</span><h3>${title}${sub ? ` <span class="dx-sub">· ${sub}</span>` : ""}</h3>${action}</div>${pad ? `<div class="dx-card-body">${body}</div>` : body}</section>`;
  DX.cellValue = (col, r) => {
    const v = typeof col.get === "function" ? col.get(r) : r[col.f];
    if (col.type === "status") return v || "";
    if (v === "" || v == null) return '<span class="dx-faint">—</span>';
    if (col.type === "num") return nf(v, col.d || 0) + (col.unit ? `<small class="dx-muted"> ${col.unit}</small>` : "");
    if (col.type === "money") return DX.money(v, col.d || 0);
    if (col.type === "date") return DX.fmtDate(v);
    if (col.type === "mask") return esc(DX.maskId(v));
    if (col.type === "html") return v;
    return esc(v);
  };
  DX.table = (cols, rows, { go, foot, maxh } = {}) => `<div class="dx-tablewrap"${maxh ? ` style="max-height:${maxh}"` : ""}><table class="dx-table"><thead><tr>${cols.map(c => `<th class="${["num", "money"].includes(c.type) ? "num" : ""}${c.hideSm ? " dx-hide-sm" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(r => `<tr${go ? ` class="dx-click" tabindex="0" data-go="${esc(go(r))}"` : ""}>${cols.map(c => `<td class="${["num", "money"].includes(c.type) ? "num" : ""}${c.type === "date" || c.type === "mono" || c.type === "mask" ? " dx-mono dx-td-mono" : ""}${c.strong ? " strong" : ""}${c.hideSm ? " dx-hide-sm" : ""}${c.trunc ? " dx-trunc" : ""}">${DX.cellValue(c, r)}</td>`).join("")}</tr>`).join("")}
    </tbody>${foot ? `<tfoot><tr>${cols.map((c, i) => `<td class="${["num", "money"].includes(c.type) ? "num" : ""}${c.hideSm ? " dx-hide-sm" : ""}">${i === 0 ? "Total" : c.total ? (c.type === "money" ? DX.money(DX.sum(rows, c.get || c.f)) : nf(DX.sum(rows, c.get || c.f), c.d || 0)) : ""}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`;
  DX.pill = (icon, k, v, key, tint = "", num) => `<span class="dx-pill"><span class="dx-tile${tint ? " dx-tile-" + tint : ""}">${ic(icon, 13)}</span><span class="dx-pill-k">${k}:</span><span class="dx-pill-v${num ? " dx-mono" : ""}"${num ? ' style="color:var(--cyan);font-size:12px"' : ""}>${esc(v)}</span>${key ? `<button class="dx-pill-x" data-unpill="${esc(key)}" aria-label="Remove ${esc(k)} filter">${ic("close", 12)}</button>` : ""}</span>`;
  DX.csv = (cols, rows, filename) => {
    const head = cols.map(c => `"${c.label}"`).join(",");
    const body = rows.map(r => cols.map(c => { const v = typeof c.get === "function" ? c.get(r) : r[c.f]; return `"${String(v == null ? "" : v).replace(/<[^>]+>/g, "").replace(/"/g, '""')}"`; }).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + head + "\r\n" + body], { type: "text/csv;charset=utf-8" }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    DX.toast(`Exported <span class="dx-num">${rows.length}</span> rows to ${esc(filename)}`);
  };

  /* ---------------------------------------------------------------- form engine
     Field types: text, digits(len), int (stepper), float (unit), select (seg ≤6 / combo), link (combo, options(doc), parent),
     date, time, check, textarea, photo, gps, computed(calc), table(columns), info(html). */
  DX.fields = app => app.form.flatMap(s => s.fields.map(f => Object.assign({ section: s.id }, f)));
  DX.blank = app => { const d = { name: "", _new: true }; DX.fields(app).forEach(f => { d[f.f] = f.default !== undefined ? (typeof f.default === "function" ? f.default() : f.default) : f.type === "int" || f.type === "float" ? 0 : f.type === "table" ? [] : f.type === "check" ? 0 : ""; }); return d; };
  const hasVal = v => v !== "" && v != null && !(Array.isArray(v) && !v.length);
  DX.validate = (app, doc, forSubmit) => {
    const e = {};
    DX.fields(app).forEach(f => {
      if (f.showIf && !f.showIf(doc)) return;
      const v = doc[f.f];
      if ((f.req || (forSubmit && f.reqSubmit)) && (f.type === "int" || f.type === "float" ? !(+v > 0) : !hasVal(v))) e[f.f] = f.reqMsg || (f.type === "gps" ? "Capture the GPS location." : f.type === "photo" ? `Add the ${f.label.toLowerCase()}.` : f.type === "link" || f.type === "select" ? `Pick ${/^[aeiou]/i.test(f.label) ? "an" : "a"} ${f.label.toLowerCase()}.` : `Enter ${f.label.toLowerCase()}.`);
      if (f.type === "digits" && hasVal(v) && String(v).length !== f.len) e[f.f] = `${f.label} needs exactly ${f.len} digits — ${String(v).length} entered.`;
      if (f.type === "table" && f.minRows && (v || []).length < f.minRows) e[f.f] = `Add at least ${f.minRows} row${f.minRows > 1 ? "s" : ""}.`;
      if ((f.type === "float" || f.type === "int") && f.max != null && +v > f.max) e[f.f] = `${f.label} can’t be more than ${nf(f.max)}.`;
    });
    if (app.validate) Object.assign(e, app.validate(doc, forSubmit) || {});
    return e;
  };

  function fieldHTML(app, f, doc, mode) {
    const v = doc[f.f], id = `dx-f-${f.f}`;
    const lbl = f.type === "info" ? "" : `<label class="dx-label" ${["select", "photo", "gps", "check", "table", "computed"].includes(f.type) ? "" : `for="${id}"`}>${esc(f.label)}${f.req ? '<span class="dx-req" aria-hidden="true">*</span>' : ""}${f.reqSubmit ? '<span class="dx-faint" style="font-weight:400">· needed to submit</span>' : ""}</label>`;
    const ro = mode === "edit" && f.lockOnEdit;
    let inner = "";
    switch (f.type) {
      case "digits": inner = `<div class="dx-inwrap"><input class="dx-input dx-mono" id="${id}" data-in="${f.f}" data-digits="${f.len}" inputmode="numeric" maxlength="${f.len}" placeholder="${f.len} digits" value="${esc(v)}" autocomplete="off"><span class="dx-count" data-count="${f.f}"></span></div>`; break;
      case "int": inner = `<div class="dx-stepper${f.big ? " dx-stepper-lg" : ""}" data-stepper="${f.f}"><button type="button" data-step="-1" aria-label="Less">${ic("minus", f.big ? 16 : 14)}</button><input id="${id}" type="number" inputmode="numeric" min="0" step="1" data-in="${f.f}" value="${+v || 0}"><button type="button" data-step="1" aria-label="More">${ic("plus", f.big ? 16 : 14)}</button></div>`; break;
      case "float": inner = `<div class="dx-inwrap"><input class="dx-input dx-mono" id="${id}" type="number" inputmode="decimal" step="${f.step || "any"}" min="0" data-in="${f.f}" value="${+v ? v : ""}" placeholder="0"${f.unit ? ' style="padding-right:62px"' : ""}>${f.unit ? `<span class="dx-count">${esc(f.unit)}</span>` : ""}</div>`; break;
      case "select": {
        const o = typeof f.options === "function" ? f.options(doc) : f.options;
        inner = o.length <= (f.segMax || 6)
          ? `<div class="dx-seg" role="radiogroup" aria-label="${esc(f.label)}">${o.map(x => { const val = typeof x === "object" ? x.value : x, l = typeof x === "object" ? x.label : x; return `<button type="button" role="radio" data-sel="${f.f}" data-v="${esc(val)}" aria-pressed="${v === val}">${esc(l)}</button>`; }).join("")}</div>`
          : `<button type="button" class="dx-combo" id="${id}" data-combo="${f.f}" aria-haspopup="listbox" aria-expanded="false"><span class="dx-combo-val"></span>${ic("down", 16)}</button>`;
        break;
      }
      case "link": inner = `<button type="button" class="dx-combo" id="${id}" data-combo="${f.f}" aria-haspopup="listbox" aria-expanded="false"${ro ? " disabled" : ""}><span class="dx-combo-val"></span>${ic("down", 16)}</button>`; break;
      case "date": inner = `<input class="dx-input" type="date" id="${id}" data-in="${f.f}" value="${esc(v)}"${ro ? " readonly" : ""}>`; break;
      case "time": inner = `<input class="dx-input" type="time" id="${id}" data-in="${f.f}" value="${esc(v)}">`; break;
      case "check": inner = `<button type="button" class="dx-switch" role="switch" data-check="${f.f}" aria-checked="${!!+v}"><i></i><span>${esc(f.on || "Yes")}</span></button>`; break;
      case "textarea": inner = `<textarea class="dx-input dx-textarea" id="${id}" data-in="${f.f}" rows="3" placeholder="${esc(f.ph || "")}">${esc(v)}</textarea>`; break;
      case "computed": inner = `<div class="dx-computed" data-computed="${f.f}"></div>`; break;
      case "photo": inner = `<div class="dx-photoslot" data-photoslot="${f.f}"></div>`; break;
      case "gps": inner = `<div class="dx-gps" data-gps="${f.f}"></div>`; break;
      case "table": inner = `<div class="dx-child" data-child="${f.f}"></div>`; break;
      case "info": inner = `<div class="dx-hint">${ic(f.icon || "sparkle", 16)}<span data-info="${f.f}"></span></div>`; break;
      default: inner = `<input class="dx-input" id="${id}" data-in="${f.f}" value="${esc(v)}" placeholder="${esc(f.ph || "")}"${ro ? " readonly" : ""}${f.max ? ` maxlength="${f.max}"` : ""} autocomplete="off">`;
    }
    const span = f.span === "all" ? " dx-span-all" : f.span === 2 ? " dx-span-2" : "";
    return `<div class="dx-field${span}" data-field="${f.f}"${f.showIf && !f.showIf(doc) ? ' hidden' : ""}>${lbl}${inner}<div class="dx-msg" id="dx-msg-${f.f}">${esc(ro ? "Can’t be changed after the entry is created." : f.hint || "")}</div></div>`;
  }

  DX.formHTML = (app, doc, mode) => {
    const secs = app.form.filter(s => !s.showIf || s.showIf(doc));
    return `<nav class="dx-steps" aria-label="Form sections">${secs.map((s, i) => `<button type="button" class="dx-stepchip" data-jump="${s.id}"><i>${i + 1}</i>${esc(s.short || s.title)}<span class="dx-mono" data-stepnote="${s.id}"></span></button>`).join("")}</nav>
      <form class="dx-form" novalidate autocomplete="off" data-dxform="${app.key}">
      ${secs.map((s, i) => `<section class="dx-card dx-card-visible dx-section${i === 0 ? " dx-card-accent" : ""}" id="sec-${s.id}" data-sec="${s.id}"><div class="dx-card-head"><span class="dx-tile${s.tone ? " dx-tile-" + s.tone : ""}">${ic(s.icon || "layers", 15)}</span><h3>${esc(s.title)}${s.sub ? ` <span class="dx-sub">· ${esc(s.sub)}</span>` : ""}</h3></div>
        <div class="dx-card-body"><div class="dx-grid${s.cols === 2 ? " dx-grid-2" : s.cols === 4 ? " dx-grid-4" : ""}">${s.fields.map(f => fieldHTML(app, f, doc, mode)).join("")}</div></div></section>`).join("")}
      </form>`;
  };

  // Form controller: owns doc state + repaints of dynamic parts. ctl.onChange hook for app side-effects.
  DX.formCtl = (app, doc, mode, host) => {
    const F = { app, doc, mode, dirty: false, errors: {} };
    const fields = DX.fields(app), byF = Object.fromEntries(fields.map(f => [f.f, f]));
    const q = s => host.querySelector(s);
    F.optionsFor = f => { const o = typeof f.options === "function" ? f.options(doc) : f.options; return DX.opts(o || []); };
    F.paintCombo = f => {
      const b = q(`[data-combo="${f.f}"]`); if (!b) return;
      const v = doc[f.f], parentMissing = (f.parent || []).some(p => !doc[p]);
      if (f.parent) b.disabled = parentMissing || (mode === "edit" && f.lockOnEdit);
      const o = v ? F.optionsFor(f).find(x => x.value === v) : null;
      b.querySelector(".dx-combo-val").outerHTML = v ? `<span class="dx-combo-val">${esc(o ? o.label : f.display ? f.display(v) : DX.label(v))}${o && o.sub && f.showSub !== false ? `<small>${esc(o.sub)}</small>` : ""}</span>` : `<span class="dx-combo-val ph">${esc(parentMissing ? `Pick ${byF[f.parent.find(p => !doc[p])].label.toLowerCase()} first` : f.ph || "Select " + f.label.toLowerCase())}</span>`;
    };
    F.paintDigits = f => { const c = q(`[data-count="${f.f}"]`), w = q(`[data-field="${f.f}"]`); if (!c) return; const n = String(doc[f.f] || "").length, ok = n === f.len; w.classList.toggle("ok", ok); c.innerHTML = ok ? `${ic("check", 13)}${f.len}/${f.len}` : `${n}/${f.len}`; };
    F.paintComputed = () => fields.filter(f => f.type === "computed").forEach(f => { const el = q(`[data-computed="${f.f}"]`); if (!el) return; const val = f.calc(doc); doc[f.f] = val; if (f.text) { el.innerHTML = val ? `<span style="font-weight:500">${esc(val)}</span>` : `<span class="dx-faint">${esc(f.ph || "Filled automatically")}</span>`; return; } el.innerHTML = `<span class="dx-num">${f.money ? DX.money(val, f.d || 0) : nf(val, f.d ?? 2)}</span>${f.unit ? `<small>${esc(f.unit)}</small>` : ""}${f.formula ? `<span class="dx-computed-f">${esc(f.formula)}</span>` : ""}`; });
    F.paintInfo = () => fields.filter(f => f.type === "info").forEach(f => { const el = q(`[data-info="${f.f}"]`); if (el) el.innerHTML = f.html(doc); });
    F.paintPhoto = f => {
      const el = q(`[data-photoslot="${f.f}"]`); if (!el) return;
      const v = doc[f.f];
      const up = F.uploading && F.uploading[f.f];
      el.innerHTML = v ? `<div class="dx-photo filled" data-lb="${f.f}" role="button" tabindex="0" aria-label="View ${esc(f.label)}">${v.startsWith("demo:") ? `<span class="dx-demo-img">${ic(f.icon || "image", 26)}</span>` : DX.isImg(v) ? `<img src="${esc(v)}" alt="${esc(f.label)}">` : `<span class="dx-demo-img">${ic(/\.pdf$/i.test(v) ? "file" : "play", 26)}</span>`}<span class="dx-photo-tag">${up ? "Uploading…" : esc(f.label)}</span>${up ? `<span class="dx-photo-up">${ic("refresh", 18)}</span>` : `<button type="button" class="dx-photo-x" data-rmphoto="${f.f}" aria-label="Remove ${esc(f.label)}">${ic("trash", 14)}</button>`}</div>`
        : `<label class="dx-photo">${ic(f.icon || "camera", 24)}<span class="dx-photo-b">${esc(f.label)}</span><span style="font-size:11.5px">${f.accept ? "Tap to add" : "Tap to capture"}</span><input type="file" accept="${esc(f.accept || "image/*")}" ${f.accept ? "" : 'capture="environment"'} data-photo="${f.f}"></label>`;
    };
    F.paintGps = f => {
      const el = q(`[data-gps="${f.f}"]`); if (!el) return;
      const [la, lo] = [doc[f.f + "_lat"] ?? doc.latitude, doc[f.f + "_lng"] ?? doc.longitude];
      el.innerHTML = hasVal(doc[f.f]) ? `<span class="dx-tile dx-tile-ok">${ic("pin", 16)}</span><div class="dx-gps-vals"><div><span class="dx-eyebrow">Latitude</span><span class="dx-num">${(+doc[f.f].split(",")[0]).toFixed(6)}</span></div><div><span class="dx-eyebrow">Longitude</span><span class="dx-num">${(+doc[f.f].split(",")[1]).toFixed(6)}</span></div></div><button type="button" class="dx-btn dx-btn-secondary dx-btn-sm" data-gpsbtn="${f.f}">${ic("refresh", 13)}Recapture</button>`
        : `<span class="dx-tile">${ic("target", 16)}</span><div style="flex:1 1 180px;min-width:0"><div style="font-weight:500">Location not captured</div><div class="dx-muted" style="font-size:12.5px">Comes from the device — can’t be typed.</div></div><button type="button" class="dx-btn dx-btn-primary dx-btn-sm" data-gpsbtn="${f.f}">${ic("target", 14)}Capture</button>`;
      void la; void lo;
    };
    F.paintChild = f => {
      const el = q(`[data-child="${f.f}"]`); if (!el) return;
      const rows = doc[f.f] || [];
      const cols = f.columns;
      el.innerHTML = `<div class="dx-tablewrap"><table class="dx-table dx-childtable"><thead><tr><th class="dx-idx">#</th>${cols.map(c => `<th class="${["int", "float"].includes(c.type) || c.calc ? "num" : ""}">${esc(c.label)}</th>`).join("")}<th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td class="dx-idx dx-mono">${i + 1}</td>${cols.map(c => {
          if (c.calc) return `<td class="num"><span class="dx-num">${nf(c.calc(r, doc), c.d ?? 2)}</span></td>`;
          if (c.ro) return `<td class="${["int", "float"].includes(c.type) ? "num" : ""}">${["int", "float"].includes(c.type) ? `<span class="dx-num">${nf(r[c.f], c.d ?? 2)}</span>` : esc(r[c.f] ?? "")}</td>`;
          if (c.type === "select" || c.type === "link") { const o = DX.opts(typeof c.options === "function" ? c.options(doc, r) : c.options); return `<td><select class="dx-input dx-input-sm" data-crow="${i}" data-ccol="${c.f}" data-cf="${f.f}"><option value=""></option>${o.map(x => `<option value="${esc(x.value)}"${x.value === r[c.f] ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></td>`; }
          return `<td class="${["int", "float"].includes(c.type) ? "num" : ""}"><input class="dx-input dx-input-sm${["int", "float"].includes(c.type) ? " dx-mono" : ""}" ${["int", "float"].includes(c.type) ? `type="number" inputmode="decimal" step="${c.type === "int" ? 1 : "any"}" min="0"` : ""} data-crow="${i}" data-ccol="${c.f}" data-cf="${f.f}" value="${esc(r[c.f] ?? "")}"></td>`;
        }).join("")}<td><button type="button" class="dx-ibtn dx-ibtn-ghost" data-rmrow="${i}" data-cf="${f.f}" aria-label="Remove row ${i + 1}">${ic("trash", 14)}</button></td></tr>`).join("") || `<tr><td colspan="${cols.length + 2}" class="dx-muted" style="text-align:center;padding:16px">No rows yet</td></tr>`}
        </tbody>${rows.length && cols.some(c => c.total) ? `<tfoot><tr><td></td>${cols.map(c => `<td class="num">${c.total ? `<span class="dx-num">${nf(DX.sum(rows, r => c.calc ? c.calc(r, doc) : r[c.f]), c.d ?? 2)}</span>` : ""}</td>`).join("")}<td></td></tr></tfoot>` : ""}</table></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${f.fill ? `<button type="button" class="dx-btn dx-btn-primary dx-btn-sm" data-fillrows="${f.f}">${ic(f.fill.icon || "refresh", 14)}${esc(f.fill.label)}</button>` : ""}${f.noAdd ? "" : `<button type="button" class="dx-btn dx-btn-secondary dx-btn-sm" data-addrow="${f.f}">${ic("plus", 14)}Add ${esc(f.rowLabel || "row")}</button>`}</div>`;
    };
    F.paintError = ff => { const w = q(`[data-field="${ff}"]`); if (!w) return; const m = q(`#dx-msg-${ff}`), err = F.errors[ff], f = byF[ff]; w.classList.toggle("err", !!err); if (m) m.textContent = err || (mode === "edit" && f && f.lockOnEdit ? "Can’t be changed after the entry is created." : (f && f.hint) || ""); };
    F.paintVisibility = () => fields.forEach(f => { if (!f.showIf) return; const w = q(`[data-field="${f.f}"]`); if (w) w.hidden = !f.showIf(doc); });
    F.paintSteps = () => {
      host.querySelectorAll(".dx-stepchip").forEach((b, i) => {
        const sec = app.form.find(s => s.id === b.dataset.jump); if (!sec) return;
        const fs = sec.fields.filter(f => !f.showIf || f.showIf(doc));
        const bad = fs.some(f => F.errors[f.f]);
        const need = fs.filter(f => f.req || f.type === "photo" || f.type === "gps");
        const done = need.length ? need.every(f => f.type === "int" || f.type === "float" ? +doc[f.f] > 0 : hasVal(doc[f.f])) : fs.some(f => hasVal(doc[f.f]) && doc[f.f] !== 0);
        b.classList.toggle("done", done && !bad); b.classList.toggle("bad", bad);
        b.querySelector("i").innerHTML = bad ? "!" : done ? ic("check", 13) : String(i + 1);
        const photos = fs.filter(f => f.type === "photo");
        b.querySelector("[data-stepnote]").textContent = photos.length ? `${photos.filter(f => doc[f.f]).length}/${photos.length}` : "";
      });
    };
    F.paintAll = () => {
      fields.forEach(f => {
        if (f.type === "link" || (f.type === "select" && q(`[data-combo="${f.f}"]`))) F.paintCombo(f);
        if (f.type === "digits") F.paintDigits(f);
        if (f.type === "photo") F.paintPhoto(f);
        if (f.type === "gps") F.paintGps(f);
        if (f.type === "table") F.paintChild(f);
      });
      F.paintComputed(); F.paintInfo(); F.paintVisibility(); F.paintSteps();
      if (F.onPaint) F.onPaint();
    };
    F.refresh = () => { F.syncInputs(null); F.paintAll(); };
    // values written by code (onSet hooks, parent clears, async lookups) must show in plain inputs too
    F.syncInputs = before => fields.forEach(x => { if (before && before[x.f] === doc[x.f]) return; const el = q(`#dx-f-${x.f}`); if (!el || el.tagName === "BUTTON" || !("value" in el) || el === document.activeElement) return; const nv = doc[x.f] == null ? "" : String(doc[x.f]); if (el.value !== nv) el.value = nv; });
    F.set = (ff, v) => {
      if (doc[ff] === v) return;
      const before = Object.assign({}, doc);
      doc[ff] = v; F.dirty = true;
      fields.filter(x => (x.parent || []).includes(ff)).forEach(ch => { const clear = c => { if (doc[c.f]) { doc[c.f] = ""; } fields.filter(y => (y.parent || []).includes(c.f)).forEach(clear); }; clear(ch); });
      const f = byF[ff];
      if (f && f.onSet) f.onSet(doc, v);
      F.syncInputs(before);
      if (F.errors[ff]) delete F.errors[ff];
      Object.keys(F.errors).forEach(k => { if (!DX.validate(app, doc, false)[k] && !byF[k]?.reqSubmit) delete F.errors[k]; });
      fields.forEach(x => F.paintError(x.f));
      F.paintAll();
    };
    host.addEventListener("input", e => {
      const el = e.target;
      if (el.dataset.cf) { const rows = doc[el.dataset.cf]; const col = byF[el.dataset.cf].columns.find(c => c.f === el.dataset.ccol); rows[+el.dataset.crow][el.dataset.ccol] = ["int", "float"].includes(col.type) ? (+el.value || 0) : el.value; F.dirty = true; host.querySelectorAll(`[data-child="${el.dataset.cf}"] tfoot, [data-child="${el.dataset.cf}"] .dx-num`).length && F.repaintChildCalc(el.dataset.cf); F.paintComputed(); F.paintInfo(); return; }
      const ff = el.dataset.in; if (!ff) return;
      const f = byF[ff];
      if (f.type === "digits") { const c = DX.digits(el.value).slice(0, f.len); if (c !== el.value) el.value = c; doc[ff] = c; F.paintDigits(f); }
      else if (f.type === "int") { doc[ff] = Math.max(0, parseInt(el.value, 10) || 0); }
      else if (f.type === "float") { doc[ff] = el.value === "" ? 0 : Math.max(0, +el.value); }
      else doc[ff] = el.value;
      F.dirty = true;
      if (f.onSet) f.onSet(doc, doc[ff]);
      if (F.errors[ff] && !DX.validate(app, doc, false)[ff]) { delete F.errors[ff]; F.paintError(ff); }
      F.paintComputed(); F.paintInfo(); F.paintVisibility(); F.paintSteps();
      if (F.onPaint) F.onPaint();
    });
    F.repaintChildCalc = cf => { const f = byF[cf]; const el = q(`[data-child="${cf}"]`); if (!el) return; const rows = doc[cf]; el.querySelectorAll("tbody tr").forEach((tr, i) => { let k = 0; f.columns.forEach((c, ci) => { if (c.calc) { const td = tr.children[ci + 1]; if (td) td.innerHTML = `<span class="dx-num">${nf(c.calc(rows[i], doc), c.d ?? 2)}</span>`; } k++; }); }); const tf = el.querySelector("tfoot tr"); if (tf) f.columns.forEach((c, ci) => { if (c.total) tf.children[ci + 1].innerHTML = `<span class="dx-num">${nf(DX.sum(rows, r => c.calc ? c.calc(r, doc) : r[c.f]), c.d ?? 2)}</span>`; }); };
    host.addEventListener("change", e => {
      const el = e.target;
      if (el.dataset.cf && el.tagName === "SELECT") {
        const tf = byF[el.dataset.cf], row = doc[el.dataset.cf][+el.dataset.crow], col = tf.columns.find(c => c.f === el.dataset.ccol);
        row[el.dataset.ccol] = el.value; F.dirty = true;
        // a column onSet may fill other cells of the row (e.g. UOM from the picked item) — repaint the table then
        if (col && col.onSet) { col.onSet(row, doc); F.paintChild(tf); } else F.repaintChildCalc(el.dataset.cf);
        F.paintComputed(); return;
      }
      if (el.type === "file" && el.dataset.photo) {
        const file = el.files && el.files[0], pf = byF[el.dataset.photo]; if (!file) return;
        const okType = pf.accept ? pf.accept.split(",").some(a => { a = a.trim().toLowerCase(); return a.endsWith("/*") ? (file.type || "").startsWith(a.slice(0, -1)) : a.startsWith(".") ? file.name.toLowerCase().endsWith(a) : file.type === a; }) : /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name);
        if (!okType) { DX.toast(pf.accept ? "That file type isn’t allowed here." : "That file isn’t an image — pick a photo.", "err"); return; }
        doc[pf.f] = URL.createObjectURL(file); F.dirty = true;
        if (F.errors[pf.f]) { delete F.errors[pf.f]; F.paintError(pf.f); }
        if (DX.live) {
          F.uploading = F.uploading || {}; F.uploading[pf.f] = true;
          const job = DX.shrink(file).then(small => DX.upload(small, pf.upload || {})).then(url => { if (doc[pf.f] && doc[pf.f].startsWith("blob:")) doc[pf.f] = url; }, err => { doc[pf.f] = ""; DX.toast(`${esc(pf.label)}: ${esc(err.message)}`, "err"); }).finally(() => { delete F.uploading[pf.f]; DX.pending.delete(job); F.paintPhoto(pf); F.paintSteps(); });
          DX.pending.add(job);
        }
        F.paintPhoto(pf); F.paintSteps();
      }
      if (el.type === "number" && el.value === "" && byF[el.dataset.in] && byF[el.dataset.in].type === "int") el.value = 0;
      const f = byF[el.dataset.in];
      if (f && f.type === "digits") { const er = DX.validate(app, doc, false)[f.f]; if (er) F.errors[f.f] = er; else delete F.errors[f.f]; F.paintError(f.f); F.paintSteps(); }
    });
    host.addEventListener("click", e => {
      const t = e.target;
      const cb = t.closest("[data-combo]");
      if (cb) {
        const f = byF[cb.dataset.combo];
        const open = () => { const o = F.optionsFor(f); if (!f.req) o.allowClear = true; Combo.open(cb, { title: "Select " + f.label.toLowerCase(), value: doc[f.f], options: o, placeholder: f.searchPh || "Search…", onPick: v => F.set(f.f, v), search: f.search ? q => Promise.resolve(f.search(q, doc)).then(list => { f._seen = f._seen || {}; (list || []).forEach(x => (f._seen[x.value] = x)); return list; }) : null }); };
        if (!f.load) return open();
        // options that come from the server (e.g. sub components of the picked component): load, then open
        if (cb.dataset.loading) return;
        cb.dataset.loading = "1"; cb.setAttribute("aria-busy", "true");
        Promise.resolve(f.load(doc)).then(open, err => DX.toast(esc(err.message), "err")).finally(() => { delete cb.dataset.loading; cb.removeAttribute("aria-busy"); });
        return;
      }
      const sel = t.closest("[data-sel]");
      if (sel) { F.set(sel.dataset.sel, sel.dataset.v); host.querySelectorAll(`[data-sel="${sel.dataset.sel}"]`).forEach(b => b.setAttribute("aria-pressed", b === sel)); return; }
      const stp = t.closest("[data-step]");
      if (stp) { const ff = stp.closest("[data-stepper]").dataset.stepper, inp = q(`#dx-f-${ff}`); inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + +stp.dataset.step); inp.dispatchEvent(new Event("input", { bubbles: true })); return; }
      const ch = t.closest("[data-check]");
      if (ch) { const on = ch.getAttribute("aria-checked") !== "true"; ch.setAttribute("aria-checked", on); F.set(ch.dataset.check, on ? 1 : 0); return; }
      const rm = t.closest("[data-rmphoto]");
      if (rm) { e.stopPropagation(); doc[rm.dataset.rmphoto] = ""; F.dirty = true; F.paintPhoto(byF[rm.dataset.rmphoto]); F.paintSteps(); return; }
      const lb = t.closest("[data-lb]");
      if (lb && !t.closest("[data-rmphoto]")) { const f = byF[lb.dataset.lb]; return DX.lightbox(doc[f.f], f.label, f.icon); }
      const g = t.closest("[data-gpsbtn]");
      if (g) { const ff = g.dataset.gpsbtn; g.disabled = true; g.innerHTML = `${ic("refresh", 13)}Locating…`; const done = (la, lo, demo) => { F.set(ff, `${la.toFixed(7)},${lo.toFixed(7)}`); DX.toast(demo ? "Browser location unavailable — demo coordinates used." : "Location captured.", demo ? "err" : "ok"); }; const demo = DX.live ? err => { g.disabled = false; g.innerHTML = `${ic("target", 14)}Try again`; DX.toast(err && err.code === 1 ? "Location permission is off — allow location for this app, then try again." : "Couldn’t get your location — move to open sky and try again.", "err"); } : () => done(25.1936 + (Math.random() - .5) * .05, 78.7429 + (Math.random() - .5) * .05, true); if (!navigator.geolocation) return setTimeout(demo, 400); navigator.geolocation.getCurrentPosition(p => done(p.coords.latitude, p.coords.longitude), demo, { enableHighAccuracy: true, timeout: DX.live ? 20000 : 6000, maximumAge: DX.live ? 20000 : 0 }); return; }
      const fill = t.closest("[data-fillrows]");
      if (fill) {
        const f = byF[fill.dataset.fillrows]; if (fill.disabled) return;
        fill.disabled = true;
        Promise.resolve().then(() => f.fill.run(doc)).then(rows => { doc[f.f] = rows; F.dirty = true; F.paintChild(f); F.paintComputed(); F.paintSteps(); if (F.errors[f.f]) { delete F.errors[f.f]; F.paintError(f.f); } DX.toast(f.fill.done ? f.fill.done(doc) : "Rows filled."); }, err => DX.toast(esc(err.message), "err")).finally(() => { fill.disabled = false; });
        return;
      }
      const add = t.closest("[data-addrow]");
      if (add) { const f = byF[add.dataset.addrow]; doc[f.f] = (doc[f.f] || []).concat(f.newRow ? f.newRow(doc) : {}); F.dirty = true; F.paintChild(f); F.paintComputed(); F.paintSteps(); if (F.errors[f.f]) { delete F.errors[f.f]; F.paintError(f.f); } return; }
      const rr = t.closest("[data-rmrow]");
      if (rr) { const f = byF[rr.dataset.cf]; doc[f.f].splice(+rr.dataset.rmrow, 1); F.dirty = true; F.paintChild(f); F.paintComputed(); return; }
      const j = t.closest("[data-jump]");
      if (j) { const s = host.querySelector("#sec-" + j.dataset.jump); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    F.showErrors = errs => {
      F.errors = errs; fields.forEach(f => F.paintError(f.f)); F.paintSteps();
      const first = fields.find(f => errs[f.f]); const el = first && q(`[data-field="${first.f}"]`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); const i = el.querySelector("input,button"); if (i) setTimeout(() => i.focus({ preventScroll: true }), 350); }
      DX.toast(`${Object.keys(errs).length === 1 ? "One field needs" : Object.keys(errs).length + " fields need"} attention.`, "err");
    };
    F.paintAll();
    DX.activeForm = F;
    return F;
  };
  DX.lightbox = (src, label, icon) => DX.openModal({ title: label, wide: true, body: `<div class="dx-lightbox">${String(src).startsWith("demo:") ? `<div style="position:relative;aspect-ratio:4/3;border-radius:12px;overflow:hidden"><span class="dx-demo-img">${ic(icon || "image", 30)}</span></div><p class="dx-muted" style="font-size:12.5px;margin-top:10px">Demo placeholder — real uploads show the captured image.</p>` : `<img src="${esc(src)}" alt="${esc(label)}">`}</div>` });

  /* detail (read-only) view from the form schema */
  DX.detailHTML = (app, d) => app.form.filter(s => !s.showIf || s.showIf(d)).map(s => {
    const fs = s.fields.filter(f => (!f.showIf || f.showIf(d)) && f.type !== "info");
    const photos = fs.filter(f => f.type === "photo"), tables = fs.filter(f => f.type === "table"), rest = fs.filter(f => f.type !== "photo" && f.type !== "table");
    const val = f => {
      const v = d[f.f];
      if (f.type === "computed") { const c = f.calc(d); if (f.text) return c ? esc(c) : '<span class="dx-faint">—</span>'; return `<span class="dx-num">${f.money ? DX.money(c, f.d || 0) : nf(c, f.d ?? 2)}</span>${f.unit ? ` <small class="dx-muted">${esc(f.unit)}</small>` : ""}`; }
      if (!hasVal(v) || (["int", "float"].includes(f.type) && !+v)) return '<span class="dx-faint">—</span>';
      if (f.type === "digits") return `<span class="dx-mono">${esc(f.mask ? DX.maskId(v) : v)}</span>`;
      if (f.type === "int" || f.type === "float") return `<span class="dx-num">${nf(v, f.type === "float" ? (f.d ?? 2) : 0)}</span>${f.unit ? ` <small class="dx-muted">${esc(f.unit)}</small>` : ""}`;
      if (f.type === "date") return `<span class="dx-mono">${DX.fmtDate(v)}</span>`;
      if (f.type === "check") return +v ? "Yes" : "No";
      if (f.type === "gps") return `<span class="dx-num" style="font-size:12.5px">${esc(v)}</span>`;
      if (f.type === "link" || f.type === "select") { const o = DX.opts((typeof f.options === "function" ? f.options(d) : f.options) || []).find(x => x.value === v); return esc(o ? o.label : f.display ? f.display(v) : DX.label(v)) + (o && o.sub && f.showSub !== false ? ` <small class="dx-muted dx-mono">${esc(o.sub)}</small>` : ""); }
      return esc(v);
    };
    return `<section class="dx-card"><div class="dx-card-head"><span class="dx-tile${s.tone ? " dx-tile-" + s.tone : ""}">${ic(s.icon || "layers", 15)}</span><h3>${esc(s.title)}</h3></div>
      ${rest.length ? `<div class="dx-kv">${rest.map(f => `<div class="k">${esc(f.label)}</div><div class="v">${val(f)}</div>`).join("")}</div>` : ""}
      ${tables.map(f => `<div class="dx-card-body" style="padding-top:${rest.length ? 4 : 16}px"><div class="dx-eyebrow" style="margin-bottom:8px">${esc(f.label)} · <span class="dx-num">${(d[f.f] || []).length}</span></div>${DX.table(f.columns.map(c => ({ f: c.f, label: c.label, type: ["int", "float"].includes(c.type) || c.calc ? "num" : "", d: c.d ?? (c.type === "float" || c.calc ? 2 : 0), get: c.calc ? r => c.calc(r, d) : undefined, total: c.total })), d[f.f] || [], { foot: f.columns.some(c => c.total) })}</div>`).join("")}
      ${photos.length ? `<div class="dx-card-body"><div class="dx-photos">${photos.map(f => d[f.f] ? `<div class="dx-photo filled" data-lbv="${esc(d[f.f])}" data-lbl="${esc(f.label)}" data-lbi="${f.icon || "image"}" role="button" tabindex="0">${d[f.f].startsWith("demo:") ? `<span class="dx-demo-img">${ic(f.icon || "image", 26)}</span>` : `<img src="${esc(d[f.f])}" alt="">`}<span class="dx-photo-tag">${esc(f.label)}</span></div>` : `<div class="dx-photo" style="cursor:default">${ic(f.icon || "camera", 22)}<span class="dx-photo-b">${esc(f.label)}</span><span style="font-size:11.5px">Not added</span></div>`).join("")}</div></div>` : ""}
    </section>`;
  }).join("");
})();
