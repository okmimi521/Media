const firstVideo = document.querySelector('#firstVideo');
const secondVideo = document.querySelector('#secondVideo');
const secondButton = document.querySelector('#second');
const logElement = document.querySelector('#log');

let firstStream = null;
let secondStream = null;
let firstVideoDeviceId = '';

const firstConstraints = {
  audio: true,
  video: true
};

function secondConstraints() {
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
  return video;
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

function info(stream) {
  log(`Stream id: ${stream.id}`);
  stream.getTracks().forEach(track => {
    log(`${track.kind} track: id=${track.id}, label=${track.label}`);
  });
}

async function requestFirst() {
  if (firstStream) return firstStream;

  log(`Caller origin: ${location.origin}`);
  log(`getUserMedia call\nAudio constraints: ${JSON.stringify(firstConstraints)}\nVideo constraints: true`);

  try {
    firstStream = await navigator.mediaDevices.getUserMedia(firstConstraints);
    firstVideo.srcObject = firstStream;
    firstVideoDeviceId = firstStream.getVideoTracks()[0]?.getSettings().deviceId || '';
    info(firstStream);
    log(`第一次请求成功，deviceId=${firstVideoDeviceId || '(未获取到)'}`);
    secondButton.disabled = false;
    return firstStream;
  } catch (error) {
    log(`第一次请求失败：${error.name}: ${error.message}`, true);
    throw error;
  }
}

async function requestSecond() {
  secondStream?.getTracks().forEach(track => track.stop());

  const video = secondConstraints();
  log(`Caller origin: ${location.origin}`);
  log(`getUserMedia call\nAudio constraints: false\nVideo constraints: ${JSON.stringify(video)}`);

  try {
    secondStream = await navigator.mediaDevices.getUserMedia({ video });
    secondVideo.srcObject = secondStream;
    info(secondStream);
    log('第二次请求成功');
    return secondStream;
  } catch (error) {
    log(`第二次请求失败：${error.name}: ${error.message}`, true);
    throw error;
  }
}

function stopAll() {
  [firstStream, secondStream].forEach(stream => {
    stream?.getTracks().forEach(track => track.stop());
  });
  firstStream = null;
  secondStream = null;
  firstVideo.srcObject = null;
  secondVideo.srcObject = null;
  secondButton.disabled = true;
  log('已停止所有轨道');
}

async function runAll() {
  try {
    await requestFirst();
    await requestSecond();
  } catch (_) {
    // 错误已经写入页面日志。
  }
}

document.querySelector('#runAll').onclick = runAll;

document.querySelector('#first').onclick = async () => {
  try { await requestFirst(); } catch (_) {}
};

document.querySelector('#second').onclick = async () => {
  try { await requestSecond(); } catch (_) {}
};

document.querySelector('#stop').onclick = stopAll;
log(`页面已加载，Caller origin: ${location.origin}`);
log('页面加载后自动执行一键请求');
runAll();
