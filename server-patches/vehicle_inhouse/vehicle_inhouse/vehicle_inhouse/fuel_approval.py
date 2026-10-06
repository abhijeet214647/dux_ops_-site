"""Fuel invoice payment-options approval flow (additive).

Adds a small approver-facing page (served at /fuel-invoice-approval) reached from a
signed magic-link in a dedicated "payment options" email. The page offers two
independent options: "Advance paid already" (submits and reconciles the invoice
against an existing supplier advance) and "Pay Now" (shows the QR the entry
uploaded in `custom_qr_attachment`).

Security: the link carries an HMAC-SHA256 token of the Purchase Invoice name signed
with the site's encryption_key. The page/whitelisted method recompute and constant-time
compare the token, so the link is unguessable and cannot be altered to view another
invoice — no login required. The QR (a private file) is read server-side ONLY after the
token validates and embedded as a data URI, so private files are never browse-exposed.

This module does NOT create invoices, payment entries, journal entries, or touch
the Not-Applicable email or any other screen.
"""

import base64
from email import encoders
from email import message_from_string
from email.policy import SMTP as EMAIL_SMTP_POLICY
import hmac
import hashlib
import mimetypes
import os

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

INTERNAL_DOCTYPE = "Fuel for Stock"
INVOICE_ATTACHMENT_FIELD = "upload_invoice__invoice_copy"
TOWN_PROJECT_FIELD = "fuel_station_town_name"
VEHICLE_FIELDS = ("custom_vehicles", "custom_vehicle_name", "custom_vehicle")
APPROVAL_ROUTE = "/fuel-invoice-approval"
ACCOUNTS_APPROVAL_ROLES = ("Accounts User", "Accounts Manager")
FUEL_EMAIL_RECIPIENTS = ("mgangwaljewipl@gmail.com", "pinkesh.chouriya@thesvsgroup.org")
FUEL_EMAIL_ACCOUNT = "JEW"
FUEL_EMAIL_SENDER = "JEW <jewipl07@gmail.com>"
STORE_FLOAT_FALLBACKS = {
    "Abhijeet - JEWIPL": "Palda",
    "Finished Goods - AIL": "Palda",
}
STORE_FLOAT_COMPANY_FALLBACKS = {
    "ACTIVE INFRASTRUCTURES LIMITED": "Palda",
}
PAYMENT_CHOICE_ADVANCE = "Advance"
PAYMENT_CHOICE_PAY_NOW = "Pay Now"
PAYMENT_CHOICE_MARKERS = {
    PAYMENT_CHOICE_ADVANCE: "fuel-payment-choice:advance",
    PAYMENT_CHOICE_PAY_NOW: "fuel-payment-choice:pay-now",
}
OUTSTANDING_EXCLUDED_INVOICES_FLAG = "fuel_outstanding_excluded_invoices"


def _secret():
    return (frappe.local.conf.get("encryption_key") or frappe.local.conf.get("secret_key") or "") or ""


def _fuel_warehouse_by_town_enabled():
    return cint(frappe.local.conf.get("fuel_warehouse_by_town")) == 1


def _configured_outstanding_excluded_invoices():
    """Legacy/duplicate invoices excluded only from the custom Fuel balance."""
    raw_invoices = frappe.local.conf.get(OUTSTANDING_EXCLUDED_INVOICES_FLAG)
    if not raw_invoices:
        return ()
    if isinstance(raw_invoices, str):
        try:
            raw_invoices = frappe.parse_json(raw_invoices)
        except Exception:
            raw_invoices = [invoice.strip() for invoice in raw_invoices.split(",")]
    if not isinstance(raw_invoices, (list, tuple, set)):
        return ()
    return tuple(
        dict.fromkeys(
            str(invoice).strip()
            for invoice in raw_invoices
            if str(invoice or "").strip()
        )
    )


def approval_token(purchase_invoice):
    """Unguessable per-invoice token, signed with the site secret."""
    msg = ("fuel-invoice-approval:" + str(purchase_invoice or "")).encode()
    return hmac.new(_secret().encode(), msg, hashlib.sha256).hexdigest()


def _token_ok(purchase_invoice, token):
    if not purchase_invoice or not token:
        return False
    return hmac.compare_digest(approval_token(purchase_invoice), str(token))


def _existing_invoice_payment_allocation(purchase_invoice):
    rows = frappe.get_all(
        "Payment Entry Reference",
        filters={
            "reference_doctype": "Purchase Invoice",
            "reference_name": purchase_invoice,
            "docstatus": 1,
        },
        fields=["parent", "allocated_amount"],
        order_by="creation asc",
    )
    return flt(sum(flt(row.allocated_amount) for row in rows)), rows


def _advance_accounts_for_invoice(invoice):
    accounts = [invoice.credit_to]
    default_advance_account = frappe.db.get_value(
        "Company", invoice.company, "default_advance_paid_account"
    )
    if default_advance_account and default_advance_account not in accounts:
        accounts.append(default_advance_account)
    return [account for account in accounts if account]


def _get_oldest_unallocated_supplier_advance(invoice):
    accounts = _advance_accounts_for_invoice(invoice)
    filters = {
        "payment_type": "Pay",
        "party_type": "Supplier",
        "party": invoice.supplier,
        "company": invoice.company,
        "docstatus": 1,
        "unallocated_amount": [">", 0],
    }
    if len(accounts) == 1:
        filters["paid_to"] = accounts[0]
    elif accounts:
        filters["paid_to"] = ["in", accounts]

    advances = frappe.get_all(
        "Payment Entry",
        filters=filters,
        fields=[
            "name",
            "posting_date",
            "paid_amount",
            "unallocated_amount",
            "paid_to",
            "creation",
        ],
        order_by="posting_date asc, creation asc",
        limit_page_length=1,
    )
    return advances[0] if advances else None


def _get_remaining_supplier_advance(invoice):
    currency = invoice.get("currency") or frappe.get_cached_value(
        "Company", invoice.company, "default_currency"
    )
    filters = {
        "payment_type": "Pay",
        "party_type": "Supplier",
        "party": invoice.supplier,
        "company": invoice.company,
        "docstatus": 1,
        "unallocated_amount": [">", 0],
    }
    if currency and frappe.db.has_column("Payment Entry", "paid_to_account_currency"):
        filters["paid_to_account_currency"] = currency

    rows = frappe.get_all(
        "Payment Entry",
        filters=filters,
        fields=["unallocated_amount"],
        limit_page_length=100000,
    )
    return flt(sum(flt(row.unallocated_amount) for row in rows))


