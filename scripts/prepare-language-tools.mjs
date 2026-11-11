import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(process.platform==='darwin')execFileSync('/usr/bin/xcrun',['swiftc','-parse-as-library','-O','-target','arm64-apple-macos13.0','-module-cache-path',join(tmpdir(),'vox-language-swift-cache'),fileURLToPath(new URL('../local-tts/apple-language.swift',import.meta.url)),'-o',fileURLToPath(new URL('../local-tts/apple-language-aarch64-apple-darwin',import.meta.url))],{stdio:'inherit'});
