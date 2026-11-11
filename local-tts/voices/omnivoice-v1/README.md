# MyTwin OmniVoice ready-made voices

These four synthetic speaker references were generated locally from the pinned
Apache-2.0 OmniVoice checkpoint using `scripts/create-omnivoice-presets.py`.
They are original generated voices, not recordings of the user or other people.
The manifest records the generation attributes, seeds and SHA-256 checksums.

Keep these references fixed when generating clips in any supported language.
The worker checks each WAV against the catalog before using it, and uses the
exact reference text stored in the catalog. No recording upload is needed.

Rebuild the Mac bundle after changing this voice pack. The Tauri resource map
ships this directory alongside the local engine. Presets share the same cached
model and ready marker as OmniVoice voice cloning.