def _advance_balance_response(invoice, adjusted_amount=0, previous_advance=None):
    # DISPLAY ONLY: return the NET supplier advance (gross unallocated advance minus
    # the supplier outstanding payable) so the approval page matches the Fuel entry
    # form Current Supplier Advance. Net advance is invariant under invoice/advance
    # reconciliation, so remaining == current net. Reconciliation/accounting is
    # unchanged and still runs on the gross figure elsewhere.
    gross_balance = _get_remaining_supplier_advance(invoice)
    outstanding = _get_supplier_outstanding_payable(invoice)
    net_balance = flt(max(flt(gross_balance) - flt(outstanding), 0), 2)
    return {
        "supplier": invoice.supplier,
        "current_advance": net_balance,
        "remaining_advance": net_balance,
    }


def _get_supplier_outstanding_payable(invoice):
    if not invoice or not invoice.get("supplier") or not invoice.get("company"):
        return 0

    filters = {
        "supplier": invoice.supplier,
        "company": invoice.company,
        "docstatus": 1,
        "outstanding_amount": [">", 0],
    }
    excluded_invoices = _configured_outstanding_excluded_invoices()
    if excluded_invoices:
        filters["name"] = ["not in", list(excluded_invoices)]

    rows = frappe.get_all(
        "Purchase Invoice",
        filters=filters,
        fields=["name", "grand_total", "outstanding_amount"],
        limit_page_length=100000,
    )
    return flt(
        sum(
            max(flt(row.outstanding_amount) - _get_verified_pay_now_settlement(row), 0)
            for row in rows
        ),
        2,
    )


def _get_verified_pay_now_settlement(invoice):
    """Return the PI outstanding covered by a submitted Fuel QR/PCE payment."""
    if _get_payment_choice(invoice.name) != PAYMENT_CHOICE_PAY_NOW:
        return 0

    invoice_doc = frappe.get_doc("Purchase Invoice", invoice.name)
    fuel_doc = _get_linked_fuel_doc(invoice_doc, required=False)
    if not fuel_doc:
        return 0
    pce = _get_existing_fuel_qr_pce(invoice_doc, fuel_doc, docstatus=1)
    if not pce:
        return 0

    outstanding = flt(invoice.outstanding_amount, 2)
    if flt(pce.amount, 2) >= flt(invoice.grand_total, 2):
        return outstanding
    return min(outstanding, flt(pce.amount, 2))


def _payment_choice_from_marker(content):
    for choice, marker in PAYMENT_CHOICE_MARKERS.items():
        if marker in (content or ""):
            return choice
    return None


def _get_payment_choice(purchase_invoice):
    if not purchase_invoice:
        return None
    rows = frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "Purchase Invoice",
            "reference_name": purchase_invoice,
            "comment_type": "Info",
        },
        fields=["content"],
        order_by="creation desc",
        limit_page_length=50,
    )
    for row in rows:
        choice = _payment_choice_from_marker(row.get("content"))
        if choice:
            return choice
    return None


def _assert_payment_choice_available(purchase_invoice, requested_choice):
    existing_choice = _get_payment_choice(purchase_invoice)
    if existing_choice and existing_choice != requested_choice:
        frappe.throw(
            _("Payment option already selected as {0}; {1} is not allowed for this invoice.").format(
                existing_choice, requested_choice
            )
        )
    return existing_choice


def _set_payment_choice(purchase_invoice, choice):
    if choice not in PAYMENT_CHOICE_MARKERS:
        frappe.throw(_("Invalid payment option."))
    existing_choice = _assert_payment_choice_available(purchase_invoice, choice)
    if existing_choice:
        return existing_choice

    frappe.get_doc(
        {
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": "Purchase Invoice",
            "reference_name": purchase_invoice,
            "content": PAYMENT_CHOICE_MARKERS[choice],
        }
    ).insert(ignore_permissions=True)
    return choice


def _submit_purchase_invoice_if_draft(invoice, invalid_message):
    if invoice.docstatus == 0:
        invoice.flags.ignore_permissions = True
        invoice.submit()
        invoice.reload()
    elif invoice.docstatus != 1:
        frappe.throw(invalid_message)
    return invoice


def _is_pdf_message_part(part):
    filename = part.get_filename() or ""
    return part.get_content_type() == "application/pdf" or filename.lower().endswith(".pdf")


def _replace_pdf_message_part(part, pdf_bytes, filename):
    if part.get("Content-Transfer-Encoding"):
        del part["Content-Transfer-Encoding"]
    part.set_payload(pdf_bytes)
    encoders.encode_base64(part)
    part.set_type("application/pdf")
    part.set_param("name", filename, header="Content-Type")
    if part.get("Content-Disposition"):
        part.set_param("filename", filename, header="Content-Disposition")
    else:
        part.add_header("Content-Disposition", "attachment", filename=filename)


def _purchase_invoice_pdf_attachment(invoice):
    print_format = invoice.meta.default_print_format
    lang = invoice.get("language") or (
        frappe.get_cached_value("Print Format", print_format, "default_print_language")
        if print_format
        else None
    )
    return frappe.attach_print(
        "Purchase Invoice",
        invoice.name,
        file_name=invoice.name,
        doc=invoice,
        lang=lang,
        print_format=print_format,
    )


def _refresh_pending_workflow_action_pdfs(invoice):
    """Replace queued workflow PDFs with a freshly rendered submitted invoice print."""
    try:
        invoice.reload()
        if invoice.docstatus != 1:
            return 0

        rows = frappe.get_all(
            "Email Queue",
            filters={
                "reference_doctype": "Purchase Invoice",
                "reference_name": invoice.name,
                "status": ["in", ["Not Sent", "Error"]],
            },
            fields=["name", "message"],
            order_by="creation asc",
            limit_page_length=100,
        )
        if not rows:
            return 0

        expected_subject = "Workflow Action on Purchase Invoice: %s" % invoice.name
        attachment = None
        updated = 0
        for row in rows:
            msg = message_from_string(row.get("message") or "", policy=EMAIL_SMTP_POLICY)
            if msg.get("Subject") != expected_subject:
                continue

            pdf_parts = [part for part in msg.walk() if _is_pdf_message_part(part)]
            if not pdf_parts:
                continue

            if attachment is None:
                attachment = _purchase_invoice_pdf_attachment(invoice)
            filename = attachment.get("fname") or ("%s.pdf" % invoice.name)
            pdf_bytes = attachment.get("fcontent") or b""
            if isinstance(pdf_bytes, str):
                pdf_bytes = pdf_bytes.encode()

            for part in pdf_parts:
                _replace_pdf_message_part(part, pdf_bytes, filename)

            queue_doc = frappe.get_doc("Email Queue", row.name)
            queue_doc.message = msg.as_string(policy=EMAIL_SMTP_POLICY)
            queue_doc.save(ignore_permissions=True)
            updated += 1
        return updated
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Fuel workflow action PDF refresh")
        return 0


