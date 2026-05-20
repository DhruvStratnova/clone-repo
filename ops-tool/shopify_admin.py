"""Shopify Admin API helpers — used to write a durable record onto the order
itself (tags + timeline notes). This survives Railway redeploys (the order in
Shopify is the source of truth) and is visible to ops in the Shopify admin.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import requests

log = logging.getLogger("aura-ops.shopify")


def _load_env_local() -> None:
    env_path = Path(__file__).resolve().parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_local()

_API_VERSION = "2024-10"


def _store() -> str:
    return os.environ.get("SHOPIFY_STORE", "")


def _headers() -> dict:
    return {
        "X-Shopify-Access-Token": os.environ.get("SHOPIFY_ADMIN_TOKEN", ""),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def is_ready() -> bool:
    return bool(_store() and os.environ.get("SHOPIFY_ADMIN_TOKEN"))


def _base() -> str:
    return f"https://{_store()}/admin/api/{_API_VERSION}"


def get_order(order_id: str | int) -> dict:
    r = requests.get(f"{_base()}/orders/{order_id}.json", headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json().get("order", {})


def add_order_tag(order_id: str | int, *tags: str) -> dict:
    """Append tag(s) to an order without dropping existing ones."""
    if not is_ready():
        log.warning("Shopify admin not configured — skipping tag for order %s", order_id)
        return {"skipped": True}
    order = get_order(order_id)
    existing = [t.strip() for t in (order.get("tags") or "").split(",") if t.strip()]
    for t in tags:
        if t and t not in existing:
            existing.append(t)
    r = requests.put(
        f"{_base()}/orders/{order_id}.json",
        headers=_headers(),
        json={"order": {"id": order_id, "tags": ", ".join(existing)}},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def add_order_note(order_id: str | int, note: str, *, append: bool = True) -> dict:
    """Write to the order's Note field (visible in admin). Appends by default."""
    if not is_ready():
        log.warning("Shopify admin not configured — skipping note for order %s", order_id)
        return {"skipped": True}
    new_note = note
    if append:
        order = get_order(order_id)
        prev = (order.get("note") or "").strip()
        new_note = (prev + "\n" + note).strip() if prev else note
    r = requests.put(
        f"{_base()}/orders/{order_id}.json",
        headers=_headers(),
        json={"order": {"id": order_id, "note": new_note}},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def find_unconfirmed_orders(*, pushed_tag: str = "ithink-pushed", confirmed_prefix: str = "vendor-confirmed") -> list[dict]:
    """Orders tagged as pushed to iThink but with no vendor-confirmed tag yet.
    Used by the escalation check. Scans recent open orders (low volume; fine to page once).
    """
    if not is_ready():
        return []
    r = requests.get(
        f"{_base()}/orders.json",
        headers=_headers(),
        params={"status": "any", "limit": 100, "fields": "id,name,tags,created_at"},
        timeout=30,
    )
    r.raise_for_status()
    out = []
    for o in r.json().get("orders", []):
        tags = [t.strip() for t in (o.get("tags") or "").split(",")]
        if pushed_tag in tags and not any(t.startswith(confirmed_prefix) for t in tags):
            out.append(o)
    return out
