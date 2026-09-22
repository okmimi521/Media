/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
/* global TimelineDataSeries, TimelineGraphView */

'use strict';

const audio2 = document.querySelector('audio#audio2');
const callButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const resumeButton = document.querySelector('button#resumeButton');
const recordButton = document.querySelector('button#recordButton');
const recordingDownload = document.querySelector('#recordingDownload');
const codecSelector = document.querySelector('select#codec');
const playbackSelector = document.querySelector('select#playbackMode');
const audioContextState = document.querySelector('#audioContextState');
hangupButton.disabled = true;
callButton.onclick = call;
hangupButton.onclick = hangup;
resumeButton.onclick = resumeAudioContext;
recordButton.onclick = toggleRecording;
playbackSelector.onchange = changePlaybackMode;

let pc1;
let pc2;
let localStream;

// AudioContext playback extension.
let remoteStream;
let audioContext;
let remoteSource;
let mediaRecorder;
let recordedChunks = [];
let recordingUrl;

let bitrateGraph;
let bitrateSeries;
let targetBitrateSeries;
let headerrateSeries;

let packetGraph;
let packetSeries;

let lastResult;

const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 0,
  voiceActivityDetection: false
};

const audioLevels = [];
let audioLevelGraph;
let audioLevelSeries;

// Enabling opus DTX is an expert option without GUI.
// eslint-disable-next-line prefer-const
let useDtx = false;

// Disabling Opus FEC is an expert option without GUI.
// eslint-disable-next-line prefer-const
let useFec = true;

// We only show one way of doing this.
const codecPreferences = document.querySelector('#codecPreferences');
const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
if (supportsSetCodecPreferences) {
  codecSelector.style.display = 'none';

  const {codecs} = RTCRtpReceiver.getCapabilities('audio');
  codecs.forEach(codec => {
    if (['audio/CN', 'audio/telephone-event'].includes(codec.mimeType)) {
      return;
    }
    const option = document.createElement('option');
    option.value = (codec.mimeType + ' ' + codec.clockRate + ' ' +
      (codec.sdpFmtpLine || '')).trim();
    option.innerText = option.value;
    codecPreferences.appendChild(option);
  });
  codecPreferences.disabled = false;
} else {
  codecPreferences.style.display = 'none';
}

// Change the ptime. For opus supported values are [10, 20, 40, 60].
// Expert option without GUI.
// eslint-disable-next-line no-unused-vars
async function setPtime(ptime) {
  const offer = await pc1.createOffer();
  await pc1.setLocalDescription(offer);
  const desc = pc1.remoteDescription;
  if (desc.sdp.indexOf('a=ptime:') !== -1) {
    desc.sdp = desc.sdp.replace(/a=ptime:.*/, 'a=ptime:' + ptime);
  } else {
    desc.sdp += 'a=ptime:' + ptime + '\r\n';
  }
  await pc1.setRemoteDescription(desc);
}

function gotStream(stream) {
  hangupButton.disabled = false;
  console.log('Received local stream');
  localStream = stream;
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length > 0) {
    console.log(`Using Audio device: ${audioTracks[0].label}`);
  }
  localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
  console.log('Adding Local Stream to peer connection');

  pc1.createOffer(offerOptions)
      .then(gotDescription1, onCreateSessionDescriptionError);

  bitrateSeries = new TimelineDataSeries();
  bitrateGraph = new TimelineGraphView('bitrateGraph', 'bitrateCanvas');
  bitrateGraph.updateEndDate();

  targetBitrateSeries = new TimelineDataSeries();
  targetBitrateSeries.setColor('blue');

  headerrateSeries = new TimelineDataSeries();
  headerrateSeries.setColor('green');

  packetSeries = new TimelineDataSeries();
  packetGraph = new TimelineGraphView('packetGraph', 'packetCanvas');
  packetGraph.updateEndDate();

  audioLevelSeries = new TimelineDataSeries();
  audioLevelGraph = new TimelineGraphView('audioLevelGraph', 'audioLevelCanvas');
  audioLevelGraph.updateEndDate();
}

function onCreateSessionDescriptionError(error) {
  console.log(`Failed to create session description: ${error.toString()}`);
}