def _get_linked_fuel_doc(invoice, required=False):
    """Return the exact Fuel for Stock row linked by the Purchase Invoice."""
    pi_meta = invoice.meta
    for fieldname in ("custom_fuel_stock_ref", "custom_fuel_stock_reference"):
        if pi_meta.has_field(fieldname) and invoice.get(fieldname):
            fuel_name = invoice.get(fieldname)
            if frappe.db.exists(INTERNAL_DOCTYPE, fuel_name):
                fuel_doc = frappe.get_doc(INTERNAL_DOCTYPE, fuel_name)
                if (
                    fuel_doc.meta.has_field("custom_purchase_invoice")
                    and frappe.db.has_column(INTERNAL_DOCTYPE, "custom_purchase_invoice")
                    and fuel_doc.get("custom_purchase_invoice")
                    and fuel_doc.get("custom_purchase_invoice") != invoice.name
                ):
                    frappe.throw(_("Linked Fuel entry does not reference this Purchase Invoice."))
                return fuel_doc

    if frappe.db.has_column(INTERNAL_DOCTYPE, "custom_purchase_invoice"):
        rows = frappe.get_all(
            INTERNAL_DOCTYPE,
            filters={"custom_purchase_invoice": invoice.name},
            fields=["name"],
            order_by="creation asc",
            limit_page_length=2,
        )
        if len(rows) == 1:
            return frappe.get_doc(INTERNAL_DOCTYPE, rows[0].name)
        if len(rows) > 1 and required:
            frappe.throw(
                _("Multiple Fuel entries are linked to Purchase Invoice {0}; cannot choose one.").format(
                    invoice.name
                )
            )

    if required:
        frappe.throw(_("No Fuel entry is linked to Purchase Invoice {0}.").format(invoice.name))
    return None


def _display_link_value(doctype, value):
    value = str(value or "").strip()
    if not value:
        return ""
    if not frappe.db.exists(doctype, value):
        return value

    title = ""
    title_field = frappe.get_meta(doctype).title_field
    if title_field:
        title = (frappe.db.get_value(doctype, value, title_field) or "").strip()
    if title and title != value:
        return "%s (%s)" % (title, value)
    return title or value


def _fuel_entry_context_details(fuel_doc):
    details = {
        "town_project_name": "",
        "vehicle_name": "",
    }
    if not fuel_doc:
        return details

    if fuel_doc.meta.has_field(TOWN_PROJECT_FIELD):
        details["town_project_name"] = _display_link_value(
            "Town At Project",
            fuel_doc.get(TOWN_PROJECT_FIELD),
        )

    for fieldname in VEHICLE_FIELDS:
        if fuel_doc.meta.has_field(fieldname) and fuel_doc.get(fieldname):
            details["vehicle_name"] = _display_link_value(
                "Vehicle Details",
                fuel_doc.get(fieldname),
            )
            break
    return details


def _payment_options_entry_details_html(fuel_doc):
    details = _fuel_entry_context_details(fuel_doc)
    rows = []
    esc = frappe.utils.escape_html
    if details.get("town_project_name"):
        rows.append(
            '<tr><td style="padding:3px 12px 3px 0;color:#8A93A3;font-size:12px;">Town/Project Name</td>'
            '<td style="padding:3px 0;color:#1A2030;font-size:12.5px;font-weight:600;">%s</td></tr>'
            % esc(details["town_project_name"])
        )
    if details.get("vehicle_name"):
        rows.append(
            '<tr><td style="padding:3px 12px 3px 0;color:#8A93A3;font-size:12px;">Vehicle Name</td>'
            '<td style="padding:3px 0;color:#1A2030;font-size:12.5px;font-weight:600;">%s</td></tr>'
            % esc(details["vehicle_name"])
        )
    if not rows:
        return ""
    return (
        '<table role="presentation" cellpadding="0" cellspacing="0" '
        'style="margin:12px 0 2px;border-top:1px solid #E7E9EE;border-bottom:1px solid #E7E9EE;padding:8px 0;">'
        + "".join(rows)
        + "</table>"
    )


def _fuel_amount_info(invoice, fuel_doc):
    amount = flt(fuel_doc.get("amount"))
    invoice_amount = flt(invoice.get("grand_total"))
    mismatch = abs(amount - invoice_amount) > 0.005
    return {
        "fuel_payment_amount": amount,
        "purchase_invoice_amount": invoice_amount,
        "fuel_amount_mismatch": mismatch,
    }


def _fuel_supplier_for_validation(fuel_doc):
    supplier = (fuel_doc.get("supplier_name") or "").strip()
    pump = (fuel_doc.get("custom_petrol_pump") or "").strip()
    if pump and frappe.db.exists("Petrol Pump", pump):
        pump_supplier = (frappe.db.get_value("Petrol Pump", pump, "supplier") or "").strip()
        if pump_supplier:
            if supplier and supplier != pump_supplier:
                frappe.throw(_("Fuel entry supplier does not match its Petrol Pump supplier."))
            supplier = pump_supplier
    return supplier


def _assert_fuel_invoice_identity(invoice, fuel_doc):
    for fieldname in ("custom_fuel_stock_ref", "custom_fuel_stock_reference"):
        if invoice.meta.has_field(fieldname) and invoice.get(fieldname) and invoice.get(fieldname) != fuel_doc.name:
            frappe.throw(_("Purchase Invoice is linked to a different Fuel entry."))

    if (
        fuel_doc.meta.has_field("custom_purchase_invoice")
        and frappe.db.has_column(INTERNAL_DOCTYPE, "custom_purchase_invoice")
        and fuel_doc.get("custom_purchase_invoice")
        and fuel_doc.get("custom_purchase_invoice") != invoice.name
    ):
        frappe.throw(_("Fuel entry is linked to a different Purchase Invoice."))

    fuel_supplier = _fuel_supplier_for_validation(fuel_doc)
    if fuel_supplier and fuel_supplier != invoice.supplier:
        frappe.throw(_("Purchase Invoice supplier does not match the Fuel entry supplier."))

    if fuel_doc.get("company") != invoice.company:
        frappe.throw(_("Purchase Invoice company does not match the Fuel entry company."))

    expected_amount = flt(fuel_doc.get("amount"), 2)
    invoice_amount = flt(invoice.get("grand_total"), 2)
    if abs(expected_amount - invoice_amount) > 0.01:
        frappe.throw(
            _("Purchase Invoice amount {0} does not match Fuel entry amount {1}.").format(
                invoice_amount,
                expected_amount,
            )
        )


