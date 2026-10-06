import mimetypes
import re
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, cint, flt, get_first_day, get_last_day, getdate, now_datetime, today


INTERNAL_DOCTYPE = "Fuel for Stock"
DISTRIBUTION_DOCTYPE = "Fuel Distribution"
INTERNAL_DISTRIBUTION_SUPPLIER = "Trial Supplier"
PAGE_TITLE = "Fuel Inward & Direct Distribution"
ACCOUNTS_APPROVAL_ROLES = ("Accounts User", "Accounts Manager")
FUEL_EMAIL_RECIPIENTS = ("mgangwaljewipl@gmail.com", "pinkesh.chouriya@thesvsgroup.org")
RECENT_DUPLICATE_WINDOW_MINUTES = 10
JAIN_COMPANY = "Jain Engineering Works (India) Private Limited"
DEFAULT_FUEL_COMPANY = "ACTIVE INFRASTRUCTURES LIMITED"
FUEL_TOWN_PROJECT_COMPANIES = (DEFAULT_FUEL_COMPANY, JAIN_COMPANY)
TOWN_PROJECT_JAIN_MESSAGE = (
    "Town/Project list is available only for the configured Fuel companies."
)
FULL_ACCESS_ROLE = "Inward & Fuel Distributor"
LIMITED_ACCESS_ROLE = "Fuel Inward User"
FUEL_ROLES = (FULL_ACCESS_ROLE, LIMITED_ACCESS_ROLE)
FUEL_DELETE_ROLES = ("System Manager", "Fuel Admin")
TOWN_DOCTYPE = "Town At Project"
NO_ACCESS_SENTINEL = "__fuel_access_denied__"
FUEL_WAREHOUSE_BY_TOWN_FLAG = "fuel_warehouse_by_town"
FUEL_ALLOWED_TOWNS_FLAG = "fuel_allowed_town_projects"
FUEL_ALLOWED_PROJECT_GROUPS_FLAG = "fuel_allowed_project_groups"
FUEL_HIDDEN_ENTRIES_FLAG = "fuel_hidden_entries"
FUEL_ALLOWED_PROJECT_GROUPS = ("7C", "6J", "3C", "NP-II")
FUEL_WAREHOUSE_MISSING_MESSAGE = (
    "No Fuel Warehouse is configured for the selected Company and Town/Project."
)
BROWSER_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
BROWSER_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
FUEL_ATTACHMENT_FIELDS = (
    ("upload_invoice__invoice_copy", "Invoice / Invoice Copy"),
    ("upload_fuel_station_proof__fuel_station_receipt", "Fuel Station Proof / Receipt"),
    ("custom_upload_vehicle_reading", "Vehicle reading"),
    ("custom_qr_attachment", "QR Attachment"),
    ("upload_payment_image", "Payment Receipt"),
    ("attach_image_foqr", "Payment Receipt"),
)


def _parse_json(value):
    if isinstance(value, str):
        return frappe.parse_json(value)
    return value or {}


def _conf_list(key):
    """A list from site_config (JSON list or comma string); None when the key is not set."""
    raw = frappe.local.conf.get(key)
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            raw = frappe.parse_json(raw)
        except Exception:
            raw = [value.strip() for value in raw.split(",")]
    if not isinstance(raw, (list, tuple, set)):
        raw = [raw]
    return [str(value).strip() for value in raw if str(value or "").strip()]


def _fuel_companies():
    # site_config "fuel_companies" replaces the AIL/JEW default on other sites (e.g. raisonigroup)
    return tuple(_conf_list("fuel_companies") or FUEL_TOWN_PROJECT_COMPANIES)


def _fuel_item_group():
    return frappe.local.conf.get("fuel_item_group") or "Fuel items JEW"


def _fuel_warehouse_by_town_enabled():
    return cint(frappe.local.conf.get(FUEL_WAREHOUSE_BY_TOWN_FLAG)) == 1


def _normalise_project_group(value):
    value = (value or "").strip().upper()
    compact = re.sub(r"[^A-Z0-9]+", "", value)
    if not compact:
        return None
    if compact == "NPII" or compact.endswith("NPII"):
        return "NP-II"
    for group in ("7C", "6J", "3C"):
        if re.search(rf"(^|[^A-Z0-9]){re.escape(group)}([^A-Z0-9]|$)", value) or compact.endswith(group):
            return group
    return None


def _configured_allowed_project_groups():
    raw_groups = frappe.local.conf.get(FUEL_ALLOWED_PROJECT_GROUPS_FLAG)
    if not raw_groups:
        return ()
    if isinstance(raw_groups, str):
        try:
            raw_groups = frappe.parse_json(raw_groups)
        except Exception:
            raw_groups = [group.strip() for group in raw_groups.split(",")]
    if not isinstance(raw_groups, (list, tuple, set)):
        return ()
    groups = []
    for group in raw_groups:
        normalised = _normalise_project_group(group)
        if normalised in FUEL_ALLOWED_PROJECT_GROUPS and normalised not in groups:
            groups.append(normalised)
    return tuple(groups)


def _configured_hidden_fuel_entries():
    """Fuel records retained for audit but hidden from the custom page/reports."""
    raw_entries = frappe.local.conf.get(FUEL_HIDDEN_ENTRIES_FLAG)
    if not raw_entries:
        return ()
    if isinstance(raw_entries, str):
        try:
            raw_entries = frappe.parse_json(raw_entries)
        except Exception:
            raw_entries = [entry.strip() for entry in raw_entries.split(",")]
    if not isinstance(raw_entries, (list, tuple, set)):
        return ()
    return tuple(
        dict.fromkeys(
            str(entry).strip()
            for entry in raw_entries
            if str(entry or "").strip()
        )
    )


def _configured_allowed_town_projects():
    raw_towns = frappe.local.conf.get(FUEL_ALLOWED_TOWNS_FLAG)
    if not raw_towns:
        return ()
    if isinstance(raw_towns, str):
        try:
            raw_towns = frappe.parse_json(raw_towns)
        except Exception:
            raw_towns = [town.strip() for town in raw_towns.split(",")]
    if not isinstance(raw_towns, (list, tuple, set)):
        return ()
    towns = []
    for town in raw_towns:
        town = (town or "").strip()
        if town and town not in towns:
            towns.append(town)
    return tuple(towns)


def _get_allowed_project_names():
    groups = _configured_allowed_project_groups()
    if not groups or not frappe.db.exists("DocType", "Site Project"):
        return None

    meta = frappe.get_meta("Site Project")
    fields = ["name"]
    if meta.has_field("project_name") and frappe.db.has_column("Site Project", "project_name"):
        fields.append("project_name")

    rows = frappe.get_all("Site Project", fields=fields, limit_page_length=10000)
    allowed_projects = []
    for row in rows:
        values = [row.get("name"), row.get("project_name")]
        if any(_normalise_project_group(value) in groups for value in values):
            allowed_projects.append(row.get("name"))
    return sorted({project for project in allowed_projects if project})


def _get_globally_allowed_towns():
    configured_towns = _configured_allowed_town_projects()
    if configured_towns:
        if not frappe.db.exists("DocType", TOWN_DOCTYPE):
            return []
        towns = []
        for town in configured_towns:
            resolved, _reason = _find_town_project_id(town)
            if resolved and resolved not in towns:
                towns.append(resolved)
        return towns

    groups = _configured_allowed_project_groups()
    if not groups:
        return None
    if not frappe.db.exists("DocType", TOWN_DOCTYPE):
        return []

    meta = frappe.get_meta(TOWN_DOCTYPE)
    filters = {}
    if meta.has_field("project_name") and frappe.db.has_column(TOWN_DOCTYPE, "project_name"):
        allowed_projects = _get_allowed_project_names()
        if allowed_projects is not None:
            if not allowed_projects:
                return []
            filters["project_name"] = ["in", allowed_projects]

    fields = ["name"]
    if meta.has_field("project_name") and frappe.db.has_column(TOWN_DOCTYPE, "project_name"):
        fields.append("project_name")
    rows = frappe.get_all(
        TOWN_DOCTYPE,
        filters=filters,
        fields=fields,
        limit_page_length=10000,
    )
    if "project_name" in fields:
        rows = [
            row for row in rows
            if _normalise_project_group(row.get("project_name")) in groups
        ]
    return sorted({row.get("name") for row in rows if row.get("name")})


def _public_error(message, title=None):
    frappe.throw(_(message), title=_(title or PAGE_TITLE))


def _permission_error(message="Not permitted for Fuel Inward & Direct Distribution."):
    frappe.throw(_(message), frappe.PermissionError)


def _get_user_roles(user=None):
    return set(frappe.get_roles(user or frappe.session.user))


def _has_admin_access(user=None):
    user = user or frappe.session.user
    return user == "Administrator" or "System Manager" in _get_user_roles(user)


def _has_fuel_page_access(user=None):
    roles = _get_user_roles(user)
    return _has_admin_access(user) or bool(roles.intersection(FUEL_ROLES))


def _has_fuel_distribution_access(user=None):
    roles = _get_user_roles(user)
    return _has_admin_access(user) or FULL_ACCESS_ROLE in roles


def _has_fuel_delete_access(user=None):
    user = user or frappe.session.user
    if user == "Guest":
        return False
    if user == "Administrator":
        return True
    return bool(_get_user_roles(user).intersection(FUEL_DELETE_ROLES))


def _require_fuel_page_access():
    if not _has_fuel_page_access():
        _permission_error()


def _require_fuel_distribution_access():
    if not _has_fuel_distribution_access():
        _permission_error("Not permitted to access Fuel Distribution.")


def _require_fuel_delete_access():
    if not _has_fuel_delete_access():
        _permission_error("Only System Manager or Fuel Admin can delete fuel entries.")


def _supports_applicable_user_permissions():
    return frappe.db.has_column("User Permission", "applicable_for")


def _get_allowed_towns(user=None, applicable_for=INTERNAL_DOCTYPE):
    user = user or frappe.session.user
    global_towns = _get_globally_allowed_towns()
    if _has_admin_access(user):
        return global_towns
    if not _has_fuel_page_access(user):
        return []

    filters = {
        "user": user,
        "allow": TOWN_DOCTYPE,
    }
    if _supports_applicable_user_permissions():
        filters["applicable_for"] = applicable_for

    town_values = frappe.get_all(
        "User Permission",
        filters=filters,
        pluck="for_value",
        limit_page_length=10000,
    )
    towns = []
    for town in town_values:
        resolved, _reason = _find_town_project_id(town)
        if resolved:
            towns.append(resolved)
    towns = sorted({town for town in towns if town})
    if global_towns is not None:
        allowed = set(global_towns)
        towns = [town for town in towns if town in allowed]
    return towns


def _apply_allowed_town_filter(filters, fieldname, applicable_for):
    allowed_towns = _get_allowed_towns(applicable_for=applicable_for)
    if allowed_towns is None:
        return filters
    if isinstance(filters, dict):
        filters[fieldname] = ["in", allowed_towns] if allowed_towns else NO_ACCESS_SENTINEL
        return filters
    filters.append([fieldname, "in", allowed_towns] if allowed_towns else [fieldname, "=", NO_ACCESS_SENTINEL])
    return filters


def _require_town_access(town_project, applicable_for):
    if not town_project:
        return
    allowed_towns = _get_allowed_towns(applicable_for=applicable_for)
    if allowed_towns is None:
        return
    if town_project not in allowed_towns:
        _permission_error("Not permitted for the selected Town / Project.")


def _get_fuel_access_meta():
    inward_towns = _get_allowed_towns(applicable_for=INTERNAL_DOCTYPE)
    distribution_towns = _get_allowed_towns(applicable_for=DISTRIBUTION_DOCTYPE)
    return {
        "can_use_fuel_distribution": _has_fuel_distribution_access(),
        "restrict_towns": inward_towns is not None,
        "allowed_towns": inward_towns or [],
        "restrict_distribution_towns": distribution_towns is not None,
        "allowed_distribution_towns": distribution_towns or [],
    }


def get_fuel_for_stock_permission_query_conditions(user=None):
    user = user or frappe.session.user
    if _has_admin_access(user) or not _get_user_roles(user).intersection(FUEL_ROLES):
        return None
    allowed_towns = _get_allowed_towns(user=user, applicable_for=INTERNAL_DOCTYPE)
    if allowed_towns is None:
        return None
    if not allowed_towns:
        return "1=0"
    towns = ", ".join(frappe.db.escape(town) for town in allowed_towns)
    return f"`tab{INTERNAL_DOCTYPE}`.`fuel_station_town_name` in ({towns})"


def has_fuel_for_stock_doc_permission(doc=None, user=None, permission_type=None, ptype=None, **kwargs):
    user = user or frappe.session.user
    if user == "Administrator" or "System Manager" in frappe.get_roles(user):
        return True
    if _has_admin_access(user) or not _get_user_roles(user).intersection(FUEL_ROLES):
        return None
    town_project = doc.get("fuel_station_town_name") if doc else None
    if not town_project:
        return True
    allowed_towns = _get_allowed_towns(user=user, applicable_for=INTERNAL_DOCTYPE)
    return allowed_towns is None or town_project in allowed_towns


def get_fuel_distribution_permission_query_conditions(user=None):
    user = user or frappe.session.user
    if _has_admin_access(user):
        return None
    roles = _get_user_roles(user)
    if LIMITED_ACCESS_ROLE in roles and FULL_ACCESS_ROLE not in roles:
        return "1=0"
    if FULL_ACCESS_ROLE not in roles:
        return None
    allowed_towns = _get_allowed_towns(user=user, applicable_for=DISTRIBUTION_DOCTYPE)
    if allowed_towns is None:
        return None
    if not allowed_towns:
        return "1=0"
    towns = ", ".join(frappe.db.escape(town) for town in allowed_towns)
    return f"`tab{DISTRIBUTION_DOCTYPE}`.`fd_town_project` in ({towns})"


def has_fuel_distribution_doc_permission(doc=None, user=None, permission_type=None, ptype=None, **kwargs):
    user = user or frappe.session.user
    if _has_admin_access(user):
        return True
    roles = _get_user_roles(user)
    if LIMITED_ACCESS_ROLE in roles and FULL_ACCESS_ROLE not in roles:
        return False
    if FULL_ACCESS_ROLE not in roles:
        return None
    town_project = doc.get("fd_town_project") if doc else None
    if not town_project:
        return True
    allowed_towns = _get_allowed_towns(user=user, applicable_for=DISTRIBUTION_DOCTYPE)
    return allowed_towns is None or town_project in allowed_towns


def _log_and_throw(context, message):
    frappe.log_error(frappe.get_traceback(), f"{PAGE_TITLE}: {context}")
    _public_error(message)


def _log_and_reraise(context):
    frappe.log_error(frappe.get_traceback(), f"{PAGE_TITLE}: {context}")
    raise


def _required(data, fieldname, label):
    value = data.get(fieldname)
    if value in (None, ""):
        _public_error(f"Please enter {label}.", "Missing information")
    return value


def _required_attachment(data, fieldname, label):
    file_url = data.get(fieldname)
    if file_url in (None, ""):
        _public_error(f"{label} is required.", "Missing information")
    file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
    if not file_name:
        _public_error(f"{label} is required.", "Missing information")
    return file_url, file_name


