import './prepare-local-tts.mjs';
import './prepare-language-tools.mjs';
import {execFileSync} from 'node:child_process';
execFileSync('python3',[new URL('./generate-notices.py',import.meta.url).pathname],{stdio:'inherit'});