def _submit_existing_payable_invoice(invoice):
    fuel_doc = _get_linked_fuel_doc(invoice, required=True)
    _assert_fuel_invoice_identity(invoice, fuel_doc)

    if invoice.docstatus not in (0, 1):
        frappe.throw(_("Only a draft or submitted Purchase Invoice can be processed."))

    already_processed = invoice.docstatus == 1
    if invoice.docstatus == 0:
        invoice = _submit_purchase_invoice_if_draft(
            invoice,
            _("Only a draft or submitted Purchase Invoice can be processed."),
        )
        _refresh_pending_workflow_action_pdfs(invoice)
    else:
        invoice.reload()

    submitted_amount = flt(invoice.get("outstanding_amount") or invoice.get("grand_total"), 2)
    new_outstanding = _get_supplier_outstanding_payable(invoice)
    response = {
        "ok": True,
        "payable_mode": True,
        "message": "Purchase Invoice already submitted." if already_processed else "Purchase Invoice submitted for existing supplier payable.",
        "purchase_invoice": invoice.name,
        "purchase_invoice_docstatus": invoice.docstatus,
        "purchase_invoice_status": "Submitted" if invoice.docstatus == 1 else invoice.status,
        "fuel_entry": fuel_doc.name,
        "supplier": invoice.supplier,
        "submitted_outstanding_amount": submitted_amount,
        "added_amount": submitted_amount,
        "new_outstanding_payable": new_outstanding,
        "current_outstanding_payable": new_outstanding,
        "outstanding_payable": new_outstanding,
        "remaining_advance": 0,
        "already_processed": already_processed,
    }
    response.update(_fuel_amount_info(invoice, fuel_doc))
    return response


def _fuel_qr_payment_client_uuid(invoice, fuel_doc):
    return "fuel-qr-payment:%s:%s" % (fuel_doc.name, invoice.name)


def _get_existing_fuel_qr_pce(invoice, fuel_doc, docstatus=None):
    client_uuid = _fuel_qr_payment_client_uuid(invoice, fuel_doc)
    filters = {"client_uuid": client_uuid}
    if docstatus is not None:
        filters["docstatus"] = docstatus
    name = frappe.db.get_value("Petty Cash Expense", filters, "name")
    return frappe.get_doc("Petty Cash Expense", name) if name else None


def _raise_existing_draft_pce(pce):
    frappe.throw(
        _(
            "A Draft Petty Cash Expense {0} already exists for this QR payment. "
            "It was not submitted or reused automatically; please review it before retrying."
        ).format(pce.name)
    )


def _raise_qr_payment_failure(context):
    frappe.log_error(frappe.get_traceback(), context)
    frappe.throw(
        _(
            "QR payment could not be recorded. The complete operation was rolled back, "
            "so no Draft Petty Cash Expense was left behind. Please try again or contact Accounts."
        )
    )


def _pce_response(pce, invoice, fuel_doc, already_processed=False):
    response = {
        "ok": True,
        "already_processed": already_processed,
        "message": "Payment already recorded." if already_processed else "Payment recorded successfully.",
        "petty_cash_expense": pce.name,
        "petty_cash_docstatus": pce.docstatus,
        "petty_cash_workflow_state": pce.get("workflow_state"),
        "amount": flt(pce.amount),
        "purchase_invoice": invoice.name,
        "purchase_invoice_status": "Submitted" if invoice.docstatus == 1 else invoice.status,
        "purchase_invoice_docstatus": invoice.docstatus,
        "fuel_entry": fuel_doc.name,
    }
    response.update(_fuel_amount_info(invoice, fuel_doc))
    return response


def _no_unique_float_message(store):
    return _(
        "No unique Float mapping was found for Store {0}. Please configure the Store-to-Float mapping."
    ).format(store or "-")


def _get_float_by_name(float_name):
    if not float_name:
        return None
    pc_float = frappe.db.get_value(
        "Petty Cash Float",
        float_name,
        ["name", "site_project", "cost_center", "custodian", "status"],
        as_dict=True,
    )
    if not pc_float:
        frappe.throw(_("Petty Cash Float {0} does not exist.").format(float_name))
    if pc_float.status != "Active":
        frappe.throw(_("Petty Cash Float {0} is not Active.").format(float_name))
    return pc_float


def _get_store_float_fallback(store):
    if not frappe.db.exists("Warehouse", store):
        frappe.throw(_("Store {0} does not exist.").format(store))
    return _get_float_by_name(STORE_FLOAT_FALLBACKS.get(store))


def _get_company_float_fallback(store):
    if not _fuel_warehouse_by_town_enabled():
        return None
    company = frappe.db.get_value("Warehouse", store, "company")
    return _get_float_by_name(STORE_FLOAT_COMPANY_FALLBACKS.get(company))


def _resolve_float_for_store(fuel_doc):
    store = fuel_doc.get("warehouse")
    if not store:
        frappe.throw(_no_unique_float_message(store))

    store_rows = frappe.get_all(
        "Store At Town",
        filters={"store": store},
        fields=["name", "townproject"],
        limit_page_length=2,
    )
    if len(store_rows) == 1 and store_rows[0].townproject:
        site_projects = [store_rows[0].townproject]
        project_name = frappe.db.get_value("Town At Project", store_rows[0].townproject, "project_name")
        if project_name and project_name not in site_projects:
            site_projects.append(project_name)

        filters = {"status": "Active"}
        filters["site_project"] = site_projects[0] if len(site_projects) == 1 else ["in", site_projects]
        floats = frappe.get_all(
            "Petty Cash Float",
            filters=filters,
            fields=["name", "site_project", "cost_center", "custodian"],
            limit_page_length=2,
        )
        if len(floats) == 1:
            return floats[0]
        company_fallback = _get_company_float_fallback(store)
        if company_fallback:
            return company_fallback
        frappe.throw(_no_unique_float_message(store))
    if store_rows:
        # 2+ store mappings, or a mapping without a townproject: fall back to the
        # company-level float before giving up.
        company_fallback = _get_company_float_fallback(store)
        if company_fallback:
            return company_fallback
        frappe.throw(_no_unique_float_message(store))

    fallback_float = _get_store_float_fallback(store)
    if fallback_float:
        return fallback_float
    # No Store At Town mapping at all: last resort is the company-level float
    # (e.g. AIL warehouses -> "Palda"), so a missing town mapping does not hard-fail.
    company_fallback = _get_company_float_fallback(store)
    if company_fallback:
        return company_fallback
    frappe.throw(_no_unique_float_message(store))


def _build_fuel_qr_pce(invoice, fuel_doc, pc_float, amount_info):
    supplier = fuel_doc.get("supplier_name") or fuel_doc.get("custom_petrol_pump") or invoice.supplier
    notes = "Fuel QR payment | Fuel Entry: {0} | Purchase Invoice: {1} | Supplier: {2}".format(
        fuel_doc.name,
        invoice.name,
        supplier,
    )
    if amount_info.get("fuel_amount_mismatch"):
        notes += "\nFuel amount {0} differs from Purchase Invoice total {1}.".format(
            amount_info.get("fuel_payment_amount"),
            amount_info.get("purchase_invoice_amount"),
        )

    pce = frappe.new_doc("Petty Cash Expense")
    pce.client_uuid = _fuel_qr_payment_client_uuid(invoice, fuel_doc)
    pce.float = pc_float.name
    pce.expense_date = nowdate()
    pce.amount = amount_info.get("fuel_payment_amount")
    pce.expense_type = "Fuel"
    pce.vendor_name = supplier
    pce.notes = notes
    if pce.meta.has_field("project") and pc_float.get("site_project"):
        pce.project = pc_float.get("site_project")
    if pce.meta.has_field("cost_center") and pc_float.get("cost_center"):
        pce.cost_center = pc_float.get("cost_center")
    if pce.meta.has_field("custodian") and pc_float.get("custodian"):
        pce.custodian = pc_float.get("custodian")
    pce.flags.ignore_permissions = True
    pce.insert(ignore_permissions=True)
    pce.submit()
    pce.reload()
    return pce


