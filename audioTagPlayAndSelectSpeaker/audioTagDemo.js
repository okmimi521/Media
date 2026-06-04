'use strict';

const AUDIO_FILES = [
  { label: 'ultrasound_12_3838383838_fade5ms_amp20.wav', src: '../ultrasound/ultrasound_12_3838383838_fade5ms_amp20.wav' },
  // { label: 'test3.mp3', src: '../test3.mp3' },
  // { label: 'test2.mp3', src: '../test2.mp3' },
  { label: 'P501_C_english_f2_SWB_48k.wav', src: '../P501_C_english_f2_SWB_48k.wav' },
];

const cardsEl = document.getElementById('cards');
const ULTRASOUND_MIN_RATE = 48000; // ultrasound must play on a speaker >= 48k
let speakers = [];
let cardCount = 0;
const speakerSelects = [];
const speakerRates = new Map(); // deviceId -> sampleRate (Hz) or null

const Ctx = window.AudioContext || window.webkitAudioContext;
// On Chromium, AudioContext can bind to a specific output device, so we can
// probe a non-default speaker's rate. Elsewhere we can only read the default.
const canProbeSink = !!Ctx && 'setSinkId' in (Ctx.prototype || {});

const ua = navigator.userAgent;
const isSafari = /^((?!chrome|crios|android|edg).)*safari/i.test(ua);

// Safari only allows setSinkId inside a user gesture. We keep just the last
// deferred sink change and apply it on the next screen click anywhere.
let pendingSink = null; // { audio, sinkId, id }
if (isSafari) {
  document.addEventListener('click', () => {
    if (!pendingSink) return;
    const { audio, sinkId, id } = pendingSink;
    pendingSink = null;
    applySink(audio, sinkId, id);
  }, true);
}

// Autoplay can be blocked until a user gesture; retry blocked plays on the
// next click anywhere on the page.
const pendingAutoplay = new Set(); // play functions to retry
document.addEventListener('click', () => {
  if (!pendingAutoplay.size) return;
  const retries = [...pendingAutoplay];
  pendingAutoplay.clear();
  retries.forEach(play => play().catch(() => {}));
}, true);

// Apply a sink now, or (on Safari, outside a gesture) defer to the next click.
function applyOrDeferSink(audio, sinkId, id, userGesture) {
  if (!sinkId) return;
  if (isSafari && !userGesture) {
    pendingSink = { audio, sinkId, id };
    console.log(`[Audio #${id}] safari: setSinkId(${sinkId}) deferred to next screen click`);
    return;
  }
  pendingSink = null;
  applySink(audio, sinkId, id);
}

// Probe a speaker's current playback sample rate via a short-lived AudioContext.
// Safari can't bind AudioContext to a specific speaker, so skip probing there
// (ultrasound routing uses the built-in speaker by label instead).
// Results are cached in speakerRates; opening a context (and binding a sink)
// is expensive and can jank, so we cache and fully close before returning.
async function detectSampleRate(deviceId) {
  if (!Ctx || isSafari) return null;
  if (speakerRates.has(deviceId)) return speakerRates.get(deviceId); // cached
  let ctx;
  try {
    ctx = (deviceId && deviceId !== 'default' && canProbeSink)
      ? new Ctx({ sinkId: deviceId })
      : new Ctx();
    return ctx.sampleRate;
  } catch (e) {
    console.warn('[detectSampleRate] failed for', deviceId, e);
    return null;
  } finally {
    if (ctx) await ctx.close().catch(() => {}); // close fully before next probe
  }
}

const isUltrasound = (src) => /ultrasound/i.test(src || '');

// First speaker whose rate is >= 48k, suitable for ultrasound.
function pickHiRateSpeaker() {
  const found = speakers.find(d => (speakerRates.get(d.deviceId) || 0) >= ULTRASOUND_MIN_RATE);
  return found ? found.deviceId : null;
}

// Heuristic: is this output device the machine's built-in/internal speaker?
// There is no standard API for this, so we match by label:
//  - macOS:   "MacBook Pro Speakers", "... (Built-in)"
//  - Windows: internal speakers show as "Speakers (Realtek/Conexant/IDT/...)"
//             with no "built-in" keyword; GPU-HDMI (NVIDIA/AMD) and external
//             (USB/Bluetooth/HDMI/headset) outputs are excluded.
function isBuiltInSpeaker(label) {
  const s = (label || '').toLowerCase();
  if (!s) return false;
  // Explicit internal markers (macOS, localized).
  if (/built-?in|内置|内建|macbook.*speaker/.test(s)) return true;
  // Windows laptop onboard speakers, e.g. "Speakers (Realtek(R) Audio)".
  if (/speakers?|扬声器/.test(s) && /realtek/.test(s)) return true;
  return false;
}

function pickBuiltInSpeaker() {
  const found = speakers.find(d => isBuiltInSpeaker(d.label));
  return found ? found.deviceId : null;
}

async function refreshSpeakers() {
  console.log('[refreshSpeakers] enumerating devices...');
  const devices = await navigator.mediaDevices.enumerateDevices();
  speakers = devices.filter(d => d.kind === 'audiooutput');

  // Only probe devices we haven't measured yet (probing is slow / janky).
  for (const d of speakers) {
    if (!speakerRates.has(d.deviceId)) {
      speakerRates.set(d.deviceId, await detectSampleRate(d.deviceId));
    }
  }

  console.log(`[refreshSpeakers] found ${speakers.length} output device(s):`,
    speakers.map((d, i) => ({
      label: d.label || `Speaker ${i + 1}`,
      sampleRate: speakerRates.get(d.deviceId),
    })));

  speakerSelects.forEach(fill);
}

