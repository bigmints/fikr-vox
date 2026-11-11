import {copyFile,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const target=new URL('../local-tts/uv-aarch64-apple-darwin',import.meta.url);
const uv=execFileSync('/usr/bin/which',['uv'],{encoding:'utf8'}).trim();
await copyFile(uv,target);await chmod(target,0o755);
