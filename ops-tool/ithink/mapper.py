"""Transform Shopify order webhook payload → iThink shipment dict.

Shopify order payload reference:
  https://shopify.dev/docs/api/admin-rest/2024-01/resources/order
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


def _phone_digits(raw: str | None) -> str:
    if not raw:
        return ""
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    # iThink expects 10-digit Indian mobile; strip +91 country code if present
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 13 and digits.startswith("091"):
        digits = digits[3:]
    return digits


def _format_date(iso: str | None) -> str:
    """Shopify gives ISO 8601 (e.g., '2026-05-16T10:30:00+05:30'). iThink wants DD-MM-YYYY."""
    if not iso:
        return datetime.now().strftime("%d-%m-%Y")
    try:
        # Handle timezone-aware ISO strings
        cleaned = iso.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt.strftime("%d-%m-%Y")
    except (ValueError, TypeError):
        return datetime.now().strftime("%d-%m-%Y")


def _grams_to_kg_string(grams: int | float | None) -> str:
    """Shopify grams → iThink weight (in grams as string per their sample)."""
    if not grams:
        return "500"  # safe default 500g
    return str(int(grams))


def _spec_name(item: dict) -> str:
    """Label-ready product name: "Title | Variant options | Prop: value".

    Appends the variant options (variant_title, e.g. "Premium / With Silver Capping /
    With X-Ray Certificate") and any custom line-item properties (e.g. "Ring Size: 9")
    so iThink and the printed shipping label carry the FULL spec with no manual entry.
    """
    base = str(item.get("title") or item.get("name") or "Product").strip()
    parts = [base]
    variant = str(item.get("variant_title") or "").strip()
    if variant and variant.lower() not in ("default title", "none"):
        parts.append(variant)
    for prop in (item.get("properties") or []):
        if not isinstance(prop, dict):
            continue
        pname = str(prop.get("name") or "").strip()
        pval = str(prop.get("value") or "").strip()
        if pname and pval and not pname.startswith("_"):  # skip Shopify hidden props
            parts.append(f"{pname}: {pval}")
    return " | ".join(parts)[:230]


def _line_discount(item: dict) -> float:
    """Total discount allocated to this line item (all units).

    Order-level coupons (e.g. WELCOME10) are allocated per line in
    discount_allocations[].amount and leave line_item.total_discount = 0, so we sum the
    allocations; fall back to total_discount for purely line-level discounts.
    """
    total = 0.0
    for alloc in (item.get("discount_allocations") or []):
        try:
            total += float(alloc.get("amount") or 0)
        except (TypeError, ValueError):
            continue
    if total == 0.0:
        total = float(item.get("total_discount") or 0)
    return round(total, 2)


def _line_item_to_product(item: dict) -> dict:
    """Shopify line_item → iThink product dict."""
    qty = int(item.get("quantity", 1))
    price = float(item.get("price", 0))
    return {
        "product_name": _spec_name(item),
        "product_sku": str(item.get("sku") or ""),
        "product_quantity": str(qty),
        "product_price": str(price),
        "product_tax_rate": "0",
        "product_hsn_code": str(item.get("hsn_code") or ""),
        "product_discount": str(_line_discount(item)),
    }


def _detect_payment_mode(order: dict) -> tuple[str, float]:
    """Returns (payment_mode, cod_amount).
    iThink expects 'COD' or 'Prepaid'. COD orders need cod_amount; prepaid orders have 0."""
    gateway = (order.get("gateway") or "").lower()
    payment_gateways = [g.lower() for g in order.get("payment_gateway_names", [])]
    all_gateways = [gateway] + payment_gateways

    financial_status = (order.get("financial_status") or "").lower()
    total = float(order.get("total_price") or 0)

    # COD detection: look for "cash on delivery", "cod" in gateway names
    is_cod = any("cash" in g or g == "cod" or "cash on delivery" in g for g in all_gateways)
    # OR: if financial status is "pending" and no payment gateway is captured
    if not is_cod and financial_status == "pending" and not any(g for g in all_gateways if g and g != "manual"):
        is_cod = True

    if is_cod:
        return "COD", total
    return "Prepaid", 0.0


def _aggregate_weight_grams(line_items: list[dict]) -> int:
    total = 0
    for item in line_items:
        per_g = item.get("grams") or 0
        qty = int(item.get("quantity", 1))
        total += int(per_g) * qty
    return total or 500  # default 500g if Shopify has no weight set


_VENDOR_SUB_ORDER_SUFFIX = {
    "astrogems": "A",
    "rome crystal and gemstone": "R",
    "astroaura": "X",
    "unknown": "U",
}


def shopify_order_to_ithink(order: dict, *, default_dimensions: dict | None = None,
                             return_address_id: str = "",
                             vendor: str = "") -> dict:
    """Convert a Shopify order dict (from webhook or Admin API) to ONE iThink shipment dict.
    Caller wraps this in a list inside `client.add_order([shipment])`.

    default_dimensions: {"length": "10", "width": "10", "height": "5"} (cm). iThink requires these.
    return_address_id: warehouse ID for returns (defaults to pickup warehouse from config).
    vendor: canonical vendor name (e.g. "astrogems"). When provided, this shipment is treated as
            a vendor-specific sub-order and gets a sub_order suffix + vendor-only totals.
    """
    if default_dimensions is None:
        default_dimensions = {"length": "10", "width": "10", "height": "5"}

    shipping = order.get("shipping_address") or order.get("billing_address") or {}
    billing = order.get("billing_address") or shipping or {}
    customer = order.get("customer") or {}

    line_items = order.get("line_items") or []
    products = [_line_item_to_product(li) for li in line_items]

    # iThink cross-checks total_amount against the sum of the product lines, then subtracts
    # total_discount. Order-level coupons land in each line's discount_allocations (NOT
    # line_item.total_discount), so we reconcile straight from the product lines instead of
    # mixing full-price products with a post-discount order.total_price (which made the sum
    # disagree and iThink silently reject the order):
    #   total_amount   = pre-discount product sum
    #   total_discount = sum of allocated discounts
    #   cod / net      = product sum - discounts  (AstroAura ships free, so == total_price)
    # This is also correct for vendor sub-orders, where `products` is already vendor-scoped.
    product_sum = round(sum(float(p["product_price"]) * int(p["product_quantity"]) for p in products), 2)
    discount_sum = round(sum(float(p["product_discount"]) for p in products), 2)
    net_collectible = round(product_sum - discount_sum, 2)

    payment_mode, _ = _detect_payment_mode(order)
    total_amount = product_sum
    cod_amount = net_collectible if payment_mode == "COD" else 0.0
    weight_grams = _aggregate_weight_grams(line_items)

    # Customer name fallbacks
    ship_name = (
        f"{shipping.get('first_name', '')} {shipping.get('last_name', '')}".strip()
        or shipping.get("name")
        or f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip()
        or "Customer"
    )
    bill_name = (
        f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip()
        or billing.get("name")
        or ship_name
    )

    ship_phone = _phone_digits(shipping.get("phone") or customer.get("phone") or order.get("phone"))
    bill_phone = _phone_digits(billing.get("phone") or ship_phone)
    email = order.get("email") or customer.get("email") or ""

    same_address = (
        shipping.get("address1") == billing.get("address1")
        and shipping.get("zip") == billing.get("zip")
    )

    base_order_number = (
        str(order.get("name") or order.get("order_number") or order.get("id") or "")
        .lstrip("#")
    )
    if vendor:
        suffix = _VENDOR_SUB_ORDER_SUFFIX.get(vendor.lower(), vendor[:1].upper())
        # Append suffix to the order number so each vendor sub-order is unique in iThink.
        # Leave sub_order empty — iThink concatenates it onto the order number which would duplicate.
        order_number = f"{base_order_number}-{suffix}"
    else:
        order_number = base_order_number

    shipment = {
        "waybill": "",
        "order": order_number,
        "sub_order": "",
        "order_date": _format_date(order.get("created_at")),
        "total_amount": str(total_amount),

        # Shipping
        "name": ship_name,
        "company_name": shipping.get("company") or "",
        "add": shipping.get("address1") or "",
        "add2": shipping.get("address2") or "",
        "add3": "",
        "pin": str(shipping.get("zip") or ""),
        "city": shipping.get("city") or "",
        "state": shipping.get("province") or "",
        "country": shipping.get("country") or "India",
        "phone": ship_phone,
        "alt_phone": ship_phone,
        "email": email,

        # Billing
        "is_billing_same_as_shipping": "yes" if same_address else "no",
        "billing_name": bill_name,
        "billing_company_name": billing.get("company") or "",
        "billing_add": billing.get("address1") or "",
        "billing_add2": billing.get("address2") or "",
        "billing_add3": "",
        "billing_pin": str(billing.get("zip") or ""),
        "billing_city": billing.get("city") or "",
        "billing_state": billing.get("province") or "",
        "billing_country": billing.get("country") or "India",
        "billing_phone": bill_phone,
        "billing_alt_phone": bill_phone,
        "billing_email": email,

        # Products
        "products": products,

        # Package dimensions (cm) + weight (grams)
        "shipment_length": str(default_dimensions["length"]),
        "shipment_width": str(default_dimensions["width"]),
        "shipment_height": str(default_dimensions["height"]),
        "weight": str(weight_grams),

        # Charges (we don't pass any extras — pricing already settled in Shopify)
        "shipping_charges": "0",
        "giftwrap_charges": "0",
        "transaction_charges": "0",
        "total_discount": str(discount_sum),
        "first_attemp_discount": "0",
        "cod_charges": "0",
        "advance_amount": "0",

        # COD vs Prepaid
        "cod_amount": str(cod_amount),
        "payment_mode": payment_mode,

        # Misc
        "reseller_name": "",
        "eway_bill_number": "",
        "gst_number": "",
        "return_address_id": str(return_address_id) if return_address_id else "",
    }
    return shipment