def _optional_attachment(data, fieldname):
    """Optional counterpart to _required_attachment: never raises when the
    attachment is missing. Returns (file_url, file_name), with empty/None values
    when nothing was uploaded (used by the mobile Fuel Distribution flow, which
    has no attachment field). The desktop form still enforces these client-side."""
    file_url = data.get(fieldname)
    if file_url in (None, ""):
        return "", None
    file_name = frappe.db.get_value("File", {"file_url": file_url}, "name")
    return file_url, file_name


def _attach_uploaded_file(file_name, doctype, docname, fieldname):
    frappe.db.set_value(
        "File",
        file_name,
        {
            "attached_to_doctype": doctype,
            "attached_to_name": docname,
            "attached_to_field": fieldname,
        },
        update_modified=False,
    )


def _latest_file_for_url(file_url):
    rows = frappe.get_all(
        "File",
        filters={"file_url": file_url},
        fields=["name"],
        order_by="creation desc",
        limit_page_length=1,
    )
    return frappe.get_doc("File", rows[0].name) if rows else None


def _normalise_uploaded_image(file_url, label):
    """Convert browser-incompatible raster images (including HEIC/HEIF) to JPG.

    Browser-ready images and non-image uploads such as videos are left untouched.
    Returns the URL and File document name that should be attached to the fuel row.
    """
    file_url = str(file_url or "").strip()
    if not file_url:
        return "", None

    file_doc = _latest_file_for_url(file_url)
    if not file_doc:
        _public_error(f"{label} upload was not found. Please upload it again.", "Missing attachment")

    file_name = file_doc.file_name or file_url.rsplit("/", 1)[-1]
    extension = Path(file_name).suffix.lower()
    mime_type = (mimetypes.guess_type(file_name)[0] or "").lower()
    if extension in BROWSER_IMAGE_EXTENSIONS or mime_type in BROWSER_IMAGE_MIME_TYPES:
        return file_url, file_doc.name

    # Video/PDF and other non-image attachments retain their original format.
    is_image = mime_type.startswith("image/") or extension in {
        ".heic", ".heif", ".avif", ".tif", ".tiff", ".bmp", ".dib", ".ico"
    }
    if not is_image:
        return file_url, file_doc.name

    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
        from pillow_heif import register_heif_opener
        from frappe.utils.file_manager import save_file

        register_heif_opener(thumbnails=False)
        content = file_doc.get_content()
        if isinstance(content, str):
            content = content.encode("latin-1")

        with Image.open(BytesIO(content)) as source:
            if getattr(source, "is_animated", False):
                source.seek(0)
            image = ImageOps.exif_transpose(source)
            if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
                rgba = image.convert("RGBA")
                rgb = Image.new("RGB", rgba.size, "white")
                rgb.paste(rgba, mask=rgba.getchannel("A"))
                image = rgb
            else:
                image = image.convert("RGB")

            output = BytesIO()
            image.save(output, "JPEG", quality=92, optimize=True)

        converted_name = f"{Path(file_name).stem or 'fuel-image'}.jpg"
        converted = save_file(
            converted_name,
            output.getvalue(),
            None,
            None,
            is_private=cint(file_doc.is_private),
        )
        return converted.file_url, converted.name
    except (UnidentifiedImageError, OSError, ValueError):
        frappe.log_error(frappe.get_traceback(), f"Fuel image conversion failed: {label}")
        _public_error(
            f"{label} could not be converted. Please upload a valid image.",
            "Unsupported image",
        )


def _normalise_fuel_payload_attachments(payload):
    files = {}
    for fieldname, label in FUEL_ATTACHMENT_FIELDS:
        if not payload.get(fieldname):
            continue
        file_url, file_name = _normalise_uploaded_image(payload.get(fieldname), label)
        payload[fieldname] = file_url
        if file_name:
            files[fieldname] = file_name
    return files


def convert_existing_fuel_images_to_browser_formats():
    """One-time/idempotent maintenance helper for existing fuel image fields."""
    meta = frappe.get_meta(INTERNAL_DOCTYPE)
    available_fields = [fieldname for fieldname, _label in FUEL_ATTACHMENT_FIELDS if meta.has_field(fieldname)]
    rows = frappe.get_all(
        INTERNAL_DOCTYPE,
        fields=["name", *available_fields],
        limit_page_length=0,
    )
    converted = []
    failed = []
    labels = dict(FUEL_ATTACHMENT_FIELDS)

    for row in rows:
        for fieldname in available_fields:
            old_url = str(row.get(fieldname) or "").strip()
            if not old_url:
                continue
            extension = Path(old_url.split("?", 1)[0]).suffix.lower()
            if extension in BROWSER_IMAGE_EXTENSIONS:
                continue
            try:
                new_url, file_name = _normalise_uploaded_image(old_url, labels[fieldname])
                if not new_url or new_url == old_url:
                    continue
                frappe.db.set_value(INTERNAL_DOCTYPE, row.name, fieldname, new_url, update_modified=False)
                _attach_uploaded_file(file_name, INTERNAL_DOCTYPE, row.name, fieldname)
                converted.append({"entry": row.name, "field": fieldname, "from": old_url, "to": new_url})
            except Exception:
                failed.append({"entry": row.name, "field": fieldname, "file": old_url})
                frappe.log_error(frappe.get_traceback(), f"Fuel image migration failed: {row.name}")

    frappe.db.commit()
    return {"converted": converted, "failed": failed, "converted_count": len(converted), "failed_count": len(failed)}


def _date_filters(filters=None):
    if isinstance(filters, str):
        date_filter = filters or "This Month"
        from_date = None
        to_date = None
    else:
        filters = filters or {}
        date_filter = filters.get("date_filter")
        from_date = filters.get("from_date")
        to_date = filters.get("to_date")

    frappe_filters = []
    if from_date:
        frappe_filters.append(["date", ">=", getdate(from_date)])
    if to_date:
        frappe_filters.append(["date", "<=", getdate(to_date)])
    if frappe_filters:
        return frappe_filters

    date_filter = date_filter or "This Month"
    if date_filter == "Today":
        return [["date", "=", today()]]
    if date_filter == "Yesterday":
        return [["date", "=", add_days(today(), -1)]]
    if date_filter == "Last 7 Days":
        return [["date", ">=", add_days(today(), -6)]]
    if date_filter == "This Month":
        return [["date", ">=", get_first_day(today())], ["date", "<=", get_last_day(today())]]
    return []


def _date_filters_for_field(filters=None, fieldname="date"):
    if isinstance(filters, str):
        date_filter = filters or "This Month"
        from_date = None
        to_date = None
    else:
        filters = filters or {}
        date_filter = filters.get("date_filter")
        from_date = filters.get("from_date")
        to_date = filters.get("to_date")

    frappe_filters = []
    if from_date:
        frappe_filters.append([fieldname, ">=", getdate(from_date)])
    if to_date:
        frappe_filters.append([fieldname, "<=", getdate(to_date)])
    if frappe_filters:
        return frappe_filters

    date_filter = date_filter or "This Month"
    if date_filter == "Today":
        return [[fieldname, "=", today()]]
    if date_filter == "Yesterday":
        return [[fieldname, "=", add_days(today(), -1)]]
    if date_filter == "Last 7 Days":
        return [[fieldname, ">=", add_days(today(), -6)]]
    if date_filter == "This Month":
        return [[fieldname, ">=", get_first_day(today())], [fieldname, "<=", get_last_day(today())]]
    return []


def _format_date(value):
    return getdate(value).strftime("%d %b %Y") if value else ""


def _entry_label(entry_type):
    return "Direct Distribution" if entry_type == "Vehicle" else "Fuel Inward"


def _fuel_email_recipients():
    # site_config "fuel_email_recipients" (may be []) replaces the JEW addresses on other sites
    configured = _conf_list("fuel_email_recipients")
    return list(dict.fromkeys(FUEL_EMAIL_RECIPIENTS if configured is None else configured))


def _email_subject_from_message(message):
    for line in (message or "").splitlines()[:80]:
        if line.lower().startswith("subject:"):
            return line.split(":", 1)[1].strip()
    return ""


def _set_email_queue_recipients(queue_doc):
    queue_doc.set("recipients", [])
    for recipient in _fuel_email_recipients():
        queue_doc.append("recipients", {"recipient": recipient})


@contextmanager
def _suppress_fuel_purchase_receipt_workflow_email():
    from frappe.workflow.doctype.workflow_action import workflow_action

    original_enqueue = workflow_action.enqueue

    def scoped_enqueue(method, *args, **kwargs):
        doc = kwargs.get("doc")
        if (
            getattr(method, "__name__", "") == "send_workflow_action_email"
            and getattr(doc, "doctype", None) == "Purchase Receipt"
            and getattr(frappe.flags, "from_fuel_inward_direct_distribution", False)
        ):
            return None
        return original_enqueue(method, *args, **kwargs)

    workflow_action.enqueue = scoped_enqueue
    try:
        yield
    finally:
        workflow_action.enqueue = original_enqueue


def _send_payment_options_email_after_commit(purchase_invoice, fuel_doc_name=None):
    if not purchase_invoice:
        return

    def send_after_commit():
        try:
            from vehicle_inhouse.vehicle_inhouse.fuel_approval import send_payment_options_email

            send_payment_options_email(purchase_invoice, fuel_doc_name)
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"{PAGE_TITLE}: payment-options email after commit")

    frappe.db.after_commit.add(send_after_commit)


def _dedupe_fuel_email_queue(reference_doctype, reference_name):
    if not reference_name:
        return

    try:
        rows = frappe.get_all(
            "Email Queue",
            filters={
                "reference_doctype": reference_doctype,
                "reference_name": reference_name,
                "status": ["in", ["Not Sent", "Error"]],
            },
            fields=["name", "message"],
            order_by="creation asc",
            limit_page_length=100,
        )
        seen_subjects = set()
        for row in rows:
            queue_doc = frappe.get_doc("Email Queue", row.name)
            _set_email_queue_recipients(queue_doc)

            subject = _email_subject_from_message(row.get("message"))
            key = subject or row.name
            if key in seen_subjects:
                queue_doc.status = "Error"
                queue_doc.error = "Duplicate Fuel Inward email suppressed before sending."
            else:
                seen_subjects.add(key)

            queue_doc.save(ignore_permissions=True)
    except Exception:
        frappe.log_error(
            frappe.get_traceback(),
            f"{PAGE_TITLE}: fuel email queue recipient/dedupe",
        )


def _as_float(value):
    return flt(value or 0, 2)


def _strict_float(value, label):
    if isinstance(value, str):
        raw_value = value.strip()
        if not raw_value or not re.fullmatch(r"-?(?:\d+\.?\d*|\.\d+)", raw_value):
            _public_error(f"{label} must be a positive number.", "Invalid information")
    try:
        return flt(value, 2)
    except Exception:
        _public_error(f"{label} must be a positive number.", "Invalid information")


def _positive_float(data, fieldname, label):
    value = _strict_float(_required(data, fieldname, label), label)
    if value <= 0:
        _public_error(f"{label} must be a positive number.", "Invalid information")
    return value


def _docstatus_key(value):
    value = cint(value)
    if value == 0:
        return "draft"
    if value == 2:
        return "cancelled"
    return "submitted"


def _docstatus_label(value):
    value = cint(value)
    if value == 0:
        return "Draft"
    if value == 2:
        return "Cancelled"
    return "Submitted"


def _link_display_map(doctype, names, display_fields=None):
    names = list({name for name in names if name})
    if not names:
        return {}

    meta = frappe.get_meta(doctype)
    fields = ["name"]
    for fieldname in list(display_fields or []) + [meta.title_field]:
        if not fieldname or fieldname == "name" or fieldname in fields:
            continue
        if meta.has_field(fieldname) and frappe.db.has_column(doctype, fieldname):
            fields.append(fieldname)

    rows = frappe.get_all(
        doctype,
        filters={"name": ["in", names]},
        fields=fields,
        limit_page_length=500,
    )

    display_map = {}
    for row in rows:
        label = ""
        for fieldname in fields[1:]:
            label = row.get(fieldname)
            if label:
                break
        display_map[row.name] = label or row.name

    return display_map


def _town_project_display_fields():
    meta = frappe.get_meta("Town At Project")
    fields = ["name"]
    for fieldname in ["display_name", "town_name", "title", "project_town_name", meta.title_field]:
        if not fieldname or fieldname == "name" or fieldname in fields:
            continue
        if meta.has_field(fieldname) and frappe.db.has_column("Town At Project", fieldname):
            fields.append(fieldname)
    return fields


def _coerce_link_value(value):
    if hasattr(value, "as_dict"):
        value = value.as_dict()
    if hasattr(value, "get") and not isinstance(value, str):
        for key in ("value", "name", "town_project", "town_project_id", "id"):
            candidate = value.get(key)
            if candidate:
                return _coerce_link_value(candidate)
        for key in ("label", "display_name", "title", "description"):
            candidate = value.get(key)
            if candidate:
                return _coerce_link_value(candidate)
        return ""
    if isinstance(value, (list, tuple)):
        for candidate in value:
            coerced = _coerce_link_value(candidate)
            if coerced:
                return coerced
        return ""
    return (str(value or "")).strip()


def _safe_link_debug_value(value):
    if hasattr(value, "as_dict"):
        value = value.as_dict()
    if hasattr(value, "get") and not isinstance(value, str):
        return {
            key: _coerce_link_value(value.get(key))
            for key in ("value", "name", "label", "display_name", "town_project", "town_project_id")
            if value.get(key)
        }
    return _coerce_link_value(value)


def _town_project_lookup_values(town_project):
    town_project = _coerce_link_value(town_project)
    if not town_project:
        return []

    fields = _town_project_display_fields()
    values = []

    def add(value):
        value = (value or "").strip() if isinstance(value, str) else value
        if value and value not in values:
            values.append(value)

    add(town_project)

    rows = frappe.get_all(
        "Town At Project",
        filters={"name": town_project},
        fields=fields,
        limit_page_length=1,
    )

    if not rows:
        for fieldname in fields[1:]:
            matches = frappe.get_all(
                "Town At Project",
                filters={fieldname: town_project},
                fields=fields,
                limit_page_length=5,
            )
            rows.extend(matches)

    for row in rows:
        for fieldname in fields:
            add(row.get(fieldname))

    return values


def _find_town_project_id(town_project):
    town_project = _coerce_link_value(town_project)
    if not town_project:
        return None, None
    if frappe.db.exists("Town At Project", town_project):
        return town_project, None

    matches = []
    fields = _town_project_display_fields()
    for fieldname in fields[1:]:
        rows = frappe.get_all(
            "Town At Project",
            filters={fieldname: town_project},
            pluck="name",
            limit_page_length=5,
        )
        matches.extend(rows)

    names = sorted({name for name in matches if name})
    if len(names) == 1:
        return names[0], None
    if len(names) > 1:
        return None, "ambiguous"
    return None, "missing"


def _resolve_town_project_id(town_project):
    resolved, reason = _find_town_project_id(town_project)
    if resolved:
        return resolved
    if reason == "ambiguous":
        _public_error("Please select a unique Town/Project.", "Invalid information")
    _public_error("Please select a valid Town/Project.", "Invalid information")


