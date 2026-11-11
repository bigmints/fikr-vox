# Fikr Vox macOS releases

The [desktop release workflow](../.github/workflows/desktop-release.yml) publishes stable `vMAJOR.MINOR.PATCH` tags from commits on `main` in `bigmints/fikr-vox`. It builds for Apple silicon on macOS 13 and later. Apple Foundation Models still requires macOS 26 and an eligible Mac.

The workflow signs and notarizes the app and disk image. It verifies both staples and checks that the updater archive carries the same app, its bundled tools, and a valid signature for that version before publishing the release. The update feed is [latest.json](https://github.com/bigmints/fikr-vox/releases/latest/download/latest.json), and it points at the archive for the exact release tag.

## One-time setup

In [repository environment settings](https://github.com/bigmints/fikr-vox/settings/environments), use the `desktop-release` environment. Add the version tag under **Deployment branches and tags** before pushing it. The build reads these environment secrets and variable:

| Name | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64 of a Developer ID Application certificate and private key exported together as a `.p12`. |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the exported `.p12`. |
| `APPLE_API_KEY` | App Store Connect **team** API key ID. |
| `APPLE_API_ISSUER` | App Store Connect issuer ID. |
| `APPLE_API_PRIVATE_KEY` | Base64 of the matching `.p8` file. |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the Tauri updater private key file. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password chosen when generating the updater key. |
| `TAURI_UPDATER_PUBLIC_KEY` | **Environment variable** (not a secret): contents of the Tauri `.pub` file. |

Follow [Apple's notarization instructions](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and [Tauri's signing setup](https://v2.tauri.app/distribute/sign/macos/) for the Developer ID and App Store Connect credentials. On macOS, use `base64 -i /path/to/file | pbcopy` to copy an Apple key or certificate straight to the clipboard for entry into GitHub. Never commit the credential files.

Generate the separate updater key once on a trusted machine, outside the checkout:

```sh
npm ci
npm exec -- tauri signer generate -w ~/.tauri/fikr-vox.key
```

Choose a password. Back up the private key and password in a secure location you control. Keep using the same key for future releases; installed copies trust the public key they shipped with.

## Publish and verify

1. Set `version` in `src-tauri/tauri.conf.json` to the next stable version. Merge the complete build inputs to `main`, including the lockfiles, desktop preparation scripts, and bundled resources. `npm run build:desktop` can check the build without signing credentials.
2. Tag that commit and push the tag. For example, if the app version is `0.1.0`:

   ```sh
   git tag -a v0.1.0 <commit-on-main> -m "Fikr Vox 0.1.0"
   git push origin v0.1.0
   ```

3. Check the workflow and [release page](https://github.com/bigmints/fikr-vox/releases/latest). If an interrupted upload leaves a draft, remove the incomplete draft before rerunning. A published release should be corrected with a higher version.
4. On a separate Apple silicon Mac, download `Fikr-Vox-macOS-arm64.dmg`, drag Fikr Vox into Applications, and open it. Test microphone access and the bundled local tools.
5. After the next stable release, open the previous version. Confirm it downloads the update on launch or from **Settings → About → Check for updates**. Make a project edit, choose **Restart to update**, then verify the new version in About and confirm the edit survived.

The first official installer is a manual download for people using older local builds. Official builds check shortly after launch and every six hours while open. They download and verify updates in the background and apply them when the user chooses to restart.
