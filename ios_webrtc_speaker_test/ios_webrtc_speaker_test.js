'use strict';

// Audio files
const AUDIO_FILE_1 = '../P501_C_english_f2_SWB_48k.wav';
const AUDIO_FILE_2 = '../test2.mp3';

// DOM Elements
const sendSingleBtn = document.getElementById('sendSingleBtn');
const sendDualBtn = document.getElementById('sendDualBtn');
const getMicBtn = document.getElementById('getMicBtn');
const refreshMicBtn = document.getElementById('refreshMicBtn');
const micSelect = document.getElementById('micSelect');
const micStatus = document.getElementById('micStatus');
const refreshSpeakerBtn = document.getElementById('refreshSpeakerBtn');
const speakerSelect = document.getElementById('speakerSelect');
const senderStatusEl = document.getElementById('senderStatus');
const receiverStatusEl = document.getElementById('receiverStatus');
const senderStatusText = document.getElementById('senderStatus');
const receiverStatusText = document.getElementById('receiverStatusText');
const senderStreamInfo = document.getElementById('senderStreamInfo');
const receiverStreamInfo = document.getElementById('receiverStreamInfo');
const audioContainer = document.getElementById('audioPlaceholder');
const logContainer = document.getElementById('logContainer');
const deviceInfo = document.getElementById('deviceInfo');
const testResults = document.getElementById('testResults');
const speakerSwitchResult = document.getElementById('speakerSwitchResult');

// WebRTC State
let localPeer = null;  // Sender
let remotePeer = null; // Receiver
let audioContext = null;
let audioElement = null;
let micStream = null; // Microphone stream (for device switching/enumeration only)
let microphones = [];
let speakers = [];
let selectedMicId = '';
let currentStreamType = null;
let deviceChangeTimer = null;
let audioReplayTimer = null;
let audioContextResumeTimer = null;
let isCleaningUp = false;

// Test results
const testResultsData = {
  single: { attempted: false, success: null, error: null },
  dual: { attempted: false, success: null, error: null }
};

// Detect device
function detectDevice() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|crios|android|edg).)*safari/i.test(ua);
  deviceInfo.innerHTML = `
    Platform: ${navigator.platform}<br>
    iOS: ${isIOS ? '<strong style="color: #28a745;">YES ✓</strong>' : 'NO'}<br>
    Safari: ${isSafari ? '<strong style="color: #28a745;">YES ✓</strong>' : 'NO'}<br>
    User Agent: ${ua}
  `;

  if (isIOS && isSafari) {
    log('🎯 Running on iOS Safari - Bug should be reproducible!', 'success');
  } else {
    log('ℹ️ Not iOS Safari - Bug may not reproduce', 'warning');
  }
}

// Logging
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${timestamp}] ${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
  console.log(`[${type}] ${message}`);
}

function formatDevice(device, index) {
  const label = device.label || '(label hidden until permission granted)';
  const deviceId = device.deviceId || '(empty deviceId)';
  const groupId = device.groupId || '(empty groupId)';
  return `${index + 1}. kind=${device.kind}, label=${label}, deviceId=${deviceId}, groupId=${groupId}`;
}

async function refreshSpeakerList(reason = 'manual refresh') {
  try {
    log(`Enumerating media devices (${reason})...`, 'receiver');

    const previousSpeakerId = speakerSelect.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    speakers = devices.filter(d => d.kind === 'audiooutput');

    log(`Device list changed/check result: total=${devices.length}, speakers=${speakers.length}`, 'receiver');
    devices.forEach((device, i) => {
      log(`  ${formatDevice(device, i)}`, 'receiver');
    });

    speakerSelect.innerHTML = '';

    if (speakers.length === 0) {
      speakerSelect.add(new Option('No speakers found', ''));
      speakerSelect.disabled = true;
      return;
    }

    speakers.forEach((device, i) => {
      const label = device.label || `Speaker ${i + 1}`;
      speakerSelect.add(new Option(label, device.deviceId));
      log(`  Speaker ${i + 1}: ${label}`, 'receiver');
    });

    const stillHasPreviousSpeaker = speakers.some(device => device.deviceId === previousSpeakerId);
    if (stillHasPreviousSpeaker) {
      speakerSelect.value = previousSpeakerId;
    }
    speakerSelect.disabled = false;
  } catch (err) {
    log(`Error refreshing speakers/devices: ${err.name || 'Error'} - ${err.message}`, 'error');
  }
}