def _build_payment_reconciliation(invoice, payment_entry):
    reconciliation = frappe.get_doc("Payment Reconciliation")
    reconciliation.company = invoice.company
    reconciliation.party_type = "Supplier"
    reconciliation.party = invoice.supplier
    reconciliation.receivable_payable_account = invoice.credit_to
    reconciliation.default_advance_account = frappe.db.get_value(
        "Company", invoice.company, "default_advance_paid_account"
    )
    reconciliation.payment_name = payment_entry.name
    reconciliation.invoice_name = invoice.name
    reconciliation.payment_limit = 1
    reconciliation.invoice_limit = 1
    reconciliation.get_unreconciled_entries()
    return reconciliation


def _reconcile_invoice_with_advance(invoice, payment_entry):
    reconciliation = _build_payment_reconciliation(invoice, payment_entry)
    invoices = [
        row.as_dict()
        for row in reconciliation.get("invoices")
        if row.invoice_type == "Purchase Invoice" and row.invoice_number == invoice.name
    ]
    payments = [
        row.as_dict()
        for row in reconciliation.get("payments")
        if row.reference_type == "Payment Entry"
        and row.reference_name == payment_entry.name
        and flt(row.amount) > 0
    ]

    if not invoices:
        frappe.throw(_("Purchase Invoice is not available for reconciliation."))
    if not payments:
        frappe.throw(_("No unallocated advance balance is available for this supplier."))

    allocated_amount = min(flt(invoices[0].outstanding_amount), flt(payments[0].amount))
    if allocated_amount <= 0:
        return 0

    reconciliation.allocate_entries(frappe._dict({"invoices": invoices, "payments": payments}))
    if not reconciliation.get("allocation"):
        frappe.throw(_("ERPNext did not create a reconciliation allocation."))

    for row in reconciliation.get("allocation"):
        if row.invoice_number == invoice.name and row.reference_name == payment_entry.name:
            row.allocated_amount = allocated_amount
        if flt(row.difference_amount):
            frappe.throw(_("Advance reconciliation would create an exchange difference Journal Entry."))

    reconciliation.reconcile()
    return allocated_amount


def reconcile_invoice_with_available_advance(invoice):
    """Allocate available supplier advances to one submitted invoice.

    Payment Entries are consumed oldest-first and the operation is idempotent:
    an invoice that is already settled or already allocated is left unchanged.
    """
    if isinstance(invoice, str):
        invoice = frappe.get_doc("Purchase Invoice", invoice, for_update=True)
    if invoice.docstatus != 1:
        frappe.throw(_("Only a submitted Purchase Invoice can use supplier advance."))

    invoice.reload()
    allocated_total = 0
    payment_entries = []
    processed = set()

    while flt(invoice.outstanding_amount, 2) > 0:
        advance = _get_oldest_unallocated_supplier_advance(invoice)
        if not advance or advance.name in processed:
            break
        processed.add(advance.name)

        allocated_amount = flt(_reconcile_invoice_with_advance(invoice, advance), 2)
        if allocated_amount <= 0:
            break
        allocated_total += allocated_amount
        payment_entries.append(advance.name)
        invoice.reload()

    return {
        "allocated_amount": flt(allocated_total, 2),
        "payment_entries": payment_entries,
        "remaining_advance": flt(_get_remaining_supplier_advance(invoice), 2),
        "outstanding_amount": flt(invoice.outstanding_amount, 2),
    }


def _read_file_data_uri(file_url):
    """Read a public/private site file from disk and return (data_uri, mime).

    Called only after the token has been validated, so it intentionally bypasses
    per-user file ACLs (the signed link is the authorization).
    """
    if not file_url:
        return None, None
    fname = os.path.basename(str(file_url).split("?")[0])
    if file_url.startswith("/private/files/"):
        path = frappe.get_site_path("private", "files", fname)
    elif file_url.startswith("/files/") or file_url.startswith("/public/files/"):
        path = frappe.get_site_path("public", "files", fname)
    else:
        return None, None
    if not os.path.exists(path):
        return None, None
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as handle:
        data = handle.read()
    return "data:%s;base64,%s" % (mime, base64.b64encode(data).decode()), mime


