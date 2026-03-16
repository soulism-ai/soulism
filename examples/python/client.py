#!/usr/bin/env python3
import argparse
import json
from typing import Any

import requests


def default_headers() -> dict[str, str]:
    return {
        "content-type": "application/json",
        "x-api-key": "local-dev-key",
        "x-user-id": "example-user",
        "x-tenant-id": "example-tenant",
        "x-persona-id": "default"
    }


def call_json(method: str, url: str, payload: dict[str, Any] | None = None) -> Any:
    response = requests.request(method=method, url=url, headers=default_headers(), json=payload, timeout=20)
    response.raise_for_status()
    if response.content:
        return response.json()
    return {}


def run(base_url: str) -> None:
    health = call_json("GET", f"{base_url}/health")
    ready = call_json("GET", f"{base_url}/ready")
    policy = call_json(
        "POST",
        f"{base_url}/policy/check",
        {
            "personaId": "default",
            "userId": "example-user",
            "tenantId": "example-tenant",
            "tool": "tool:webfetch",
            "action": "fetch",
            "riskClass": "low",
            "traceId": "example-python-client"
        },
    )

    output = {
        "health": health,
        "ready": ready,
        "policyCheck": policy,
    }
    print(json.dumps(output, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Cognitive AI API Gateway example client")
    parser.add_argument("--base-url", default="http://localhost:8080", help="Gateway base URL")
    args = parser.parse_args()
    run(args.base_url.rstrip("/"))


if __name__ == "__main__":
    main()