async function refreshMicList(reason = 'manual refresh') {
  try {
    log(`Enumerating microphone devices (${reason})...`, 'receiver');

    const previousMicId = micSelect.value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    microphones = devices.filter(d => d.kind === 'audioinput');

    log(`Found ${microphones.length} microphone(s)`, 'receiver');

    micSelect.innerHTML = '';
    micSelect.add(new Option('Default microphone', ''));

    microphones.forEach((device, i) => {
      const label = device.label || `Microphone ${i + 1}`;
      micSelect.add(new Option(label, device.deviceId));
      log(`  Mic ${i + 1}: ${label}, deviceId=${device.deviceId || '(empty deviceId)'}`, 'receiver');
    });

    if (previousMicId && microphones.some(device => device.deviceId === previousMicId)) {
      micSelect.value = previousMicId;
    } else if (selectedMicId && microphones.some(device => device.deviceId === selectedMicId)) {
      micSelect.value = selectedMicId;
    }

    micSelect.disabled = false;
  } catch (err) {
    log(`Error refreshing microphones: ${err.name || 'Error'} - ${err.message}`, 'error');
  }
}

function initDeviceChangeMonitoring() {
  if (!navigator.mediaDevices) {
    log('navigator.mediaDevices is not available, cannot monitor devicechange', 'warning');
    return;
  }

  const onDeviceChange = () => {
    log('🔄 devicechange event fired', 'warning');

    clearTimeout(deviceChangeTimer);
    deviceChangeTimer = setTimeout(() => {
      refreshSpeakerList('devicechange event');
      refreshMicList('devicechange event');
    }, 300);
  };

  if (typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    log('✓ devicechange monitoring enabled via addEventListener', 'success');
    return;
  }

  if ('ondevicechange' in navigator.mediaDevices) {
    navigator.mediaDevices.ondevicechange = onDeviceChange;
    log('✓ devicechange monitoring enabled via ondevicechange', 'success');
    return;
  }

  log('devicechange is not supported by navigator.mediaDevices', 'warning');
}

function describeAudioError(audio) {
  if (!audio.error) return 'unknown error';

  const errorNames = {
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
  };

  return `${errorNames[audio.error.code] || 'MEDIA_ERR_UNKNOWN'} (${audio.error.code}): ${audio.error.message || 'no message'}`;
}

function scheduleAudioReplay(reason) {
  if (!audioElement || isCleaningUp) return;

  clearTimeout(audioReplayTimer);
  log(`Audio tag ${reason}; retry play() after 100ms`, 'warning');

  audioReplayTimer = setTimeout(async () => {
    if (!audioElement || isCleaningUp || !audioElement.srcObject) return;

    try {
      await audioElement.play();
      log(`✓ audioElement.play() retry succeeded (${reason})`, 'success');
    } catch (err) {
      log(`✗ audioElement.play() retry failed (${reason}): ${err.name} - ${err.message}`, 'error');
    }
  }, 100);
}

function attachAudioElementEventHandlers(audio) {
  if (audio.dataset.eventHandlersAttached === 'true') return;
  audio.dataset.eventHandlersAttached = 'true';

  audio.addEventListener('loadstart', () => {
    log('Audio tag event: loadstart', 'receiver');
  });

  audio.addEventListener('loadedmetadata', () => {
    log(`Audio tag event: loadedmetadata, duration=${audio.duration}`, 'receiver');
  });

  audio.addEventListener('canplay', () => {
    log('Audio tag event: canplay', 'receiver');
  });

  audio.addEventListener('play', () => {
    log('Audio tag event: play', 'receiver');
  });

  audio.addEventListener('playing', () => {
    clearTimeout(audioReplayTimer);
    log('Audio tag event: playing', 'success');
  });

  audio.addEventListener('pause', () => {
    log(`Audio tag event: pause, paused=${audio.paused}, currentTime=${audio.currentTime}`, 'warning');
    scheduleAudioReplay('paused');
  });

  audio.addEventListener('waiting', () => {
    log('Audio tag event: waiting', 'warning');
  });

  audio.addEventListener('stalled', () => {
    log('Audio tag event: stalled', 'warning');
  });

  audio.addEventListener('ended', () => {
    log('Audio tag event: ended', 'warning');
    scheduleAudioReplay('ended');
  });

  audio.addEventListener('error', () => {
    log(`Audio tag event: error, ${describeAudioError(audio)}`, 'error');
    scheduleAudioReplay('error');
  });

  log('✓ Audio tag event handlers attached', 'success');
}

