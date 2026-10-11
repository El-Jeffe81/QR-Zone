#!/bin/sh
# Regenerate archive/QR-Zone.zip, a source snapshot of the project, by hand.
# Not part of any build or npm script: run it only when the zip should be
# refreshed, then commit the result. The zip lives outside public/ so it is
# kept in the repo but never published on the site.
#
# It packs the committed tree at HEAD (`git archive`), so node_modules,
# build output (dist, .vercel, .output) and anything else gitignored are
# never included. It also leaves out can_delete/ and the zip itself.
# Commit your changes first: uncommitted edits are not packed.
set -eu
cd "$(dirname "$0")/.."
out=archive/QR-Zone.zip
tmp="$(mktemp -d)/QR-Zone.zip"
git archive --format=zip --prefix=QR-Zone/ -o "$tmp" HEAD -- . \
  ':(exclude)can_delete' ':(exclude)archive/QR-Zone.zip'
mv "$tmp" "$out"
echo "wrote $out from $(git rev-parse --short HEAD)"
