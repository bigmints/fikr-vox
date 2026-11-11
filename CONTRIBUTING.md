# Contributing to Fikr Vox

Use [GitHub Issues](https://github.com/bigmints/Fikr-Vox/issues) for bugs and feature requests. Search for an existing issue first. A reproducible bug report includes the app version or commit, macOS version, whether you ran the desktop app or browser server, and the steps that produce the problem. Use synthetic media where possible and remove provider keys and personal recordings from anything you share.

## Develop locally

Follow the [desktop setup](README.md#run-the-desktop-app). The desktop and browser versions share the interface in `public/`. If you change an integration or data format used by both backends, check the Rust and Node implementations.

```sh
npm ci
npm test
node scripts/prepare-local-tts.mjs
npm run test:rust
```

Run the full Node suite on macOS with the Xcode command-line tools. The media tests use Swift and AVFoundation. Integration tests use temporary project data and mock provider responses, so they can run without provider credentials.

When changing the Python speech engine, run the Python tests in the pinned runtime on an Apple silicon Mac.

```sh
uv run --project local-tts --locked python -m unittest discover -s test -p '*_test.py'
```

## Submit a pull request

Describe the user-visible change and the checks you ran. For an interface change, include a screenshot or short recording if it helps explain the behavior. Update the user guide when setup steps or supported workflows change.

Keep downloaded models, credentials, local app data, and test exports out of commits. Report vulnerabilities using the instructions in [SECURITY.md](SECURITY.md).