function scheduleAudioContextResume(reason) {
  if (!audioContext || isCleaningUp || audioContext.state === 'closed') return;

  clearTimeout(audioContextResumeTimer);
  log(`AudioContext ${reason}, state=${audioContext.state}; retry resume() after 100ms`, 'warning');

  audioContextResumeTimer = setTimeout(async () => {
    if (!audioContext || isCleaningUp || audioContext.state === 'closed') return;

    try {
      await audioContext.resume();
      log(`✓ AudioContext resume() retry succeeded, state=${audioContext.state}`, 'success');
    } catch (err) {
      log(`✗ AudioContext resume() retry failed: ${err.name} - ${err.message}`, 'error');
    }
  }, 100);
}

function attachAudioContextEventHandlers(context) {
  if (context._eventHandlersAttached) return;
  context._eventHandlersAttached = true;

  context.addEventListener('statechange', () => {
    log(`AudioContext statechange: ${context.state}`, context.state === 'running' ? 'success' : 'warning');

    if (context.state !== 'running' && context.state !== 'closed') {
      scheduleAudioContextResume('state changed');
    }
  });

  log(`✓ AudioContext event handlers attached, initial state=${context.state}`, 'success');
}

function createAudioContextIfNeeded() {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    attachAudioContextEventHandlers(audioContext);
    log(`AudioContext created, sample rate: ${audioContext.sampleRate}Hz, state=${audioContext.state}`, 'sender');
  }

  return audioContext;
}

// Create peer connections
function createPeerConnections() {
  log('Creating WebRTC peer connections...', 'sender');

  const config = {
    iceServers: []  // No STUN/TURN needed for local loopback
  };

  localPeer = new RTCPeerConnection(config);
  remotePeer = new RTCPeerConnection(config);

  // ICE candidates
  localPeer.onicecandidate = (e) => {
    if (e.candidate) {
      remotePeer.addIceCandidate(e.candidate)
        .catch(err => log(`Remote addIceCandidate error: ${err}`, 'error'));
    }
  };

  remotePeer.onicecandidate = (e) => {
    if (e.candidate) {
      localPeer.addIceCandidate(e.candidate)
        .catch(err => log(`Local addIceCandidate error: ${err}`, 'error'));
    }
  };

  // Connection state
  localPeer.onconnectionstatechange = () => {
    log(`Local peer connection state: ${localPeer.connectionState}`, 'sender');
    updateConnectionStatus();
  };

  remotePeer.onconnectionstatechange = () => {
    log(`Remote peer connection state: ${remotePeer.connectionState}`, 'receiver');
    updateConnectionStatus();
  };

  // Receive remote track
  remotePeer.ontrack = (event) => {
    log(`📥 Received remote track via WebRTC!`, 'receiver');
    log(`  Track kind: ${event.track.kind}`, 'receiver');
    log(`  Track id: ${event.track.id}`, 'receiver');
    log(`  Track label: ${event.track.label}`, 'receiver');
    log(`  Streams count: ${event.streams.length}`, 'receiver');

    const remoteStream = event.streams[0];
    handleRemoteStream(remoteStream);
  };

  log('✓ Peer connections created', 'success');
}

