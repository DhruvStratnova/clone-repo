"""End-to-end test — runs the full flow but sends WhatsApp to YOUR number, not the real vendor.

Flow:
  1. Take sample multi-vendor Shopify order
  2. Split by vendor
  3. Push each sub-order to iThink staging → get AWB
  4. Fetch label PDF URL from iThink
  5. Send WhatsApp to YOUR number with the PDF attached

Usage:
  WHATSAPP_TEST_OVERRIDE=919XXXXXXXXX python3 tests/test_whatsapp_to_self.py
"""
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ithink import IThinkClient, IThinkConfig, shopify_order_to_ithink, split_order_by_vendor
from aisensy import send_vendor_new_order


def main():
    test_phone = os.environ.get("WHATSAPP_TEST_OVERRIDE", "")
    if not test_phone:
        print("❌ Set WHATSAPP_TEST_OVERRIDE=919XXXXXXXXX (your WhatsApp number with country code, no +)")
        sys.exit(1)

    cfg = IThinkConfig.from_env()
    if "pre-alpha" not in cfg.base_url:
        print("⚠️  Refusing to run on production")
        sys.exit(1)

    print(f"Test recipient (override): {test_phone}")
    print(f"iThink env: staging  | warehouse: {cfg.pickup_address_id}")
    print()

    # Load sample order, give it a unique number for this run
    order = json.loads((Path(__file__).parent / "sample_multivendor_order.json").read_text())
    order["name"] = f"#TEST-{int(time.time())}"

    groups = split_order_by_vendor(order)
    print(f"Order #{order['name']} → {len(groups)} vendor sub-orders")
    print()

    client = IThinkClient(cfg)

    for vendor_canon, warehouse_id, sub_order_dict in groups:
        print("=" * 70)
        print(f"VENDOR: {vendor_canon}  | warehouse: {warehouse_id}")
        print("=" * 70)

        # Push to iThink → get AWB
        shipment = shopify_order_to_ithink(sub_order_dict, return_address_id=warehouse_id, vendor=vendor_canon)
        payload = {
            "data": {
                "shipments": [shipment],
                "pickup_address_id": warehouse_id,
                "logistics": cfg.default_courier,
                "s_type": "",
                "order_type": "",
                "access_token": cfg.access_token,
                "secret_key": cfg.secret_key,
            }
        }
        try:
            resp = client._post("/order/add.json", payload)
        except Exception as e:
            print(f"  ❌ iThink push failed: {e}")
            continue

        # Extract AWB
        awb = ""
        for _k, v in (resp.get("data") or {}).items():
            if isinstance(v, dict) and v.get("waybill"):
                awb = str(v["waybill"])
                break
        if not awb:
            print(f"  ❌ No AWB in response: {resp}")
            continue
        print(f"  ✅ iThink AWB: {awb}")

        # Fetch label PDF (with all display flags ON for full info on label)
        try:
            label_resp = client.print_label(
                awb, page_size="A4",
                display_cod_prepaid="Y",
                display_shipper_mobile="Y",
                display_shipper_address="Y",
            )
            pdf_url = label_resp.get("file_name", "")
        except Exception as e:
            print(f"  ❌ Label fetch failed: {e}")
            continue
        if not pdf_url:
            print(f"  ❌ No PDF URL in label response")
            continue
        print(f"  ✅ Label PDF: {pdf_url}")

        # Send WhatsApp (to YOUR number, not vendor)
        try:
            wa = send_vendor_new_order(
                vendor_canon=vendor_canon,
                order_number=shipment["order"],
                awb=awb,
                customer_name=shipment["name"],
                customer_phone=shipment["phone"],
                shipping_address=sub_order_dict.get("shipping_address") or {},
                line_items=sub_order_dict["line_items"],
                payment_mode=shipment["payment_mode"],
                amount=float(shipment["total_amount"]),
                label_pdf_url=pdf_url,
                override_destination=test_phone,
            )
            print(f"  ✅ WhatsApp sent! AiSensy response: {wa}")
        except Exception as e:
            print(f"  ❌ WhatsApp send failed: {e}")
        print()


if __name__ == "__main__":
    main()
