# DUX Ops Suite

One Frappe desk page and one mobile web app for eight site apps:
HSC NP-II, Pour Card, PEB Fabrication, Concrete Master, Fuel, HSC Inhouse, Maintenance Master and Stock.
Every app talks to its own whitelisted API. The suite only adds the shell (navigation, forms, lists, reports).

| Surface | URL |
|---|---|
| Desk page | `/desk/dux-ops-suite` |
| Mobile web app | `/ops/m` |
| Android APK (`com.dux.opssuite`) | Loads `https://jewipl.duxdigitech.in/ops/m`, so UI changes arrive over the air |

Live on `jewipl.duxdigitech.in` and `raisonigroup.duxdigitech.in` (same bench, app `dux_portal`).
Current build: see `live/public/ops/version.txt`.

## Layout

```
src/                  source
  engine.js           forms, combos/bottom sheets, tables, photos, GPS
  views.js            list / detail / report / masters screens + live data layer (DX.call / ensure / save / submit)
  desktop.js|css|html desk shell (rail + app sub-nav; Home hides the sub-nav)
  mobile.js|css|html  /ops/m shell (bottom tabs, drawer, app picker)
  base.css suite.css  shared design-system styles
  live/*.js           one config per app, built from the real masters after boot
  apps/*.js           old demo prototype data (build.js only)
build-live.js         builds live/ (what gets deployed)
build.js              builds dist/ (offline demo prototype)
serve.js              static server for dist/ (port 5188)
live/                 build output, mirrors the dux_portal app:
  page/dux_ops_suite/ -> apps/dux_portal/dux_portal/dux_portal/page/dux_ops_suite/
  public/ops/         -> apps/dux_portal/dux_portal/public/ops/     (/assets/dux_portal/ops/)
  www/ops/            -> apps/dux_portal/dux_portal/www/ops/        (/ops/m)
server-patches/       backend files changed for the suite in other apps (exact live copies, see below)
```

## Build and deploy

```bash
node build-live.js
```

Then copy `live/` into the `dux_portal` app on the bench (paths above) and, on every site that uses the page:

```sql
update tabPage set modified=now(6) where name='dux-ops-suite';
```

followed by `bench --site <site> clear-cache`. Bumping the Page `modified` is what drops the desk page JS that
browsers cache in localStorage. Open tabs poll `version.txt` and reload themselves into a new build.
Python changes in `page/dux_ops_suite/*.py` need a gunicorn reload.

## site_config keys used by the suite

| Key | Where | Meaning |
|---|---|---|
| `ops_company` | suite | Company shown by the suite (Home, Stock, Maintenance default) |
| `ops_stock_enabled` | suite | Shows the Stock app |
| `fuel_companies` | vehicle_inhouse | Companies allowed on the fuel page (unset = AIL / JEW) |
| `fuel_default_company` | vehicle_inhouse | Default fuel company |
| `fuel_item_group` | vehicle_inhouse | Item group of fuel types (unset = `Fuel items JEW`) |
| `fuel_email_recipients` | vehicle_inhouse | Fuel mails; `[]` sends none (unset = JEW addresses) |
| `fuel_warehouse_by_town` | vehicle_inhouse | Fuel store resolved from Store At Town |
| `hsc_company` | hsc_master_inhouse / hsc_np | Company for HSC stock; also issues MDPE pipe (installation) and Ball Valve (repairing), and makes the Material Issue cancel hook cancel only a real repair |
| `hsc_ops_suite_stock` | hsc_master_inhouse + suite | HSC installations / repairs submitted from the suite issue stock from the contractor's own warehouse even where `hsc_material_issue_enabled` is 0 (the HSC page stays as it is). On jewipl since 2026-10-07 |
| `peb_company`, `peb_raw_warehouse`, `peb_finished_store` | peb | PEB company and stores |
| `peb_finished_valuation` | peb | Value the painted member at the raw plate cost consumed |

## server-patches/

Exact copies of the live files changed on 2026-10-06, kept under their app paths:

- `vehicle_inhouse/.../fuel_inward_direct_distribution.py`, `fuel_approval.py`: the `fuel_*` site_config keys above
  (also committed to `Dux-Digitech-6534/fuel-inward-direct-distribution`, branch `development`)
- `hsc_master_inhouse/.../hsc_details_inhouse.py`, `inhouse_hsc_repairing.py`: MDPE pipe / valve issue on `hsc_company` sites
  (also committed to `Dux-Digitech-6534/hsc_master_inhouse`, branch `development`)
- `hsc_master_inhouse/api_cancel_hook.patch`: diff only (not the whole private `api.py`) of `cancel_hsc_repairing_from_mi`.
  On `hsc_company` sites it reads the repair from `custom_hsc_repairing` and skips installation Material Issues, so
  cancelling an installation no longer logs a bogus "Inhouse HSC Repairing HSC Inhouse-NNN not found". Live on the bench;
  not committed to the app repo because its `api.py` there carries other people's uncommitted work.
- `hsc_master_inhouse/.../hsc_details_inhouse.py`, `inhouse_hsc_repairing.py` also carry `hsc_ops_suite_stock`: the suite sends
  `ops_suite=1` on submit and only then is the Material Issue made.
- `hsc_master_inhouse/contractor_lookup.patch`, `hsc_np/contractor_lookup.patch` (diffs only): the contractor warehouse
  lookup reads the `contractor_name` column from the table, because jewipl has that data without the Custom Field.
- `masters/hsc_jewipl_masters.py`: NP-II items + one `<contractor> - JEWPL` warehouse per HSC contractor (run on jewipl
  2026-10-07, 56 warehouses).
- `peb/peb/peb/ft_api.py`: `peb_finished_valuation` (the `peb` app has no git repo of its own)
- `client_scripts/stock_entry_guarded.json`: the 3 site Client Scripts on Stock Entry ("Set Default stock entry type",
  "Fetch Auto Warehouse", "Default Warehouse In Stock") with a drafts-only guard, same text as jewipl. Without the guard
  they rewrite a submitted entry on open, so the form shows "Update" instead of Cancel. Applied on raisonigroup 2026-10-06
  (backup `~/cs_backup_raisonigroup_20261006_101952.json`); jewipl has had it since 2026-09-26.
- `perms/copy_pour_perms.py`: copies jewipl's Pour Card permissions (Pipe Laying User + Website Manager submit/cancel,
  Demo User read/create) and the Pipe Laying User rows of the 11 pipe-laying masters to raisonigroup, keeping the
  existing perms. Run 2026-10-06 (backup `~/pour_perms_backup_raisonigroup_20261006_111102.json`). `DRY=1` previews.

All new behaviour is behind site_config keys, so sites without them keep the old behaviour.
