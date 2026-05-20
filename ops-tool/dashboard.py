"""Aura Ops Console — read-only monitoring of vendor confirmation + delivery status.

Pulls live from Shopify (orders + our tags) and iThink (track_order per AWB),
assembles a single table with attention flags. No DB — cached ~60s per load.
"""
from __future__ import annotations

import html
import logging
import time
from datetime import datetime, timezone

import shopify_admin
from ithink import IThinkClient, IThinkConfig

log = logging.getLogger("aura-ops.dashboard")

_CACHE: dict = {"ts": 0.0, "data": None}
_CACHE_TTL = 60  # seconds


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _age_minutes(iso: str) -> float:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (_now() - dt).total_seconds() / 60
    except Exception:
        return 0.0


def _fmt_age(minutes: float) -> str:
    if minutes < 60:
        return f"{int(minutes)}m"
    if minutes < 24 * 60:
        return f"{int(minutes // 60)}h"
    return f"{int(minutes // 1440)}d"


def _awbs_from_tags(tags: list[str]) -> list[str]:
    out = []
    for t in tags:
        t = t.strip()
        if t.startswith("awb-") and t != "awb-none":
            out.append(t[4:])
    return out


def _classify(track_entry: dict | None, *, order_age_min: float) -> tuple[str, str]:
    """Return (human_status, flag). flag in {'', 'rto', 'ndr', 'ofd', 'nopickup', 'delivered'}."""
    if not track_entry:
        # pushed but no tracking yet
        if order_age_min > 24 * 60:
            return ("Awaiting pickup", "nopickup")
        return ("Awaiting pickup", "")
    status = (track_entry.get("current_status") or "").strip()
    code = (track_entry.get("current_status_code") or "").upper()
    s = status.lower()
    if "rto" in s or "return" in s or code in ("RT", "RTD", "RTO"):
        return (status or "RTO", "rto")
    if "delivered" in s or code == "DL":
        return (status or "Delivered", "delivered")
    if "out for delivery" in s or code in ("OFD", "OO"):
        return (status or "Out for delivery", "ofd")
    if "undelivered" in s or "ndr" in s or "not delivered" in s or code in ("ND", "NDR", "UD-NDR"):
        return (status or "Delivery failed", "ndr")
    if not status or "manifest" in s or "booked" in s or "pickup" in s:
        if order_age_min > 24 * 60:
            return (status or "Awaiting pickup", "nopickup")
        return (status or "Awaiting pickup", "")
    return (status, "")


def _build() -> dict:
    if not shopify_admin.is_ready():
        return {"error": "Shopify admin not configured", "rows": [], "stats": {}}

    orders = shopify_admin.list_recent_orders(limit=100)
    # only orders we pushed to iThink
    pushed = []
    all_awbs: list[str] = []
    for o in orders:
        tags = [t.strip() for t in (o.get("tags") or "").split(",") if t.strip()]
        if "ithink-pushed" not in tags:
            continue
        awbs = _awbs_from_tags(tags)
        all_awbs.extend(awbs)
        pushed.append((o, tags, awbs))

    # batch-track all AWBs once
    track_map: dict[str, dict] = {}
    if all_awbs:
        try:
            resp = IThinkClient().track_order(all_awbs)
            data = resp.get("data") or {}
            if isinstance(data, dict):
                track_map = {str(k): v for k, v in data.items() if isinstance(v, dict)}
        except Exception as e:
            log.warning("track_order failed: %s", e)

    rows = []
    stats = {"total": 0, "confirmed": 0, "unconfirmed": 0, "delivered": 0, "rto": 0, "ndr": 0, "attention": 0}
    for o, tags, awbs in pushed:
        stats["total"] += 1
        cust = o.get("customer") or {}
        cust_name = " ".join(x for x in [cust.get("first_name"), cust.get("last_name")] if x) or "—"
        vendor_tags = [t.replace("vendor-confirmed-", "").replace("-", " ") for t in tags if t.startswith("vendor-confirmed-")]
        confirmed = any(t == "vendor-confirmed" or t.startswith("vendor-confirmed-") for t in tags)
        order_age = _age_minutes(o.get("created_at", ""))

        # take the first AWB's tracking as the row status (low volume; usually 1)
        track = track_map.get(awbs[0]) if awbs else None
        status_text, flag = _classify(track, order_age_min=order_age)
        carrier = (track or {}).get("logistic", "")

        # confirmation flag
        confirm_flag = ""
        if confirmed:
            stats["confirmed"] += 1
        else:
            stats["unconfirmed"] += 1
            if order_age > 60:
                confirm_flag = "unconfirmed"

        if flag == "delivered":
            stats["delivered"] += 1
        elif flag == "rto":
            stats["rto"] += 1
        elif flag == "ndr":
            stats["ndr"] += 1

        attention = confirm_flag or (flag if flag in ("rto", "ndr", "nopickup") else "")
        if attention:
            stats["attention"] += 1

        rows.append({
            "name": o.get("name", ""),
            "customer": cust_name,
            "amount": f"{o.get('currency','INR')} {o.get('total_price','')}",
            "payment": "COD" if any("cod" in g.lower() for g in (o.get("payment_gateway_names") or [])) else "Prepaid",
            "vendor": ", ".join(vendor_tags) or "—",
            "confirmed": confirmed,
            "confirm_age": _fmt_age(order_age),
            "awb": ", ".join(awbs) or "—",
            "carrier": carrier or "—",
            "status": status_text,
            "flag": flag,
            "confirm_flag": confirm_flag,
            "attention": attention,
        })

    # attention rows first, then newest
    rows.sort(key=lambda r: (0 if r["attention"] else 1))
    return {"rows": rows, "stats": stats, "generated": _now().strftime("%Y-%m-%d %H:%M UTC")}


