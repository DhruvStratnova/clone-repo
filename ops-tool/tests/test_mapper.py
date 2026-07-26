"""Offline test — verifies the Shopify → iThink mapper without needing credentials.

Run:
  cd /Users/dhruvlekhi/astroaura-theme/ops-tool
  python tests/test_mapper.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ithink.mapper import shopify_order_to_ithink


def main():
    sample_path = Path(__file__).parent / "sample_shopify_order.json"
    order = json.loads(sample_path.read_text())

    shipment = shopify_order_to_ithink(order, return_address_id="24")

    print("=" * 70)
    print("Generated iThink shipment payload:")
    print("=" * 70)
    print(json.dumps(shipment, indent=2))
    print()

    # Sanity checks — must-have fields per iThink docs
    required = ["order", "order_date", "total_amount", "name", "add", "pin", "phone",
                "products", "shipment_length", "shipment_width", "shipment_height", "weight",
                "payment_mode"]
    missing = [k for k in required if not shipment.get(k)]
    if missing:
        print("❌ MISSING required fields:", missing)
        sys.exit(1)

    print("✅ All required iThink fields present")
    print(f"   Order: {shipment['order']}")
    print(f"   Customer: {shipment['name']} | Phone: {shipment['phone']}")
    print(f"   Ship to: {shipment['add']}, {shipment['city']}, {shipment['pin']}")
    print(f"   Products: {len(shipment['products'])}")
    print(f"   Payment: {shipment['payment_mode']} | COD amount: ₹{shipment['cod_amount']}")
    print(f"   Weight: {shipment['weight']}g | Dims: {shipment['shipment_length']}x{shipment['shipment_width']}x{shipment['shipment_height']} cm")


if __name__ == "__main__":
    main()



def test_spec_name_carries_variant_and_properties():
    from ithink.mapper import _spec_name
    li = {
        "title": "Original 5 Mukhi Rudraksha (Nepal Origin)",
        "variant_title": "Premium / With Silver Capping / With X-Ray Certificate",
        "properties": [{"name": "Ring Size", "value": "9"}, {"name": "_hidden", "value": "x"}],
    }
    name = _spec_name(li)
    assert "Premium / With Silver Capping / With X-Ray Certificate" in name
    assert "Ring Size: 9" in name
    assert "_hidden" not in name


def test_spec_name_single_variant_is_clean():
    from ithink.mapper import _spec_name
    assert _spec_name({"title": "Amethyst Bracelet", "variant_title": "Default Title"}) == "Amethyst Bracelet"
