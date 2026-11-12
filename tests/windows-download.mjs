// Dependency-free browser checks: node tests/windows-download.mjs
// Uses local Chrome (or CHROME_PATH), local HTTP, and mocked release responses.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifacts = await mkdtemp(join(tmpdir(), 'lixwey-windows-'));
const missing = [];
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    assert(path === root || path.startsWith(root + sep));
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    missing.push(req.url);
    res.writeHead(404).end();
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${join(artifacts, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const browserWs = await new Promise((done, fail) => {
    let log = '';
    const timer = setTimeout(() => fail(new Error('Chrome startup timed out: ' + log)), 15000);
    chrome.on('error', fail);
    chrome.on('exit', code => { clearTimeout(timer); fail(new Error(`Chrome exited: ${code}`)); });
    chrome.stderr.on('data', chunk => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
  });
  const target = await (await fetch(`http://${new URL(browserWs).host}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();
  const errors = [];
  function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((done, fail) => {
      pending.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.fail(new Error(JSON.stringify(message.error)));
      else task.done(message.result);
    } else {
      for (const handler of listeners.get(message.method) || []) handler(message.params);
    }
  };
  const on = (event, handler) => listeners.set(event, [...(listeners.get(event) || []), handler]);
  const once = event => new Promise(done => {
    const handler = value => { listeners.set(event, listeners.get(event).filter(item => item !== handler)); done(value); };
    on(event, handler);
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function until(expression) {
    const deadline = Date.now() + 16000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise(done => setTimeout(done, 50));
    }
    throw new Error('Condition timed out: ' + expression);
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  on('Runtime.exceptionThrown', data => errors.push(data));
  const fixture = { available: true, latest_version: '1.0', mandatory: false, size_bytes: 69025235, published_at: '2026-11-11T09:56:53.367931+00:00', download_url: 'https://untrusted.example/setup.exe' };
  let scenario = 'available';
  let held;
  let releaseRequests = 0;
  async function respond(requestId) {
    if (scenario === 'offline') return send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
    const body = scenario === 'unavailable' ? { available: false } : { ...fixture, mandatory: scenario === 'mandatory' };
    if (scenario === 'invalid') delete body.latest_version;
    if (scenario === 'text') body.latest_version = '<img src=x onerror=alert(1)>';
    return send('Fetch.fulfillRequest', {
      requestId, responseCode: scenario === 'http-error' ? 503 : 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
      body: Buffer.from(scenario === 'bad-json' ? '{' : JSON.stringify(body)).toString('base64')
    });
  }
  on('Fetch.requestPaused', async ({ requestId, request }) => {
    try {
      if (/\/api\/updates\/(windows|android)/.test(request.url)) {
        const platform = request.url.includes('/updates/android') ? 'android' : 'windows';
        assert.equal(request.url, `https://api.lixwey.ru/api/updates/${platform}?${platform === 'android' ? 'current_version_code=0' : 'current_version=0.0.0'}`);
        releaseRequests++;
        if (scenario === 'loading') { held = requestId; return; }
        await respond(requestId);
      } else {
        await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from('{}').toString('base64') });
      }
    } catch (error) { errors.push(String(error)); }
  });
  const enableMocks = () => send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.lixwey.ru/*' }] });
  await enableMocks();
  async function navigate(path = '/download/windows/') {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: origin + path });
    await loaded;
  }
  const state = () => evaluate(`(() => {
    const byId = id => document.getElementById(id);
    return { status: byId('release-status').textContent, href: byId('windows-download').getAttribute('href'),
      disabled: byId('windows-download').getAttribute('aria-disabled'), version: byId('release-version').textContent,
      size: byId('release-size').textContent, date: byId('release-date').textContent,
      mandatory: Boolean(byId('release-mandatory')), details: !byId('release-details').hidden, retry: !byId('release-retry').hidden };
  })()`);
  const ready = () => until(`document.getElementById('release-panel').getAttribute('aria-busy') === 'false'`);

  if (process.argv.includes('--downloads') || process.argv.includes('--homepage')) {
    // One bounded pass for Android states and both platforms' download layouts.
    fixture.size_bytes = 215272653;
    const current = () => evaluate(`(() => {
      const link = document.querySelector('#android-download, #windows-download');
      return { href: link.getAttribute('href'), disabled: link.getAttribute('aria-disabled'),
        size: document.getElementById('release-size').textContent, version: document.getElementById('release-version').textContent,
        retry: !document.getElementById('release-retry').hidden,
        stores: [...document.querySelectorAll('.store-link')].map(a => ({ href: a.getAttribute('href'), disabled: a.getAttribute('aria-disabled'), soon: a.querySelector('small').textContent })) };
    })()`);
    const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (!process.argv.includes('--homepage')) {
    await viewport(1440);
    for (const name of ['available', 'unavailable', 'http-error', 'offline']) {
      scenario = name;
      await navigate('/download/android/');
      await ready();
      const result = await current();
      assert.equal(result.href, name === 'available' ? 'https://api.lixwey.ru/downloads/android' : null);
      if (name === 'available') {
        assert.equal(result.size, '205,3 МБ');
        assert.equal(result.version, '1.0');
      } else {
        assert.equal(result.disabled, 'true');
        assert.equal(result.retry, true);
        assert.equal(result.version, '');
      }
      assert.deepEqual(result.stores, Array.from({ length: 2 }, () => ({ href: null, disabled: 'true', soon: 'Скоро' })));
      console.log('PASS Android ' + name + '; stores independent and disabled');
    }
    scenario = 'available';
    await evaluate(`document.getElementById('release-retry').click()`);
    await ready();
    assert.equal((await current()).href, 'https://api.lixwey.ru/downloads/android');
    const accelerated = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'const originalTimeout = window.setTimeout; window.setTimeout = (fn, ms, ...args) => originalTimeout(fn, ms === 12000 ? 50 : ms, ...args);' });
    scenario = 'loading';
    await navigate('/download/android/');
    await ready();
    assert.equal((await current()).href, null);
    assert.equal((await current()).retry, true);
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: accelerated.identifier });
    console.log('PASS Android retry and request timeout (accelerated timer)');
    scenario = 'mandatory';
    await navigate('/download/android/');
    await ready();
    assert.equal(await evaluate(`document.body.textContent.includes('Обязательное обновление')`), false);
    for (const width of [1920, 1440, 768, 390, 320]) {
      await viewport(width);
      const layout = await evaluate(`(() => {
        const outside = [...document.querySelectorAll('body *')].filter(el => {
          const r = el.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1);
        }).map(el => el.className || el.tagName);
        const card = document.querySelector('.release-card').getBoundingClientRect();
        const preview = document.querySelector('.android-preview').getBoundingClientRect();
        return { outside, columns: card.right <= preview.left, stacked: preview.top >= card.bottom,
          clipped: [...document.querySelectorAll('a, button')].some(el => el.clientWidth && el.scrollWidth > el.clientWidth),
          scroll: document.documentElement.scrollWidth > innerWidth };
      })()`);
      assert.deepEqual(layout.outside, []);
      assert.equal(layout.clipped, false);
      assert.equal(layout.scroll, false);
      assert.equal(width > 1000 ? layout.columns : layout.stacked, true);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(join(artifacts, 'android-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      console.log('PASS Android layout ' + width);
    }
    await navigate('/download/windows/');
    await ready();
    assert.equal((await current()).size, '205,3 МБ');
    assert.equal((await current()).href, 'https://api.lixwey.ru/downloads/windows');
    for (const width of [1920, 1440]) {
      await viewport(width);
      const aligned = await evaluate(`(() => {
        const a = document.querySelector('.release-card').getBoundingClientRect();
        const b = document.querySelector('.messenger').getBoundingClientRect();
        return Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1;
      })()`);
      assert.equal(aligned, true);
    }
    console.log('PASS Windows size, active link and equal-height cards');
    }
    await navigate('/');
    for (const width of [1920, 1440, 768, 390, 320]) {
      await viewport(width);
      const rows = await evaluate(`(() => [...document.querySelectorAll('#download .platform')].map(row => {
        const a = row.querySelector('a'), s = getComputedStyle(a), r = row.getBoundingClientRect(), b = a.getBoundingClientRect();
        const text = row.querySelector('div').getBoundingClientRect();
        return { label: a.textContent, href: a.getAttribute('href'), rowHeight: r.height, buttonHeight: b.height, buttonWidth: b.width,
          rightGap: r.right - b.right, padding: s.padding, radius: s.borderRadius, gradient: s.backgroundImage,
          fits: b.right <= r.right && b.left >= r.left && a.scrollWidth <= a.clientWidth && text.right <= b.left && text.top >= r.top && text.bottom <= r.bottom };
      }))()`);
      assert.equal(rows.length, 2);
      assert.equal(rows[0].href, '/download/android/');
      assert.equal(rows[1].href, '/download/windows/');
      assert.equal(rows[0].label, 'Скачать');
      assert.equal(rows[1].label, 'Скачать');
      assert.equal(rows[0].fits && rows[1].fits, true);
      const { href: androidHref, ...androidStyle } = rows[0];
      const { href: windowsHref, ...windowsStyle } = rows[1];
      // DOMRect may differ by tiny floating-point errors on a long page.
      for (const key of ['rowHeight', 'buttonHeight', 'buttonWidth', 'rightGap']) {
        assert(Math.abs(androidStyle[key] - windowsStyle[key]) < 0.01, 'Equal button/card dimensions');
        delete androidStyle[key];
        delete windowsStyle[key];
      }
      assert.deepEqual(androidStyle, windowsStyle);
    }
    console.log('PASS homepage equal cards, identical buttons and correct links at five widths');
    assert.deepEqual(missing, []);
    assert.deepEqual(errors, []);
    console.log('Screenshots: ' + artifacts);
  } else {
  scenario = 'loading';
  await navigate();
  await until(`document.getElementById('release-status').textContent.includes('Получаем')`);
  assert.equal((await state()).href, null);
  assert.equal((await state()).version, '');
  while (!held) await new Promise(done => setTimeout(done, 30));
  scenario = 'available';
  await respond(held);
  await ready();
  let result = await state();
  assert.equal(result.href, 'https://api.lixwey.ru/downloads/windows');
  assert.equal(result.version, '1.0');
  assert.equal(result.size, '65,8 МБ');
  assert.match(result.date, /11 ноября 2026/);
  assert.equal(result.mandatory, false);
  console.log('PASS loading and optional release; fixed official download URL');

  for (const [bytes, expected] of [[1048576, '1,0 МБ'], [215167795, '205,2 МБ'], [69025235, '65,8 МБ'], [1, '0,0 МБ'], [null, 'Не указан'], [-1, 'Не указан']]) {
    fixture.size_bytes = bytes;
    await navigate();
    await ready();
    assert.equal((await state()).size, expected);
  }
  fixture.size_bytes = 69025235;
  console.log('PASS binary size conversion from API bytes, fixed decimal precision and invalid sizes');

  for (const name of ['mandatory', 'unavailable', 'http-error', 'offline', 'bad-json', 'invalid']) {
    scenario = name;
    await navigate();
    await ready();
    result = await state();
    if (name === 'mandatory') {
      assert.equal(result.mandatory, false);
      assert.equal(result.href, 'https://api.lixwey.ru/downloads/windows');
    } else {
      assert.equal(result.href, null);
      assert.equal(result.disabled, 'true');
      assert.equal(result.version, '');
      assert.equal(result.details, false);
      assert.equal(result.mandatory, false);
      assert.equal(result.retry, true);
      assert.equal(result.status, name === 'unavailable' ? 'Версия для Windows временно недоступна' : 'Не удалось получить информацию о версии');
    }
    console.log('PASS ' + name);
  }
  scenario = 'available';
  await evaluate(`document.getElementById('release-retry').click()`);
  await ready();
  assert.equal((await state()).version, '1.0');
  await send('Fetch.disable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))`);
  await ready();
  assert.equal((await state()).href, null);
  assert.equal((await state()).version, '');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await enableMocks();
  await evaluate(`document.getElementById('release-retry').click()`);
  await ready();
  console.log('PASS retry, real browser offline mode, stale release cleared');

  scenario = 'text';
  await navigate('/download/windows/?download_url=https://untrusted.example/installer.exe');
  await ready();
  assert.equal((await state()).version, '<img src=x onerror=alert(1)>');
  assert.equal(await evaluate(`document.querySelectorAll('#release-version img').length`), 0);
  assert.equal((await state()).href, 'https://api.lixwey.ru/downloads/windows');
  console.log('PASS API text is inert and arbitrary download URLs are ignored');

  scenario = 'mandatory';
  await navigate();
  await ready();
  assert.equal(await evaluate(`['Обязательное обновление', 'Информация о сборке поступает с сервера Lixwey.', 'Стилизованная иллюстрация интерфейса Lixwey'].some(text => document.body.textContent.includes(text))`), false);
  assert.equal(await evaluate(`Boolean(document.querySelector('.messenger'))`), true);
  console.log('PASS all three captions removed, messenger illustration preserved');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const [width, height] of [[1920,1080],[1440,900],[768,1024],[390,844],[320,568]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    const layout = await evaluate(`(() => {
      const visible = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().width && getComputedStyle(el).visibility !== 'hidden');
      const outside = visible.filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.className || el.tagName);
      const button = document.getElementById('windows-download');
      return { outside, scroll: document.documentElement.scrollWidth > innerWidth, clippedButton: button.scrollWidth > button.clientWidth, motion: getComputedStyle(document.querySelector('.windows-hero')).animationName };
    })()`);
    assert.deepEqual(layout.outside, [], `${width}: content outside viewport`);
    assert.equal(layout.scroll, false);
    assert.equal(layout.clippedButton, false);
    assert.equal(layout.motion, 'none');
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(artifacts, `${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`PASS viewport ${width}x${height}, reduced motion`);
  }
  await navigate('/');
  assert.equal(await evaluate(`document.querySelector('#download a[href="/download/windows/"]').pathname`), '/download/windows/');
  assert.equal(await evaluate(`document.querySelector('#download .platform a').getAttribute('href')`), '/download/android/');
  for (const width of [1920, 1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    const buttons = await evaluate(`(() => {
      const rows = [...document.querySelectorAll('#download .platform')];
      return rows.map(row => {
        const button = row.querySelector('a');
        const style = getComputedStyle(button), r = button.getBoundingClientRect(), rr = row.getBoundingClientRect();
        return { className: button.className, height: r.height, padding: style.padding, borderRadius: style.borderRadius,
          background: style.backgroundImage, color: style.color, shadow: style.boxShadow, transition: style.transition,
          fits: r.left >= rr.left && r.right <= rr.right && button.scrollWidth <= button.clientWidth };
      });
    })()`);
    assert.equal(buttons[0].fits, true, 'Android button fits at ' + width);
    assert.equal(buttons[1].fits, true, 'Windows button fits at ' + width);
    assert.deepEqual(buttons[0], buttons[1], 'Identical button styling at ' + width);
    if (width >= 1440) {
      assert.equal(await evaluate(`(() => {
        const row = document.querySelector('#download .platform:nth-child(2)');
        const text = row.querySelector('div').getBoundingClientRect(), button = row.querySelector('a').getBoundingClientRect();
        return text.right <= button.left && button.top < text.bottom && text.top < button.bottom;
      })()`), true, 'Desktop Windows row keeps text and button side by side');
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(join(artifacts, 'homepage-' + width + '.png'), Buffer.from(shot.data, 'base64'));
    console.log('PASS matching homepage buttons and row layout at ' + width);
  }
  await evaluate(`document.querySelector('#download a[href="/download/windows/"]').click()`);
  await until(`location.pathname === '/download/windows/' && document.getElementById('release-panel')?.getAttribute('aria-busy') === 'false'`);
  for (const path of ['/reports/', '/privacy/']) {
    await navigate(path);
    assert(await evaluate(`Boolean(document.querySelector('main, .form-section, h1, h2'))`));
  }
  assert.deepEqual(missing, [], 'Broken local resource paths');
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  assert(releaseRequests > 10);
  console.log('PASS homepage navigation, Android page link, reports and privacy smoke checks');
  console.log('Screenshots: ' + artifacts);
  }
} finally {
  if (socket) socket.close();
  chrome.kill();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
