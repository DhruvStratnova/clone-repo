# Meta (Facebook) Integration — Events & Setup

Tracking for the Aura AI Shopify store, mirroring the Meta setup from the Aura AI
web app. It has two complementary layers that report into the **same dataset**:

- **Client-side Pixel** (browser) — storefront/funnel events.
- **Conversions API / CAPI** (server) — the `Purchase` event, sent from the
  ops-tool when a paid order webhook arrives.

Why two layers: Shopify's **checkout & thank-you pages don't run theme code**, so a
browser-only Pixel can't reliably capture `Purchase`. We send it server-side instead
— which is also immune to ad-blockers and iOS tracking limits. Both layers share the
Shopify **order id as `event_id`**, so Meta de-duplicates if the same purchase is ever
seen twice.

| | Dataset "Shopify Aura AI" |
|---|---|
| **Dataset / Pixel ID** | `1532873735240771` |
| **Business ID** | `837108562092682` |

---

## Architecture

```
   Storefront (theme)                         Shopify backend
   ──────────────────                         ───────────────
   snippets/meta-pixel.liquid                 order paid
   rendered in layout/theme.liquid                │
        │  (browser fbq)                          │  webhook: orders/create
        ▼                                         ▼
   PageView, ViewContent,                  ops-tool/shopify_webhook.py
   Search, AddToCart,                             │  (HMAC-verified, paid only)
   InitiateCheckout                               ▼
        │                                  ops-tool/meta_capi.py
        │                                         │  POST /{dataset}/events
        └───────────────┬───────────────────────-┘
                        ▼
            Meta dataset 1532873735240771
        (Events Manager → Overview / Test events)
```

---

## Event catalog

| Event | Layer | Fires when | Source file |
|-------|-------|-----------|-------------|
| `PageView` | Pixel (browser) | Every storefront page load | `snippets/meta-pixel.liquid` |
| `ViewContent` | Pixel (browser) | A product page loads | `snippets/meta-pixel.liquid` |
| `Search` | Pixel (browser) | A search results page with a query | `snippets/meta-pixel.liquid` |
| `AddToCart` | Pixel (browser) | Any form posting to `/cart/add` is submitted | `snippets/meta-pixel.liquid` |
| `InitiateCheckout` | Pixel (browser) | A checkout button is clicked (cart page / drawer) | `snippets/meta-pixel.liquid` |
| `Purchase` | **CAPI (server)** | A **paid** order webhook is received | `ops-tool/meta_capi.py` |

> Note: `Purchase` is the **only** event sent via CAPI. Everything else is the
> browser Pixel. The Meta Events Manager wizard may also list Add to Wishlist /
> Add Payment Info — we deliberately do **not** send those (no place to fire them
> from theme code), so ignore any "expected but not received" note for them.

### Parameters sent per event

**`PageView`** — no custom parameters.

**`ViewContent`** (product pages)
| Param | Value |
|-------|-------|
| `content_ids` | `[ <selected/first variant id> ]` |
| `content_name` | product title |
| `content_type` | `"product"` |
| `value` | variant price ÷ 100 (major units) |
| `currency` | cart currency ISO code |

**`Search`**
| Param | Value |
|-------|-------|
| `search_string` | the search terms |

