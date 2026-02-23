#!/bin/sh
set -e

# Build CLI arguments from environment variables.
DB="${DATABASE_PATH:-/data/panoptikon.db}"
ARGS="--db $DB"

# Generate a TOML config from environment variables when VyOS is configured.
CONFIG="/tmp/panoptikon-env.toml"
HAS_CONFIG=false

if [ -n "$VYOS_URL" ] || [ -n "$VYOS_API_KEY" ]; then
    HAS_CONFIG=true
    {
        echo "[vyos]"
        [ -n "$VYOS_URL" ]     && echo "url = \"$VYOS_URL\""
        [ -n "$VYOS_API_KEY" ] && echo "api_key = \"$VYOS_API_KEY\""
    } > "$CONFIG"
fi

if [ "$HAS_CONFIG" = true ]; then
    ARGS="$ARGS --config $CONFIG"
fi

exec /usr/local/bin/panoptikon-server $ARGS "$@"