def _town_project_group(town_project):
    town_project = _coerce_link_value(town_project)
    if not town_project or not frappe.db.exists(TOWN_DOCTYPE, town_project):
        return None

    fields = ["name"]
    for fieldname in ("project_name", "display_name", "town_name"):
        if frappe.get_meta(TOWN_DOCTYPE).has_field(fieldname) and frappe.db.has_column(TOWN_DOCTYPE, fieldname):
            fields.append(fieldname)

    row = frappe.db.get_value(TOWN_DOCTYPE, town_project, fields, as_dict=True) or {}
    for fieldname in ("project_name", "display_name", "town_name", "name"):
        group = _normalise_project_group(row.get(fieldname))
        if group:
            return group
    return None


def _validate_allowed_town_project_group(town_project):
    groups = _configured_allowed_project_groups()
    if not groups:
        return
    if _town_project_group(town_project) not in groups:
        _public_error("Town/Project is not configured for Fuel.", "Invalid information")


def _town_project_row_label(row, fields):
    for fieldname in fields[1:]:
        label = row.get(fieldname)
        if label:
            return label
    return row.name


def _validate_vehicle_exists(vehicle):
    if not vehicle:
        return

    if not frappe.db.exists("Vehicle Details", vehicle):
        _public_error("Please select a valid Vehicle Name.", "Invalid information")


def _set_link(doc, fieldname, value):
    if not value:
        return
    doc.db_set(fieldname, value, update_modified=False)
    setattr(doc, fieldname, value)


def _submit_purchase_receipt(receipt):
    developer_mode = frappe.conf.get("developer_mode")
    if cint(developer_mode):
        frappe.conf.developer_mode = 0
    try:
        receipt.submit()
    finally:
        if cint(developer_mode):
            frappe.conf.developer_mode = developer_mode


def _get_documents_response(fuel_doc, entry_type):
    documents = {
        "purchase_receipt": fuel_doc.get("custom_purchase_receipt"),
        "purchase_invoice": fuel_doc.get("custom_purchase_invoice"),
    }
    if entry_type == "Vehicle":
        documents["material_issue"] = fuel_doc.get("custom_material_issue")
    return documents


def _success_response(fuel_doc, entry_type):
    return {
        "message": f"{PAGE_TITLE} entry saved successfully.",
        "entry": fuel_doc.name,
        "documents": _get_documents_response(fuel_doc, entry_type),
        "today": today(),
    }


def _find_recent_duplicate(payload):
    filters = [
        ["owner", "=", frappe.session.user],
        ["docstatus", "<", 2],
        ["creation", ">=", add_to_date(now_datetime(), minutes=-RECENT_DUPLICATE_WINDOW_MINUTES)],
    ]

    match_fields = (
        "fuel_entry_type",
        "company",
        "warehouse",
        "date",
        "types_of_fuel",
        "fuel_station_town_name",
        "quantity",
        "rateltr_ffs",
        "amount",
        "supplier_name",
        "upload_invoice__invoice_copy",
        "upload_fuel_station_proof__fuel_station_receipt",
        "payment_to_be_done",
    )

    if payload.get("fuel_entry_type") == "Vehicle":
        match_fields = match_fields + ("custom_vehicles", "custom_current_reading_km", "last_reading_km")

    for fieldname in match_fields:
        filters.append([fieldname, "=", payload.get(fieldname)])

    rows = frappe.get_all(
        INTERNAL_DOCTYPE,
        filters=filters,
        fields=[
            "name",
            "custom_purchase_receipt",
            "custom_purchase_invoice",
            "custom_material_issue",
        ],
        order_by="creation desc",
        limit_page_length=1,
    )
    return rows[0] if rows else None


def _get_default_company():
    company = frappe.local.conf.get("fuel_default_company") or DEFAULT_FUEL_COMPANY
    return company if frappe.db.exists("Company", company) else None


def _store_at_town_has_field(fieldname):
    return (
        frappe.db.exists("DocType", "Store At Town")
        and frappe.get_meta("Store At Town").has_field(fieldname)
        and frappe.db.has_column("Store At Town", fieldname)
    )


def _store_at_town_fields():
    fields = ["name", "townproject", "store"]
    if _store_at_town_has_field("company"):
        fields.append("company")
    if _store_at_town_has_field("disabled"):
        fields.append("disabled")
    return fields


def _get_warehouse(name):
    name = (name or "").strip()
    if not name or not frappe.db.exists("Warehouse", name):
        return None
    return frappe.db.get_value(
        "Warehouse",
        name,
        ["name", "warehouse_name", "company", "is_group", "disabled"],
        as_dict=True,
    )


def _warehouse_is_usable(warehouse, company):
    return bool(
        warehouse
        and not warehouse.is_group
        and warehouse.company == company
        and not warehouse.get("disabled")
    )


def _mapped_store_label(row):
    """Return the company-neutral store label configured by Store At Town."""
    store = (row.get("store") or "").strip()
    warehouse = _get_warehouse(store)
    if warehouse and warehouse.warehouse_name:
        return warehouse.warehouse_name.strip()

    mapping_company = (row.get("company") or "").strip()
    abbreviation = (
        frappe.get_cached_value("Company", mapping_company, "abbr")
        if mapping_company and frappe.db.exists("Company", mapping_company)
        else None
    )
    suffix = f" - {abbreviation}" if abbreviation else ""
    if suffix and store.endswith(suffix):
        return store[:-len(suffix)].strip()
    return store


def _validate_mapped_warehouse(row, company):
    store = (row.get("store") or "").strip()
    warehouse = _get_warehouse(store)
    if _warehouse_is_usable(warehouse, company):
        return warehouse

    # Store At Town is the single location master shared by modules and
    # companies. Resolve the selected company's Warehouse by the same neutral
    # store label instead of requiring a duplicate, company-specific mapping.
    store_label = _mapped_store_label(row)
    if not store_label:
        return None
    matches = frappe.get_all(
        "Warehouse",
        filters={
            "warehouse_name": store_label,
            "company": company,
            "is_group": 0,
            "disabled": 0,
        },
        fields=["name", "warehouse_name", "company", "is_group", "disabled"],
        limit_page_length=2,
    )
    return matches[0] if len(matches) == 1 else None


def _validate_company_exists(company):
    company = _coerce_link_value(company)
    if not company or not frappe.db.exists("Company", company):
        _public_error("Please select a valid Company.", "Invalid information")


def _log_fuel_warehouse_resolution_failure(company, raw_town_project, town_project, rows, reason, valid_count=0):
    try:
        details = {
            "company": company,
            "raw_town_value": _safe_link_debug_value(raw_town_project),
            "normalized_town_id": town_project or "",
            "mapping_doctype": "Store At Town",
            "mapping_fieldnames": _store_at_town_fields() if frappe.db.exists("DocType", "Store At Town") else [],
            "mapping_count": len(rows or []),
            "valid_mapping_count": valid_count,
            "reason": reason,
        }
        frappe.log_error(frappe.as_json(details, indent=2), f"{PAGE_TITLE}: Fuel Warehouse resolution")
    except Exception:
        pass


@frappe.whitelist()
def get_fuel_warehouse(company=None, town_project=None, applicable_for=INTERNAL_DOCTYPE):
    applicable_for = _coerce_link_value(applicable_for) or INTERNAL_DOCTYPE
    if applicable_for == DISTRIBUTION_DOCTYPE:
        _require_fuel_distribution_access()
    else:
        _require_fuel_page_access()

    company = _coerce_link_value(company)
    raw_town_project = town_project
    raw_town_value = _coerce_link_value(town_project)

    _validate_company_exists(company)
    _validate_jain_company_for_town_project(company)

    town_project, reason = _find_town_project_id(raw_town_value)
    if not town_project:
        _log_fuel_warehouse_resolution_failure(company, raw_town_project, None, [], f"town_{reason or 'missing'}")
        if reason == "ambiguous":
            _public_error("Please select a unique Town/Project.", "Invalid information")
        _public_error("Please select a valid Town/Project.", "Invalid information")

    _validate_allowed_town_project_group(town_project)
    _require_town_access(town_project, applicable_for)

    if not _fuel_warehouse_by_town_enabled():
        return {
            "enabled": False,
            "warehouse": "",
            "mapping": "",
        }

    filters = {"townproject": town_project}
    if _store_at_town_has_field("disabled"):
        filters["disabled"] = ["!=", 1]

    rows = frappe.get_all(
        "Store At Town",
        filters=filters,
        fields=_store_at_town_fields(),
        order_by="modified desc, name asc",
        limit_page_length=100,
    )

    valid_rows_by_warehouse = {}
    for row in rows:
        if row.get("disabled"):
            continue
        warehouse = _validate_mapped_warehouse(row, company)
        if warehouse:
            # Prefer an explicit mapping for the selected company, but treat
            # multiple Store At Town rows resolving to the same Warehouse as
            # one unambiguous location.
            existing = valid_rows_by_warehouse.get(warehouse.name)
            if not existing or row.get("company") == company:
                valid_rows_by_warehouse[warehouse.name] = (row, warehouse)

    valid_rows = list(valid_rows_by_warehouse.values())

    if len(valid_rows) != 1:
        _log_fuel_warehouse_resolution_failure(
            company,
            raw_town_project,
            town_project,
            rows,
            "mapping_not_unique",
            valid_count=len(valid_rows),
        )
        frappe.throw(_(FUEL_WAREHOUSE_MISSING_MESSAGE))

    row, warehouse = valid_rows[0]
    return {
        "enabled": True,
        "warehouse": warehouse.name,
        "warehouse_name": warehouse.warehouse_name,
        "mapping": row.name,
        "company": company,
        "town_project": town_project,
    }


def _resolve_transaction_warehouse(company, town_project, applicable_for, posted_warehouse=None):
    if not _fuel_warehouse_by_town_enabled():
        if posted_warehouse in (None, ""):
            _public_error("Please enter Warehouse.", "Missing information")
        return posted_warehouse
    return get_fuel_warehouse(company, town_project, applicable_for).get("warehouse")


def _is_jain_company(company):
    return (company or "").strip() in _fuel_companies()


def _is_jain_town_project(town_project):
    resolved, _reason = _find_town_project_id(town_project)
    if not resolved:
        return False
    groups = _configured_allowed_project_groups()
    return not groups or _town_project_group(resolved) in groups


def _validate_jain_company_for_town_project(company):
    if not _is_jain_company(company):
        _public_error(TOWN_PROJECT_JAIN_MESSAGE, "Invalid information")


def _validate_jain_town_project(town_project):
    resolved, reason = _find_town_project_id(town_project)
    if not resolved:
        if reason == "ambiguous":
            _public_error("Please select a unique Town/Project.", "Invalid information")
        _public_error(TOWN_PROJECT_JAIN_MESSAGE, "Invalid information")
    _validate_allowed_town_project_group(resolved)
    return resolved


@frappe.whitelist()
def get_fuel_inward_direct_distribution_meta():
    _require_fuel_page_access()
    access = _get_fuel_access_meta()
    roles = set(frappe.get_roles(frappe.session.user))
    return {
        "title": PAGE_TITLE,
        "today": today(),
        "default_company": _get_default_company(),
        "fuel_companies": [company for company in _fuel_companies() if frappe.db.exists("Company", company)],
        "fuel_warehouse_by_town": _fuel_warehouse_by_town_enabled(),
        "can_create": frappe.has_permission(INTERNAL_DOCTYPE, "create"),
        "can_delete_fuel_entries": _has_fuel_delete_access(),
        "can_approve_invoices": bool(roles.intersection(ACCOUNTS_APPROVAL_ROLES)),
        "filter_options": _get_fuel_filter_options(access),
        **access,
    }


def _get_fuel_filter_options(access):
    """Return complete, permission-safe master values for custom list filters."""
    companies = frappe.get_all(
        "Company",
        filters={"is_group": 0} if frappe.get_meta("Company").has_field("is_group") else None,
        pluck="name",
        order_by="name asc",
        limit_page_length=1000,
    )

    town_fields = _town_project_display_fields()
    requested_towns = set((access.get("allowed_towns") or []) + (access.get("allowed_distribution_towns") or []))
    if requested_towns:
        town_filters = {"name": ["in", sorted(requested_towns)]}
    elif access.get("restrict_towns") or access.get("restrict_distribution_towns"):
        town_filters = {"name": NO_ACCESS_SENTINEL}
    else:
        town_filters = None
    town_rows = frappe.get_all(
        TOWN_DOCTYPE,
        filters=town_filters,
        fields=town_fields,
        order_by="name asc",
        limit_page_length=10000,
    )
    towns = [
        {"value": row.name, "label": _town_project_row_label(row, town_fields) or row.name}
        for row in town_rows
    ]

    warehouses = frappe.get_all(
        "Warehouse",
        filters={"is_group": 0, "disabled": 0},
        pluck="name",
        order_by="name asc",
        limit_page_length=5000,
    )
    fuel_types = frappe.get_all(
        "Item",
        filters={"item_group": _fuel_item_group(), "disabled": 0},
        pluck="name",
        order_by="name asc",
        limit_page_length=1000,
    )
    vehicle_rows = frappe.get_all(
        "Vehicle Details",
        fields=["name", "vehicle_display_name"],
        order_by="vehicle_display_name asc, name asc",
        limit_page_length=10000,
    )
    vehicles = [
        {"value": row.name, "label": row.vehicle_display_name or row.name}
        for row in vehicle_rows
    ]

    return {
        "companies": companies,
        "towns": towns,
        "warehouses": warehouses,
        "fuel_types": fuel_types,
        "vehicles": vehicles,
    }


def _supplier_advance_currency(company, supplier, currency=None):
    currency = (currency or "").strip()
    if currency:
        if not frappe.db.exists("Currency", currency):
            _public_error("Please select a valid Currency.", "Invalid information")
        return currency

    if frappe.get_meta("Supplier").has_field("default_currency"):
        currency = frappe.db.get_value("Supplier", supplier, "default_currency")

    return currency or frappe.db.get_value("Company", company, "default_currency") or "INR"


def _resolve_pump_supplier(value):
    """Return the Supplier linked to a Petrol Pump master.

    If the value is not a Petrol Pump record (e.g. a legacy BPCL/HPCL/IOCL
    string stored on old entries), return it unchanged so pre-existing
    supplier-name behaviour keeps working.
    """
    value = (value or "").strip()
    if not value:
        return value
    if frappe.db.exists("Petrol Pump", value):
        return (frappe.db.get_value("Petrol Pump", value, "supplier") or "").strip()
    return value


