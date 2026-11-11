# VoiceStudio Compose example

VoiceStudio is an optional self-hosted speech provider. The pinned [Compose example](compose.yaml) targets an ARM64 Linux host with an NVIDIA GPU and Docker Compose.

Set `OMNIVOICE_API_KEY` in a local `.env` file. The example binds port 3900 to loopback and stores application data and models in `./data` and `./models`. For an existing installation, set `VOICESTUDIO_DATA_DIR` and `VOICESTUDIO_MODELS_DIR` to its current directories before starting the service. Set `VOICESTUDIO_BIND_ADDRESS` if a trusted private network needs direct access.

```sh
docker compose up -d
```

In Fikr Vox, enter your server URL and API key under **Settings → Connections → Audio → VoiceStudio**. The Compose example disables Torch compilation and selects PyTorch Whisper for GPU compatibility. VoiceStudio and its models have their own usage terms.
