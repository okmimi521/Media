const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const context = new AudioContextClass();
const output = context.createMediaStreamDestination();
const audio = new Audio();
const playButton = document.querySelector('#play');
const status = document.querySelector('#status');
let audioBuffer;
let source;
let microphoneStream;

audio.controls = true;
audio.srcObject = output.stream;
document.querySelector('#player').append(audio);

window.addEventListener('load', async () => {
  try {
    const response = await fetch('chrono.mp3');
    audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
    playButton.disabled = false;
    status.textContent = 'Audio file decoded';
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  }
}, { once: true });

playButton.onclick = async () => {
  source?.stop();
  source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  source.connect(output);

  await context.resume();
  source.start();
  await audio.play();
  status.textContent = `Playing stream, AudioContext: ${context.state}`;
};

document.querySelector('#getUserMedia').onclick = async () => {
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    status.textContent = 'Microphone: active';
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  }
};