@frappe.whitelist()
def get_petrol_pumps_for_town(doctype=None, txt=None, searchfield=None, start=0, page_len=20, filters=None):
    """Link-field query for the Petrol Pump control.

    Returns only the Petrol Pumps whose ``applicable_towns`` include the
    selected Town At Project. When no town is selected, returns nothing so the
    user is nudged to pick a Town/Project first.
    """
    _require_fuel_page_access()
    filters = _parse_json(filters)
    town = ""
    if isinstance(filters, dict):
        town = (filters.get("town") or "").strip()
    if not town:
        return []
    town = _validate_jain_town_project(town)
    _require_town_access(town, INTERNAL_DOCTYPE)

    pump_names = frappe.get_all(
        "Petrol Pump Town",
        filters={"town": town},
        pluck="parent",
        limit_page_length=0,
    )
    pump_names = sorted(set(pump_names))
    if not pump_names:
        return []

    rows = frappe.get_all(
        "Petrol Pump",
        filters={"name": ["in", pump_names]},
        fields=["name", "supplier"],
        order_by="name asc",
        limit_page_length=0,
    )

    txt = (txt or "").strip().lower()
    if txt:
        rows = [row for row in rows if txt in (row.name or "").lower()]

    start = cint(start)
    page_len = cint(page_len) or 20
    return [[row.name, row.name] for row in rows[start:start + page_len]]


@frappe.whitelist()
def get_current_supplier_advance(company=None, supplier=None, currency=None):
    """Net supplier advance after all effective submitted invoice payables."""
    _require_fuel_page_access()
    company = (company or "").strip()
    # The Petrol Pump control now sends a Petrol Pump name; resolve it to the
    # linked Supplier so the advance lookup still works.
    supplier = _resolve_pump_supplier(supplier)

    if not company or not supplier:
        return {
            "supplier": supplier,
            "currency": (currency or "").strip() or "INR",
            "current_advance": 0,
        }

    if not (
        frappe.has_permission(INTERNAL_DOCTYPE, "create")
        or frappe.has_permission(INTERNAL_DOCTYPE, "read")
    ):
        frappe.throw(_("Not permitted to view Supplier advance."), frappe.PermissionError)

    if not frappe.db.exists("Company", company):
        _public_error("Please select a valid Company.", "Invalid information")
    if not frappe.db.exists("Supplier", supplier):
        _public_error("Please select a valid Supplier.", "Invalid information")

    resolved_currency = _supplier_advance_currency(company, supplier, currency)

    from vehicle_inhouse.vehicle_inhouse.fuel_approval import (
        _get_remaining_supplier_advance,
        _get_supplier_outstanding_payable,
    )

    invoice_context = frappe._dict(
        company=company,
        supplier=supplier,
        currency=resolved_currency,
    )

    gross_advance = flt(_get_remaining_supplier_advance(invoice_context), 2)
    gross_outstanding = flt(_get_supplier_outstanding_payable(invoice_context), 2)

    return {
        "supplier": supplier,
        "currency": resolved_currency,
        "current_advance": flt(max(gross_advance - gross_outstanding, 0), 2),
    }


@frappe.whitelist()
def get_opening_invoice_outstanding(company=None, supplier=None):
    """Net payable after the supplier's available advance balance.

    Both balance fields use the same display-only net calculation. This must not
    auto-allocate advances to unrelated or historical Purchase Invoices.
    """
    _require_fuel_page_access()
    company = (company or "").strip()
    # The Petrol Pump control sends a Petrol Pump name; resolve it to the
    # linked Supplier, same as the advance lookup.
    supplier = _resolve_pump_supplier(supplier)

    if not company or not supplier:
        return {
            "supplier": supplier,
            "company": company,
            "outstanding_payable": 0,
        }

    if not (
        frappe.has_permission(INTERNAL_DOCTYPE, "create")
        or frappe.has_permission(INTERNAL_DOCTYPE, "read")
    ):
        frappe.throw(
            _("Not permitted to view Supplier outstanding."), frappe.PermissionError
        )

    if not frappe.db.exists("Company", company):
        _public_error("Please select a valid Company.", "Invalid information")
    if not frappe.db.exists("Supplier", supplier):
        _public_error("Please select a valid Supplier.", "Invalid information")

    from vehicle_inhouse.vehicle_inhouse.fuel_approval import (
        _get_remaining_supplier_advance,
        _get_supplier_outstanding_payable,
    )

    invoice_context = frappe._dict(company=company, supplier=supplier)
    gross_outstanding = flt(_get_supplier_outstanding_payable(invoice_context), 2)
    current_advance = flt(_get_remaining_supplier_advance(invoice_context), 2)

    return {
        "supplier": supplier,
        "company": company,
        "outstanding_payable": flt(max(gross_outstanding - current_advance, 0), 2),
    }


@frappe.whitelist()
def get_jain_town_projects(doctype=None, txt=None, searchfield=None, start=0, page_len=20, filters=None):
    filters = _parse_json(filters)
    applicable_for = filters.get("applicable_for") or INTERNAL_DOCTYPE
    if applicable_for == DISTRIBUTION_DOCTYPE:
        _require_fuel_distribution_access()
    else:
        _require_fuel_page_access()
    if not _is_jain_company(filters.get("company")):
        return []

    fields = _town_project_display_fields()
    town_filters = {}
    allowed_towns = _get_allowed_towns(applicable_for=applicable_for)
    if allowed_towns == []:
        return []
    if allowed_towns is not None:
        town_filters["name"] = ["in", allowed_towns]
    rows = frappe.get_all(
        "Town At Project",
        filters=town_filters,
        fields=fields,
        order_by="display_name asc, town_name asc, name asc",
        limit_page_length=0,
    )

    txt = (txt or "").strip().lower()
    if txt:
        rows = [
            row for row in rows
            if any(txt in (str(row.get(fieldname) or "").lower()) for fieldname in fields)
        ]

    start = cint(start)
    page_len = cint(page_len) or 20
    return [
        [row.name, _town_project_row_label(row, fields)]
        for row in rows[start:start + page_len]
    ]


@frappe.whitelist()
def get_vehicles_by_town_project(doctype=None, txt=None, searchfield=None, start=0, page_len=20, filters=None):
    filters = _parse_json(filters)
    applicable_for = filters.get("applicable_for") or INTERNAL_DOCTYPE
    if applicable_for == DISTRIBUTION_DOCTYPE:
        _require_fuel_distribution_access()
    else:
        _require_fuel_page_access()
    town_project = (filters.get("town") or "").strip()
    if not town_project:
        return []
    town_project = _validate_jain_town_project(town_project)
    _require_town_access(town_project, applicable_for)

    rows = frappe.get_all(
        "Vehicle Details",
        fields=["name", "vehicle_display_name"],
        order_by="vehicle_display_name asc, name asc",
        limit_page_length=0,
    )

    txt = (txt or "").strip().lower()
    if txt:
        rows = [
            row for row in rows
            if txt in (row.name or "").lower() or txt in (row.vehicle_display_name or "").lower()
        ]

    start = cint(start)
    page_len = cint(page_len) or 20
    return [
        [row.name, row.vehicle_display_name or row.name]
        for row in rows[start:start + page_len]
    ]


@frappe.whitelist()
def get_all_vehicles(doctype=None, txt=None, searchfield=None, start=0, page_len=20, filters=None):
    """Unfiltered Vehicle Details list for the mobile Distribution form.

    Same shape as get_vehicles_by_town_project but with no Town/Project or Company
    narrowing -- every Vehicle Details record is listed. Role access is still checked.
    """
    _require_fuel_distribution_access()

    rows = frappe.get_all(
        "Vehicle Details",
        fields=["name", "vehicle_display_name"],
        order_by="vehicle_display_name asc, name asc",
        limit_page_length=0,
    )

    txt = (txt or "").strip().lower()
    if txt:
        rows = [
            row for row in rows
            if txt in (row.name or "").lower() or txt in (row.vehicle_display_name or "").lower()
        ]

    start = cint(start)
    page_len = cint(page_len) or 20
    return [
        [row.name, row.vehicle_display_name or row.name]
        for row in rows[start:start + page_len]
    ]


@frappe.whitelist()
def get_vehicle_last_reading(vehicle, town_project=None):
    _require_fuel_page_access()
    if not vehicle:
        return {
            "last_reading_km": 0
        }

    filters = {
        "fuel_entry_type": "Vehicle",
        "custom_vehicles": vehicle,
        "docstatus": ["<", 2],
    }
    if town_project:
        town_project = _validate_jain_town_project(town_project)
        _require_town_access(town_project, INTERNAL_DOCTYPE)
        filters["fuel_station_town_name"] = town_project
    else:
        _apply_allowed_town_filter(filters, "fuel_station_town_name", INTERNAL_DOCTYPE)

    last_reading = frappe.db.get_value(
        INTERNAL_DOCTYPE,
        filters,
        "custom_current_reading_km",
        order_by="date desc, creation desc",
    )

    return {
        "last_reading_km": flt(last_reading or 0)
    }


@frappe.whitelist()
def get_fuel_distribution_stock(town_project=None, company=None):
    _require_fuel_distribution_access()
    if not town_project or not _is_jain_company(company) or not _is_jain_town_project(town_project):
        return {
            "warehouse": "",
            "available_stock_ltr": 0,
            "fd_petrol_in_stock": 0,
        }
    town_project = _validate_jain_town_project(town_project)
    _require_town_access(town_project, DISTRIBUTION_DOCTYPE)

    if _fuel_warehouse_by_town_enabled():
        warehouse = get_fuel_warehouse(company, town_project, DISTRIBUTION_DOCTYPE).get("warehouse")

        def bin_qty(item_code):
            if not frappe.db.exists("Item", item_code):
                return 0
            return flt(
                frappe.db.get_value(
                    "Bin",
                    {"item_code": item_code, "warehouse": warehouse},
                    "actual_qty",
                )
                or 0
            )

        return {
            "warehouse": warehouse,
            "available_stock_ltr": bin_qty("Diesel"),
            "fd_petrol_in_stock": bin_qty("Petrol"),
        }

    stock = frappe.db.get_value(
        "Fuel Stock",
        {"fuel_stock_town_project": town_project},
        ["fuel_stock_fuel_storage", "fs_petrol"],
        as_dict=True,
    )

    return {
        "warehouse": "",
        "available_stock_ltr": flt(stock.fuel_stock_fuel_storage if stock else 0),
        "fd_petrol_in_stock": flt(stock.fs_petrol if stock else 0),
    }


@frappe.whitelist()
def get_vehicle_last_reading_for_distribution(vehicle=None, town_project=None):
    _require_fuel_distribution_access()
    if not vehicle:
        return {
            "last_reading_km": 0
        }

    filters = {
        "fd_vehicle_name": vehicle,
        "docstatus": ["<", 2],
    }
    if town_project:
        town_project = _validate_jain_town_project(town_project)
        _require_town_access(town_project, DISTRIBUTION_DOCTYPE)
        filters["fd_town_project"] = town_project
    else:
        _apply_allowed_town_filter(filters, "fd_town_project", DISTRIBUTION_DOCTYPE)

    last_reading = frappe.db.get_value(
        DISTRIBUTION_DOCTYPE,
        filters,
        "vehicle_reading_km",
        order_by="fd_date desc, creation desc",
    )

    return {
        "last_reading_km": flt(last_reading or 0)
    }


@frappe.whitelist()
def create_and_submit_fuel_distribution(data):
    _require_fuel_distribution_access()
    data = _parse_json(data)

    issued_qty = _positive_float(data, "issued_quantity_ltr", "Issued Quantity (Ltr)")
    remark = _required(data, "custom_remark", "Remark")

    reading_status = data.get("reading_status") or "Working"
    company = _required(data, "company", "Company")
    _validate_company_exists(company)
    _validate_jain_company_for_town_project(company)
    town_project = _required(data, "fd_town_project", "Town / Project Name")
    town_project = _validate_jain_town_project(town_project)
    _require_town_access(town_project, DISTRIBUTION_DOCTYPE)
    warehouse = _resolve_transaction_warehouse(
        company,
        town_project,
        DISTRIBUTION_DOCTYPE,
        data.get("warehouse"),
    )
    vehicle = _required(data, "fd_vehicle_name", "Vehicle Name")
    _validate_vehicle_exists(vehicle)
    current_reading_value = data.get("vehicle_reading_km")
    current_reading = 0
    submitted_last_reading = flt(data.get("last_reading_km") or 0)

    reading_filters = {
        "fd_vehicle_name": vehicle,
        "docstatus": ["<", 2],
        "fd_town_project": town_project,
    }
    actual_last_reading = frappe.db.get_value(
        DISTRIBUTION_DOCTYPE,
        reading_filters,
        "vehicle_reading_km",
        order_by="fd_date desc, creation desc",
    )
    actual_last_reading = flt(actual_last_reading or 0)

    # Compare against the greater of the DB-derived last reading and the last
    # reading shown on the form, so a stale/zero value on either side cannot let a
    # lower (or equal) reading through. New reading must be STRICTLY greater.
    effective_last_reading = max(actual_last_reading, submitted_last_reading)

    if reading_status == "Working":
        if current_reading_value is None or str(current_reading_value).strip() == "":
            _public_error(
                "Current Reading (KM) is required when Reading Status is Working.",
                "Missing information",
            )
        try:
            current_reading = flt(float(current_reading_value))
        except (TypeError, ValueError):
            _public_error("Current Reading (KM) must be a non-negative number.", "Invalid reading")
        if current_reading < 0:
            _public_error("Current Reading (KM) must be a non-negative number.", "Invalid reading")
        if current_reading <= effective_last_reading:
            _public_error("Current Reading (KM) must be greater than Last Reading (KM).", "Invalid reading")

    # Distribution attachments are OPTIONAL server-side so the mobile view (which has
    # no attachment field) can submit without them. Desktop still requires both via its
    # own client-side validation, so desktop behaviour is unchanged.
    vehicle_reading_attachment, vehicle_reading_file = _optional_attachment(
        data,
        "custom_attachment",
    )
    additional_vehicle_reading_attachment, additional_vehicle_reading_file = _optional_attachment(
        data,
        "custom_additional_vehicle_reading",
    )
    stock = get_fuel_distribution_stock(town_project, company=company)

    payload = {
        "doctype": DISTRIBUTION_DOCTYPE,
        "fd_date": _required(data, "fd_date", "Date"),
        "fd_town_project": town_project,
        "available_stock_ltr": stock.get("available_stock_ltr"),
        "fd_petrol_in_stock": stock.get("fd_petrol_in_stock"),
        "fd_vehicle_name": vehicle,
        "reading_status": reading_status,
        "vehicle_reading_km": current_reading,
        "last_reading_km": actual_last_reading,
        "company": company,
        "warehouse": warehouse,
        "fd_fuel_type": _required(data, "fd_fuel_type", "Fuel Type"),
        "issued_quantity_ltr": issued_qty,
        "custom_remark": remark,
        "custom_attachment": vehicle_reading_attachment,
        "custom_additional_vehicle_reading": additional_vehicle_reading_attachment,
        "supplier_name": data.get("supplier_name") or INTERNAL_DISTRIBUTION_SUPPLIER,
    }

    if not frappe.has_permission(DISTRIBUTION_DOCTYPE, "create"):
        frappe.throw(_("Not permitted to create Fuel Distribution."), frappe.PermissionError)
    if not frappe.has_permission(DISTRIBUTION_DOCTYPE, "submit"):
        frappe.throw(_("Not permitted to submit Fuel Distribution."), frappe.PermissionError)

    try:
        distribution = frappe.get_doc(payload)
        distribution.insert()
        distribution.submit()
        distribution.reload()
        if vehicle_reading_file:
            _attach_uploaded_file(vehicle_reading_file, DISTRIBUTION_DOCTYPE, distribution.name, "custom_attachment")
        if additional_vehicle_reading_file:
            _attach_uploaded_file(
                additional_vehicle_reading_file,
                DISTRIBUTION_DOCTYPE,
                distribution.name,
                "custom_additional_vehicle_reading",
            )
    except (frappe.ValidationError, frappe.PermissionError):
        _log_and_reraise("fuel distribution submit validation")
    except Exception:
        _log_and_throw(
            "fuel distribution submit",
            "Fuel Distribution could not be submitted. Please check town/project stock, vehicle, supplier, warehouse, company, and fuel type, then try again.",
        )

    if reading_status == "Not Working":
        _send_not_applicable_ack_after_commit(distribution.name)

    return {
        "message": f"Fuel Distribution {distribution.name} submitted successfully.",
        "name": distribution.name,
        "docstatus": distribution.docstatus,
        "material_issue": distribution.get("custom_material_issue"),
    }