def get_invoice_approval_context(purchase_invoice, token):
    """Build the context for the approval page. Returns a plain dict."""
    ctx = {
        "valid": False,
        "invoice": purchase_invoice,
        "token": token,
        "supplier": None,
        "advance_ack_processed": False,
        "already_processed": False,
        "current_advance": None,
        "current_advance_display": None,
        "adjusted_amount": None,
        "remaining_advance": None,
        "remaining_advance_display": None,
        "current_outstanding_payable": None,
        "payable_mode": False,
        "payable_submit_processed": False,
        "payable_added_amount": None,
        "payable_new_outstanding": None,
        "pay_select_method": "vehicle_inhouse.vehicle_inhouse.fuel_approval.select_invoice_pay_now",
        "qr_paid_method": "vehicle_inhouse.vehicle_inhouse.fuel_approval.record_invoice_qr_payment",
        "qr_paid_processed": False,
        "petty_cash_expense": None,
        "petty_cash_amount": None,
        "fuel_entry": None,
        "town_project_name": "",
        "vehicle_name": "",
        "fuel_payment_amount": None,
        "purchase_invoice_amount": None,
        "purchase_invoice_docstatus": None,
        "fuel_amount_mismatch": False,
        "fuel_lookup_error": None,
        "qr_data_uri": None,
        "qr_is_video": False,
        "no_qr": True,
        "invoice_copy_data_uri": None,
        "invoice_copy_is_image": False,
        "invoice_copy_is_pdf": False,
        "invoice_copy_filename": "",
        "no_invoice_copy": True,
        "payment_choice": "",
    }
    if not _token_ok(purchase_invoice, token):
        return ctx
    if not frappe.db.exists("Purchase Invoice", purchase_invoice):
        return ctx

    ctx["valid"] = True
    invoice = frappe.get_doc("Purchase Invoice", purchase_invoice)
    ctx["supplier"] = invoice.supplier
    ctx["purchase_invoice_docstatus"] = invoice.docstatus
    ctx["current_advance"] = _get_remaining_supplier_advance(invoice)
    ctx["current_outstanding_payable"] = _get_supplier_outstanding_payable(invoice)
    ctx["payable_mode"] = flt(ctx["current_advance"]) <= 0 and flt(ctx["current_outstanding_payable"]) > 0
    # DISPLAY ONLY: net advance (gross - outstanding) to match the Fuel entry form.
    # payable_mode above intentionally still uses the gross current_advance.
    ctx["current_advance_display"] = flt(max(flt(ctx["current_advance"]) - flt(ctx["current_outstanding_payable"]), 0), 2)
    ctx["remaining_advance_display"] = ctx["current_advance_display"]
    payment_choice = _get_payment_choice(purchase_invoice)
    existing_allocated, existing_refs = _existing_invoice_payment_allocation(purchase_invoice)
    if existing_refs:
        ctx["advance_ack_processed"] = True
        ctx["already_processed"] = True
        ctx["adjusted_amount"] = existing_allocated
        ctx["remaining_advance"] = ctx["current_advance"]
        if not payment_choice:
            payment_choice = PAYMENT_CHOICE_ADVANCE

    try:
        fuel_doc = _get_linked_fuel_doc(invoice)
    except Exception as exc:
        fuel_doc = None
        ctx["fuel_lookup_error"] = str(exc)

    if fuel_doc:
        ctx["fuel_entry"] = fuel_doc.name
        ctx.update(_fuel_entry_context_details(fuel_doc))
        ctx.update(_fuel_amount_info(invoice, fuel_doc))
        existing_pce = _get_existing_fuel_qr_pce(invoice, fuel_doc, docstatus=1)
        if existing_pce:
            ctx["qr_paid_processed"] = True
            ctx["petty_cash_expense"] = existing_pce.name
            ctx["petty_cash_amount"] = flt(existing_pce.amount)
            if not payment_choice:
                payment_choice = PAYMENT_CHOICE_PAY_NOW

        if (
            ctx["payable_mode"]
            and payment_choice == PAYMENT_CHOICE_ADVANCE
            and invoice.docstatus == 1
            and not existing_refs
        ):
            ctx["payable_submit_processed"] = True
            ctx["payable_added_amount"] = flt(
                invoice.get("outstanding_amount") or invoice.get("grand_total"), 2
            )
            ctx["payable_new_outstanding"] = ctx["current_outstanding_payable"]

        qr = fuel_doc.get("custom_qr_attachment") if fuel_doc.meta.has_field("custom_qr_attachment") else None
        if qr:
            data_uri, mime = _read_file_data_uri(qr)
            if data_uri:
                ctx["qr_data_uri"] = data_uri
                ctx["qr_is_video"] = bool(mime and mime.startswith("video/"))
                ctx["no_qr"] = False

        invoice_copy = fuel_doc.get(INVOICE_ATTACHMENT_FIELD) if fuel_doc.meta.has_field(INVOICE_ATTACHMENT_FIELD) else None
        if invoice_copy:
            data_uri, mime = _read_file_data_uri(invoice_copy)
            if data_uri:
                ctx["invoice_copy_data_uri"] = data_uri
                ctx["invoice_copy_is_image"] = bool(mime and mime.startswith("image/"))
                ctx["invoice_copy_is_pdf"] = mime == "application/pdf"
                ctx["invoice_copy_filename"] = os.path.basename(str(invoice_copy).split("?")[0])
                ctx["no_invoice_copy"] = False
    ctx["payment_choice"] = payment_choice or ""
    return ctx


@frappe.whitelist(allow_guest=True)
def select_invoice_pay_now(purchase_invoice=None, token=None):
    """Persist Pay Now selection before showing the QR payment controls."""
    if not _token_ok(purchase_invoice, token):
        frappe.throw(_("Invalid or expired link."), frappe.PermissionError)
    if not frappe.db.exists("Purchase Invoice", purchase_invoice):
        frappe.throw(_("Purchase Invoice not found."))

    try:
        invoice = frappe.get_doc("Purchase Invoice", purchase_invoice, for_update=True)
        if invoice.docstatus not in (0, 1):
            frappe.throw(_("Only a draft or submitted Purchase Invoice can be processed."))
        payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_PAY_NOW)
        frappe.db.commit()
        return {
            "ok": True,
            "purchase_invoice": invoice.name,
            "payment_choice": payment_choice,
        }
    except Exception:
        frappe.db.rollback()
        raise


@frappe.whitelist(allow_guest=True)
def record_invoice_qr_payment(purchase_invoice=None, token=None):
    """Record QR-side payment as one submitted Petty Cash Expense, then submit the PI."""
    if not _token_ok(purchase_invoice, token):
        frappe.throw(_("Invalid or expired link."), frappe.PermissionError)
    if not frappe.db.exists("Purchase Invoice", purchase_invoice):
        frappe.throw(_("Purchase Invoice not found."))

    try:
        invoice = frappe.get_doc("Purchase Invoice", purchase_invoice, for_update=True)
        if invoice.docstatus not in (0, 1):
            frappe.throw(_("Only a draft or submitted Purchase Invoice can be processed."))
        payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_PAY_NOW)

        fuel_doc = _get_linked_fuel_doc(invoice, required=True)
        existing_pce = _get_existing_fuel_qr_pce(invoice, fuel_doc, docstatus=1)
        if existing_pce:
            invoice = _submit_purchase_invoice_if_draft(
                invoice,
                _("Only a draft or submitted Purchase Invoice can be processed."),
            )
            _refresh_pending_workflow_action_pdfs(invoice)
            frappe.db.commit()
            response = _pce_response(existing_pce, invoice, fuel_doc, already_processed=True)
            response["payment_choice"] = payment_choice
            return response
        draft_pce = _get_existing_fuel_qr_pce(invoice, fuel_doc)
        if draft_pce:
            _raise_existing_draft_pce(draft_pce)

        pc_float = _resolve_float_for_store(fuel_doc)
        amount_info = _fuel_amount_info(invoice, fuel_doc)
        pce = _build_fuel_qr_pce(invoice, fuel_doc, pc_float, amount_info)

        invoice = _submit_purchase_invoice_if_draft(
            invoice,
            _("Only a draft or submitted Purchase Invoice can be processed."),
        )

        _refresh_pending_workflow_action_pdfs(invoice)
        frappe.db.commit()
        response = _pce_response(pce, invoice, fuel_doc)
        response["payment_choice"] = payment_choice
        return response
    except frappe.DuplicateEntryError:
        duplicate_traceback = frappe.get_traceback()
        frappe.db.rollback()
        invoice = frappe.get_doc("Purchase Invoice", purchase_invoice, for_update=True)
        fuel_doc = _get_linked_fuel_doc(invoice, required=True)
        existing_pce = _get_existing_fuel_qr_pce(invoice, fuel_doc, docstatus=1)
        if existing_pce:
            try:
                payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_PAY_NOW)
                invoice = _submit_purchase_invoice_if_draft(
                    invoice,
                    _("Only a draft or submitted Purchase Invoice can be processed."),
                )
                _refresh_pending_workflow_action_pdfs(invoice)
                frappe.db.commit()
            except (frappe.ValidationError, frappe.PermissionError):
                frappe.db.rollback()
                frappe.log_error(frappe.get_traceback(), "Fuel QR Petty Cash Expense duplicate recovery")
                raise
            except Exception:
                frappe.db.rollback()
                _raise_qr_payment_failure("Fuel QR Petty Cash Expense duplicate recovery")
            response = _pce_response(existing_pce, invoice, fuel_doc, already_processed=True)
            response["payment_choice"] = payment_choice
            return response
        draft_pce = _get_existing_fuel_qr_pce(invoice, fuel_doc)
        frappe.log_error(duplicate_traceback, "Fuel QR Petty Cash Expense duplicate")
        if draft_pce:
            _raise_existing_draft_pce(draft_pce)
        frappe.throw(
            _(
                "QR payment could not be recorded because another request is still being processed. "
                "Please retry after a moment."
            )
        )
    except (frappe.ValidationError, frappe.PermissionError):
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "Fuel QR Petty Cash Expense validation")
        raise
    except Exception:
        frappe.db.rollback()
        _raise_qr_payment_failure("Fuel QR Petty Cash Expense submission")


