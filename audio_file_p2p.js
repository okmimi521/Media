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
const playBtn = document.getElementById('playBtn');
const playBtnHint = document.getElementById('playBtnHint');

// Global State
let pc1 = null;          // 发送端
let pc2 = null;          // 接收端
let audioContext = null;
let bufferSource = null;
let volumeTimer = null;
let countdownTimer = null;
let volumeRestoreAt = null;
let diagTimer = null;
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

// ---- 诊断：打印 audio 元素 + 当前 srcObject/track 状态 ----------------------
function dumpAudioState(tag) {
  try {
    let srcDesc = 'null';
    if (audio && audio.srcObject) {
      const ts = audio.srcObject.getAudioTracks();
      srcDesc = audio.srcObject.id + '[' +
        ts.map((t) => t.id.slice(0, 8) + '/ready:' + t.readyState +
                '/muted:' + t.muted + '/enabled:' + t.enabled).join(' ') + ']';
    } else if (audio && !audio.srcObject) {
      srcDesc = 'null(未设置)';
    }
    log('[audioState:' + tag + '] paused=' + audio.paused +
        ' muted=' + audio.muted + ' volume=' + audio.volume +
        ' readyState=' + audio.readyState +
        ' currentTime=' + audio.currentTime.toFixed(3) +
        ' srcObject=' + srcDesc, 'info');
  } catch (err) {
    log('[audioState:' + tag + '] 读取失败: ' + err.message, 'error');
  }
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

// ---- 尝试播放（自动 / 手动共用）---------------------------------------------
function attemptPlay() {
  audio.muted = true;
  updateMuteUI(true);
  log('🎬 调用 audio.play() …', 'info');
  const playPromise = audio.play();
  if (!playPromise || typeof playPromise.then !== 'function') {
    log('⚠️ play() 未返回 Promise（旧实现），无法确认结果', 'warning');
    return;
  }
  // 加 3s 超时：iOS 上 play() 若一直 pending 说明被策略卡住，改用手动按钮
  Promise.race([
    playPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('play state timeout 3000ms')), 3000))
  ]).then(() => {
    log('✅ audio.play() resolve —— 播放已启动', 'success');
    dumpAudioState('after-play-resolve');
  }).catch((err) => {
    log('❌ audio.play() reject/pending: name=' + err.name + ' message=' + err.message, 'error');
    dumpAudioState('after-play-reject');
  });
}