def _not_applicable_ack_subject(distribution_name):
    return f"Fuel Distribution: Meter Reading Not Working - {distribution_name}"


def _not_applicable_ack_already_queued(distribution):
    rows = frappe.get_all(
        "Email Queue",
        filters={
            "reference_doctype": DISTRIBUTION_DOCTYPE,
            "reference_name": distribution.name,
        },
        fields=["name", "message"],
        order_by="creation desc",
        limit_page_length=20,
    )
    subject = _not_applicable_ack_subject(distribution.name)
    return any(_email_subject_from_message(row.get("message")) == subject for row in rows)


def _send_not_applicable_ack_after_commit(distribution_name):
    if not distribution_name:
        return

    def send_after_commit():
        try:
            distribution = frappe.get_doc(DISTRIBUTION_DOCTYPE, distribution_name)
            if distribution.docstatus == 1 and distribution.get("reading_status") == "Not Working":
                _send_not_applicable_ack(distribution, send_now=True)
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"{PAGE_TITLE}: not-applicable ack email after commit")

    frappe.db.after_commit.add(send_after_commit)


def _send_not_applicable_ack(distribution, send_now=False):
    """Acknowledgement email when a Fuel Distribution is saved with Reading Status
    = "Not Working". Sent to the two fixed addresses below.

    It is queued with reference_doctype = Fuel Distribution (NOT Purchase Invoice /
    Purchase Receipt), so the gated fuel approval-email routing Server Script - which
    only rewrites recipients for fuel Purchase Invoice/Receipt emails - leaves it
    untouched. It therefore delivers to mgangwaljewipl@gmail.com and
    pinkesh.chouriya@thesvsgroup.org, and is never rewritten by that script.
    """
    try:
        if _not_applicable_ack_already_queued(distribution):
            return

        esc = frappe.utils.escape_html
        vehicle = distribution.get("fd_vehicle_name")
        vehicle_label = frappe.db.get_value("Vehicle Details", vehicle, "vehicle_display_name") or vehicle or "-"
        date_label = _format_date(distribution.get("fd_date")) or "-"
        issued = distribution.get("issued_quantity_ltr")
        issued_label = f"{flt(issued, 2)} Ltr" if issued else "-"
        town_label = distribution.get("town__project") or distribution.get("fd_town_project") or "-"

        detail_rows = [
            ("Entry no", distribution.name),
            ("Vehicle", vehicle_label),
            ("Town / Project", town_label),
            ("Date", date_label),
            ("Issued Quantity", issued_label),
        ]
        detail_html = "".join(
            f'<tr><td style="padding:9px 14px;color:#586273;font-size:13px;border-bottom:1px solid #E7E9EE;">{esc(str(label))}</td>'
            f'<td style="padding:9px 14px;color:#1A2030;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #E7E9EE;">{esc(str(value))}</td></tr>'
            for label, value in detail_rows
        )
        message = (
            '<div style="max-width:520px;margin:0 auto;font-family:\'Segoe UI\',Arial,sans-serif;">'
            '<div style="height:3px;background:linear-gradient(90deg,#5C4DE6,#4F9FD8,#0E9C8B);border-radius:3px 3px 0 0;"></div>'
            '<div style="border:1px solid #E7E9EE;border-top:none;border-radius:0 0 12px 12px;padding:22px 22px 24px;background:#ffffff;">'
            '<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8A93A3;font-weight:600;">Fuel Distribution</div>'
            '<h2 style="margin:6px 0 14px;font-size:18px;color:#1A2030;">Vehicle meter reading update</h2>'
            '<div style="display:inline-block;padding:10px 16px;border-radius:8px;background:rgba(176,116,26,.11);'
            'color:#B0741A;font-weight:700;font-size:15px;letter-spacing:.02em;">Meter Reading: NOT WORKING</div>'
            '<p style="margin:16px 0 12px;color:#586273;font-size:13.5px;line-height:1.6;">'
            "The vehicle's meter reading has been recorded as <strong>Not Working</strong> for the following "
            'fuel distribution entry.</p>'
            '<table style="width:100%;border-collapse:collapse;border:1px solid #E7E9EE;border-radius:8px;overflow:hidden;">'
            f'{detail_html}</table></div></div>'
        )
        recipients = _fuel_email_recipients()
        if not recipients:
            return
        queue_doc = frappe.sendmail(
            recipients=recipients,
            subject=_not_applicable_ack_subject(distribution.name),
            message=message,
            reference_doctype=DISTRIBUTION_DOCTYPE,
            reference_name=distribution.name,
            now=False,
        )
        if send_now and queue_doc:
            queue_doc.send(force_send=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"{PAGE_TITLE}: not-applicable ack email")


def _sort_dashboard_rows(rows):
    return sorted(
        rows,
        key=lambda row: (row.get("date") or "", row.get("modified") or ""),
        reverse=True,
    )


def _merge_dashboard_vehicle_summary(*summary_lists):
    merged = {}
    for summary in summary_lists:
        for item in summary or []:
            key = item.get("vehicle_id") or item.get("name") or "Unassigned vehicle"
            merged.setdefault(
                key,
                {
                    "name": item.get("name") or key,
                    "vehicle_id": item.get("vehicle_id") or "",
                    "quantity": 0,
                    "amount": 0,
                    "entries": 0,
                },
            )
            merged[key]["quantity"] += _as_float(item.get("quantity"))
            merged[key]["amount"] += _as_float(item.get("amount"))
            merged[key]["entries"] += cint(item.get("entries") or 0)
    return sorted(
        merged.values(),
        key=lambda item: item["quantity"],
        reverse=True,
    )


def _get_fuel_distribution_dashboard(filters):
    _require_fuel_distribution_access()
    distribution_filters = [["docstatus", "=", 1]]
    distribution_filters.extend(_date_filters_for_field(filters, "fd_date"))
    _apply_allowed_town_filter(distribution_filters, "fd_town_project", DISTRIBUTION_DOCTYPE)

    distribution_meta = frappe.get_meta(DISTRIBUTION_DOCTYPE)
    has_material_issue = (
        distribution_meta.has_field("custom_material_issue")
        and frappe.db.has_column(DISTRIBUTION_DOCTYPE, "custom_material_issue")
    )

    fields = [
        "name",
        "fd_date",
        "fd_town_project",
        "fd_vehicle_name",
        "reading_status",
        "fd_fuel_type",
        "issued_quantity_ltr",
        "warehouse",
        "company",
        "supplier_name",
        "docstatus",
        "creation",
        "modified",
    ]

    if has_material_issue:
        fields.append("custom_material_issue")
    if distribution_meta.has_field("custom_remark") and frappe.db.has_column(DISTRIBUTION_DOCTYPE, "custom_remark"):
        fields.append("custom_remark")
    if distribution_meta.has_field("custom_attachment") and frappe.db.has_column(DISTRIBUTION_DOCTYPE, "custom_attachment"):
        fields.append("custom_attachment")

    entries = frappe.get_all(
        DISTRIBUTION_DOCTYPE,
        filters=distribution_filters,
        fields=fields,
        order_by="fd_date desc, creation desc",
        limit_page_length=0,
    )

    town_map = _link_display_map(
        "Town At Project",
        [entry.fd_town_project for entry in entries],
        ["display_name", "town_name", "title", "project_town_name"],
    )
    vehicle_map = _link_display_map(
        "Vehicle Details",
        [entry.fd_vehicle_name for entry in entries],
        ["vehicle_display_name"],
    )

    material_issue_by_distribution = {}
    material_issue_names = set()

    for entry in entries:
        material_issue = entry.get("custom_material_issue") if has_material_issue else None
        if material_issue:
            material_issue_by_distribution[entry.name] = material_issue
            material_issue_names.add(material_issue)

    missing_remarks = [
        f"Fuel Distribution: {entry.name}"
        for entry in entries
        if entry.name not in material_issue_by_distribution
    ]

    if missing_remarks:
        fallback_rows = frappe.get_all(
            "Stock Entry",
            filters={
                "remarks": ["in", missing_remarks],
                "stock_entry_type": "Material Issue",
            },
            fields=["name", "remarks", "docstatus"],
            order_by="creation desc",
            limit_page_length=500,
        )

        for row in fallback_rows:
            distribution_name = (row.remarks or "").replace("Fuel Distribution: ", "", 1)
            if distribution_name and distribution_name not in material_issue_by_distribution:
                material_issue_by_distribution[distribution_name] = row.name
                material_issue_names.add(row.name)

    material_issue_status = {}

    if material_issue_names:
        stock_entries = frappe.get_all(
            "Stock Entry",
            filters={"name": ["in", list(material_issue_names)]},
            fields=["name", "docstatus"],
            limit_page_length=500,
        )
        material_issue_status = {
            row.name: row.docstatus
            for row in stock_entries
        }

    fuel_summary = {}
    vehicle_summary = {}
    rows = []
    total_issued_quantity = 0
    petrol_issued_ltr = 0
    diesel_issued_ltr = 0

    for entry in entries:
        issued_qty = _as_float(entry.issued_quantity_ltr)
        total_issued_quantity += issued_qty
        fuel_type = (entry.fd_fuel_type or "").strip().lower()
        if fuel_type == "petrol":
            petrol_issued_ltr += issued_qty
        elif fuel_type == "diesel":
            diesel_issued_ltr += issued_qty

        fuel_key = entry.fd_fuel_type or "Unassigned fuel"
        fuel_summary.setdefault(
            fuel_key,
            {
                "name": fuel_key,
                "quantity": 0,
                "entries": 0,
            },
        )
        fuel_summary[fuel_key]["quantity"] += issued_qty
        fuel_summary[fuel_key]["entries"] += 1

        vehicle_key = entry.fd_vehicle_name or "Unassigned vehicle"
        vehicle_display_name = vehicle_map.get(vehicle_key, vehicle_key)
        vehicle_summary.setdefault(
            vehicle_key,
            {
                "name": vehicle_display_name,
                "vehicle_id": entry.fd_vehicle_name or "",
                "quantity": 0,
                "amount": 0,
                "entries": 0,
            },
        )
        vehicle_summary[vehicle_key]["quantity"] += issued_qty
        vehicle_summary[vehicle_key]["entries"] += 1

        material_issue = material_issue_by_distribution.get(entry.name, "")
        material_issue_docstatus = material_issue_status.get(material_issue)
        rows.append(
            {
                "name": entry.name,
                "entry_type": "Fuel Distribution",
                "entry_label": "Fuel Distribution",
                "date": str(entry.fd_date or ""),
                "date_label": _format_date(entry.fd_date),
                "town_project": town_map.get(entry.fd_town_project, entry.fd_town_project or ""),
                "town_project_label": town_map.get(entry.fd_town_project, entry.fd_town_project or ""),
                "town_project_id": entry.fd_town_project or "",
                "vehicle": vehicle_display_name,
                "vehicle_label": vehicle_display_name,
                "vehicle_id": entry.fd_vehicle_name or "",
                "fuel_type": entry.fd_fuel_type or "",
                "quantity": issued_qty,
                "amount": 0,
                "warehouse": entry.warehouse or "",
                "company": entry.company or "",
                "supplier": entry.supplier_name or "",
                "reading_status": entry.reading_status or "",
                "docstatus": entry.docstatus,
                "purchase_receipt": "",
                "purchase_invoice": "",
                "purchase_invoice_pending": False,
                "purchase_invoice_docstatus": None,
                "material_issue": material_issue,
                "material_issue_status": _docstatus_key(material_issue_docstatus) if material_issue else "",
                "material_issue_status_label": _docstatus_label(material_issue_docstatus) if material_issue else "",
                "remark": entry.get("custom_remark") or "",
                "attachment_file": entry.get("custom_attachment") or "",
                "modified": str(entry.modified or entry.creation or ""),
            }
        )

    return {
        "title": PAGE_TITLE,
        "cards": {
            "total_fuel_distribution": len(entries),
            "total_issued_quantity": total_issued_quantity,
            "petrol_issued_ltr": petrol_issued_ltr,
            "diesel_issued_ltr": diesel_issued_ltr,
            "petrol_issued_quantity": petrol_issued_ltr,
            "diesel_issued_quantity": diesel_issued_ltr,
            "recent_entries": len(entries),
        },
        "rows": rows,
        "recent": rows,
        "fuel_summary": sorted(
            fuel_summary.values(),
            key=lambda item: item["quantity"],
            reverse=True,
        ),
        "vehicle_summary": sorted(
            vehicle_summary.values(),
            key=lambda item: item["quantity"],
            reverse=True,
        ),
    }


