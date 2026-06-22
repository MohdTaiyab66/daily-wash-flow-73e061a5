#!/usr/bin/env bash
# End-to-end booking flow check. Runs the SQL harness inside a transaction
# that is rolled back at the end, so it is safe to run against any environment
# where PG* env vars point at the project database.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec psql -v ON_ERROR_STOP=1 -X -q -f "$DIR/test-booking-flow.sql"