// ---- 接收端：<audio> 标签播放 + muted → unmute -------------------------------
function handleRemoteStream(remoteStream) {
  log('📥 接收端收到音频流，用 <audio> 标签播放', 'success');

  // 打印收到的 stream/track 状态
  const remoteTracks = remoteStream.getAudioTracks();
  log('  收到 stream: ' + remoteStream.id + '，audioTrack: ' + remoteTracks.length + ' 条', 'info');
  remoteTracks.forEach((t) => {
    log('  ▶ track id=' + t.id + ' readyState=' + t.readyState +
        ' muted=' + t.muted + ' enabled=' + t.enabled, 'info');
    t.addEventListener('mute', () => log('track 被 mute: ' + t.id, 'warning'));
    t.addEventListener('unmute', () => log('track 恢复 unmute: ' + t.id, 'success'));
    t.addEventListener('ended', () => log('track ended: ' + t.id, 'warning'));
  });

  // 收到流后再设置 srcObject（audio 标签由 JS 用 createElement 提前创建好）
  log('设置 audio.srcObject = remoteStream …', 'info');
  audio.srcObject = remoteStream;
  dumpAudioState('set-srcObject');

  if (volumeTimer) clearTimeout(volumeTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  // 每次 play 都重新执行：静音播放 → 10s 后取消静音
  audio.onplay = () => {
    log('▶️ 触发 onplay（元素确实开始播放）—— 设为 muted（静音播放）', 'warning');
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

  // iOS 上自动 play 通常会被拦截：启用“手动开始播放”按钮（真实手势，100% 有效）
  playBtn.disabled = false;
  playBtnHint.textContent = '✅ 已收到流，请点击开始播放';
  playBtn.onclick = () => {
    log('👆 用户点击手动播放（真实手势）', 'success');
    attemptPlay();
  };

  // 先尝试自动播放（桌面 Chrome 等可直接成功；iOS 一般会被拦）
  attemptPlay();

  // 诊断心跳：每 2 秒打一次元素状态，即使 play() pending 也能看到真实播放状态
  if (diagTimer) clearInterval(diagTimer);
  diagTimer = setInterval(() => {
    dumpAudioState('diag-heartbeat');
  }, 2000);

  setStatus(mainStatus, '📥 流已到达！iOS 请点击「🔊 手动开始播放」；桌面端会自动播放');
  dumpAudioState('end-handleRemoteStream');
}

// ---- 主流程：页面内两条 RTCPeerConnection 直连 ------------------------------
async function start() {
  if (running) return;
  running = true;
  startBtn.disabled = true;

  const fileName = fileSelect.value;
  log('=== 开始：' + fileName + ' ===', 'info');

  try {
    // 0) iOS Safari：AudioContext 必须在用户手势内创建并 resume。
    //    放在最前面（不做任何前置 await），resume 用带超时的方式等待，
    //    避免因手势过期而在 iOS 上挂起。
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      log('AudioContext created: ' + audioContext.sampleRate + 'Hz', 'success');
    }
    if (audioContext.state === 'suspended') {
      const resumed = Promise.race([
        audioContext.resume(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('resume timeout')), 3000))
      ]);
      try {
        await resumed;
        log('✓ AudioContext resumed（在手势窗口内）', 'success');
      } catch (err) {
        log('⚠️ AudioContext resume 未完成: ' + err.message, 'warning');
      }
    }

    // 1) iOS Safari：接收端 <audio> 元素也要先在手势内 play() 一次解锁，
    //    否则等延时结束后收到流再 play() 会被自动播放策略拦截。
    //    这里先用空 MediaStream 静音预播放一次。
    audio.muted = true;
    try {
      log('🔓 尝试手势内空流预播（解锁）…', 'info');
      dumpAudioState('unlock-before');
      // iOS 上空流的 play() 可能永远 pending（不 resolve 也不 reject），
      // 加 2s 超时防止卡死主流程。
      const unlockP = Promise.race([
        audio.play(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('play timeout 2000ms')), 2000))
      ]);
      await unlockP;
      dumpAudioState('unlock-after');
      log('✓ 接收端 <audio> 已在手势内解锁（空流预播成功）', 'success');
    } catch (err) {
      dumpAudioState('unlock-failed');
      log('⚠️ 空流预播未通过/超时（' + err.name + ': ' + err.message +
          '），iOS 上收到流后可能无法自动播放', 'warning');
    }

    // 2) 加载音频文件 → MediaStream
    setStatus(mainStatus, '正在加载音频文件: ' + fileName + ' …');
    const { stream, source } = await loadAudioFile(fileName);
    bufferSource = source;
    const sendTrack = stream.getAudioTracks()[0];
    log('📤 发送端 track: id=' + sendTrack.id + ' readyState=' + sendTrack.readyState +
        ' muted=' + sendTrack.muted + ' enabled=' + sendTrack.enabled +
        ' | audioContext.state=' + (audioContext ? audioContext.state : '?'), 'info');

    // 3) 延时 10s 后再发送流到对端（带倒计时提示）
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

    // 4) 先建接收端 pc2（ontrack）
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

    // 5) 再建发送端 pc1，并把 ICE candidate 直接在页面内转发给对方
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

    // 6) 发送端 addTrack
    const track = stream.getAudioTracks()[0];
    pc1.addTrack(track, stream);
    log('✓ pc1 (发送端) addTrack: ' + track.id, 'success');

    // 7) offer/answer 本地直连
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

// ---- 诊断：监听 audio 元素的全部关键事件 -----------------------------------
[
  'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'playing', 'pause', 'waiting', 'stalled', 'suspend', 'emptied', 'ended', 'abort'
].forEach((evtName) => {
  audio.addEventListener(evtName, () => {
    log('🎧 [audio] ' + evtName +
        ' (paused=' + audio.paused + ' currentTime=' + audio.currentTime.toFixed(3) + ')', 'info');
  });
});
audio.addEventListener('error', () => {
  log('❌ [audio] error 事件: code=' + (audio.error ? audio.error.code : '?') +
      ' msg=' + (audio.error ? audio.error.message : '?'), 'error');
});

startBtn.addEventListener('click', start);

// ---- 清理 ------------------------------------------------------------------
window.addEventListener('beforeunload', () => {
  if (volumeTimer) clearTimeout(volumeTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  if (diagTimer) clearInterval(diagTimer);
  if (bufferSource) { try { bufferSource.stop(); } catch (e) {} }
  if (pc1) pc1.close();
  if (pc2) pc2.close();
  if (audioContext) audioContext.close();
  audio.pause();
  audio.srcObject = null;
});

log('页面已加载。选择文件后点击「加载并发送」。', 'info');
