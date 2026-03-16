from __future__ import annotations

from typing import Any, Dict, Optional
import os
import uuid
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl


class RunRequest(BaseModel):
  personaId: str = "default"
  userId: str = "hf-user"
  tenantId: str = "default"
  tool: str = "tool:webfetch"
  action: str = "fetch"
  targetUrl: Optional[HttpUrl] = None
  riskClass: str = "medium"
  confirm: bool = False
  scope: str = "session"
  value: str = "{}"
  ttlMs: int = 86_400_000
  path: str = "/session.txt"
  content: str = ""


class PersonaResponse(BaseModel):
  id: str
  name: Optional[str] = None
  pack: Optional[dict] = None


class PolicyRequest(BaseModel):
  personaId: str
  userId: str
  tenantId: str
  tool: str
  action: str
  riskClass: str
  traceId: str


class PolicyDecision(BaseModel):
  state: str
  reasonCode: str
  reason: Optional[str] = None
  requirements: list[dict] = []
  budgetSnapshot: Dict[str, Any] = {}
  traceId: str
  policyVersion: Optional[str] = "v1"
  decisionId: Optional[str] = None
  schemaVersion: Optional[str] = "1.0.0"
  issuedAt: Optional[str] = None
  requestedPolicyUrl: Optional[str] = None


class ToolResult(BaseModel):
  status: int
  ok: bool
  service: str
  contentType: str
  body: str
  requestPath: str


class RunResponse(BaseModel):
  traceId: str
  tool: str
  policy: PolicyDecision
  toolResult: ToolResult
  serviceHealth: Dict[str, bool]


GATEWAY_URL = os.getenv("COGNITIVE_API_GATEWAY_URL", "http://localhost:8080").rstrip("/")
POLICY_URL = os.getenv("COGNITIVE_POLICY_SERVICE_URL", "http://localhost:4001").rstrip("/")
PERSONA_URL = os.getenv("COGNITIVE_PERSONA_REGISTRY_URL", "http://localhost:3001").rstrip("/")
WEBFETCH_URL = os.getenv("COGNITIVE_WEBFETCH_SERVICE_URL", "http://localhost:3004").rstrip("/")
MEMORY_URL = os.getenv("COGNITIVE_MEMORY_SERVICE_URL", "http://localhost:3002").rstrip("/")
FILES_URL = os.getenv("COGNITIVE_FILES_SERVICE_URL", "http://localhost:3003").rstrip("/")
AUDIT_URL = os.getenv("COGNITIVE_AUDIT_SERVICE_URL", "http://localhost:4003").rstrip("/")

app = FastAPI(title="Cognitive AI HF Space")


def _build_headers(trace_id: str, persona_id: str, user_id: str, tenant_id: str, confirm: bool = False) -> Dict[str, str]:
  return {
    "x-trace-id": trace_id,
    "x-persona-id": persona_id,
    "x-user-id": user_id,
    "x-tenant-id": tenant_id,
    "x-policy-confirmed": "true" if confirm else "false"
  }


def _safe_post(url: str, payload: dict, headers: Optional[Dict[str, str]] = None, timeout: int = 10) -> dict:
  response = requests.post(url, json=payload, headers=headers, timeout=timeout)
  response.raise_for_status()
  return response.json()


def _safe_get(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 10) -> dict:
  response = requests.get(url, headers=headers, timeout=timeout)
  response.raise_for_status()
  return response.json()


def _coerce_policy(raw: dict, fallback_trace: str, policy_url: str) -> PolicyDecision:
  return PolicyDecision(
    state=raw.get("state", "deny"),
    reasonCode=raw.get("reasonCode", "policy_unavailable"),
    reason=raw.get("reason"),
    requirements=raw.get("requirements", []),
    budgetSnapshot=raw.get("budgetSnapshot", {"remainingBudget": 0, "maxBudget": 0, "windowStart": "", "windowEnd": ""}),
    traceId=raw.get("traceId", fallback_trace),
    policyVersion=raw.get("policyVersion", "v1"),
    decisionId=raw.get("decisionId"),
    schemaVersion=raw.get("schemaVersion", "1.0.0"),
    issuedAt=raw.get("issuedAt"),
    requestedPolicyUrl=raw.get("requestedPolicyUrl", policy_url)
  )


def _coerce_tool_call(raw: Any, status: int, service: str, path: str) -> ToolResult:
  if isinstance(raw, dict):
    content = raw.get("body", raw)
    if not isinstance(content, str):
      content = str(content)
  else:
    content = str(raw)
  return ToolResult(
    status=status,
    ok=200 <= status < 400,
    service=service,
    contentType="application/json",
    body=content,
    requestPath=path
  )


def _has_public_prefix(value: str) -> bool:
  parsed = urlparse(value)
  if not parsed.netloc:
    return False
  host = parsed.hostname or ""
  return host == "localhost" or host.endswith(".local") or host.startswith("127.") or parsed.scheme in {"http", "https"}


def _requires_tool_allowed(tool: str) -> str:
  tool_map = {
    "tool:webfetch": "webfetch",
    "memory:write": "memory",
    "memory:read": "memory",
    "filesystem:read": "files",
    "filesystem:write": "files"
  }
  if tool not in tool_map:
    raise HTTPException(status_code=400, detail=f"unsupported tool '{tool}'")
  return tool_map[tool]


