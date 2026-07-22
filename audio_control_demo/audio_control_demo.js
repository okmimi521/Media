'use strict';

// DOM元素
const createAudioBtn = document.getElementById('createAudioBtn');
const setStreamBtn = document.getElementById('setStreamBtn');
const captureMicBtn = document.getElementById('captureMicBtn');
const refreshSpeakerBtn = document.getElementById('refreshSpeakerBtn');
const speakerSelect = document.getElementById('speakerSelect');
const stopMicBtn = document.getElementById('stopMicBtn');
const statusDiv = document.getElementById('status');
const audioContainer = document.getElementById('audioPlaceholder');
const logContainer = document.getElementById('logContainer');

// 全局变量
let audioElement = null;
let audioContext = null;
let micStream = null;
let speakers = [];
let fileAudioSource = null;
let destinationNode = null;

// 测试音频文件路径（可以根据实际情况修改）
const TEST_AUDIO_FILE = 'P501_C_english_f2_SWB_48k.wav';

// 工具函数：添加日志
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = `[${timestamp}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
  console.log(message);
}

// 工具函数：更新状态
function updateStatus(message) {
  statusDiv.innerHTML = `<strong>状态：</strong>${message}`;
}

// 1. 创建Audio Tag
createAudioBtn.addEventListener('click', () => {
  try {
    if (audioElement) {
      log('Audio元素已存在，先移除旧元素');
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.src = '';
      audioElement.remove();
    }

    audioElement = document.createElement('audio');
    audioElement.id = 'dynamicAudio';
    audioElement.autoplay = false;
    audioElement.controls = true;
    audioElement.loop = true;
    audioElement.muted = false;

    // 添加到容器
    audioContainer.innerHTML = '';
    audioContainer.appendChild(audioElement);

    // 添加到文档
    document.documentElement.appendChild(audioElement);

    log('✓ Audio元素创建成功');
    updateStatus('Audio元素已创建');
    setStreamBtn.disabled = false;

  } catch (err) {
    log(`✗ 创建Audio元素失败: ${err.message}`);
    updateStatus('创建失败');
    console.error(err);
  }
});

// 2. 设置Stream：将文件转为stream，赋值给audio tag
setStreamBtn.addEventListener('click', async () => {
  if (!audioElement) {
    log('✗ 请先创建Audio元素');
    return;
  }

  try {
    log(`开始加载音频文件: ${TEST_AUDIO_FILE}`);
    updateStatus('正在加载音频文件...');

    // 初始化AudioContext（如果还没有）
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      log(`AudioContext已创建，采样率: ${audioContext.sampleRate}Hz`);
    }

    // 如果AudioContext被暂停，恢复它
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
      log('AudioContext已恢复');
    }

    // Fetch音频文件
    const response = await fetch(TEST_AUDIO_FILE);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    log(`✓ 音频文件加载完成，大小: ${(arrayBuffer.byteLength / 1024).toFixed(2)}KB`);

    // 解码音频数据
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    log(`✓ 音频解码完成，时长: ${audioBuffer.duration.toFixed(2)}秒`);

    // 如果已有音频源，先停止并断开
    if (fileAudioSource) {
      try {
        fileAudioSource.stop();
        fileAudioSource.disconnect();
      } catch (e) {
        // 忽略停止错误
      }
    }

    // 创建BufferSource
    fileAudioSource = audioContext.createBufferSource();
    fileAudioSource.buffer = audioBuffer;
    fileAudioSource.loop = true;

    // 创建MediaStreamDestination
    if (!destinationNode) {
      destinationNode = audioContext.createMediaStreamDestination();
      log('✓ MediaStreamDestination已创建');
    }

    // 连接音频图
    fileAudioSource.connect(destinationNode);
    fileAudioSource.connect(audioContext.destination); // 同时连接到扬声器以便监听

    // 启动音频源
    fileAudioSource.start(0);
    log('✓ 音频源已启动');

    // 将MediaStream赋值给audio元素
    audioElement.srcObject = destinationNode.stream;
    log('✓ MediaStream已赋值给Audio元素');

    // 播放
    await audioElement.play();
    log('✓ Audio元素开始播放');

    updateStatus('音频流已设置并播放');

  } catch (err) {
    log(`✗ 设置Stream失败: ${err.message}`);
    updateStatus('设置Stream失败');
    console.error(err);
  }
});

// 3. 采集Mic
captureMicBtn.addEventListener('click', async () => {
  try {
    log('开始采集麦克风...');
    updateStatus('正在请求麦克风权限...');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    micStream = stream;
    const audioTracks = stream.getAudioTracks();

    log(`✓ 麦克风采集成功`);
    audioTracks.forEach((track, index) => {
      log(`  麦克风 ${index + 1}: ${track.label}`);
      log(`  - 状态: ${track.readyState}`);
      log(`  - 静音: ${track.muted}`);
      log(`  - 约束: ${JSON.stringify(track.getSettings())}`);
    });

    updateStatus(`麦克风已采集 (${audioTracks.length}个音轨)`);
    stopMicBtn.disabled = false;
    captureMicBtn.disabled = true;

  } catch (err) {
    log(`✗ 采集麦克风失败: ${err.message}`);
    updateStatus('麦克风采集失败');
    console.error(err);
  }
});

// 4. 刷新Speaker
refreshSpeakerBtn.addEventListener('click', async () => {
  try {
    log('开始枚举扬声器设备...');
    updateStatus('正在刷新扬声器列表...');

    const devices = await navigator.mediaDevices.enumerateDevices();
    speakers = devices.filter(device => device.kind === 'audiooutput');

    log(`✓ 找到 ${speakers.length} 个扬声器设备:`);

    // 清空并重新填充select
    speakerSelect.innerHTML = '';

    if (speakers.length === 0) {
      speakerSelect.add(new Option('未找到扬声器设备', ''));
      log('  ⚠ 未找到任何扬声器设备');
    } else {
      speakers.forEach((device, index) => {
        const label = device.label || `扬声器 ${index + 1}`;
        const option = new Option(label, device.deviceId);
        speakerSelect.add(option);
        log(`  ${index + 1}. ${label} (${device.deviceId})`);
      });
      speakerSelect.disabled = false;
    }

    updateStatus(`找到 ${speakers.length} 个扬声器设备`);

  } catch (err) {
    log(`✗ 刷新扬声器列表失败: ${err.message}`);
    updateStatus('刷新失败');
    console.error(err);
  }
});

// 5. Change Speaker (通过select的change事件)
speakerSelect.addEventListener('change', async () => {
  if (!audioElement) {
    log('✗ 请先创建Audio元素');
    return;
  }

  if (!audioElement.setSinkId) {
    log('✗ 当前浏览器不支持setSinkId方法');
    alert('当前浏览器不支持切换扬声器功能');
    return;
  }

  const selectedDeviceId = speakerSelect.value;
  const selectedLabel = speakerSelect.options[speakerSelect.selectedIndex].text;

  try {
    log(`正在切换扬声器到: ${selectedLabel}`);
    updateStatus('正在切换扬声器...');

    await audioElement.setSinkId(selectedDeviceId);

    log(`✓ 扬声器切换成功: ${selectedLabel}`);
    log(`  当前sinkId: ${audioElement.sinkId || 'default'}`);
    updateStatus(`扬声器已切换到: ${selectedLabel}`);

  } catch (err) {
    log(`✗ 切换扬声器失败: ${err.message}`);
    updateStatus('切换扬声器失败');
    console.error(err);
  }
});

// 6. 停止Mic
stopMicBtn.addEventListener('click', () => {
  if (!micStream) {
    log('✗ 没有正在运行的麦克风流');
    return;
  }

  try {
    log('正在停止麦克风...');

    micStream.getTracks().forEach((track, index) => {
      log(`  停止音轨 ${index + 1}: ${track.label}`);
      track.stop();
    });

    micStream = null;

    log('✓ 麦克风已停止');
    updateStatus('麦克风已停止');
    stopMicBtn.disabled = true;
    captureMicBtn.disabled = false;

  } catch (err) {
    log(`✗ 停止麦克风失败: ${err.message}`);
    updateStatus('停止失败');
    console.error(err);
  }
});

// 页面加载完成
log('页面加载完成，准备就绪');
updateStatus('准备就绪，请开始操作');

// 检查浏览器兼容性
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  log('⚠ 当前浏览器不支持getUserMedia API');
  captureMicBtn.disabled = true;
}

if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
  log('⚠ 当前浏览器不支持enumerateDevices API');
  refreshSpeakerBtn.disabled = true;
}

// 清理：页面卸载时清理资源
window.addEventListener('beforeunload', () => {
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }
  if (audioContext) {
    audioContext.close();
  }
  if (audioElement) {
    audioElement.pause();
    audioElement.srcObject = null;
    audioElement.src = '';
  }
});