**`AddToCart`** (intercepts Dawn's AJAX `/cart/add` response → exact item added)
| Param | Value |
|-------|-------|
| `content_ids` | `[ <variant id> ]` of the added item |
| `content_name` | added product's title |
| `content_type` | `"product"` |
| `value` | line price ÷ 100 (unit × qty) |
| `currency` | cart currency ISO code |
| `contents` | `[{ id, quantity, item_price }]` |

**`InitiateCheckout`** (cart contents at page load)
| Param | Value |
|-------|-------|
| `value` | cart total ÷ 100 (major units) |
| `currency` | cart currency ISO code |
| `num_items` | cart item count |
| `content_ids` | variant ids in cart |
| `contents` | `[{ id, quantity, item_price }, …]` |

**`Purchase`** (server-side CAPI) — for committed orders: **prepaid**
(`paid` / `partially_paid`) **and COD** (counted at order placement; COD's
`financial_status` stays `pending` until delivery). Only cancelled / refunded /
voided orders are skipped.

> Production note: the live `Purchase` runs in the Supabase edge function
> `shopify-order-webhook` (it already receives the order webhook server-side and
> fires Purchase once per order via a `claim_capi_purchase_lock` guard). The
> `ops-tool/meta_capi.py` below is the original reference implementation and is
> not the deployed path.

Event-level:
| Param | Value |
|-------|-------|
| `event_name` | `"Purchase"` |
| `event_time` | unix time of the webhook |
| `event_id` | Shopify order id (dedup key) |
| `action_source` | `"website"` |
| `event_source_url` | order status URL (when present) |

`user_data` (PII is SHA-256 hashed per Meta spec):
| Field | Source | Hashed? |
|-------|--------|---------|
| `em` (email) | order email / customer email | yes |
| `ph` (phone) | order / shipping / customer phone (digits only) | yes |
| `fn` / `ln` | customer or shipping first/last name | yes |
| `ct` / `st` / `zp` | shipping city / province code / zip | yes |
| `country` | shipping country code | yes |
| `external_id` | Shopify customer id | yes |
| `client_ip_address` | `order.browser_ip` | no |
| `client_user_agent` | `order.client_details.user_agent` | no |

> Not sent: Date of Birth, Gender, `fbc`/`fbp` cookies, Subscription ID. The
> fbc/fbp cookies live in the browser and aren't available to a pure server
> integration — email + phone + IP + user-agent already give good match quality.

`custom_data`:
| Param | Value |
|-------|-------|
| `currency` | order currency |
| `value` | `order.total_price` (already major units) |
| `content_type` | `"product"` |
| `content_ids` | line-item variant ids |
| `contents` | `[{ id, quantity, item_price }, …]` |
| `num_items` | total quantity across line items |
| `order_id` | Shopify order id |

---

## Files in this integration

| File | What it does |
|------|--------------|
| `snippets/meta-pixel.liquid` | The browser Pixel: base code + PageView/ViewContent/Search/AddToCart/InitiateCheckout |
| `layout/theme.liquid` | Renders `{% render 'meta-pixel' %}` in `<head>` |
| `config/settings_schema.json` | Adds the "Meta Pixel" theme-settings group |
| `config/settings_data.json` | Holds the live `meta_pixel_id` value (`1532873735240771`) |
| `ops-tool/meta_capi.py` | Server-side CAPI client (`send_purchase`, hashing, readiness checks) |
| `ops-tool/shopify_webhook.py` | Calls `meta_capi.send_purchase()` on paid orders; `GET /` reports `meta_capi_ready` |
| `ops-tool/.env.example` | Documents the Meta env vars |
| `ops-tool/test_meta_capi.py` | Standalone tester — fires one sample `Purchase` |
| `META_INTEGRATION.md` | This document |

---

## Configuration

### Theme (client Pixel)
The Dataset ID is set in **Theme settings → Meta Pixel → "Meta Pixel / Dataset ID"**
(`settings.meta_pixel_id`), persisted in `config/settings_data.json`. If blank, the
snippet renders nothing (safe no-op).

### ops-tool (CAPI) — environment variables
Local runs read `ops-tool/.env.local` (gitignored). **Production reads host env vars**
(e.g. Railway → Project → Variables):

| Variable | Value | Secret? |
|----------|-------|---------|
| `META_DATASET_ID` | `1532873735240771` | no |
| `META_CAPI_ACCESS_TOKEN` | dataset CAPI access token | **yes** — env only, never in git |
| `META_TEST_EVENT_CODE` | e.g. `TEST57067` (testing only; remove in prod) | no |
| `META_GRAPH_VERSION` | optional, default `v21.0` | no |

The access token is generated at **Events Manager → dataset → Settings → Conversions
API → Generate access token**. No Meta App / App ID is required for this flow.

---

## End-to-end testing checklist

### Client Pixel (after publishing the theme)
1. Install the **Meta Pixel Helper** Chrome extension.
2. Open the live store → it should show 1 pixel (`1532873735240771`) firing `PageView`.
3. Open a **product** page → `ViewContent`.
4. **Search** something → `Search`.
5. **Add to cart** → `AddToCart`.
6. Click **Checkout** → `InitiateCheckout`.
   Cross-check in Events Manager → **Overview** (or **Test events** with the helper).

### CAPI Purchase (server)
- **Quick test (no real order):** set `META_TEST_EVENT_CODE`, then from `ops-tool/`:
  ```
  python test_meta_capi.py
  ```
  Expect `status: sent`, `events_received: 1`. The event appears under
  Events Manager → **Test events** (Source: *Server*).
- **Real test:** place a **paid** test order on the store. The order webhook hits the
  ops-tool, which fires `Purchase`. Confirm via the `meta_capi_<order>.json` log file
  and Events Manager. `GET /` on the ops-tool shows `"meta_capi_ready": true`.

### Dedup check
The browser Pixel (if a Purchase ever fires client-side) and the CAPI Purchase share
`event_id = <order id>`, so Meta collapses them into one. In Events Manager the event
shows as received via both "Browser" and "Server" with deduplication applied.

---

## Operational notes / caveats

- **Don't double-count with the native channel.** If the Shopify **Facebook & Instagram**
  sales-channel app is installed and pointed at this *same* dataset, it injects its own
  pixel + CAPI and will duplicate events. Use this custom integration **or** the native
  channel for `1532873735240771` — not both.
- **Price units.** The theme divides prices by 100 (Shopify stores money in minor units);
  the CAPI module uses the webhook's `total_price`, which is already in major units.
- **COD.** Counted as a `Purchase` at order placement (COD's `financial_status`
  stays `pending` until delivery, so the gate fires on prepaid **and** COD/pending —
  only cancelled/refunded/voided are excluded).
- **Token rotation.** When the access token is regenerated, update it in **both**
  `ops-tool/.env.local` (local) and the production host env vars.
- **Remove the test code for production.** Unset `META_TEST_EVENT_CODE` so real events
  stop routing to Test events.
