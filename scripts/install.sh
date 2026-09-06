#!/bin/sh
# Panoptikon installer — detects platform and downloads the correct binary
# from the Forgejo release at https://git.oklabs.uk/BeFeast/panoptikon/releases.
# Usage:
#   # latest release — stable URL, the tag is resolved through the Forgejo API:
#   curl -fsSL https://git.oklabs.uk/BeFeast/panoptikon/raw/branch/main/scripts/install.sh | sh
#   # the copy attached to a release, pinned to that tag:
#   curl -fsSL https://git.oklabs.uk/BeFeast/panoptikon/releases/download/<tag>/install.sh | sh -s -- panoptikon-server <tag>
#   curl -fsSL .../install.sh | sh -s -- panoptikon-agent            # install agent
#   curl -fsSL .../install.sh | sh -s -- panoptikon-server v0.6.105  # specific version
#
# Forgejo has no /releases/latest/download/<asset> redirect: without an explicit
# version the latest non-draft, non-prerelease release is looked up through
# GET /api/v1/repos/BeFeast/panoptikon/releases/latest.
#
# Environment variables:
#   INSTALL_DIR  — destination directory (default: /usr/local/bin)
#   FORGEJO_URL  — Forgejo instance (default: https://git.oklabs.uk)

set -e

REPO="BeFeast/panoptikon"
FORGEJO_URL="${FORGEJO_URL:-https://git.oklabs.uk}"
BINARY="${1:-panoptikon-server}"
VERSION="${2:-}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# --- Platform detection --------------------------------------------------------

OS="$(uname -s)"
case "$OS" in
  Linux)  OS="linux" ;;
  Darwin) OS="darwin" ;;
  *)      echo "Error: unsupported OS: $OS" >&2; exit 1 ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)             echo "Error: unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

# --- Version resolution -------------------------------------------------------
# Forgejo has no /releases/latest/download/<asset> redirect; resolve the latest
# non-draft, non-prerelease tag through the API instead.

if [ -z "$VERSION" ]; then
  VERSION="$(curl -fsSL "${FORGEJO_URL}/api/v1/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
fi

if [ -z "$VERSION" ]; then
  echo "Error: could not determine latest version" >&2
  exit 1
fi

ASSET="${BINARY}-${OS}-${ARCH}"
BASE_URL="${FORGEJO_URL}/${REPO}/releases/download/${VERSION}"

echo "Downloading ${ASSET} ${VERSION}..."

# --- Download ------------------------------------------------------------------

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fSL --progress-bar -o "${TMP}/${ASSET}" "${BASE_URL}/${ASSET}"
curl -fsSL -o "${TMP}/SHA256SUMS.txt" "${BASE_URL}/SHA256SUMS.txt"

# --- Checksum verification ----------------------------------------------------

(
  cd "$TMP"
  if command -v sha256sum >/dev/null 2>&1; then
    grep " ${ASSET}\$" SHA256SUMS.txt | sha256sum -c --quiet
  elif command -v shasum >/dev/null 2>&1; then
    grep " ${ASSET}\$" SHA256SUMS.txt | shasum -a 256 -c --quiet
  else
    echo "Warning: could not verify checksum (sha256sum/shasum not found)" >&2
  fi
)

# --- Install -------------------------------------------------------------------

chmod +x "${TMP}/${ASSET}"

if [ -w "${INSTALL_DIR}" ]; then
  mv "${TMP}/${ASSET}" "${INSTALL_DIR}/${BINARY}"
else
  echo "Installing to ${INSTALL_DIR} (requires sudo)..."
  sudo mv "${TMP}/${ASSET}" "${INSTALL_DIR}/${BINARY}"
fi

echo "Installed ${BINARY} ${VERSION} to ${INSTALL_DIR}/${BINARY}"
