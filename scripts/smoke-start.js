'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

(async () => {
  const port = 34051;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TIKTOK_USER: '', ENABLE_ZEROTTS: '0', LOCAL_DEV_UNSAFE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', c => { output += c.toString(); });
  child.stderr.on('data', c => { output += c.toString(); });
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/healthz', {
          signal: AbortSignal.timeout(800)
        });
        const body = await response.json();
        if (response.ok && body.ok === true && body.tts === 'browser-fallback') {
          ready = true;
          break;
        }
      } catch (_) {}
      await sleep(350);
    }
    if (!ready) throw new Error('Node server did not become healthy; log:\n' + output.slice(-5000));
    console.log('PASS Windows/Node smoke: /healthz online without Bun/Python/Google');
  } finally {
    child.kill();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
