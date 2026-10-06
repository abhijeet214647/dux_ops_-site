/* Shared masters (real, non-personal values from jewipl) used by several apps. */
(function () {
  "use strict";
  const DX = window.DX;
  const M = (DX.M = {});
  M.companies = [["Jain Engineering Works (India) Private Limited", "JEWPL"], ["ACTIVE INFRASTRUCTURES LIMITED", "AIL"], ["DUX DIGITECH", "DD"]];
  M.companyOpts = () => M.companies.map(([c, a]) => ({ value: c, label: c, sub: a }));
  M.abbr = c => (M.companies.find(x => x[0] === c) || [0, "JEWPL"])[1];
  M.projects = ["MPUSIP - 6J", "MPUSIP - 7C", "MPUSIP - 3C", "MPJNM - NP - II", "Indore Factory", "Ujjain Waste Management", "Bijawar", "Raipur Factory"];
  // Town At Project (id, town_name, project_name)
  M.towns = [
    ["TN-17", "Hatpipliya", "MPUSIP - 3C"], ["TN-16", "Bagli", "MPUSIP - 3C"], ["TN-18", "Polaykalan", "MPUSIP - 3C"], ["TN-021", "Chapda", "MPUSIP - 3C"],
    ["TN-11", "Jatara", "MPUSIP - 6J"], ["TN-08", "Bijawar", "MPUSIP - 6J"], ["TN-10", "Khargapur", "MPUSIP - 6J"], ["TN-09", "Satai", "MPUSIP - 6J"], ["TN-114", "Anicut", "MPUSIP - 6J"], ["TN-005", "Chhatarpur", "MPUSIP - 6J"], ["TN-012", "Kharagpur", "MPUSIP - 6J"],
    ["TN-138", "Satna", "MPUSIP - 7C"], ["TN-141", "Kotar", "MPUSIP - 7C"], ["TN-142", "Kothi", "MPUSIP - 7C"], ["TN-143", "Jaitwara", "MPUSIP - 7C"], ["TN-144", "Birsingpur", "MPUSIP - 7C"], ["TN-145", "Intakewell", "MPUSIP - 7C"], ["TN-146", "Water Treatment Plant", "MPUSIP - 7C"],
    ["TN-161", "Prithvipur", "MPJNM - NP - II"], ["TN-214", "Tikamgarh", "MPJNM - NP - II"], ["TN-006", "Niwari", "MPJNM - NP - II"], ["TN-8286", "OHMBR", "MPJNM - NP - II"], ["TN-8283", "WTP", "MPJNM - NP - II"],
    ["TN-35872", "Palda Office", "Indore Factory"], ["TN-9001", "Ujjain Plant", "Ujjain Waste Management"], ["TN-9002", "Metal Park Factory", "Raipur Factory"]
  ].map(([id, town, project]) => ({ id, town, project, label: `${town} - ${project}` }));
  M.town = id => M.towns.find(t => t.id === id);
  M.townLabel = id => (M.town(id) ? M.town(id).label : id || "—");
  M.townOpts = (filter) => M.towns.filter(t => !filter || filter(t)).map(t => ({ value: t.id, label: t.label, sub: t.id, group: t.project }));
  M.store = (townId, abbr = "JEWPL") => { const t = M.town(townId); return t ? `${t.town} - ${abbr}` : ""; };
  // Contractor at Project — business names only in this prototype
  M.contractorNames = ["Active Infrastructures Private Limited", "Anjney Construction Company", "Arjun Construction", "Bajrang Construction", "Builtcure Infrastructure System", "Chhattisgarh Engineering", "Classic Enterprises", "Devika Enterprises", "Dhara Enterprises", "Gaudeep Construction (OPC) Pvt Ltd", "Group of Engineering Works", "Hardik Construction Pvt Ltd", "Harshit Enterprises", "Jew Team", "Jew Team - 2", "Azad Construction (Jew Team)", "Maa Bhagwati Construction", "Tara Constructions"];
  M.contractors = [];
  (() => { let n = 300; M.towns.forEach((t, ti) => { const k = [0, 1, 2].map(i => M.contractorNames[(ti * 3 + i) % M.contractorNames.length]); k.forEach(name => M.contractors.push({ id: "CP-" + (n++), name, town: t.id })); }); })();
  M.contractorOpts = townId => M.contractors.filter(c => !townId || c.town === townId).map(c => ({ value: c.id, label: c.name, sub: c.id }));
  M.contractorName = id => (M.contractors.find(c => c.id === id) || {}).name || id || "—";
  M.supervisorsFor = townId => ["Site Supervisor A", "Site Supervisor B", "Shift Engineer"].map((s, i) => ({ value: `${townId}-SV${i + 1}`, label: `${s} · ${M.town(townId) ? M.town(townId).town : ""}` }));
})();
