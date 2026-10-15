const firstVideo = document.querySelector('#firstVideo');
const secondVideo = document.querySelector('#secondVideo');
const secondButton = document.querySelector('#second');
const logElement = document.querySelector('#log');

let firstStream = null;
let secondStream = null;
let firstVideoDeviceId = '';
let firstRequestFinished = false;

const firstConstraints = {
  audio: true,
  video: true
};

function checked(id) {
  return document.querySelector(`#${id}`).checked;
}

function time() {
  return new Date().toLocaleTimeString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
}

function log(message, isError = false) {
  const line = `[${time()}] ${message}`;
  const item = document.createElement('span');
  item.textContent = `${line}\n`;
  if (isError) item.className = 'error';
  logElement.append(item);
  logElement.scrollTop = logElement.scrollHeight;
  console[isError ? 'error' : 'log'](line);
}

function json(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function pageState() {
  return json({
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
    userActivation: navigator.userActivation
      ? navigator.userActivation.isActive
      : 'unsupported',
    href: location.href,
    origin: location.origin
  });
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
    log('第一次请求已执行过；如需重新测试，请先点击“停止所有轨道”。');
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
      log('第一次探测流已立即停止（模拟线上权限探测）。');
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

async function runAll() {
  log('--- 开始一键执行 ---');
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
  log('--- 一键执行结束 ---');
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

document.querySelector('#runAll').onclick = runAll;

document.querySelector('#runByClick').onclick = async () => {
  log('用户点击触发执行');
  await runAll();
};

document.querySelector('#first').onclick = async () => {
  try { await requestFirst(); } catch (_) {}
};

secondButton.onclick = async () => {
  try { await requestSecond(); } catch (_) {}
};

document.querySelector('#stop').onclick = stopAll;

document.querySelector('#clear').onclick = () => {
  logElement.textContent = '';
};

['visibilitychange', 'pagehide', 'pageshow', 'blur', 'focus'].forEach(eventName => {
  window.addEventListener(eventName, () => logPageState(`事件 ${eventName}`));
});

log(`页面已加载，Caller origin: ${location.origin}`);
log(`mediaDevices=${Boolean(navigator.mediaDevices)}, getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`);
logPageState('页面加载时');

if (checked('autoRun')) {
  log('页面加载后自动执行一键请求（模拟线上 useEffect）');
  runAll();
} else {
  log('未自动执行，请点击按钮开始。');
}
