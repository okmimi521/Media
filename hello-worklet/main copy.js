// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const buttonResume = document.getElementById('button-resume');
buttonResume.addEventListener('click', () => {
  resumeAudioCtx();
});

let stream = null;
const audioContext = new AudioContext();
let hasAudioContextError = false;
audioContext.onstatechange = (event) => {
    console.log('AudioContext state changed to:', audioContext.state, event, lastAudioContextChangeTime);
    if (lastAudioContextChangeTime && event.timeStamp - lastAudioContextChangeTime < 100) {
        console.log('Ignore state change event.');
    } else {
            resumeAudioCtx();
    }
    lastAudioContextChangeTime = event.timeStamp;
}

const handleDelayedResumeAudioCtx = () => {
    if (document.hidden === true) {
        console.log('Document is visible, resuming AudioContext.');
        resumeAudioCtx();
        document.removeEventListener('visibilitychange', handleDelayedResumeAudioCtx);
    }
}
let isModuleLoaded = false;
let isPlaying = false;
let isGraphReady = false;
let oscillatorNode = null;

let lastAudioContextChangeTime = 0;
let lastAudioContextState = 'closed';
async function resumeAudioCtx() {
  console.log(stream)
  const muted = stream?.getAudioTracks()[0]?.muted;
  console.log('resumeAudioCtx, state:', audioContext.state, ', muted:', muted);
  if((audioContext.state !== 'running' && audioContext.state !== 'closed') && !muted ) {
      console.log('Resuming AudioContext...');
      await audioContext.resume().then(() => {
          console.log('AudioContext resumed successfully.');
      }).catch((e) => {
          hasAudioContextError = true;
          console.log('resumeAudioCtx error:', e);
      });
  }
}

const loadGraph = async (context) => {
  // oscillatorNode = new OscillatorNode(context);
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getAudioTracks()[0].onmute = () => {
    console.log('Audio track muted');
  };
  stream.getAudioTracks()[0].onunmute = () => {
    console.log('Audio track unmuted');
    resumeAudioCtx();
  };
  const inputeNode = audioContext.createMediaStreamSource(stream );
  const bypasser = new AudioWorkletNode(context, 'bypass-processor');
  const destNode = new MediaStreamAudioDestinationNode(audioContext);
  inputeNode.connect(bypasser).connect(destNode);
  bypasser.port.onmessage = ({data}) => {
    console.log('BypassProcessor process count:', data);
  };
  // oscillatorNode.start();
};

const startAudio = async (context) => {
  if (!isModuleLoaded) {
    await context.audioWorklet.addModule('bypass-processor.js');
    isModuleLoaded = true;
  }
  if (!isGraphReady) {
    await loadGraph(audioContext);
    isGraphReady = true;
  }
};


// A simplem onLoad handler. It also handles user gesture to unlock the audio
// playback.
window.addEventListener('load', async () => {
  const buttonEl = document.getElementById('button-start');
  buttonEl.disabled = false;

  buttonEl.addEventListener('click', async () => {
    if (!isPlaying) {
      await startAudio(audioContext);
      isPlaying = true;
      buttonEl.textContent = 'Playing...';
      buttonEl.classList.remove('start-button');
      audioContext.resume();
    } else {
      audioContext.suspend();
      isPlaying = false;
      buttonEl.textContent = 'START';
      buttonEl.classList.add('start-button');
    }
  });
});