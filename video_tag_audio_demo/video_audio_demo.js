const audio = new Audio('chrono.mp3');
const mode = document.querySelector('#mode');
const playButton = document.querySelector('#play');
const status = document.querySelector('#status');
let context;
let output;
let audioBuffer;
let source;
let microphoneStream;

audio.controls = true;
audio.loop = true;
document.querySelector('#player').append(audio);

async function prepareStream() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    output = context.createMediaStreamDestination();
  }

  if (!audioBuffer) {
    const response = await fetch('chrono.mp3');
    audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
  }
}

mode.onchange = async () => {
  audio.pause();
  source?.stop();
  source = null;
  audio.srcObject = null;
  audio.removeAttribute('src');

  if (mode.value === 'direct') {
    audio.src = 'chrono.mp3';
    status.textContent = 'Direct mode ready';
    return;
  }

  playButton.disabled = true;
  status.textContent = 'Preparing AudioContext stream...';
  try {
    await prepareStream();
    if (mode.value === 'stream') {
      audio.srcObject = output.stream;
      status.textContent = 'Stream mode ready';
    }
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  } finally {
    playButton.disabled = mode.value === 'stream' && !audioBuffer;
  }
};

playButton.onclick = async () => {
  try {
    if (mode.value === 'direct') {
      await audio.play();
      status.textContent = 'Playing directly through audio tag';
      return;
    }

    await prepareStream();
    source?.stop();
    source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(output);
    audio.srcObject = output.stream;

    await context.resume();
    source.start();
    await audio.play();
    status.textContent = `Playing stream, AudioContext: ${context.state}`;
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  }
};

document.querySelector('#getUserMedia').onclick = async () => {
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    status.textContent = 'Microphone: active';
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  }
};
