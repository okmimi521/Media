const file = document.querySelector('#file');
const method = document.querySelector('#method');
const player = document.querySelector('#player');
const status = document.querySelector('#status');
let microphoneStream;

function createPlayer() {
  player.firstChild?.pause();
  const media = method.value === 'new-audio'
    ? new Audio()
    : document.createElement(method.value);
  media.src = file.value;
  media.controls = true;
  media.loop = true;
  media.playsInline = true;
  player.replaceChildren(media);
}

file.onchange = createPlayer;
method.onchange = createPlayer;

document.querySelector('#getUserMedia').onclick = async () => {
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    status.textContent = 'Microphone: active';
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  }
};

createPlayer();