// Handle received remote stream
function handleRemoteStream(remoteStream) {
  const tracks = remoteStream.getAudioTracks();
  log(`Remote stream has ${tracks.length} audio track(s)`, 'receiver');

  tracks.forEach((track, i) => {
    log(`  Track ${i + 1}: ${track.id}, state: ${track.readyState}`, 'receiver');
  });

  // Create or update audio element
  if (!audioElement) {
    audioElement = document.createElement('audio');
    audioElement.id = 'remoteAudio';
    audioElement.controls = true;
    audioElement.autoplay = true;
    audioElement.loop = true;
    document.documentElement.appendChild(audioElement);
    attachAudioElementEventHandlers(audioElement);
  }

  // Assign remote stream
  audioElement.srcObject = remoteStream;
  audioContainer.innerHTML = '';
  audioContainer.appendChild(audioElement);

  // Update info
  currentStreamType = tracks.length === 1 ? 'single' : 'dual';
  const color = currentStreamType === 'single' ? '#ff3b30' : '#34c759';
  receiverStreamInfo.innerHTML = `
    <strong style="color: ${color};">
      Receiving ${tracks.length === 1 ? 'SINGLE' : 'DUAL'} track stream via WebRTC
    </strong><br>
    Tracks: ${tracks.map((t, i) => `Track ${i + 1}: ${t.id}`).join(', ')}
  `;

  receiverStatusText.innerHTML = `<strong>Status:</strong> Remote stream received, ready to test speaker switch`;

  log(`✓ Remote stream assigned to audio element`, 'success');
}

// Update connection status UI
function updateConnectionStatus() {
  const localState = localPeer ? localPeer.connectionState : 'disconnected';
  const remoteState = remotePeer ? remotePeer.connectionState : 'disconnected';

  // Sender status
  senderStatusEl.className = 'connection-status';
  senderStatusEl.textContent = localState;
  if (localState === 'connected') senderStatusEl.classList.add('connected');
  else if (localState === 'connecting') senderStatusEl.classList.add('connecting');
  else senderStatusEl.classList.add('disconnected');

  // Receiver status
  receiverStatusEl.className = 'connection-status';
  receiverStatusEl.textContent = remoteState;
  if (remoteState === 'connected') receiverStatusEl.classList.add('connected');
  else if (remoteState === 'connecting') receiverStatusEl.classList.add('connecting');
  else receiverStatusEl.classList.add('disconnected');
}

// Load audio file and create MediaStream
async function loadAudioFile(filePath) {
  log(`Loading audio file: ${filePath}`, 'sender');

  createAudioContextIfNeeded();

  if (audioContext.state !== 'running' && audioContext.state !== 'closed') {
    log(`AudioContext state before loading file: ${audioContext.state}`, 'warning');
    await audioContext.resume();
    log(`AudioContext state after resume(): ${audioContext.state}`, audioContext.state === 'running' ? 'success' : 'warning');
  }

  const response = await fetch(filePath);
  if (!response.ok) throw new Error(`Failed to load ${filePath}`);

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  log(`✓ Decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels} channels`, 'sender');

  // Create source and destination
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;

  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);
  source.start(0);

  return { stream: destination.stream, source };
}

// Send SINGLE track
sendSingleBtn.addEventListener('click', async () => {
  try {
    log('=== SENDING SINGLE TRACK via WebRTC ===', 'sender');
    senderStatusText.innerHTML = '<strong>Status:</strong> Loading audio file...';

    // Create peer connections if needed
    if (!localPeer || localPeer.connectionState === 'closed') {
      createPeerConnections();
    }

    // Load file 1
    const { stream } = await loadAudioFile(AUDIO_FILE_1);
    const tracks = stream.getAudioTracks();

    log(`Stream created with ${tracks.length} track(s)`, 'sender');

    // Remove existing senders
    localPeer.getSenders().forEach(sender => localPeer.removeTrack(sender));

    // Add track to peer connection
    tracks.forEach((track, i) => {
      localPeer.addTrack(track, stream);
      log(`Added track ${i + 1} to local peer: ${track.id}`, 'sender');
    });

    senderStreamInfo.innerHTML = `<strong style="color: #ff3b30;">Sending SINGLE track</strong>`;

    // Negotiate
    await negotiate();

    senderStatusText.innerHTML = '<strong>Status:</strong> SINGLE track sent via WebRTC';
    log('✓ Single track transmission complete', 'success');

  } catch (err) {
    log(`✗ Error sending single track: ${err.message}`, 'error');
    senderStatusText.innerHTML = `<strong>Status:</strong> Error: ${err.message}`;
  }
});

