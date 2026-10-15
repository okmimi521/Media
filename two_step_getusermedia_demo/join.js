const joinView = document.querySelector('#joinView');
const previewView = document.querySelector('#previewView');
const logElement = document.querySelector('#log');
const video = document.querySelector('#video');

const firstConstraints = { audio: true, video: true };
let previewGeneration = 0;
let activeStreams = [];
let firstVideoDeviceId = '';

function log(message) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${message}`;
  logElement.textContent += `${line}\n`;
  logElement.scrollTop = logElement.scrollHeight;
  console.log(line);
}

function json(value) {
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function stopStream(stream) {
  stream?.getTracks().forEach(track => track.stop());
}

function stopAllStreams() {
  activeStreams.forEach(stopStream);
  activeStreams = [];
  video.srcObject = null;
  firstVideoDeviceId = '';
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function secondConstraints() {
  const videoConstraints = {
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
    videoConstraints.deviceId = { exact: [firstVideoDeviceId] };
  }
  return { video: videoConstraints };
}

async function requestMedia(generation, label, constraints) {
  log(`${label} getUserMedia call: ${json(constraints)}`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    log(`${label} getUserMedia result: stream=${stream.id}`);

    if (generation !== previewGeneration) {
      log(`${label} 返回时 Preview 已卸载，模拟 React cleanup，停止旧流`);
      stopStream(stream);
      return null;
    }
    return stream;
  } catch (error) {
    log(`${label} 失败：${error.name}: ${error.message || '(无 message)'}`);
    return null;
  }
}

async function runPreview(generation) {
  log('Preview effect 开始');

  const firstStream = await requestMedia(generation, '第一次 audio + video', firstConstraints);
  if (!firstStream || generation !== previewGeneration) {
    return;
  }

  firstVideoDeviceId = firstStream.getVideoTracks()[0]?.getSettings().deviceId || '';
  log(`第一次探测完成，deviceId=${firstVideoDeviceId || '(未知)'}`);
  stopStream(firstStream);

  // 模拟 Zoom SDK 初始化、设备刷新和 React 状态更新。
  log('模拟 SDK 初始化和设备刷新，等待 300ms');
  await wait(300);
  if (generation !== previewGeneration) {
    log('SDK 初始化期间 Preview 已卸载，停止本次流程');
    return;
  }

  const secondStream = await requestMedia(generation, '第二次 video', secondConstraints());
  if (!secondStream) {
    return;
  }
  activeStreams = [secondStream];
  video.srcObject = secondStream;
  log('第二次 video 已绑定到 Preview');
}

function mountPreview(writeHistory = true) {
  joinView.hidden = true;
  previewView.hidden = false;
  if (writeHistory) {
    history.pushState({ view: 'preview' }, '', `${location.pathname}?view=preview`);
  }

  const generation = ++previewGeneration;
  log('Join 完成：同一文档切换到 Preview，URL 已更新');
  log(`Preview mount generation=${generation}`);
  setTimeout(() => runPreview(generation), 0);
  const autoRemount = document.querySelector('#autoRemount');
  if (autoRemount.checked) {
    autoRemount.checked = false;
    setTimeout(remountPreview, 100);
  }
}

function unmountPreview() {
  previewGeneration += 1;
  stopAllStreams();
  log(`Preview cleanup generation=${previewGeneration}`);
}

function remountPreview() {
  log('开始模拟：旧 Preview cleanup，但旧 getUserMedia 不主动 abort');
  unmountPreview();
  setTimeout(() => {
    if (!previewView.hidden) {
      mountPreview(false);
    }
  }, 50);
}

function showJoin(writeHistory = true) {
  unmountPreview();
  previewView.hidden = true;
  joinView.hidden = false;
  if (writeHistory) {
    history.pushState({ view: 'join' }, '', location.pathname);
  }
}

document.querySelector('#join').addEventListener('click', () => mountPreview(true));

document.querySelector('#remount').addEventListener('click', remountPreview);

document.querySelector('#stop').addEventListener('click', () => {
  unmountPreview();
  log('已停止当前 Preview 流程');
});

document.querySelector('#back').addEventListener('click', () => showJoin(true));

window.addEventListener('popstate', () => {
  if (new URLSearchParams(location.search).get('view') === 'preview') {
    mountPreview(false);
  } else {
    showJoin(false);
  }
});

['visibilitychange', 'pagehide', 'pageshow', 'blur', 'focus'].forEach(eventName => {
  window.addEventListener(eventName, () => log(`页面事件：${eventName}, visibility=${document.visibilityState}`));
});

log(`单页 Demo 已加载，origin=${location.origin}`);
log(`href=${location.href}`);

if (new URLSearchParams(location.search).get('view') === 'preview') {
  mountPreview(false);
} else {
  log('当前为 Join 状态，等待点击 Join');
}