function call() {
  callButton.disabled = true;
  codecSelector.disabled = true;
  console.log('Starting call');
  const servers = null;
  pc1 = new RTCPeerConnection(servers);
  console.log('Created local peer connection object pc1');
  pc1.onicecandidate = e => onIceCandidate(pc1, e);
  pc2 = new RTCPeerConnection(servers);
  console.log('Created remote peer connection object pc2');
  pc2.onicecandidate = e => onIceCandidate(pc2, e);
  pc2.ontrack = gotRemoteStream;
  console.log('Requesting local stream');
  navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: false
      })
      .then(gotStream)
      .catch(e => {
        alert(`getUserMedia() error: ${e.name}`);
      });
}

function gotDescription1(desc) {
  console.log(`Offer from pc1\n${desc.sdp}`);
  pc1.setLocalDescription(desc)
      .then(() => {
        if (!supportsSetCodecPreferences) {
          desc.sdp = forceChosenAudioCodec(desc.sdp);
        }
        pc2.setRemoteDescription(desc).then(() => {
          return pc2.createAnswer().then(gotDescription2, onCreateSessionDescriptionError);
        }, onSetSessionDescriptionError);
      }, onSetSessionDescriptionError);
}

function gotDescription2(desc) {
  console.log(`Answer from pc2\n${desc.sdp}`);
  pc2.setLocalDescription(desc).then(() => {
    if (!supportsSetCodecPreferences) {
      desc.sdp = forceChosenAudioCodec(desc.sdp);
    }
    if (useDtx) {
      desc.sdp = desc.sdp.replace('useinbandfec=1', 'useinbandfec=1;usedtx=1');
    }
    if (!useFec) {
      desc.sdp = desc.sdp.replace('useinbandfec=1', 'useinbandfec=0');
    }
    pc1.setRemoteDescription(desc).then(() => {}, onSetSessionDescriptionError);
  }, onSetSessionDescriptionError);
}

function hangup() {
  console.log('Ending call');
  stopRecording();
  localStream.getTracks().forEach(track => track.stop());
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
  codecSelector.disabled = false;
  audio2.srcObject = null;
  audio2.muted = false;
  remoteStream = null;
  recordButton.disabled = true;
  stopAudioContextPlayback();
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  updateAudioContextControls();
}

function gotRemoteStream(e) {
  if (supportsSetCodecPreferences) {
    const preferredCodec = codecPreferences.options[codecPreferences.selectedIndex];
    if (preferredCodec.value !== '') {
      const [mimeType, clockRate, sdpFmtpLine] = preferredCodec.value.split(' ');
      const {codecs} = RTCRtpReceiver.getCapabilities('audio');
      console.log(mimeType, clockRate, sdpFmtpLine);
      console.log(JSON.stringify(codecs, null, ' '));
      const selectedCodecIndex = codecs.findIndex(c => c.mimeType === mimeType && c.clockRate === parseInt(clockRate, 10) && c.sdpFmtpLine === sdpFmtpLine);
      const selectedCodec = codecs[selectedCodecIndex];
      codecs.splice(selectedCodecIndex, 1);
      codecs.unshift(selectedCodec);
      e.transceiver.setCodecPreferences(codecs);
      console.log('Preferred video codec', selectedCodec);
    }
  }

  if (remoteStream !== e.streams[0]) {
    remoteStream = e.streams[0];
    recordButton.disabled = false;
    playRemoteStream(remoteStream);
    console.log('Received remote stream');
  }
}

function changePlaybackMode() {
  if (remoteStream) {
    playRemoteStream(remoteStream);
  }
  updateAudioContextControls();
}

function playRemoteStream(stream) {
  if (playbackSelector.value === 'audioContext') {
    // Keep the remote stream attached to a media element. WebKit may stop
    // producing remote audio samples when the stream has no media element.
    audio2.srcObject = stream;
    audio2.muted = true;
    audio2.pause();
    stopAudioContextPlayback();

    audioContext = getAudioContext();
    remoteSource = audioContext.createMediaStreamSource(stream);
    remoteSource.connect(audioContext.destination);
    resumeAudioContext();
    return;
  }

  stopAudioContextPlayback();
  audio2.muted = false;
  if (audio2.srcObject !== stream) {
    audio2.srcObject = stream;
  }
  audio2.play().catch(error => {
    console.log(`Failed to play audio element: ${error.toString()}`);
  });
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    audioContext.onstatechange = updateAudioContextControls;
  }
  return audioContext;
}

