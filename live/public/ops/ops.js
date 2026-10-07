// DUX Ops Suite /ops/m — build 20261007053439
window.DX = window.DX || {}; window.DX.deferStart = true; window.DX.live = true;
;
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

;
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

;
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
  DX.BUILD = "20261007053439";
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

;
window.DX.defineApps = function () {
/* Shared masters for the LIVE suite — built from dux_portal get_suite_boot (real Company / Site Project /
   Town At Project / Contractor at Project records). Same helper API as the prototype's DX.M.
   Link fields never show record IDs (TN-11, CP-5380 …) — only names; DX.label resolves an ID anywhere. */
(function () {
  "use strict";
  const DX = window.DX, B = (DX.BOOT && DX.BOOT.masters) || {};
  const M = (DX.M = {});
  M.companies = (B.companies || []).map(([c, a]) => [c, a]);
  M.defaultCompany = (DX.BOOT && DX.BOOT.company) || (M.companies[0] || [""])[0];
  M.companyOpts = () => M.companies.map(([c, a]) => ({ value: c, label: c, sub: a }));
  M.abbr = c => (M.companies.find(x => x[0] === c) || [0, ""])[1];
  M.projects = (B.projects || []).slice();
  M.towns = (B.towns || []).map(([id, town, project, display]) => ({ id, town, project, label: display || [town, project].filter(Boolean).join(" - ") || "Unnamed town" }));
  M.town = id => M.towns.find(t => t.id === id);
  M.townLabel = id => (M.town(id) ? M.town(id).label : id ? DX.label(id) : "—");
  M.townOpts = filter => M.towns.filter(t => !filter || filter(t)).map(t => ({ value: t.id, label: t.label, group: t.project }));
  M.contractors = (B.contractors || []).map(([id, name, town]) => ({ id, name: name && name !== id ? name : "Unnamed contractor", town }));
  M.contractorOpts = townId => M.contractors.filter(c => !townId || c.town === townId).map(c => ({ value: c.id, label: c.name, sub: townId ? "" : (M.town(c.town) || {}).label || "" }));
  M.contractorName = id => (M.contractors.find(c => c.id === id) || {}).name || (id ? DX.label(id) : "—");
  DX.resolvers.push(v => (M.town(v) || {}).label, v => (M.contractors.find(c => c.id === v) || {}).name);
})();

;
/* HSC NP-II — LIVE (hsc_np · page hsc-np-ii). API: hsc_np.hsc_np.page.hsc_np_ii.hsc_np_ii.* (same backend as /desk/hsc-np-ii). */
(function () {
  "use strict";
  const DX = window.DX, M = DX.M, { nf, esc } = DX;
  const API = "hsc_np.hsc_np.page.hsc_np_ii.hsc_np_ii.";
  const B = { zones: [], villages: [], khiraks: [], contractors: [], siteProjects: [], companies: [], defaults: {}, missing_items: [], perms: {} };
  let villagesOf = {}, zoneOfVillage = {}, khiraksOf = {};
  const index = () => {
    villagesOf = {}; zoneOfVillage = {}; khiraksOf = {};
    B.villages.forEach(([v, z]) => { (villagesOf[z] = villagesOf[z] || []).push(v); zoneOfVillage[v] = z; });
    B.khiraks.forEach(([k, v]) => (khiraksOf[v] = khiraksOf[v] || []).push(k));
  };
  const contractors = () => B.contractors.map(([id, name, town, whOk]) => ({ value: id, label: name || "Unnamed contractor", sub: whOk ? "" : "no warehouse yet", group: town }));
  const contractorName = id => { const c = B.contractors.find(x => x[0] === id); return c ? c[1] || "Unnamed contractor" : id ? DX.label(id) : ""; };
  DX.resolvers.push(v => { const c = B.contractors.find(x => x[0] === v); return c ? c[1] : ""; });
  const FITTINGS = [["brass_ferrule", "Brass ferrule", "Brass Ferrule"], ["int_kfob", "FTA I type", "FTA-I"], ["fta_l_type", "FTA L type", "FTA - L"], ["gi_socket", "GI socket", "GI Socket"], ["gi_elbow", "GI elbow", "GI Elbow"], ["gi_nipple_nine", 'GI nipple 9"', "GI Nipple 9 inch"], ["gi_nipple_thirty", 'GI nipple 30"', "GI Nipple 30 inch"], ["tap", "Tap", "Tap"], ["jointer", "Jointer", "Jointer"]];
  const SADDLES = ["ElectroFusion Saddle 90MM", "ElectroFusion Saddle 110MM", "ElectroFusion Saddle 125MM", "ElectroFusion Saddle 160MM"];
  const PHOTOS = ["house_photo", "connection_photo", "aadhar_photo", "samagra_photo"];
  const photos = d => PHOTOS.filter(f => d[f]).length;
  // server row <-> form doc (the form keeps GPS as one "lat,long" value)
  const fromServer = r => Object.assign({}, r, { date: DX.day(r.date), gps: r.latitude != null && r.latitude !== "" && r.longitude != null && r.longitude !== "" ? `${(+r.latitude).toFixed(7)},${(+r.longitude).toFixed(7)}` : "" });
  const toServer = d => { const o = Object.assign({}, d); const [la, lo] = String(d.gps || "").split(","); o.latitude = la ? +la : ""; o.longitude = lo ? +lo : ""; delete o.gps; delete o.wh_info; return o; };

  const conn = {
    key: "conn", doctype: "HSC Inhouse NP-ll",
    entity: { singular: "Connection", plural: "Connections", title: r => r.name, sub: r => `${r.village_name || ""} · ${r.zone_name || ""}`, date: "date" },
    newLabel: "New connection", newTitle: "New connection entry", dupField: "house_owner_name",
    get canCreate() { return B.perms.create !== false; },
    defaults: () => ({ date: DX.TODAY, company: B.defaults.company || M.defaultCompany, project: B.defaults.project || "" }),
    form: [
      { id: "where", title: "Where is the connection?", short: "Location", sub: "zone → village → khirak", icon: "pin", fields: [
        { f: "zone_name", label: "Zone", type: "link", req: true, options: () => B.zones.map(z => ({ value: z, label: z, sub: (villagesOf[z] || []).length + " villages" })) },
        { f: "village_name", label: "Village", type: "link", req: true, parent: ["zone_name"], options: d => (villagesOf[d.zone_name] || []).slice().sort().map(v => ({ value: v, label: v, sub: (khiraksOf[v] || []).length + " khiraks" })) },
        { f: "khirak_name", label: "Khirak", type: "link", parent: ["village_name"], options: d => (khiraksOf[d.village_name] || []).slice().sort() },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "project", label: "Project", type: "link", options: () => B.siteProjects },
        { f: "company", label: "Company", type: "link", options: () => B.companies.map(([c, a]) => ({ value: c, label: c, sub: a })) },
        { f: "hdi_contractor_name", label: "Contractor", type: "link", reqSubmit: true, span: 2, options: contractors, searchPh: "Search contractor or town…" },
        { f: "wh_info", label: "", type: "info", icon: "truck", html: d => d.hdi_contractor_name ? `Stock issues from <b>${esc(contractorName(d.hdi_contractor_name))}</b>’s warehouse` : "Pick a contractor to see the source warehouse." }
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
    onSubmit: () => {},
    submitProblems: d => {
      const p = [];
      if (B.perms.submit === false) p.push("Your role can’t submit HSC NP-II entries yet — ask the ERP admin to enable Submit.");
      const c = B.contractors.find(x => x[0] === d.hdi_contractor_name);
      if (c && !c[3]) p.push(`${c[1] || "This contractor"}’s warehouse doesn’t exist yet in ERPNext.`);
      const need = [["mdpe_pipemtr", "MDPE Pipe (mtr)"]].concat(FITTINGS.map(([f, , item]) => [f, item])).filter(([f]) => +d[f] > 0).map(([, item]) => item);
      const miss = need.filter(i => (B.missing_items || []).includes(i));
      if (miss.length) p.push("Stock items not found in ERPNext: " + miss.join(", "));
      return p;
    },
    submitTitle: "Submit this connection?", submitOk: "Submit & issue stock", submitSub: "Submitting locks the entry and creates a Stock Entry (Material Issue).", submitLinesTitle: "Will be issued",
    submitLines: d => [["MDPE Pipe (mtr)", d.mdpe_pipemtr]].concat(FITTINGS.map(([f, , item]) => [item, d[f]])).filter(l => +l[1] > 0).map(([k, v]) => [k, nf(v)]),
    submitNote: d => d.electrofusion_saddle ? `${esc(d.electrofusion_saddle)} is recorded on the entry but not issued from stock.` : "",
    submitToast: d => d.material_issue ? "Submitted · materials issued from the contractor’s store" : "Submitted",
    lockBanner: d => d.material_issue ? "<b>Submitted</b> — materials issued from the contractor’s store (Material Issue posted)." : "<b>Submitted</b> — entry is locked.",
    formNote: d => `${[d.mdpe_pipemtr].concat(FITTINGS.map(([f]) => d[f])).filter(v => +v > 0).length} material lines · ${photos(d)}/4 photos`,
    api: {
      ttl: 30000,
      load: async () => (await DX.call(API + "get_entries", { filters: {} })).map(fromServer),
      get: async name => fromServer(await DX.call(API + "get_entry", { name }, { get: false })),
      save: async d => {
        const r = await DX.call(API + "save_entry", { doc: DX.json(toServer(d)) });
        if (!r.ok) { const e = new DX.ApiError("Fix the highlighted fields.", r.errors || {}); if (e.fields.latitude) e.fields.gps = e.fields.latitude; throw e; }
        return fromServer(r.doc);
      },
      submit: async name => fromServer((await DX.call(API + "submit_entry", { name })).doc)
    }
  };

  const app = DX.register({
    key: "hscnp", title: "HSC NP-II", short: "HSC NP-II", icon: "pin", hue: "iris", route: "/desk/hsc-np-ii",
    desc: "House connections · NP-II", eyebrow: "NP-II · House service connections",
    headline: `Record every house <span class="dx-grad">connection</span>`,
    get intro() { return `Field entries across <span class="dx-num">${B.zones.length}</span> zones and <span class="dx-num">${B.villages.length}</span> villages. Drafts stay editable until you submit them — submitting issues the materials from the contractor’s store.`; },
    docs: [conn],
    boot: async () => { Object.assign(B, await DX.call(API + "get_bootstrap")); index(); },
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
      const zones = B.zones.map(z => ({ label: z, sub: (villagesOf[z] || []).length + " villages", value: rows.filter(r => r.zone_name === z).length })).sort((a, b) => b.value - a.value).slice(0, 8);
      const mats = [["MDPE pipe", DX.sum(rows, "mdpe_pipemtr"), "m"]].concat(FITTINGS.map(([f, l]) => [l, DX.sum(rows, f), "nos"]));
      return [
        DX.card("Zone-wise progress", DX.bars(zones), { icon: "layers", tone: "cyan", sub: `top 8 of ${B.zones.length}`, action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="hscnp/masters">All zones</button>` }),
        DX.card("Materials used", `<div class="dx-mgrid">${mats.map(([l, v, u]) => `<div class="dx-mcell"><div class="dx-mcell-label">${esc(l)}</div><div class="dx-mcell-val">${nf(v)}<small>${u}</small></div></div>`).join("")}</div>`, { icon: "box", sub: "all entries (drafts + submitted)" })
      ];
    },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard" },
      { id: "entries", label: "Entries", icon: "list", type: "list", count: () => DX.rows(conn).length, searchPh: "Search name, mobile, village, contractor…",
        search: [r => r.name, r => r.mobile_no, r => r.village_name, r => r.zone_name, r => r.khirak_name, r => contractorName(r.hdi_contractor_name)],
        filters: [{ f: "zone_name", label: "Zone", options: () => B.zones, clears: ["village_name"] }, { f: "village_name", label: "Village", icon: "pin", options: f => (f.zone_name ? villagesOf[f.zone_name] || [] : B.villages.map(v => v[0])).slice().sort() }],
        sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "mdpe_pipemtr"))}</span> m MDPE pipe`,
        columns: [{ f: "name", label: "House owner", strong: true }, { f: "zone_name", label: "Zone" }, { f: "village_name", label: "Village" }, { f: "khirak_name", label: "Khirak", hideSm: true }, { label: "Contractor", get: r => contractorName(r.hdi_contractor_name), trunc: true }, { f: "mdpe_pipemtr", label: "MDPE (m)", type: "num" }, { label: "Photos", get: r => `${photos(r)}/4`, type: "mono" }, { f: "date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(conn, r) }],
        cardFoot: r => [`<span><span class="dx-num">${nf(r.mdpe_pipemtr)}</span> m pipe</span>`, `<span>Photos <span class="dx-mono">${photos(r)}/4</span></span>`, `<span class="dx-mono">${DX.fmtDate(r.date)}</span>`] },
      { id: "new", label: "New entry", icon: "plus", type: "form", doc: "conn" },
      { id: "report", label: "Report", icon: "chart", type: "report", group: "Insights", title: "HSCN NP ll Report", monthDefault: true, masked: true,
        filters: [{ f: "zone_name", label: "Zone", options: () => B.zones, clears: ["village_name"] }, { f: "village_name", label: "Village", options: f => (f.zone_name ? villagesOf[f.zone_name] || [] : B.villages.map(v => v[0])).slice().sort() }],
        kpis: rows => [{ label: "Total MDPE pipe used", value: nf(DX.sum(rows, "mdpe_pipemtr")), unit: "m", sub: "Report summary · same as ERPNext", icon: "pipe", tone: "cyan" }, { label: "Connections", value: nf(rows.length), sub: `<span class="dx-num">${rows.filter(r => r.docstatus).length}</span> submitted`, icon: "home" }, { label: "Photos complete", value: rows.length ? Math.round(rows.filter(r => photos(r) === 4).length / rows.length * 100) : 0, unit: "%", sub: "All 4 photos attached", icon: "camera", tone: "ok" }],
        columns: [{ f: "date", label: "Date", type: "date" }, { f: "project", label: "Project" }, { f: "zone_name", label: "Zone" }, { f: "village_name", label: "Village" }, { f: "house_owner_name", label: "House owner", strong: true }, { f: "mdpe_pipemtr", label: "MDPE (m)", type: "num", total: true }, { f: "samagra_id", label: "Samagra ID", type: "mask" }, { f: "aadhar_number", label: "Aadhaar", type: "mask" }, { label: "Saddle", get: r => r.electrofusion_saddle ? r.electrofusion_saddle.replace("ElectroFusion Saddle ", "") : "" }].concat(FITTINGS.map(([f, l]) => ({ f, label: l, type: "num", total: true }))).concat([{ f: "gps", label: "Lat, long", type: "mono" }]) },
      { id: "masters", label: "Masters", icon: "database", type: "masters", group: "Insights", docs: ["conn"], tabs: [
        { label: "Zones", doctype: "Zone Details NP-ll", rows: () => B.zones.map(z => ({ z, v: (villagesOf[z] || []).length, e: DX.rows(conn).filter(r => r.zone_name === z).length })), columns: [{ f: "z", label: "Zone", strong: true }, { label: "Project", get: () => "MPJNM - NP - II" }, { f: "v", label: "Villages", type: "num" }, { f: "e", label: "Entries", type: "num" }] },
        { label: "Villages", doctype: "Village Details NP-ll", rows: () => B.villages.map(([v, z]) => ({ v, z, k: (khiraksOf[v] || []).length })).sort((a, b) => a.v.localeCompare(b.v)), columns: [{ f: "v", label: "Village", strong: true }, { f: "z", label: "Zone" }, { f: "k", label: "Khiraks", type: "num" }] },
        { label: "Khirak villages", doctype: "Khirak Village NP-ll", rows: () => B.khiraks.map(([k, v]) => ({ k, v, z: zoneOfVillage[v] })).sort((a, b) => a.k.localeCompare(b.k)), columns: [{ f: "k", label: "Khirak", strong: true }, { f: "v", label: "Village" }, { f: "z", label: "Zone" }] }
      ] }
    ]
  });
  void app;
})();

;
/* Pour Card — LIVE (pipe_laying_inhouse). Same API as /pipe-laying/m (mobile_api) + the desk Pour Card Report and Material Transfer. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, { nf, esc, ic } = DX;
  const MA = "pipe_laying_inhouse.mobile_api.", PA = "pipe_laying_inhouse.api.", RP = "pipe_laying_inhouse.pipe_laying_inhouse.page.pour_card_report.pour_card_report.";
  const B = { projects: [], zones: [], components: [], contractors: [], pipe_items: [], acc_items: [], companies: [], caps: {}, mt: { warehouses: [], can_create: false, can_submit: false } };
  const byProject = (list, p) => list.filter(x => !p || x.project === p || !x.project);
  const dia = name => { const m = /(\d+)\s*mm/i.exec(name || "") || /(\d+)/.exec(name || ""); return m ? +m[1] : 0; };
  const lwd = (l, w, d) => (+l && +w && +d ? +l * +w * +d : 0);
  const isDist = c => /distribution/i.test(c || "");
  // quantities for one PIPE-ID batch — identical to the server formulas in add_laying_batch / calc_backfilling
  const Q = b => {
    const total = lwd(b.l, b.w, b.d), cc = lwd(b.cc_l, b.cc_w, b.cc_d), soft = lwd(b.sr_l, b.sr_w, b.sr_d), hard = lwd(b.hr_l, b.hr_w, b.hr_d);
    const murum = +b.inc_murum ? lwd(b.mu_l, b.mu_w, b.mu_d) : 0, pv = 3.14 * Math.pow(dia(b.pipe) / 1000, 2) / 4 * (+b.l || 0);
    return { total, cc, soft, hard, murum, soil: total - cc - soft - hard, pv, back: total - murum - pv };
  };
  const cardQ = c => (c.batches || []).reduce((s, b) => { const q = Q(b); s.len += +b.l || 0; s.exc += q.total; s.acc += (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0); return s; }, { len: 0, exc: 0, acc: 0 });
  const contractorName = id => { const c = B.contractors.find(x => x.name === id); return (c && (c.contractor || c.name)) || id || ""; };

  // get_card -> form doc with batches grouped by PIPE-ID
  const fromCard = c => {
    const by = {}, get = id => (by[id] = by[id] || { pipe_id: id, acc: [] });
    (c.pipe || []).forEach(p => Object.assign(get(p.pipe_id), { date: DX.day(p.date_of_pipelaying), pipe: p.pipe_details, l: p.length_of_pipemtr, w: p.width_of_pipemtr, d: p.depth_of_pipemtr, bedding: p.custom_bedding, strata: p.strata_name, remark: p.custom_remark || "" }));
    (c.soft || []).forEach(r => Object.assign(get(r.pipe_id), { sr_l: r.lengthmtr, sr_w: r.widthmtr, sr_d: r.depthmtr }));
    (c.hard || []).forEach(r => Object.assign(get(r.pipe_id), { hr_l: r.hard_rock_lengthmtr, hr_w: r.hard_rock_widthmtr, hr_d: r.hard_rock_depthmtr }));
    (c.murum || []).forEach(r => Object.assign(get(r.pipe_id), { inc_murum: 1, mu_l: r.hard_rock_lengthmtr, mu_w: r.hard_rock_widthmtr, mu_d: r.hard_rock_depthmtr }));
    (c.cc || []).forEach(r => Object.assign(get(r.pipe_id), { cc_l: r.cc_road_badding_length, cc_w: r.cc_road_badding_width, cc_d: r.cc_road_breaking_depth }));
    (c.acc || []).forEach(r => { get(r.pipe_id).acc.push({ item: r.accessories, qty: r.qauntity }); if (!by[r.pipe_id].date) by[r.pipe_id].date = DX.day(r.date_accessories); });
    const batches = Object.values(by).filter(b => b.pipe_id).sort((a, b) => String(a.pipe_id).localeCompare(String(b.pipe_id), undefined, { numeric: true }));
    return { name: c.name, docstatus: c.docstatus, townproject: c.project, zone_name: c.zone || "", component: c.component || "", select_contractor: c.contractor || "", from_junction: c.from_junction, to_junction: c.to_junction, custom_chainage_from: c.chainage_from || "", custom_chainage_to: c.chainage_to || "", company: c.company, attachment: c.attachment || "", material_issue: c.material_issue, total_quantity: c.total_quantity, date: DX.day(c.modified), modified: c.modified, can_write: c.can_write, can_submit: c.can_submit, backfill: c.backfill || [], batches };
  };
  const fromSummary = r => ({ name: r.name, docstatus: r.docstatus, townproject: r.project, zone_name: r.zone || "", component: r.component || "", select_contractor: r.contractor || "", from_junction: r.from_junction, to_junction: r.to_junction, material_issue: r.material_issue, total_quantity: r.total_quantity, date: DX.day(r.modified), modified: r.modified, owner: r.owner });

  const card = {
    key: "card", doctype: "Pour Card",
    entity: { singular: "Pour card", plural: "Pour cards", title: r => r.name, sub: r => `${r.component || r.townproject || ""} · ${r.from_junction || ""} → ${r.to_junction || ""}`, date: "date" },
    newLabel: "New pour card", submitBtn: "Lock entry", submitTitle: "Lock this pour card?", submitOk: "Lock entry", submitSub: "This entry will be locked. Changes can’t be made after submission.",
    get canCreate() { return B.caps.create !== false; },
    status: r => r.docstatus === 2 ? ["Cancelled", "err"] : r.docstatus === 1 ? ["Lock Entry", "ok"] : ["Saved", "iris"],
    statusKey: r => (r.docstatus === 1 ? "locked" : r.docstatus === 2 ? "cancelled" : "saved"),
    statusFilter: [["", "All"], ["saved", "Saved"], ["locked", "Lock Entry"], ["cancelled", "Cancelled"]],
    defaults: () => ({ company: B.caps.default_company || DX.M.defaultCompany, townproject: B.projects.length === 1 ? B.projects[0].name : "", batches: [] }),
    form: [
      { id: "proj", title: "Add project details", short: "Project", icon: "building", fields: [
        { f: "townproject", label: "Project", type: "link", req: true, options: () => B.projects.map(p => p.name) },
        { f: "component", label: "Select component", type: "link", parent: ["townproject"], options: d => byProject(B.components, d.townproject).map(c => c.name) },
        { f: "zone_name", label: "Zone name", type: "link", parent: ["townproject"], options: d => byProject(B.zones, d.townproject).map(z => z.name), showIf: d => isDist(d.component), hint: "Only for Distribution components." },
        { f: "select_contractor", label: "Select contractor", type: "link", req: true, parent: ["townproject"], options: d => byProject(B.contractors, d.townproject).map(c => ({ value: c.name, label: c.contractor || c.name, sub: c.project || "" })) },
        { f: "company", label: "Company", type: "link", options: () => B.companies.map(c => ({ value: c.name, label: c.name, sub: c.abbr })) },
        { f: "from_junction", label: "From junction", type: "text", req: true, ph: "e.g. 355 or MH-4" },
        { f: "to_junction", label: "To junction", type: "text", req: true, ph: "e.g. 432 or OHT" },
        { f: "custom_chainage_from", label: "Chainage from", type: "text", ph: "e.g. 4.2(9.2)" },
        { f: "custom_chainage_to", label: "Chainage to", type: "text", ph: "e.g. 449.5" },
        { f: "attachment", label: "Upload attachment", type: "photo", icon: "image", accept: "image/*,application/pdf" }
      ] }
    ],
    validate: d => {
      const e = {}, ch = /^[\d.()]*\d[\d.()]*$/;
      if (d.from_junction && d.to_junction && d.from_junction.trim() === d.to_junction.trim()) e.to_junction = "From Junction and To Junction cannot be same.";
      if (isDist(d.component) && !d.zone_name) e.zone_name = "Pick a zone for Distribution components.";
      ["custom_chainage_from", "custom_chainage_to"].forEach(f => { if (d[f] && !ch.test(String(d[f]).trim())) e[f] = "Only digits, a decimal point and brackets — like 4.2(9.2)."; });
      return e;
    },
    onSubmit: () => {},
    submitProblems: d => (d.batches || []).length ? [] : ["Add at least one laying detail (PIPE-ID) before locking."],
    submitLines: d => { const q = cardQ(d); return [["Pipe entries", nf((d.batches || []).length)], ["Pipe length (m)", nf(q.len, 2)], ["Total excavation (m³)", nf(q.exc, 3)], ["Accessory qty", nf(q.acc)]]; },
    lockBanner: d => d.material_issue ? "<b>Lock Entry</b> — Material Issue posted from the contractor’s warehouse." : `<b>Lock Entry</b> — card is submitted. Stock posting on lock is held on this site, so no Material Issue was created.`,
    detailActions: d => [d.docstatus === 0 && d.can_write !== false && { label: "Add laying details", icon: "plus", tone: "secondary", run: (x, ctx) => layingModal(x, ctx) }, d.docstatus !== 2 && (d.batches || []).length && { label: "Backfilling", icon: "layers", run: x => backfillModal(x) }],
    detailExtra: d => {
      const bs = d.batches || [];
      return DX.card(`Entries <span class="dx-num">(${bs.length})</span>`, bs.length ? DX.table([
        { f: "pipe_id", label: "Pipe ID", type: "mono" }, { f: "date", label: "Date", type: "date" }, { f: "pipe", label: "Pipe" },
        { label: "L × W × D (m)", type: "mono", get: b => `${nf(b.l, 2)} × ${nf(b.w, 2)} × ${nf(b.d, 2)}` },
        { label: "Excavation", type: "num", d: 3, get: b => Q(b).total, total: true, f: "_t" }, { label: "CC", type: "num", d: 3, get: b => Q(b).cc }, { label: "Soft rock", type: "num", d: 3, get: b => Q(b).soft, hideSm: true }, { label: "Hard rock", type: "num", d: 3, get: b => Q(b).hard, hideSm: true },
        { label: "Soil", type: "num", d: 3, get: b => Q(b).soil }, { label: "Pipe vol.", type: "num", d: 4, get: b => Q(b).pv, hideSm: true }, { label: "Accessories", type: "num", get: b => (b.acc || []).reduce((a, x) => a + (+x.qty || 0), 0) },
        ...(d.docstatus === 0 && d.can_write !== false ? [{ label: "", type: "html", get: b => `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-rmbatch="${esc(b.pipe_id)}" aria-label="Remove ${esc(b.pipe_id)}">${ic("trash", 14)}</button>` }] : [])
      ], bs.map(b => Object.assign({ _t: Q(b).total }, b))) : DX.empty("No laying details yet", "Use “Add laying details” — one entry = one PIPE-ID shared across excavation, rock, soil, CC and accessories."), { icon: "pipe", tone: "cyan", sub: "one row per PIPE-ID" }) + "<div style='height:16px'></div>";
    },
    bindDetail: (d, ctx) => ctx.on("click", async e => {
      const rm = e.target.closest("[data-rmbatch]"); if (!rm) return;
      e.stopPropagation();
      if (!(await DX.confirm({ title: `Remove ${rm.dataset.rmbatch}?`, sub: "Deletes every excavation, rock, soil, CC and accessory row of this PIPE-ID from the draft card.", ok: "Remove", tone: "danger" }))) return;
      try { await DX.call(MA + "delete_laying_batch", { pour_card: d.name, pipe_id: rm.dataset.rmbatch }); DX.toast(`Removed · <span class="dx-mono">${esc(rm.dataset.rmbatch)}</span>`); DX.invalidate(card); ctx.rerender(); } catch (err) { V.showProblems(err, "Couldn’t remove"); }
    }),
    api: {
      ttl: 30000,
      load: async () => (await DX.call(MA + "list_cards", { limit: 500 }, { get: true })).map(fromSummary),
      get: async name => fromCard(await DX.call(MA + "get_card", { name })),
      save: async d => {
        const payload = { townproject: d.townproject, zone_name: isDist(d.component) ? d.zone_name || null : null, village_name: null, component: d.component || null, select_contractor: d.select_contractor, from_junction: (d.from_junction || "").trim(), to_junction: (d.to_junction || "").trim(), custom_chainage_from: d.custom_chainage_from || "", custom_chainage_to: d.custom_chainage_to || "", company: d.company || null, attachment: d.attachment || null };
        if (d.name) payload.name = d.name;
        const r = await DX.call(MA + "save_card", { payload: DX.json(payload) });
        if (r.locked) throw new DX.ApiError(`${r.name} is locked and can’t be edited.`);
        if (r.deduped) DX.toast(`That card already exists — opened <span class="dx-mono">${esc(r.name)}</span>`);
        return { name: r.name, docstatus: r.docstatus };
      },
      submit: async name => DX.call(MA + "submit_card", { name })
    }
  };

  // "Pour Card Details" popup — one PIPE-ID across every table (server: add_laying_batch)
  const LAY = {
    key: "laying", entity: { singular: "Laying detail" },
    form: [
      { id: "exc", title: "Excavation details", short: "Excavation", icon: "layers", cols: 4, fields: [
        { f: "date", label: "Date", type: "date", req: true }, { f: "l", label: "Length (m)", type: "float", req: true, step: 0.001 }, { f: "w", label: "Width (m)", type: "float", req: true, step: 0.001 }, { f: "d", label: "Depth (m)", type: "float", req: true, step: 0.001 },
        { f: "q_total", label: "Total excavation", type: "computed", unit: "m³", d: 3, calc: b => Q(b).total, formula: "L × W × D" },
        { f: "cc_l", label: "CC road · L", type: "float", step: 0.001 }, { f: "cc_w", label: "CC · W", type: "float", step: 0.001 }, { f: "cc_d", label: "CC · D", type: "float", step: 0.001 },
        { f: "sr_l", label: "Soft rock · L", type: "float", step: 0.001 }, { f: "sr_w", label: "Soft rock · W", type: "float", step: 0.001 }, { f: "sr_d", label: "Soft rock · D", type: "float", step: 0.001 },
        { f: "q_cc", label: "CC qty", type: "computed", unit: "m³", d: 3, calc: b => Q(b).cc },
        { f: "hr_l", label: "Hard rock · L", type: "float", step: 0.001 }, { f: "hr_w", label: "Hard rock · W", type: "float", step: 0.001 }, { f: "hr_d", label: "Hard rock · D", type: "float", step: 0.001 },
        { f: "q_soil", label: "Soil excavation", type: "computed", unit: "m³", d: 3, calc: b => Q(b).soil, formula: "Total − CC − Soft − Hard" }
      ] },
      { id: "lay", title: "Laying & backfilling", short: "Laying", icon: "pipe", tone: "cyan", cols: 4, fields: [
        { f: "pipe", label: "Pipe details", type: "link", req: true, span: 2, options: () => B.pipe_items.map(i => ({ value: i.name, label: i.item_name || i.name, sub: i.item_group })) },
        { f: "q_pv", label: "Pipe volume", type: "computed", unit: "m³", d: 4, calc: b => Q(b).pv, formula: "3.14 × (d/1000)² / 4 × L" },
        { f: "bedding", label: "Bedding depth (m)", type: "float", step: 0.001 },
        { f: "inc_murum", label: "Include murum", type: "check", on: "Murum bedding" },
        { f: "mu_l", label: "Murum · L", type: "float", step: 0.001, showIf: b => +b.inc_murum }, { f: "mu_w", label: "Murum · W", type: "float", step: 0.001, showIf: b => +b.inc_murum }, { f: "mu_d", label: "Murum · D", type: "float", step: 0.001, showIf: b => +b.inc_murum },
        { f: "q_back", label: "Backfilling", type: "computed", unit: "m³", d: 3, calc: b => Q(b).back, formula: "Total − Murum − Pipe volume" }
      ] },
      { id: "acc", title: "Accessory", short: "Accessory", icon: "box", cols: 3, fields: [
        { f: "accessory", label: "Accessory used", type: "link", span: 2, options: () => B.acc_items.map(i => ({ value: i.name, label: i.item_name || i.name, sub: i.item_group })) },
        { f: "accessory_qty", label: "Quantity", type: "int" },
        { f: "remark", label: "Remark", type: "text", span: 3 }
      ] }
    ],
    validate: b => {
      const e = {};
      [["cc_l", "CC road"], ["sr_l", "Soft rock"], ["hr_l", "Hard rock"], ["mu_l", "Murum"]].forEach(([f, l]) => { if (+b[f] > +b.l && +b.l) e[f] = `${l} length can’t be greater than the total pipe length.`; });
      if (+b.inc_murum && !(+b.mu_l && +b.mu_w && +b.mu_d)) e.mu_l = "Fill Murum length, width and depth.";
      if (b.accessory && !(+b.accessory_qty > 0)) e.accessory_qty = "Enter the accessory quantity.";
      if (Q(b).soil < 0) e.q_soil = "Soil excavation is negative — check CC / rock quantities.";
      return e;
    }
  };
  function layingModal(c) {
    return new Promise(resolve => {
      const b = DX.blank(LAY); Object.assign(b, { date: DX.TODAY, w: 0.65, cc_w: 0.65, sr_w: 0.65, hr_w: 0.65, mu_w: 0.65, accessory_qty: 0 });
      const uid = "batch-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 14);
      const m = DX.openModal({ title: "Pour card details", sub: `Adds a new PIPE-ID to ${esc(c.name)} — shared across excavation, rock, soil, CC and accessories.`, wide: true, body: DX.formHTML(LAY, b, "new"), foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Cancel</button><button class="dx-btn dx-btn-primary" data-lsave>${ic("plus", 15)}Add</button>`, onClose: () => resolve(false) });
      const steps = m.querySelector(".dx-steps"); if (steps) steps.remove();
      const F = DX.formCtl(LAY, b, "new", m);
      m.querySelector("[data-lsave]").addEventListener("click", async ev => {
        const errs = DX.validate(LAY, b); if (Object.keys(errs).length) return F.showErrors(errs);
        const done = DX.spin(ev.currentTarget, "Adding…");
        const values = { date: b.date, select_contractor: c.select_contractor, pipe_length: +b.l || 0, pipe_width: +b.w || 0, pipe_depth: +b.d || 0, cc_length: +b.cc_l || 0, cc_width: +b.cc_w || 0, cc_depth: +b.cc_d || 0, soft_length: +b.sr_l || 0, soft_width: +b.sr_w || 0, soft_depth: +b.sr_d || 0, hard_length: +b.hr_l || 0, hard_width: +b.hr_w || 0, hard_depth: +b.hr_d || 0, pipe_details: b.pipe, bedding_depth: +b.bedding || 0, strata_name: null, include_murum: +b.inc_murum ? 1 : 0, murum_length: +b.mu_l || 0, murum_width: +b.mu_w || 0, murum_depth: +b.mu_d || 0, accessories: b.accessory || "", accessories_qty: +b.accessory_qty || 0, remark: b.remark || "" };
        try {
          const r = await DX.call(MA + "add_laying_batch", { pour_card: c.name, values: DX.json(values), batch_uid: uid });
          // resolve before closing — closeModal fires onClose → resolve(false), which would skip the detail refresh
          resolve(true); DX.closeModal(); DX.toast(r.skipped ? "Already added." : `Laying details added · <span class="dx-mono">${esc(r.pipe_id)}</span>`);
        } catch (err) { done(); V.showProblems(err, "Couldn’t add laying details"); }
      });
    });
  }
  async function backfillModal(c) {
    let r;
    try { r = await DX.call(MA + "calc_backfilling", { pour_card: c.name, save: 0 }); } catch (err) { V.showProblems(err, "Couldn’t calculate backfilling"); return false; }
    const rows = (r.rows || []).map(x => ({ id: x.pipe_id, pipe: x.pipe_details, dia: x.diameter_mm, t: x.total_excavation, m: x.murum_qty, p: x.pipe_volume, k: x.backfilling_qty }));
    const m = DX.openModal({ title: "Backfilling", sub: "Backfilling = Total excavation − Murum − Pipe volume", wide: true, body: DX.table([{ f: "id", label: "Pipe ID", type: "mono" }, { f: "pipe", label: "Pipe" }, { f: "dia", label: "Dia (mm)", type: "num" }, { label: "Total exc.", type: "num", d: 3, f: "t", total: true }, { label: "Murum", type: "num", d: 3, f: "m", total: true }, { label: "Pipe vol.", type: "num", d: 4, f: "p", total: true }, { label: "Backfilling", type: "num", d: 3, f: "k", total: true }], rows, { foot: true }), foot: `<button class="dx-btn dx-btn-ghost" data-modal-x>Close</button><button class="dx-btn dx-btn-primary" data-bsave>${ic("check", 15)}Save to pour card</button>` });
    m.querySelector("[data-bsave]").addEventListener("click", async ev => {
      const done = DX.spin(ev.currentTarget, "Saving…");
      try { await DX.call(MA + "calc_backfilling", { pour_card: c.name, rows: DX.json(rows.map(x => x.id)), date: DX.TODAY, save: 1 }); DX.closeModal(); DX.toast("Backfilling saved to the pour card."); } catch (err) { done(); V.showProblems(err, "Couldn’t save backfilling"); }
    });
    return false;
  }

  const mt = {
    key: "mt", doctype: "Stock Entry · Material Transfer", lazy: true,
    entity: { singular: "Material transfer", plural: "Material transfers", title: r => `${DX.whLabel(r.from_wh) || "—"} → ${DX.whLabel(r.to_wh) || "—"}`, sub: r => `${r.nitems != null ? r.nitems : (r.items || []).length} items · ${r.name}`, date: "posting_date" },
    newLabel: "New transfer", submitLabel: "Save & submit", submitTitle: "Submit this transfer?", submitSub: "ERPNext stock rules run on submit — real stock moves between the warehouses.",
    get canCreate() { return !!B.mt.can_create; },
    get submittable() { return !!B.mt.can_submit; },
    defaults: () => ({ posting_date: DX.TODAY, company: B.mt.default_company || DX.M.defaultCompany, items: [{ item: "", qty: 1, uom: "", rate: 0 }] }),
    form: [{ id: "tr", title: "Transfer details", short: "Details", icon: "swap", fields: [
      { f: "company", label: "Company", type: "link", req: true, options: () => (B.mt.companies || B.companies).map(c => ({ value: c.name, label: c.name, sub: c.abbr })) }, { f: "posting_date", label: "Posting date", type: "date", req: true },
      { f: "from_wh", label: "Default source warehouse", type: "link", req: true, parent: ["company"], options: d => B.mt.warehouses.filter(w => !d.company || w.company === d.company).map(w => ({ value: w.name, label: DX.whLabel(w.name) })) }, { f: "to_wh", label: "Default target warehouse", type: "link", req: true, parent: ["company"], options: d => B.mt.warehouses.filter(w => !d.company || w.company === d.company).map(w => ({ value: w.name, label: DX.whLabel(w.name) })) },
      { f: "items", label: "Items", type: "table", span: "all", minRows: 1, rowLabel: "item", newRow: () => ({ item: "", qty: 1, uom: "", rate: 0 }), columns: [{ f: "item", label: "Item code", type: "select", options: () => B.pipe_items.concat(B.acc_items).map(i => ({ value: i.name, label: i.item_name || i.name })), onSet: r => { r.uom = (B.pipe_items.concat(B.acc_items).find(i => i.name === r.item) || {}).stock_uom || r.uom; } }, { f: "qty", label: "Qty", type: "float", total: true }, { f: "uom", label: "UOM", type: "select", options: () => [...new Set(B.pipe_items.concat(B.acc_items).map(i => i.stock_uom).filter(Boolean))] }, { f: "rate", label: "Basic rate", type: "float" }] }
    ] }],
    validate: d => (d.from_wh && d.from_wh === d.to_wh ? { to_wh: "Source and target warehouse must differ." } : (d.items || []).every(r => !(+r.qty > 0) || !r.item) ? { items: "At least one item needs a quantity above 0." } : {}),
    onSubmit: () => {},
    api: {
      load: async () => ((await DX.call(PA + "list_material_transfers", { limit: 200 })).rows || []).map(r => ({ name: r.name, docstatus: r.docstatus, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse, to_wh: r.to_warehouse, nitems: r.item_count, modified: r.modified })),
      get: async name => { const r = await DX.call(PA + "get_material_transfer", { name }); return { name: r.name, docstatus: r.docstatus, company: r.company, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse, to_wh: r.to_warehouse, items: (r.items || []).map(i => ({ item: i.item_code, qty: i.qty, uom: i.uom, rate: i.basic_rate || 0 })) }; },
      save: async d => {
        const uomOf = code => (B.pipe_items.concat(B.acc_items).find(i => i.name === code) || {}).stock_uom;
        const items = (d.items || []).filter(r => r.item && +r.qty > 0).map(r => ({ item_code: r.item, qty: +r.qty, uom: r.uom || uomOf(r.item) || null, basic_rate: +r.rate || null, s_warehouse: null, t_warehouse: null }));
        const r = await DX.call(PA + "save_material_transfer", { company: d.company, items: DX.json(items), posting_date: d.posting_date, from_warehouse: d.from_wh, to_warehouse: d.to_wh, name: d.name || undefined });
        return { name: r.name, docstatus: r.docstatus };
      },
      submit: async name => DX.call(PA + "submit_material_transfer", { name })
    }
  };

  // Pour Card Report — server-side (get_page_data), refetched when the dates change
  const REP = { key: "", rows: [], summary: null };
  const fetchReport = async (from, to) => {
    const key = from + "|" + to; if (REP.key === key) return;
    const all = []; let page = 1, res;
    do { res = await DX.call(RP + "get_page_data", { filters: DX.json({ from_date: from, to_date: to }), page, page_length: 100 }); all.push(...(res.rows || [])); page++; } while ((res.rows || []).length === 100 && all.length < 3000);
    REP.key = key; REP.summary = res.summary; REP.chart = res.chart || [];
    REP.rows = all.map(r => ({ name: r.pour_card, date: DX.day(r.entry_date), pipe_id: r.pipe_id, townproject: r.project, component: r.component, contractor: contractorName(r.contractor), junction: `${r.from_junction || ""} → ${r.to_junction || ""}`, pipe: r.pipe_details, len: +r.pipe_length || 0, exc: +r.total_excavation || 0, hard: +r.hard_rock_qty || 0, soft: +r.soft_rock_qty || 0, soil: +r.soil_qty || 0, murum: +r.murum_qty || 0, cc: +r.cc_breaking_qty || 0, acc: +r.accessory_qty || 0, st: r.entry_status }));
  };
  let DASH = null;

  const app = DX.register({
    key: "pour", title: "Pour Card", short: "Pour Card", icon: "card", hue: "blue", route: "/desk/pour-card-report",
    desc: "Pipe laying · excavation & backfilling", eyebrow: "Pipe laying · Pour cards",
    headline: `Every metre of pipe, on a <span class="dx-grad">pour card</span>`,
    intro: "Create the card, add laying details per PIPE-ID (excavation, rock, soil, CC road, accessory), then Lock Entry. Quantities are calculated live with the same formulas as the server.",
    docs: [card, mt],
    boot: async () => {
      const [m, caps, mtm] = await Promise.all([DX.call(MA + "get_masters", {}, { get: true }), DX.call(MA + "capabilities", {}, { get: true }), DX.call(MA + "mt_masters", {}, { get: true }).catch(() => null)]);
      Object.assign(B, m, { caps });
      if (mtm) B.mt = mtm;
    },
    kpis: () => { const cs = DX.rows(card), s = (DASH && DASH.summary) || {}; return [
      { label: "Pour cards", value: nf(cs.length), sub: `<span class="dx-num">${cs.filter(c => c.docstatus === 0).length}</span> saved, not locked`, icon: "card" },
      { label: "Pipe entries", value: nf(s.pipe_entries || 0), sub: "PIPE-IDs in the last 30 days", icon: "pipe", tone: "cyan" },
      { label: "Total pipe length", value: nf(s.total_pipe_length || 0, 1), unit: "m", sub: `Excavation <span class="dx-num">${nf(s.total_excavation || 0, 1)}</span> m³`, icon: "layers" },
      { label: "Locked entries", value: nf(cs.filter(c => c.docstatus === 1).length), sub: `<span class="dx-num">${cs.length ? Math.round(cs.filter(c => c.docstatus === 1).length / cs.length * 100) : 0}%</span> of cards`, icon: "lock", tone: "ok" }
    ]; },
    panels: () => { const bars = ((DASH && DASH.chart) || []).slice().sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date))).slice(0, 8).map(x => ({ label: DX.fmtDate(x.entry_date), value: +x.value || 0 })); return [DX.card("Pipe entries by date", DX.bars(bars), { icon: "chart", tone: "cyan", sub: "last 30 days" })]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", docs: ["card"], load: async () => { try { DASH = await DX.call(RP + "get_page_data", { filters: DX.json({ from_date: DX.addDays(DX.TODAY, -29), to_date: DX.TODAY }), page: 1, page_length: 10 }); } catch (_) { DASH = null; } } },
      { id: "cards", label: "Pour cards", icon: "list", type: "list", count: () => DX.rows(card).length, searchPh: "Search card, component, contractor, junction…",
        search: [r => r.name, r => r.component, r => r.townproject, r => contractorName(r.select_contractor), r => r.from_junction, r => r.to_junction],
        filters: [{ f: "townproject", label: "Project", options: () => B.projects.map(p => p.name), clears: ["component"] }, { f: "component", label: "Component", options: f => byProject(B.components, f.townproject).map(c => c.name) }],
        columns: [{ f: "name", label: "Pour card", type: "mono", strong: true }, { f: "townproject", label: "Project" }, { f: "component", label: "Component" }, { label: "Contractor", get: r => contractorName(r.select_contractor), trunc: true }, { label: "Junction", type: "mono", get: r => `${r.from_junction || ""} → ${r.to_junction || ""}` }, { f: "total_quantity", label: "Acc. qty", type: "num" }, { f: "date", label: "Updated", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(card, r) }],
        cardFoot: r => [`<span class="dx-mono">${esc(r.from_junction || "")} → ${esc(r.to_junction || "")}</span>`, `<span>${esc(r.component || r.townproject || "")}</span>`, `<span class="dx-mono">${DX.fmtDate(r.date)}</span>`] },
      { id: "new", label: "New pour card", icon: "plus", type: "form", doc: "card" },
      { id: "report", label: "Pour card report", icon: "chart", type: "report", group: "Insights", title: "Pour Card Report", noLink: true, remote: true, days: 29, date: "date",
        load: async () => { const f = V.reportFilters(app, app.screens.find(s => s.id === "report")); if (f.to > DX.TODAY) f.to = DX.TODAY; await fetchReport(f.from, f.to); },
        rows: () => REP.rows,
        filters: [{ f: "townproject", label: "Project", options: () => B.projects.map(p => p.name) }, { f: "st", label: "Entry status", options: ["Saved", "Lock Entry", "Cancelled"] }],
        kpis: rows => [{ label: "Pour cards", value: nf(new Set(rows.map(r => r.name)).size), icon: "card" }, { label: "Pipe entries", value: nf(rows.length), icon: "pipe", tone: "cyan" }, { label: "Total pipe length", value: nf(DX.sum(rows, "len"), 1), unit: "m", icon: "layers" }, { label: "Total excavation", value: nf(DX.sum(rows, "exc"), 2), unit: "m³", icon: "box", tone: "ok" }],
        columns: [{ f: "name", label: "Pour card", type: "mono", strong: true }, { f: "date", label: "Entry date", type: "date" }, { f: "pipe_id", label: "Pipe ID", type: "mono" }, { f: "component", label: "Component" }, { f: "contractor", label: "Contractor", trunc: true }, { f: "junction", label: "Junction", type: "mono" }, { f: "pipe", label: "Pipe" }, { f: "len", label: "Length (m)", type: "num", d: 2, total: true }, { f: "exc", label: "Excavation (m³)", type: "num", d: 3, total: true }, { f: "hard", label: "Hard rock", type: "num", d: 3, total: true, hideSm: true }, { f: "soft", label: "Soft rock", type: "num", d: 3, total: true, hideSm: true }, { f: "soil", label: "Soil", type: "num", d: 3, total: true }, { f: "cc", label: "CC breaking", type: "num", d: 3, total: true, hideSm: true }, { f: "acc", label: "Acc. qty", type: "num", total: true }, { f: "st", label: "Status" }] },
      { id: "transfers", label: "Material transfer", icon: "swap", type: "list", doc: "mt", group: "Stock", searchPh: "Search entry or warehouse…", columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { label: "From warehouse", trunc: true, get: r => DX.whLabel(r.from_wh) }, { label: "To warehouse", trunc: true, get: r => DX.whLabel(r.to_wh) }, { f: "posting_date", label: "Posting date", type: "date" }, { f: "nitems", label: "Items", type: "num" }, { label: "Status", type: "status", get: r => DX.statusOf(mt, r) }],
        banner: () => B.mt.can_create ? "" : `<div class="dx-note dx-note-warn">${ic("lock", 16)}<div>Your role can view transfers but can’t create Stock Entries — ask for the Stock User role.</div></div>` },
      { id: "masters", label: "Masters", icon: "database", type: "masters", group: "Stock", tabs: [
        { label: "Components at site", doctype: "Component at Site", rows: () => B.components, columns: [{ f: "name", label: "Component", strong: true }, { f: "project", label: "Project" }] },
        { label: "Zones", doctype: "Zone Details", rows: () => B.zones, columns: [{ f: "name", label: "Zone", strong: true }, { f: "project", label: "Project" }] },
        { label: "Contractors", doctype: "Contractor at Site", rows: () => B.contractors, columns: [{ f: "contractor", label: "Contractor", strong: true }, { f: "project", label: "Project" }] },
        { label: "Pipe items", doctype: "Item · DI / HDPE / MDPE", rows: () => B.pipe_items.map(p => Object.assign({ d: dia(p.name) }, p)), columns: [{ f: "name", label: "Item", strong: true }, { f: "item_group", label: "Group" }, { f: "d", label: "Dia (mm)", type: "num" }, { f: "stock_uom", label: "UOM" }] },
        { label: "Accessories", doctype: "Item · accessory groups", rows: () => B.acc_items, columns: [{ f: "name", label: "Accessory", strong: true }, { f: "item_group", label: "Group" }, { f: "stock_uom", label: "UOM" }] }
      ] }
    ]
  });
})();

;
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

;
/* Concrete Master — LIVE (concrete_master.concrete_master.api.*). Every endpoint answers {ok, data} / {ok:false, message}. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, M = DX.M, { nf, esc, ic } = DX;
  const API = "concrete_master.concrete_master.api.";
  const call = async (m, a) => DX.okData(await DX.call(API + m, a || {}));
  const B = { grades: ["M5", "M7.5", "M10", "M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50"], cc: [], subs: {} };
  const townOpts = () => M.townOpts();
  const townLabel = (id, r) => (r && r.projecttown_label) || M.townLabel(id);
  const contractorLabel = (id, r) => (r && r.contractor_label) || M.contractorName(id);
  const matRow = m => ({ material: m.material, label: m.material_label || m.material, rate: +m.concrete_rate || 0, uom: m.uom, stock: +m.stock_balance || 0, consumption: +m.consumption || 0, wh: m.source_warehouse || "" });
  const fromRow = r => Object.assign({}, r, { date: DX.day(r.date), quantity_of_concrete: +r.quantity_of_concrete || 0 });
  const DETAIL = {};
  const detail = async name => { const d = await call("get_concrete_entry_detail", { name }); const x = fromRow(d); x.materials = (d.material_consumption || []).map(matRow); x._wh = (x.materials.find(m => m.wh) || {}).wh || ""; DETAIL[name] = { at: d.modified, doc: x }; return x; };

  const gm = {
    key: "gm", doctype: "Concrete Grade Map", canCreate: false, lazy: true, hideFromHome: true, status: () => null,
    entity: { singular: "Grade map", plural: "Grade maps", title: r => `${r.concrete_grade} · ${townLabel(r.townproject, { projecttown_label: r.townproject_label })}`, sub: r => `${r.material_count || (r.details || []).length} materials · ${r.name}`, date: "modified" },
    detailExtra: d => DX.card("Material per m³", (d.details || []).length ? DX.table([{ f: "label", label: "Material", strong: true }, { f: "rate", label: "Rate (per m³)", type: "num", d: 3 }, { f: "uom", label: "UOM" }, { f: "stock", label: "Stock", type: "num" }], d.details) : DX.empty("No material rows", ""), { icon: "layers", tone: "cyan" }) + DX.handoff("Grade maps are created and edited in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"),
    api: {
      ttl: 120000,
      load: async () => (await call("list_grade_maps", { limit: 500 })).map(r => Object.assign({}, r, { modified: DX.day(r.modified) })),
      get: async name => { await DX.ensure(gm); const row = DX.find(gm, name) || {}; let details = []; try { const r = await call("get_grade_materials", { projecttown: row.townproject, concrete_grade: row.concrete_grade, quantity_of_concrete: 1 }); details = (r.materials || []).map(matRow); } catch (_) { /* map without rows */ } return Object.assign({}, row, { details }); }
    }
  };
  const cc = {
    key: "cc", doctype: "Civil Component Master", canCreate: false, lazy: true, hideFromHome: true, status: () => null,
    entity: { singular: "Civil component", plural: "Civil components", title: r => r.civil_component_label || r.name, sub: r => `${r.townproject_label || M.townLabel(r.townproject)} · ${r.sub_component_count != null ? r.sub_component_count : (r.subs || []).length} sub components`, date: "modified" },
    detailExtra: d => DX.card("Sub components", (d.subs || []).length ? DX.table([{ f: "label", label: "Sub component", strong: true }], d.subs) : DX.empty("None", ""), { icon: "building" }) + DX.handoff("Civil components are created in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"),
    api: {
      ttl: 120000,
      load: async () => { const rows = (await call("list_civil_components_master", { limit: 500 })).map(r => Object.assign({}, r, { modified: DX.day(r.modified) })); B.cc = rows; return rows; },
      get: async name => { await DX.ensure(cc); return Object.assign({}, DX.find(cc, name) || { name }, { subs: (await call("get_sub_components", { civil_component: name })).map(s => ({ label: s.label || s.name })) }); },
    }
  };
  const loadSubs = async d => { if (!d.civil_component || B.subs[d.civil_component]) return; B.subs[d.civil_component] = (await call("get_sub_components", { civil_component: d.civil_component, projecttown: d.projecttown })).map(s => s.value || s.name); };

  const ce = {
    key: "ce", doctype: "Concrete Entry",
    entity: { singular: "Concrete entry", plural: "Concrete entries", title: r => `${r.concrete_grade || ""} · ${nf(r.quantity_of_concrete, 2)} m³`, sub: r => `${townLabel(r.projecttown, r)} · ${contractorLabel(r.contractor, r)}`, date: "date" },
    newLabel: "New concrete entry", submitLabel: "Submit entry", submitTitle: "Submit this concrete entry?", submitOk: "Submit & issue stock", submitSub: "Submitting creates a Stock Entry (Material Issue) for every material with consumption above 0.", submitLinesTitle: "Material Issue lines",
    defaults: () => ({ date: DX.TODAY, materials: [] }),
    form: [
      { id: "d", title: "Details", short: "Details", icon: "mixer", fields: [
        { f: "date", label: "Date", type: "date", req: true }, { f: "projecttown", label: "Project / town", type: "link", req: true, options: townOpts, onSet: d => { d.materials = []; } },
        { f: "contractor", label: "Contractor", type: "link", req: true, parent: ["projecttown"], options: d => M.contractorOpts(d.projecttown), hint: "Shows the contractor name — saves the Contractor at Project mapping ID." },
        { f: "civil_component", label: "Civil component", type: "link", req: true, parent: ["projecttown"], options: d => B.cc.filter(c => c.townproject === d.projecttown).map(c => ({ value: c.name, label: c.civil_component_label || c.name, sub: (c.sub_component_count || 0) + " sub components" })), onSet: d => { d.materials = []; } },
        { f: "sub_component", label: "Sub component", type: "link", req: true, parent: ["civil_component"], load: loadSubs, options: d => B.subs[d.civil_component] || [] },
        { f: "concrete_grade", label: "Concrete grade", type: "link", req: true, options: () => B.grades, onSet: d => { d.materials = []; } },
        { f: "quantity_of_concrete", label: "Quantity of concrete", type: "float", unit: "m³", req: true, step: 0.001 }
      ] },
      { id: "m", title: "Material consumption", short: "Materials", sub: "calculated vs stock vs actual", icon: "box", tone: "cyan", fields: [
        { f: "materials", label: "Materials", type: "table", span: "all", noAdd: true, reqMsg: "Click “Add consumption” to load materials from the grade map.", req: true,
          fill: { label: "Add consumption", icon: "refresh", run: async d => {
            if (!d.projecttown || !d.contractor || !d.concrete_grade || !(+d.quantity_of_concrete > 0)) throw new Error("Pick project/town, contractor, grade and quantity first.");
            const r = await call("get_grade_materials", { projecttown: d.projecttown, concrete_grade: d.concrete_grade, quantity_of_concrete: d.quantity_of_concrete, contractor: d.contractor });
            d._wh = r.source_warehouse || "";
            const prev = Object.fromEntries((d.materials || []).map(m => [m.material, m.consumption]));
            return (r.materials || []).map(m => Object.assign(matRow(m), { consumption: prev[m.material] || 0 }));
          }, done: d => `Loaded ${d.materials.length} materials from the grade map${d._wh ? " · stock from " + esc(DX.whLabel(d._wh)) : ""}.` },
          columns: [{ f: "label", label: "Material", type: "text", ro: true }, { f: "rate", label: "Rate", type: "float", ro: true, d: 3 }, { f: "calc", label: "Calculated qty", calc: (r, d) => (+d.quantity_of_concrete || 0) * (+r.rate || 0), d: 3, total: true }, { f: "uom", label: "UOM", type: "text", ro: true }, { f: "stock", label: "Stock", type: "float", ro: true, d: 2 }, { f: "consumption", label: "Consumption", type: "float", total: true }] }
      ] }
    ],
    validate: (d, sub) => (sub && !(d.materials || []).some(r => +r.consumption > 0) ? { materials: "No consumption value entered!" } : (d.materials || []).some(r => +r.consumption < 0) ? { materials: "Consumption cannot be negative." } : (d.materials || []).some(r => +r.consumption > (+r.stock || 0)) ? { materials: "Consumption is more than the stock available in the contractor’s warehouse." } : {}),
    onSubmit: () => {},
    submitLines: d => (d.materials || []).filter(r => +r.consumption > 0).map(r => [`${r.label} (${r.uom})`, nf(r.consumption, 3)]),
    submitNote: d => (d._wh ? `Source warehouse: <b class="dx-mono">${esc(DX.whLabel(d._wh))}</b>` : ""),
    submitToast: d => d.material_issue ? "Submitted · Material Issue created" : "Submitted",
    lockBanner: d => `<b>Submitted</b> — ${d.material_issue ? "Material Issue posted from the contractor’s store. " : ""}Cancelling this entry cancels the Material Issue too.`,
    api: {
      ttl: 30000,
      load: async () => (await call("list_concrete_entries", { limit: 500 })).map(fromRow),
      get: detail,
      save: async d => {
        const q = +d.quantity_of_concrete || 0;
        const data = { name: d.name || null, date: d.date, projecttown: d.projecttown, contractor: d.contractor, civil_component: d.civil_component, sub_component: d.sub_component, concrete_grade: d.concrete_grade, quantity_of_concrete: q, material_consumption: (d.materials || []).map(m => ({ material: m.material, concrete_rate: +m.rate || 0, calculated_quantity: q * (+m.rate || 0), uom: m.uom, stock_balance: +m.stock || 0, consumption: +m.consumption || 0 })) };
        const r = await call("save_concrete_entry", { data: DX.json(data) });
        return { name: r.name, docstatus: r.docstatus, material_issue: r.material_issue };
      },
      submit: async name => call("submit_concrete_entry", { name })
    }
  };
  const qty = rows => DX.sum(rows, "quantity_of_concrete");
  const topBy = (rows, key, lbl) => { const m = {}; rows.forEach(r => (m[r[key]] = (m[r[key]] || 0) + (+r.quantity_of_concrete || 0))); return Object.entries(m).map(([k, v]) => ({ label: lbl(k, rows.find(r => r[key] === k)), value: v })).sort((a, b) => b.value - a.value).slice(0, 6); };
  // consumption report needs each entry's material rows — fetched on demand (cached by modified time)
  const loadDetails = async rows => {
    const need = rows.filter(r => !DETAIL[r.name] || DETAIL[r.name].at !== r.modified).slice(0, 120);
    for (let i = 0; i < need.length; i += 6) await Promise.all(need.slice(i, i + 6).map(r => detail(r.name).catch(() => null)));
  };
  const mats = r => (DETAIL[r.name] && DETAIL[r.name].doc.materials) || [];

  const app = DX.register({
    key: "concrete", title: "Concrete Master", short: "Concrete", icon: "mixer", hue: "slate", route: "/desk/concrete-master",
    desc: "Concrete entry · grade maps · material issue", eyebrow: "Concrete master · site operations",
    headline: `Pour concrete, issue <span class="dx-grad">materials</span>`,
    intro: "Record each pour by project, component and grade. “Add consumption” pulls the grade map (material per m³), shows calculated qty against live stock, and submitting posts the Material Issue.",
    docs: [ce, gm, cc],
    boot: async () => { const [o] = await Promise.all([call("get_master_options").catch(() => null), DX.ensure(cc)]); if (o && o.grades && o.grades.length) B.grades = o.grades; },
    kpis: () => { const rows = DX.rows(ce), sub = rows.filter(r => r.docstatus === 1); return [
      { label: "Entries", value: nf(rows.length), sub: "Loaded from recent records", icon: "list" },
      { label: "Draft", value: nf(rows.filter(r => r.docstatus === 0).length), sub: "Ready to review", icon: "edit", tone: "pending" },
      { label: "Submitted", value: nf(sub.length), sub: "Material Issue posted", icon: "check", tone: "ok" },
      { label: "Concrete poured", value: nf(qty(sub), 1), unit: "m³", sub: `<span class="dx-num">${nf(qty(rows), 1)}</span> m³ incl. drafts`, icon: "mixer", tone: "cyan" }
    ]; },
    panels: () => { const rows = DX.rows(ce); const byGrade = {}; rows.forEach(r => (byGrade[r.concrete_grade] = (byGrade[r.concrete_grade] || 0) + (+r.quantity_of_concrete || 0))); return [
      DX.card("Grade-wise summary", DX.bars(Object.entries(byGrade).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value), { unit: "m³", fmt: v => nf(v, 2) }), { icon: "layers", tone: "cyan" }),
      `<section class="dx-cols">${DX.card("Top projects by quantity", DX.bars(topBy(rows, "projecttown", townLabel), { unit: "m³", fmt: v => nf(v, 1) }), { icon: "building" })}${DX.card("Top contractors by quantity", DX.bars(topBy(rows, "contractor", contractorLabel), { unit: "m³", fmt: v => nf(v, 1) }), { icon: "user" })}</section>`
    ]; },
    screens: [
      { id: "overview", label: "Overview", icon: "grid", type: "dashboard", doc: "ce", docs: ["ce"] },
      { id: "entries", label: "Concrete entry", icon: "list", type: "list", doc: "ce", group: "Concrete", count: () => DX.rows(ce).length, searchPh: "Search entry, project, contractor, grade…",
        search: [r => r.name, r => townLabel(r.projecttown, r), r => contractorLabel(r.contractor, r), r => r.concrete_grade, r => r.civil_component],
        filters: [{ f: "projecttown", label: "Project / town", options: townOpts, display: M.townLabel }, { f: "concrete_grade", label: "Grade", options: () => B.grades }],
        sum: rows => `<span class="dx-num">${nf(qty(rows), 2)}</span> m³`,
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Project", get: r => townLabel(r.projecttown, r), trunc: true }, { label: "Contractor", get: r => contractorLabel(r.contractor, r), trunc: true }, { label: "Component", get: r => `${r.civil_component || ""} · ${r.sub_component || ""}`, hideSm: true }, { f: "concrete_grade", label: "Grade" }, { f: "quantity_of_concrete", label: "Qty (m³)", type: "num", d: 2 }, { label: "Material Issue", type: "html", get: r => (r.material_issue ? DX.status("Issued", "ok") : "<span class=\"dx-faint\">—</span>") }, { label: "Status", type: "status", get: r => DX.statusOf(ce, r) }] },
      { id: "new", label: "New concrete entry", icon: "plus", type: "form", doc: "ce", group: "Concrete" },
      { id: "grademap", label: "Grade map", icon: "layers", type: "list", doc: "gm", group: "Masters", dateFilter: false, statuses: [], banner: () => DX.handoff("New grade maps are added in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"), columns: [{ f: "name", label: "Name", type: "mono", strong: true }, { label: "Project / town", get: r => r.townproject_label || M.townLabel(r.townproject) }, { f: "concrete_grade", label: "Grade" }, { f: "material_count", label: "Materials", type: "num" }] },
      { id: "components", label: "Civil component", icon: "building", type: "list", doc: "cc", group: "Masters", dateFilter: false, statuses: [], banner: () => DX.handoff("New civil components are added in the full Concrete Master page.", "/desk/concrete-master", "Open Concrete Master"), columns: [{ label: "Component", strong: true, get: r => r.civil_component_label || r.name }, { label: "Project / town", get: r => r.townproject_label || M.townLabel(r.townproject) }, { f: "sub_component_count", label: "Sub components", type: "num" }] },
      { id: "report", label: "Consumption report", icon: "chart", type: "report", doc: "ce", group: "Masters", days: 45, remote: true,
        load: async () => { await DX.ensure(ce); const f = V.reportFilters(app, app.screens.find(s => s.id === "report")); await loadDetails(DX.rows(ce).filter(r => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to))); },
        filters: [{ f: "projecttown", label: "Project / town", options: townOpts, display: M.townLabel }, { f: "concrete_grade", label: "Grade", options: () => B.grades }],
        kpis: rows => [{ label: "Concrete", value: nf(qty(rows), 2), unit: "m³", icon: "mixer", tone: "cyan" }, { label: "Entries", value: nf(rows.length), icon: "list" }, { label: "Cement issued", value: nf(rows.filter(r => r.docstatus === 1).reduce((s, r) => s + mats(r).filter(m => /cement/i.test(m.material + " " + m.label)).reduce((a, m) => a + (+m.consumption || 0), 0), 0), 1), unit: "Bag", icon: "box", tone: "ok" }],
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Project", get: r => townLabel(r.projecttown, r), trunc: true }, { label: "Contractor", get: r => contractorLabel(r.contractor, r), trunc: true }, { f: "concrete_grade", label: "Grade" }, { f: "quantity_of_concrete", label: "Qty (m³)", type: "num", d: 2, total: true }, { label: "Status", get: r => (r.docstatus === 1 ? "Submitted" : r.docstatus === 2 ? "Cancelled" : "Draft") }],
        after: rows => { const agg = {}; rows.forEach(r => mats(r).forEach(m => { const a = (agg[m.material] = agg[m.material] || { material: m.label, uom: m.uom, calc: 0, cons: 0, stock: m.stock }); a.calc += (+r.quantity_of_concrete || 0) * (+m.rate || 0); a.cons += +m.consumption || 0; })); const list = Object.values(agg); return "<div style='height:16px'></div>" + DX.card("Material-wise totals", list.length ? DX.table([{ f: "material", label: "Material", strong: true }, { f: "uom", label: "UOM" }, { f: "calc", label: "Calculated", type: "num", d: 2 }, { f: "cons", label: "Consumed", type: "num", d: 2 }, { f: "stock", label: "Stock (contractor store)", type: "num", d: 2 }], list) : DX.empty("No material rows in this range", ""), { icon: "box", tone: "cyan", sub: "calculated vs consumed vs stock" }); } }
    ]
  });
  void ic;
})();