// Send DUAL track
sendDualBtn.addEventListener('click', async () => {
  try {
    log('=== SENDING DUAL TRACK via WebRTC ===', 'sender');
    senderStatusText.innerHTML = '<strong>Status:</strong> Loading audio files...';

    // Create peer connections if needed
    if (!localPeer || localPeer.connectionState === 'closed') {
      createPeerConnections();
    }

    // Load both files
    const { stream: stream1 } = await loadAudioFile(AUDIO_FILE_1);
    const { stream: stream2 } = await loadAudioFile(AUDIO_FILE_2);

    const track1 = stream1.getAudioTracks()[0];
    const track2 = stream2.getAudioTracks()[0];

    log(`Creating combined stream with 2 tracks`, 'sender');

    // Create combined stream
    const combinedStream = new MediaStream([track1, track2]);

    // Remove existing senders
    localPeer.getSenders().forEach(sender => localPeer.removeTrack(sender));

    // Add both tracks
    combinedStream.getAudioTracks().forEach((track, i) => {
      localPeer.addTrack(track, combinedStream);
      log(`Added track ${i + 1} to local peer: ${track.id}`, 'sender');
    });

    senderStreamInfo.innerHTML = `<strong style="color: #34c759;">Sending DUAL track</strong>`;

    // Negotiate
    await negotiate();

    senderStatusText.innerHTML = '<strong>Status:</strong> DUAL track sent via WebRTC';
    log('✓ Dual track transmission complete', 'success');

  } catch (err) {
    log(`✗ Error sending dual track: ${err.message}`, 'error');
    senderStatusText.innerHTML = `<strong>Status:</strong> Error: ${err.message}`;
  }
});

// Negotiate WebRTC connection
async function negotiate() {
  log('Negotiating WebRTC connection...', 'sender');

  // Create offer
  const offer = await localPeer.createOffer();
  await localPeer.setLocalDescription(offer);
  log(`Local description set (offer)`, 'sender');

  // Set remote description
  await remotePeer.setRemoteDescription(offer);
  log(`Remote peer received offer`, 'receiver');

  // Create answer
  const answer = await remotePeer.createAnswer();
  await remotePeer.setLocalDescription(answer);
  log(`Remote description set (answer)`, 'receiver');

  // Complete
  await localPeer.setRemoteDescription(answer);
  log(`Local peer received answer`, 'sender');

  log('✓ WebRTC negotiation complete', 'success');
}

function stopMicStream(reason) {
  if (!micStream) return;

  micStream.getTracks().forEach(track => {
    log(`Stopping old mic track (${reason}): ${track.label || track.id}, state=${track.readyState}`, 'receiver');
    track.stop();
  });
  micStream = null;
}

function attachMicTrackEventHandlers(track) {
  track.onmute = () => {
    log(`Mic track muted: ${track.label || track.id}`, 'warning');
  };

  track.onunmute = () => {
    log(`Mic track unmuted: ${track.label || track.id}`, 'receiver');
  };

  track.onended = () => {
    log(`Mic track ended: ${track.label || track.id}`, 'warning');
  };
}

async function switchMicrophone(reason = 'manual switch') {
  try {
    selectedMicId = micSelect.value || '';
    const selectedMicLabel = micSelect.options[micSelect.selectedIndex]?.text || 'Default microphone';

    log(`🎤 Switching microphone (${reason}) to: ${selectedMicLabel}`, 'receiver');
    log(`  Mic deviceId: ${selectedMicId || '(default)'}`, 'receiver');
    micStatus.textContent = 'Requesting...';
    micStatus.style.color = '#856404';

    stopMicStream('before mic switch');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
    });

    // Store stream but don't play it
    micStream = stream;
    const tracks = stream.getAudioTracks();

    log(`✓ Microphone captured`, 'success');
    tracks.forEach((track, i) => {
      const settings = typeof track.getSettings === 'function' ? track.getSettings() : {};
      attachMicTrackEventHandlers(track);
      log(`  Mic track ${i + 1}: label=${track.label}, id=${track.id}, state=${track.readyState}`, 'receiver');
      log(`  Mic settings ${i + 1}: deviceId=${settings.deviceId || '(n/a)'}, sampleRate=${settings.sampleRate || '(n/a)'}, channelCount=${settings.channelCount || '(n/a)'}`, 'receiver');
    });

    micStatus.textContent = `✓ ${tracks[0]?.label || selectedMicLabel}`;
    micStatus.style.color = '#28a745';

    await refreshMicList('after microphone capture');

    log('ℹ️ Microphone captured for device switching test only; audio is not played', 'receiver');

  } catch (err) {
    log(`✗ Microphone switch/capture failed: ${err.name} - ${err.message}`, 'error');
    micStatus.textContent = `✗ ${err.name}`;
    micStatus.style.color = '#dc3545';
  }
}