function resumeAudioContext() {
  if (!remoteStream || playbackSelector.value !== 'audioContext') {
    return;
  }
  const context = getAudioContext();
  context.resume().then(() => {
    console.log(`AudioContext state: ${context.state}`);
    updateAudioContextControls();
  }).catch(error => {
    console.log(`Failed to resume AudioContext: ${error.toString()}`);
    updateAudioContextControls();
  });
}

function updateAudioContextControls() {
  const usesAudioContext = playbackSelector.value === 'audioContext';
  const state = audioContext ? audioContext.state : 'not created';
  resumeButton.hidden = !usesAudioContext;
  resumeButton.disabled = !remoteStream || state === 'running';
  audioContextState.textContent = usesAudioContext ? `AudioContext: ${state}` : '';
}

function stopAudioContextPlayback() {
  if (remoteSource) {
    remoteSource.disconnect();
    remoteSource = null;
  }
}

function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
    return;
  }
  startRecording();
}

function startRecording() {
  if (!remoteStream || typeof MediaRecorder === 'undefined') {
    alert('MediaRecorder is unavailable or no remote stream has been received.');
    return;
  }

  if (recordingUrl) {
    URL.revokeObjectURL(recordingUrl);
    recordingUrl = null;
  }
  recordingDownload.hidden = true;
  recordingDownload.removeAttribute('href');
  recordedChunks = [];

  const recordingStream = new MediaStream(remoteStream.getAudioTracks());
  const mimeType = getRecordingMimeType();
  const recorder = mimeType ?
    new MediaRecorder(recordingStream, {mimeType}) :
    new MediaRecorder(recordingStream);
  mediaRecorder = recorder;

  recorder.ondataavailable = event => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };
  recorder.onstop = () => {
    const type = recorder.mimeType || mimeType || 'audio/webm';
    const blob = new Blob(recordedChunks, {type});
    recordingUrl = URL.createObjectURL(blob);
    recordingDownload.href = recordingUrl;
    recordingDownload.download = `remote-audio-${Date.now()}.${type.includes('mp4') ? 'm4a' : 'webm'}`;
    recordingDownload.textContent = `Download recording (${Math.ceil(blob.size / 1024)} KB)`;
    recordingDownload.hidden = false;
    if (mediaRecorder === recorder) {
      mediaRecorder = null;
    }
    recordedChunks = [];
    recordButton.disabled = !remoteStream;
  };
  recorder.onerror = event => {
    console.log(`MediaRecorder error: ${event.error.toString()}`);
  };

  recorder.start(1000);
  recordButton.textContent = 'Stop Recording';
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    recordButton.disabled = true;
    mediaRecorder.stop();
  }
  recordButton.textContent = 'Start Recording';
}

function getRecordingMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm'
  ];
  return mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

updateAudioContextControls();

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function onIceCandidate(pc, event) {
  getOtherPc(pc).addIceCandidate(event.candidate)
      .then(
          () => onAddIceCandidateSuccess(pc),
          err => onAddIceCandidateError(pc, err)
      );
  console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

function onAddIceCandidateSuccess() {
  console.log('AddIceCandidate success.');
}

function onAddIceCandidateError(error) {
  console.log(`Failed to add ICE Candidate: ${error.toString()}`);
}

function onSetSessionDescriptionError(error) {
  console.log(`Failed to set session description: ${error.toString()}`);
}

function forceChosenAudioCodec(sdp) {
  return maybePreferCodec(sdp, 'audio', 'send', codecSelector.value);
}

// Copied from AppRTC's sdputils.js:

// Sets |codec| as the default |type| codec if it's present.
// The format of |codec| is 'NAME/RATE', e.g. 'opus/48000'.
function maybePreferCodec(sdp, type, dir, codec) {
  const str = `${type} ${dir} codec`;
  if (codec === '') {
    console.log(`No preference on ${str}.`);
    return sdp;
  }

  console.log(`Prefer ${str}: ${codec}`);

  const sdpLines = sdp.split('\r\n');

  // Search for m line.
  const mLineIndex = findLine(sdpLines, 'm=', type);
  if (mLineIndex === null) {
    return sdp;
  }

  // If the codec is available, set it as the default in m line.
  const codecIndex = findLine(sdpLines, 'a=rtpmap', codec);
  console.log('codecIndex', codecIndex);
  if (codecIndex) {
    const payload = getCodecPayloadType(sdpLines[codecIndex]);
    if (payload) {
      sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], payload);
    }
  }

  sdp = sdpLines.join('\r\n');
  return sdp;
}

