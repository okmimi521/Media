'use strict';

// ---------------------------------------------------------------------------
// 单页面 demo：把音频文件通过 WebRTC RTCPeerConnection 传输，用 <audio> 标签
// 播放，play 时设为 muted（静音），10 秒后自动 unmute（恢复声音）。
//
// 关键点：发送端 pc1 与接收端 pc2 都在本页面里，offer/answer/ICE candidate
// 全部通过页面内的回调直接交换，不需要任何信令服务器，也不需要双 tab。
// ---------------------------------------------------------------------------

const AUDIO_FILES = [
  'P501_C_english_f2_SWB_48k.wav',
  'test1.mp3',
  'test2.mp3',
  'test3.mp3',
  'test4.wav',
  'stereo_demo.mp3',
  'test_stereo1.wav',
  'hello_google.wav',
  'zoom-audio-share.wav'
];

const UNMUTE_DELAY_MS = 10000; // 10 秒后 unmute
const SEND_DELAY_MS = 10000;   // 点击开始后延时 10s 才发送流到对端

// DOM Elements
const fileSelect = document.getElementById('fileSelect');
const startBtn = document.getElementById('startBtn');
const fileInfo = document.getElementById('fileInfo');
const pc1Status = document.getElementById('pc1Status');
const pc2Status = document.getElementById('pc2Status');
const mainStatus = document.getElementById('mainStatus');
const countdownEl = document.getElementById('countdown');
const volumeFill = document.getElementById('volumeFill');
const logContainer = document.getElementById('logContainer');
const audioContainer = document.getElementById('audioContainer');

// Global State
let pc1 = null;          // 发送端
let pc2 = null;          // 接收端
let audioContext = null;
let bufferSource = null;
let volumeTimer = null;
let countdownTimer = null;
let volumeRestoreAt = null;
let running = false;

// ---- Logging（只用 textContent，避免注入）----------------------------------
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = '[' + timestamp + '] ' + message;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
  console.log('[' + type + '] ' + message);
}

function setStatus(el, text) {
  el.textContent = text;
}

function setConnStatus(el, state) {
  el.textContent = state;
  el.className = 'connection-status ' +
    (state === 'connected' ? 'connected' :
     state === 'connecting' ? 'connecting' : 'disconnected');
}

// ---- 发送端：加载文件 → 解码 → MediaStreamDestination → track ----------------
function loadAudioFile(filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        log('AudioContext created: ' + audioContext.sampleRate + 'Hz', 'success');
      }
      if (audioContext.state === 'suspended') await audioContext.resume();

      const response = await fetch(filePath);
      if (!response.ok) throw new Error('Failed to load ' + filePath);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      log('✓ 解码成功: ' + audioBuffer.duration.toFixed(2) + 's, ' +
          audioBuffer.numberOfChannels + 'ch', 'success');

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true; // 便于反复观察 0 → 1 的切换
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.start(0);

      resolve({ stream: destination.stream, source });
    } catch (err) {
      reject(err);
    }
  });
}

// ---- 静音 UI ---------------------------------------------------------------
function updateMuteUI(muted) {
  if (volumeFill) volumeFill.style.width = muted ? '0%' : '100%';
}

function startCountdown(endTime) {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownEl.textContent = '';

  countdownTimer = setInterval(() => {
    if (!audio) { clearInterval(countdownTimer); return; }
    const remaining = Math.max(0, endTime - Date.now());
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownEl.textContent = '';
      return;
    }
    countdownEl.textContent = '⏳ 将在 ' + (remaining / 1000).toFixed(1) + 's 后 unmute';
  }, 100);
}

