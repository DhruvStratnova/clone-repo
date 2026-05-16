"""iThink Logistics API client — wraps all 13 endpoints from Postman collection."""
from __future__ import annotations

import json
import logging
from typing import Any

import requests

from .config import IThinkConfig

log = logging.getLogger(__name__)


class IThinkError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, response: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class IThinkClient:
    """All iThink endpoints. Every method returns the parsed JSON response.
    Raises IThinkError on non-2xx or status != 'success'."""

    def __init__(self, config: IThinkConfig | None = None, *, timeout: int = 30):
        self.cfg = config or IThinkConfig.from_env()
        self.timeout = timeout
        self.session = requests.Session()

    # ---------- core ----------
    def _post(self, path: str, payload: dict) -> dict:
        url = f"{self.cfg.base_url}{path}"
        headers = {"Content-Type": "application/json", "Cache-Control": "no-cache"}
        log.debug("POST %s payload=%s", url, json.dumps(payload)[:500])
        try:
            r = self.session.post(url, json=payload, headers=headers, timeout=self.timeout)
        except requests.RequestException as e:
            raise IThinkError(f"Network error calling {url}: {e}") from e

        try:
            body = r.json()
        except ValueError:
            raise IThinkError(
                f"Non-JSON response from {url} (status {r.status_code}): {r.text[:300]}",
                status_code=r.status_code,
            )

        if r.status_code >= 400:
            raise IThinkError(
                f"HTTP {r.status_code} from {url}: {body}",
                status_code=r.status_code,
                response=body,
            )
        if isinstance(body, dict) and body.get("status") in ("error", "Error"):
            msg = (
                body.get("html_message")
                or body.get("message")
                or json.dumps(body.get("data") or body)[:400]
                or "iThink returned status=error"
            )
            raise IThinkError(msg, status_code=r.status_code, response=body)
        return body

    def _auth(self) -> dict:
        return {
            "access_token": self.cfg.access_token,
            "secret_key": self.cfg.secret_key,
        }

    # ============================================================
    # ORDER / PACKAGE
    # ============================================================
    def add_order(self, shipments: list[dict], *, logistics: str | None = None, s_type: str | None = None, order_type: str = "") -> dict:
        """Create one or more orders (max 10 per call). Returns waybills."""
        payload = {
            "data": {
                "shipments": shipments,
                "pickup_address_id": self.cfg.pickup_address_id,
                "logistics": logistics or self.cfg.default_courier,
                "s_type": s_type if s_type is not None else self.cfg.default_service_type,
                "order_type": order_type,
                **self._auth(),
            }
        }
        return self._post("/order/add.json", payload)

    def track_order(self, awb_numbers: str | list[str]) -> dict:
        """Track one or more AWBs (comma-separated string OR list)."""
        if isinstance(awb_numbers, list):
            awb_numbers = ",".join(str(a) for a in awb_numbers)
        return self._post("/order/track.json", {"data": {"awb_number_list": awb_numbers, **self._auth()}})

    def cancel_order(self, awb_numbers: str | list[str]) -> dict:
        if isinstance(awb_numbers, list):
            awb_numbers = ",".join(str(a) for a in awb_numbers)
        return self._post("/order/cancel.json", {"data": {"awb_numbers": awb_numbers, **self._auth()}})

    # ============================================================
    # SHIPPING (label / manifest)
    # ============================================================
    def print_label(self, awb_numbers: str | list[str], *, page_size: str = "A4",
                    display_cod_prepaid: str = "", display_shipper_mobile: str = "",
                    display_shipper_address: str = "") -> dict:
        if isinstance(awb_numbers, list):
            awb_numbers = ",".join(str(a) for a in awb_numbers)
        return self._post("/shipping/label.json", {
            "data": {
                "awb_numbers": awb_numbers,
                "page_size": page_size,
                "display_cod_prepaid": display_cod_prepaid,
                "display_shipper_mobile": display_shipper_mobile,
                "display_shipper_address": display_shipper_address,
                **self._auth(),
            }
        })

    def print_manifest(self, awb_numbers: str | list[str]) -> dict:
        if isinstance(awb_numbers, list):
            awb_numbers = ",".join(str(a) for a in awb_numbers)
        return self._post("/shipping/manifest.json", {"data": {"awb_numbers": awb_numbers, **self._auth()}})

    # ============================================================
    # PINCODE
    # ============================================================
    def check_pincode(self, pincode: str | int) -> dict:
        return self._post("/pincode/check.json", {"data": {"pincode": str(pincode), **self._auth()}})

    # ============================================================
    # WAREHOUSE
    # ============================================================
    def get_states(self, country_id: str | int = "101") -> dict:
        return self._post("/state/get.json", {"data": {"country_id": str(country_id), **self._auth()}})

    def get_cities(self, state_id: str | int) -> dict:
        return self._post("/city/get.json", {"data": {"state_id": str(state_id), **self._auth()}})

    def add_warehouse(self, *, company_name: str, address1: str, mobile: str, pincode: str,
                      city_id: str, state_id: str, country_id: str = "101",
                      address2: str = "") -> dict:
        return self._post("/warehouse/add.json", {
            "data": {
                "company_name": company_name,
                "address1": address1,
                "address2": address2,
                "mobile": str(mobile),
                "pincode": str(pincode),
                "city_id": str(city_id),
                "state_id": str(state_id),
                "country_id": str(country_id),
                **self._auth(),
            }
        })

    def get_warehouse(self, warehouse_id: str | int) -> dict:
        return self._post("/warehouse/get.json", {"data": {"warehouse_id": str(warehouse_id), **self._auth()}})

    # ============================================================
    # RATES
    # ============================================================
    def get_rate(self, *, from_pincode: str, to_pincode: str, length_cm: float, width_cm: float,
                 height_cm: float, weight_kg: float, payment_method: str = "cod",
                 product_mrp: float = 0, order_type: str = "forward") -> dict:
        return self._post("/rate/check.json", {
            "data": {
                "from_pincode": str(from_pincode),
                "to_pincode": str(to_pincode),
                "shipping_length_cms": str(length_cm),
                "shipping_width_cms": str(width_cm),
                "shipping_height_cms": str(height_cm),
                "shipping_weight_kg": str(weight_kg),
                "order_type": order_type,
                "payment_method": payment_method,
                "product_mrp": str(product_mrp),
                **self._auth(),
            }
        })

    def get_zone_rate(self, *, from_pincode: str, length_cm: float, width_cm: float, height_cm: float,
                      weight_kg: float, payment_method: str = "cod", product_mrp: float = 0,
                      order_type: str = "forward") -> dict:
        return self._post("/rate/zone_rate.json", {
            "data": {
                "from_pincode": str(from_pincode),
                "shipping_length_cms": str(length_cm),
                "shipping_width_cms": str(width_cm),
                "shipping_height_cms": str(height_cm),
                "shipping_weight_kg": str(weight_kg),
                "order_type": order_type,
                "payment_method": payment_method,
                "product_mrp": str(product_mrp),
                **self._auth(),
            }
        })

    # ============================================================
    # REMITTANCE
    # ============================================================
    def get_remittance(self, remittance_date: str) -> dict:
        """remittance_date format: YYYY-MM-DD"""
        return self._post("/remittance/get.json", {
            "data": {"remittance_date": remittance_date, **self._auth()}
        })