// Find the line in sdpLines that starts with |prefix|, and, if specified,
// contains |substr| (case-insensitive search).
function findLine(sdpLines, prefix, substr) {
  return findLineInRange(sdpLines, 0, -1, prefix, substr);
}

// Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
// and, if specified, contains |substr| (case-insensitive search).
function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
  const realEndLine = endLine !== -1 ? endLine : sdpLines.length;
  for (let i = startLine; i < realEndLine; ++i) {
    if (sdpLines[i].indexOf(prefix) === 0) {
      if (!substr ||
        sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
        return i;
      }
    }
  }
  return null;
}

// Gets the codec payload type from an a=rtpmap:X line.
function getCodecPayloadType(sdpLine) {
  const pattern = new RegExp('a=rtpmap:(\\d+) \\w+\\/\\d+');
  const result = sdpLine.match(pattern);
  return (result && result.length === 2) ? result[1] : null;
}

// Returns a new m= line with the specified codec as the first one.
function setDefaultCodec(mLine, payload) {
  const elements = mLine.split(' ');

  // Just copy the first three parameters; codec order starts on fourth.
  const newLine = elements.slice(0, 3);

  // Put target payload first and copy in the rest.
  newLine.push(payload);
  for (let i = 3; i < elements.length; i++) {
    if (elements[i] !== payload) {
      newLine.push(elements[i]);
    }
  }
  return newLine.join(' ');
}

// query getStats every second
window.setInterval(() => {
  if (!pc1) {
    return;
  }
  const sender = pc1.getSenders()[0];
  if (!sender) {
    return;
  }
  sender.getStats().then(res => {
    res.forEach(report => {
      let bytes;
      let headerBytes;
      let packets;
      if (report.type === 'outbound-rtp') {
        if (report.isRemote) {
          return;
        }
        const now = report.timestamp;
        bytes = report.bytesSent;
        headerBytes = report.headerBytesSent;

        packets = report.packetsSent;
        if (lastResult && lastResult.has(report.id)) {
          const deltaT = (now - lastResult.get(report.id).timestamp) / 1000;
          // calculate bitrate
          const bitrate = 8 * (bytes - lastResult.get(report.id).bytesSent) /
            deltaT;
          const headerrate = 8 * (headerBytes - lastResult.get(report.id).headerBytesSent) /
            deltaT;

          // append to chart
          bitrateSeries.addPoint(now, bitrate);
          headerrateSeries.addPoint(now, headerrate);
          targetBitrateSeries.addPoint(now, report.targetBitrate);
          bitrateGraph.setDataSeries([bitrateSeries, headerrateSeries, targetBitrateSeries]);
          bitrateGraph.updateEndDate();

          // calculate number of packets and append to chart
          packetSeries.addPoint(now, (packets -
            lastResult.get(report.id).packetsSent) / deltaT);
          packetGraph.setDataSeries([packetSeries]);
          packetGraph.updateEndDate();
        }
      }
    });
    lastResult = res;
  });
}, 1000);

if (window.RTCRtpReceiver && ('getSynchronizationSources' in window.RTCRtpReceiver.prototype)) {
  let lastTime;
  const getAudioLevel = (timestamp) => {
    window.requestAnimationFrame(getAudioLevel);
    if (!pc2) {
      return;
    }
    const receiver = pc2.getReceivers().find(r => r.track.kind === 'audio');
    if (!receiver) {
      return;
    }
    const sources = receiver.getSynchronizationSources();
    sources.forEach(source => {
      audioLevels.push(source.audioLevel);
    });
    if (!lastTime) {
      lastTime = timestamp;
    } else if (timestamp - lastTime > 500 && audioLevels.length > 0) {
      // Update graph every 500ms.
      const maxAudioLevel = Math.max.apply(null, audioLevels);
      audioLevelSeries.addPoint(Date.now(), maxAudioLevel);
      audioLevelGraph.setDataSeries([audioLevelSeries]);
      audioLevelGraph.updateEndDate();
      audioLevels.length = 0;
      lastTime = timestamp;
    }
  };
  window.requestAnimationFrame(getAudioLevel);
}