@frappe.whitelist()
def get_fuel_inward_direct_distribution_dashboard(filters=None):
    _require_fuel_page_access()
    filters = _parse_json(filters)
    entry_filter = filters.get("entry_type")
    is_inward_direct_report = filters.get("report_scope") == "inward_direct"

    if entry_filter == "Fuel Distribution":
        if not _has_fuel_distribution_access():
            _permission_error("Not permitted to access Fuel Distribution.")
        return _get_fuel_distribution_dashboard(filters)

    frappe_filters = []

    if entry_filter in ("Drum", "Vehicle"):
        frappe_filters.append(["fuel_entry_type", "=", entry_filter])

    frappe_filters.extend(_date_filters(filters))
    _apply_allowed_town_filter(frappe_filters, "fuel_station_town_name", INTERNAL_DOCTYPE)

    hidden_entries = _configured_hidden_fuel_entries()
    if hidden_entries:
        frappe_filters.append(["name", "not in", list(hidden_entries)])

    if filters.get("warehouse"):
        frappe_filters.append(["warehouse", "=", filters.get("warehouse")])

    fuel_filter = filters.get("fuel_type") or filters.get("fuel")
    if fuel_filter:
        frappe_filters.append(["types_of_fuel", "=", fuel_filter])

    internal_meta = frappe.get_meta(INTERNAL_DOCTYPE)

    def has_db_field(fieldname):
        return internal_meta.has_field(fieldname) and frappe.db.has_column(INTERNAL_DOCTYPE, fieldname)

    has_custom_vehicles = has_db_field("custom_vehicles")
    has_purchase_receipt = has_db_field("custom_purchase_receipt")
    has_purchase_invoice = has_db_field("custom_purchase_invoice")
    has_material_issue = has_db_field("custom_material_issue")
    has_invoice_file = has_db_field("upload_invoice__invoice_copy")
    has_proof_file = has_db_field("upload_fuel_station_proof__fuel_station_receipt")
    has_current_reading = has_db_field("custom_current_reading_km")
    has_last_reading = has_db_field("last_reading_km")
    has_petrol_pump = has_db_field("custom_petrol_pump")
    has_remark = has_db_field("custom_remark")
    has_vehicle_reading_file = has_db_field("custom_upload_vehicle_reading")
    has_qr_file = has_db_field("custom_qr_attachment")

    fields = [
        "name",
        "fuel_entry_type",
        "company",
        "warehouse",
        "date",
        "types_of_fuel",
        "fuel_station_town_name",
        "quantity",
        "rateltr_ffs",
        "amount",
        "supplier_name",
        "creation",
        "modified",
    ]

    if has_custom_vehicles:
        fields.insert(2, "custom_vehicles")
    if has_purchase_receipt:
        fields.append("custom_purchase_receipt")
    if has_purchase_invoice:
        fields.append("custom_purchase_invoice")
    if has_material_issue:
        fields.append("custom_material_issue")
    if has_invoice_file:
        fields.append("upload_invoice__invoice_copy")
    if has_proof_file:
        fields.append("upload_fuel_station_proof__fuel_station_receipt")
    if has_current_reading:
        fields.append("custom_current_reading_km")
    if has_last_reading:
        fields.append("last_reading_km")
    if has_petrol_pump:
        fields.append("custom_petrol_pump")
    if has_remark:
        fields.append("custom_remark")
    if has_vehicle_reading_file:
        fields.append("custom_upload_vehicle_reading")
    if has_qr_file:
        fields.append("custom_qr_attachment")

    entries = frappe.get_all(
        INTERNAL_DOCTYPE,
        filters=frappe_filters,
        fields=fields,
        order_by="date desc, creation desc",
        limit_page_length=0,
    )

    invoice_names = [
        entry.get("custom_purchase_invoice")
        for entry in entries
        if entry.get("custom_purchase_invoice")
    ]

    invoice_status_map = {}
    draft_invoices = set()

    if invoice_names:
        invoice_rows = frappe.get_all(
            "Purchase Invoice",
            filters={"name": ["in", invoice_names]},
            fields=["name", "docstatus"],
            limit_page_length=500,
        )

        invoice_status_map = {
            row.name: row.docstatus
            for row in invoice_rows
        }

        draft_invoices = {
            row.name
            for row in invoice_rows
            if row.docstatus == 0
        }

    total_inward = sum(
        _as_float(entry.quantity)
        for entry in entries
        if entry.fuel_entry_type == "Drum"
    )

    total_distribution = sum(
        _as_float(entry.quantity)
        for entry in entries
        if entry.fuel_entry_type == "Vehicle"
    )

    total_amount = sum(_as_float(entry.amount) for entry in entries)

    fuel_summary = {}

    for entry in entries:
        fuel_key = entry.types_of_fuel or "Unassigned fuel"

        fuel_summary.setdefault(
            fuel_key,
            {
                "name": fuel_key,
                "quantity": 0,
                "amount": 0,
                "entries": 0,
            },
        )

        fuel_summary[fuel_key]["quantity"] += _as_float(entry.quantity)
        fuel_summary[fuel_key]["amount"] += _as_float(entry.amount)
        fuel_summary[fuel_key]["entries"] += 1

    vehicle_ids = list({
        entry.get("custom_vehicles")
        for entry in entries
        if has_custom_vehicles and entry.get("custom_vehicles")
    })

    town_project_map = _link_display_map(
        "Town At Project",
        [entry.fuel_station_town_name for entry in entries],
        ["display_name", "town_name", "title", "project_town_name"],
    )

    vehicle_name_map = {}

    if vehicle_ids:
        vehicle_rows = frappe.get_all(
            "Vehicle Details",
            filters={"name": ["in", vehicle_ids]},
            fields=["name", "vehicle_display_name"],
            limit_page_length=500,
        )

        vehicle_name_map = {
            row.name: row.vehicle_display_name or row.name
            for row in vehicle_rows
        }

    vehicle_summary = {}
    rows = []

    for entry in entries:
        purchase_invoice = entry.get("custom_purchase_invoice")
        vehicle_id = entry.get("custom_vehicles") if has_custom_vehicles else ""
        vehicle_name = "-"
        if entry.fuel_entry_type == "Vehicle":
            vehicle_name = vehicle_name_map.get(vehicle_id, vehicle_id) if vehicle_id else "-"
        rows.append(
            {
                "name": entry.name,
                "entry_type": entry.fuel_entry_type,
                "entry_label": _entry_label(entry.fuel_entry_type),
                "vehicle": vehicle_name,
                "vehicle_label": vehicle_name,
                "vehicle_id": vehicle_id or "",
                "company": entry.company or "",
                "warehouse": entry.warehouse or "",
                "date": str(entry.date or ""),
                "date_label": _format_date(entry.date),
                "fuel_type": entry.types_of_fuel or "",
                "town_project": town_project_map.get(entry.fuel_station_town_name, entry.fuel_station_town_name or ""),
                "town_project_label": town_project_map.get(entry.fuel_station_town_name, entry.fuel_station_town_name or ""),
                "town_project_id": entry.fuel_station_town_name or "",
                "quantity": _as_float(entry.quantity),
                "rate": _as_float(entry.rateltr_ffs),
                "amount": _as_float(entry.amount),
                "supplier": entry.supplier_name or "",
                "purchase_receipt": entry.get("custom_purchase_receipt") or "",
                "purchase_invoice": purchase_invoice or "",
                "purchase_invoice_pending": purchase_invoice in draft_invoices,
                "purchase_invoice_docstatus": invoice_status_map.get(purchase_invoice),
                "material_issue": entry.get("custom_material_issue") or "",
                "invoice_file": entry.get("upload_invoice__invoice_copy") or "",
                "fuel_station_proof_file": entry.get("upload_fuel_station_proof__fuel_station_receipt") or "",
                "invoice_copy_url": entry.get("upload_invoice__invoice_copy") or "",
                "fuel_station_proof_url": entry.get("upload_fuel_station_proof__fuel_station_receipt") or "",
                "current_reading_km": entry.get("custom_current_reading_km") or 0,
                "custom_current_reading_km": entry.get("custom_current_reading_km") or 0,
                "last_reading_km": entry.get("last_reading_km") or 0,
                "petrol_pump": entry.get("custom_petrol_pump") or "",
                "remark": entry.get("custom_remark") or "",
                "vehicle_reading_file": entry.get("custom_upload_vehicle_reading") or "",
                "qr_attachment_file": entry.get("custom_qr_attachment") or "",
                "modified": str(entry.modified or entry.creation or ""),
            }
        )

        if vehicle_id:
            vehicle_summary.setdefault(
                vehicle_id,
                {
                    "name": vehicle_name_map.get(vehicle_id, vehicle_id),
                    "vehicle_id": vehicle_id,
                    "quantity": 0,
                    "amount": 0,
                    "entries": 0,
                },
            )
            vehicle_summary[vehicle_id]["quantity"] += _as_float(entry.quantity)
            vehicle_summary[vehicle_id]["amount"] += _as_float(entry.amount)
            vehicle_summary[vehicle_id]["entries"] += 1

    cards = {
        "total_inward": total_inward,
        "total_direct_distribution": total_distribution,
        "current_balance": total_inward - total_distribution,
        "total_purchase_amount": total_amount,
        "pending_invoice_approvals": len(draft_invoices),
        "recent_entries": len(entries),
    }
    dashboard_rows = rows
    dashboard_vehicle_summary = sorted(
        vehicle_summary.values(),
        key=lambda item: item["quantity"],
        reverse=True,
    )

    if entry_filter in (None, "") and not is_inward_direct_report and _has_fuel_distribution_access():
        distribution_dashboard = _get_fuel_distribution_dashboard(filters)
        distribution_cards = distribution_dashboard.get("cards", {})
        dashboard_rows = _sort_dashboard_rows(rows + distribution_dashboard.get("rows", []))
        dashboard_vehicle_summary = _merge_dashboard_vehicle_summary(
            vehicle_summary.values(),
            distribution_dashboard.get("vehicle_summary", []),
        )
        cards["recent_entries"] = len(dashboard_rows)
        for key in (
            "total_fuel_distribution",
            "total_issued_quantity",
            "petrol_issued_ltr",
            "diesel_issued_ltr",
            "petrol_issued_quantity",
            "diesel_issued_quantity",
        ):
            cards[key] = distribution_cards.get(key, 0)

    return {
        "title": PAGE_TITLE,
        "cards": cards,
        "rows": dashboard_rows,
        "recent": dashboard_rows,
        "fuel_summary": sorted(
            fuel_summary.values(),
            key=lambda item: item["quantity"],
            reverse=True,
        ),
        "vehicle_summary": dashboard_vehicle_summary,
    }


@frappe.whitelist()
def get_fuel_distribution_report(filters=None):
    _require_fuel_distribution_access()
    filters = _parse_json(filters)

    distribution_filters = [["docstatus", "=", 1]]
    distribution_filters.extend(_date_filters_for_field(filters, "fd_date"))
    _apply_allowed_town_filter(distribution_filters, "fd_town_project", DISTRIBUTION_DOCTYPE)

    if filters.get("warehouse"):
        distribution_filters.append(["warehouse", "=", filters.get("warehouse")])

    if filters.get("fuel_type"):
        distribution_filters.append(["fd_fuel_type", "=", filters.get("fuel_type")])

    if filters.get("reading_status"):
        distribution_filters.append(["reading_status", "=", filters.get("reading_status")])

    distribution_meta = frappe.get_meta(DISTRIBUTION_DOCTYPE)
    has_material_issue = (
        distribution_meta.has_field("custom_material_issue")
        and frappe.db.has_column(DISTRIBUTION_DOCTYPE, "custom_material_issue")
    )

    fields = [
        "name",
        "fd_date",
        "fd_town_project",
        "fd_vehicle_name",
        "reading_status",
        "fd_fuel_type",
        "issued_quantity_ltr",
        "warehouse",
        "company",
        "supplier_name",
        "docstatus",
        "creation",
        "modified",
    ]

    if has_material_issue:
        fields.append("custom_material_issue")
    if distribution_meta.has_field("custom_remark") and frappe.db.has_column(DISTRIBUTION_DOCTYPE, "custom_remark"):
        fields.append("custom_remark")
    if distribution_meta.has_field("custom_attachment") and frappe.db.has_column(DISTRIBUTION_DOCTYPE, "custom_attachment"):
        fields.append("custom_attachment")

    distribution_entries = frappe.get_all(
        DISTRIBUTION_DOCTYPE,
        filters=distribution_filters,
        fields=fields,
        order_by="fd_date desc, creation desc",
        limit_page_length=500,
    )

    town_map = _link_display_map(
        "Town At Project",
        [entry.fd_town_project for entry in distribution_entries],
        ["display_name", "town_name", "title", "project_town_name"],
    )
    vehicle_map = _link_display_map(
        "Vehicle Details",
        [entry.fd_vehicle_name for entry in distribution_entries],
        ["vehicle_display_name"],
    )

    material_issue_by_distribution = {}
    material_issue_names = set()

    for entry in distribution_entries:
        material_issue = entry.get("custom_material_issue") if has_material_issue else None
        if material_issue:
            material_issue_by_distribution[entry.name] = material_issue
            material_issue_names.add(material_issue)

    missing_remarks = [
        f"Fuel Distribution: {entry.name}"
        for entry in distribution_entries
        if entry.name not in material_issue_by_distribution
    ]

    if missing_remarks:
        fallback_rows = frappe.get_all(
            "Stock Entry",
            filters={
                "remarks": ["in", missing_remarks],
                "stock_entry_type": "Material Issue",
            },
            fields=["name", "remarks", "docstatus"],
            order_by="creation desc",
            limit_page_length=500,
        )

        for row in fallback_rows:
            distribution_name = (row.remarks or "").replace("Fuel Distribution: ", "", 1)
            if distribution_name and distribution_name not in material_issue_by_distribution:
                material_issue_by_distribution[distribution_name] = row.name
                material_issue_names.add(row.name)

    material_issue_status = {}

    if material_issue_names:
        stock_entries = frappe.get_all(
            "Stock Entry",
            filters={"name": ["in", list(material_issue_names)]},
            fields=["name", "docstatus"],
            limit_page_length=500,
        )
        material_issue_status = {
            row.name: row.docstatus
            for row in stock_entries
        }

    rows = []

    for entry in distribution_entries:
        material_issue = material_issue_by_distribution.get(entry.name, "")
        material_issue_docstatus = material_issue_status.get(material_issue)
        rows.append(
            {
                "name": entry.name,
                "entry_type": "Fuel Distribution",
                "entry_label": "Fuel Distribution",
                "date": str(entry.fd_date or ""),
                "date_label": _format_date(entry.fd_date),
                "town_project": town_map.get(entry.fd_town_project, entry.fd_town_project or ""),
                "town_project_label": town_map.get(entry.fd_town_project, entry.fd_town_project or ""),
                "town_project_id": entry.fd_town_project or "",
                "vehicle": vehicle_map.get(entry.fd_vehicle_name, entry.fd_vehicle_name or ""),
                "vehicle_label": vehicle_map.get(entry.fd_vehicle_name, entry.fd_vehicle_name or ""),
                "vehicle_id": entry.fd_vehicle_name or "",
                "reading_status": entry.reading_status or "",
                "fuel_type": entry.fd_fuel_type or "",
                "quantity": _as_float(entry.issued_quantity_ltr),
                "warehouse": entry.warehouse or "",
                "company": entry.company or "",
                "supplier": entry.supplier_name or "",
                "docstatus": entry.docstatus,
                "material_issue": material_issue,
                "material_issue_status": _docstatus_key(material_issue_docstatus) if material_issue else "",
                "material_issue_status_label": _docstatus_label(material_issue_docstatus) if material_issue else "",
                "purchase_receipt": "",
                "purchase_invoice": "",
                "purchase_invoice_pending": False,
                "purchase_invoice_docstatus": None,
                "remark": entry.get("custom_remark") or "",
                "attachment_file": entry.get("custom_attachment") or "",
                "modified": str(entry.modified or entry.creation or ""),
            }
        )

    return {
        "rows": rows,
        "total_records": len(rows),
        "total_quantity": sum(_as_float(row.get("quantity")) for row in rows),
    }


