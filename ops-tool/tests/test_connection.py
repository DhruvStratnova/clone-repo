"""Verify iThink credentials work — calls check_pincode + get_warehouse.
Run:
  cd /Users/dhruvlekhi/astroaura-theme/ops-tool
  python3 tests/test_connection.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ithink import IThinkClient, IThinkConfig


def main():
    cfg = IThinkConfig.from_env()
    print(f"Environment: {'staging' if 'pre-alpha' in cfg.base_url else 'PRODUCTION'}")
    print(f"Base URL: {cfg.base_url}")
    print(f"Pickup warehouse ID: {cfg.pickup_address_id}")
    print(f"Access token: {cfg.access_token[:10]}...")
    print(f"Ready: {cfg.is_ready()}")
    if not cfg.is_ready():
        print(f"❌ Missing: {cfg.missing()}")
        sys.exit(1)
    print()

    client = IThinkClient(cfg)

    # Test 1 — pincode check (lightest, no charges)
    print("=" * 60)
    print("TEST 1 — check_pincode('400053') [Mumbai Andheri West]")
    print("=" * 60)
    try:
        resp = client.check_pincode("400053")
        print(json.dumps(resp, indent=2)[:1200])
        print("✅ Pincode endpoint reachable + auth works")
    except Exception as e:
        print(f"❌ FAIL: {e}")
        sys.exit(1)
    print()

    # Test 2 — get the staging warehouse details
    print("=" * 60)
    print(f"TEST 2 — get_warehouse({cfg.pickup_address_id})")
    print("=" * 60)
    try:
        resp = client.get_warehouse(cfg.pickup_address_id)
        print(json.dumps(resp, indent=2)[:1500])
        print("✅ Warehouse lookup works")
    except Exception as e:
        print(f"⚠️  Warehouse lookup failed: {e}")
        print("(Not fatal — may need a different warehouse ID for staging)")
    print()

    print("All core connectivity checks passed.")


if __name__ == "__main__":
    main()