;
/* Fuel — LIVE (vehicle_inhouse · page fuel-inward-direct-distribution). Two suite apps over the same records:
   · Fuel Inward & Direct Distribution — pump purchase (Drum → store, Vehicle → direct), invoice approval.
   · Fuel Stock Entry — store balances, drum inward, issue to vehicle (Fuel Distribution).
   Every create goes through the page's own API, which posts PR / PI / Material Issue and sends its notifications. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, { nf, esc, ic } = DX;
  const P = "vehicle_inhouse.vehicle_inhouse.page.fuel_inward_direct_distribution.fuel_inward_direct_distribution.";
  const FUEL_COMPANIES = ["ACTIVE INFRASTRUCTURES LIMITED", "Jain Engineering Works (India) Private Limited"];
  const B = { meta: null, towns: {}, pumps: {}, bal: {}, stock: null, stockAt: 0 };
  const meta = () => B.meta || { filter_options: { towns: [], vehicles: [], fuel_types: ["Diesel", "Petrol"], companies: [] } };
  const repaint = () => { if (DX.activeForm) DX.activeForm.refresh(); };
  const townLabel = id => { const t = (meta().filter_options.towns || []).find(x => x.value === id); return t ? t.label : DX.M.townLabel(id); };
  const vehicleLabel = id => { const v = (meta().filter_options.vehicles || []).find(x => x.value === id); return v ? v.label : id || ""; };
  DX.resolvers.push(v => { const o = (meta().filter_options.vehicles || []).find(x => x.value === v) || (meta().filter_options.towns || []).find(x => x.value === v); return o ? o.label : ""; });
  // the fuel companies configured on this site (server meta.fuel_companies = site_config "fuel_companies", else AIL/JEW); a site without any offers its own companies
  const fuelCompanies = () => { const have = DX.M.companies.map(c => c[0]), list = ((B.meta && B.meta.fuel_companies) || FUEL_COMPANIES).filter(c => have.includes(c)); return list.length ? list : have; };
  const companyOpts = () => fuelCompanies().map(c => ({ value: c, label: c, sub: DX.M.abbr(c) }));
  const q = (m, filters) => DX.call(P + m, { doctype: "Town At Project", txt: "", searchfield: "name", start: 0, page_len: 500, filters: DX.json(filters) });
  const loadTowns = async (company, applicable) => { const k = company + "|" + applicable; if (!B.towns[k]) B.towns[k] = ((await q("get_jain_town_projects", { company, applicable_for: applicable })) || []).map(([value, label]) => ({ value, label })); return B.towns[k]; };
  const loadPumps = async town => { if (!town) return []; if (!B.pumps[town]) B.pumps[town] = ((await DX.call(P + "get_petrol_pumps_for_town", { doctype: "Petrol Pump", txt: "", searchfield: "name", start: 0, page_len: 200, filters: DX.json({ town }) })) || []).map(([value, label]) => ({ value, label })); return B.pumps[town]; };
  const money = v => DX.money(v, 2);
  // linked documents open in ERPNext but never print their record ID
  const deskLink = (dt, name) => (name ? `<a class="dx-link" href="/app/${dt}/${encodeURIComponent(name)}" target="_blank" rel="noopener">Open</a> ` : `<span class="dx-faint">—</span>`);
  const issued = v => (v ? DX.status("Issued", "ok") : "<span class=\"dx-faint\">—</span>");
  const invoiceState = r => (!r.pi ? "<span class=\"dx-faint\">—</span>" : r.pi_pending ? DX.status("Approval pending", "pending") : DX.status("Approved", "ok"));

  /* ---- Fuel for Stock (Drum / Vehicle) ---- */
  const fromInward = r => ({ name: r.name, docstatus: 1, fuel_entry_type: r.entry_type, date: DX.day(r.date), company: r.company, fuel_station_town_name: r.town_project_id, town_label: r.town_project_label || r.town_project, custom_petrol_pump: r.petrol_pump, supplier: r.supplier, custom_vehicles: r.vehicle_id || "", vehicle_label: r.vehicle_label && r.vehicle_label !== "-" ? r.vehicle_label : "", types_of_fuel: r.fuel_type, quantity: +r.quantity || 0, rateltr_ffs: +r.rate || 0, amount: +r.amount || 0, warehouse: r.warehouse, pr: r.purchase_receipt || "", pi: r.purchase_invoice || "", pi_pending: !!r.purchase_invoice_pending, mi: r.material_issue || "", custom_remark: r.remark || "", custom_current_reading_km: r.custom_current_reading_km || r.current_reading_km || 0, last_reading_km: r.last_reading_km || 0, upload_invoice__invoice_copy: r.invoice_copy_url || r.invoice_file || "", upload_fuel_station_proof__fuel_station_receipt: r.fuel_station_proof_url || r.fuel_station_proof_file || "", custom_qr_attachment: r.qr_attachment_file || "", custom_upload_vehicle_reading: r.vehicle_reading_file || "", modified: r.modified });
  const piState = r => (!r.pi ? "none" : r.pi_pending ? "pending" : "approved");
  const WINDOW = () => ({ from_date: DX.addDays(DX.monthStart(), -31), to_date: DX.TODAY });
  const inwardDoc = over => Object.assign({
    key: "inward", store: "fuel.inward", doctype: "Fuel for Stock", canEdit: false,
    get canCreate() { return !!meta().can_create; },
    entity: { singular: "Fuel entry", plural: "Fuel entries", title: r => (r.fuel_entry_type === "Vehicle" ? "Direct · " + (r.vehicle_label || r.custom_vehicles) : "Inward · " + (r.warehouse || r.town_label || "")), sub: r => `${nf(r.quantity, 2)} L ${r.types_of_fuel || ""} · ${r.custom_petrol_pump || ""} · ${r.name}`, date: "date" },
    newLabel: "Add fuel entry", saveLabel: "Save entry",
    saveToast: s => `Entry <span class="dx-mono">${esc(s.name)}</span> saved — Purchase Receipt submitted, invoice sent for approval.`,
    status: r => ({ none: ["No invoice", ""], pending: ["Approval pending", "pending"], approved: ["Approved", "ok"] })[piState(r)], statusKey: piState,
    statusFilter: [["", "All"], ["pending", "Approval pending"], ["approved", "Approved"]],
    defaults: () => ({ fuel_entry_type: "Drum", date: DX.TODAY, company: meta().default_company || fuelCompanies()[0], types_of_fuel: (meta().filter_options.fuel_types || ["Diesel"])[0] || "Diesel", direct_reading_status: "Working" }),
    confirmSave: d => DX.confirm({ title: "Save this fuel entry?", ok: "Save entry", sub: "This posts real documents in ERPNext — it can only be undone by a Fuel Admin.",
      body: `<div class="dx-issue">${[["Mode", d.fuel_entry_type === "Vehicle" ? "Direct distribution (vehicle)" : "Fuel inward (drum)"], ["Amount", money((+d.quantity || 0) * (+d.rateltr_ffs || 0))], ["Purchase Receipt", "created & submitted"], ["Purchase Invoice", "draft — sent to Accounts for approval"]].concat(d.fuel_entry_type === "Vehicle" ? [["Material Issue", "created & submitted"]] : []).map(([k, v]) => `<div class="dx-issue-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div><p class="dx-muted" style="font-size:12.5px;margin-top:10px">Accounts users get an approval alert and the payment-options email is sent.</p>` }),
    form: [
      { id: "f", title: "Fuel inward / direct distribution", short: "Entry", sub: "complete each required field before saving", icon: "fuel", fields: [
        { f: "fuel_entry_type", label: "Fuel mode", type: "select", req: true, options: [{ value: "Drum", label: "Fuel inward (drum)" }, { value: "Vehicle", label: "Direct distribution (vehicle)" }], span: 2 },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "company", label: "Company", type: "link", req: true, options: companyOpts },
        { f: "fuel_station_town_name", label: "Town / project name", type: "link", req: true, parent: ["company"], load: d => loadTowns(d.company, "Fuel for Stock"), options: d => B.towns[d.company + "|Fuel for Stock"] || [], onSet: d => resolveStore(d) },
        { f: "custom_petrol_pump", label: "Petrol pump", type: "link", req: true, parent: ["fuel_station_town_name"], load: d => loadPumps(d.fuel_station_town_name), options: d => B.pumps[d.fuel_station_town_name] || [], onSet: d => supplierBalance(d) },
        { f: "adv", label: "Supplier advance / outstanding", type: "info", icon: "rupee", span: 2, html: d => { if (!d.custom_petrol_pump) return "Pick a petrol pump to see the supplier’s balance."; const b = B.bal[d.company + "|" + d.custom_petrol_pump]; return b ? `Current supplier advance <b class="dx-mono">${money(b.adv)}</b> · Outstanding payable <b class="dx-mono">${money(b.out)}</b>` : "Loading the supplier’s balance…"; } },
        { f: "custom_vehicles", label: "Vehicle name", type: "link", options: () => meta().filter_options.vehicles || [], showIf: d => d.fuel_entry_type === "Vehicle", onSet: d => lastReading(d, "custom_vehicles", d.fuel_station_town_name) },
        { f: "direct_reading_status", label: "Reading status", type: "select", options: ["Working", "Not Working"], showIf: d => d.fuel_entry_type === "Vehicle" },
        { f: "custom_current_reading_km", label: "Current reading (KM)", type: "float", showIf: d => d.fuel_entry_type === "Vehicle" && d.direct_reading_status === "Working" },
        { f: "last_info", label: "Last reading", type: "info", icon: "clock", showIf: d => d.fuel_entry_type === "Vehicle", html: d => (d.custom_vehicles ? (d.last_reading_km == null ? "Loading the last reading…" : `Last reading <b class="dx-mono">${nf(d.last_reading_km || 0)} KM</b> — current must be greater.`) : "Pick a vehicle to see its last reading.") },
        { f: "types_of_fuel", label: "Types of fuel", type: "select", req: true, options: () => meta().filter_options.fuel_types || ["Diesel", "Petrol"] },
        { f: "quantity", label: "Quantity", type: "float", unit: "L", req: true, step: 0.01 },
        { f: "rateltr_ffs", label: "Rate", type: "float", unit: "₹/L", req: true, step: 0.01 },
        { f: "amount", label: "Amount", type: "computed", money: true, d: 2, calc: d => (+d.quantity || 0) * (+d.rateltr_ffs || 0), formula: "quantity × rate" },
        { f: "wh", label: "Store", type: "info", icon: "building", html: d => (!d.fuel_station_town_name ? "Store is resolved from the town once you pick it." : d._whErr ? `<span style="color:var(--err)">${esc(d._whErr)}</span>` : d._wh ? `Store resolved automatically: <b class="dx-mono">${esc(d._wh)}</b>` : "Resolving the store…") },
        { f: "custom_remark", label: "Remark", type: "text", req: true, span: 2 }
      ] },
      { id: "p", title: "Upload proof of purchase", short: "Proof", icon: "camera", cols: 4, fields: [
        { f: "upload_invoice__invoice_copy", label: "Invoice copy", type: "photo", icon: "card", hint: "Optional — can be uploaded later" },
        { f: "upload_fuel_station_proof__fuel_station_receipt", label: "Fuel station proof", type: "photo", req: true, icon: "fuel" },
        { f: "custom_upload_vehicle_reading", label: "Vehicle reading", type: "photo", icon: "clock", accept: "image/*,video/*" },
        { f: "custom_qr_attachment", label: "QR attachment", type: "photo", icon: "grid", accept: "image/*,.heic,.heif,application/pdf" }
      ] }
    ],
    validate: d => {
      const e = {}, num = /^(\d+\.?\d*|\.\d+)$/;
      ["quantity", "rateltr_ffs"].forEach(f => { if (d[f] !== "" && d[f] != null && !num.test(String(d[f]).replace(/,/g, ""))) e[f] = "Enter a plain number."; });
      if (d.fuel_station_town_name && d._whErr) e.fuel_station_town_name = d._whErr;
      if (d.fuel_entry_type === "Vehicle") { if (!d.custom_vehicles) e.custom_vehicles = "Pick the vehicle."; if (d.direct_reading_status === "Working" && !(+d.custom_current_reading_km > (+d.last_reading_km || 0))) e.custom_current_reading_km = `Reading must be greater than last reading (${nf(d.last_reading_km || 0)} KM).`; }
      return e;
    },
    formNote: d => `${d.fuel_entry_type === "Vehicle" ? "Direct distribution · PR + PI + Material Issue" : "Fuel inward · PR + PI (stock into store)"} · <b>${DX.money((+d.quantity || 0) * (+d.rateltr_ffs || 0))}</b>`,
    detailActions: d => [d.docstatus !== 2 && meta().can_approve_invoices && d.pi_pending && { label: "Approve invoice", icon: "check", tone: "primary", run: x => approve(x) }, d.docstatus !== 2 && !d.upload_invoice__invoice_copy && { label: "Upload invoice copy", icon: "upload", run: x => uploadInvoice(x) }],
    detailExtra: d => DX.card("Documents", `<div class="dx-kv"><div class="k">Purchase Receipt</div><div class="v">${deskLink("purchase-receipt", d.pr)}${d.pr ? DX.status("Submitted", "ok") : ""}</div><div class="k">Purchase Invoice</div><div class="v">${deskLink("purchase-invoice", d.pi)}${d.pi ? (d.pi_pending ? DX.status("Draft · approval pending", "pending") : DX.status("Submitted", "ok")) : ""}</div>${d.mi ? `<div class="k">Material Issue</div><div class="v">${deskLink("stock-entry", d.mi)}${DX.status("Submitted", "ok")}</div>` : ""}<div class="k">Supplier</div><div class="v">${esc(d.supplier || "—")}</div><div class="k">Store</div><div class="v dx-mono">${esc(d.warehouse || "—")}</div></div>`, { icon: "card", tone: "cyan", sub: "created automatically on save" }) + (d.pi_pending ? `<div class="dx-note" style="margin-top:14px">${ic("rupee", 16)}<div>Payment options (advance / pay now by QR) are chosen from the link emailed for this invoice.</div></div>` : "") + "<div style='height:16px'></div>",
    api: {
      ttl: 45000,
      load: async () => ((await DX.call(P + "get_fuel_inward_direct_distribution_dashboard", { filters: DX.json(Object.assign({ report_scope: "inward_direct" }, WINDOW())) })).rows || []).map(fromInward),
      get: async name => { await DX.ensure(inA); const r = DX.find(inA, name); if (r) return r; const d = await DX.call("frappe.client.get", { doctype: "Fuel for Stock", name }); return { name: d.name, docstatus: d.docstatus, fuel_entry_type: d.fuel_entry_type, date: DX.day(d.date), company: d.company, fuel_station_town_name: d.fuel_station_town_name, town_label: townLabel(d.fuel_station_town_name), custom_petrol_pump: d.custom_petrol_pump, supplier: d.supplier_name, custom_vehicles: d.custom_vehicles, vehicle_label: vehicleLabel(d.custom_vehicles), types_of_fuel: d.types_of_fuel, quantity: d.quantity, rateltr_ffs: d.rateltr_ffs, amount: d.amount, warehouse: d.warehouse, custom_remark: d.custom_remark, upload_invoice__invoice_copy: d.upload_invoice__invoice_copy, upload_fuel_station_proof__fuel_station_receipt: d.upload_fuel_station_proof__fuel_station_receipt }; },
      save: async d => {
        const clean = v => String(v == null ? "" : v).replace(/,/g, "").trim();
        const data = { fuel_entry_type: d.fuel_entry_type, date: d.date, company: d.company, fuel_station_town_name: d.fuel_station_town_name, custom_petrol_pump: d.custom_petrol_pump, custom_remark: d.custom_remark, types_of_fuel: d.types_of_fuel, quantity: clean(d.quantity), rateltr_ffs: clean(d.rateltr_ffs), warehouse: d._wh || "", amount: (+clean(d.quantity) || 0) * (+clean(d.rateltr_ffs) || 0), upload_invoice__invoice_copy: d.upload_invoice__invoice_copy || "", upload_fuel_station_proof__fuel_station_receipt: d.upload_fuel_station_proof__fuel_station_receipt || "", custom_upload_vehicle_reading: d.custom_upload_vehicle_reading || "", custom_qr_attachment: d.custom_qr_attachment || "", payment_to_be_done: 0 };
        if (d.fuel_entry_type === "Vehicle") Object.assign(data, { custom_vehicles: d.custom_vehicles, direct_reading_status: d.direct_reading_status || "Working", custom_current_reading_km: d.direct_reading_status === "Working" ? +d.custom_current_reading_km || 0 : +d.last_reading_km || 0, last_reading_km: +d.last_reading_km || 0 });
        const r = await DX.call(P + "create_fuel_inward_direct_distribution_entry", { data: DX.json(data) });
        DX.invalidate(inA); B.stock = null; if (DX.homeData) DX.loadHome(true);
        return { name: r.entry, docs: r.documents };
      }
    }
  }, over || {});

  /* ---- Fuel Distribution (issue from store stock) ---- */
  const fromDist = r => ({ name: r.name, docstatus: r.docstatus != null ? r.docstatus : 1, fd_date: DX.day(r.date), company: r.company, fd_town_project: r.town_project_id, town_label: r.town_project_label || r.town_project, fd_vehicle_name: r.vehicle_id, vehicle_label: r.vehicle_label || r.vehicle, fd_fuel_type: r.fuel_type, issued_quantity_ltr: +r.quantity || 0, warehouse: r.warehouse, reading_status: r.reading_status, mi: r.material_issue || "", custom_remark: r.remark || "", custom_attachment: r.attachment_file || "", modified: r.modified });
  const distDoc = over => Object.assign({
    key: "dist", store: "fuel.dist", doctype: "Fuel Distribution", canEdit: false, lazy: true,
    get canCreate() { return !!meta().can_use_fuel_distribution; },
    entity: { singular: "Fuel distribution", plural: "Fuel distributions", title: r => r.vehicle_label || r.fd_vehicle_name, sub: r => `${nf(r.issued_quantity_ltr, 2)} L ${r.fd_fuel_type || ""} · ${r.warehouse || ""} · ${r.name}`, date: "fd_date" },
    newLabel: "Add fuel distribution", saveLabel: "Submit", status: () => ["Submitted", "ok"], statusFilter: [],
    saveToast: s => `Fuel Distribution <span class="dx-mono">${esc(s.name)}</span> submitted${s.mi ? " · Material Issue created" : ""}.`,
    defaults: () => ({ fd_date: DX.TODAY, company: meta().default_company || fuelCompanies()[0], reading_status: "Working", fd_fuel_type: "Diesel" }),
    confirmSave: d => DX.confirm({ title: "Submit this fuel distribution?", ok: "Submit", sub: "Deducts the fuel from the store now (Material Issue) and records Fuel for Vehicle.", body: `<div class="dx-issue">${[["Vehicle", vehicleLabel(d.fd_vehicle_name)], ["Issued", `${nf(d.issued_quantity_ltr, 2)} L ${d.fd_fuel_type}`], ["Store", d._wh || "—"]].map(([k, v]) => `<div class="dx-issue-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join("")}</div>${d.reading_status === "Not Working" ? `<p class="dx-muted" style="font-size:12.5px;margin-top:10px;color:var(--pending)">Reading status “Not Working” emails the fuel admins.</p>` : ""}` }),
    form: [
      { id: "s", title: "Fuel stock details", short: "Stock", icon: "droplet", fields: [
        { f: "fd_date", label: "Date", type: "date", req: true }, { f: "company", label: "Company", type: "link", req: true, options: companyOpts, onSet: d => distStock(d) },
        { f: "fd_town_project", label: "Town / project name", type: "link", req: true, parent: ["company"], load: d => loadTowns(d.company, "Fuel Distribution"), options: d => B.towns[d.company + "|Fuel Distribution"] || [], onSet: d => distStock(d) },
        { f: "stk", label: "In stock", type: "info", icon: "droplet", span: 2, html: d => { if (!d.fd_town_project) return "Pick a town to see the store’s stock."; if (d._stkErr) return `<span style="color:var(--err)">${esc(d._stkErr)}</span>`; if (!d._stk) return "Loading the store’s stock…"; return `<b class="dx-mono">${esc(d._stk.warehouse || "—")}</b> · Diesel <b class="dx-mono">${nf(d._stk.available_stock_ltr, 1)} L</b> · Petrol <b class="dx-mono">${nf(d._stk.fd_petrol_in_stock, 1)} L</b>`; } }
      ] },
      { id: "v", title: "Fuel distribution to vehicle", short: "Vehicle", icon: "truck", fields: [
        { f: "fd_vehicle_name", label: "Vehicle name", type: "link", req: true, options: () => meta().filter_options.vehicles || [], onSet: d => lastReading(d, "fd_vehicle_name", d.fd_town_project) },
        { f: "reading_status", label: "Reading status", type: "select", options: ["Working", "Not Working", "Not Applicable"] },
        { f: "fd_fuel_type", label: "Fuel type", type: "select", req: true, options: ["Petrol", "Diesel"] },
        { f: "vehicle_reading_km", label: "Current reading (KM)", type: "float", showIf: d => d.reading_status === "Working" },
        { f: "last_info", label: "Last reading", type: "info", icon: "clock", html: d => (d.fd_vehicle_name ? (d.last_reading_km == null ? "Loading the last reading…" : `Last reading <b class="dx-mono">${nf(d.last_reading_km || 0)} KM</b>`) : "Pick a vehicle to see its last reading.") },
        { f: "issued_quantity_ltr", label: "Issued quantity", type: "float", unit: "L", req: true, step: 0.01 },
        { f: "custom_remark", label: "Remark", type: "text", req: true, span: 2 },
        { f: "custom_attachment", label: "Upload vehicle reading", type: "photo", icon: "clock", accept: "image/*,video/*" }, { f: "custom_additional_vehicle_reading", label: "Upload attachment", type: "photo", icon: "image", accept: "image/*,video/*" }
      ] }
    ],
    validate: d => {
      const e = {};
      if (d._stk && +d.issued_quantity_ltr > 0) { const have = d.fd_fuel_type === "Petrol" ? +d._stk.fd_petrol_in_stock : +d._stk.available_stock_ltr; if (+d.issued_quantity_ltr > have) e.issued_quantity_ltr = `Not enough ${d.fd_fuel_type} stock. Available ${nf(have, 1)} L | Requested ${nf(d.issued_quantity_ltr, 1)} L.`; }
      if (d._stkErr) e.fd_town_project = d._stkErr;
      if (d.reading_status === "Working" && d.fd_vehicle_name && !(+d.vehicle_reading_km > (+d.last_reading_km || 0))) e.vehicle_reading_km = `Reading must be greater than the last reading (${nf(d.last_reading_km || 0)} KM).`;
      return e;
    },
    detailExtra: d => DX.card("Documents", `<div class="dx-kv"><div class="k">Material Issue</div><div class="v">${deskLink("stock-entry", d.mi)}${d.mi ? DX.status("Submitted", "ok") : ""}</div><div class="k">Store</div><div class="v dx-mono">${esc(d.warehouse || "—")}</div><div class="k">Town / project</div><div class="v">${esc(d.town_label || "—")}</div><div class="k">Reading status</div><div class="v">${d.reading_status === "Not Working" ? DX.status("Meter reading: NOT WORKING", "pending") : esc(d.reading_status || "—")}</div></div>`, { icon: "card", tone: "cyan" }) + "<div style='height:16px'></div>",
    api: {
      ttl: 45000,
      load: async () => ((await DX.call(P + "get_fuel_distribution_report", { filters: DX.json(WINDOW()) })).rows || []).map(fromDist),
      // the report rows carry no meter readings — read them from the document for the detail page
      get: async name => {
        await DX.ensure(distA); const r = DX.find(distA, name);
        let d; try { d = await DX.call("frappe.client.get", { doctype: "Fuel Distribution", name }); } catch (err) { if (r) return r; throw err; }
        const base = r || fromDist({ name: d.name, docstatus: d.docstatus, date: d.fd_date, company: d.company, town_project_id: d.fd_town_project, vehicle_id: d.fd_vehicle_name, fuel_type: d.fd_fuel_type, quantity: d.issued_quantity_ltr, warehouse: d.warehouse, reading_status: d.reading_status, material_issue: d.custom_material_issue, remark: d.custom_remark, attachment_file: d.custom_attachment, modified: d.modified });
        return Object.assign({}, base, { vehicle_reading_km: d.vehicle_reading_km, last_reading_km: d.last_reading_km, custom_additional_vehicle_reading: d.custom_additional_vehicle_reading || base.custom_additional_vehicle_reading || "" });
      },
      save: async d => {
        const data = { fd_date: d.fd_date, company: d.company, fd_town_project: d.fd_town_project, available_stock_ltr: d._stk ? d._stk.available_stock_ltr : 0, fd_petrol_in_stock: d._stk ? d._stk.fd_petrol_in_stock : 0, fd_vehicle_name: d.fd_vehicle_name, fd_fuel_type: d.fd_fuel_type, reading_status: d.reading_status || "Working", issued_quantity_ltr: String(d.issued_quantity_ltr).replace(/,/g, ""), vehicle_reading_km: d.reading_status === "Working" ? +d.vehicle_reading_km || 0 : "", last_reading_km: +d.last_reading_km || 0, warehouse: d._wh || "", custom_remark: d.custom_remark, custom_attachment: d.custom_attachment || "", custom_additional_vehicle_reading: d.custom_additional_vehicle_reading || "" };
        const r = await DX.call(P + "create_and_submit_fuel_distribution", { data: DX.json(data) });
        DX.invalidate(distA); B.stock = null; if (DX.homeData) DX.loadHome(true);
        return { name: r.name, mi: r.material_issue };
      }
    }
  }, over || {});

  // async lookups — each writes onto the form doc and repaints the info blocks
  async function resolveStore(d) {
    d._wh = ""; d._whErr = "";
    if (!d.company || !d.fuel_station_town_name) return;
    try { const r = await DX.call(P + "get_fuel_warehouse", { company: d.company, town_project: d.fuel_station_town_name, applicable_for: "Fuel for Stock" }); d._wh = r.warehouse || (r.enabled === false ? "Chosen by the server" : ""); } catch (e) { d._whErr = e.message; }
    repaint();
  }
  async function supplierBalance(d) {
    const k = d.company + "|" + d.custom_petrol_pump; if (!d.custom_petrol_pump || B.bal[k]) return repaint();
    try { const [a, o] = await Promise.all([DX.call(P + "get_current_supplier_advance", { company: d.company, supplier: d.custom_petrol_pump }), DX.call(P + "get_opening_invoice_outstanding", { company: d.company, supplier: d.custom_petrol_pump })]); B.bal[k] = { adv: +a.current_advance || 0, out: +o.outstanding_payable || 0 }; } catch (_) { B.bal[k] = { adv: 0, out: 0 }; }
    repaint();
  }
  async function lastReading(d, field, town) {
    d.last_reading_km = null; repaint();
    try { const r = await DX.call(P + "get_vehicle_last_reading", { vehicle: d[field] || "", town_project: town || "" }); d.last_reading_km = +r.last_reading_km || 0; } catch (_) { d.last_reading_km = 0; }
    repaint();
  }
  async function distStock(d) {
    d._stk = null; d._stkErr = ""; d._wh = "";
    if (!d.company || !d.fd_town_project) return repaint();
    try { d._stk = await DX.call(P + "get_fuel_distribution_stock", { town_project: d.fd_town_project, company: d.company }); d._wh = d._stk.warehouse || ""; } catch (e) { d._stkErr = e.message; }
    repaint();
  }
  function approve(d) {
    return DX.confirm({ title: "Approve and submit the invoice?", sub: `${esc(d.supplier || d.custom_petrol_pump)} · ${DX.money(d.amount)}`, ok: "Approve", body: `<div class="dx-hint">${ic("rupee", 16)}<span>Submits the Purchase Invoice. Unless “Pay now” was chosen from the email, the supplier’s oldest unallocated advance is adjusted against it.</span></div>` })
      .then(async ok => { if (!ok) return false; const r = await DX.call(P + "approve_fuel_inward_direct_distribution_invoice", { entry_name: d.name }); DX.toast(esc(r.message || "Invoice approved.")); DX.invalidate(inA); if (DX.homeData) DX.loadHome(true); return true; });
  }
  function uploadInvoice(d) {
    return new Promise((resolve, reject) => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,.heic,.heif";
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return resolve(false);
        try { DX.toast("Uploading the invoice copy…"); const url = await DX.upload(await DX.shrink(f)); const r = await DX.call(P + "update_fuel_inward_direct_distribution_invoice", { entry_name: d.name, invoice_file: url }); DX.toast(esc(r.message || "Invoice copy uploaded.")); DX.invalidate(inA); resolve(true); } catch (e) { reject(e); }
      };
      inp.click();
    });
  }

  // ONE suite app for fuel: pump purchase (Drum / Vehicle), store stock, issue to vehicle, approvals and reports
  const inA = inwardDoc(), distA = distDoc();
  const canDist = () => !!meta().can_use_fuel_distribution;
  const bootFuel = async app => {
    if (!B.meta) B.meta = await DX.call(P + "get_fuel_inward_direct_distribution_meta");
    if (!B.meta.can_use_fuel_distribution) app.screens = app.screens.filter(s => !s.needsDist);
    if (!B.meta.can_approve_invoices) app.screens = app.screens.filter(s => s.id !== "approvals");
  };
  const pending = () => DX.rows(inA).filter(r => r.pi_pending);
  const inwardCols = [{ f: "date", label: "Date", type: "date" }, { f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => (r.fuel_entry_type === "Vehicle" ? "Direct distribution" : "Fuel inward") }, { f: "town_label", label: "Town / project", trunc: true }, { f: "types_of_fuel", label: "Fuel" }, { f: "quantity", label: "Quantity (L)", type: "num", d: 2, total: true }, { f: "amount", label: "Amount", type: "money", total: true }, { label: "Approval", type: "status", get: r => DX.statusOf(inA, r) }];
  const distCols = [{ f: "fd_date", label: "Date", type: "date" }, { f: "name", label: "Entry", type: "mono", strong: true }, { f: "town_label", label: "Town / project", trunc: true }, { f: "vehicle_label", label: "Vehicle", trunc: true }, { f: "reading_status", label: "Reading" }, { f: "fd_fuel_type", label: "Fuel" }, { f: "issued_quantity_ltr", label: "Quantity (L)", type: "num", d: 1, total: true }, { f: "warehouse", label: "Store", trunc: true }, { label: "Material Issue", type: "html", get: r => issued(r.mi) }];
  const stores = () => Array.from(new Set(DX.rows(inA).filter(r => r.fuel_entry_type === "Drum").map(r => r.warehouse).concat(DX.rows(distA).map(r => r.warehouse)).filter(Boolean))).sort();
  // real store balances (Bin) for every town the user can issue from — cached for 2 minutes
  const loadStock = async () => {
    if (B.stock && Date.now() - B.stockAt < 120000) return;
    const m = meta(), company = m.default_company || fuelCompanies()[0];
    const towns = (m.allowed_distribution_towns && m.allowed_distribution_towns.length ? m.allowed_distribution_towns : m.allowed_towns || []).slice(0, 60);
    const out = [];
    for (let i = 0; i < towns.length; i += 8) await Promise.all(towns.slice(i, i + 8).map(t => DX.call(P + "get_fuel_distribution_stock", { town_project: t, company }).then(r => { if (r && r.warehouse) out.push({ s: r.warehouse, town: townLabel(t), d: +r.available_stock_ltr || 0, p: +r.fd_petrol_in_stock || 0 }); }, () => null)));
    B.stock = out.sort((a, b) => b.d - a.d); B.stockAt = Date.now(); B.stockCompany = company;
  };
  // every fuel movement with the vehicle it went to: drum inward (in), issue to vehicle (out), and direct at the pump —
  // a direct entry receives the fuel into the town store and issues it to the vehicle at once, so it shows both
  function ledger() {
    const inward = DX.rows(inA).map(r => {
      const qty = +r.quantity || 0, direct = r.fuel_entry_type === "Vehicle";
      return { date: r.date, ref: r.name, kind: direct ? "Direct at pump" : "Drum inward", vehicle: direct ? r.vehicle_label || vehicleLabel(r.custom_vehicles) : "", store: r.warehouse, fuel: r.types_of_fuel, qty, inQ: qty, outQ: direct ? qty : 0, dir: direct ? 0 : 1 };
    });
    const issues = DX.rows(distA).filter(r => r.docstatus !== 2).map(r => { const qty = +r.issued_quantity_ltr || 0; return { date: r.fd_date, ref: r.name, kind: "Issue to vehicle", vehicle: r.vehicle_label || vehicleLabel(r.fd_vehicle_name), store: r.warehouse, fuel: r.fd_fuel_type, qty, inQ: 0, outQ: qty, dir: -1 }; });
    return inward.concat(issues).sort((a, b) => b.date.localeCompare(a.date) || a.dir - b.dir);
  }
  const storeTable = (rows, maxh) => ((rows || []).length ? DX.table([{ f: "s", label: "Store", strong: true }, { f: "town", label: "Town / project", hideSm: true }, { f: "d", label: "Diesel (L)", type: "num", d: 1, total: true }, { f: "p", label: "Petrol (L)", type: "num", d: 1, total: true }, { label: "Status", type: "status", get: r => (r.d < 50 ? DX.status("Low", "pending") : DX.status("OK", "ok")) }], rows, { foot: true, maxh }) : DX.empty("No store balances", "No fuel store is configured for your towns yet."));
  const movements = n => ledger().slice(0, n).map(l => `<div class="dx-feed-row"><span class="dx-tile${l.dir > 0 ? " dx-tile-ok" : " dx-tile-pending"}">${ic(l.dir > 0 ? "download" : "truck", 14)}</span><div class="dx-feed-main"><div class="dx-feed-title">${l.dir > 0 ? "In" : l.dir < 0 ? "Out" : "Direct"} · <span class="dx-mono">${nf(l.qty, 1)} L</span> ${esc(l.fuel)}</div><div class="dx-feed-sub">${l.vehicle ? esc(l.vehicle) + " · " : ""}${esc(l.store)}</div></div><div class="dx-feed-end"><span class="dx-mono dx-muted" style="font-size:11px">${DX.fmtDate(l.date)}</span></div></div>`).join("") || DX.empty("No movements", "");
  const vehicleSummary = () => { const by = {}; DX.rows(inA).forEach(r => { if (r.fuel_entry_type === "Vehicle") { const k = r.vehicle_label || r.custom_vehicles; by[k] = (by[k] || 0) + (+r.quantity || 0); } }); return DX.card("Vehicle-wise summary", DX.bars(Object.entries(by).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8), { unit: "L", fmt: v => nf(v, 1) }), { icon: "truck", tone: "cyan", sub: "direct distribution at the pump" }); };

  const app = DX.register({
    key: "fuelin", title: "Fuel", short: "Fuel", icon: "fuel", hue: "green", route: "/desk/fuel-inward-direct-distribution",
    desc: "Pump purchase · store stock · issue to vehicle", eyebrow: "Fuel management", headline: `Fuel <span class="dx-grad">dashboard</span>`,
    intro: "Record fuel bought at the pump — into the site store (drum) or straight into a vehicle — and issue store fuel to vehicles. A pump entry submits the Purchase Receipt and sends the invoice to Accounts; every issue posts a Material Issue from the store.",
    docs: [inA, distA], noRecent: true,
    boot: () => bootFuel(app),
    heroActions: () => `${V.newBtn(inA)}${canDist() ? `<button class="dx-btn dx-btn-secondary" data-go="${DX.newRoute(distA)}">${ic("truck", 15)}Issue to vehicle</button>` : ""}`,
    kpis: () => {
      const f = DX.rows(inA).filter(r => r.date >= DX.addDays(DX.TODAY, -30));
      const k = [
        { label: "Total inward", value: nf(DX.sum(f.filter(r => r.fuel_entry_type === "Drum"), "quantity")), unit: "Ltr", sub: `Drum · last 30 days · <span class="dx-num">${DX.money(DX.sum(f, "amount"))}</span> purchased`, icon: "droplet", tone: "cyan" },
        { label: "Direct distribution", value: nf(DX.sum(f.filter(r => r.fuel_entry_type === "Vehicle"), "quantity")), unit: "Ltr", sub: "Pump → vehicle · last 30 days", icon: "truck" }
      ];
      if (canDist()) k.push({ label: "Diesel in stores", value: nf(DX.sum(B.stock || [], "d")), unit: "L", sub: `<span class="dx-num">${nf(DX.sum(DX.rows(distA).filter(r => r.fd_date >= DX.monthStart()), "issued_quantity_ltr"))}</span> L issued to vehicles this month`, icon: "database", tone: "ok" });
      else k.push({ label: "Total purchase amount", value: DX.money(DX.sum(f, "amount")), sub: "Both entry types · last 30 days", icon: "rupee", tone: "ok" });
      k.push({ label: "Pending invoice approvals", value: nf(pending().length), sub: "Purchase Invoices in draft", icon: "inbox", tone: "pending" });
      return k;
    },
    panels: () => (canDist()
      ? [DX.card("Store-wise balance", storeTable((B.stock || []).slice(0, 8)), { icon: "database", tone: "cyan", sub: `live stock · ${esc(B.stockCompany || "")}`, action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="fuelin/stock">All stores${ic("right", 13)}</button>` }),
        DX.card("Latest movements", movements(8), { icon: "swap", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="fuelin/ledger">Stock ledger${ic("right", 13)}</button>` }),
        `<div style="height:16px"></div>${vehicleSummary()}`]
      : [vehicleSummary(), DX.card("Recent fuel entries", V.recentList(inA, 8), { icon: "clock", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="fuelin/inward">View all${ic("right", 13)}</button>` })]),
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "inward", docs: ["inward"], load: async () => { if (canDist()) await Promise.all([DX.ensure(distA), loadStock()]); } },
      { id: "inward", label: "Inward & direct", icon: "list", type: "list", doc: "inward", group: "Pump purchase", count: () => DX.rows(inA).length, searchPh: "Search entry, vehicle, PR or PI…", search: [r => r.name, r => r.vehicle_label, r => r.pr, r => r.pi, r => r.custom_petrol_pump, r => r.supplier],
        banner: () => `<div class="dx-note">${ic("calendar", 16)}<div>Showing entries from <b>${DX.fmtDate(WINDOW().from_date)}</b> to today. Older entries are in the full report on the ERP page.</div></div>`,
        filters: [{ f: "fuel_entry_type", label: "Entry type", options: [{ value: "Drum", label: "Fuel inward" }, { value: "Vehicle", label: "Direct distribution" }], display: v => (v === "Drum" ? "Fuel inward" : "Direct distribution") }, { f: "town_label", label: "Town / project", options: () => [...new Set(DX.rows(inA).map(r => r.town_label).filter(Boolean))].sort() }, { f: "types_of_fuel", label: "Fuel", options: () => meta().filter_options.fuel_types || ["Diesel", "Petrol"] }],
        sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "quantity"), 1)}</span> L · <span class="dx-num">${DX.money(DX.sum(rows, "amount"))}</span>`, columns: inwardCols },
      { id: "add", label: "Add fuel entry", icon: "plus", type: "form", doc: "inward", group: "Pump purchase" },
      { id: "stock", label: "Store balance", icon: "database", group: "Store & issue", needsDist: true, load: loadStock, render: () => DX.card("Store-wise balance", storeTable(B.stock, "68vh"), { icon: "database", tone: "cyan", sub: `live stock · ${esc(B.stockCompany || "")} · inward − issued` }) },
      { id: "distribution", label: "Fuel distribution", icon: "truck", type: "list", doc: "dist", group: "Store & issue", needsDist: true, searchPh: "Search entry, vehicle or material issue…", search: [r => r.name, r => r.vehicle_label, r => r.mi], filters: [{ f: "town_label", label: "Town / project", options: () => [...new Set(DX.rows(distA).map(r => r.town_label).filter(Boolean))].sort() }, { f: "reading_status", label: "Reading status", options: ["Working", "Not Working", "Not Applicable"] }], columns: distCols },
      { id: "newissue", label: "Issue to vehicle", icon: "plus", type: "form", doc: "dist", group: "Store & issue", needsDist: true },
      { id: "ledger", label: "Stock ledger", icon: "swap", group: "Store & issue", needsDist: true, docs: ["inward", "dist"], render: () => DX.card("Stock ledger", `<div class="dx-meta"><span>Drum inward, issues to vehicles and direct pump fills since ${DX.fmtDate(WINDOW().from_date)}, newest first.</span></div>` + DX.table([{ f: "date", label: "Date", type: "date" }, { f: "ref", label: "Voucher", type: "mono" }, { f: "kind", label: "Type", hideSm: true }, { label: "Vehicle", trunc: true, strong: true, get: l => l.vehicle || "—" }, { f: "store", label: "Store", trunc: true }, { f: "fuel", label: "Fuel" }, { label: "In (L)", type: "num", d: 1, get: l => l.inQ || "" }, { label: "Out (L)", type: "num", d: 1, get: l => l.outQ || "" }], ledger(), { maxh: "68vh" }), { icon: "swap", tone: "cyan" }) },
      { id: "approvals", label: "Invoice approvals", icon: "inbox", group: "Accounts", docs: ["inward"], count: () => pending().length, render: () => DX.card("Invoice approvals", pending().map(r => `<div class="dx-appr"><div class="dx-appr-main"><div class="dx-appr-title">${esc(r.supplier || r.custom_petrol_pump)} <span class="dx-muted" style="font-weight:400">· ${r.fuel_entry_type === "Vehicle" ? "Direct distribution" : "Fuel inward"}</span></div><div class="dx-appr-meta"><span>${esc(r.town_label || "")}</span><span>${nf(r.quantity, 2)} L ${esc(r.types_of_fuel)}</span><span class="dx-mono">${DX.fmtDate(r.date)}</span></div></div><div class="dx-appr-amt">${DX.money(r.amount)}</div><div class="dx-appr-actions"><button class="dx-btn dx-btn-secondary dx-btn-sm" data-go="${esc(DX.entryRoute(inA, r))}">Open</button><button class="dx-btn dx-btn-ok dx-btn-sm" data-approve="${esc(r.name)}">${ic("check", 13)}Approve</button></div></div>`).join("") || DX.empty("Nothing to approve", "Every fuel invoice in this window has been approved."), { icon: "inbox", tone: "pending", sub: `${pending().length} draft Purchase Invoices · Accounts User / Manager` }),
        bind: ctx => ctx.on("click", async e => { const a = e.target.closest("[data-approve]"); if (!a) return; try { if (await approve(DX.find(inA, a.dataset.approve))) ctx.rerender(); } catch (err) { V.showProblems(err, "Couldn’t approve"); } }) },
      { id: "report", label: "Inward report", icon: "chart", type: "report", doc: "inward", group: "Reports", title: "Inward & Direct Distribution report", tabs: [{ id: "report", label: "Inward & direct distribution" }, { id: "fdreport", label: "Fuel distribution" }], filters: [{ f: "types_of_fuel", label: "Fuel", options: () => meta().filter_options.fuel_types || ["Diesel", "Petrol"] }, { f: "warehouse", label: "Store", options: () => stores() }], sum: rows => `<span class="dx-num">${nf(DX.sum(rows, "quantity"), 1)}</span> Ltr total`, columns: inwardCols.concat([{ f: "rateltr_ffs", label: "Rate", type: "num", d: 2 }, { label: "Invoice", type: "html", get: r => invoiceState(r) }]) },
      { id: "fdreport", label: "Distribution report", icon: "chart", type: "report", doc: "dist", group: "Reports", date: "fd_date", needsDist: true, title: "Fuel Distribution report", tabs: [{ id: "report", label: "Inward & direct distribution" }, { id: "fdreport", label: "Fuel distribution" }], filters: [{ f: "fd_fuel_type", label: "Fuel", options: ["Diesel", "Petrol"] }, { f: "reading_status", label: "Reading status", options: ["Working", "Not Working", "Not Applicable"] }], columns: distCols }
    ]
  });
})();

