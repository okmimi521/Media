const file = document.querySelector('#file');
const tag = document.querySelector('#tag');
const player = document.querySelector('#player');
const status = document.querySelector('#status');
let microphoneStream;

function createPlayer() {
  player.firstChild?.pause();
  const media = document.createElement(tag.value);
  media.src = file.value;
  media.controls = true;
  media.loop = true;
  media.playsInline = true;
  player.replaceChildren(media);
}

file.onchange = createPlayer;
tag.onchange = createPlayer;

document.querySelector('#getUserMedia').onclick = async () => {
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    status.textContent = 'Microphone: active';
  } catch (error) {
    status.textContent = `${error.name}: ${error.message}`;
  }
};

createPlayer();
