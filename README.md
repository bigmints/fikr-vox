# Fikr Vox

Fikr Vox is an open-source studio for voiceovers, multi-speaker podcasts, and video dubbing on Apple silicon Macs. Write a script, choose or clone voices, arrange takes on a timeline, and export your work.

[Try the interactive demo](https://fikr.one/vox/#studio) · [Read the user guide](https://fikr.one/vox/docs/) · [Contribute](CONTRIBUTING.md) · [MIT License](LICENSE)

[![Fikr Vox interactive demo showing podcast dialogue and separate speaker tracks](website/dist/assets/studio.png)](https://fikr.one/vox/#studio)

## What you can make

- **Voiceovers** — Use Kokoro preset voices, clone a voice with Qwen3, or connect a supported speech provider.
- **Podcasts** — Import speaker-labelled dialogue, assign a voice to each speaker, mix voice and music tracks, and export WAV audio.
- **Dubbed videos** — Generate replacement narration, adjust its timing, and export a dubbed MP4. Dubbing replaces the source audio and preserves the original picture.
- **Presenter and scene videos** — Connect OpenRouter to generate clips or animate a portrait with an approved voice take.

## Run the desktop app

You’ll need an Apple silicon Mac, Node.js 22 or newer, Rust, Xcode command-line tools, and `uv` on your PATH. The first local voice download sets up a pinned Python 3.11 environment and downloads the selected model.

```sh
git clone https://github.com/bigmints/Fikr-Vox.git
cd Fikr-Vox
npm ci
npm run desktop
```

To build a local app bundle, run `npm run build:desktop`. Find the bundle at `src-tauri/target/release/bundle/macos/Fikr Vox.app`. Check [GitHub Releases](https://github.com/bigmints/Fikr-Vox/releases) for packaged builds.

### Run the browser development server

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Copy `.env.example` to `.env` to set a different port or provide an OpenRouter key. On-device voice generation requires Apple silicon, and local video processing uses macOS frameworks.

## Set up your first project

1. Open **Settings → Connections → Audio** and download Kokoro for preset voices or Qwen3 for voice cloning. You can also connect an optional provider in **Settings → Connections**.
2. Create a **Story Telling**, **Podcast**, or **Video Dubbing** project. Write or import a script and assign voices to your speakers.
3. Generate a take, review it in the timeline, and export your audio or video.

Projects and media are saved locally. The desktop app uses `~/Library/Application Support/com.pretheesh.mytwin/`, and the browser server uses `data/`. Provider credentials are stored in local files with owner-only permissions and are unencrypted. Local speech generation works offline after setup. Cloud features send the inputs required for the action you submit, and your provider may charge for requests.

## Repository layout

| Path | Contents |
| --- | --- |
| [`public/`](public/) | Interface shared by the desktop app and browser server |
| [`src-tauri/`](src-tauri/) | Rust backend and macOS app bundle |
| [`server.mjs`](server.mjs), [`lib/`](lib/) | Local HTTP server, storage, and provider integrations |
| [`local-tts/`](local-tts/) | On-device speech engine, model catalog, and Python lockfile |
| [`test/`](test/) | Application and integration tests |
| [`website/`](website/) | Project site and user documentation |

See [Contributing](CONTRIBUTING.md) for checks and pull requests, and [Security](SECURITY.md) for vulnerability reporting.