;
/* HSC Inhouse — LIVE (hsc_master_inhouse.api.*, same API as /desk/dux-hsc-inhouse and /hsc/m). 12k+ installations → lists page on the server.
   jewipl keeps Material Issue off for the HSC page (hsc_material_issue_enabled = 0) but on for entries submitted from
   this suite (hsc_ops_suite_stock = 1): submit sends ops_suite=1 and the stock leaves the contractor's own warehouse. */
(function () {
  "use strict";
  const DX = window.DX, V = DX.views, { nf, esc, ic } = DX;
  const API = "hsc_master_inhouse.api.";
  const B = { masters: {}, counts: {}, permissions: {}, features: {}, role: "user", default_company: "", dash: null, rep: {} };
  const ms = k => B.masters[k] || [];
  const lbl = (k, v) => { if (!v) return ""; const o = ms(k).find(x => x.value === v); return o ? o.label : v; };
  const byTown = (k, t, field = "townproject") => ms(k).filter(x => !t || x[field] === t);
  const DIA = ["63 MM", "75 MM", "90 MM", "110 MM", "125 MM", "140 MM", "160 MM"];
  const flt = (f, label, unit) => ({ f, label, type: "float", step: 0.001, unit });
  const STATUS = { draft: "Draft", submitted: "Submitted", cancelled: "Cancelled" };
  const MAT = [["pipeDia", "dia"], ["waterMeter", "water_meter"], ["ftaL", "ftal"], ["fta", "fta"], ["saddleSize", "saddle_size"], ["mdpePipe", "mdpe_pipe_mtr"], ["dce", "dce"], ["ballValve", "ball_valve"], ["brassFerrule", "brass_ferrule"], ["ccLen", "cc_l"], ["ccWidth", "cc_w"], ["ccDepth", "cc_d"], ["soilLen", "soil_l"], ["soilWidth", "soil_w"], ["soilDepth", "soil_d"]];
  const TOP = [["date", "select_date"], ["company", "company"], ["town", "hdi_townproject"], ["zone", "hdi_zone_name"], ["ward", "hdi_ward_number"], ["area", "hdi_area_name"], ["fromJunction", "hdi_from_junction"], ["toJunction", "hdi_to_junction"], ["consumer", "hdi_house_owner_name"], ["connection", "hdi_types_of_connection"], ["cast", "hdi_select_ckhi"], ["ration", "hdi_ration_card"], ["mobile", "hdi_mobile_number"], ["aadhar", "hdi_aadhar_number"], ["address", "hdi_address"], ["contractor", "hdi_contractor_name"], ["supervisor", "hdi_supervisor_name"], ["remarks", "remark"], ["store", "store"], ["housePhoto", "house_photo"], ["connectionPhoto", "connection_photo"], ["aadharPhoto", "aadhar_card_photo"], ["connectionReceiptPhoto", "connection_receipt_photo"], ["electricityBillPhoto", "electricity_bill_photo"]];
  const fromInst = r => { const d = { name: r.id || r.name, docstatus: r.docstatus, material_issue: r.materialIssue, updated: r.updated, latitude: r.latitude, longitude: r.longitude }; TOP.forEach(([a, b]) => (d[b] = r[a] == null ? "" : r[a])); MAT.forEach(([a, b]) => (d[b] = (r.materials || {})[a] == null ? "" : r.materials[a])); d.select_date = DX.day(d.select_date); d.hdi_from_junction = d.hdi_from_junction || ""; d.hdi_to_junction = d.hdi_to_junction || ""; return d; };
  const toInst = d => { const o = { materials: {} }; if (d.name) o.id = d.name; TOP.forEach(([a, b]) => { if (!["connectionReceiptPhoto", "electricityBillPhoto", "store"].includes(a)) o[a] = d[b] == null ? "" : d[b]; }); MAT.forEach(([a, b]) => (o.materials[a] = d[b] == null ? "" : d[b])); return o; };
  const RMAP = [["hsc", "hsc_reference"], ["townproject", "ihr_townproject"], ["date", "select_date"], ["contractor", "ihr_contractor_name"], ["supervisor", "ihr_supervisor_name"], ["dia", "dia"], ["ccBreakingWidth", "cc_breaking_widthmm"], ["ccBreakingDepth", "cc_breaking_depthmm"], ["ccBreakingLength", "cc_breaking_lengthmtr"], ["brassFerrule", "brass_ferrule"], ["saddleSize", "saddle_size"], ["ftal", "ftal"], ["mdpePipe", "mdpe_pipe_mtr"], ["valve", "valve"]];
  const fromRep = r => { const d = { name: r.id || r.name, docstatus: r.docstatus, material_issue: r.materialIssue, updated: r.updated }; RMAP.forEach(([a, b]) => (d[b] = r[a] == null ? "" : r[a])); d.select_date = DX.day(d.select_date); return d; };
  const toRep = d => { const o = {}; if (d.name) o.id = d.name; RMAP.forEach(([a, b]) => (o[a] = d[b] == null ? "" : d[b])); return o; };
  const listQuery = (method, map, extra) => async p => {
    const filters = Object.assign({ status: p.status ? STATUS[p.status] : "All status", search: p.q || "", limit_start: p.start, include_total: 1 }, extra ? extra(p) : {});
    const r = await DX.call(API + method, { filters: DX.json(filters), limit: p.limit }, { get: true });
    const rows = Array.isArray(r) ? r : r.rows || [];
    return { rows: rows.map(map), total: Array.isArray(r) ? rows.length : r.total };
  };
  const stStatus = r => (r.docstatus === 2 ? ["Cancelled", "err"] : r.docstatus === 1 ? ["Submitted", "ok"] : ["Draft", ""]);
  const stKey = r => ["draft", "submitted", "cancelled"][r.docstatus || 0];
  const canAdmin = () => !!(B.permissions.can_admin || B.can_admin);

  const inst = {
    key: "inst", doctype: "HSC Details Inhouse",
    get canCreate() { return B.permissions.can_create_installation !== false; },
    entity: { singular: "Installation", plural: "Installations", title: r => r.hdi_house_owner_name || r.name, sub: r => `${lbl("towns", r.hdi_townproject)} · ${r.name}`, date: "select_date" },
    newLabel: "New installation", newTitle: "Create HSC installation", get submitSub() { return B.features.material_issue_enabled ? "Submitting locks the installation and posts the Material Issue — the materials leave the contractor’s warehouse." : "Submitting locks the installation. Material Issue is switched off for HSC on this site, so no stock moves."; },
    status: stStatus, statusKey: stKey, statusFilter: [["", "All status"], ["draft", "Draft"], ["submitted", "Submitted"], ["cancelled", "Cancelled"]],
    defaults: () => ({ select_date: DX.TODAY, company: B.default_company || DX.M.defaultCompany, hdi_types_of_connection: "HSC Connection" }),
    form: [
      { id: "c", title: "Consumer details", short: "Consumer", icon: "user", fields: [
        { f: "company", label: "Company", type: "link", options: () => ms("companies") }, { f: "select_date", label: "Date", type: "date" },
        { f: "hdi_townproject", label: "Town and project", type: "link", req: true, options: () => ms("towns").map(t => ({ value: t.value, label: t.label, group: t.project_name })) },
        { f: "hdi_zone_name", label: "Zone name", type: "link", parent: ["hdi_townproject"], options: d => byTown("zones", d.hdi_townproject, "hsc_townproject") },
        { f: "hdi_ward_number", label: "Ward number", type: "link", parent: ["hdi_townproject"], options: d => byTown("wards", d.hdi_townproject).map(w => ({ value: w.value, label: "Ward " + w.label })) },
        { f: "hdi_area_name", label: "Area name", type: "link", parent: ["hdi_ward_number"], options: d => byTown("areas", d.hdi_townproject).filter(a => !d.hdi_ward_number || a.ward_number === d.hdi_ward_number) },
        { f: "hdi_from_junction", label: "From junction", type: "int" }, { f: "hdi_to_junction", label: "To junction", type: "int" },
        { f: "hdi_house_owner_name", label: "House owner name", type: "text", req: true, onSet: d => (d.hdi_house_owner_name = String(d.hdi_house_owner_name).replace(/[^A-Za-z\s]/g, "")), hint: "Letters and spaces only." },
        { f: "hdi_types_of_connection", label: "Types of connection", type: "select", options: ["HSC Connection", "Temple", "Masjid", "School"], span: 2 },
        { f: "hdi_select_ckhi", label: "Cast", type: "select", options: ["General", "OBC", "ST", "SC"] },
        { f: "hdi_ration_card", label: "Ration card", type: "select", options: ["BPL", "APL"] },
        { f: "hdi_mobile_number", label: "Mobile number", type: "digits", len: 10 },
        { f: "hdi_aadhar_number", label: "Aadhar number", type: "digits", len: 12, mask: true, hint: "Must be unique across all installations." },
        { f: "hdi_address", label: "Address", type: "textarea", span: "all" }
      ] },
      { id: "m", title: "Material details", short: "Material", icon: "box", tone: "cyan", cols: 4, fields: [
        // same fields, order and labels as the HSC Inhouse page (/desk/dux-hsc-inhouse)
        { f: "dia", label: "Pipe DIA", type: "link", options: DIA }, flt("water_meter", "Water Meter"), flt("ftal", "FTA - L"), flt("fta", "FTA"),
        { f: "saddle_size", label: "Saddle Size", type: "link", options: DIA }, flt("mdpe_pipe_mtr", "MDPE Pipe (mtr)"), flt("dce", "DCE"), flt("ball_valve", "Ball Valve"),
        flt("brass_ferrule", "Brass Ferrule"), flt("cc_l", "CC Breaking Length (mtr)"), flt("cc_w", "CC Breaking Width (mtr)"), flt("cc_d", "CC Breaking Depth (mtr)"),
        flt("soil_l", "Soil Excavation Length"), flt("soil_w", "Soil Excavation Width"), flt("soil_d", "Soil Excavation Depth")
      ] },
      { id: "k", title: "Contractor details", short: "Contractor", icon: "building", fields: [
        { f: "hdi_contractor_name", label: "Contractor name", type: "link", parent: ["hdi_townproject"], options: d => byTown("contractors", d.hdi_townproject).map(c => ({ value: c.value, label: c.contractor || c.label })), onSet: d => contractorStore(d) },
        { f: "hdi_supervisor_name", label: "Supervisor name", type: "link", parent: ["hdi_townproject"], options: d => byTown("supervisors", d.hdi_townproject) },
        { f: "wh", label: "Store", type: "info", icon: "truck", html: d => (!d.hdi_contractor_name ? "Pick a contractor — it must belong to the selected town." : d._whErr ? `<span style="color:var(--err)">${esc(d._whErr)}</span>` : d._wh ? `Warehouse resolved: <b class="dx-mono">${esc(DX.whLabel(d._wh))}</b>` : "Resolving the contractor’s warehouse…") },
        { f: "remark", label: "Remarks", type: "textarea", span: "all" }
      ] },
      { id: "p", title: "Photos", short: "Photos", icon: "camera", cols: 4, fields: [
        { f: "house_photo", label: "House photo", type: "photo", icon: "home" }, { f: "connection_photo", label: "Connection photo", type: "photo", icon: "pipe" }, { f: "connection_receipt_photo", label: "Connection receipt", type: "photo", icon: "card" }, { f: "electricity_bill_photo", label: "Electricity bill", type: "photo", icon: "card" }, { f: "aadhar_card_photo", label: "Aadhar card", type: "photo", icon: "idcard" }
      ] }
    ],
    validate: d => (d.hdi_contractor_name && d._whErr ? { hdi_contractor_name: d._whErr } : {}),
    onSubmit: () => {},
    lockBanner: d => d.material_issue ? "<b>Submitted</b> — Material Issue posted from the contractor’s warehouse." : "<b>Submitted</b> — Material Issue is switched off for HSC on this site, so no stock was moved.",
    detailExtra: d => (d.latitude || d.longitude ? `<div class="dx-note">${ic("pin", 16)}<div>Location on record: <b class="dx-mono">${esc(d.latitude)}, ${esc(d.longitude)}</b></div></div>` : ""),
    detailActions: d => [d.docstatus === 1 && canAdmin() && { label: "Cancel", icon: "close", tone: "danger", run: async x => {
      // a submitted repair keeps the installation linked — say so plainly instead of the server's link error (which names record IDs)
      const open = await DX.call("frappe.client.get_count", { doctype: "Inhouse HSC Repairing", filters: DX.json({ hsc_reference: x.name, docstatus: 1 }) }).catch(() => 0);
      if (+open) { await DX.confirm({ title: "Cancel the repair first", sub: `This connection has ${open} submitted repair${+open > 1 ? "s" : ""}. Cancel the repair under HSC repairing, then cancel the installation.`, noOk: true }); return false; }
      if (!(await DX.confirm({ title: "Cancel this installation?", sub: "Cancelled records can’t be edited again.", ok: "Cancel installation", tone: "danger" }))) return false; await DX.call(API + "cancel_hsc_installation", { name: x.name }); DX.toast("Cancelled · " + esc(x.name)); } }],
    api: {
      counts: () => ({ all: B.counts.installations, draft: B.counts.installation_draft, submitted: B.counts.installation_submitted, cancelled: B.counts.installation_cancelled }),
      query: listQuery("get_hsc_installations", fromInst, p => ({ town: p.filters.hdi_townproject || "", from_date: p.from, to_date: p.to })),
      get: async name => fromInst(await DX.call(API + "get_hsc_doc", { doctype: "HSC Details Inhouse", name }, { get: true })),
      save: async (d, { isNew }) => {
        const prev = isNew ? {} : (DX.find(inst, d.name) || {});
        const r = fromInst(await DX.call(API + "save_hsc_installation", { data: DX.json(toInst(d)) }));
        // receipt + electricity bill photos can only be set with set_hsc_install_file_field
        for (const f of ["connection_receipt_photo", "electricity_bill_photo"]) if (d[f] && d[f] !== prev[f] && d[f] !== r[f]) await DX.call(API + "set_hsc_install_file_field", { name: r.name, fieldname: f, file_url: d[f] });
        refreshCounts();
        return r;
      },
      submit: async name => { const r = await DX.call(API + "submit_hsc_installation", { name, ops_suite: 1 }); refreshCounts(); return fromInst(r); }
    }
  };
  async function contractorStore(d) {
    d._wh = ""; d._whErr = "";
    if (!d.hdi_contractor_name) return;
    try { const r = await DX.call(API + "get_contractor_supplier_warehouse", { contractor: d.hdi_contractor_name, town_project: d.hdi_townproject, company: d.company }, { get: true }); d._wh = r.warehouse || ""; } catch (e) { d._whErr = e.message; }
    if (DX.activeForm) DX.activeForm.refresh();
  }
  // the form engine copies field definitions, so picked HSC rows are remembered here (not on the field)
  const SEEN = {};
  // link fields show the consumer, never the HSC record ID — names are fetched once per batch of rows
  const HSCN = {};
  const hscName = id => (id ? HSCN[id] || (SEEN[id] && SEEN[id].consumer) || "" : "");
  const fillHscNames = async ids => {
    const need = [...new Set((ids || []).filter(x => x && !(x in HSCN)))]; if (!need.length) return;
    try { const rows = await DX.call("frappe.client.get_list", { doctype: "HSC Details Inhouse", filters: DX.json([["name", "in", need]]), fields: DX.json(["name", "hdi_house_owner_name"]), limit_page_length: need.length }); (rows || []).forEach(r => (HSCN[r.name] = r.hdi_house_owner_name || "")); } catch (_) { /* labels fall back to "HSC connection" */ }
  };
  const hscPick = {
    f: "hsc_reference", label: "HSC no.", type: "link", req: true, span: 2, searchPh: "Search HSC, consumer, mobile…",
    search: async q => ((await DX.call(API + "search_hsc_installations_for_picker", { search: q, filters: DX.json({ search: q }), limit: 25 }, { get: true })).rows || []).map(r => (HSCN[r.id] = r.consumer || "", SEEN[r.id] = { value: r.id, label: r.consumer || "HSC connection", consumer: r.consumer || "", sub: [r.town_label, r.mobile ? "••" + String(r.mobile).slice(-4) : "", r.status].filter(Boolean).join(" · "), town: r.town, contractor: r.contractor, supervisor: r.supervisor })),
    options: d => { const seen = Object.values(SEEN); if (d.hsc_reference && !seen.some(x => x.value === d.hsc_reference)) seen.push({ value: d.hsc_reference, label: hscName(d.hsc_reference) || "HSC connection" }); return seen; },
    onSet: d => { const h = SEEN[d.hsc_reference]; if (h) Object.assign(d, { ihr_townproject: h.town || d.ihr_townproject, ihr_contractor_name: h.contractor || d.ihr_contractor_name, ihr_supervisor_name: h.supervisor || d.ihr_supervisor_name }); }
  };
  const rep = {
    key: "rep", doctype: "Inhouse HSC Repairing",
    get canCreate() { return B.permissions.can_create_repair !== false; },
    entity: { singular: "Repair", plural: "Repairs", title: r => String(r.name).trim(), sub: r => `${hscName(r.hsc_reference) || "HSC connection"} · ${lbl("towns", r.ihr_townproject)}`, date: "select_date" },
    newLabel: "New repairing", newTitle: "Create HSC repairing", submitBtn: "Submit / close",
    status: stStatus, statusKey: stKey, statusFilter: inst.statusFilter,
    defaults: () => ({ select_date: DX.TODAY }),
    form: [
      { id: "r", title: "Repairing details", short: "Repairing", icon: "wrench", fields: [
        { f: "select_date", label: "Date", type: "date" },
        hscPick,
        { f: "ihr_townproject", label: "Town / project", type: "link", options: () => ms("towns"), hint: "Filled from the selected HSC (the server always uses the HSC’s town)." },
        flt("dia", "Pipe DIA"), flt("cc_breaking_widthmm", "CC breaking width", "m"), flt("cc_breaking_depthmm", "CC breaking depth", "m"), flt("cc_breaking_lengthmtr", "CC breaking length", "m")
      ] },
      { id: "k", title: "Contractor details", short: "Contractor", icon: "building", fields: [
        { f: "ihr_contractor_name", label: "Contractor name", type: "link", options: d => byTown("contractors", d.ihr_townproject).map(c => ({ value: c.value, label: c.contractor || c.label })) }, { f: "ihr_supervisor_name", label: "Supervisor name", type: "link", options: d => byTown("supervisors", d.ihr_townproject) }
      ] },
      { id: "m", title: "Material details", short: "Material", icon: "box", tone: "cyan", cols: 4, fields: [flt("brass_ferrule", "Brass Ferrule"), { f: "saddle_size", label: "Saddle Size", type: "link", options: DIA }, flt("ftal", "FTA - L"), flt("mdpe_pipe_mtr", "MDPE Pipe (mtr)"), flt("valve", "Valve")] }
    ],
    onSubmit: () => {},
    detailActions: d => [d.docstatus === 1 && canAdmin() && { label: "Cancel", icon: "close", tone: "danger", run: async x => { if (!(await DX.confirm({ title: "Cancel this repair?", sub: "Cancelled records can’t be edited again.", ok: "Cancel repair", tone: "danger" }))) return false; await DX.call(API + "cancel_hsc_repairing", { name: x.name }); DX.toast("Cancelled · " + esc(x.name)); } }],
    api: {
      counts: () => ({ all: B.counts.repairs, draft: B.counts.repair_draft, submitted: B.counts.repair_submitted, cancelled: B.counts.repair_cancelled }),
      query: async p => { const r = await listQuery("get_hsc_repairs", fromRep, q => ({ town: q.filters.ihr_townproject || "" }))(p); await fillHscNames(r.rows.map(x => x.hsc_reference)); return r; },
      get: async name => { const d = fromRep(await DX.call(API + "get_hsc_doc", { doctype: "Inhouse HSC Repairing", name }, { get: true })); await fillHscNames([d.hsc_reference]); return d; },
      save: async d => { const r = fromRep(await DX.call(API + "save_hsc_repairing", { data: DX.json(toRep(d)) })); refreshCounts(); return r; },
      submit: async name => { const r = await DX.call(API + "submit_or_close_hsc_repairing", { name, ops_suite: 1 }); refreshCounts(); return fromRep(r); }
    }
  };
  const refreshCounts = () => DX.call(API + "get_dux_hsc_dashboard_counts", {}, { get: true }).then(c => { B.counts = c || B.counts; }, () => null);

  // reports come back as heads + array rows; link cells are IDs → labels via the masters
  const LINK_HEADS = { "Town/Project": "towns", "Zone Name": "zones", "Ward Number": "wards", "Area Name": "areas", "Contractor Name": "contractors" };
  const PHOTO = /photo$/i, MASK = /^(mobile number|aadhar number)$/i, NUM = /^(from junction|to junction|water meter|fta - l|fta|mdpe pipe \(mtr\)|dce|ball valve|brass ferrule|valve|cc breaking .*|soil excavation .*|pipe dia)$/i;
  const loadReport = async (type, f) => {
    const key = [type, f.from, f.to, f.town || "", f.lat || ""].join("|");
    if (B.rep[type] && B.rep[type].key === key) return;
    const r = await DX.call(API + "get_hsc_reports", { report_type: type, filters: DX.json({ from: f.from, to: f.to, town: f.town || "", zone: "", lat: f.lat || "" }) }, { get: true });
    const heads = r.heads || [], dateIdx = heads.findIndex(h => /date/i.test(h)), statusIdx = heads.indexOf("Status");
    const rows = (r.rows || []).map(a => { const o = { _date: DX.day(a[dateIdx]), name: a[0], docstatus: statusIdx > -1 ? ["Draft", "Submitted", "Cancelled"].indexOf(a[statusIdx]) : 0 }; heads.forEach((h, i) => (o["c" + i] = LINK_HEADS[h] ? lbl(LINK_HEADS[h], a[i]) : a[i])); return o; });
    const hi = heads.findIndex((h, i) => i > 0 && /^hsc no/i.test(h)); if (hi > -1) await fillHscNames(rows.map(o => o["c" + hi]));
    B.rep[type] = { key, heads, rows, summary: r.summary || {}, title: r.title };
  };
  const reportCols = type => ((B.rep[type] || {}).heads || []).map((h, i) => (i > 0 && /^hsc no/i.test(h) ? { label: "Consumer (HSC)", get: r => hscName(r["c" + i]) || "—", trunc: true } : /^material issue$/i.test(h) ? { label: h, type: "html", get: r => (r["c" + i] ? DX.status("Issued", "ok") : "<span class=\"dx-faint\">—</span>") } : /^amended from$/i.test(h) ? { label: h, get: r => (r["c" + i] ? "Amended" : "—") } : PHOTO.test(h) ? { label: h, type: "html", get: r => (r["c" + i] ? `<a class="dx-link" href="${esc(r["c" + i])}" target="_blank" rel="noopener">View</a>` : "") } : MASK.test(h) ? { f: "c" + i, label: h, type: "mask" } : /date/i.test(h) && !/updated/i.test(h) ? { f: "c" + i, label: h, type: "date" } : i === 0 ? { f: "c" + i, label: h, type: "mono", strong: true } : /^mdpe/i.test(h) || /^brass|^water meter|^valve/i.test(h) ? { f: "c" + i, label: h, type: "num", d: 2, total: true } : NUM.test(h) ? { f: "c" + i, label: h } : { f: "c" + i, label: h, trunc: /address|remarks|contractor|town/i.test(h) }));
  const townFilter = f => ({ f, label: "Town / project", options: () => ms("towns"), display: v => lbl("towns", v), remote: true });

  const MASTER_TABS = [
    ["Site project", "Site Project", "projects", [{ f: "label", label: "Project", strong: true }]],
    ["Town and project", "Town At Project", "towns", [{ f: "label", label: "Town - project", strong: true }, { f: "project_name", label: "Project" }, { f: "company_name", label: "Company" }]],
    ["Zones", "HSC Zone Details", "zones", [{ f: "label", label: "Zone", strong: true }, { label: "Town", get: r => lbl("towns", r.hsc_townproject) }]],
    ["Wards", "Ward at Town", "wards", [{ label: "Ward", strong: true, get: r => "Ward " + r.label }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Areas", "Area at Town", "areas", [{ f: "label", label: "Area", strong: true }, { label: "Ward", get: r => "Ward " + lbl("wards", r.ward_number) }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Contractors", "Contractor at Project", "contractors", [{ label: "Supplier / contractor", strong: true, get: r => r.contractor || r.label }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Supervisors", "Supervisor at Project", "supervisors", [{ f: "label", label: "Supervisor", strong: true }, { label: "Town", get: r => lbl("towns", r.townproject) }]],
    ["Stores", "Store At Town", "stores", [{ f: "label", label: "Store", strong: true, type: "mono" }, { label: "Town", get: r => lbl("towns", r.townproject) }]]
  ].map(([label, doctype, k, columns]) => ({ label, doctype, rows: () => ms(k), columns }));

  DX.resolvers.push(v => { for (const k of ["towns", "zones", "wards", "areas", "contractors", "supervisors", "stores"]) { const o = ms(k).find(x => x.value === v); if (o) return k === "wards" ? "Ward " + o.label : k === "contractors" ? o.contractor || o.label : o.label; } return ""; });
  const app = DX.register({
    key: "hscin", title: "HSC Inhouse", short: "HSC Inhouse", icon: "home", hue: "cyan", route: "/desk/dux-hsc-inhouse",
    desc: "Installation · repairing · reports", eyebrow: "HSC operations", headline: `DUX HSC <span class="dx-grad">Inhouse</span>`,
    intro: "A clean page for HSC installation, repairing and reports. Town drives zone, ward, area, contractor and supervisor; picking an HSC in a repair fills its town and team.",
    docs: [inst, rep], noRecent: true,
    boot: async () => { const r = await DX.call(API + "get_dux_hsc_inhouse_initial_data", {}, { get: true }); Object.assign(B, { masters: r.masters || {}, counts: r.counts || {}, permissions: r.permissions || {}, features: r.features || {}, role: r.role, can_admin: r.can_admin, default_company: r.default_company, recentInst: (r.installations || []).map(fromInst), recentRep: (r.repairs || []).map(fromRep) });
      // site_config hsc_ops_suite_stock: entries submitted here issue stock even where the HSC page has it switched off
      if (DX.BOOT && DX.BOOT.hsc_suite_stock) B.features = Object.assign({}, B.features, { material_issue_enabled: true }); },
    kpis: () => { const c = B.counts, s = (B.dash && B.dash.summary) || {}; return [
      { label: "Installations", value: nf(c.installations || 0), sub: `<span class="dx-num">${nf(c.installation_draft || 0)}</span> draft entries`, icon: "home" },
      { label: "Draft repairs", value: nf(c.repair_draft || 0), sub: `<span class="dx-num">${nf(c.repair_submitted || 0)}</span> submitted`, icon: "wrench", tone: "pending" },
      { label: "MDPE pipe this month", value: nf(s.mdpe || 0, 1), unit: "m", sub: `<span class="dx-num">${nf(s.count || 0)}</span> connections this month`, icon: "pipe", tone: "cyan" },
      { label: "Active towns", value: nf(new Set(((B.dash && B.dash.towns) || [])).size), sub: "with installations this month", icon: "pin", tone: "ok" }
    ]; },
    panels: () => { const by = {}; ((B.dash && B.dash.towns) || []).forEach(t => (by[t] = (by[t] || 0) + 1)); const recent = (B.recentInst || []).slice(0, 7); return [
      DX.card("Town-wise installations", Object.keys(by).length ? DX.bars(Object.entries(by).map(([k, v]) => ({ label: lbl("towns", k), value: v })).sort((a, b) => b.value - a.value).slice(0, 10)) : DX.empty("No installations this month", ""), { icon: "pin", tone: "cyan", sub: "this month" }),
      DX.card("Recent installations", recent.map(r => `<button class="dx-lrow" data-go="${esc(DX.entryRoute(inst, r))}"><div class="dx-lrow-main"><div class="dx-lrow-title">${esc(r.hdi_house_owner_name || r.name)}</div><div class="dx-lrow-sub">${esc(lbl("towns", r.hdi_townproject))} · ${esc(r.name)}</div></div><div class="dx-lrow-end">${DX.statusOf(inst, r)}<span class="dx-mono dx-muted" style="font-size:11.5px">${DX.fmtDate(r.select_date)}</span></div></button>`).join("") || DX.empty("No entries yet", ""), { icon: "clock", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="hscin/installations">View all${ic("right", 13)}</button>` })
    ]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "inst", group: "Main", docs: [],
        load: async () => { if (B.dash && Date.now() - B.dash.at < 120000) return; try { const r = await DX.call(API + "get_hsc_reports", { report_type: "installation", filters: DX.json({ from: DX.monthStart(), to: DX.TODAY }) }, { get: true }); const ti = (r.heads || []).indexOf("Town/Project"); B.dash = { at: Date.now(), summary: r.summary || {}, towns: ti > -1 ? (r.rows || []).map(a => a[ti]).filter(Boolean) : [] }; } catch (_) { B.dash = { at: Date.now(), summary: {}, towns: [] }; } } },
      { id: "installations", label: "HSC installation", icon: "home", type: "list", doc: "inst", group: "Main", count: () => B.counts.installations, searchPh: "Search HSC no., consumer, mobile…", filters: [{ f: "hdi_townproject", label: "Town / project", options: () => ms("towns"), display: v => lbl("towns", v) }],
        columns: [{ f: "name", label: "HSC no.", type: "mono", strong: true }, { f: "hdi_house_owner_name", label: "Consumer" }, { label: "Town and project", get: r => lbl("towns", r.hdi_townproject), trunc: true }, { label: "Contractor", get: r => lbl("contractors", r.hdi_contractor_name), trunc: true }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1 }, { f: "select_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(inst, r) }] },
      { id: "repairing", label: "HSC repairing", icon: "wrench", type: "list", doc: "rep", group: "Main", count: () => B.counts.repairs, searchPh: "Search ID, HSC no.…", dateFilter: false, filters: [{ f: "ihr_townproject", label: "Town / project", options: () => ms("towns"), display: v => lbl("towns", v) }],
        columns: [{ label: "HSC repairing no", type: "mono", strong: true, get: r => String(r.name).trim() }, { label: "Consumer (HSC)", get: r => hscName(r.hsc_reference) || "—", trunc: true }, { label: "Town / project", get: r => lbl("towns", r.ihr_townproject), trunc: true }, { label: "Contractor", get: r => lbl("contractors", r.ihr_contractor_name), trunc: true }, { f: "mdpe_pipe_mtr", label: "MDPE (m)", type: "num", d: 1 }, { f: "select_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(rep, r) }] },
      { id: "report", label: "Reports", icon: "chart", type: "report", doc: "inst", group: "Main", title: "HSC Inhouse Installation Report", monthDefault: true, masked: true, remote: true, noLink: true, date: "_date", docs: [], tabs: [{ id: "report", label: "Installation" }, { id: "represport", label: "Repairing" }],
        load: async () => { const f = V.reportFilters(app, app.screens.find(s => s.id === "report")); if (f.to > DX.TODAY) f.to = DX.TODAY; await loadReport("installation", f); },
        rows: () => (B.rep.installation || {}).rows || [],
        filters: [townFilter("town"), { f: "lat", label: "Latitude filter", options: [{ value: "has", label: "Has latitude" }, { value: "blank", label: "Blank latitude" }], display: v => (v === "has" ? "Has latitude" : "Blank latitude"), remote: true }],
        kpis: () => { const s = (B.rep.installation || {}).summary || {}; return [{ label: "No. of connections", value: nf(s.count || 0), icon: "home" }, { label: "Total MDPE pipe used", value: nf(s.mdpe || 0, 2), unit: "m", icon: "pipe", tone: "ok" }]; },
        get columns() { return reportCols("installation"); } },
      { id: "represport", label: "Repairing report", icon: "chart", type: "report", doc: "rep", group: "Main", title: "HSC In House Repairing Report", remote: true, noLink: true, date: "_date", docs: [], days: 3650, tabs: [{ id: "report", label: "Installation" }, { id: "represport", label: "Repairing" }],
        load: async () => { const f = V.reportFilters(app, app.screens.find(s => s.id === "represport")); await loadReport("repairing", f); },
        rows: () => (B.rep.repairing || {}).rows || [],
        filters: [townFilter("town")],
        kpis: rows => [{ label: "No. of repairs", value: nf(rows.length), icon: "wrench" }, { label: "Total MDPE pipe used", value: nf(((B.rep.repairing || {}).summary || {}).mdpe || 0, 2), unit: "m", icon: "pipe", tone: "ok" }],
        get columns() { return reportCols("repairing"); } },
      { id: "masters", label: "Masters & settings", icon: "settings", type: "masters", group: "Admin", tabs: MASTER_TABS }
    ]
  });
})();

;
/* DUX Maintenance Master — LIVE (dux_maintenance_master page API). Entries stay draft (no submit API) — saving posts no stock.
   Every write returns the full boot payload, so both lists refresh from the response. */
(function () {
  "use strict";
  const DX = window.DX, { nf, esc } = DX;
  const API = "dux_maintenance_master.dux_maintenance_master.page.dux_maintenance_master.dux_maintenance_master.";
  const TYPES = ["CAR", "TRUCK", "BIKE", "CRANE", "BULLDOZER", "BUTT FUSION", "HYVA", "EXCAVATOR", "BACKHOE LOADER", "WATER PUMP", "TRACTOR-1", "TRACTOR-2", "TRACTOR-3", "TRACTOR TROLLY", "MOBILE CONCRETE MIXTURE PLANT", "AJAX FIORI", "MINI Excavator", "CUTTER MACHINE-1", "CUTTER MACHINE-2", "CUTTER MACHINE-3", "CUTTER MACHINE-4", "CUTTER MACHINE-5", "CUTTER MACHINE-6", "VIBRATOR MACHINE", "LOADING AUTO", "BOLERO", "BOLERO PICKUP", "MILLER", "HYDRA CRANE", "MOBILE CONCRETE MIXTURE", "CONCRETE MIXTURE", "CONCRETE PUMP", "PICKUP", "ELECTRIC MOTOR", "GENERATOR", "BREAKER", "HYDRO TESTING PUMP", "HAND GRINDER", "AC INDOOR UNIT", "AC OUTDOOR UNIT"];
  const SERVICE = ["Regular Service", "Breakdown Repair", "Accident Repair", "Tyre Change"];
  const SCHEDULED = ["Regular Service", "Tyre Change"];
  const B = { companies: [], default_company: "", town_projects: [], stores: [], suppliers: [], at: 0, pending: null };
  const compName = v => [v.type_of_vehicle, v.model_name, v.vehicle_number].filter(Boolean).join(" - ");
  const townLabel = id => (B.town_projects.find(t => t.name === id) || {}).label || DX.M.townLabel(id);
  const fromVehicle = v => Object.assign({}, v, { townproject: v.town_project, year: v.year ? String(v.year) : "", modified: DX.day(v.modified) });
  const fromEntry = e => Object.assign({}, e, { townproject: e.town_project, date: DX.day(e.date), invoice_date: DX.day(e.invoice_date), vehicle_reading_km: e.vehicle_reading, total_repairing_amount: +e.repair_total || 0, repair_items: (e.repair_items || []).map(r => ({ item_description: r.item_description || "", qty: +r.qty || 0, type: r.type || "Service", rate: +r.rate || 0, remarks: r.remarks || "", attachment: r.attachment || "" })) });
  // the suite's company (site_config ops_company, else the user default) wins when maintenance offers it
  const defCompany = () => { const names = B.companies.map(c => (c && typeof c === "object" ? c.value || c.name : c)), boot = DX.BOOT && DX.BOOT.company; return boot && names.includes(boot) ? boot : B.default_company || DX.M.defaultCompany; };
  // one boot payload feeds both docs; writes hand back a fresh boot too
  const apply = boot => {
    Object.assign(B, { companies: boot.companies || [], default_company: boot.default_company || "", town_projects: boot.town_projects || [], stores: boot.stores || [], suppliers: boot.suppliers || [], at: Date.now() });
    DX.store[vehicle.id] = { rows: (boot.vehicles || []).map(fromVehicle), seq: 0, loaded: Date.now() };
    DX.store[entry.id] = { rows: (boot.entries || []).map(fromEntry), seq: 0, loaded: Date.now() };
  };
  const bootData = async () => { if (!B.pending) B.pending = DX.call(API + "get_boot_data", {}, { get: true }).then(apply).finally(() => { B.pending = null; }); return B.pending; };
  DX.resolvers.push(v => (B.town_projects.find(t => t.name === v) || {}).label);
  const vName = id => { const v = DX.find(vehicle, id); return (v && v.vehicle_name) || id || ""; };
  const lastOf = (vn, exclude) => DX.rows(entry).filter(e => e.vehicle === vn && e.name !== exclude).sort((a, b) => b.date.localeCompare(a.date) || String(b.creation || "").localeCompare(String(a.creation || "")))[0];
  const total = d => DX.sum(d.repair_items || [], r => (+r.qty || 0) * (+r.rate || 0));
  const num = v => /^\d+(\.\d+)?$/.test(String(v == null ? "" : v).trim());

  const vehicle = {
    key: "vehicle", doctype: "Vehicle Master", dupField: "vehicle_number",
    entity: { singular: "Vehicle", plural: "Vehicles", title: r => r.vehicle_name || compName(r), sub: r => `${r.brand || "—"} · ${townLabel(r.townproject)}`, date: "modified" },
    newLabel: "Add vehicle", status: () => null,
    defaults: () => ({ company: defCompany(), year: String(new Date().getFullYear()) }),
    form: [{ id: "v", title: "Vehicle master", short: "Vehicle", icon: "truck", fields: [
      { f: "company", label: "Company", type: "link", options: () => B.companies }, { f: "model_name", label: "Model name", type: "text" },
      { f: "townproject", label: "Town / project", type: "link", parent: ["company"], options: d => B.town_projects.filter(t => !d.company || t.company === d.company).map(t => ({ value: t.name, label: t.label })) },
      { f: "year", label: "Purchase year", type: "link", options: () => Array.from({ length: new Date().getFullYear() - 1989 }, (_, i) => String(new Date().getFullYear() - i)) },
      { f: "vehicle_number", label: "Vehicle number", type: "text", req: true, lockOnEdit: true, ph: "e.g. MP-09 GH-1056", hint: "Unique — becomes the record name." },
      { f: "type_of_vehicle", label: "Type of vehicle", type: "link", options: TYPES },
      { f: "fuel_type", label: "Fuel type", type: "select", options: [{ value: "", label: "—" }, "DIESEL", "PETROL", "CNG", "ELECTRIC"] },
      { f: "brand", label: "Brand", type: "text" },
      { f: "vehicle_name", label: "Vehicle name", type: "computed", text: true, calc: compName, ph: "TYPE - MODEL - NUMBER" }
    ] }],
    api: {
      ttl: 60000,
      load: async () => { await bootData(); return DX.store[vehicle.id].rows; },
      save: async d => { const r = await DX.call(API + "save_vehicle", { data: DX.json({ name: d.name || "", company: d.company || "", model_name: d.model_name || "", town_project: d.townproject || "", year: d.year || "", vehicle_number: (d.vehicle_number || "").trim(), type_of_vehicle: d.type_of_vehicle || "", brand: d.brand || "", fuel_type: d.fuel_type || "", powerapps_id: d.powerapps_id || "" }) }); if (r.boot) apply(r.boot); return { name: r.name }; }
    }
  };
  const entry = {
    key: "entry", doctype: "Maintenance Entry", formDocs: ["entry", "vehicle"],
    entity: { singular: "Maintenance entry", plural: "Maintenance entries", title: r => `${r.service_type || ""} · ${vName(r.vehicle)}`, sub: r => `${townLabel(r.townproject)} · ${r.name}`, date: "date" },
    newLabel: "New maintenance entry", status: () => null, statusFilter: [],
    defaults: () => ({ company: defCompany(), date: DX.TODAY, service_type: "Regular Service", invoice_date: DX.TODAY, repair_items: [] }),
    form: [
      { id: "d", title: "Details", short: "Details", icon: "wrench", fields: [
        { f: "company", label: "Company", type: "link", options: () => B.companies },
        { f: "townproject", label: "Town / project", type: "link", req: true, parent: ["company"], options: d => B.town_projects.filter(t => !d.company || t.company === d.company).map(t => ({ value: t.name, label: t.label })) },
        { f: "date", label: "Date", type: "date", req: true },
        { f: "service_type", label: "Service type", type: "select", options: SERVICE, span: 2 },
        { f: "store", label: "Store", type: "link", parent: ["townproject"], options: d => B.stores.filter(s => !d.townproject || s.town_project === d.townproject).map(s => s.name) },
        { f: "vehicle", label: "Vehicle", type: "link", req: true, span: 2, options: () => DX.rows(vehicle).map(v => ({ value: v.name, label: v.vehicle_name || v.name, sub: [v.brand, v.vehicle_number].filter(Boolean).join(" · ") })), searchPh: "Search type, model or number…",
          onSet: d => { const l = lastOf(d.vehicle, d.name); d.vehicle_reading_km = l ? +l.vehicle_reading_km || 0 : 0; } },
        { f: "vehicle_reading_km", label: "Current reading (KM)", type: "int", req: true, reqMsg: "Enter the current KM reading." },
        { f: "last", label: "Last recorded", type: "info", icon: "clock", span: 2, html: d => { if (!d.vehicle) return "Select a vehicle to see its last reading."; const l = lastOf(d.vehicle, d.name); return l ? `Last recorded: <b class="dx-mono">${nf(l.vehicle_reading_km)} KM</b> (<span class="dx-mono">${esc(l.name)}</span>, ${DX.fmtDate(l.date)}) — the new reading can’t be lower.` : "No previous reading found for this vehicle."; } },
        { f: "next_service_km", label: "Next service KM", type: "int", showIf: d => SCHEDULED.includes(d.service_type) }
      ] },
      { id: "i", title: "Invoice", short: "Invoice", icon: "card", fields: [
        { f: "vendor_name", label: "Vendor name", type: "link", options: () => B.suppliers, hint: "Suppliers in group “Maintenance Vendor”." }, { f: "invoice_no", label: "Invoice no", type: "text" }, { f: "invoice_date", label: "Invoice date", type: "date" },
        { f: "invoice_attachment", label: "Invoice attachment", type: "photo", icon: "card", accept: "image/*,application/pdf" }, { f: "remark", label: "Remark", type: "textarea", span: 2 }
      ] },
      { id: "r", title: "Repair items", short: "Repairs", icon: "box", tone: "cyan", fields: [
        { f: "repair_items", label: "Repair items", type: "table", span: "all", minRows: 1, rowLabel: "repair item", newRow: () => ({ item_description: "", qty: 1, type: "Service", rate: 0, remarks: "" }),
          columns: [{ f: "item_description", label: "Item description", type: "text" }, { f: "qty", label: "Qty", type: "float" }, { f: "type", label: "Type", type: "select", options: ["Spare Part", "Service", "Labour"] }, { f: "rate", label: "Rate (₹)", type: "float" }, { f: "amount", label: "Amount (₹)", calc: r => (+r.qty || 0) * (+r.rate || 0), total: true }, { f: "remarks", label: "Remarks", type: "text" }] },
        { f: "total_repairing_amount", label: "Repair total", type: "computed", money: true, d: 2, calc: total }
      ] }
    ],
    validate: d => { const e = {}; const l = d.vehicle && lastOf(d.vehicle, d.name); if (l && +d.vehicle_reading_km < +l.vehicle_reading_km) e.vehicle_reading_km = `Reading can’t be less than the last reading (${nf(l.vehicle_reading_km)} KM, ${l.name}).`; if (+d.vehicle_reading_km < 0) e.vehicle_reading_km = "Current Reading (KM) cannot be negative."; if ((d.repair_items || []).some(r => !(+r.qty > 0) || !(+r.rate > 0) || !num(r.qty) || !num(r.rate))) e.repair_items = "Every repair item needs a quantity and rate above 0 (plain numbers)."; if (!SCHEDULED.includes(d.service_type)) d.next_service_km = 0; return e; },
    formNote: d => `${(d.repair_items || []).length} repair items · <b>${DX.money(total(d), 2)}</b>`,
    detailExtra: d => (d.invoice_attachment ? `<div class="dx-note">${DX.ic("file", 16)}<div>Invoice attachment: <a class="dx-link" href="${esc(d.invoice_attachment)}" target="_blank" rel="noopener">${esc(String(d.invoice_attachment).split("/").pop())}</a></div></div>` : ""),
    api: {
      ttl: 60000,
      load: async () => { await bootData(); return DX.store[entry.id].rows; },
      save: async d => {
        const data = { name: d.name || "", company: d.company || "", town_project: d.townproject || "", date: d.date, service_type: d.service_type, store: d.store || "", vehicle: d.vehicle, vehicle_reading: String(parseInt(d.vehicle_reading_km, 10) || 0), vehicle_location: "", vendor_name: d.vendor_name || "", invoice_no: d.invoice_no || "", invoice_date: d.invoice_date || "", invoice_attachment: d.invoice_attachment || "", next_service_km: SCHEDULED.includes(d.service_type) ? String(parseInt(d.next_service_km, 10) || 0) : "", remark: d.remark || "" };
        const items = (d.repair_items || []).map(r => ({ item_description: r.item_description || "", qty: String(+r.qty), type: r.type || "Service", rate: String(+r.rate), amount: (+r.qty || 0) * (+r.rate || 0), remarks: r.remarks || "", attachment: r.attachment || "" }));
        const r = await DX.call(API + "save_maintenance_entry", { data: DX.json(data), repair_items: DX.json(items) });
        if (r.boot) apply(r.boot);
        return { name: r.name };
      }
    }
  };
  // Upcoming service: latest reading vs next-service KM, avg km/day from reading history
  const upcoming = () => DX.rows(vehicle).map(v => {
    const es = DX.rows(entry).filter(e => e.vehicle === v.name && +e.vehicle_reading_km > 0).sort((a, b) => b.date.localeCompare(a.date));
    const sched = DX.rows(entry).filter(e => e.vehicle === v.name && SCHEDULED.includes(e.service_type) && +e.next_service_km > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!es.length || !sched) return null;
    const latest = es[0], earlier = es.find(e => e.date < latest.date && +e.vehicle_reading_km <= +latest.vehicle_reading_km);
    const days = earlier ? (new Date(latest.date) - new Date(earlier.date)) / 864e5 : 0, perDay = days ? (latest.vehicle_reading_km - earlier.vehicle_reading_km) / days : 40;
    const remaining = sched.next_service_km - latest.vehicle_reading_km, due = Math.ceil(remaining / Math.max(perDay, 1));
    return { v, cur: +latest.vehicle_reading_km, next: +sched.next_service_km, remaining, due, last: sched };
  }).filter(x => x && (x.remaining <= 0 || x.due <= 10)).sort((a, b) => a.due - b.due || a.remaining - b.remaining);
  const inRange = () => DX.rows(entry).filter(e => e.date >= DX.addDays(DX.TODAY, -30));

  DX.register({
    key: "maint", title: "Maintenance Master", short: "Maintenance", icon: "wrench", hue: "rose", route: "/desk/dux-maintenance-master",
    desc: "Vehicle master · service & repair entries", eyebrow: "Maintenance", headline: `Maintenance <span class="dx-grad">dashboard</span>`,
    intro: "Every service, breakdown, accident and tyre change per vehicle — with the invoice and repair items. The last-reading guard stops a KM reading from going down.",
    docs: [entry, vehicle],
    kpis: () => { const r = inRange(), amt = DX.sum(r, "total_repairing_amount"); return [
      { label: "Total vehicles", value: nf(DX.rows(vehicle).length), sub: "in Vehicle Master", icon: "truck" },
      { label: "Maintenance entries", value: nf(r.length), sub: "last 30 days", icon: "list", tone: "cyan" },
      { label: "Vehicles serviced", value: nf(new Set(r.map(e => e.vehicle)).size), sub: "distinct vehicles · 30 days", icon: "check", tone: "ok" },
      { label: "Total repair amount", value: DX.money(amt), sub: `Avg <span class="dx-num">${DX.money(r.length ? amt / r.length : 0)}</span> per entry`, icon: "rupee", tone: "pending" }
    ]; },
    panels: () => { const up = upcoming(), all = DX.rows(entry); const byType = SERVICE.map(s => ({ label: s, value: all.filter(e => e.service_type === s).length, sub: DX.money(DX.sum(all.filter(e => e.service_type === s), "total_repairing_amount")) })); const byV = {}; all.forEach(e => (byV[e.vehicle] = (byV[e.vehicle] || 0) + (+e.total_repairing_amount || 0)));
      return [
        DX.card("Upcoming service — next 10 days", up.length ? DX.table([{ label: "Vehicle", get: x => x.v.vehicle_name, strong: true, trunc: true }, { label: "Current KM", type: "num", get: x => x.cur }, { label: "Next service KM", type: "num", get: x => x.next }, { label: "Status", type: "status", get: x => (x.remaining <= 0 ? DX.status(`Overdue by ${nf(-x.remaining)} KM`, "err") : DX.status(`Due in ~${x.due} days (${nf(x.remaining)} KM)`, "pending")) }, { label: "Last service", get: x => `${x.last.service_type} · ${DX.fmtDate(x.last.date)}` }], up) : DX.empty("Nothing due", "No vehicles are estimated to be due for service within the next 10 days."), { icon: "calendar", tone: "pending", sub: "from KM readings" }),
        `<section class="dx-cols">${DX.card("Service type-wise summary", DX.bars(byType, { unit: "entries" }), { icon: "layers", tone: "cyan" })}${DX.card("Repair amount by vehicle", DX.bars(Object.entries(byV).map(([k, v]) => ({ label: vName(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: v => DX.money(v) }), { icon: "rupee" })}</section>`
      ]; },
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", doc: "entry" },
      { id: "vehicles", label: "Vehicle master", icon: "truck", type: "list", doc: "vehicle", dateFilter: false, count: () => DX.rows(vehicle).length, searchPh: "Search number, name, brand, model…", search: [r => r.vehicle_number, r => r.vehicle_name, r => r.brand, r => r.model_name, r => r.type_of_vehicle],
        filters: [{ f: "type_of_vehicle", label: "Type of vehicle", options: TYPES }, { f: "townproject", label: "Town / project", options: () => B.town_projects.map(t => ({ value: t.name, label: t.label })), display: townLabel }],
        columns: [{ f: "vehicle_name", label: "Vehicle name", strong: true, trunc: true }, { f: "vehicle_number", label: "Vehicle number", type: "mono" }, { f: "type_of_vehicle", label: "Type" }, { f: "brand", label: "Brand" }, { f: "model_name", label: "Model", hideSm: true }, { f: "year", label: "Year", type: "mono" }, { label: "Town / project", get: r => townLabel(r.townproject), trunc: true }] },
      { id: "entries", label: "Maintenance entry", icon: "list", type: "list", doc: "entry", docs: ["entry", "vehicle"], count: () => DX.rows(entry).length, searchPh: "Search entry, vehicle, vendor, invoice…", search: [r => r.name, r => vName(r.vehicle), r => r.vendor_name, r => r.invoice_no, r => r.service_type],
        filters: [{ f: "service_type", label: "Service type", options: SERVICE }], sum: rows => `<span class="dx-num">${DX.money(DX.sum(rows, "total_repairing_amount"))}</span>`,
        columns: [{ f: "name", label: "Maintenance entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Vehicle", get: r => vName(r.vehicle), trunc: true }, { f: "service_type", label: "Service type" }, { f: "vendor_name", label: "Vendor", trunc: true }, { f: "invoice_no", label: "Invoice no", type: "mono" }, { f: "total_repairing_amount", label: "Repair total", type: "money" }] },
      { id: "new", label: "New entry", icon: "plus", type: "form", doc: "entry" },
      { id: "report", label: "Report", icon: "chart", type: "report", doc: "entry", group: "Insights", days: 30, docs: ["entry", "vehicle"], filters: [{ f: "service_type", label: "Service type", options: SERVICE }],
        kpis: rows => [{ label: "Maintenance entries", value: nf(rows.length), icon: "list" }, { label: "Vehicles serviced", value: nf(new Set(rows.map(e => e.vehicle)).size), icon: "truck", tone: "cyan" }, { label: "Total repair amount", value: DX.money(DX.sum(rows, "total_repairing_amount")), icon: "rupee", tone: "ok" }, { label: "Average per entry", value: DX.money(rows.length ? DX.sum(rows, "total_repairing_amount") / rows.length : 0), icon: "chart" }],
        before: rows => `<section class="dx-cols" style="margin-bottom:16px">${DX.card("Service type distribution", DX.bars(SERVICE.map(s => ({ label: s, value: rows.filter(e => e.service_type === s).length }))), { icon: "layers", tone: "cyan" })}${DX.card("Repair amount by vehicle", DX.bars(Object.entries(rows.reduce((m, e) => ((m[e.vehicle] = (m[e.vehicle] || 0) + (+e.total_repairing_amount || 0)), m), {})).map(([k, v]) => ({ label: vName(k), value: v })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: v => DX.money(v) }), { icon: "rupee" })}</section>`,
        columns: [{ f: "name", label: "Maintenance entry", type: "mono", strong: true }, { f: "date", label: "Date", type: "date" }, { label: "Vehicle", get: r => vName(r.vehicle), trunc: true }, { f: "service_type", label: "Service type" }, { f: "vendor_name", label: "Vendor", trunc: true }, { f: "invoice_no", label: "Invoice no", type: "mono" }, { f: "total_repairing_amount", label: "Repair total", type: "money", total: true }] }
    ]
  });
})();

;
/* Stock (dux_portal · suite_stock): receive material into a store, give it to a contractor, issue it,
   and see live balances + movements. Every save is a real ERPNext Stock Entry draft; submit moves the stock.
   The field apps (HSC, Pour Card, Concrete, PEB) post their own Material Issues — they show here with their source.
   Shown only on sites that switch it on (site_config ops_stock_enabled). */
(function () {
  "use strict";
  const DX = window.DX, { nf, esc, ic } = DX;
  const API = "dux_portal.dux_portal.page.dux_ops_suite.suite_stock.";
  const B = { company: "", companies: [], warehouses: [], items: [], can_create: false, can_submit: false, balance: [], ledger: [], kind: "" };
  const LABEL = { "Material Receipt": "Receive into store", "Material Transfer": "Give to contractor / move", "Material Issue": "Issue / consume" };
  const SHORT = { "Material Receipt": "Receipt", "Material Transfer": "Transfer", "Material Issue": "Issue" };
  const itemOf = code => B.items.find(i => i.name === code) || {};
  // fuel sources read "Fuel issue · 5 L Diesel · <vehicle>": litres on the first line, the vehicle under it, so neither is cut off
  const srcCell = r => {
    const s = r.source || "", p = s.split(" · ");
    if (!/^Fuel (issue|direct)$/.test(p[0]) || p.length < 3) return esc(s) || '<span class="dx-faint">—</span>';
    return `<div title="${esc(s)}">${esc(p.slice(0, 2).join(" · "))}</div><small class="dx-muted"><span hidden> · </span>${esc(p.slice(2).join(" · "))}</small>`;
  };
  const whOf = name => B.warehouses.find(w => w.name === name) || {};
  const whOpts = (d, kind) => B.warehouses.filter(w => (!d.company || w.company === d.company) && (!kind || w.kind === kind)).map(w => ({ value: w.name, label: DX.whLabel(w.name), sub: w.kind }));
  const itemOpts = () => B.items.map(i => ({ value: i.name, label: `${i.item_name || i.name}${i.stock_uom ? " (" + i.stock_uom + ")" : ""}` }));
  const isRec = d => d.purpose === "Material Receipt", isIss = d => d.purpose === "Material Issue";
  const loadBalance = async () => { const r = await DX.call(API + "get_balance", { company: B.company }); B.balance = r.rows || []; };
  const loadLedger = async () => { B.ledger = (await DX.call(API + "get_ledger", { company: B.company, limit: 300 })) || []; };

  const se = {
    key: "se", doctype: "Stock Entry", lazy: false,
    entity: { singular: "Stock entry", plural: "Stock entries", title: r => `${SHORT[r.purpose] || "Stock entry"} · ${r.name}`, sub: r => `${r.from_wh ? DX.whLabel(r.from_wh) : "—"} → ${r.to_wh ? DX.whLabel(r.to_wh) : "—"} · ${r.source || "Stock app"}`, date: "posting_date" },
    newLabel: "New stock entry", submitLabel: "Save & submit", submitTitle: "Submit this stock entry?", submitSub: "ERPNext stock rules run on submit — the stock really moves.",
    get canCreate() { return !!B.can_create; },
    get submittable() { return !!B.can_submit; },
    status: r => (r.docstatus === 1 ? ["Submitted", "ok"] : r.docstatus === 2 ? ["Cancelled", "err"] : ["Draft", ""]),
    defaults: () => ({ purpose: "Material Receipt", posting_date: DX.TODAY, company: B.company || DX.M.defaultCompany, from_wh: "", to_wh: "", remarks: "", items: [{ item: "", qty: 1, rate: 0 }] }),
    form: [{ id: "st", title: "Stock entry", short: "Entry", icon: "box", fields: [
      { f: "purpose", label: "What are you doing?", type: "select", req: true, options: Object.keys(LABEL).map(k => ({ value: k, label: LABEL[k] })), display: v => LABEL[v] || v },
      { f: "company", label: "Company", type: "link", req: true, options: () => B.companies.map(c => ({ value: c.name, label: c.name, sub: c.abbr })) },
      { f: "posting_date", label: "Posting date", type: "date", req: true },
      { f: "from_wh", label: "From warehouse", type: "link", req: true, parent: ["company"], showIf: d => !isRec(d), options: d => whOpts(d), display: v => DX.whLabel(v), hint: "Where the material is now (the store, or the contractor)." },
      { f: "to_wh", label: "To warehouse", type: "link", req: true, parent: ["company"], showIf: d => !isIss(d), options: d => whOpts(d), display: v => DX.whLabel(v), hint: "Giving material to a contractor? Pick the contractor’s warehouse." },
      { f: "remarks", label: "Remarks", type: "text", span: "all" },
      { f: "items", label: "Items", type: "table", span: "all", minRows: 1, rowLabel: "item", newRow: () => ({ item: "", qty: 1, rate: 0 }), columns: [
        { f: "item", label: "Item", type: "select", options: itemOpts },
        { f: "qty", label: "Qty", type: "float", total: true },
        { f: "rate", label: "Rate ₹ (receipt)", type: "float" },
        { f: "amount", label: "Amount ₹", calc: r => (+r.qty || 0) * (+r.rate || 0), d: 2, total: true }
      ] }
    ] }],
    validate: d => {
      const rows = (d.items || []).filter(r => r.item && +r.qty > 0);
      if (!rows.length) return { items: "Add at least one item with a quantity above 0." };
      if (!isRec(d) && !isIss(d) && d.from_wh && d.from_wh === d.to_wh) return { to_wh: "From and to warehouse must differ." };
      if (isRec(d) && rows.some(r => !(+r.rate > 0))) return { items: "Receiving into a store needs a rate on every item." };
      return {};
    },
    onSubmit: () => {},
    api: {
      load: async () => ((await DX.call(API + "list_entries", { limit: 300 })) || []).map(r => ({ name: r.name, docstatus: r.docstatus, purpose: r.stock_entry_type, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse, to_wh: r.to_warehouse, company: r.company, nitems: r.item_count, amount: r.amount, source: r.source, remarks: r.remarks, modified: r.modified })),
      get: async name => { const r = await DX.call(API + "get_entry", { name }); return { name: r.name, docstatus: r.docstatus, purpose: r.purpose, company: r.company, posting_date: DX.day(r.posting_date), from_wh: r.from_warehouse || (r.items[0] || {}).s_warehouse || "", to_wh: r.to_warehouse || (r.items[0] || {}).t_warehouse || "", remarks: r.remarks || "", source: r.source, items: (r.items || []).map(i => ({ item: i.item_code, qty: i.qty, rate: i.basic_rate || 0, amount: (+i.qty || 0) * (+i.basic_rate || 0) })) }; },
      save: async d => {
        const items = (d.items || []).filter(r => r.item && +r.qty > 0).map(r => ({ item_code: r.item, qty: +r.qty, basic_rate: +r.rate || 0 }));
        const r = await DX.call(API + "save_entry", { data: DX.json({ name: d.name || undefined, purpose: d.purpose, company: d.company, posting_date: d.posting_date, from_warehouse: d.from_wh, to_warehouse: d.to_wh, remarks: d.remarks, items }) });
        DX.invalidate(se); B.balance = []; return { name: r.name, docstatus: r.docstatus };
      },
      submit: async name => { const r = await DX.call(API + "submit_entry", { name }); B.balance = []; return r; }
    }
  };

  const balanceTable = (rows, maxh) => (rows.length ? DX.table([
    { label: "Warehouse", strong: true, trunc: true, get: r => DX.whLabel(r.warehouse) }, { f: "kind", label: "Type", hideSm: true },
    { f: "item_name", label: "Item", trunc: true }, { f: "qty", label: "Qty", type: "num", d: 2 }, { f: "uom", label: "UOM", hideSm: true },
    { f: "value", label: "Value", type: "money", total: true, hideSm: true }
  ], rows, { foot: true, maxh }) : DX.empty("No stock here yet", "Receive material into a store, then give it to a contractor."));
  const kindSeg = () => `<div class="dx-toolbar"><div class="dx-seg" role="tablist">${[["", "All"], ["Store", "Stores"], ["Contractor", "Contractors"]].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${B.kind === k}">${l}</button>`).join("")}</div></div>`;
  const bindKind = ctx => ctx.on("click", e => { const b = e.target.closest("[data-kind]"); if (b) { B.kind = b.dataset.kind; ctx.rerender(); } });
  const sumBy = (rows, kind) => DX.sum(rows.filter(r => r.kind === kind), "value");

  DX.register({
    key: "stock", title: "Stock", short: "Stock", icon: "box", hue: "amber", route: "/app/stock-entry",
    desc: "Store receipts · material to contractors · balances", eyebrow: "Stock · store & contractors",
    headline: `Material in, material <span class="dx-grad">out</span>`,
    intro: "Receive material into a store, give it to a contractor’s warehouse, and watch the HSC, Pour Card, Concrete and PEB entries issue it on submit.",
    docs: [se],
    boot: async () => { Object.assign(B, await DX.call(API + "get_stock_boot", {}, { get: true })); },
    kpis: () => { const rows = DX.rows(se), month = DX.TODAY.slice(0, 7); return [
      { label: "Store stock value", value: DX.money(sumBy(B.balance, "Store")), sub: `${nf(new Set(B.balance.filter(r => r.kind === "Store").map(r => r.item_code)).size)} items in stores`, icon: "building" },
      { label: "With contractors", value: DX.money(sumBy(B.balance, "Contractor")), sub: `${nf(new Set(B.balance.filter(r => r.kind === "Contractor").map(r => r.warehouse)).size)} contractor warehouses`, icon: "truck", tone: "cyan" },
      { label: "Entries this month", value: nf(rows.filter(r => r.docstatus === 1 && String(r.posting_date).slice(0, 7) === month).length), sub: `${nf(rows.filter(r => r.docstatus === 1 && r.source !== "Stock app" && String(r.posting_date).slice(0, 7) === month).length)} from the field apps`, icon: "swap" },
      { label: "Drafts", value: nf(rows.filter(r => r.docstatus === 0).length), sub: "saved, not submitted", icon: "edit", tone: "pending" }
    ]; },
    panels: () => [
      DX.card("Contractor stock", balanceTable(B.balance.filter(r => r.kind === "Contractor").slice(0, 10)), { icon: "truck", tone: "cyan", sub: "live balance", action: `<button class="dx-btn dx-btn-ghost dx-btn-sm" data-go="stock/balance">All balances${ic("right", 13)}</button>` }),
      DX.card("Latest entries", DX.table([{ f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => SHORT[r.purpose] || "" }, { label: "Source", type: "html", get: srcCell }, { f: "posting_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(se, r) }], DX.rows(se).slice(0, 8), { go: r => DX.entryRoute(se, r) }), { icon: "swap", tone: "iris" })
    ],
    screens: [
      { id: "dashboard", label: "Dashboard", icon: "grid", type: "dashboard", docs: ["se"], load: async () => { if (!B.balance.length) await loadBalance(); } },
      { id: "balance", label: "Stock balance", icon: "database", load: loadBalance, bind: bindKind,
        render: () => { const rows = B.balance.filter(r => !B.kind || r.kind === B.kind); return kindSeg() + DX.card("Stock balance", balanceTable(rows, "64vh"), { icon: "database", tone: "cyan", sub: `live · ${esc(B.company || "")}` }); } },
      { id: "entries", label: "Stock entries", icon: "list", type: "list", doc: "se", count: () => DX.rows(se).filter(r => r.docstatus === 0).length || null, searchPh: "Search entry, warehouse, source…",
        search: [r => r.name, r => DX.whLabel(r.from_wh), r => DX.whLabel(r.to_wh), r => r.source, r => SHORT[r.purpose]],
        filters: [{ f: "purpose", label: "Type", options: Object.keys(LABEL), display: v => SHORT[v] || v }],
        columns: [{ f: "name", label: "Entry", type: "mono", strong: true }, { label: "Type", get: r => SHORT[r.purpose] || "" }, { label: "From", trunc: true, get: r => DX.whLabel(r.from_wh) || "—" }, { label: "To", trunc: true, get: r => DX.whLabel(r.to_wh) || "—" }, { label: "Source", type: "html", get: srcCell, hideSm: true }, { f: "nitems", label: "Items", type: "num" }, { f: "posting_date", label: "Date", type: "date" }, { label: "Status", type: "status", get: r => DX.statusOf(se, r) }],
        banner: () => B.can_create ? "" : `<div class="dx-note dx-note-warn">${ic("lock", 16)}<div>Your role can view stock but can’t create Stock Entries — ask for the Stock User role.</div></div>` },
      { id: "new", label: "New stock entry", icon: "plus", type: "form", doc: "se" },
      { id: "ledger", label: "Stock ledger", icon: "swap", load: loadLedger,
        render: () => DX.card("Stock ledger", `<div class="dx-meta"><span>Every movement for ${esc(B.company || "")}, newest first.</span></div>` + (B.ledger.length ? DX.table([
          { f: "posting_date", label: "Date", type: "date" }, { f: "voucher_no", label: "Entry", type: "mono" }, { label: "Source", type: "html", get: srcCell, hideSm: true },
          { f: "item_code", label: "Item", trunc: true }, { label: "Warehouse", trunc: true, get: r => DX.whLabel(r.warehouse) },
          { label: "In / out", type: "html", get: r => `<span class="dx-num" style="color:var(${r.actual_qty < 0 ? "--err" : "--ok"})">${r.actual_qty > 0 ? "+" : ""}${nf(r.actual_qty, 2)}</span>` },
          { f: "qty_after_transaction", label: "Balance", type: "num", d: 2 }
        ], B.ledger, { maxh: "64vh" }) : DX.empty("No movements yet", "Submitted stock entries show here.")), { icon: "swap", tone: "iris" }) }
    ]
  });
})();

;
window.DX.apps.sort((a, b) => ["hscnp", "pour", "peb", "concrete", "fuelin", "hscin", "maint", "stock"].indexOf(a.key) - ["hscnp", "pour", "peb", "concrete", "fuelin", "hscin", "maint", "stock"].indexOf(b.key));
};
;
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
  const MARK = `<span class="dx-mark"><img class="m-light" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAABBCAYAAAAJxiBDAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAobSURBVHhe7V17jB1VHV4pVJS26507z+26rVpEGxMTawy+iK8qIvEtCDYGkYoaJAWjjdIYIlFCgsGEgKT+JRGEiIgajZZosRIqxoaHtdoWCeVRpG7py9CHVvy+e77ZvXt39t6Zc+a+Rr/k23v3zpzf+f3Od86ZMzNnzowIJy1ZsuTkJEleHEXRKa30PG9RK0dHR18yOjpRa+WiReNeK2HXj+M4aCbshkEQxCnHxsbqtDsysny+fPo/8iIIouvCMHnC9+On6vV4dwufrtejPa30/WgS3JvBZ2czPpDBg7D9T/EQ/t8Pu//A/o/h+8PgRvD7+O0qbF/l+8nrjMDDBlbIRqU8sYnzwBeIJ4BzYMVJ+MP92wMF9IMoWvx8ECRdIQo/F2enHXs+DA35P/z8O0TdAK4Lw/B0uM6CGFjA38+ic9mFSrkL3/8mPgruRMXcLu7A9m3gn1Ni+1ak285Y2YPJ3NxAou+xkJBgoNksKr/jt7+AVwfB4tcqlIGB5yUfmq6IxTgdX/JWmWuPYRGwlWmw+v4LfJ6lkPqKWi14E3w5YkTI9n0uMg34H7TAM2WuM4ZVwGayZZKotRvRLb1DofUcvu+/Ev5M2ohHmtYXfUrm8qEKAqY0Qja6n5vr9fqYQuwJOLKGD4+YipTtXzsaDcJ1MpcfVRIwpYknwQg6+YDC7CrGx8dfhHzvty1Hky66UeaKoYoCkjqe8HvxWl0QyOOnbuLFd8lUcVRVwJSq3Tco3NKBYf96R/E280KKzBVH1QUkJeJNCrk0YMB0pW3Z6Vj5CK9MyZwd7AWMjiKAw+KRZmL7sSb+CzzexFm20u6OfpAaiMzaz4W0C9++rrCdgZZ3sb14jdgmOWqVOXvYCEgHMED4hOeNLyZrtbGXTjOZwIjsZeLSMAxfDkdPJYMgWIbB4WlI+6qUnhcvR2G8HjbfDdEuwm/fQkHfg3z2T58eZPtRlLSF/D6s0K1Rr4fvlwiFqXRHcb74Zplzg62AEKer51sQPoJv5yC/H4PHbGt7M1V4+1CZEmVTGJ4Xng4bh10ERCX6iMy5w1bAQlcLHIGAX40yvwl5H3dtkYwVLfwOmS4E9iDwY4+teMzb86IvyFw5gOFbihZKrwVMYbraeJNrazTx5rzWKCxYkPjIf4dtBZLPV8tceYBTtw6LgCnQa1zrIqLS/kbmcmDJydh/s22eJl10s4yVC1sBcSxYKRN9Afy43LY1kKYbTFbIXFtg/7vcxIvvhpk29/4c4CDgu2Sib/D9cI1jq+h4+Qr7fMdRvIfq9fpCmSsfwywgAX+usSlg0wKjp9pdBcF+X7MVz9iPn/RwniVz3cGwC0jAp1/bFDTTYESaeTqE1r3aRTzwIEat3b/ZXAUBeQEBfh1Src9FifNg1m0ntMyzja389lJKvOM9GyNUQUACLenLeVsM40Xc2zkjTsmngPO0N2Cf54pUhmbSNs5bPylz3UdVBOSxDC3nyU4Fr1gfHx2NlirpFCDoK9DqnrEVjxUIFeArMtcbVEVAAsetr7ZrhUaYZA+v7CjJFBYuHENvylZZrCxSMl+kv17meocqCahj4dFWf0n6DB7IPvdbPh/73Ju3C26lSRfdKWO9ha2Ac43e+g3eyWiNx7S8+DDEy7x8xsJ3Ey/ePDKy7IUy11s4CPh2mRgowL8rmsVQy/s3vr9Xu8wAxLvBVjyVm/tNWRdUTUB27WpxqXhg/FFtngHsM0PsIlQez/L+psz1B1UTkDeS4eMxI1xjVJg5zxIt70IX8VApONPgDJnrHyoo4CnwbTIMF1O8zHtvEK9xok5mxdeJpryic2Wuv6iagMAJKNy98O8b+n8G0MU63VFnq0WZfVHm+g84c1uVBOQk23o9PF//zgBO9E6D/05T31Fe18ncYKBqAs4FXjaD748WjTWlES/6ocwNDv4XBIR4CxDnFttBi9LdO5BPEDsI+DaZGHTMg88bbMVj2aDx7uClNtkbLNgKONdVjUED4rvVXrzGsZITcE+VucFDlQVEL/FtN/GS8ibgdgtVFRCnC23vTHQiy8TzZl/B0RO4V+jf/qOKAvp+eJGLeCZtuEbmpsAZ3dj+BC8S8NaVfu4vqibg9HMLZLb/7WjEi66VuSmYhziTP6YVg58ou/Xa3D9USUCXBQZIiXKbzM0Afv9ZKt70/myJjXNDrvnSH1RFQPP8RLzXUbxNMMUFdmYAIs05N9T8Hv0Iu3Vn4m4nVEFAc2xKHisaR0ql+yuXC5PJKeBY1/GWk7b/BLt3XlmpbNgKCL5FJvoKznqGTw90KuS5qMq4hxOaZHIKnF2Wt2yYP7tZJOutiLYChmH4RpnoJ06EP1aTekkjXnyEdyhkbwoYDL0T249rn1w0IkY/1zpnvcEwC0jfbcVDq2vEgVY264ndWi16DbYdKCJeSvnzy2XLejRHZlgFhB/X24tnCjrrhq8GQ7tsxEspvzY4rT6RFxDw9iETcF4QxN91FQ+f18jeDGBEeSlXb2xNU5TK426eP8p0dwCH7xgWAbkoAvL/XQni3SKTmcBx7CqXPFLKxkYupivT5WMYBGQtDoJoLY5bh4r62sy0QGGy41qj2M/60bJm0gYq3j2cqyPT5cJBwFkjt7Kh87s1yHMnC8LluGRiTLZxuWiZ7wikW1eWiOj2N3XlQU9bAZPEz/V4cn4sn49KEfHpIByXP4d87gT3uwpHmvTJM5xyqMxyA93p2rJExOd9pS8dbSOguBVp/4AAt2STz97x8eJZfBjpppYYFrnsMNfLPmhad7rAj5twpMQ/zIqhkAsD8eR+dK0dZeP3tVptVKbdgYKzEpAFUzbLEKyZqV2clDsvOwl7l5Uo4v251sPOA1sBB52peLwcplCdweNxGWVFEdETbSllnk0VBWQ8EO8AYnufwiwN6IovMeXl1luoJT7ABYRk2g5VE1AF8xAvhynE0oHW8/kSRXyQgzeZLo6qCGi6zEbXtL5r51xNgHirmWdJIv4p63n9XBh2AVmIKoSdOGH+oMLqCVB2n2bZGSGz/ctD43+y1UrEYRWwSbh9GOZfydnXCqmnMPcM01F0tq95KBG3cf1Vmc6HYROQvkq4p8Fvet7i7q6ElAPotleVJSIa4fZCMQ2ygGmhmMAaPj4H/sr3xy7Mmv7QT/h+eN5MEfk5zXRbJ5qJUvHjft7lmCHghigabxRSUbJQizHb6SwiiGOo2bvxeR98vBGFcB6Xc5bbAwn4eS78nYTfjTez4ftBUG9si/aB6Vvdpt74hu6/6c1wfFtcvButcF8QRL/NNToNw8aLmtbCAPklZHYZeDmMXwojl/C8B0YvJlGIn0FNW03yFTHgBdh+AbatMgzPRzoEEX0cPAeOfIzky6BIztnE72eT+P1M5Pse0vPCldi+ktMYkPcZyGcFRpJLezGaLBs8OedFeA5I4H+YvjORv6fvVGx+5yKvjaZkvCknJiZq7e8ljoz8F3q9Aqp7fLOWAAAAAElFTkSuQmCC" alt="DUX"><img class="m-white" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAABBCAYAAAAJxiBDAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAjRSURBVHhe7Z15qFRlGMbdc899yRLN1AwhyBDbpEXLSixbtEwkS7PCRI2SVCKSEsEwEE3sryRb0MqKopTSLDIjaTPLJXFtMc2lcKu03+t5Zpo7M/fOOd85M2fm2A8ezr3f+d7ne79578ydmfOdc2oZJ0+erI8aosYnTpxokkfNs0XfFqhlttjXKlu0t2HbNkvtaO+QEr+3Rubb4FRS/+MfHrg5aCfajX7K0s9oTx7tRfvy6Pc8OphHh9Cf0h8U7gDb39A29A1aiV5EM9BIdBFqrpQrBvuDlOplqC6qLdVR1xzYZ0+sevq1enhgXqZj2UOev6DlaDrqR1NdTaEsIcf70XbpR2kr2ow2SpvQBvRdhtYj22dzbSW76qHTC95DVFmQ9/doJrpQUykbyGmo0nQGjytkVzN0rMgCZsIc3kU3aEqxQh6XoqNKLTDEGoNkVxg6V3wBUzAX+995taZWchi7B9qrdJwgfrTs/EFAYgqYgjktQmdpiiWB8dqhLUrBCeKny84/BCWugAbzsnfQN2maRYVxGqG1GtoJ4ufLLhgEJrKAKZhf8L/qgDDGWxrOCeKXySo4SS+gwRznabqRg/dCDeME8WvYNJRdcE6HAhrMc4GmHBnYPuG5u0FOW1Bb2bnhWkDijqEj0tEsHc/QX+iflBQeC4z/pKYdGrzGydYJ4u3brB6ycwcT1wLehTpJ56TErs5su5r4uQs6l5+7S+ehnrSdnxK/X4AuRteiMegZ2lehAyhy8L9FU3cGjyGyc4J4++O/THbhwMi1gEX9vIV/ezQMvYGOa9jQ4LUfddQwgSG2HzoiOyeIv1V24cHMtYD+vy0ICWP1QgtQJC/B+CyVdSCIs1eQPbJxgviHZBcNGC6WdyCIK1kBUzCmvdSuVgqhwMffd42CEDsstsmLdoP4mbKLDkxfkn8giCt5AVMw9myl4QweH8quIHRvSH97u+8M8YtkFy0YuxZwoCxigfEnK5Uw9JFdjTDWMvV3gvgVbKo99hcK1wLCAFnEBrlPVC5OEF/w6yv6PKfuThD/NWomu+jBvGILaJD/LOUTGGJ3s6n2WxD2P+71dIP4Xehs2RUHBqjoAhrM4QPlFBhi834con2sujhBvC0bKf7BZgZJQgHtSwRbWxMIYr5COYedaBusLk4Qb986leY9AgNVfAEN5vGo8vIF/Tey6aDwNLT3RYe9Xm4QP0p2xYfBElFA8rG3+ru81GqGfjvYdFFoGtq7oV+9Xm4Q/5jsSgMDJqKABnOZqtyqhT62LLKXQtLQZmtT7VnpDPFzZVc6GDRJBbT/hceUXw7sO8gm57MfbQ3Y98mpTo4Q/7rsSgsDOxWQuNgWD9UEqdmRjBzI1w575f36zB58dXOC+DXoDNmVFgZ2LeBVsigryGuaUkxD29/oenWpAu3z1M0J4sMflA0DgyeqgKQ2wMvwP8j1Nu2uAu05xQ4C8XbqQE/ZxQMJJO0ZaAeT08cP+TnvOkva71EXJ4i3lQb9ZRcfJJG0AtoZVacW17LNe+yN9lAf1A08hssuXkgkaS+hdcjNzpR6Sk1VoD2KI+oPyy5+SOYV5RUI4sr1GWiLbEfo1yrQ3hOFXfo+R3blAQklqoDVQcp2IulWL3s3iF8iu/LhdCgg6TYl33Ve5m4Qbx/0y+8MYtcCwpWyKGvIsy5zXO6l7AbxdiJma1mWF64FJC7QoqC4IE+nN2kpiLcFuN1lV34kuYDk+KzSdYL46BbgFoukFpD8Ch6ZKAQeOd/g0GZn4E7Tr/FDMokrILmNUZrO4DFRdmlo64h2av9UNccLiSSqgOQV6rwFA4/ZsktDWyN2feH18KBtoXbHB0kkpoDkFOoCA4Y9HrKrAu1vq0sVaF/Cpra6lR5L2EslGMSVVQHJx86f2Kf0nCDelu3Xl2Ua2mtcG8r+19gUZ+FuIRi84gtILva/aZtSc4L4H9i0lGUa2n0dcqLfm2wKX1kpahjYqYBwuSxihfyboS+VkxPE2zqZbrJMQ9sodfEF/e1ltrRFZFDXZ+AlsogN0qhHHs6Leg3i7YzifrJMQ9s1KPDpbMS8wybnZbhoMGDFFtA190zwyDljl7beyBZAOUHse6g0a2QYqCILyPhzlYozeOQc8KXN3gxtVxdn8LDvX92vPuEXBnrVGzIYxMVSQIa2L6ef97JwB49ZsqwC7RPUJTR4rUCNZF0cGGCpxgsEcSUvIMPaRRE+9jJwB4/FsswL+2eoa2jwWsmmsayjhwHKvoCMZUfZp6DAJ7Bkg4c9oAWvNUq/UKeWZbEKvyayjhaMXQuY884tahjDPt9NRJs1bCjw2cCmhewLQv/pXmR48FqNoj/RE1OnAoKv05P9gp8tb7dLi9jZQQ8gWy0d2bVi8PsVddVwviFmiixCg9enKNpLR2Po+gy0SwN/jtZVIzv3zk4vzpZdEzvzEsMmu+ywXS/7kOwjBV9bVt9XUw4MsYFOXasJvD5jc6asw4Oh6zOwYmCOoS87icck2YUGr7Wo8PWw/ZD0AjK/yE62xCvURRUywctepcKvs0lqAZmX3d7gRk0zMvAcryFCg5d9h9tG1m4ksYDMyf7X9tYUIwfvBzVUaPCy9wrtZR0cghNVQOazEBXnM1cGjBHqKhaZ4PUtm5zz9X2RlAIyD/useLOmVRIY815v9PDgtZ5N8CJWegHJfz8bu3JuU02ppDB+oGOGNYGXfZzqJGt/VGoByduuSv80Ku6VkHxADiOVVmjwstvu+J8TnSumgOR6GL2P7OTMnOUPcUJOd3pZhgevHcjf5ZjpGOq8gWJBXna9bbuDmn39NB/ZA9RZaZcl5Dgc2VL81J3Z7HJbqTu22ZWCU3d0y7zjW+Zd4exVxeZsfT9Chd+d0mkosm/6TY+gSWgymoDGS+NMPID3sR0rjeb3u038bLeIM41ANok70DD23W7iZxvDNAQNlgah66SBki1j6E9MH9SFn4v+bjJqyNmuN9OR/O10NrubS+qeidaeuqdi5j0XM+/NmL5vo/bVcCyxVq1/AcGyOVBpbIwZAAAAAElFTkSuQmCC" alt=""></span>`;
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


;
(function () {
  const DX = window.DX;
  DX.onAuthLost = () => location.replace("/login?redirect-to=" + encodeURIComponent("/ops/m" + location.hash));
  DX.bootSuite().then(() => { document.getElementById("dxBoot") && document.getElementById("dxBoot").remove(); DX.startMobile(); }).catch(err => { if (err && /log ?in|Authentication|Not permitted|403/i.test(err.message)) return DX.onAuthLost(); document.getElementById("dxView").innerHTML = '<div class="dx-card"><div class="dx-empty"><b>Couldn’t start DUX Ops</b><p>' + DX.esc(err.message) + '</p><button class="dx-btn dx-btn-secondary" onclick="location.reload()">Try again</button></div></div>'; });
})();
