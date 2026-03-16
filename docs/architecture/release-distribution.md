# Release & Distribution

This repo ships multiple artifact types.

---

## Artifact types
1. npm packages (`packages/*`)
2. container images (`services/*`)
3. signed persona packs (`packs/*`)
4. marketplace manifests (`marketplace/*`)
5. demo apps (`apps/*`)

---

## Versioning
- packages: semver
- services: image tags aligned to release version
- persona packs: versioned in manifest and signed

---

## Release pipeline (recommended)
- validate contracts
- run test suite + smoke suite
- build packages and services
- generate SBOM
- sign packs
- publish:
  - npm
  - container registry
  - release artifacts (packs + manifests)

