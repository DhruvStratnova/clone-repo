"""
Normalize all Shopify product Vendor fields to 3 canonical names:
  - Astrogems
  - Rome Crystal and Gemstone
  - AstroAura

Maps existing variants to canonical names and updates via Shopify Admin API.
"""

import os
import sys
import time
from pathlib import Path

import requests

ENV_PATH = Path(__file__).parent / ".env.local"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

STORE = os.environ["SHOPIFY_STORE"]
TOKEN = os.environ["SHOPIFY_ADMIN_TOKEN"]
API = f"https://{STORE}/admin/api/2024-10"
HDR = {
    "X-Shopify-Access-Token": TOKEN,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

MAPPING = {
    "AstroGemLab": "Astrogems",
    "Astro Gems": "Astrogems",
    "Astrogems": "Astrogems",  # already canonical
    "Rome Crystal anf Gemstone": "Rome Crystal and Gemstone",
    "Rome Crystals & Gemstones": "Rome Crystal and Gemstone",
    "Rome Crystals and Gemstones": "Rome Crystal and Gemstone",
    "Rome Crystal and Gemstone": "Rome Crystal and Gemstone",
    "Astroaura": "AstroAura",
    "AstroAura": "AstroAura",
}


def shopify_get(url, params=None):
    r = requests.get(url, headers=HDR, params=params, timeout=60)
    if r.status_code == 429:
        time.sleep(float(r.headers.get("Retry-After", "2")))
        return shopify_get(url, params)
    r.raise_for_status()
    return r


def shopify_put(url, body):
    r = requests.put(url, headers=HDR, json=body, timeout=60)
    if r.status_code == 429:
        time.sleep(float(r.headers.get("Retry-After", "2")))
        return shopify_put(url, body)
    r.raise_for_status()
    return r.json()


def fetch_all_products():
    """Paginate through all products."""
    products = []
    url = f"{API}/products.json?limit=250&fields=id,title,vendor"
    while url:
        r = shopify_get(url)
        products.extend(r.json().get("products", []))
        # parse Link header for next page
        next_url = None
        for part in r.headers.get("Link", "").split(","):
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>").strip()
        url = next_url
    return products


def main():
    print("Fetching all products…")
    products = fetch_all_products()
    print(f"  {len(products)} products fetched")

    to_update = []
    unmapped = []
    already_good = 0
    for p in products:
        cur = (p.get("vendor") or "").strip()
        target = MAPPING.get(cur)
        if target is None:
            unmapped.append(p)
        elif target == cur:
            already_good += 1
        else:
            to_update.append((p, target))

    print(f"\n  Already canonical: {already_good}")
    print(f"  Will update:        {len(to_update)}")
    print(f"  Unmapped (skipped): {len(unmapped)}")
    if unmapped:
        print("\n  Unmapped vendor values (need your attention):")
        for p in unmapped[:10]:
            print(f"    - {p['title'][:60]:<60} vendor='{p.get('vendor', '')}'")

    if not to_update:
        print("\nNothing to update. Exiting.")
        return

    print(f"\nApplying {len(to_update)} updates…")
    ok = 0
    fail = 0
    for i, (p, target) in enumerate(to_update, 1):
        try:
            shopify_put(
                f"{API}/products/{p['id']}.json",
                {"product": {"id": p["id"], "vendor": target}},
            )
            ok += 1
            if i % 25 == 0:
                print(f"  {i}/{len(to_update)} updated…")
        except requests.HTTPError as e:
            fail += 1
            print(f"  FAILED {p['title'][:50]}: {e}")
        # rate-limit polite pause
        time.sleep(0.1)

    print(f"\nDone: {ok} updated, {fail} failed.")
    print("\nFinal vendor distribution should be exactly 3 names:")
    print("  Astrogems")
    print("  Rome Crystal and Gemstone")
    print("  AstroAura")


if __name__ == "__main__":
    main()
