const firstVideo = document.querySelector('#firstVideo');
const secondVideo = document.querySelector('#secondVideo');
const secondButton = document.querySelector('#second');
const logElement = document.querySelector('#log');
const query = new URLSearchParams(location.search);

let firstStream = null;
let secondStream = null;
let firstVideoDeviceId = '';
let firstRequestFinished = false;
let simulationSequence = 0;

const firstConstraints = {
  audio: true,
  video: true
};

function checked(id) {
  return document.querySelector(`#${id}`).checked;
}

function json(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function pageState() {
  const navigation = performance.getEntriesByType('navigation')[0];
  return json({
    href: location.href,
    referrer: document.referrer,
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
    userActivation: navigator.userActivation
      ? navigator.userActivation.isActive
      : 'unsupported',
    navigationType: navigation?.type || 'unknown',
    timeOrigin: performance.timeOrigin
  });
}

function log(message, isError = false) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
  const item = document.createElement('span');
  item.textContent = `${line}\n`;
  if (isError) item.className = 'error';
  logElement.append(item);
  logElement.scrollTop = logElement.scrollHeight;
  console[isError ? 'error' : 'log'](line);
}

function logPageState(label) {
  log(`${label} pageState=${pageState()}`);
}

function info(stream, label) {
  log(`${label} stream id=${stream.id}`);
  stream.getTracks().forEach(track => {
    log(`${label} ${track.kind} track id=${track.id}, readyState=${track.readyState}, label=${track.label}`);
    log(`${label} ${track.kind} settings=${json(track.getSettings())}`);
  });
}

function secondConstraints() {
  if (!checked('useProjectConstraints')) {
    return { video: true };
  }

  const video = {
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 30 },
    advanced: [
      { height: { min: 360 } },
      { width: { min: 640 } },
      { width: { max: 640 } },
      { height: { max: 360 } }
    ]
  };

  if (firstVideoDeviceId) {
    video.deviceId = { exact: [firstVideoDeviceId] };
  }
  return { video };
}

async function requestFirst() {
  if (firstStream || firstRequestFinished) {
    log('第一次请求已执行过；如需重测，请点击“停止所有轨道”。');
    return firstStream;
  }

  logPageState('第一次请求前');
  log(`getUserMedia call\nAudio constraints: ${json(firstConstraints)}\nVideo constraints: true`);

  try {
    firstStream = await navigator.mediaDevices.getUserMedia(firstConstraints);
    firstRequestFinished = true;
    firstVideoDeviceId = firstStream.getVideoTracks()[0]?.getSettings().deviceId || '';
    info(firstStream, '第一次请求成功');

    if (checked('stopProbe')) {
      firstVideo.srcObject = null;
      firstStream.getTracks().forEach(track => track.stop());
      log('第一次探测流已立即停止。');
    } else {
      firstVideo.srcObject = firstStream;
      log('第一次流保持打开。');
    }

    logPageState('第一次请求结束');
    secondButton.disabled = false;
    return firstStream;
  } catch (error) {
    firstRequestFinished = true;
    logPageState('第一次请求失败时');
    log(`第一次请求失败：${error.name}: ${error.message || '(无 message)'}`, true);
    throw error;
  }
}

async function requestSecond() {
  secondStream?.getTracks().forEach(track => track.stop());

  const constraints = secondConstraints();
  logPageState('第二次请求前');
  log(`getUserMedia call\nAudio constraints: false\nVideo constraints: ${json(constraints.video)}`);

  try {
    secondStream = await navigator.mediaDevices.getUserMedia(constraints);
    secondVideo.srcObject = secondStream;
    info(secondStream, '第二次请求成功');
    logPageState('第二次请求结束');
    return secondStream;
  } catch (error) {
    logPageState('第二次请求失败时');
    log(`第二次请求失败：${error.name}: ${error.message || '(无 message)'}`, true);
    throw error;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function simulationRequest(label, constraints) {
  const startedAt = performance.now();
  logPageState(`${label}开始前`);
  log(`${label} getUserMedia call\nconstraints=${json(constraints)}`);

  return navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    log(`${label}成功，耗时=${Math.round(performance.now() - startedAt)} ms，stream=${stream.id}`);
    info(stream, label);
    return stream;
  }).catch(error => {
    log(`${label}失败，耗时=${Math.round(performance.now() - startedAt)} ms：${error.name}: ${error.message || '(无 message)'}`, true);
    throw error;
  });
}

