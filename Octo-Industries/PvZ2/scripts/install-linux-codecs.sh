#!/usr/bin/env bash
set -euo pipefail

destination="${1:?Pass an absolute codec tool directory}"
downloads="$(mktemp -d)"
trap 'rm -rf "$downloads"' EXIT
mkdir -p "$destination"

curl --fail --location --retry 3 \
  https://github.com/AOMediaCodec/libavif/releases/download/v1.4.2/linux-artifacts.zip \
  --output "$downloads/avif.zip"
curl --fail --location --retry 3 \
  https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0-linux-x86-64.tar.gz \
  --output "$downloads/webp.tar.gz"
(
  cd "$downloads"
  sha256sum --check <<'SHA256'
faf58a670ffbfdc0e3559e6d37592cff277c447dd39453f1cd1d7d7f5a20b8ef  avif.zip
1c5ffab71efecefa0e3c23516c3a3a1dccb45cc310ae1095c6f14ae268e38067  webp.tar.gz
SHA256
)
unzip -q "$downloads/avif.zip" avifenc -d "$destination"
tar -xzf "$downloads/webp.tar.gz" -C "$downloads"
cp "$downloads/libwebp-1.6.0-linux-x86-64/bin/cwebp" "$destination/cwebp"
chmod +x "$destination/avifenc" "$destination/cwebp"
"$destination/avifenc" --version
"$destination/cwebp" -version
ffmpeg -version | sed -n '1p'
ffprobe -version | sed -n '1p'
