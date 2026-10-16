const logElement = document.querySelector('#log');
const modeElement = document.querySelector('#mode');
const runButton = document.querySelector('#run');

function log(event, details = {}) {
  const record = {
    event,
    time: Math.round(performance.now()),
    timeOrigin: performance.timeOrigin,
    visibility: document.visibilityState,
    focus: document.hasFocus(),
    userActivation: navigator.userActivation?.isActive ?? 'unsupported',
    url: location.pathname + location.search,
    ...details
  };
  const line = JSON.stringify(record);
  logElement.textContent += line + '\n';
  console.log('[URL权限时序]', line);
}

function replaceUrl() {
  const url = new URL(location.href);
  url.searchParams.set('skipChoice', 'true');
  log('replaceState BEFORE');
  history.replaceState(history.state, '', url.href);
  log('replaceState AFTER');
}

async function run() {
  const mode = modeElement.value;
  let pending = false;
  let replaceTimer;
  let stream;
  runButton.disabled = true;
  modeElement.disabled = true;

  if (new URL(location.href).searchParams.has('skipChoice')) {
    log('请点击“重新测试”重置 URL，否则无法模拟新增 skipChoice 参数');
    return;
  }

  try {
    if (mode === 'before') {
      replaceUrl();
      await new Promise(resolve => setTimeout(resolve, 900));
    }

    const constraints = { video: true, audio: true };
    pending = true;
    log('GUM CALL', { mode, constraints });
    const request = navigator.mediaDevices.getUserMedia(constraints);

    if (mode === 'during') {
      replaceTimer = setTimeout(() => {
        if (!pending) return;
        try {
          replaceUrl();
        } catch (error) {
          log('replaceState ERROR', { name: error.name, message: error.message });
        }
      }, 900);
    }

    stream = await request;
    pending = false;
    log('GUM RESOLVE');
    if (mode === 'during' && !new URL(location.href).searchParams.has('skipChoice')) {
      log('请求在 URL 更新前已成功，本轮未覆盖授权框等待期间的 URL 更新');
    }
  } catch (error) {
    pending = false;
    log('GUM REJECT', { name: error.name, message: error.message });
  } finally {
    clearTimeout(replaceTimer);
    stream?.getTracks().forEach(track => track.stop());
  }
}

// 与线上一样，Join 后自动发起请求，无需在 Preview 再点击。
runButton.addEventListener('click', () => {
  log('Join');
  setTimeout(run, 0);
});

document.addEventListener('visibilitychange', () => log('visibilitychange'));
for (const event of ['pagehide', 'pageshow', 'blur', 'focus']) {
  window.addEventListener(event, () => log(event));
}

log('history-race-v1 READY');
