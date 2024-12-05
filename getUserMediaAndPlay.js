'use strict';

const audio = document.querySelector('audio');
const logContainer = document.getElementById('log-container');

// 重写console.log
const originalConsoleLog = console.log;
console.log = function (...args) {
  originalConsoleLog.apply(console, args);

  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.textContent = args.map(arg => {
    if (typeof arg === 'object') {
      return JSON.stringify(arg);
    }
    return arg;
  }).join(' ');

  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
};

const constraints = window.constraints = {
  audio: {
    deviceId: undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: false
};

let micId = '';
let micLabel = '';
let speakerId = '';
let currentAudioDevices = new Set();

// 检查是否支持设备变化事件
const isDeviceChangeSupported = () => {
  return 'ondevicechange' in navigator.mediaDevices;
};

async function initializeAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  currentAudioDevices.clear();
  devices.forEach(device => {
    if (device.kind === 'audioinput') {
      currentAudioDevices.add(device.deviceId);
    }
  });
}

async function checkAudioDeviceChanges() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const newAudioDevices = new Set();
  
  devices.forEach(device => {
    if (device.kind === 'audioinput') {
      newAudioDevices.add(device.deviceId);
      console.log('Audio device:', device.label, device.deviceId);
    }
  });

  const hasChanged = newAudioDevices.size !== currentAudioDevices.size ||
    ![...newAudioDevices].every(deviceId => currentAudioDevices.has(deviceId));

  if (hasChanged) {
    console.log('Audio input devices changed');
    currentAudioDevices = newAudioDevices;
    return true;
  }
  return false;
}

// 只在支持 devicechange 的设备上添加事件监听
if (isDeviceChangeSupported()) {
  console.log('Device change event is supported');
  navigator.mediaDevices.ondevicechange = async () => {
    console.log('Device change event detected');
    const hasAudioDevicesChanged = await checkAudioDeviceChanges();
    
    if (hasAudioDevicesChanged) {
      console.log('Restarting capture due to audio device changes');
      startCapture();
    }
  };
} else {
  console.log('Device change event is not supported on this platform');
}

function handleSuccess(stream) {
  const audioTrack = stream?.getAudioTracks()[0];
  micId = audioTrack.deviceId;
  micLabel = audioTrack.label;
  console.log('Got stream with constraints:', constraints);
  console.log('Using audio device: ' + audioTrack.label);

  audioTrack.onended = async () => {
    console.log('Track end');

    let devices = await navigator.mediaDevices.enumerateDevices();
    let exceptionEnd = false;
    
    devices.forEach((device) => {
      if (
        device.kind == 'audioinput' &&
        device.label?.replace(/\(\w+:\w+\)|,/gi, '')?.trim() == micLabel &&
        device.deviceId == micId
      ) {
        exceptionEnd = true;
      }
    });
    
    if (exceptionEnd) {
      console.log('leave audio because some exceptions');
    } else {
      console.log('ended event caused by unplugging device');
    }
  };

  audioTrack.onmute = () => {
    const { muted } = audioTrack;
    console.log('Track mute', muted);
  };

  audioTrack.onunmute = () => {
    const { muted } = audioTrack;
    console.log('Track unmute', muted);
  };
  
  window.stream = stream;
  audio.srcObject = stream;
}

function handleError(error) {
  const errorMessage = 'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' + error.name;
  document.getElementById('errorMsg').innerText = errorMessage;
  console.log(errorMessage);
}

async function startCapture() {
  if (window.stream) {
    window.stream.getTracks().forEach(track => track.stop());
  }
  
  const stream = await navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
      handleSuccess(stream);
    })
    .catch((error) => {
      handleError(error);
    });
}

(async () => {
  await initializeAudioDevices();
  startCapture();
})();
