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
