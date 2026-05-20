"""Signed tokens for the vendor 'Confirm Order' URL button.

The AiSensy template's URL button points at:
  {PUBLIC_BASE_URL}/vendor/confirm?o=<order_id>&v=<vendor>&t=<token>

The token is an HMAC of (order_id|vendor) so a vendor can't forge a confirmation
for an arbitrary order, and the link can't be guessed.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path


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


def _secret() -> str:
    # Reuse the Shopify webhook secret if a dedicated one isn't set.
    return (
        os.environ.get("CONFIRM_TOKEN_SECRET")
        or os.environ.get("SHOPIFY_WEBHOOK_SECRET")
        or "aura-ops-dev-secret"
    )


def make_token(order_id: str, vendor: str) -> str:
    msg = f"{order_id}|{vendor}".encode("utf-8")
    return hmac.new(_secret().encode("utf-8"), msg, hashlib.sha256).hexdigest()[:32]


def verify_token(order_id: str, vendor: str, token: str) -> bool:
    if not token:
        return False
    return hmac.compare_digest(make_token(order_id, vendor), token)


def confirm_url(order_id: str, vendor: str) -> str:
    base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    tok = make_token(order_id, vendor)
    return f"{base}/vendor/confirm?o={order_id}&v={vendor}&t={tok}"
