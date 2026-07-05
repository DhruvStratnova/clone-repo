"""Quick manual test for the Meta Conversions API integration.

Usage (from ops-tool/):
    python test_meta_capi.py

Reads META_DATASET_ID / META_CAPI_ACCESS_TOKEN / META_TEST_EVENT_CODE from
ops-tool/.env.local (or the real environment), then sends ONE sample `Purchase`
event so you can confirm the token works without placing a real order.

Tip: set META_TEST_EVENT_CODE in .env.local first, then watch
Events Manager -> dataset -> "Test events" — the event should appear in seconds.
"""
from __future__ import annotations

import json

import meta_capi

# A minimal but realistic Shopify order webhook payload (the fields meta_capi reads).
SAMPLE_ORDER = {
    "id": 9999999999001,
    "name": "#TEST-CAPI",
    "email": "capi.test@example.com",
    "phone": "+919876543210",
    "currency": "INR",
    "total_price": "1499.00",
    "financial_status": "paid",
    "browser_ip": "203.0.113.10",
    "order_status_url": "https://astroaura.market/account/orders/test",
    "client_details": {"user_agent": "Mozilla/5.0 (capi-test)"},
    "customer": {
        "id": 1234567890,
        "first_name": "Test",
        "last_name": "Buyer",
        "email": "capi.test@example.com",
    },
    "shipping_address": {
        "first_name": "Test",
        "last_name": "Buyer",
        "city": "New Delhi",
        "province_code": "DL",
        "zip": "110001",
        "country_code": "IN",
        "phone": "+919876543210",
    },
    "line_items": [
        {"product_id": 111, "variant_id": 222, "quantity": 1, "price": "1499.00"},
    ],
}


def main() -> None:
    print("META_DATASET_ID set:    ", bool(meta_capi._dataset_id()))
    print("Access token set:       ", bool(meta_capi._access_token()))
    print("Ready:                  ", meta_capi.is_ready())
    if not meta_capi.is_ready():
        print("\nMissing:", meta_capi.missing())
        print("-> Fill META_CAPI_ACCESS_TOKEN in ops-tool/.env.local and retry.")
        return

    print("\nSending sample Purchase event...\n")
    result = meta_capi.send_purchase(SAMPLE_ORDER)
    print(json.dumps(result, indent=2))

    if result.get("status") == "sent" and result.get("events_received"):
        print("\nOK — Meta accepted the event. Check Events Manager -> Test events.")
    else:
        print("\nSomething's off — inspect the 'response' above (token/dataset/permission).")


if __name__ == "__main__":
    main()
