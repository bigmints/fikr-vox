import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localModelDownloadEntries} from '../public/settings.js';

const catalog=JSON.parse(await readFile(new URL('../local-tts/catalog.json',import.meta.url),'utf8'));
test('OmniVoice is one download with all voice modes retained inside it',()=>{
  const entries=localModelDownloadEntries({models:catalog});
  const omni=entries.filter(entry=>entry.key==='omnivoice');
  assert.equal(omni.length,1);
  assert.deepEqual(omni[0].options.map(([id])=>id),['omnivoice-design','omnivoice-presets','omnivoice']);
  assert.equal(entries.length,Object.keys(catalog).length-2);
  assert.deepEqual(entries.filter(entry=>!entry.options).map(entry=>entry.key).sort(),Object.keys(catalog).filter(id=>!id.startsWith('omnivoice')).sort());
});
test('a shared installed mode makes the OmniVoice package downloaded',()=>{
  const entries=localModelDownloadEntries({models:{'omnivoice-design':{ready:true},'omnivoice-presets':{ready:false},omnivoice:{ready:false}}});
  assert.equal(entries[0].model.ready,true);
  assert.equal(entries[0].key,'omnivoice');
});
test('downloads started through any OmniVoice mode show on the single package',()=>{
  const entry=localModelDownloadEntries({models:{omnivoice:{ready:false}},busy:true,engine:'omnivoice-design'})[0];
  assert.equal(entry.busy,true);
  assert.equal(entry.model.ready,false);
});
