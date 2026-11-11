"""Collect notices from the locked Mac app and installed optional speech runtime."""
import email, hashlib, json, re, subprocess, sys, tomllib
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'public' / 'third-party-notices.json'
texts, components = {}, []
def read(path): return path.read_text(encoding='utf-8', errors='replace')
def notice_files(directory, recursive=False):
    return sorted(p for p in (directory.rglob('*') if recursive else directory.iterdir()) if p.is_file() and re.match(r'^(licen[sc]e|copying|copyright|notice)([._-]|$)', p.name, re.I))
def text_id(name, content):
    key = hashlib.sha256(content.encode()).hexdigest()[:24]
    texts[key] = content
    return {'name': name, 'textId': key}
def record(name, version, license, category, source, files):
    components.append(dict(name=name, version=version, license=license or 'Not specified', category=category, source=source, notices=[text_id(p.name, read(p)) for p in files]))
config = json.loads(read(ROOT / 'src-tauri' / 'tauri.conf.json'))
manifest = ROOT / 'src-tauri' / 'Cargo.toml'
app_crate = tomllib.loads(read(manifest))['package']['name']
target = next(line.split(': ', 1)[1] for line in subprocess.check_output(['rustc', '-vV'], text=True).splitlines() if line.startswith('host:'))
tree = subprocess.check_output(['cargo', 'tree', '--manifest-path', str(manifest), '--locked', '--offline', '--target', target, '--edges', 'normal', '--prefix', 'none', '--format', '{p} [{l}]'], text=True)
roots = list((Path.home()/'.cargo/registry/src').glob('*'))
for name, version, license in sorted(set(re.findall(r'^([\w-]+) v([^ ]+) \[(.*?)\]', tree, re.M))):
    if name == app_crate: continue
    directory = next((r/f'{name}-{version}' for r in roots if (r/f'{name}-{version}'/'Cargo.toml').exists()), None)
    if directory is None: raise RuntimeError(f'Missing cached source for {name} {version}')
    meta = tomllib.loads(read(directory/'Cargo.toml'))['package']
    files = notice_files(directory)
    if meta.get('license-file'):
        extra = (directory/meta['license-file']).resolve()
        if extra.is_relative_to(directory.resolve()) and extra.is_file() and extra not in files: files.append(extra)
    record(name, version, license or meta.get('license'), 'Native app', f'https://crates.io/crates/{name}/{version}', files)
uv_version = subprocess.check_output([str(ROOT/'local-tts/uv-aarch64-apple-darwin'), '--version'], text=True).split()[1]
record('uv', uv_version, 'Apache-2.0 OR MIT', 'Bundled tools', f'https://github.com/astral-sh/uv/tree/{uv_version}', [ROOT/'local-tts/UV-LICENSE-APACHE', ROOT/'local-tts/UV-LICENSE-MIT'])
lock = tomllib.loads(read(ROOT/'local-tts/uv.lock'))
locked = {(re.sub(r'[-_.]+','-',p['name']).lower(),p['version']) for p in lock['package'] if 'version' in p}
site = Path.home()/'Library/Application Support/com.pretheesh.mytwin/local-tts/venv/lib/python3.11/site-packages'
if site.is_dir():
    for directory in sorted(site.glob('*.dist-info')):
        file = directory/'METADATA'
        if not file.is_file(): continue
        meta = email.message_from_string(read(file)); name,version = meta['Name'],meta['Version']
        if (re.sub(r'[-_.]+','-',name).lower(), version) not in locked: continue
        license = meta['License-Expression'] or meta['License'] or ''
        files = notice_files(directory, recursive=True)
        if len(license)>150 or '\n' in license:
            if not files: files = []
            full = license
            license = ' / '.join(c.split(' :: ')[-1] for c in meta.get_all('Classifier',[]) if c.startswith('License ::')) or 'See license text'
        else: full = ''
        if not license: license = ' / '.join(c.split(' :: ')[-1] for c in meta.get_all('Classifier',[]) if c.startswith('License ::'))
        record(name, version, license, 'Speech runtime', (f'https://github.com/explosion/spacy-models/releases/tag/en_core_web_sm-{version}' if re.sub(r'[-_.]+','-',name).lower()=='en-core-web-sm' else f'https://pypi.org/project/{quote(name)}/{version}/'), files)
        if full and not files: components[-1]['notices']=[text_id('License metadata',full)]
elif OUTPUT.exists():
    old=json.loads(read(OUTPUT))
    for component in old['components']:
        if component['category']=='Speech runtime' and (re.sub(r'[-_.]+','-',component['name']).lower(),component['version']) in locked:
            components.append(component)
            for notice in component['notices']: texts[notice['textId']]=old['texts'][notice['textId']]
application = next((ROOT/name for name in ['LICENSE','LICENSE.md','LICENSE.txt','COPYING'] if (ROOT/name).is_file()), None)
info={'name':config['productName'],'version':config['version'],'platform':'macOS · Apple silicon' if target.startswith('aarch64-apple') else 'macOS · Intel' if 'apple' in target else target,'generatedAt':datetime.now(timezone.utc).isoformat(),'models':[{'name':m['name'].split(' (')[0],'repo':m['repo'],'license':m.get('license','Apache-2.0'),'source':'https://huggingface.co/'+m['repo']+'/blob/'+m['revision']+'/README.md'} for m in [*json.loads(read(ROOT/'local-tts/catalog.json')).values(),*json.loads(read(ROOT/'local-tts/language-catalog.json')).values()]],'applicationLicense':read(application) if application else None,'applicationLicenseFile':application.name if application else None}
(ROOT/'public/app-info.json').write_text(json.dumps(info,indent=2)+'\n')
OUTPUT.write_text(json.dumps({'components':sorted(components,key=lambda c:(c['category'],c['name'].lower(),c['version'])),'texts':texts},ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Collected {len(components)} component notices ({len(texts)} unique texts).')
