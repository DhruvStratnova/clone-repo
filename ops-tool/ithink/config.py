"""iThink Logistics config — credentials, URLs, defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_env_local():
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_local()


@dataclass
class IThinkConfig:
    access_token: str
    secret_key: str
    pickup_address_id: str
    return_address_id: str
    base_url: str
    default_courier: str
    default_service_type: str

    @classmethod
    def from_env(cls) -> "IThinkConfig":
        env = os.environ.get("ITHINK_ENV", "staging").lower()
        is_prod = env == "production"
        base_url = (
            "https://my.ithinklogistics.com/api_v3"
            if is_prod
            else "https://pre-alpha.ithinklogistics.com/api_v3"
        )

        # In production, prefer the ITHINK_PROD_* values (falling back to the
        # non-prefixed vars). In staging, use the non-prefixed vars directly.
        def pick(prod_key: str, base_key: str, default: str = "") -> str:
            if is_prod:
                return os.environ.get(prod_key) or os.environ.get(base_key, default)
            return os.environ.get(base_key, default)

        access_token = pick("ITHINK_PROD_ACCESS_TOKEN", "ITHINK_ACCESS_TOKEN")
        secret_key = pick("ITHINK_PROD_SECRET_KEY", "ITHINK_SECRET_KEY")

        # Default pickup warehouse (fallback for unmapped vendors; per-vendor
        # warehouses are resolved in vendor_router). In prod, prefer Ratanshree's
        # prod warehouse over any stale staging ITHINK_PICKUP_ADDRESS_ID.
        if is_prod:
            pickup = os.environ.get("ITHINK_PROD_PICKUP_RATANSHREE") or os.environ.get("ITHINK_PICKUP_ADDRESS_ID", "")
        else:
            pickup = os.environ.get("ITHINK_PICKUP_ADDRESS_ID", "")

        if is_prod:
            return_id = os.environ.get("ITHINK_PROD_RETURN_ADDRESS_ID") or pickup
        else:
            return_id = os.environ.get("ITHINK_RETURN_ADDRESS_ID") or pickup

        return cls(
            access_token=access_token,
            secret_key=secret_key,
            pickup_address_id=pickup,
            return_address_id=return_id,
            base_url=base_url,
            default_courier=os.environ.get("ITHINK_DEFAULT_COURIER", "Delhivery"),
            default_service_type=os.environ.get("ITHINK_DEFAULT_SERVICE_TYPE", ""),
        )

    def is_ready(self) -> bool:
        return bool(self.access_token and self.secret_key and self.pickup_address_id)

    def missing(self) -> list[str]:
        out = []
        if not self.access_token:
            out.append("ITHINK_ACCESS_TOKEN")
        if not self.secret_key:
            out.append("ITHINK_SECRET_KEY")
        if not self.pickup_address_id:
            out.append("ITHINK_PICKUP_ADDRESS_ID")
        return out
