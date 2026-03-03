#!/bin/sh
set -e

# Build CLI arguments from environment variables.
DB="${DATABASE_PATH:-/data/panoptikon.db}"
ARGS="--db $DB"

exec /usr/local/bin/panoptikon-server $ARGS "$@"