@frappe.whitelist()
def create_fuel_inward_direct_distribution_entry(data):
    _require_fuel_page_access()
    data = _parse_json(data)
    entry_type = _required(data, "fuel_entry_type", "Fuel mode")
    if entry_type not in ("Drum", "Vehicle"):
        _public_error("Please choose a valid fuel mode.", "Invalid information")

    quantity = _positive_float(data, "quantity", "Quantity")
    rate = _positive_float(data, "rateltr_ffs", "Rate")
    company = _required(data, "company", "Company")
    _validate_company_exists(company)
    _validate_jain_company_for_town_project(company)

    town_project = _required(data, "fuel_station_town_name", "Town/Project Name")
    town_project = _validate_jain_town_project(town_project)
    _require_town_access(town_project, INTERNAL_DOCTYPE)
    warehouse = _resolve_transaction_warehouse(
        company,
        town_project,
        INTERNAL_DOCTYPE,
        data.get("warehouse"),
    )
    vehicle = data.get("custom_vehicles")
    if entry_type == "Vehicle" and not vehicle:
        _public_error("Please select Vehicle Name for direct distribution.", "Missing information")
    if entry_type == "Vehicle":
        _validate_vehicle_exists(vehicle)

    direct_reading_status = str(data.get("direct_reading_status") or "Working").strip() or "Working"
    if direct_reading_status not in ("Working", "Not Working"):
        direct_reading_status = "Working"
    if entry_type != "Vehicle":
        direct_reading_status = "Working"

    current_reading = flt(data.get("custom_current_reading_km") or 0)
    submitted_last_reading = flt(data.get("last_reading_km") or 0)

    reading_filters = {
        "fuel_entry_type": "Vehicle",
        "custom_vehicles": vehicle,
        "docstatus": ["<", 2],
        "fuel_station_town_name": town_project,
    }
    actual_last_reading = frappe.db.get_value(
        INTERNAL_DOCTYPE,
        reading_filters,
        "custom_current_reading_km",
        order_by="date desc, creation desc",
    )

    actual_last_reading = flt(actual_last_reading or 0)

    # Compare against the greater of the DB-derived last reading and the last
    # reading shown on the form, so a stale/zero value on either side cannot let a
    # lower (or equal) reading through. New reading must be STRICTLY greater.
    effective_last_reading = max(actual_last_reading, submitted_last_reading)

    if entry_type == "Vehicle":
        if direct_reading_status == "Working":
            if current_reading <= 0:
                _public_error("Please enter Current Reading (KM).", "Missing information")
            if current_reading <= effective_last_reading:
                _public_error(
                    "Current Reading (KM) must be greater than Last Reading (KM).",
                    "Invalid reading"
                )
        else:
            current_reading = effective_last_reading

    last_reading = actual_last_reading

    petrol_pump = _required(data, "custom_petrol_pump", "Petrol Pump")
    if not frappe.db.exists("Petrol Pump", petrol_pump):
        _public_error("Please select a valid Petrol Pump.", "Invalid information")
    remark = _required(data, "custom_remark", "Remark")

    # The chosen Petrol Pump master carries its own linked Supplier. That
    # Supplier drives the generated Purchase Receipt / Purchase Invoice.
    supplier_name = _resolve_pump_supplier(petrol_pump)
    if not supplier_name:
        _public_error(
            "The selected Petrol Pump has no linked Supplier. "
            "Please set a Supplier on the Petrol Pump master.",
            "Missing supplier",
        )

    payload = {
        "doctype": INTERNAL_DOCTYPE,
        "custom_petrol_pump": petrol_pump,
        "custom_remark": remark,
        "fuel_entry_type": entry_type,
        "custom_vehicles": vehicle if entry_type == "Vehicle" else None,
        "custom_current_reading_km": current_reading if entry_type == "Vehicle" else 0,
        "last_reading_km": last_reading if entry_type == "Vehicle" else 0,

        "company": company,
        "warehouse": warehouse,
        "date": _required(data, "date", "Date"),
        "types_of_fuel": _required(data, "types_of_fuel", "Types of Fuel"),
        "fuel_station_town_name": town_project,
        "quantity": quantity,
        "rateltr_ffs": rate,
        "amount": quantity * rate,
        "supplier_name": supplier_name,
        "upload_invoice__invoice_copy": data.get("upload_invoice__invoice_copy"),
        "upload_fuel_station_proof__fuel_station_receipt": _required(
            data,
            "upload_fuel_station_proof__fuel_station_receipt",
            "Upload Fuel Station Proof / Fuel Station Receipt",
        ),
        "custom_upload_vehicle_reading": data.get("custom_upload_vehicle_reading"),
        "custom_qr_attachment": data.get("custom_qr_attachment"),
        "payment_to_be_done": cint(data.get("payment_to_be_done")),
        "upload_payment_image": data.get("upload_payment_image"),
    }

    internal_meta = frappe.get_meta(INTERNAL_DOCTYPE)
    if internal_meta.has_field("direct_reading_status"):
        payload["direct_reading_status"] = direct_reading_status if entry_type == "Vehicle" else ""
    elif internal_meta.has_field("reading_status"):
        payload["reading_status"] = direct_reading_status if entry_type == "Vehicle" else ""

    if not frappe.has_permission(INTERNAL_DOCTYPE, "create"):
        frappe.throw(_("Not permitted to create Fuel for Stock."), frappe.PermissionError)

    if duplicate_doc := _find_recent_duplicate(payload):
        return _success_response(duplicate_doc, entry_type)

    attachment_files = _normalise_fuel_payload_attachments(payload)

    try:
        
        frappe.flags.from_fuel_inward_direct_distribution = True
        
        fuel_doc = frappe.get_doc(payload)
        fuel_doc.insert(ignore_permissions=True)
        if frappe.get_meta(INTERNAL_DOCTYPE).is_submittable:
            fuel_doc.submit()
        fuel_doc.reload()
        fuel_doc.supplier_name = supplier_name

        for fieldname, file_name in attachment_files.items():
            _attach_uploaded_file(file_name, INTERNAL_DOCTYPE, fuel_doc.name, fieldname)

        if not fuel_doc.get("custom_purchase_receipt"):
            purchase_receipt = _create_purchase_receipt(fuel_doc)
            _set_link(fuel_doc, "custom_purchase_receipt", purchase_receipt)
        if not fuel_doc.get("custom_purchase_invoice"):
            purchase_invoice = _create_purchase_invoice(fuel_doc)
            _set_link(fuel_doc, "custom_purchase_invoice", purchase_invoice)
            _notify_invoice_approvers(purchase_invoice, fuel_doc)
            _send_payment_options_email_after_commit(purchase_invoice, fuel_doc.name)
        if entry_type == "Vehicle" and not fuel_doc.get("custom_material_issue"):
            _set_link(fuel_doc, "custom_material_issue", _create_material_issue(fuel_doc))
    except (frappe.ValidationError, frappe.PermissionError):
        _log_and_reraise("create entry validation")
    except Exception:
        _log_and_throw(
            "create entry",
            "The entry could not be saved. Please check item, supplier, warehouse, company, and stock configuration, then try again.",
        )

    return _success_response(fuel_doc, entry_type)

@frappe.whitelist()
def update_fuel_inward_direct_distribution_invoice(entry_name=None, invoice_file=None):
    _require_fuel_page_access()
    entry_name = (entry_name or "").strip()
    invoice_file = (invoice_file or "").strip()
    if not entry_name:
        _public_error("Please select a Fuel Inward & Direct Distribution entry.", "Missing information")
    if not invoice_file:
        _public_error("Upload Invoice / Invoice Copy is required.", "Missing information")

    if not frappe.db.exists(INTERNAL_DOCTYPE, entry_name):
        _public_error("Fuel entry was not found.", "Invalid information")

    fuel_doc = frappe.get_doc(INTERNAL_DOCTYPE, entry_name)
    if fuel_doc.docstatus == 2:
        _public_error("Cancelled fuel entries cannot be updated.", "Invalid status")
    if fuel_doc.get("fuel_entry_type") not in ("Drum", "Vehicle"):
        _public_error("Only Fuel Inward and Direct Distribution entries can be updated here.", "Invalid entry")

    _require_town_access(fuel_doc.get("fuel_station_town_name"), INTERNAL_DOCTYPE)

    invoice_file, file_name = _normalise_uploaded_image(invoice_file, "Invoice / Invoice Copy")

    frappe.db.set_value(
        INTERNAL_DOCTYPE,
        fuel_doc.name,
        "upload_invoice__invoice_copy",
        invoice_file,
        update_modified=True,
    )
    _attach_uploaded_file(file_name, INTERNAL_DOCTYPE, fuel_doc.name, "upload_invoice__invoice_copy")

    return {
        "message": "Invoice / Invoice Copy uploaded successfully.",
        "entry": fuel_doc.name,
        "invoice_file": invoice_file,
    }

@frappe.whitelist()
def delete_fuel_inward_direct_distribution_entry(entry_name=None):
    """Delete one Fuel for Stock row and only its exact generated documents."""
    _require_fuel_delete_access()
    entry_name = (entry_name or "").strip()
    if not entry_name:
        _public_error("Please select a Fuel Inward & Direct Distribution entry.", "Missing information")

    try:
        result = _delete_fuel_inward_direct_distribution_entry(entry_name)
        frappe.db.commit()
        return result
    except Exception:
        frappe.db.rollback()
        raise


def _delete_fuel_inward_direct_distribution_entry(entry_name):
    if not frappe.db.exists(INTERNAL_DOCTYPE, entry_name):
        _public_error("Fuel entry was not found or was already deleted.", "Invalid information")

    fuel_doc = frappe.get_doc(INTERNAL_DOCTYPE, entry_name, for_update=True)
    if fuel_doc.docstatus == 2:
        _public_error("Cancelled fuel entries cannot be deleted from this report.", "Invalid status")
    if fuel_doc.get("fuel_entry_type") not in ("Drum", "Vehicle"):
        _public_error("Only Fuel Inward and Direct Distribution entries can be deleted here.", "Invalid entry")

    linked_docs = _resolve_fuel_delete_documents(fuel_doc)
    results = []
    with _suppress_dux_activity_audit():
        _clear_fuel_delete_links(fuel_doc)
        _clear_linked_fuel_backrefs(fuel_doc, linked_docs)

        delete_targets = _expand_fuel_delete_targets_with_files([(INTERNAL_DOCTYPE, fuel_doc.name)] + linked_docs)
        dux_activity_results = _delete_exact_dux_document_activity_links(delete_targets)
        if dux_activity_results:
            results.extend(dux_activity_results)

        # Dependency order matters for stock: a Material Issue consumes the
        # Purchase Receipt stock, so it must be reversed before the receipt.
        for doctype, name in linked_docs:
            results.append(_cancel_and_delete_generated_doc(doctype, name, allow_delete_skip=False))

        results.append(_cancel_and_delete_generated_doc(INTERNAL_DOCTYPE, fuel_doc.name, allow_delete_skip=False))

    if frappe.db.exists(INTERNAL_DOCTYPE, fuel_doc.name):
        _public_error("Fuel entry {0} still exists after deletion; operation stopped.".format(fuel_doc.name), "Delete failed")

    unsafe_remaining = []
    for doctype, name in linked_docs:
        if frappe.db.exists(doctype, name):
            unsafe_remaining.append(
                {
                    "doctype": doctype,
                    "name": name,
                    "docstatus": frappe.db.get_value(doctype, name, "docstatus"),
                }
            )
    if unsafe_remaining:
        _public_error(
            "Deletion stopped because linked documents remain active: {0}".format(
                ", ".join("{doctype} {name}".format(**row) for row in unsafe_remaining)
            ),
            "Delete failed",
        )

    return {
        "message": "Fuel entry {0} was deleted; linked documents were cancelled/deleted safely.".format(entry_name),
        "entry": entry_name,
        "deleted_documents": results,
    }


def _resolve_fuel_delete_documents(fuel_doc):
    linked = {}
    purchase_receipt = (fuel_doc.get("custom_purchase_receipt") or "").strip()
    purchase_invoice = (fuel_doc.get("custom_purchase_invoice") or "").strip()
    material_issue = (fuel_doc.get("custom_material_issue") or "").strip()

    if purchase_receipt:
        receipt = _load_required_linked_doc("Purchase Receipt", purchase_receipt, fuel_doc.name)
        _verify_purchase_receipt_for_fuel(fuel_doc, receipt)
        linked["Purchase Receipt"] = receipt.name

    if purchase_invoice:
        invoice = _load_required_linked_doc("Purchase Invoice", purchase_invoice, fuel_doc.name)
        _verify_purchase_invoice_for_fuel(fuel_doc, invoice, purchase_receipt)
        linked["Purchase Invoice"] = invoice.name

    if material_issue:
        stock_entry = _load_required_linked_doc("Stock Entry", material_issue, fuel_doc.name)
        _verify_material_issue_for_fuel(fuel_doc, stock_entry)
        linked["Stock Entry"] = stock_entry.name

    return [
        (doctype, linked[doctype])
        for doctype in ("Stock Entry", "Purchase Invoice", "Purchase Receipt")
        if doctype in linked
    ]


@contextmanager
def _suppress_dux_activity_audit():
    """Prevent cancel events from recreating audit rows after cascade commit."""
    flag = "_dux_activity_audit_in_progress"
    previous = bool(getattr(frappe.flags, flag, False))
    setattr(frappe.flags, flag, True)
    try:
        yield
    finally:
        setattr(frappe.flags, flag, previous)


def _load_required_linked_doc(doctype, name, fuel_entry):
    if not frappe.db.exists(doctype, name):
        _public_error(
            "Linked {0} {1} for Fuel entry {2} was not found; deletion stopped.".format(
                doctype, name, fuel_entry
            ),
            "Unsafe linkage",
        )
    return frappe.get_doc(doctype, name, for_update=True)


def _verify_purchase_receipt_for_fuel(fuel_doc, receipt):
    if not receipt.meta.has_field("custom_fuel_stock_ref") or receipt.get("custom_fuel_stock_ref") != fuel_doc.name:
        _public_error(
            "Purchase Receipt {0} is not uniquely linked to Fuel entry {1}; deletion stopped.".format(
                receipt.name, fuel_doc.name
            ),
            "Unsafe linkage",
        )
    _verify_no_other_fuel_entry_uses_link("custom_purchase_receipt", receipt.name, fuel_doc.name)


def _verify_purchase_invoice_for_fuel(fuel_doc, invoice, purchase_receipt):
    ref_fields = ("custom_fuel_stock_ref", "custom_fuel_stock_reference")
    refs = [invoice.get(fieldname) for fieldname in ref_fields if invoice.meta.has_field(fieldname)]
    if fuel_doc.name not in refs:
        _public_error(
            "Purchase Invoice {0} is not uniquely linked to Fuel entry {1}; deletion stopped.".format(
                invoice.name, fuel_doc.name
            ),
            "Unsafe linkage",
        )
    if invoice.meta.has_field("custom_purchase_receipt_id"):
        linked_receipt = invoice.get("custom_purchase_receipt_id")
        if linked_receipt and purchase_receipt and linked_receipt != purchase_receipt:
            _public_error(
                "Purchase Invoice {0} is linked to Purchase Receipt {1}, not {2}; deletion stopped.".format(
                    invoice.name, linked_receipt, purchase_receipt
                ),
                "Unsafe linkage",
            )
    _verify_no_other_fuel_entry_uses_link("custom_purchase_invoice", invoice.name, fuel_doc.name)


def _verify_material_issue_for_fuel(fuel_doc, stock_entry):
    if stock_entry.get("purpose") != "Material Issue" or stock_entry.get("stock_entry_type") != "Material Issue":
        _public_error(
            "Stock Entry {0} is not a Material Issue; deletion stopped.".format(stock_entry.name),
            "Unsafe linkage",
        )
    if stock_entry.items:
        for item in stock_entry.items:
            if item.get("s_warehouse") != fuel_doc.get("warehouse") or item.get("item_code") != fuel_doc.get("types_of_fuel"):
                _public_error(
                    "Material Issue {0} does not match Fuel entry {1}; deletion stopped.".format(
                        stock_entry.name, fuel_doc.name
                    ),
                    "Unsafe linkage",
                )
    _verify_no_other_fuel_entry_uses_link("custom_material_issue", stock_entry.name, fuel_doc.name)


