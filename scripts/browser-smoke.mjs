const cdp = process.env.CDP_URL || 'http://127.0.0.1:9234';
const site = process.env.SITE_URL || 'http://127.0.0.1:4185/index.html';

const tabs = await (await fetch(`${cdp}/json/list`)).json();
if (!tabs.length) throw new Error(`No Chrome tabs available at ${cdp}`);

const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
let loadResolve = null;

ws.onmessage = event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if ((msg.method === 'Page.loadEventFired' || msg.method === 'Page.frameStoppedLoading') && loadResolve) {
    loadResolve();
    loadResolve = null;
  }
};

await new Promise(resolve => { ws.onopen = resolve; });

function send(method, params = {}) {
  return new Promise(resolve => {
    const requestId = ++id;
    pending.set(requestId, resolve);
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function evalExpr(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.result.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails));
  return result.result.result.value;
}

async function navigate(url) {
  const loaded = new Promise(resolve => { loadResolve = resolve; });
  await send('Page.navigate', { url });
  await Promise.race([loaded, wait(2500)]);
  await wait(750);
}

async function mobile(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 3,
    mobile: true
  });
  await navigate(`${site}?smoke=${Date.now()}#timeline`);
  return evalExpr(`(() => {
    const list = document.querySelector('.tl-mobile-list');
    const card = document.querySelector('.tl-mobile-card:nth-child(8)');
    if (list) list.scrollTop = 260;
    card?.click();
    const o = {
      d3: !!window.d3,
      data: !!window.HESSE_DATA,
      mobileCards: document.querySelectorAll('.tl-mobile-card').length,
      timelineScrollable: !!list && list.scrollHeight > list.clientHeight,
      timelineScrollHeight: list ? list.scrollHeight : 0,
      timelineClientHeight: list ? list.clientHeight : 0,
      firstCardHeight: document.querySelector('.tl-mobile-card')?.getBoundingClientRect().height || 0,
      timelineScrollTop: list ? list.scrollTop : 0,
      timelineInfo: document.querySelector('#tlInfo .tl-title')?.textContent || ''
    };
    document.querySelector('[data-view="graph"]')?.click();
    document.querySelector('[data-node-id="t02"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 320 }));
    o.focus = document.querySelectorAll('.node-focus').length;
    o.evidence = document.querySelectorAll('.panel .evidence').length;
    document.querySelector('[data-view="image"]')?.click();
    o.imageActive = document.getElementById('imageView').classList.contains('active');
    return o;
  })()`);
}

async function desktop() {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await navigate(`${site}?smoke=${Date.now()}`);
  return evalExpr(`(() => {
    document.querySelector('[data-node-id="t07"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 600, clientY: 300 }));
    document.querySelector('[data-view="timeline"]')?.click();
    document.querySelector('.tl-era')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 280, clientY: 120 }));
    document.querySelector('.tl-card')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 280, clientY: 330 }));
    return {
      d3: !!window.d3,
      data: !!window.HESSE_DATA,
      nodes: document.querySelectorAll('[data-node-id]').length,
      focused: document.querySelectorAll('.node-focus').length,
      dimmed: document.querySelectorAll('.node-dim').length,
      panelOpen: document.getElementById('detailPanel').classList.contains('open'),
      eras: document.querySelectorAll('.tl-era').length,
      timelineCards: document.querySelectorAll('.tl-card').length,
      timelineInfo: document.querySelector('#tlInfo .tl-title')?.textContent || '',
      focusCoreAria: document.getElementById('focusCore').getAttribute('aria-pressed')
    };
  })()`);
}

await send('Page.enable');
await send('Runtime.enable');

const report = {
  mobile390: await mobile(390, 844),
  mobile375: await mobile(375, 667),
  desktop: await desktop()
};

ws.close();

const failures = [];
for (const [name, item] of Object.entries(report)) {
  if (!item.d3) failures.push(`${name}: d3 missing`);
  if (!item.data) failures.push(`${name}: data missing`);
}
if (report.mobile390.mobileCards !== 11) failures.push('mobile390: expected 11 timeline cards');
if (!report.mobile390.timelineScrollable) failures.push('mobile390: timeline should scroll');
if (report.mobile375.mobileCards !== 11) failures.push('mobile375: expected 11 timeline cards');
if (!report.mobile375.timelineScrollable) failures.push('mobile375: timeline should scroll');
if (report.desktop.nodes !== 51) failures.push('desktop: expected 51 graph nodes');
if (report.desktop.eras !== 4) failures.push('desktop: expected 4 timeline eras');
if (report.desktop.timelineCards !== 11) failures.push('desktop: expected 11 timeline cards');

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error('Browser smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
