"""Ops notifications — fan out to multiple WhatsApp numbers AND emails.

Recipients (comma-separated) come from env:
  OPS_WHATSAPP   e.g. "918178967273,919999999999"
  OPS_EMAILS     e.g. "you@astroaura.market,boss@astroaura.market"

Email uses plain SMTP (works with Gmail app-password, etc.):
  SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM

Everything degrades gracefully — if a channel isn't configured it's skipped,
never raising into the webhook/dashboard.
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

log = logging.getLogger("aura-ops.notify")


def _load_env_local() -> None:
    p = Path(__file__).resolve().parent / ".env.local"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_local()


def _split(env_key: str) -> list[str]:
    raw = os.environ.get(env_key, "")
    return [x.strip() for x in raw.replace(";", ",").split(",") if x.strip()]


def _notify_whatsapp(message: str) -> dict:
    numbers = _split("OPS_WHATSAPP")
    if not numbers:
        return {"sent": 0, "skipped": "no OPS_WHATSAPP"}
    try:
        from aisensy.sender import AiSensyClient
        client = AiSensyClient()
    except Exception as e:
        log.warning("WhatsApp ops notify unavailable: %s", e)
        return {"sent": 0, "error": str(e)}
    campaign = os.environ.get("AISENSY_OPS_CAMPAIGN_NAME", "aura_ai_ops_alert_1")
    sent = 0
    errors = []
    for num in numbers:
        try:
            client.send_template(
                campaign_name=campaign,
                destination=num,
                user_name="Aura Ops",
                template_params=[message],
            )
            sent += 1
        except Exception as e:  # one bad number shouldn't stop the rest
            errors.append(f"{num}: {e}")
    return {"sent": sent, "errors": errors}


def _notify_email(subject: str, message: str) -> dict:
    emails = _split("OPS_EMAILS")
    host = os.environ.get("SMTP_HOST", "")
    user = os.environ.get("SMTP_USER", "")
    pwd = os.environ.get("SMTP_PASS", "")
    if not (emails and host and user and pwd):
        return {"sent": 0, "skipped": "email not configured"}
    sender = os.environ.get("SMTP_FROM", user)
    port = int(os.environ.get("SMTP_PORT", "587"))
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(emails)
    msg.set_content(message)
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            s.login(user, pwd)
            s.send_message(msg)
        return {"sent": len(emails)}
    except Exception as e:
        log.warning("Email ops notify failed: %s", e)
        return {"sent": 0, "error": str(e)}


def notify_ops(subject: str, message: str) -> dict:
    """Fan out an ops alert to all configured WhatsApp numbers + emails."""
    wa = _notify_whatsapp(f"{subject} — {message}" if subject else message)
    em = _notify_email(subject or "Aura Ops", message)
    log.info("Ops notify: whatsapp=%s email=%s", wa, em)
    return {"whatsapp": wa, "email": em}
