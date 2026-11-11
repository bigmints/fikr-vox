import test from 'node:test';
import assert from 'node:assert/strict';
import {isLocalDesign,designEngineFor} from '../public/local-voices.js';
import {localCatalog} from '../lib/local-tts.mjs';
test('saved descriptions reopen the correct designer and retain older Qwen voices',()=>{
 assert.equal(designEngineFor({voiceDesign:{engine:'omnivoice-design'}}),'omnivoice-design');
 assert.equal(designEngineFor({voiceDesign:{instruct:'Original Qwen description'}}),'qwen3-design');
 assert.equal(designEngineFor({}), '');
 assert.ok(isLocalDesign('omnivoice-design'));assert.ok(isLocalDesign('qwen3-design'));assert.ok(!isLocalDesign('omnivoice'));
 assert.equal(localCatalog['omnivoice-design'].cacheEngine,'omnivoice');assert.equal(localCatalog['omnivoice-design'].cloneEngine,'omnivoice');assert.equal(localCatalog['omnivoice-design'].languages.ml,'Malayalam');
});
