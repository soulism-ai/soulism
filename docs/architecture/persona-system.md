# Persona System

Personas are versioned, composable artifacts that influence agent behavior.

---

## Persona pack structure

`packs/<pack-name>/`
- `manifest.json` — pack metadata + version
- `personas/*.yml` — persona definitions
- `signatures/pack.sig.json` — signature metadata
- `signatures/public_key.pem` — public key for verification

In production:
- persona registry refuses to load packs unless verified.

---

## Persona format (conceptual)

A persona typically includes:
- identity: id, name, version, description, tags
- voice: tone, formatting rules
- cognition: reasoning loop preferences, verification habits
- boundaries:
  - must
  - never
  - escalation rules
- policy hints:
  - default decision (allow/confirm/deny)
  - tool-specific rules
  - budgets (max calls, max spend)
- memory policy:
  - what can be stored
  - retention guidance
  - consent requirements

---

## Inheritance and composition

### Inheritance (`extends`)
A persona may extend another persona:
- base provides defaults
- child overrides selectively

### Composition (`compose`)
Multiple personas can be layered:
- deterministic order
- last writer wins for scalar fields
- arrays merge by policy (defined in `packages/persona-core`)

Example: base → domain → safety overlay.

---

## Rendering

Rendering produces:
1) structured effective persona (JSON)
2) deterministic system prompt text

Rendering must:
- be deterministic
- avoid leaking secrets
- include “hard constraints” explicitly

---

## Security notes

- Packs are a supply-chain risk: require signatures.
- Do not treat persona prompts as enforcement.
  Policy gate is enforcement.

