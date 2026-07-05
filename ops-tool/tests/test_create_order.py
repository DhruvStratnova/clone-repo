"""Push a test order to iThink STAGING to verify end-to-end flow.
This will create a real test order in the staging system (no real shipment).

Run:
  python3 tests/test_create_order.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ithink import IThinkClient, IThinkConfig, shopify_order_to_ithink


def main():
    cfg = IThinkConfig.from_env()
    if "pre-alpha" not in cfg.base_url:
        print("⚠️  Refusing to run create-order test on PRODUCTION URL.")
        print("    Set ITHINK_ENV=staging in .env.local")
        sys.exit(1)

    sample_path = Path(__file__).parent / "sample_shopify_order.json"
    order = json.loads(sample_path.read_text())

    shipment = shopify_order_to_ithink(order, return_address_id=cfg.return_address_id)
    print("=" * 60)
    print("Shipment payload being sent to iThink staging:")
    print("=" * 60)
    print(json.dumps(shipment, indent=2))
    print()

    client = IThinkClient(cfg)
    print(f"Posting to: {cfg.base_url}/order/add.json")
    print(f"Pickup warehouse: {cfg.pickup_address_id}")
    print(f"Courier: {cfg.default_courier}")
    print()

    try:
        resp = client.add_order([shipment])
        print("=" * 60)
        print("iThink RESPONSE:")
        print("=" * 60)
        print(json.dumps(resp, indent=2))
        print()
        # Extract waybill if present
        data = resp.get("data", {})
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict) and v.get("waybill"):
                    print(f"✅ Got AWB: {v['waybill']}")
                    print(f"   Tracking URL: {v.get('tracking_url', 'N/A')}")
                    return
        print("⚠️  No waybill in response — check response above")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