@frappe.whitelist(allow_guest=True)
def record_invoice_advance_ack(purchase_invoice=None, token=None):
    """Submit and reconcile a Purchase Invoice against an existing supplier advance."""
    if not _token_ok(purchase_invoice, token):
        frappe.throw(_("Invalid or expired link."), frappe.PermissionError)
    if not frappe.db.exists("Purchase Invoice", purchase_invoice):
        frappe.throw(_("Purchase Invoice not found."))

    invoice = frappe.get_doc("Purchase Invoice", purchase_invoice, for_update=True)
    _assert_payment_choice_available(invoice.name, PAYMENT_CHOICE_ADVANCE)

    existing_allocated, existing_refs = _existing_invoice_payment_allocation(invoice.name)
    current_advance = _get_remaining_supplier_advance(invoice)
    current_outstanding_payable = _get_supplier_outstanding_payable(invoice)
    if flt(current_advance) <= 0 and flt(current_outstanding_payable) > 0 and not existing_refs:
        payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_ADVANCE)
        response = _submit_existing_payable_invoice(invoice)
        response["payment_choice"] = payment_choice
        response["current_advance"] = current_advance
        frappe.db.commit()
        return response

    invoice = _submit_purchase_invoice_if_draft(
        invoice,
        _("Only a draft or submitted Purchase Invoice can be reconciled."),
    )

    existing_allocated, existing_refs = _existing_invoice_payment_allocation(invoice.name)
    if existing_refs:
        balance = _advance_balance_response(invoice)
        payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_ADVANCE)
        _refresh_pending_workflow_action_pdfs(invoice)
        frappe.db.commit()
        return {
            "ok": True,
            "message": "Purchase Invoice already references an advance Payment Entry.",
            "purchase_invoice": invoice.name,
            "allocated_amount": existing_allocated,
            "adjusted_amount": existing_allocated,
            "already_processed": True,
            "payment_choice": payment_choice,
            "payment_entries": [row.parent for row in existing_refs],
            **balance,
        }

    invoice.reload()
    if flt(invoice.outstanding_amount) <= 0:
        balance = _advance_balance_response(invoice)
        payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_ADVANCE)
        _refresh_pending_workflow_action_pdfs(invoice)
        frappe.db.commit()
        return {
            "ok": True,
            "message": "Purchase Invoice is already settled.",
            "purchase_invoice": invoice.name,
            "allocated_amount": 0,
            "adjusted_amount": 0,
            "already_processed": True,
            "payment_choice": payment_choice,
            **balance,
        }

    advance = _get_oldest_unallocated_supplier_advance(invoice)
    if not advance:
        frappe.throw(_("No submitted supplier advance Payment Entry has unallocated balance."))

    allocated_amount = _reconcile_invoice_with_advance(invoice, advance)
    invoice.reload()
    balance = _advance_balance_response(invoice, allocated_amount, current_advance)
    payment_choice = _set_payment_choice(invoice.name, PAYMENT_CHOICE_ADVANCE)
    _refresh_pending_workflow_action_pdfs(invoice)
    frappe.db.commit()
    return {
        "ok": True,
        "message": "Purchase Invoice submitted and reconciled with supplier advance.",
        "purchase_invoice": invoice.name,
        "payment_entry": advance.name,
        "allocated_amount": allocated_amount,
        "adjusted_amount": allocated_amount,
        "already_processed": True,
        "payment_choice": payment_choice,
        **balance,
    }


def _payment_options_recipients():
    # site_config "fuel_email_recipients" (may be []) replaces the JEW addresses on other sites
    configured = frappe.local.conf.get("fuel_email_recipients")
    if configured is None:
        return list(dict.fromkeys(FUEL_EMAIL_RECIPIENTS))
    if isinstance(configured, str):
        configured = configured.split(",")
    return list(dict.fromkeys(str(value).strip() for value in configured if str(value or "").strip()))


def _payment_options_subject(purchase_invoice):
    return "Payment options for Purchase Invoice %s" % purchase_invoice


def _payment_options_marker(fuel_doc):
    fuel_doc_name = getattr(fuel_doc, "name", fuel_doc)
    return "fuel-payment-options:%s" % fuel_doc_name if fuel_doc_name else ""


def _payment_options_email_already_queued(purchase_invoice, fuel_doc=None):
    subject = _payment_options_subject(purchase_invoice)
    marker = _payment_options_marker(fuel_doc)
    rows = frappe.get_all(
        "Email Queue",
        filters={
            "reference_doctype": "Purchase Invoice",
            "reference_name": purchase_invoice,
            "status": ["!=", "Error"],
        },
        fields=["name", "message"],
        order_by="creation desc",
        limit_page_length=50,
    )
    for row in rows:
        has_subject = False
        for line in (row.get("message") or "").splitlines()[:80]:
            if line.lower().startswith("subject:") and line.split(":", 1)[1].strip() == subject:
                has_subject = True
                break
        if not has_subject:
            continue
        if marker:
            if marker in (row.get("message") or ""):
                return True
            continue
        return True
    return False