async function simulateRemount() {
  const sequence = ++simulationSequence;
  const cleanupDelay = Math.max(0, Number(document.querySelector('#simulationCleanupDelay').value) || 0);

  log('--- 开始模拟：旧请求未结束 → cleanup → 重挂载 → 新请求 ---');
  log('注意：cleanup 不会主动取消浏览器原生 getUserMedia Promise，只会让旧组件不再接收结果。');

  const oldRequest = simulationRequest(`SIM#${sequence} 旧组件请求`, firstConstraints)
    .then(stream => {
      stream.getTracks().forEach(track => track.stop());
      log(`SIM#${sequence} 旧组件请求晚到，组件已卸载，已停止它返回的轨道`);
      return stream;
    })
    .catch(() => null);

  await wait(cleanupDelay);
  log(`SIM#${sequence} 模拟组件 cleanup：忽略旧请求结果，不调用 abort()`);
  logPageState(`SIM#${sequence} cleanup 时`);

  const newRequest = simulationRequest(`SIM#${sequence} 新组件请求`, firstConstraints)
    .then(stream => {
      stream.getTracks().forEach(track => track.stop());
      log(`SIM#${sequence} 新组件请求返回，已停止新请求轨道`);
      return stream;
    })
    .catch(() => null);

  await Promise.all([oldRequest, newRequest]);
  log(`--- SIM#${sequence} 结束：两个请求均已 settle ---`);
}

async function runAll() {
  log('--- 开始 Preview 自动流程 ---');
  try {
    await requestFirst();
    if (checked('runSecond')) {
      const delay = Math.max(0, Number(document.querySelector('#secondDelay').value) || 0);
      if (delay) {
        log(`等待 ${delay} ms 后开始第二次请求`);
        await wait(delay);
      }
      await requestSecond();
    }
  } catch (_) {
    // 错误已经写入页面日志。
  }
  log('--- Preview 自动流程结束 ---');
}

function stopAll() {
  [firstStream, secondStream].forEach(stream => {
    stream?.getTracks().forEach(track => track.stop());
  });
  firstStream = null;
  secondStream = null;
  firstVideoDeviceId = '';
  firstRequestFinished = false;
  firstVideo.srcObject = null;
  secondVideo.srcObject = null;
  secondButton.disabled = true;
  log('已停止所有轨道，可以重新测试。');
}

document.querySelector('#runClick').onclick = async () => {
  log('用户点击触发 Preview 请求');
  try { await runAll(); } catch (_) {}
};

document.querySelector('#simulateRemount').onclick = async () => {
  try { await simulateRemount(); } catch (_) {}
};

document.querySelector('#first').onclick = async () => {
  try { await requestFirst(); } catch (_) {}
};

secondButton.onclick = async () => {
  try { await requestSecond(); } catch (_) {}
};

document.querySelector('#stop').onclick = stopAll;
document.querySelector('#back').onclick = () => {
  stopAll();
  location.href = './join.html';
};

['visibilitychange', 'pagehide', 'pageshow', 'blur', 'focus'].forEach(eventName => {
  window.addEventListener(eventName, () => logPageState(`事件 ${eventName}`));
});

log(`Preview 页面已加载，origin=${location.origin}`);
log(`mediaDevices=${Boolean(navigator.mediaDevices)}, getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`);
logPageState('页面加载时');

if (query.get('auto') === '0') {
  document.querySelector('#autoRun').checked = false;
}

if (checked('autoRun')) {
  log('页面加载后自动执行第一次请求（模拟线上 useEffect）');
  runAll();
} else {
  log('未自动执行，请点击“用户点击后请求”。');
}