// ---- 接收端：<audio> 标签播放 + muted → unmute -------------------------------
function handleRemoteStream(remoteStream) {
  log('📥 接收端收到音频流，用 <audio> 标签播放', 'success');

  // 收到流后再设置 srcObject（audio 标签由 JS 用 createElement 提前创建好）
  audio.srcObject = remoteStream;

  if (volumeTimer) clearTimeout(volumeTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  // 每次 play 都重新执行：静音播放 → 10s 后取消静音
  audio.onplay = () => {
    log('▶️ play 事件 —— 设为 muted（静音播放）', 'warning');
    volumeRestoreAt = Date.now() + UNMUTE_DELAY_MS;
    audio.muted = true;
    updateMuteUI(true);
    startCountdown(volumeRestoreAt);

    volumeTimer = setTimeout(() => {
      log('🔊 ' + (UNMUTE_DELAY_MS / 1000) + 's 已到 —— 取消 muted', 'success');
      audio.muted = false;
      updateMuteUI(false);
    }, UNMUTE_DELAY_MS);
  };

  // 流一挂上就先静音（早于 play 防漏；muted 状态下 autoplay 也更容易通过）
  audio.muted = true;
  updateMuteUI(true);

  audio.play().catch((err) => {
    log('⚠️ 自动播放被浏览器拦截 (' + err.name + ')，请点击播放按钮', 'warning');
  });

  setStatus(mainStatus, '✓ 流已接收并通过 <audio> 标签播放（muted → unmute after 10s）');
}

// ---- 主流程：页面内两条 RTCPeerConnection 直连 ------------------------------
async function start() {
  if (running) return;
  running = true;
  startBtn.disabled = true;

  const fileName = fileSelect.value;
  setStatus(mainStatus, '正在加载音频文件: ' + fileName + ' …');
  log('=== 开始：' + fileName + ' ===', 'info');

  try {
    // 0) 延时 10s 后再发送流到对端（带倒计时提示）
    log('⏳ 延时 ' + (SEND_DELAY_MS / 1000) + 's 后才发送流到对端…', 'warning');
    const delayEnd = Date.now() + SEND_DELAY_MS;
    await new Promise((resolve) => {
      const counter = setInterval(() => {
        const remaining = Math.max(0, delayEnd - Date.now());
        if (remaining <= 0) {
          clearInterval(counter);
          resolve();
          return;
        }
        setStatus(mainStatus, '⏳ ' + (remaining / 1000).toFixed(1) + 's 后发送流到对端');
      }, 100);
    });

    // 1) 加载音频文件 → MediaStream
    const { stream, source } = await loadAudioFile(fileName);
    bufferSource = source;

    // 2) 先建接收端 pc2（ontrack）
    pc2 = new RTCPeerConnection();
    setConnStatus(pc2Status, 'new');
    pc2.ontrack = (event) => {
      if (event.track.kind !== 'audio') return;
      log('📥 pc2 (接收端) 收到音频 track: ' + event.track.id, 'success');
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      handleRemoteStream(remoteStream);
    };
    pc2.onconnectionstatechange = () => {
      log('pc2 connection state: ' + pc2.connectionState, 'info');
      setConnStatus(pc2Status, pc2.connectionState);
    };

    // 3) 再建发送端 pc1，并把 ICE candidate 直接在页面内转发给对方
    pc1 = new RTCPeerConnection();
    setConnStatus(pc1Status, 'new');
    pc1.onicecandidate = (event) => {
      if (event.candidate) pc2.addIceCandidate(event.candidate).catch((e) =>
        log('✗ pc2 addIceCandidate: ' + e.message, 'error'));
    };
    pc2.onicecandidate = (event) => {
      if (event.candidate) pc1.addIceCandidate(event.candidate).catch((e) =>
        log('✗ pc1 addIceCandidate: ' + e.message, 'error'));
    };
    pc1.onconnectionstatechange = () => {
      log('pc1 connection state: ' + pc1.connectionState, 'info');
      setConnStatus(pc1Status, pc1.connectionState);
    };

    // 4) 发送端 addTrack
    const track = stream.getAudioTracks()[0];
    pc1.addTrack(track, stream);
    log('✓ pc1 (发送端) addTrack: ' + track.id, 'success');

    // 5) offer/answer 本地直连
    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);
    log('📶 offer/answer 已本地交换，正在建立连接…', 'success');

    fileInfo.textContent = '发送中: ' + fileName;
    setStatus(mainStatus, '✓ 音频已发出（通过本页内 WebRTC 直连），接收端正在播放');
  } catch (err) {
    log('✗ 错误: ' + err.message, 'error');
    setStatus(mainStatus, '✗ 错误: ' + err.message);
  }
}

// ---- UI 初始化 -------------------------------------------------------------
AUDIO_FILES.forEach((file) => {
  const option = document.createElement('option');
  option.value = file;
  option.textContent = file;
  fileSelect.appendChild(option);
});

// 用 document.createElement 提前创建 <audio> 标签：
// 只设置 srcObject = 一个空 MediaStream，其余属性一律不设置。
// 等到接收端收到流时，再由 handleRemoteStream() 替换 srcObject。
const audio = document.createElement('audio');
audio.srcObject = new MediaStream();
audioContainer.appendChild(audio);
log('📻 已用 createElement 创建 <audio> 标签，srcObject = new MediaStream()（空流），未设置其他属性', 'info');

startBtn.addEventListener('click', start);

// ---- 清理 ------------------------------------------------------------------
window.addEventListener('beforeunload', () => {
  if (volumeTimer) clearTimeout(volumeTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  if (bufferSource) { try { bufferSource.stop(); } catch (e) {} }
  if (pc1) pc1.close();
  if (pc2) pc2.close();
  if (audioContext) audioContext.close();
  audio.pause();
  audio.srcObject = null;
});

log('页面已加载。选择文件后点击「加载并发送」。', 'info');
