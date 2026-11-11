# VoiceStudio deployment files

VoiceStudio is an optional self-hosted speech provider. In Fikr Vox, open **Settings → Connections → Audio → VoiceStudio** to enter your server URL and API key.

This directory contains a pinned ARM64 Compose example for an NVIDIA GPU host, a smoke-test script, and dashboard integration files. Review the bind addresses and volume paths in [`compose.yaml`](compose.yaml) before using it on another host. Set `OMNIVOICE_API_KEY` in a local `.env` file.

The example disables Torch compilation and selects PyTorch Whisper for compatibility with the original GPU environment. VoiceStudio and its models have their own usage terms.
