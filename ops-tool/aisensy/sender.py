"""AiSensy WhatsApp Business API sender.

AiSensy Campaign API endpoint:
  POST https://backend.aisensy.com/campaign/t1/api/v2

Usage:
  client = AiSensyClient()
  client.send_template(
      campaign_name="aura_ai_vendor_new_order",
      destination="918287910923",          # vendor WhatsApp (with country code, no +)
      user_name="Astrogems",                # vendor display name
      template_params=["Astrogems", "#1042-A", "1369...", "Ritu Sharma", ...],
      media_url="https://.../label.pdf",
      media_filename="label_1369010531020.pdf",
  )
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

log = logging.getLogger(__name__)


def _load_env_local():
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_local()


class AiSensyError(Exception):
    pass


@dataclass
class AiSensyClient:
    api_key: str = ""
    base_url: str = "https://backend.aisensy.com/campaign/t1/api/v2"
    source: str = "aura-ai-ops"
    timeout: int = 30

    def __post_init__(self):
        if not self.api_key:
            self.api_key = os.environ.get("AISENSY_API_KEY", "")
        if not self.api_key:
            raise AiSensyError("AISENSY_API_KEY not set in .env.local")

    def send_template(
        self,
        *,
        campaign_name: str,
        destination: str,
        user_name: str,
        template_params: list[str],
        media_url: Optional[str] = None,
        media_filename: Optional[str] = None,
    ) -> dict:
        """Fire an approved WhatsApp template campaign.
        - destination: phone with country code (e.g. '918287910923'), no '+'.
        - template_params: list of string values for {{1}}, {{2}}, ... in order.
        - media_url/media_filename: required only if the template has a DOCUMENT/IMAGE header.
        """
        payload = {
            "apiKey": self.api_key,
            "campaignName": campaign_name,
            "destination": str(destination),
            "userName": user_name,
            "templateParams": [str(p) for p in template_params],
            "source": self.source,
        }
        if media_url:
            payload["media"] = {
                "url": media_url,
                "filename": media_filename or "attachment.pdf",
            }

        try:
            r = requests.post(self.base_url, json=payload, timeout=self.timeout)
        except requests.RequestException as e:
            raise AiSensyError(f"Network error: {e}") from e

        try:
            body = r.json()
        except ValueError:
            raise AiSensyError(f"Non-JSON response ({r.status_code}): {r.text[:300]}")

        if r.status_code >= 400:
            raise AiSensyError(f"HTTP {r.status_code}: {body}")
        if isinstance(body, dict) and body.get("status") == "error":
            raise AiSensyError(body.get("message") or "AiSensy returned error")
        return body


# ============================================================
# High-level helper for our specific use case
# ============================================================
_VENDOR_WHATSAPP_ENV = {
    "astrogems": "VENDOR_ASTROGEMS_WHATSAPP",
    "rome crystal and gemstone": "VENDOR_ROME_WHATSAPP",
}


_VENDOR_DISPLAY = {
    "astrogems": "Astrogems",
    "rome crystal and gemstone": "Ratanshree",
}


def vendor_whatsapp_number(vendor_canon: str) -> str:
    """Look up vendor WhatsApp number from env (e.g. VENDOR_ASTROGEMS_WHATSAPP)."""
    env_var = _VENDOR_WHATSAPP_ENV.get(vendor_canon.lower(), "")
    return os.environ.get(env_var, "") if env_var else ""


def vendor_display_name(vendor_canon: str) -> str:
    return _VENDOR_DISPLAY.get(vendor_canon.lower(), vendor_canon.title())


def _format_items(line_items: list[dict]) -> str:
    parts = []
    for it in line_items:
        title = it.get("title") or it.get("name") or "Item"
        sku = it.get("sku") or ""
        qty = it.get("quantity") or 1
        if sku:
            parts.append(f"{qty}x {title} (SKU: {sku})")
        else:
            parts.append(f"{qty}x {title}")
    return "\n".join(parts) if parts else "—"


def _format_address(shopify_addr: dict) -> str:
    bits = [
        shopify_addr.get("address1"),
        shopify_addr.get("address2"),
        shopify_addr.get("city"),
        shopify_addr.get("province"),
        shopify_addr.get("zip"),
        shopify_addr.get("country"),
    ]
    return ", ".join(b for b in bits if b)


def send_vendor_new_order(
    *,
    vendor_canon: str,
    order_number: str,
    awb: str,
    customer_name: str,
    customer_phone: str,
    shipping_address: dict,
    line_items: list[dict],
    payment_mode: str,
    amount: float,
    label_pdf_url: str,
    confirm_url: Optional[str] = None,
    override_destination: Optional[str] = None,
    campaign_name: Optional[str] = None,
) -> dict:
    """Read AISENSY_VENDOR_CAMPAIGN_NAME from env (defaults to aura_ai_vendor_new_order_1)."""
    if campaign_name is None:
        campaign_name = os.environ.get(
            "AISENSY_VENDOR_CAMPAIGN_NAME", "aura_ai_vendor_new_order_1"
        )
    """High-level: send the 'new order' WhatsApp to a vendor with the iThink label PDF attached.

    override_destination: pass a phone number to test-send to YOUR number instead of the real vendor.
    """
    destination = override_destination or vendor_whatsapp_number(vendor_canon)
    if not destination:
        raise AiSensyError(f"No WhatsApp number configured for vendor: {vendor_canon}")

    vendor_display = vendor_display_name(vendor_canon)
    items_str = _format_items(line_items)
    address_str = _format_address(shipping_address)
    payment_str = (
        f"COD ₹{amount:.0f}" if payment_mode.upper() == "COD" else f"Prepaid ₹{amount:.0f} (paid)"
    )

    # Template params MUST match the {{1}}..{{8}} order in the AiSensy template
    template_params = [
        vendor_display,        # {{1}}
        order_number,          # {{2}}
        str(awb),              # {{3}}
        customer_name,         # {{4}}
        str(customer_phone),   # {{5}}
        address_str,           # {{6}}
        items_str,             # {{7}}
        payment_str,           # {{8}}
    ]
    # If the template has a dynamic URL button ("Confirm Order"), its variable is
    # passed as the next param. The button URL in AiSensy should be configured as
    # the PUBLIC_BASE_URL prefix + this variable carrying ?o=..&v=..&t=..
    if confirm_url:
        template_params.append(confirm_url)

    client = AiSensyClient()
    return client.send_template(
        campaign_name=campaign_name,
        destination=destination,
        user_name=vendor_display,
        template_params=template_params,
        media_url=label_pdf_url,
        media_filename=f"label_{awb}.pdf",
    )
