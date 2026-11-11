"""Maintainer tool: create fixed synthetic references, never user recordings.
Run with Fikr Vox's MLX Python after downloading the pinned OmniVoice model.
The generated WAVs ship with the app so voices don't change on each take.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[1]
CACHE = Path(sys.argv[1] if len(sys.argv) > 1 else REPO / 'data/local-tts').resolve()
os.environ.update(HF_HOME=str(CACHE / 'models'), HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
import mlx.core as mx
import numpy as np
import soundfile as sf
from huggingface_hub import snapshot_download
from mlx_audio.tts.utils import load_model

spec = json.loads((REPO / 'local-tts/catalog.json').read_text())['omnivoice']
model = load_model(snapshot_download(spec['repo'], revision=spec['revision'], local_files_only=True, ignore_patterns=['samples/*', '*.pt', '*.md', '.gitattributes']), model_type='omnivoice')
text = 'Welcome to Fikr Vox. This is a clear and natural speaking voice. We can explore new ideas together, tell a story, and take a moment to explain each detail.'
voices = [
    ('maya', 'Maya · Female · Medium pitch', 'female, young adult, moderate pitch', 181),
    ('tara', 'Tara · Female · Lower pitch', 'female, middle-aged, low pitch', 291),
    ('arun', 'Arun · Male · Medium pitch', 'male, young adult, moderate pitch', 371),
    ('dev', 'Dev · Male · Lower pitch', 'male, middle-aged, low pitch', 487),
]
directory = REPO / 'local-tts/voices/omnivoice-v1'
directory.mkdir(parents=True, exist_ok=True)
manifest = {'source': spec['repo'], 'revision': spec['revision'], 'version': 1, 'synthetic': True, 'referenceText': text, 'voices': {}}
for voice, name, instruct, seed in voices:
    mx.random.seed(seed)
    audio = np.concatenate([np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in model.generate(text, language='en', instruct=instruct, num_steps=32)])
    if not np.isfinite(audio).all() or not 3 <= len(audio)/24000 <= 30 or np.sqrt(np.mean(audio*audio)) < .005:
        raise RuntimeError(f'Invalid preset reference: {voice}')
    peak = np.max(np.abs(audio))
    if peak > .95:
        audio *= .95 / peak
    path = directory / f'{voice}.wav'
    sf.write(path, audio, 24000, subtype='PCM_16')
    manifest['voices'][voice] = {'name': name, 'file': path.name, 'instruct': instruct, 'seed': seed, 'duration': len(audio)/24000, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    print(f'Created {voice}: {len(audio)/24000:.2f}s', flush=True)
# Malayalam gets a fixed reference in the target language for pronunciation.
malayalam_text = 'നമസ്കാരം. നമ്മുടെ പോഡ്കാസ്റ്റിലേക്ക് സ്വാഗതം. ഇന്ന് ഒരു പുതിയ ആശയം നമുക്ക് ഒരുമിച്ച് പരിചയപ്പെടാം.'
for voice, gender, seed in [('maya','female',192),('tara','female',296),('arun','male',192),('dev','male',487)]:
    mx.random.seed(seed)
    audio = np.concatenate([np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in model.generate(malayalam_text, language='ml', instruct=gender, num_steps=64, duration_s=9.0)])
    if not np.isfinite(audio).all() or np.sqrt(np.mean(audio*audio)) < .005:
        raise RuntimeError(f'Invalid Malayalam reference: {voice}')
    peak = np.max(np.abs(audio))
    if peak > .95:
        audio *= .95 / peak
    path = directory / f'{voice}-ml.wav'
    sf.write(path, audio, 24000, subtype='PCM_16')
    manifest['voices'][voice]['malayalam'] = {'file':path.name, 'text':malayalam_text, 'instruct':gender, 'seed':seed, 'steps':64, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    print(f'Created Malayalam {voice}', flush=True)
(directory / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
# Keep the shipped catalog and fixed reference checksums in sync.
catalog_path = REPO / 'local-tts/catalog.json'
catalog = json.loads(catalog_path.read_text())
if 'omnivoice-presets' in catalog:
    catalog['omnivoice-presets']['voiceReferences'] = {
        key: {'file':'voices/omnivoice-v1/'+item['file'], 'text':text, 'sha256':item['sha256'],
              'languages':{'ml':{'file':'voices/omnivoice-v1/'+item['malayalam']['file'], 'text':malayalam_text, 'sha256':item['malayalam']['sha256']}}}
        for key, item in manifest['voices'].items()
    }
    catalog['omnivoice-presets']['generationSteps'] = {'ml':64}
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False)+'\n')