// Get/switch microphone permission (for device enumeration only, won't play)
getMicBtn.addEventListener('click', () => {
  switchMicrophone('button click');
});

refreshMicBtn.addEventListener('click', () => {
  refreshMicList('manual refresh');
});

micSelect.addEventListener('change', () => {
  selectedMicId = micSelect.value || '';
  const label = micSelect.options[micSelect.selectedIndex]?.text || 'Default microphone';
  log(`Selected microphone: ${label}`, 'receiver');

  if (micStream) {
    switchMicrophone('select change');
  }
});

// Refresh speakers
refreshSpeakerBtn.addEventListener('click', () => {
  refreshSpeakerList('manual refresh');
});

// Speaker selection change
speakerSelect.addEventListener('change', async () => {
  if (!audioElement || !audioElement.srcObject) {
    log('No remote stream playing yet', 'warning');
    return;
  }

  if (!currentStreamType) {
    log('No stream type detected', 'warning');
    return;
  }

  if (typeof audioElement.setSinkId !== 'function') {
    log('setSinkId not supported', 'error');
    alert('setSinkId is not supported in this browser');
    return;
  }

  const deviceId = speakerSelect.value;
  const deviceLabel = speakerSelect.options[speakerSelect.selectedIndex].text;

  try {
    log(`🔊 Attempting to switch speaker to: ${deviceLabel}`, 'receiver');
    log(`  Stream type: ${currentStreamType.toUpperCase()} track (via WebRTC)`, 'receiver');
    log(`  Device ID: ${deviceId}`, 'receiver');

    const startTime = performance.now();
    await audioElement.setSinkId(deviceId);
    const duration = (performance.now() - startTime).toFixed(2);

    const currentSinkId = audioElement.sinkId || 'default';
    log(`✓ setSinkId() SUCCEEDED in ${duration}ms`, 'success');
    log(`  Current sinkId: ${currentSinkId}`, 'success');

    // Record success
    testResultsData[currentStreamType].attempted = true;
    testResultsData[currentStreamType].success = true;
    testResultsData[currentStreamType].error = null;

    speakerSwitchResult.innerHTML = `
      <div class="test-result pass">
        ✓ setSinkId() Promise RESOLVED for ${currentStreamType.toUpperCase()} track<br>
        Device: ${deviceLabel} (sinkId updated)<br>
        Time: ${duration}ms<br>
        <strong style="color: #856404;">⚠️ Put your ear near device to verify if audio ACTUALLY switched!</strong>
      </div>
    `;

    updateTestResults();

  } catch (err) {
    log(`✗ setSinkId() FAILED: ${err.name} - ${err.message}`, 'error');

    // Record failure
    testResultsData[currentStreamType].attempted = true;
    testResultsData[currentStreamType].success = false;
    testResultsData[currentStreamType].error = err.message;

    speakerSwitchResult.innerHTML = `
      <div class="test-result fail">
        ✗ setSinkId() threw ERROR for ${currentStreamType.toUpperCase()} track<br>
        Error: ${err.name} - ${err.message}<br>
        <strong>This is an explicit failure (not the silent failure bug)</strong>
      </div>
    `;

    updateTestResults();
  }
});

