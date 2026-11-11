"""One-operation, offline transcription/translation worker owned by the app."""
import contextlib
import gc
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import threading
import time

CATALOG=json.loads(Path(__file__).with_name('language-catalog.json').read_text())

def validate(request, operation):
    model=CATALOG.get(request.get('model'))
    if not model: raise ValueError('Choose a local language model.')
    if operation=='download': return model
    if model['task']!=operation: raise ValueError('Choose a model for this task.')
    if operation=='transcribe':
        if request.get('language','auto')!='auto' and request['language'] not in model['languages']: raise ValueError('This transcription model does not support the selected language.')
        if request.get('task','transcribe') not in ('transcribe','translate'): raise ValueError('Choose transcription or translation to English.')
    else:
        text=request.get('text')
        if not isinstance(text,str) or not text.strip() or len(text)>12000: raise ValueError('Use 1–12,000 characters for translation.')
        if request.get('source') not in model['languages'] or request.get('target') not in model['languages']: raise ValueError('This translator does not support the selected language pair.')
        if request['source']==request['target']: raise ValueError('Choose a different target language.')
    return model

def read_audio(path,rate=16000):
    import numpy as np
    import soundfile as sf
    path=Path(path)
    try: info=sf.info(path)
    except sf.LibsndfileError:
        import subprocess
        if sys.platform!='darwin': raise ValueError('Use WAV, MP3, FLAC or M4A for local transcription.')
        probe=subprocess.run(['/usr/bin/afinfo',str(path)],capture_output=True,text=True,timeout=30,env={**os.environ,'LC_ALL':'C'})
        duration=re.search(r'estimated duration:\s*([0-9.]+)\s*sec',probe.stdout)
        if not duration: raise ValueError('Cannot read this recording. Import WAV, MP3, FLAC or M4A.')
        if not 0<float(duration[1])<=600: raise ValueError('Local transcription supports recordings up to 10 minutes. Split longer recordings.')
        with tempfile.TemporaryDirectory(prefix='vox-transcription-') as directory:
            decoded=Path(directory)/'audio.wav'
            run=subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16',str(path),str(decoded)],capture_output=True,timeout=90)
            if run.returncode: raise ValueError('Could not decode this recording.')
            return read_audio(decoded,rate)
    if not 0<info.duration<=600: raise ValueError('Local transcription supports recordings up to 10 minutes. Split longer recordings.')
    audio,sample_rate=sf.read(path,dtype='float32',always_2d=True);audio=audio.mean(axis=1)
    if not np.isfinite(audio).all(): raise ValueError('This recording contains invalid audio.')
    if float(np.max(np.abs(audio)))<.00001: raise ValueError('The recording is silent or too quiet to transcribe.')
    if sample_rate!=rate:
        from math import gcd
        from scipy.signal import resample_poly
        factor=gcd(sample_rate,rate);audio=resample_poly(audio,rate//factor,sample_rate//factor)
    return np.asarray(audio,dtype=np.float32)

def segments(text, tokenizer,limit=450):
    # Split without discarding any input or silently truncating a model context.
    if len(tokenizer.encode(text))<=limit:
        if text.strip(): yield text
        return
    cut=text.rfind(' ',0,len(text)//2)
    if cut<len(text)//4: cut=len(text)//2
    yield from segments(text[:cut],tokenizer,limit)
    yield from segments(text[cut:],tokenizer,limit)

def load_whisper(root,spec,download):
    from huggingface_hub import snapshot_download
    from mlx_audio.stt.utils import load_model
    from transformers import WhisperProcessor
    import warnings
    path=snapshot_download(spec['repo'],revision=spec['revision'],local_files_only=not download,allow_patterns=['config.json','weights.npz'])
    processor=snapshot_download(spec['processorRepo'],revision=spec['processorRevision'],local_files_only=not download,allow_patterns=['*.json','*.txt','*.tiktoken'])
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore',message='Could not load WhisperProcessor:.*')
        model=load_model(path)
    model._processor=WhisperProcessor.from_pretrained(processor,local_files_only=True)
    return model

def load_translator(root):
    import ctranslate2
    from transformers import M2M100Tokenizer
    path=root/'language-models/m2m100'
    tokenizer=M2M100Tokenizer.from_pretrained(str(path),local_files_only=True)
    model=ctranslate2.Translator(str(path),device='cpu',compute_type='int8',inter_threads=1,intra_threads=min(4,os.cpu_count() or 1))
    return model,tokenizer

def translate(model,tokenizer,text,source,target):
    tokenizer.src_lang=source
    target_token=tokenizer.convert_ids_to_tokens(tokenizer.get_lang_id(target))
    output=[]
    for paragraph in text.split('\n'):
        translated=[]
        for part in segments(paragraph,tokenizer):
            tokens=tokenizer.convert_ids_to_tokens(tokenizer.encode(part))
            results=model.translate_batch([tokens],target_prefix=[[target_token]],beam_size=4,max_decoding_length=512)
            generated=results[0].hypotheses[0]
            if len(generated)>=512: raise ValueError('This translation was too long. Split the script into shorter sections.')
            translated.append(tokenizer.decode(tokenizer.convert_tokens_to_ids(generated),skip_special_tokens=True).strip())
        output.append(' '.join(translated))
    result='\n'.join(output).strip()
    if not result: raise ValueError('The model returned no translation.')
    return result

def operate(root,operation,request):
    root.mkdir(parents=True,exist_ok=True)
    os.environ.update(HF_HOME=str(root/'models'),HF_HUB_DISABLE_TELEMETRY='1',HF_HUB_DISABLE_XET='1')
    if operation!='download':os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1')
    spec=validate(request,operation);key=request['model']
    if operation=='download':
        if spec['task']=='transcribe':
            model=load_whisper(root,spec,True);del model
        else:
            from huggingface_hub import snapshot_download
            from ctranslate2.converters import TransformersConverter
            source=root/'language-source/m2m100';pending=root/'language-models/m2m100.partial';target=root/'language-models/m2m100'
            source.mkdir(parents=True,exist_ok=True);pending.parent.mkdir(parents=True,exist_ok=True)
            snapshot_download(spec['repo'],revision=spec['revision'],local_dir=source,allow_patterns=['*.json','pytorch_model.bin','sentencepiece.bpe.model'])
            files=[name for name in ['sentencepiece.bpe.model','vocab.json','tokenizer_config.json','special_tokens_map.json'] if (source/name).exists()]
            TransformersConverter(str(source),copy_files=files).convert(str(pending),quantization='int8',force=True)
            if target.exists():shutil.rmtree(target)
            pending.replace(target)
            model,tokenizer=load_translator(root);translate(model,tokenizer,'Hello, welcome to the studio.','en','fr');del model,tokenizer;gc.collect()
            shutil.rmtree(source)
        marker=root/('language-'+key+'.ready.json');temp=marker.with_suffix('.tmp')
        temp.write_text(json.dumps({'revision':spec['revision'],'runtimeVersion':spec.get('runtimeVersion',1),'processorRevision':spec.get('processorRevision')}));temp.replace(marker)
        return {'ready':True}
    if operation=='transcribe':
        audio=read_audio(request['input']);model=load_whisper(root,spec,False)
        result=model.generate(audio,language=None if request.get('language','auto')=='auto' else request['language'],task=request.get('task','transcribe'),verbose=None)
        text=result.text.strip()
        if not text:raise ValueError('No speech was recognized. Try a clearer recording or Whisper Small.')
        return {'text':text,'language':getattr(result,'language',request.get('language','auto')),'provider':'local','model':key,'duration':len(audio)/16000}
    model,tokenizer=load_translator(root)
    return {'text':translate(model,tokenizer,request['text'],request['source'],request['target']),'source':request['source'],'target':request['target'],'provider':'local','model':key}

if __name__=='__main__':
    try:
        parent = int(os.environ.get('MYTWIN_PARENT_PID', '0'))
        def watch_parent():
            while parent:
                time.sleep(2)
                try: os.kill(parent, 0)
                except ProcessLookupError: os._exit(1)
        threading.Thread(target=watch_parent, daemon=True).start()
        with contextlib.redirect_stdout(sys.stderr):result=operate(Path(sys.argv[1]).resolve(),sys.argv[2],json.load(sys.stdin))
        print(json.dumps(result,ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({'error':str(exc)},ensure_ascii=False));sys.exit(1)
