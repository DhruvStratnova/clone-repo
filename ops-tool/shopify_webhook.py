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
from fastapi.responses import HTMLResponse

from ithink import (
    IThinkClient,
    IThinkConfig,
    shopify_order_to_ithink,
    split_order_by_vendor,
)
from aisensy import send_vendor_new_order
from aisensy.sender import AiSensyClient
import shopify_admin
from confirm_token import confirm_url, verify_token

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


def _is_cod(order: dict) -> bool:
    gateways = [g.lower() for g in (order.get("payment_gateway_names") or [])]
    return any("cod" in g or "cash on delivery" in g for g in gateways)


def _should_fulfill(order: dict) -> bool:
    """Only push to iThink for orders that are actually committed:
      - prepaid (Razorpay etc.): financial_status == 'paid'
      - COD: allowed even though financial_status is 'pending'
    Unpaid / abandoned / pending non-COD orders are skipped so we never ship
    something that wasn't paid for.
    """
    fin = (order.get("financial_status") or "").lower()
    if fin in ("paid", "partially_paid"):
        return True
    if _is_cod(order):
        return True
    return False


def _record_to_shopify(order_id, *, tags=(), note: str = "") -> None:
    """Best-effort durable record on the Shopify order (tags + timeline note)."""
    try:
        if tags:
            shopify_admin.add_order_tag(order_id, *tags)
        if note:
            shopify_admin.add_order_note(order_id, note)
    except Exception as exc:  # never let record-keeping break the webhook
        log.warning("Failed to record to Shopify order %s: %s", order_id, exc)
        _log_event(f"shopify_record_error_{order_id}", {"error": str(exc)})


@app.get("/")
def root():
    cfg = IThinkConfig.from_env()
    return {
        "service": "Aura AI ops — Shopify → iThink",
        "ithink_ready": cfg.is_ready(),
        "ithink_missing": cfg.missing(),
        "ithink_env": "production" if "my.ithinklogistics" in cfg.base_url else "staging",
        "default_courier": cfg.default_courier,
        "shopify_webhook_secret_set": bool(_shopify_secret()),
        "shopify_admin_ready": shopify_admin.is_ready(),
        "public_base_url_set": bool(os.environ.get("PUBLIC_BASE_URL")),
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
    order_id = order.get("id")
    log.info("Received order webhook: %s (topic=%s)", order_name, x_shopify_topic)
    _log_event(f"shopify_order_{order_name}", order)

    # Gate: only fulfil paid (Razorpay prepaid) or COD orders — never unpaid/abandoned.
    if not _should_fulfill(order):
        log.info("Skipping %s — not paid and not COD (financial_status=%s)",
                 order_name, order.get("financial_status"))
        return {
            "status": "skipped_not_payable",
            "order": order_name,
            "financial_status": order.get("financial_status"),
        }

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
                        # Per-order signed confirm link for the "Confirm Order" button.
                        # Only sent once the AiSensy template actually has the button variable
                        # (flip VENDOR_CONFIRM_BUTTON_ENABLED=1 after updating the template).
                        v_confirm_url = None
                        if order_id and os.environ.get("VENDOR_CONFIRM_BUTTON_ENABLED"):
                            v_confirm_url = confirm_url(str(order_id), vendor_canon)
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
                            confirm_url=v_confirm_url,
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

            # Durable record on the Shopify order (survives Railway redeploys)
            if order_id:
                wa_ok = bool(whatsapp_result and whatsapp_result.get("sent"))
                _record_to_shopify(
                    order_id,
                    tags=("ithink-pushed", f"awb-{awb}" if awb else "awb-none"),
                    note=(
                        f"[ops] iThink order created — vendor={vendor_canon}, "
                        f"warehouse={warehouse_id}, AWB={awb or 'n/a'}, "
                        f"WhatsApp-to-vendor={'sent' if wa_ok else 'not sent'} "
                        f"@ {datetime.utcnow().isoformat()}Z"
                    ),
                )

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


_CONFIRM_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Order Confirmed</title>
<style>
  body{{margin:0;font-family:'Inter',system-ui,sans-serif;background:#0A0612;color:#F5ECDF;
       display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}}
  .card{{background:rgba(20,14,31,.55);border:1px solid rgba(245,236,223,.16);border-radius:20px;
        padding:40px 36px;max-width:380px}}
  .tick{{font-size:46px;color:#D4A857}} h1{{font-size:22px;margin:14px 0 6px;font-weight:600}}
  p{{color:rgba(245,236,223,.72);font-size:14px;line-height:1.5;margin:0}}
  .muted{{margin-top:16px;font-size:12px;color:rgba(245,236,223,.42)}}
</style></head><body><div class="card">
  <div class="tick">{tick}</div><h1>{title}</h1><p>{msg}</p>
  <div class="muted">Aura AI · Ops</div>
</div></body></html>"""


@app.get("/vendor/confirm", response_class=HTMLResponse)
def vendor_confirm(o: str = "", v: str = "", t: str = ""):
    """Vendor taps the 'Confirm Order' button in WhatsApp → lands here.
    Records the confirmation durably on the Shopify order (tag + note)."""
    if not (o and v and verify_token(o, v, t)):
        return HTMLResponse(
            _CONFIRM_PAGE.format(tick="⚠", title="Invalid or expired link",
                                 msg="This confirmation link could not be verified."),
            status_code=400,
        )
    ts = datetime.utcnow().isoformat()
    _log_event(f"vendor_confirm_{o}_{v}", {"order_id": o, "vendor": v, "confirmed_at": ts})
    _record_to_shopify(
        o,
        tags=(f"vendor-confirmed-{v.replace(' ', '-')}", "vendor-confirmed"),
        note=f"[ops] Vendor '{v}' CONFIRMED order availability via WhatsApp @ {ts}Z",
    )
    log.info("Vendor %s confirmed order %s", v, o)
    return HTMLResponse(
        _CONFIRM_PAGE.format(tick="✓", title="Order Confirmed",
                             msg="Thank you — your confirmation has been recorded. Please dispatch the shipment.")
    )


@app.post("/cron/check-unconfirmed")
def check_unconfirmed(minutes: int = 60):
    """Escalation: orders pushed to iThink but not vendor-confirmed within `minutes`.
    Wire to a Railway cron (e.g. every 30 min). Pings ops via WhatsApp if a number is set.
    """
    pending = shopify_admin.find_unconfirmed_orders()
    stale = []
    cutoff = datetime.utcnow().timestamp() - minutes * 60
    for o in pending:
        created = o.get("created_at", "")
        try:
            ts = datetime.fromisoformat(created.replace("Z", "+00:00")).timestamp()
        except Exception:
            ts = 0
        if ts and ts < cutoff:
            stale.append({"id": o.get("id"), "name": o.get("name")})

    ops_number = os.environ.get("OPS_WHATSAPP", "")
    escalated = False
    if stale and ops_number:
        try:
            names = ", ".join(s["name"] for s in stale)
            AiSensyClient().send_template(
                campaign_name=os.environ.get("AISENSY_OPS_CAMPAIGN_NAME", "aura_ai_ops_alert_1"),
                destination=ops_number,
                user_name="Aura Ops",
                template_params=[f"{len(stale)} order(s) unconfirmed >{minutes}m: {names}"],
            )
            escalated = True
        except Exception as exc:
            log.warning("Ops escalation send failed: %s", exc)

    return {"checked": len(pending), "stale": stale, "escalated": escalated}
