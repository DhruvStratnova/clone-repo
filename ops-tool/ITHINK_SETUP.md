# iThink Logistics Integration — Setup Guide

Built scaffold for Aura AI ops. Shopify orders → automatic push to iThink.

## What's built

```
ops-tool/
├── ithink/
│   ├── config.py        # loads creds from .env.local
│   ├── client.py        # all 13 iThink endpoints (add_order, track, label, cancel, etc.)
│   └── mapper.py        # Shopify order JSON → iThink shipment dict
├── shopify_webhook.py   # FastAPI server, receives Shopify webhooks, pushes to iThink
├── tests/
│   ├── sample_shopify_order.json
│   └── test_mapper.py   # offline test — verifies mapper without credentials
├── logs/                # every webhook + iThink call logged as JSON
└── requirements.txt
```

## Step 1 — Get credentials from iThink

Message them and ask for:
1. `access_token`
2. `secret_key`
3. `pickup_address_id` (warehouse ID)
4. `return_address_id` (if different)
5. Confirm staging URL is `pre-alpha.ithinklogistics.com`
6. Do they provide webhooks for status updates?

## Step 2 — Paste credentials into `.env.local`

```env
ITHINK_ENV=staging              # switch to "production" when ready
ITHINK_ACCESS_TOKEN=<from iThink>
ITHINK_SECRET_KEY=<from iThink>
ITHINK_PICKUP_ADDRESS_ID=<from iThink>
ITHINK_RETURN_ADDRESS_ID=<from iThink>
```

## Step 3 — Install Python deps

```bash
cd /Users/dhruvlekhi/astroaura-theme/ops-tool
pip3 install -r requirements.txt
```

## Step 4 — Verify mapper (offline, no credentials needed)

```bash
python3 tests/test_mapper.py
```

You should see a properly-formed iThink shipment payload printed.

## Step 5 — Start the webhook server

```bash
uvicorn shopify_webhook:app --port 8000 --reload
```

Open http://localhost:8000 — should show `ithink_ready: true` if creds are set.

## Step 6 — Expose to internet (for Shopify to reach it)

```bash
# install ngrok if needed: brew install ngrok
ngrok http 8000
```

Copy the `https://xxxx.ngrok-free.app` URL.

## Step 7 — Register webhook in Shopify

1. Shopify admin → **Settings** → **Notifications** → scroll to **Webhooks**
2. Click **Create webhook**
3. Event: **Order creation**
4. Format: **JSON**
5. URL: `https://xxxx.ngrok-free.app/webhooks/shopify/order-created`
6. Webhook API version: latest
7. Save — copy the **Webhook signature** secret it shows
8. Paste it into `.env.local` as `SHOPIFY_WEBHOOK_SECRET=...`
9. Restart the uvicorn server

## Step 8 — Place a test order

1. Shopify admin → create a draft order → mark as paid
2. Watch your terminal — you'll see `Received order webhook ... iThink order created`
3. Check `logs/` folder — every payload is saved

## Endpoints available in the client

```python
from ithink import IThinkClient
c = IThinkClient()

c.add_order([shipment_dict])        # create order(s) — returns waybill(s)
c.track_order("1369010531020")      # track AWB
c.cancel_order("1369010531020")     # cancel
c.print_label("AWB", page_size="A4")
c.print_manifest("AWB")
c.check_pincode("400067")           # serviceability check
c.get_states("101")                 # 101 = India
c.get_cities(state_id=22)
c.add_warehouse(...)
c.get_warehouse(22)
c.get_rate(from_pincode=..., to_pincode=..., ...)
c.get_zone_rate(from_pincode=..., ...)
c.get_remittance("2026-05-15")
```

## What still needs deciding (after creds arrive)

- **Status sync back to Shopify** — poll `track_order` every N min and update Shopify fulfillment? Or wait for iThink webhooks?
- **WhatsApp notifications via AiSensy** — fire on "shipped" / "out for delivery" / "delivered" events?
- **Label auto-print** — after order created, auto-fetch label PDF and email/print?
- **Production deployment** — currently runs locally; for production we'd put it on Railway/Render/EC2.

## Hosting recommendation

For testing: run locally with ngrok (free).
For production: **Railway.app** — easiest, $5/mo, deploys from a Git repo.
