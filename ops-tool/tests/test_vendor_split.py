"""Test vendor-based order splitting.

Verifies that a Shopify order with items from 2 vendors becomes 2 iThink orders,
each routed to its own warehouse.

Run:
  python3 tests/test_vendor_split.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ithink import IThinkClient, IThinkConfig, shopify_order_to_ithink, split_order_by_vendor


def main():
    cfg = IThinkConfig.from_env()
    print(f"Environment: {'staging' if 'pre-alpha' in cfg.base_url else 'PRODUCTION'}")
    if "pre-alpha" not in cfg.base_url:
        print("⚠️  Refusing to run on production")
        sys.exit(1)

    sample_path = Path(__file__).parent / "sample_multivendor_order.json"
    order = json.loads(sample_path.read_text())
    # iThink staging remembers order numbers across runs — make this run unique
    order["name"] = f"#TEST-{int(time.time())}"

    print(f"\nShopify order: {order['name']} | total ₹{order['total_price']}")
    print(f"Line items: {len(order['line_items'])}")
    for li in order["line_items"]:
        print(f"  • {li['title']:<40} vendor='{li['vendor']}'  ₹{li['price']}")

    # Split
    groups = split_order_by_vendor(order)
    print(f"\n→ Split into {len(groups)} vendor sub-orders:")
    for vendor, wh, sub in groups:
        items = ", ".join(li["title"] for li in sub["line_items"])
        print(f"  • {vendor:<30} warehouse={wh}  items=[{items}]  subtotal=₹{sub.get('_vendor_subtotal', 0)}")

    # Push each sub-order to iThink staging
    client = IThinkClient(cfg)
    print("\n" + "=" * 70)
    print("Pushing each sub-order to iThink STAGING...")
    print("=" * 70)
    awbs = []
    for vendor, wh, sub_order in groups:
        shipment = shopify_order_to_ithink(sub_order, return_address_id=wh, vendor=vendor)
        print(f"\n→ Vendor: {vendor}  | warehouse: {wh}")
        print(f"   iThink order#: {shipment['order']}  | total: ₹{shipment['total_amount']}  | COD: ₹{shipment['cod_amount']}")
        payload = {
            "data": {
                "shipments": [shipment],
                "pickup_address_id": wh,
                "logistics": cfg.default_courier,
                "s_type": cfg.default_service_type,
                "order_type": "",
                "access_token": cfg.access_token,
                "secret_key": cfg.secret_key,
            }
        }
        try:
            resp = client._post("/order/add.json", payload)
            data = resp.get("data", {})
            for k, v in data.items():
                if isinstance(v, dict) and v.get("waybill"):
                    print(f"   ✅ AWB: {v['waybill']}  ({v.get('logistic_name', '?')})")
                    awbs.append(v["waybill"])
                else:
                    print(f"   ⚠️  Response: {v}")
        except Exception as e:
            print(f"   ❌ FAIL: {e}")

    print("\n" + "=" * 70)
    print(f"DONE. {len(awbs)} AWB(s) generated from 1 Shopify order:")
    for a in awbs:
        print(f"   {a}")


if __name__ == "__main__":
    main()
