#!/usr/bin/env bash
# release-build-linux.sh — build fully static (musl) release binaries for one
# Linux architecture, without docker or `cross`.
#
# Usage:
#   scripts/release-build-linux.sh <amd64|arm64> [outdir]
#
# Produces <outdir>/panoptikon-server-linux-<arch> and
# <outdir>/panoptikon-agent-linux-<arch>, both statically linked against musl
# with OpenSSL compiled in (server feature `vendored-openssl`), so the assets
# run on any Linux of that architecture regardless of glibc/libssl version.
#
# Toolchain: a pinned prebuilt musl cross toolchain from cross-tools/musl-cross
# (GCC + binutils + musl), checksum-verified, cached under $MUSL_CROSS_DIR.
# Rust: whatever `cargo`/`rustup` is on PATH (stable in CI); the musl target is
# added on demand.
#
# Prerequisites on the build host: bash, curl, tar, xz, sha256sum, file, make,
# perl (openssl-src Configure), rustup. web/out/ must already contain the built
# frontend — rust-embed packs it into the server binary.
#
# Used by .forgejo/workflows/release.yml; also runnable by hand on any x86_64
# Linux box to reproduce a release build.

set -euo pipefail

ARCH="${1:?usage: $0 <amd64|arm64> [outdir]}"
OUT="${2:-dist}"

# Pin of https://github.com/cross-tools/musl-cross/releases. Bump the release
# and both checksums together (the .sha256 files are published next to the
# tarballs).
MUSL_CROSS_RELEASE="${MUSL_CROSS_RELEASE:-20260823}"
MUSL_CROSS_DIR="${MUSL_CROSS_DIR:-$HOME/.cache/musl-cross}"

case "$ARCH" in
  amd64)
    TRIPLE="x86_64-unknown-linux-musl"
    TARBALL_SHA256="9752ecb10bafc0fc2ea75b3ed864a78137f3e5ba9b1579f1f16923d444c48096"
    ;;
  arm64)
    TRIPLE="aarch64-unknown-linux-musl"
    TARBALL_SHA256="0fc483607d9ed83bdf75e7539bacc66721d7e37ca606377aed6a90cef82e45da"
    ;;
  *)
    echo "unsupported arch: $ARCH (expected amd64 or arm64)" >&2
    exit 1
    ;;
esac

if [ ! -f web/out/index.html ]; then
  echo "web/out/index.html is missing — build the frontend first (cd web && bun run build)" >&2
  exit 1
fi

# --- 1. Cross toolchain -------------------------------------------------------

TC="$MUSL_CROSS_DIR/$TRIPLE"
if [ ! -x "$TC/bin/$TRIPLE-gcc" ]; then
  echo "Fetching musl cross toolchain $TRIPLE ($MUSL_CROSS_RELEASE)..."
  mkdir -p "$MUSL_CROSS_DIR"
  tarball="$MUSL_CROSS_DIR/$TRIPLE.tar.xz"
  curl -fsSL --retry 3 --retry-delay 5 -o "$tarball" \
    "https://github.com/cross-tools/musl-cross/releases/download/$MUSL_CROSS_RELEASE/$TRIPLE.tar.xz"
  echo "$TARBALL_SHA256  $tarball" | sha256sum -c -
  tar -C "$MUSL_CROSS_DIR" -xJf "$tarball"
  rm -f "$tarball"
fi
test -x "$TC/bin/$TRIPLE-gcc"

# --- 2. Rust target -----------------------------------------------------------

rustup target add "$TRIPLE"

# --- 3. Cross-compilation environment ----------------------------------------
# The `cc` crate (openssl-src, libssh2-sys, libsqlite3-sys, libz-sys, ring)
# reads CC_<triple>/AR_<triple>; cargo reads CARGO_TARGET_<TRIPLE>_LINKER.

triple_env="${TRIPLE//-/_}"
triple_upper="$(printf '%s' "$triple_env" | tr '[:lower:]' '[:upper:]')"
export "CC_${triple_env}=$TC/bin/$TRIPLE-gcc"
export "AR_${triple_env}=$TC/bin/$TRIPLE-ar"
export "CARGO_TARGET_${triple_upper}_LINKER=$TC/bin/$TRIPLE-gcc"

# --- 4. Build -----------------------------------------------------------------

cargo build --release --locked --target "$TRIPLE" \
  -p panoptikon-server -p panoptikon-agent \
  --features panoptikon-server/vendored-openssl

# --- 5. Verify and collect ----------------------------------------------------

mkdir -p "$OUT"
for bin in panoptikon-server panoptikon-agent; do
  src="target/$TRIPLE/release/$bin"
  desc="$(file -b "$src")"
  echo "$bin: $desc"
  printf '%s\n' "$desc" | grep -Eq 'static(ally|-pie) linked' || {
    echo "$bin is not statically linked" >&2
    exit 1
  }
  case "$ARCH" in
    amd64) printf '%s\n' "$desc" | grep -q 'x86-64' ;;
    arm64) printf '%s\n' "$desc" | grep -q 'aarch64' ;;
  esac
  install -m 0755 "$src" "$OUT/$bin-linux-$ARCH"
done

# The host can execute its own architecture: prove the binaries start.
if [ "$ARCH" = "amd64" ] && [ "$(uname -m)" = "x86_64" ]; then
  "$OUT/panoptikon-server-linux-amd64" --version
  "$OUT/panoptikon-agent-linux-amd64" --version
fi

echo "Built $OUT/panoptikon-{server,agent}-linux-$ARCH"
