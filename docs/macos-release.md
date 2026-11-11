# Fikr Vox macOS release runbook

The [desktop release workflow](../.github/workflows/desktop-release.yml) publishes stable `vMAJOR.MINOR.PATCH` tags from `main` in `bigmints/fikr-vox`. It builds for Apple silicon Macs running macOS 13 or later. Apple Foundation Models requires macOS 26 and an eligible Mac.

The workflow signs and notarizes the app and disk image, verifies the updater archive, and publishes [the update feed](https://github.com/bigmints/fikr-vox/releases/latest/download/latest.json).

## Configure signing

In GitHub, create or open the `desktop-release` environment and allow the release tag under **Deployment branches and tags**. Configure the following environment secrets and variable. [Repository environments](https://github.com/bigmints/fikr-vox/settings/environments)

| Name | Type | Value |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | Secret | Base64-encoded Developer ID Application certificate and private key exported as a `.p12` file |
| `APPLE_CERTIFICATE_PASSWORD` | Secret | Password for the exported `.p12` file |
| `APPLE_API_KEY` | Secret | App Store Connect team API key ID |
| `APPLE_API_ISSUER` | Secret | App Store Connect issuer ID |
| `APPLE_API_PRIVATE_KEY` | Secret | Base64-encoded `.p8` file for the team API key |
| `TAURI_SIGNING_PRIVATE_KEY` | Secret | Contents of the Tauri updater private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Secret | Password for the updater private key |
| `TAURI_UPDATER_PUBLIC_KEY` | Variable | Contents of the Tauri updater `.pub` file |

Use `base64 -i /path/to/file | pbcopy` on macOS to copy an encoded certificate or API key directly to the clipboard. Store credentials outside the checkout. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) · [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)

Generate the updater key once on a trusted machine.

```sh
npm ci
npm exec -- tauri signer generate -w ~/.tauri/fikr-vox.key
```

Store the private key and password securely. Installed copies use the matching public key to verify future updates.

## Publish a release

1. Set `version` in `src-tauri/tauri.conf.json`. Run `npm run build:desktop` and land the release inputs on `main`.
2. Allow the new tag in the `desktop-release` environment, then create and push it. For version `0.1.0`, replace `<commit-on-main>` with the release commit.

   ```sh
   git tag -a v0.1.0 <commit-on-main> -m "Fikr Vox 0.1.0"
   git push origin v0.1.0
   ```

3. Check the workflow and confirm the [release](https://github.com/bigmints/fikr-vox/releases/latest) contains the disk image, app archive, signature, and `latest.json`. If an interrupted upload leaves an incomplete draft, remove the draft before retrying. Publish corrections to an existing release under a higher version.

## Verify the installer and updater

1. On a separate Apple silicon Mac, open `Fikr-Vox-macOS-arm64.dmg`, drag **Fikr Vox** into Applications, and launch it. Check microphone access and the bundled local tools.
2. For subsequent releases, open the previous signed build and check **Settings → About → Check for updates**. After the download finishes, make a project edit and choose **Restart update**. Verify the version in About and confirm the edit persisted.

People using earlier local builds install the first official release manually. Signed builds check for updates shortly after launch and every six hours while open.
