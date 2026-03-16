# Governance

This project is run like an infrastructure platform: stability and safety come first.

---

## Roles

### Maintainers
- Own architecture decisions and release approvals
- Own security policies and incident response process
- Can merge to `main`

### Contributors
- Submit PRs
- Participate in design discussions
- Follow contribution and security policies

---

## Decision making

### ADR process (required)
Any meaningful architectural decision MUST be recorded as an ADR:
- location: `docs/adr/`
- format: Context → Decision → Consequences → Alternatives

Examples:
- transport choices (stdio vs HTTP)
- persona pack format changes
- policy enforcement changes
- audit ledger schema changes

### Breaking changes
Breaking changes require:
- an ADR
- a migration plan
- version bump
- deprecation notice in `CHANGELOG.md`

---

## Branching and releases

- `main` is always releasable.
- Releases produce:
  - npm packages (from `packages/*`)
  - container images (from `services/*`)
  - signed persona pack artifacts (from `packs/*`)

### Versioning
- Semantic Versioning for packages
- Services use a release tag aligned with the monorepo release (or independent if needed)

---

## Security governance

Security issues are handled via `SECURITY.md`.
No security reports in public issues.

---

## Code ownership

Owners are defined in `CODEOWNERS`.
PRs touching trust & safety services require maintainer review.

---

## Quality gates

No PR merges unless:
- CI green
- contract validators pass
- smoke suite passes