def _verify_no_other_fuel_entry_uses_link(fieldname, linked_name, fuel_entry):
    if not frappe.get_meta(INTERNAL_DOCTYPE).has_field(fieldname):
        _public_error("Fuel entry link field {0} is unavailable; deletion stopped.".format(fieldname), "Unsafe linkage")
    rows = frappe.get_all(
        INTERNAL_DOCTYPE,
        filters={fieldname: linked_name},
        pluck="name",
        limit_page_length=20,
    )
    others = [name for name in rows if name != fuel_entry]
    if others:
        _public_error(
            "Linked document {0} is also used by Fuel entry {1}; deletion stopped.".format(
                linked_name, ", ".join(others)
            ),
            "Unsafe linkage",
        )


def _clear_fuel_delete_links(fuel_doc):
    meta = frappe.get_meta(INTERNAL_DOCTYPE)
    values = {}
    for fieldname in ("custom_purchase_invoice", "custom_material_issue", "custom_purchase_receipt"):
        if meta.has_field(fieldname) and fuel_doc.get(fieldname):
            values[fieldname] = None
    if values:
        frappe.db.set_value(INTERNAL_DOCTYPE, fuel_doc.name, values, update_modified=False)


def _clear_linked_fuel_backrefs(fuel_doc, linked_docs):
    for doctype, name in linked_docs:
        if not frappe.db.exists(doctype, name):
            continue
        doc = frappe.get_doc(doctype, name)
        values = {}
        if doctype == "Purchase Receipt" and doc.meta.has_field("custom_fuel_stock_ref"):
            values["custom_fuel_stock_ref"] = None
        elif doctype == "Purchase Invoice":
            for fieldname in ("custom_fuel_stock_ref", "custom_fuel_stock_reference", "custom_purchase_receipt_id"):
                if doc.meta.has_field(fieldname):
                    values[fieldname] = None
        if values:
            frappe.db.set_value(doctype, name, values, update_modified=False)


def _expand_fuel_delete_targets_with_files(target_docs):
    expanded = []
    seen = set()
    for doctype, name in target_docs:
        if not doctype or not name:
            continue
        key = (doctype, name)
        if key not in seen:
            seen.add(key)
            expanded.append(key)
        if frappe.db.exists("DocType", "File"):
            file_names = frappe.get_all(
                "File",
                filters={"attached_to_doctype": doctype, "attached_to_name": name},
                pluck="name",
                limit_page_length=100,
            )
            for file_name in file_names:
                file_key = ("File", file_name)
                if file_key not in seen:
                    seen.add(file_key)
                    expanded.append(file_key)
    return expanded


def _delete_exact_dux_document_activity_links(target_docs):
    if not frappe.db.exists("DocType", "DUX Document Activity"):
        return []

    meta = frappe.get_meta("DUX Document Activity")
    if not meta.has_field("reference_doctype") or not meta.has_field("reference_name"):
        return []

    deleted = []
    seen = set()
    for doctype, name in target_docs:
        if not doctype or not name:
            continue
        key = (doctype, name)
        if key in seen:
            continue
        seen.add(key)
        activity_names = frappe.get_all(
            "DUX Document Activity",
            filters={"reference_doctype": doctype, "reference_name": name},
            pluck="name",
            limit_page_length=100,
        )
        for activity_name in activity_names:
            frappe.delete_doc("DUX Document Activity", activity_name, ignore_permissions=True)
            deleted.append(
                {
                    "doctype": "DUX Document Activity",
                    "name": activity_name,
                    "reference_doctype": doctype,
                    "reference_name": name,
                    "deleted": not frappe.db.exists("DUX Document Activity", activity_name),
                }
            )
    return deleted


def _cancel_and_delete_generated_doc(doctype, name, allow_delete_skip=False):
    if not frappe.db.exists(doctype, name):
        _public_error("{0} {1} was not found during deletion; operation stopped.".format(doctype, name), "Delete failed")

    doc = frappe.get_doc(doctype, name, for_update=True)
    result = {
        "doctype": doctype,
        "name": name,
        "initial_docstatus": doc.docstatus,
        "cancelled": False,
        "deleted": False,
    }

    try:
        if doc.docstatus == 1:
            if doctype == "Stock Entry":
                _prepare_fuel_material_issue_for_cancel(doc)
            elif doctype == "Purchase Invoice":
                payment_references = _unlink_fuel_purchase_invoice_payments(doc)
                if payment_references:
                    result["unlinked_payment_references"] = payment_references
            doc.flags.ignore_permissions = True
            doc.cancel()
            result["cancelled"] = True
        elif doc.docstatus not in (0, 2):
            _public_error("{0} {1} has unsupported docstatus {2}; deletion stopped.".format(doctype, name, doc.docstatus), "Invalid status")

        post_cancel_dux_activities = _delete_exact_dux_document_activity_links(
            _expand_fuel_delete_targets_with_files([(doctype, name)])
        )
        if post_cancel_dux_activities:
            result["deleted_dux_activities"] = post_cancel_dux_activities

        try:
            # force=True so cancelled accounting vouchers (Stock Entry / Purchase
            # Invoice / Purchase Receipt / Payment Entry) delete even though their
            # cancelled GL / Stock Ledger entries still reference them; on_trash
            # still runs and cleans up those ledger entries.
            frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
            result["deleted"] = not frappe.db.exists(doctype, name)
            return result
        except Exception as exc:
            if allow_delete_skip and result["cancelled"]:
                result["delete_skipped_reason"] = _plain_exception_message(exc)
                result["deleted"] = False
                return result
            raise
    except Exception as exc:
        _public_error(
            "{0} {1} could not be safely cancelled/deleted: {2}".format(
                doctype, name, _plain_exception_message(exc)
            ),
            "Delete blocked",
        )


def _plain_exception_message(exc):
    message = str(exc) or exc.__class__.__name__
    message = re.sub(r"<[^>]+>", "", message)
    return " ".join(message.split())


def _unlink_fuel_purchase_invoice_payments(invoice):
    """Restore allocated advances/payments before cancelling a generated PI."""
    references = frappe.get_all(
        "Payment Entry Reference",
        filters={
            "reference_doctype": "Purchase Invoice",
            "reference_name": invoice.name,
            "docstatus": ["<", 2],
            "allocated_amount": ["!=", 0],
        },
        fields=["parent", "allocated_amount"],
        order_by="creation asc",
        limit_page_length=1000,
    )

    from erpnext.accounts.utils import unlink_ref_doc_from_payment_entries

    unlink_ref_doc_from_payment_entries(invoice)
    return [
        {"payment_entry": row.parent, "allocated_amount": flt(row.allocated_amount, 2)}
        for row in references
    ]

def _prepare_fuel_material_issue_for_cancel(stock_entry):
    # Existing HSC hooks directly read this custom attribute even when the field is absent.
    for fieldname in ("custom_hsc_reference", "custom_hsc_repairing", "custom_concrete_entry", "custom_pour_card", "custom_pour_card_town"):
        if stock_entry.meta.has_field(fieldname) and stock_entry.get(fieldname):
            _public_error(
                "Material Issue {0} has {1} set; deletion stopped to avoid affecting another workflow.".format(
                    stock_entry.name, fieldname
                ),
                "Unsafe dependency",
            )
        if not hasattr(stock_entry, fieldname):
            setattr(stock_entry, fieldname, None)



def _prepare_generated_purchase_receipt(receipt):
    receipt._set_defaults()
    receipt.set_missing_values()
    if receipt.meta.has_field("rejected_warehouse"):
        receipt.rejected_warehouse = None
    for item in receipt.get("items"):
        if item.meta.has_field("rejected_warehouse"):
            item.rejected_warehouse = None

    # Frappe applies user-permission defaults again inside insert(). For Fuel-generated
    # receipts, a user's default Warehouse must not become the Rejected Warehouse.
    receipt._set_defaults = lambda: None

def _create_purchase_receipt(fuel_doc):
    try:
        receipt = frappe.new_doc("Purchase Receipt")
        receipt.supplier = fuel_doc.supplier_name
        receipt.company = fuel_doc.company
        receipt.posting_date = fuel_doc.date
        receipt.set_posting_time = 1
        receipt.append(
            "items",
            {
                "item_code": fuel_doc.types_of_fuel,
                "qty": fuel_doc.quantity,
                "rate": fuel_doc.rateltr_ffs,
                "warehouse": fuel_doc.warehouse,
            },
        )
        if receipt.meta.has_field("custom_fuel_stock_ref"):
            receipt.custom_fuel_stock_ref = fuel_doc.name
        _prepare_generated_purchase_receipt(receipt)
        with _suppress_fuel_purchase_receipt_workflow_email():
            receipt.insert(ignore_permissions=True)
            _submit_purchase_receipt(receipt)
        return receipt.name
    except (frappe.ValidationError, frappe.PermissionError):
        _log_and_reraise("purchase receipt validation")
    except Exception:
        _log_and_throw(
            "purchase receipt",
            "Purchase Receipt could not be created. Please check supplier, item, warehouse, and company defaults.",
        )


def _create_purchase_invoice(fuel_doc):
    try:
        if fuel_doc.get("custom_purchase_invoice"):
            return fuel_doc.get("custom_purchase_invoice")

        for fieldname in ("custom_fuel_stock_ref", "custom_fuel_stock_reference"):
            if frappe.get_meta("Purchase Invoice").has_field(fieldname):
                existing_invoice = frappe.db.get_value(
                    "Purchase Invoice",
                    {fieldname: fuel_doc.name, "docstatus": ["<", 2]},
                    "name",
                    order_by="creation desc",
                )
                if existing_invoice:
                    return existing_invoice

        invoice = frappe.new_doc("Purchase Invoice")
        invoice.supplier = fuel_doc.supplier_name
        invoice.company = fuel_doc.company
        invoice.posting_date = fuel_doc.date
        invoice.set_posting_time = 1
        if invoice.meta.has_field("custom_fuel_stock_ref"):
            invoice.custom_fuel_stock_ref = fuel_doc.name
        if invoice.meta.has_field("custom_fuel_stock_reference"):
            invoice.custom_fuel_stock_reference = fuel_doc.name
        if invoice.meta.has_field("custom_purchase_receipt_id") and fuel_doc.get("custom_purchase_receipt"):
            invoice.custom_purchase_receipt_id = fuel_doc.get("custom_purchase_receipt")
        invoice.append(
            "items",
            {
                "item_code": fuel_doc.types_of_fuel,
                "qty": fuel_doc.quantity,
                "rate": fuel_doc.rateltr_ffs,
            },
        )
        invoice.set_missing_values()
        invoice.insert(ignore_permissions=True)
        return invoice.name

    except (frappe.ValidationError, frappe.PermissionError):
        _log_and_reraise("purchase invoice validation")
    except Exception:
        _log_and_throw(
            "purchase invoice",
            "Purchase Invoice could not be created. Please check supplier, item, payable, tax, and company defaults.",
        )

def _create_material_issue(fuel_doc):
    try:
        stock_entry = frappe.new_doc("Stock Entry")
        stock_entry.stock_entry_type = "Material Issue"
        stock_entry.purpose = "Material Issue"
        stock_entry.company = fuel_doc.company
        stock_entry.posting_date = fuel_doc.date
        stock_entry.set_posting_time = 1
        stock_entry.append(
    "items",
    {
        "item_code": fuel_doc.types_of_fuel,
        "s_warehouse": fuel_doc.warehouse,
        "qty": fuel_doc.quantity,
        "uom": "Litre",
        "stock_uom": "Litre",
        "conversion_factor": 1.0,
        "basic_rate": fuel_doc.rateltr_ffs,
    },
)
        stock_entry.set_missing_values()
        stock_entry.insert(ignore_permissions=True)
        stock_entry.submit()
        return stock_entry.name
    except (frappe.ValidationError, frappe.PermissionError):
        _log_and_reraise("material issue validation")
    except Exception:
        _log_and_throw(
            "material issue",
            "Material Issue could not be created. Please check item stock settings, warehouse balance, and company defaults.",
        )


def _notify_invoice_approvers(purchase_invoice, fuel_doc):
    users = set()
    for role in ACCOUNTS_APPROVAL_ROLES:
        users.update(
            frappe.get_all(
                "Has Role",
                filters={"role": role, "parenttype": "User"},
                pluck="parent",
                limit_page_length=500,
            )
        )
    if not users:
        return

    enabled_users = frappe.get_all(
        "User",
        filters={"name": ["in", list(users)], "enabled": 1},
        pluck="name",
        limit_page_length=500,
    )
    for user in enabled_users:
        if user == "Guest":
            continue
        frappe.get_doc(
            {
                "doctype": "Notification Log",
                "subject": f"{PAGE_TITLE} invoice approval pending",
                "email_content": f"Purchase Invoice {purchase_invoice} is ready for approval.",
                "for_user": user,
                "type": "Alert",
                "document_type": "Purchase Invoice",
                "document_name": purchase_invoice,
                "from_user": frappe.session.user,
            }
        ).insert(ignore_permissions=True)


@frappe.whitelist()
def approve_fuel_inward_direct_distribution_invoice(entry_name=None, purchase_invoice=None):
    roles = set(frappe.get_roles(frappe.session.user))
    if not roles.intersection(set(ACCOUNTS_APPROVAL_ROLES)):
        frappe.throw(_("Only Accounts User or Accounts Manager can approve this invoice."), frappe.PermissionError)

    invoice_name = purchase_invoice
    if not invoice_name and entry_name:
        invoice_name = frappe.db.get_value(INTERNAL_DOCTYPE, entry_name, "custom_purchase_invoice")
    if not invoice_name:
        _public_error("No Purchase Invoice is linked for approval.", "Missing information")

    invoice = frappe.get_doc("Purchase Invoice", invoice_name)
    if invoice.docstatus not in (0, 1):
        _public_error("Only a draft Purchase Invoice can be approved.", "Invalid status")
    already_submitted = invoice.docstatus == 1
    if not already_submitted:
        invoice.submit()
        invoice.reload()

    from vehicle_inhouse.vehicle_inhouse.fuel_approval import (
        PAYMENT_CHOICE_PAY_NOW,
        _get_payment_choice,
        reconcile_invoice_with_available_advance,
    )

    adjustment = {
        "allocated_amount": 0,
        "payment_entries": [],
        "remaining_advance": 0,
        "outstanding_amount": flt(invoice.outstanding_amount, 2),
    }
    if _get_payment_choice(invoice.name) != PAYMENT_CHOICE_PAY_NOW:
        adjustment = reconcile_invoice_with_available_advance(invoice)

    if adjustment["allocated_amount"]:
        message = "Purchase Invoice approved and supplier advance adjusted successfully."
    elif already_submitted:
        message = "Purchase Invoice is already submitted."
    else:
        message = "Purchase Invoice approved and submitted successfully."
    return {
        "message": message,
        "purchase_invoice": invoice.name,
        **adjustment,
    }
