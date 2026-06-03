'use strict';

const AUDIO_FILES = [
  { label: 'ultrasound_data_48k_buildin_amp50.wav', src: '../ultrasound/ultrasound_data_48k_buildin_amp50.wav' },
  { label: 'ultrasound_data_48k_buildin_amp20.wav', src: '../ultrasound/ultrasound_data_48k_buildin_amp20.wav' },
  { label: 'test3.mp3', src: '../test3.mp3' },
  { label: 'test2.mp3', src: '../test2.mp3' },
];

const cardsEl = document.getElementById('cards');
let speakers = [];
let cardCount = 0;
const speakerSelects = [];

async function refreshSpeakers() {
  console.log('[refreshSpeakers] enumerating devices...');
  const devices = await navigator.mediaDevices.enumerateDevices();
  speakers = devices.filter(d => d.kind === 'audiooutput');
  console.log(`[refreshSpeakers] found ${speakers.length} output device(s):`,
    speakers.map(d => ({ deviceId: d.deviceId, label: d.label })));
  speakerSelects.forEach(fill);
}

function fill(select) {
  const prev = select.value;
  select.innerHTML = '';
  speakers.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.text = d.label || `Speaker ${i + 1}`;
    select.appendChild(o);
  });
  if (prev) select.value = prev;
}

function createCard() {
  cardCount += 1;
  const id = cardCount;
  console.log(`[createCard] creating Audio #${id}`);

  const card = document.createElement('div');

  const fileSelect = document.createElement('select');
  AUDIO_FILES.forEach(f => {
    const o = document.createElement('option');
    o.value = f.src;
    o.text = f.label;
    fileSelect.appendChild(o);
  });

  const speakerSelect = document.createElement('select');
  speakerSelects.push(speakerSelect);
  fill(speakerSelect);

  const audio = document.createElement('audio');
  audio.loop = true;
  audio.src = AUDIO_FILES[0].src;

  const playBtn = document.createElement('button');
  playBtn.textContent = 'Play';
  playBtn.onclick = () => {
    if (audio.paused) {
      console.log(`[Audio #${id}] play: ${audio.src} (loop=${audio.loop})`);
      audio.play()
        .then(() => console.log(`[Audio #${id}] playing`))
        .catch(err => console.error(`[Audio #${id}] play failed:`, err));
      playBtn.textContent = 'Stop';
    } else {
      console.log(`[Audio #${id}] stop`);
      audio.pause();
      audio.currentTime = 0;
      playBtn.textContent = 'Play';
    }
  };
  audio.onended = () => {
    console.log(`[Audio #${id}] ended`);
    playBtn.textContent = 'Play';
  };

  fileSelect.onchange = () => {
    console.log(`[Audio #${id}] file changed -> ${fileSelect.value}`);
    audio.src = fileSelect.value;
    playBtn.textContent = 'Play';
  };
  speakerSelect.onchange = () => {
    const sinkId = speakerSelect.value;
    if (audio.setSinkId) {
      console.log(`[Audio #${id}] setSinkId -> ${sinkId}`);
      audio.setSinkId(sinkId)
        .then(() => console.log(`[Audio #${id}] sink set ok`))
        .catch(err => console.error(`[Audio #${id}] setSinkId failed:`, err));
    } else {
      console.warn(`[Audio #${id}] setSinkId not supported in this browser`);
    }
  };

  card.append(fileSelect, speakerSelect, playBtn, audio);
  cardsEl.appendChild(card);
}

document.getElementById('addBtn').onclick = createCard;
document.getElementById('refreshBtn').onclick = refreshSpeakers;

// On page load: capture with default mic first, then refresh speaker list.
console.log('[init] requesting default mic...');
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.log('[init] mic granted, tracks:', stream.getAudioTracks().map(t => t.label));
  })
  .catch(err => console.warn('[init] mic request failed:', err))
  .then(refreshSpeakers)
  .then(createCard);
