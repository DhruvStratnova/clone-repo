"""Vendor → warehouse routing.

Per Dhruv (2026-05-16): "AstroAura" vendor is operationally the same as Ratanshree
(Rome Crystal and Gemstone). All AstroAura-tagged Shopify products dispatch from
Ratanshree's iThink warehouse and the WhatsApp goes to Ratanshree's number.

There are effectively only TWO production vendors:
  - Astrogems                     → warehouse 89803  | WhatsApp 918287910923
  - Rome Crystal and Gemstone     → warehouse 89807  | WhatsApp 919321063566
    (= Ratanshree, = AstroAura)

Staging: only warehouse 1293 exists, so all vendors route to it during testing.
"""
from __future__ import annotations

import os
from typing import Optional


# Canonical vendor name -> env var that holds its production warehouse ID.
_VENDOR_TO_ENV = {
    "astrogems": "ITHINK_PROD_PICKUP_ASTROGEMS",
    "rome crystal and gemstone": "ITHINK_PROD_PICKUP_RATANSHREE",
}


def canonical_vendor(raw: Optional[str]) -> str:
    """Normalize a vendor name. AstroAura/Ratanshree all canonicalize to Rome Crystal."""
    if not raw:
        return ""
    v = raw.strip().lower()
    if "astrogem" in v or "astro gem" in v:
        return "astrogems"
    if (
        "rome crystal" in v
        or "ratanshree" in v
        or "astroaura" in v
        or "astro aura" in v
    ):
        return "rome crystal and gemstone"
    return v


def warehouse_id_for_vendor(vendor: Optional[str], *, fallback: str = "") -> str:
    """Look up the iThink pickup warehouse ID for a vendor.

    In staging (when ITHINK_ENV=staging), always returns the staging warehouse from
    ITHINK_PICKUP_ADDRESS_ID so we don't accidentally try to use prod warehouse IDs.
    """
    env = os.environ.get("ITHINK_ENV", "staging").lower()
    if env != "production":
        # Staging: all vendors share the single staging warehouse
        return os.environ.get("ITHINK_PICKUP_ADDRESS_ID", "") or fallback

    key = canonical_vendor(vendor)
    env_var = _VENDOR_TO_ENV.get(key)
    if env_var:
        wh = os.environ.get(env_var, "").strip()
        if wh:
            return wh
    # Fallback to default pickup if vendor not mapped (e.g. unknown new vendor)
    return os.environ.get("ITHINK_PICKUP_ADDRESS_ID", "") or fallback


def group_line_items_by_vendor(line_items: list[dict]) -> dict[str, list[dict]]:
    """Group Shopify line_items by their canonical vendor name.

    Returns: {canonical_vendor_name: [line_items_for_this_vendor]}

    If a line_item has no vendor, it's bucketed under "unknown" — the caller can
    decide to route it to the default warehouse or flag for manual handling.
    """
    groups: dict[str, list[dict]] = {}
    for item in line_items:
        raw_vendor = item.get("vendor") or ""
        canon = canonical_vendor(raw_vendor) or "unknown"
        groups.setdefault(canon, []).append(item)
    return groups


def split_order_by_vendor(order: dict) -> list[tuple[str, str, dict]]:
    """Split a Shopify order into sub-orders, one per vendor.

    Returns a list of (vendor_canon, warehouse_id, modified_order_dict).
    Each modified_order_dict has only the line_items belonging to that vendor.

    Other order fields (customer, addresses, totals) are kept identical across splits —
    the caller can later adjust totals per sub-order if iThink requires it.
    """
    line_items = order.get("line_items") or []
    if not line_items:
        return []

    groups = group_line_items_by_vendor(line_items)
    out: list[tuple[str, str, dict]] = []
    for vendor_canon, items in groups.items():
        wh = warehouse_id_for_vendor(vendor_canon)
        sub_order = dict(order)
        sub_order["line_items"] = items
        # Recompute subtotal_price for this vendor's portion (so iThink sees the right total per shipment)
        sub_total = sum(float(li.get("price", 0)) * int(li.get("quantity", 1)) for li in items)
        sub_order["_vendor_subtotal"] = sub_total
        out.append((vendor_canon, wh, sub_order))
    return out