function fill(select) {
  const prev = select.value;
  select.innerHTML = '';
  speakers.forEach((d, i) => {
    const rate = speakerRates.get(d.deviceId);
    const tag = rate == null ? '' : ` — ${rate} Hz${rate < ULTRASOUND_MIN_RATE ? ' [<48k]' : ''}`;
    select.add(new Option((d.label || `Speaker ${i + 1}`) + tag, d.deviceId));
  });
  if (prev) select.value = prev;
}

// Mirrors RTCAudioPlayer._createAudioTag: build the element manually, keep it
// uncontrolled/unmuted, and attach it to document.documentElement.
function createAudioTag(src) {
  const audioTag = document.createElement('audio');
  audioTag.src = src;
  audioTag.autoplay = false;
  audioTag.controls = false;
  audioTag.muted = false;
  audioTag.loop = true;
  document.documentElement.appendChild(audioTag);
  return audioTag;
}

function applySink(audio, sinkId, id) {
  if (!audio.setSinkId) return console.warn(`[Audio #${id}] setSinkId not supported`);
  audio.setSinkId(sinkId)
    .then(() => console.log(`[Audio #${id}] sink -> ${sinkId} (${speakerRates.get(sinkId) ?? '?'} Hz)`))
    .catch(err => console.error(`[Audio #${id}] setSinkId failed:`, err));
}

// If the chosen file is ultrasound, route it automatically.
// Safari: prefer the built-in speaker (sink applied on the next screen click).
// Other browsers: pick a >= 48k speaker and apply immediately.
function autoRouteUltrasound(fileSelect, speakerSelect, audio, id) {
  if (!isUltrasound(fileSelect.value)) return;
  const best = isSafari ? (pickBuiltInSpeaker() || pickHiRateSpeaker()) : pickHiRateSpeaker();
  if (best) {
    speakerSelect.value = best;
    const reason = isSafari ? 'safari/built-in' : `>=${ULTRASOUND_MIN_RATE}Hz`;
    console.log(`[Audio #${id}] ultrasound -> speaker ${best} (${reason}) @ ${speakerRates.get(best)} Hz`);
    applyOrDeferSink(audio, best, id, false);
  } else {
    console.warn(`[Audio #${id}] no suitable speaker for ultrasound (safari=${isSafari})`);
  }
}

function createCard(defaultSrc) {
  cardCount += 1;
  const id = cardCount;
  console.log(`[createCard] creating Audio #${id}`);

  const card = document.createElement('div');

  const initialSrc = defaultSrc || AUDIO_FILES[0].src;

  const fileSelect = document.createElement('select');
  AUDIO_FILES.forEach(f => {
    const o = document.createElement('option');
    o.value = f.src;
    o.text = f.label;
    fileSelect.appendChild(o);
  });
  fileSelect.value = initialSrc;

  const speakerSelect = document.createElement('select');
  speakerSelects.push(speakerSelect);
  fill(speakerSelect);

  const audio = createAudioTag(initialSrc);

  const playBtn = document.createElement('button');
  playBtn.textContent = 'Play';

  function play() {
    console.log(`[Audio #${id}] play: ${audio.src} (loop=${audio.loop})`);
    playBtn.textContent = 'Stop';
    return audio.play()
      .then(() => console.log(`[Audio #${id}] playing`))
      .catch(err => {
        console.warn(`[Audio #${id}] play blocked, will retry on user click:`, err.name);
        playBtn.textContent = 'Play';
        pendingAutoplay.add(play); // retry on the next user interaction
        throw err;
      });
  }
  function stop() {
    console.log(`[Audio #${id}] stop`);
    pendingAutoplay.delete(play);
    audio.pause();
    audio.currentTime = 0;
    playBtn.textContent = 'Play';
  }
  playBtn.onclick = () => (audio.paused ? play() : stop());
  audio.onended = () => {
    console.log(`[Audio #${id}] ended`);
    playBtn.textContent = 'Play';
  };

  fileSelect.onchange = () => {
    console.log(`[Audio #${id}] file changed -> ${fileSelect.value}`);
    audio.src = fileSelect.value;
    playBtn.textContent = 'Play';
    autoRouteUltrasound(fileSelect, speakerSelect, audio, id);
  };
  speakerSelect.onchange = () => {
    const rate = speakerRates.get(speakerSelect.value) || 0;
    if (isUltrasound(fileSelect.value) && rate < ULTRASOUND_MIN_RATE) {
      console.warn(`[Audio #${id}] speaker ${rate} Hz < ${ULTRASOUND_MIN_RATE}; ultrasound may be lost`);
    }
    applyOrDeferSink(audio, speakerSelect.value, id, true); // dropdown change is a user gesture
  };

  // Ultrasound files auto-route on creation (Safari applies the sink on Play).
  autoRouteUltrasound(fileSelect, speakerSelect, audio, id);

  card.append(fileSelect, speakerSelect, playBtn);
  cardsEl.appendChild(card);

  play().catch(() => {}); // autoplay; falls back to user-click retry if blocked
}

document.getElementById('addBtn').onclick = () => createCard();
document.getElementById('refreshBtn').onclick = refreshSpeakers;

// On page load: capture with default mic first, then refresh speaker list.
console.log('[init] requesting default mic...');
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.log('[init] mic granted, tracks:', stream.getAudioTracks().map(t => t.label));
  })
  .catch(err => console.warn('[init] mic request failed:', err))
  .then(refreshSpeakers)
  .then(() => {
    // Two fixed audio tags by default.
    createCard('../P501_C_english_f2_SWB_48k.wav');
    createCard('../ultrasound/ultrasound_12_3838383838_fade5ms_amp20.wav');
  });