def _resolve_payment_options_fuel_doc(purchase_invoice, fuel_doc=None):
    resolved_fuel_doc = None
    if getattr(fuel_doc, "doctype", None) == INTERNAL_DOCTYPE:
        resolved_fuel_doc = fuel_doc
    elif fuel_doc and frappe.db.exists(INTERNAL_DOCTYPE, fuel_doc):
        resolved_fuel_doc = frappe.get_doc(INTERNAL_DOCTYPE, fuel_doc)

    invoice = None
    if purchase_invoice and frappe.db.exists("Purchase Invoice", purchase_invoice):
        invoice = frappe.get_doc("Purchase Invoice", purchase_invoice)

    if not resolved_fuel_doc and invoice:
        resolved_fuel_doc = _get_linked_fuel_doc(invoice, required=False)

    if resolved_fuel_doc and invoice:
        linked_fuel_doc = _get_linked_fuel_doc(invoice, required=False)
        if linked_fuel_doc and linked_fuel_doc.name != resolved_fuel_doc.name:
            frappe.throw(
                _("Fuel entry {0} is not linked to Purchase Invoice {1}.").format(
                    resolved_fuel_doc.name,
                    invoice.name,
                )
            )
        if (
            resolved_fuel_doc.meta.has_field("custom_purchase_invoice")
            and frappe.db.has_column(INTERNAL_DOCTYPE, "custom_purchase_invoice")
            and resolved_fuel_doc.get("custom_purchase_invoice")
            and resolved_fuel_doc.get("custom_purchase_invoice") != invoice.name
        ):
            frappe.throw(_("Fuel entry is linked to a different Purchase Invoice."))

    return resolved_fuel_doc


def _file_row_matches_invoice_field(row, fuel_doc):
    attached_doctype = row.get("attached_to_doctype")
    attached_name = row.get("attached_to_name")
    attached_field = row.get("attached_to_field")

    if attached_doctype and attached_doctype != INTERNAL_DOCTYPE:
        return False
    if attached_name and attached_name != fuel_doc.name:
        return False
    if attached_field and attached_field != INVOICE_ATTACHMENT_FIELD:
        return False
    return True


def _payment_options_invoice_attachments(purchase_invoice, fuel_doc=None):
    try:
        fuel_doc = _resolve_payment_options_fuel_doc(purchase_invoice, fuel_doc)
        if not fuel_doc:
            return []
        if not (
            fuel_doc.meta.has_field(INVOICE_ATTACHMENT_FIELD)
            and frappe.db.has_column(INTERNAL_DOCTYPE, INVOICE_ATTACHMENT_FIELD)
        ):
            return []

        file_url = (fuel_doc.get(INVOICE_ATTACHMENT_FIELD) or "").strip()
        if not file_url:
            return []

        file_rows = frappe.get_all(
            "File",
            filters={"file_url": file_url},
            fields=[
                "name",
                "attached_to_doctype",
                "attached_to_name",
                "attached_to_field",
            ],
            order_by="creation desc",
            limit_page_length=20,
        )
        if not file_rows:
            frappe.log_error(
                "Fuel entry {0} has {1} set to {2}, but no matching File record was found.".format(
                    fuel_doc.name,
                    INVOICE_ATTACHMENT_FIELD,
                    file_url,
                ),
                "Fuel invoice email attachment",
            )
            return []

        file_row = next(
            (row for row in file_rows if _file_row_matches_invoice_field(row, fuel_doc)),
            None,
        )
        if not file_row:
            frappe.log_error(
                "Fuel entry {0} has {1} set to {2}, but matching File records are attached elsewhere.".format(
                    fuel_doc.name,
                    INVOICE_ATTACHMENT_FIELD,
                    file_url,
                ),
                "Fuel invoice email attachment",
            )
            return []

        file_doc = frappe.get_doc("File", file_row.name)
        file_doc.get_content()
        return [{"fid": file_doc.name}]
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Fuel invoice email attachment")
        return []


def send_payment_options_email(purchase_invoice, fuel_doc=None):
    """Send the Fuel Purchase Invoice payment-options email once per Fuel save."""
    try:
        if not purchase_invoice or _payment_options_email_already_queued(purchase_invoice, fuel_doc):
            return
        from urllib.parse import quote

        recipients = _payment_options_recipients()
        if not recipients:
            return
        marker = _payment_options_marker(fuel_doc)
        token = approval_token(purchase_invoice)
        link = "%s?invoice=%s&token=%s" % (
            frappe.utils.get_url(APPROVAL_ROUTE),
            quote(str(purchase_invoice)),
            token,
        )
        supplier = frappe.db.get_value("Purchase Invoice", purchase_invoice, "supplier") or "-"
        fuel_context_doc = None
        try:
            fuel_context_doc = _resolve_payment_options_fuel_doc(purchase_invoice, fuel_doc)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "Fuel invoice payment-options entry details")
        entry_details_html = _payment_options_entry_details_html(fuel_context_doc)
        attachments = []
        esc = frappe.utils.escape_html
        message = (
            ("<!-- %s -->" % esc(marker) if marker else "")
            + "<div style=\"max-width:520px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;\">"
            '<div style="height:3px;background:linear-gradient(90deg,#5C4DE6,#4F9FD8,#0E9C8B);border-radius:3px 3px 0 0;"></div>'
            '<div style="border:1px solid #E7E9EE;border-top:none;border-radius:0 0 12px 12px;padding:22px 22px 26px;background:#ffffff;">'
            '<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8A93A3;font-weight:600;">Fuel Management</div>'
            '<h2 style="margin:6px 0 4px;font-size:18px;color:#1A2030;">Purchase Invoice payment options</h2>'
            '<p style="margin:10px 0 4px;color:#586273;font-size:13.5px;line-height:1.6;">'
            'Purchase Invoice <strong>%s</strong> (Supplier: %s) is ready for approval. '
            'Open the payment options to view the QR or acknowledge an advance payment.</p>'
            "%s"
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;"><tr><td style="border-radius:10px;background:linear-gradient(150deg,#5C4DE6,#4A3CD0);">'
            '<a href="%s" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">Open payment options</a>'
            '</td></tr></table>'
            '<p style="margin:12px 0 0;color:#8A93A3;font-size:11.5px;line-height:1.5;">This link is unique to this invoice. '
            'If the button does not work, copy this URL into your browser:<br><span style="color:#586273;word-break:break-all;">%s</span></p>'
            '</div></div>'
        ) % (esc(str(purchase_invoice)), esc(str(supplier)), entry_details_html, esc(link), esc(link))

        queue_doc = frappe.sendmail(
            recipients=recipients,
            sender=FUEL_EMAIL_SENDER,
            subject=_payment_options_subject(purchase_invoice),
            message=message,
            reference_doctype="Purchase Invoice",
            reference_name=purchase_invoice,
            now=False,
            delayed=True,
            attachments=attachments,
            add_unsubscribe_link=0,
            add_css=False,
        )
        if queue_doc:
            queue_doc.sender = FUEL_EMAIL_SENDER
            queue_doc.email_account = FUEL_EMAIL_ACCOUNT
            queue_doc.save(ignore_permissions=True)
            queue_doc.send(force_send=True)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "Fuel invoice payment-options email")