// Update test results summary
function updateTestResults() {
  let html = '<h4>Test Summary (WebRTC Remote Streams):</h4>';
  html += '<p style="font-size: 12px; color: #666; margin: 5px 0;">Note: "PASSED" means setSinkId() Promise resolved. You must physically verify if audio actually switched.</p>';

  // Single track result
  if (testResultsData.single.attempted) {
    const icon = testResultsData.single.success ? '✓' : '✗';
    const color = testResultsData.single.success ? '#155724' : '#721c24';
    const bg = testResultsData.single.success ? '#d4edda' : '#f8d7da';
    html += `
      <div style="background: ${bg}; color: ${color}; padding: 12px; margin: 10px 0; border-radius: 6px;">
        ${icon} <strong>SINGLE Track (WebRTC):</strong> ${testResultsData.single.success ? 'Promise Resolved ✓' : 'Promise Rejected ✗'}
        ${testResultsData.single.error ? `<br><small>Error: ${testResultsData.single.error}</small>` : ''}
        ${testResultsData.single.success ? '<br><small style="color: #856404;">⚠️ Did audio ACTUALLY switch? (Silent failure bug)</small>' : ''}
      </div>
    `;
  } else {
    html += `<div style="background: #e0e0e0; padding: 12px; margin: 10px 0; border-radius: 6px;">
      ⏳ <strong>SINGLE Track (WebRTC):</strong> Not tested yet
    </div>`;
  }

  // Dual track result
  if (testResultsData.dual.attempted) {
    const icon = testResultsData.dual.success ? '✓' : '✗';
    const color = testResultsData.dual.success ? '#155724' : '#721c24';
    const bg = testResultsData.dual.success ? '#d4edda' : '#f8d7da';
    html += `
      <div style="background: ${bg}; color: ${color}; padding: 12px; margin: 10px 0; border-radius: 6px;">
        ${icon} <strong>DUAL Track (WebRTC):</strong> ${testResultsData.dual.success ? 'Promise Resolved ✓' : 'Promise Rejected ✗'}
        ${testResultsData.dual.error ? `<br><small>Error: ${testResultsData.dual.error}</small>` : ''}
        ${testResultsData.dual.success ? '<br><small style="color: #28a745;">Usually works correctly on dual track</small>' : ''}
      </div>
    `;
  } else {
    html += `<div style="background: #e0e0e0; padding: 12px; margin: 10px 0; border-radius: 6px;">
      ⏳ <strong>DUAL Track (WebRTC):</strong> Not tested yet
    </div>`;
  }

  // Conclusion
  if (testResultsData.single.attempted && testResultsData.dual.attempted) {
    if (!testResultsData.single.success && testResultsData.dual.success) {
      html += `
        <div style="background: #fff3cd; border: 3px solid #ffc107; padding: 20px; margin: 15px 0; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #856404;">🐛 SILENT FAILURE BUG DETECTED!</h3>
          <p style="margin: 0;">
            <strong>Single track:</strong> setSinkId() Promise resolved BUT audio didn't actually switch ❌<br>
            <strong>Dual track:</strong> setSinkId() Promise resolved AND audio actually switched ✅<br>
            <br>
            <strong>This is the iOS Safari WebRTC silent failure bug:</strong><br>
            No errors thrown, but single-track streams don't actually route to the selected device.<br>
            <br>
            <em>Verify by putting your ear near the device after switching.</em>
          </p>
        </div>
      `;
    } else if (testResultsData.single.success && testResultsData.dual.success) {
      html += `
        <div style="background: #d4edda; border: 3px solid #28a745; padding: 20px; margin: 15px 0; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #155724;">✓ Both Promises Resolved</h3>
          <p style="margin: 0;">
            Both single and dual track setSinkId() Promises resolved successfully.<br>
            <br>
            <strong>Did audio ACTUALLY switch in both cases?</strong><br>
            If single track audio stayed on the original device = silent failure bug present.<br>
            The bug may be fixed, or you're not on iOS Safari, or you need to verify manually.
          </p>
        </div>
      `;
    }
  }

  testResults.innerHTML = html;
}

// Initialize
detectDevice();
initDeviceChangeMonitoring();
log('WebRTC test page loaded', 'success');
log('This test uses a local peer connection loop to simulate remote WebRTC streams', 'info');
receiverStatusText.innerHTML = '<strong>Status:</strong> Ready. Click a "Send" button to start.';
refreshSpeakerList('initial load');
refreshMicList('initial load');

// Cleanup
window.addEventListener('beforeunload', () => {
  isCleaningUp = true;
  clearTimeout(deviceChangeTimer);
  clearTimeout(audioReplayTimer);
  clearTimeout(audioContextResumeTimer);
  if (localPeer) localPeer.close();
  if (remotePeer) remotePeer.close();
  if (audioContext) audioContext.close();
  if (audioElement) {
    audioElement.pause();
    audioElement.srcObject = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }
});
