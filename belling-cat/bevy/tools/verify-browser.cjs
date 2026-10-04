// Run against a local Trunk preview and a Chromium CDP endpoint.
// Screenshots are local verification artifacts, not distributable game builds.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const targets = await (await fetch('http://127.0.0.1:9238/json/list')).json();
  const target = targets.find(t => t.type === 'page');
  assert.ok(target, 'No browser page available');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve);
    socket.addEventListener('error', reject);
  });
  const pending = new Map();
  const errors = [];
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(JSON.stringify(message.error)));
      else handler.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(JSON.stringify(message.params.exceptionDetails));
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      if (!message.params.entry.url?.endsWith('/favicon.ico')) errors.push(message.params.entry.text);
    }
  });
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function keyEvent(type, code, key, windowsVirtualKeyCode) {
    await cdp('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode });
  }
  async function key(code, key, virtualKey, hold = 250) {
    await keyEvent('keyDown', code, key, virtualKey);
    await sleep(hold);
    await keyEvent('keyUp', code, key, virtualKey);
    await sleep(650);
  }
  fs.mkdirSync(path.join(__dirname, '../verification'), { recursive: true });
  async function shot(name) {
    const result = await cdp('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, `../verification/${name}.png`), Buffer.from(result.data, 'base64'));
    return result.data;
  }

  try {
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Log.enable');
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1180, height: 1040, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: process.env.COMIC_TEST_URL || 'http://127.0.0.1:8138/' });
    let loaded = false;
    for (let i = 0; i < 120; i++) {
      if (errors.length) throw new Error(errors.join('\n'));
      loaded = await evaluate("!!document.querySelector('canvas') && !document.getElementById('loading') && document.querySelector('canvas').width > 0");
      if (loaded) break;
      await sleep(500);
    }
    assert.ok(loaded, 'Game did not start');
    await sleep(2500);
    await evaluate("document.querySelector('canvas').focus()");
    const initial = await shot('01-kitchen');
    // Z outside the interaction radius leaves the canvas unchanged.
    await key('KeyZ', 'z', 90);
    assert.equal(await shot('02-out-of-range'), initial, 'Out-of-range Z changed the scene');
    // SwiftShader can render at only a few frames/second on a busy CI desktop.
    // Walk to the right-hand panel bound rather than relying on a precise wall time.
    await key('ArrowRight', 'ArrowRight', 39, 6500);
    await sleep(1000);
    const near = await shot('03-near-bell');
    assert.notEqual(near, initial, 'Walking did not move the mouse');
    await keyEvent('keyDown', 'KeyZ', 'z', 90);
    await sleep(650);
    const slide = await shot('04-sliding');
    assert.notEqual(slide, near, 'Camera did not start sliding');
    // Holding Z for longer than the transition must not consume the dialogue.
    await keyEvent('keyDown', 'ArrowRight', 'ArrowRight', 39);
    await sleep(4500);
    await keyEvent('keyUp', 'KeyZ', 'z', 90);
    await keyEvent('keyUp', 'ArrowRight', 'ArrowRight', 39);
    const talking = await shot('05-dialogue');
    assert.notEqual(talking, slide, 'Camera did not reach the interaction panel');
    await sleep(1500);
    // First line is complete; advance, reveal and advance the remaining lines.
    await key('KeyZ', 'z', 90);
    await key('KeyZ', 'z', 90);
    await key('KeyZ', 'z', 90);
    await key('KeyZ', 'z', 90);
    await key('KeyZ', 'z', 90);
    await sleep(2500);
    const returned = await shot('06-returned');
    assert.equal(returned, near, 'The round trip did not preserve the original frame/position');
    await key('ArrowLeft', 'ArrowLeft', 37, 1200);
    await sleep(1000);
    const moved = await shot('07-moving-again');
    assert.notEqual(moved, returned, 'Movement did not unlock on return');
    await evaluate("document.querySelector('canvas').focus()");
    await keyEvent('keyDown', 'Space', ' ', 32);
    await sleep(300);
    await keyEvent('keyUp', 'Space', ' ', 32);
    assert.notEqual(await shot('08-jump'), moved, 'Jump did not change the pose/height');
    await sleep(2000);
    assert.equal(await shot('08-landed'), moved, 'Jump did not land at the same position');
    await key('KeyR', 'r', 82);
    assert.equal(await shot('09-restarted'), initial, 'Restart did not restore the initial panel');
    assert.deepEqual(errors, [], 'Browser reported runtime errors');
    console.log('PASS: startup, range gate, walking, camera slide, held Z, dialogue, locked movement, exact return, resumed movement, jump and restart.');
    console.log('Screenshots: belling-cat/bevy/verification/');
  } finally {
    socket.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
