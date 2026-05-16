"""Shopify webhook receiver — pushes new orders to iThink Logistics.

Run locally:
  uvicorn shopify_webhook:app --port 8000 --reload

Expose with ngrok / Cloudflare Tunnel for Shopify to reach you:
  ngrok http 8000  →  then register the public URL as a webhook in Shopify admin

Set webhook in Shopify admin:
  Settings → Notifications → Webhooks → Create webhook
    Event: Order creation
    Format: JSON
    URL: <your-public-url>/webhooks/shopify/order-created
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request

from ithink import (
    IThinkClient,
    IThinkConfig,
    shopify_order_to_ithink,
    split_order_by_vendor,
)
from aisensy import send_vendor_new_order

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("aura-ops")

app = FastAPI(title="Aura AI ops — Shopify → iThink bridge")

LOGS_DIR = Path(__file__).resolve().parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)


def _shopify_secret() -> str:
    return os.environ.get("SHOPIFY_WEBHOOK_SECRET", "")


def _verify_shopify_hmac(body: bytes, header_hmac: Optional[str]) -> bool:
    """Shopify signs the raw request body with your webhook secret using HMAC-SHA256, base64-encoded."""
    if not header_hmac:
        return False
    secret = _shopify_secret()
    if not secret:
        log.warning("SHOPIFY_WEBHOOK_SECRET not set — refusing to verify webhook")
        return False
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(computed, header_hmac)


def _log_event(name: str, data: dict) -> Path:
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    path = LOGS_DIR / f"{ts}__{name}.json"
    path.write_text(json.dumps(data, indent=2, default=str))
    return path


@app.get("/")
def root():
    cfg = IThinkConfig.from_env()
    return {
        "service": "Aura AI ops — Shopify → iThink",
        "ithink_ready": cfg.is_ready(),
        "ithink_missing": cfg.missing(),
        "ithink_env": "production" if "my.ithinklogistics" in cfg.base_url else "staging",
        "shopify_webhook_secret_set": bool(_shopify_secret()),
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/webhooks/shopify/order-created")
async def order_created(
    request: Request,
    x_shopify_hmac_sha256: Optional[str] = Header(None, alias="X-Shopify-Hmac-Sha256"),
    x_shopify_topic: Optional[str] = Header(None, alias="X-Shopify-Topic"),
    x_shopify_shop_domain: Optional[str] = Header(None, alias="X-Shopify-Shop-Domain"),
):
    body_bytes = await request.body()

    # HMAC check (skip only if secret not set — useful for first dev, but log a warning)
    if _shopify_secret() and not _verify_shopify_hmac(body_bytes, x_shopify_hmac_sha256):
        log.error("HMAC verification FAILED for webhook from %s", x_shopify_shop_domain)
        raise HTTPException(status_code=401, detail="HMAC verification failed")

    try:
        order = json.loads(body_bytes)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    order_name = order.get("name") or order.get("id") or "<unknown>"
    log.info("Received order webhook: %s (topic=%s)", order_name, x_shopify_topic)
    _log_event(f"shopify_order_{order_name}", order)

    cfg = IThinkConfig.from_env()
    if not cfg.is_ready():
        log.warning("iThink credentials missing — saving order, skipping push. Missing: %s", cfg.missing())
        return {
            "status": "received_but_not_pushed",
            "reason": "iThink credentials missing",
            "missing": cfg.missing(),
            "order": order_name,
        }

    # Split by vendor → one iThink order per vendor (each goes to its own warehouse)
    vendor_groups = split_order_by_vendor(order)
    if not vendor_groups:
        return {"status": "no_line_items", "order": order_name}

    client = IThinkClient(cfg)
    results: list[dict] = []

    for vendor_canon, warehouse_id, sub_order_dict in vendor_groups:
        try:
            shipment = shopify_order_to_ithink(
                sub_order_dict,
                return_address_id=warehouse_id or cfg.return_address_id,
                vendor=vendor_canon,
            )
            _log_event(f"ithink_payload_{order_name}_{vendor_canon}", shipment)

            # Override the pickup_address_id in the call to use vendor-specific warehouse
            payload = {
                "data": {
                    "shipments": [shipment],
                    "pickup_address_id": warehouse_id or cfg.pickup_address_id,
                    "logistics": cfg.default_courier,
                    "s_type": cfg.default_service_type,
                    "order_type": "",
                    "access_token": cfg.access_token,
                    "secret_key": cfg.secret_key,
                }
            }
            response = client._post("/order/add.json", payload)
            _log_event(f"ithink_response_{order_name}_{vendor_canon}", response)
            log.info("iThink order created for %s [vendor=%s, warehouse=%s]: %s",
                     order_name, vendor_canon, warehouse_id, response)

            # Extract AWB from response (response.data is {"1": {"waybill": "..."}, ...})
            awb = ""
            data_dict = response.get("data") or {}
            if isinstance(data_dict, dict):
                for _k, v in data_dict.items():
                    if isinstance(v, dict) and v.get("waybill"):
                        awb = str(v["waybill"])
                        break

            # Fetch label PDF URL from iThink, then fire WhatsApp to vendor
            whatsapp_result = None
            if awb:
                try:
                    label_resp = client.print_label(
                        awb, page_size="A4",
                        display_cod_prepaid="Y",
                        display_shipper_mobile="Y",
                        display_shipper_address="Y",
                    )
                    pdf_url = label_resp.get("file_name", "")
                    _log_event(f"ithink_label_{order_name}_{vendor_canon}", label_resp)

                    if pdf_url:
                        shipping_addr = sub_order_dict.get("shipping_address") or {}
                        wa_resp = send_vendor_new_order(
                            vendor_canon=vendor_canon,
                            order_number=shipment["order"],
                            awb=awb,
                            customer_name=shipment["name"],
                            customer_phone=shipment["phone"],
                            shipping_address=shipping_addr,
                            line_items=sub_order_dict["line_items"],
                            payment_mode=shipment["payment_mode"],
                            amount=float(shipment["total_amount"]),
                            label_pdf_url=pdf_url,
                            override_destination=os.environ.get("WHATSAPP_TEST_OVERRIDE") or None,
                        )
                        _log_event(f"aisensy_whatsapp_{order_name}_{vendor_canon}", wa_resp)
                        whatsapp_result = {"sent": True, "response": wa_resp}
                        log.info("WhatsApp sent to vendor=%s for AWB=%s", vendor_canon, awb)
                    else:
                        whatsapp_result = {"sent": False, "reason": "no PDF URL from iThink"}
                except Exception as wa_exc:
                    log.warning("WhatsApp/label send failed for %s [%s]: %s",
                                order_name, vendor_canon, wa_exc)
                    whatsapp_result = {"sent": False, "error": str(wa_exc)}
                    _log_event(f"aisensy_error_{order_name}_{vendor_canon}", {"error": str(wa_exc)})

            results.append({
                "vendor": vendor_canon,
                "warehouse_id": warehouse_id,
                "status": "pushed",
                "awb": awb,
                "ithink_response": response,
                "whatsapp": whatsapp_result,
            })
        except Exception as exc:
            log.exception("Failed to push %s [vendor=%s] to iThink", order_name, vendor_canon)
            _log_event(f"ithink_error_{order_name}_{vendor_canon}", {"error": str(exc)})
            results.append({
                "vendor": vendor_canon,
                "warehouse_id": warehouse_id,
                "status": "failed",
                "error": str(exc),
            })

    any_failed = any(r["status"] == "failed" for r in results)
    if any_failed and all(r["status"] == "failed" for r in results):
        raise HTTPException(status_code=502, detail={"order": order_name, "results": results})
    return {"status": "partial" if any_failed else "all_pushed", "order": order_name, "results": results}