def get_data(force: bool = False) -> dict:
    now = time.time()
    if not force and _CACHE["data"] and (now - _CACHE["ts"] < _CACHE_TTL):
        return _CACHE["data"]
    data = _build()
    _CACHE["data"] = data
    _CACHE["ts"] = now
    return data


_FLAG_BADGE = {
    "rto": ("RTO", "#C0392B"),
    "ndr": ("NDR — failed", "#E67E22"),
    "nopickup": ("No pickup", "#E67E22"),
    "ofd": ("Out for delivery", "#2D7D46"),
    "delivered": ("Delivered", "#2D7D46"),
    "unconfirmed": ("Unconfirmed", "#B8860B"),
}


def render_html(data: dict) -> str:
    if data.get("error"):
        return f"<h2 style='font-family:sans-serif'>Ops Console unavailable: {html.escape(data['error'])}</h2>"
    s = data["stats"]
    rows = data["rows"]

    def badge(flag: str) -> str:
        if not flag:
            return ""
        label, color = _FLAG_BADGE.get(flag, (flag, "#666"))
        return f"<span style='background:{color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;letter-spacing:.4px'>{html.escape(label)}</span>"

    tr = []
    for r in rows:
        confirm = ("<span style='color:#2D7D46;font-weight:600'>✓ confirmed</span>"
                   if r["confirmed"] else
                   f"<span style='color:#B8860B'>⏳ pending · {html.escape(r['confirm_age'])}</span>")
        row_bg = "background:rgba(192,57,43,.06);" if r["attention"] in ("rto", "ndr") else (
            "background:rgba(230,126,34,.06);" if r["attention"] else "")
        flags = " ".join(b for b in [badge(r["confirm_flag"]), badge(r["flag"] if r["flag"] in ("rto", "ndr", "nopickup") else "")] if b)
        tr.append(f"""<tr style="{row_bg}">
          <td><b>{html.escape(r['name'])}</b></td>
          <td>{html.escape(r['customer'])}<div class=sub>{html.escape(r['amount'])} · {r['payment']}</div></td>
          <td>{html.escape(r['vendor'])}</td>
          <td>{confirm}</td>
          <td>{html.escape(r['awb'])}<div class=sub>{html.escape(r['carrier'])}</div></td>
          <td>{html.escape(r['status'])}</td>
          <td>{flags}</td>
        </tr>""")
    body = "\n".join(tr) or "<tr><td colspan=7 style='text-align:center;padding:30px;color:#888'>No orders pushed to iThink yet.</td></tr>"

    return f"""<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width, initial-scale=1">
<title>Aura Ops Console</title>
<style>
 body{{margin:0;font-family:'Inter',system-ui,sans-serif;background:#0E0A16;color:#F5ECDF;padding:24px}}
 h1{{font-size:22px;margin:0 0 4px}} .meta{{color:rgba(245,236,223,.5);font-size:12px;margin-bottom:18px}}
 .cards{{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}}
 .c{{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 16px;min-width:96px}}
 .c .n{{font-size:24px;font-weight:700}} .c .l{{font-size:11px;color:rgba(245,236,223,.55);text-transform:uppercase;letter-spacing:.5px}}
 .c.warn .n{{color:#E67E22}} .c.bad .n{{color:#C0392B}} .c.good .n{{color:#5CB85C}}
 table{{width:100%;border-collapse:collapse;font-size:13px}}
 th{{text-align:left;color:rgba(245,236,223,.5);font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.1)}}
 td{{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}}
 .sub{{color:rgba(245,236,223,.45);font-size:11px;margin-top:2px}}
 a.refresh{{color:#D4A857;font-size:12px;text-decoration:none;border:1px solid rgba(212,168,87,.4);padding:6px 12px;border-radius:8px}}
</style></head><body>
 <h1>Aura Ops Console</h1>
 <div class=meta>Live · {html.escape(data['generated'])} · <a class=refresh href="?refresh=1">↻ Refresh</a></div>
 <div class=cards>
   <div class=c><div class=n>{s['total']}</div><div class=l>In flight</div></div>
   <div class="c {'warn' if s['unconfirmed'] else ''}"><div class=n>{s['unconfirmed']}</div><div class=l>Unconfirmed</div></div>
   <div class="c {'bad' if s['attention'] else ''}"><div class=n>{s['attention']}</div><div class=l>Needs attention</div></div>
   <div class="c good"><div class=n>{s['delivered']}</div><div class=l>Delivered</div></div>
   <div class="c {'warn' if s['ndr'] else ''}"><div class=n>{s['ndr']}</div><div class=l>NDR</div></div>
   <div class="c {'bad' if s['rto'] else ''}"><div class=n>{s['rto']}</div><div class=l>RTO</div></div>
 </div>
 <table>
  <thead><tr><th>Order</th><th>Customer</th><th>Vendor</th><th>Vendor confirm</th><th>AWB / Carrier</th><th>Delivery status</th><th>Flags</th></tr></thead>
  <tbody>{body}</tbody>
 </table>
</body></html>"""
