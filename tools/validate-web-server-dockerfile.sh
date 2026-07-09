#!/usr/bin/env bash
# Ensure web-server Docker frontend stage can resolve monorepo shared/i18n imports.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERFILE="${ROOT}/Dockerfile.web-server"

if [[ ! -f "${DOCKERFILE}" ]]; then
  echo "missing Dockerfile.web-server" >&2
  exit 1
fi

fail() {
  echo "validate-web-server-dockerfile: $*" >&2
  exit 1
}

grep -Fq 'WORKDIR /src/frontend' "${DOCKERFILE}" \
  || fail "expected WORKDIR /src/frontend monorepo layout"
grep -Fq 'COPY shared/ /src/shared/' "${DOCKERFILE}" \
  || fail "expected COPY shared/ so frontend ../../../shared/i18n resolves"
grep -Fq 'COPY --from=frontend /src/frontend/dist ./frontend/dist' "${DOCKERFILE}" \
  || fail "expected dist copy from /src/frontend/dist"

# Old layout only copied frontend/ and broke catalog/messages/translate imports in CI.
if grep -Eq '^WORKDIR /frontend$' "${DOCKERFILE}"; then
  fail "legacy WORKDIR /frontend would break shared/i18n relative imports"
fi
if grep -Fq 'COPY --from=frontend /frontend/dist' "${DOCKERFILE}"; then
  fail "legacy dist path /frontend/dist no longer matches frontend stage"
fi

# Frontend sources still point outside package root into shared/i18n.
FRONTEND_CATALOG="${ROOT}/frontend/src/i18n/catalog.ts"
grep -Fq '../../../shared/i18n/' "${FRONTEND_CATALOG}" \
  || fail "frontend catalog no longer imports ../../../shared/i18n (update Dockerfile if path changed)"

echo "validate-web-server-dockerfile: ok"
