#!/usr/bin/env bash
# Run from the repository root on a fresh Apple silicon release runner.
set -euo pipefail
umask 077

: "${RUNNER_TEMP:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_REF_NAME:?}"
: "${APPLE_CERTIFICATE:?}" "${APPLE_CERTIFICATE_PASSWORD:?}"
: "${APPLE_API_KEY:?}" "${APPLE_API_ISSUER:?}" "${APPLE_API_PRIVATE_KEY:?}"
: "${TAURI_SIGNING_PRIVATE_KEY:?}" "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:?}" "${TAURI_UPDATER_PUBLIC_KEY:?}"

version=$(node -p 'require("./src-tauri/tauri.conf.json").version')
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
test "$GITHUB_REF_NAME" = "v$version"
test "$(uname -m)" = arm64
work=$(mktemp -d "$RUNNER_TEMP/vox-signing.XXXXXX")
keychain="$work/build.keychain-db"
out="$RUNNER_TEMP/vox-release"
mkdir "$out"
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

password=$(openssl rand -hex 32)
printf '%s' "$APPLE_CERTIFICATE" | base64 -D > "$work/certificate.p12"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 5400 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security list-keychains -d user -s "$keychain"
security import "$work/certificate.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" >/dev/null
rm "$work/certificate.p12"
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD

APPLE_SIGNING_IDENTITY=$(security find-identity -v -p codesigning "$keychain" |
  awk -F'"' '/"Developer ID Application: / { print $2; count++ } END { if (count != 1) exit 1 }')
export APPLE_SIGNING_IDENTITY
export APPLE_API_KEY_PATH="$work/notary.p8"
printf '%s' "$APPLE_API_PRIVATE_KEY" | base64 -D > "$APPLE_API_KEY_PATH"
unset APPLE_API_PRIVATE_KEY

# The key material remains in the private scratch directory. Bundle files need
# normal permissions so copies installed in Applications work for other users.
umask 022

# The local build stays ad hoc; this overlay pins the public update key into the release.
node --input-type=module > "$work/release.json" <<'JS'
import {Buffer} from 'node:buffer';
const pubkey = process.env.TAURI_UPDATER_PUBLIC_KEY.trim();
if (!/^untrusted comment: [^\n]+\nRW[\w+/=]+\s*$/.test(Buffer.from(pubkey, 'base64').toString('utf8'))) {
  throw new Error('TAURI_UPDATER_PUBLIC_KEY must contain the Tauri .pub file contents.');
}
console.log(JSON.stringify({
  bundle: {createUpdaterArtifacts: true, macOS: {hardenedRuntime: true}},
  plugins: {updater: {
    pubkey,
    requireSignedVersion: true,
    endpoints: [`https://github.com/${process.env.GITHUB_REPOSITORY}/releases/latest/download/latest.json`]
  }}
}));
JS
npm exec -- tauri build --ci --target aarch64-apple-darwin --bundles app --config "$work/release.json" -- --locked
unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD

bundle="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Fikr Vox.app"
archive="$out/Fikr-Vox-macOS-arm64.app.tar.gz"
dmg="$out/Fikr-Vox-macOS-arm64.dmg"
cp "$bundle.tar.gz" "$archive"
cp "$bundle.tar.gz.sig" "$archive.sig"

# Verify the actual updater download, including the signed version and the app inside it.
printf '%s' "$TAURI_UPDATER_PUBLIC_KEY" | base64 -D > "$work/update.pub"
base64 -D -i "$archive.sig" > "$work/update.sig"
minisign -Vm "$archive" -p "$work/update.pub" -x "$work/update.sig"
awk -F '\t' -v "version=version:$version" '
  /^trusted comment:/ && $NF == version { valid = 1 }
  END { exit !valid }
' "$work/update.sig"
mkdir "$work/payload"
tar -xzf "$archive" -C "$work/payload"
app="$work/payload/Fikr Vox.app"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$version"
codesign --verify --deep --strict --verbose=2 "$app"
for item in "$app" "$app/Contents/MacOS/uv" "$app/Contents/MacOS/apple-language"; do
  signing_info=$(codesign -dvv "$item" 2>&1)
  grep -Fq "Authority=$APPLE_SIGNING_IDENTITY" <<< "$signing_info"
  grep -Eq 'flags=.*\(runtime\)' <<< "$signing_info"
done
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"

# The DMG and updater carry the same verified app. Sign and notarize the DMG as well.
ln -s /Applications "$work/payload/Applications"
hdiutil create -ov -format UDZO -volname 'Fikr Vox' -srcfolder "$work/payload" "$dmg"
codesign --sign "$APPLE_SIGNING_IDENTITY" --keychain "$keychain" --timestamp "$dmg"
if ! xcrun notarytool submit "$dmg" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" \
  --issuer "$APPLE_API_ISSUER" --wait --timeout 30m --output-format json > "$work/notary.json" ||
  [ "$(plutil -extract status raw "$work/notary.json")" != Accepted ]; then
  if id=$(plutil -extract id raw "$work/notary.json" 2>/dev/null); then
    xcrun notarytool log "$id" --key "$APPLE_API_KEY_PATH" \
      --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER"
  fi
  exit 1
fi
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
codesign --verify --strict --verbose=2 "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"

node --input-type=module - "$archive" "$out/latest.json" <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
import {basename} from 'node:path';
const [archive, manifest] = process.argv.slice(2);
const {GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: tag} = process.env;
writeFileSync(manifest, JSON.stringify({
  version: tag.slice(1),
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature: readFileSync(archive + '.sig', 'utf8').trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${basename(archive)}`
    }
  }
}, null, 2) + '\n');
JS