def _run_memory_tool(tool: str, request: RunRequest, headers: Dict[str, str], trace_id: str) -> ToolResult:
  if tool == "memory:read":
    response = requests.get(f"{MEMORY_URL}/memory/list?scope={requests.utils.quote(request.scope)}", headers=headers, timeout=10)
    body = response.json()
    return _coerce_tool_call(body, response.status_code, "memory", f"/memory/{request.scope}")

  if tool == "memory:write":
    response = requests.post(
      f"{MEMORY_URL}/memory/write",
      json={
        "scope": request.scope,
        "value": request.value,
        "ttlMs": request.ttlMs
      },
      headers=headers,
      timeout=10
    )
    body = response.json()
    return _coerce_tool_call(body, response.status_code, "memory", "/memory/write")

  raise HTTPException(status_code=400, detail=f"unsupported memory tool '{tool}'")


def _run_files_tool(tool: str, request: RunRequest, headers: Dict[str, str], trace_id: str) -> ToolResult:
  if tool == "filesystem:read":
    response = requests.post(
      f"{FILES_URL}/files/read",
      json={"path": request.path},
      headers=headers,
      timeout=10
    )
    body = response.json()
    return _coerce_tool_call(body, response.status_code, "files", "/files/read")

  if tool == "filesystem:write":
    response = requests.post(
      f"{FILES_URL}/files/write",
      json={"path": request.path, "content": request.content},
      headers=headers,
      timeout=10
    )
    body = response.json()
    return _coerce_tool_call(body, response.status_code, "files", "/files/write")

  raise HTTPException(status_code=400, detail=f"unsupported files tool '{tool}'")


def _run_webfetch_tool(request: RunRequest, headers: Dict[str, str], trace_id: str) -> ToolResult:
  target = str(request.targetUrl) if request.targetUrl else None
  if not target:
    raise HTTPException(status_code=400, detail="targetUrl required for tool:webfetch")
  if not _has_public_prefix(target):
    raise HTTPException(status_code=400, detail="invalid targetUrl; only public URLs allowed")

  response = requests.post(
    f"{WEBFETCH_URL}/webfetch",
    json={"url": target, "method": request.action},
    headers=headers,
    timeout=15
  )
  body = response.json() if response.text else {}
  tool_body = body.get("body") if isinstance(body, dict) else body
  content = tool_body if isinstance(tool_body, str) else str(tool_body)
  return ToolResult(
    status=response.status_code,
    ok=response.ok,
    service="webfetch",
    contentType=response.headers.get("content-type", "application/json"),
    body=content,
    requestPath="/webfetch"
  )


@app.get("/")
def root() -> dict:
  return {
    "app": "soulism-hf-space",
    "status": "ready",
    "endpoints": {
      "policy": f"{POLICY_URL}/policy/check",
      "personas": f"{PERSONA_URL}/personas",
      "run": "/run"
    }
  }


@app.get("/health")
def health() -> dict:
  return {"ok": True, "service": "soulism-hf-space"}


@app.get("/ready")
def ready() -> dict:
  return {"ok": True, "ready": True, "service": "soulism-hf-space"}


@app.get("/personas", response_model=dict)
def personas() -> dict:
  payload = _safe_get(f"{PERSONA_URL}/personas")
  return {"personas": payload.get("personas", [])}


@app.get("/personas/{persona_id}/effective", response_model=PersonaResponse)
def persona_effective(persona_id: str) -> PersonaResponse:
  payload = _safe_get(f"{PERSONA_URL}/personas/{persona_id}/effective")
  return PersonaResponse(
    id=payload.get("id", persona_id),
    name=payload.get("name"),
    pack=payload
  )


@app.post("/run", response_model=RunResponse)
def run(request: RunRequest) -> dict:
  trace_id = str(uuid.uuid4())
  headers = _build_headers(trace_id, request.personaId, request.userId, request.tenantId, request.confirm)
  service = _requires_tool_allowed(request.tool)

  policy_request = PolicyRequest(
    personaId=request.personaId,
    userId=request.userId,
    tenantId=request.tenantId,
    tool=request.tool,
    action=request.action,
    riskClass=request.riskClass,
    traceId=trace_id
  )

  try:
    policy_payload = _safe_post(f"{POLICY_URL}/policy/check", policy_request.model_dump(), headers={"x-trace-id": trace_id}, timeout=5)
    decision = _coerce_policy(policy_payload, trace_id, POLICY_URL)
  except requests.HTTPError:
    raise HTTPException(status_code=503, detail="policy service unavailable")

  if decision.state == "deny":
    return {
      "traceId": trace_id,
      "tool": request.tool,
      "policy": decision.model_dump(),
      "toolResult": _coerce_tool_call({
        "state": decision.state,
        "reasonCode": decision.reasonCode,
        "reason": decision.reason
      }, 403, "policy", "denied"),
      "serviceHealth": {
        "policy": True,
        "persona": True
      }
    }

  if decision.state == "confirm" and not request.confirm:
    return {
      "traceId": trace_id,
      "tool": request.tool,
      "policy": decision.model_dump(),
      "toolResult": _coerce_tool_call({
        "state": decision.state,
        "reasonCode": decision.reasonCode,
        "reason": decision.reason,
        "requirements": decision.requirements
      }, 403, "policy", "confirmation_required"),
      "serviceHealth": {
        "policy": True,
        "persona": True
      }
    }

  if service == "webfetch":
    tool_result = _run_webfetch_tool(request, headers, trace_id)
  elif service == "memory":
    tool_result = _run_memory_tool(request.tool, request, headers, trace_id)
  elif service == "files":
    tool_result = _run_files_tool(request.tool, request, headers, trace_id)
  else:
    raise HTTPException(status_code=500, detail="tool dispatch not configured")

  return {
    "traceId": trace_id,
    "tool": request.tool,
    "policy": decision.model_dump(),
    "toolResult": tool_result.model_dump(),
    "serviceHealth": {
      "policy": True,
      "persona": True,
      "tool": True
    }
  }
