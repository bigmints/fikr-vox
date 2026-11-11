# Contributing to Fikr Vox

Use [GitHub Issues](https://github.com/bigmints/Fikr-Vox/issues) for bugs and feature requests. For a bug, include the app version or commit, your macOS version, whether you used the desktop app or browser server, and steps to reproduce it. Remove API keys and personal media before attaching logs or examples. Report vulnerabilities privately using the [security policy](SECURITY.md).

## Development

Follow the [desktop setup](README.md#run-from-source) to run the Tauri app. To package a local `Fikr Vox.app` bundle, run `npm run build:desktop`. The bundle is under `src-tauri/target/release/bundle/macos/`.

Use Node.js 22 or newer to run the browser development server.

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Copy `.env.example` to `.env` to change the port or set an OpenRouter key. The server listens on loopback and stores development projects in `data/`.

## Repository layout

| Path | Contents |
| --- | --- |
| [`public/`](public/) | HTML, CSS, and JavaScript shared by both backends |
| [`src-tauri/`](src-tauri/) | Rust backend and desktop packaging |
| [`server.mjs`](server.mjs), [`lib/`](lib/) | Local HTTP server, storage, and provider integrations |
| [`local-tts/`](local-tts/) | Python speech engine, model catalog, and dependency lockfile |
| [`test/`](test/) | Application and integration tests |
| [`website/`](website/README.md) | Landing page, interactive demo, and user guide |
| [`docs/worker-api.md`](docs/worker-api.md) | Remote worker API contract |

Check both backends when changing shared behavior or a saved data format.

## Tests

Run the Node and Rust suites on macOS with the Xcode command-line tools installed. Media tests use Swift and AVFoundation. Provider tests use mocks and temporary project data.

```sh
npm ci
npm test
node scripts/prepare-local-tts.mjs
npm run test:rust -- --locked
```

On an Apple silicon Mac, use the pinned Python dependencies to test speech engine changes.

```sh
uv run --project local-tts --locked python -m unittest discover -s test -p '*_test.py'
```

## Pull requests

Describe what changed and how you verified it. Include a screenshot for interface changes when it helps explain the result. Update the [user guide](website/dist/docs/index.html) when a change affects setup or a user workflow. Keep downloaded models, local project data, and generated media out of commits.
