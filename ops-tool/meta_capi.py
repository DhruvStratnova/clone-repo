"""Meta Conversions API (CAPI) — server-side `Purchase` events.

Why server-side: Shopify's checkout & thank-you pages don't run theme code, so a
browser-only Meta Pixel can't reliably fire `Purchase`. We send it from here, on
the paid-order webhook, which is also immune to ad-blockers / iOS tracking limits.

Config (Railway → Variables, or ops-tool/.env.local):
  META_DATASET_ID         Meta dataset (a.k.a. Pixel) ID — events are posted here.
  META_CAPI_ACCESS_TOKEN  Conversions API access token generated for that dataset.
  META_TEST_EVENT_CODE    (optional) shows events under "Test events" while testing.
  META_GRAPH_VERSION      (optional) Graph API version, default v21.0.

Everything degrades gracefully: if it isn't configured, send_purchase() is a
no-op and never raises into the webhook. The browser Pixel and this CAPI event
share the same event_id (the Shopify order id) so Meta de-duplicates them.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime
from pathlib import Path

import requests

log = logging.getLogger("aura-ops.meta_capi")

GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v21.0")


def _load_env_local() -> None:
    """Mirror notify.py — pick up ops-tool/.env.local for local runs."""
    p = Path(__file__).resolve().parent / ".env.local"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_local()


def _dataset_id() -> str:
    return os.environ.get("META_DATASET_ID", "").strip()


def _access_token() -> str:
    return os.environ.get("META_CAPI_ACCESS_TOKEN", "").strip()


def is_ready() -> bool:
    return bool(_dataset_id() and _access_token())


def missing() -> list[str]:
    out = []
    if not _dataset_id():
        out.append("META_DATASET_ID")
    if not _access_token():
        out.append("META_CAPI_ACCESS_TOKEN")
    return out


def _sha256(value) -> str | None:
    """Meta requires PII normalized (trim + lowercase) then SHA-256 hex."""
    if value is None:
        return None
    s = str(value).strip().lower()
    if not s:
        return None
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _hash_phone(value) -> str | None:
    """Phone: keep digits only (country code included, no '+'), then SHA-256."""
    if not value:
        return None
    digits = re.sub(r"\D", "", str(value))
    if not digits:
        return None
    return hashlib.sha256(digits.encode("utf-8")).hexdigest()


def _build_user_data(order: dict) -> dict:
    customer = order.get("customer") or {}
    ship = order.get("shipping_address") or {}
    bill = order.get("billing_address") or {}
    addr = ship or bill

    email = order.get("email") or order.get("contact_email") or customer.get("email")
    phone = (
        order.get("phone")
        or addr.get("phone")
        or customer.get("phone")
    )
    first = customer.get("first_name") or addr.get("first_name")
    last = customer.get("last_name") or addr.get("last_name")

    ud: dict = {}
    if _sha256(email):
        ud["em"] = [_sha256(email)]
    if _hash_phone(phone):
        ud["ph"] = [_hash_phone(phone)]
    if _sha256(first):
        ud["fn"] = [_sha256(first)]
    if _sha256(last):
        ud["ln"] = [_sha256(last)]
    if _sha256(addr.get("city")):
        ud["ct"] = [_sha256(addr.get("city"))]
    if _sha256(addr.get("province_code") or addr.get("province")):
        ud["st"] = [_sha256(addr.get("province_code") or addr.get("province"))]
    if _sha256(addr.get("zip")):
        ud["zp"] = [_sha256(addr.get("zip"))]
    if _sha256(addr.get("country_code") or addr.get("country")):
        ud["country"] = [_sha256(addr.get("country_code") or addr.get("country"))]
    if customer.get("id"):
        ud["external_id"] = [_sha256(customer.get("id"))]

    # Non-hashed signals (improve match quality) — present on Shopify order JSON.
    if order.get("browser_ip"):
        ud["client_ip_address"] = order.get("browser_ip")
    client_details = order.get("client_details") or {}
    if client_details.get("user_agent"):
        ud["client_user_agent"] = client_details.get("user_agent")
    return ud


def _build_custom_data(order: dict) -> dict:
    line_items = order.get("line_items") or []
    contents = []
    num_items = 0
    for li in line_items:
        qty = int(li.get("quantity") or 0)
        num_items += qty
        contents.append({
            "id": str(li.get("variant_id") or li.get("product_id") or ""),
            "quantity": qty,
            "item_price": float(li.get("price") or 0),
        })
    content_ids = [c["id"] for c in contents if c["id"]]

    # Shopify webhook order totals are decimal strings in MAJOR units (e.g. "1234.50").
    try:
        value = float(order.get("total_price") or 0)
    except (TypeError, ValueError):
        value = 0.0

    return {
        "currency": order.get("currency") or "INR",
        "value": value,
        "content_type": "product",
        "content_ids": content_ids,
        "contents": contents,
        "num_items": num_items,
        "order_id": str(order.get("id") or order.get("name") or ""),
    }


def send_purchase(order: dict) -> dict:
    """Send one server-side `Purchase` event for a Shopify order.

    Returns a small status dict; never raises (callers wrap defensively anyway).
    """
    if not is_ready():
        return {"status": "skipped", "reason": "not configured", "missing": missing()}

    order_id = str(order.get("id") or order.get("name") or "")
    event = {
        "event_name": "Purchase",
        # Shopify gives ISO timestamps; Meta wants a unix epoch. Use "now" — the
        # webhook fires within seconds of the order and Meta allows recent times.
        "event_time": int(datetime.utcnow().timestamp()),
        "event_id": order_id,  # dedup key shared with the browser Pixel
        "action_source": "website",
        "user_data": _build_user_data(order),
        "custom_data": _build_custom_data(order),
    }
    if order.get("order_status_url"):
        event["event_source_url"] = order.get("order_status_url")

    payload: dict = {"data": [event]}
    test_code = os.environ.get("META_TEST_EVENT_CODE", "").strip()
    if test_code:
        payload["test_event_code"] = test_code

    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{_dataset_id()}/events"
    try:
        resp = requests.post(
            url,
            params={"access_token": _access_token()},
            json=payload,
            timeout=15,
        )
        ok = resp.status_code == 200
        body = {}
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text[:500]}
        if not ok:
            log.warning("Meta CAPI Purchase non-200 for order %s: %s %s",
                        order_id, resp.status_code, body)
        return {
            "status": "sent" if ok else "error",
            "http_status": resp.status_code,
            "order_id": order_id,
            "events_received": body.get("events_received"),
            "response": body,
        }
    except Exception as exc:
        log.warning("Meta CAPI Purchase request failed for order %s: %s", order_id, exc)
        return {"status": "error", "order_id": order_id, "error": str(exc)}
