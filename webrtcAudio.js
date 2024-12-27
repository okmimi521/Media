import common from './common.js'
import commonui from './commonui.js';
import StatCaculator from './StatCaculator.js'
/* 

    PeerConnection Testing Start

*/
let stream;
var peerconnectionA;
var peerconnectionB;
let loopbackstream;
// const audio2 = document.querySelector('audio#audio2');
const callButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const codecSelector = document.querySelector('select#codec');
const audio2 = new Audio();
audio2.autoplay = true;
hangupButton.disabled = true;


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
// const supportsSetCodecPreferences = false;
if (supportsSetCodecPreferences) {
  codecSelector.style.display = 'none';

  const {codecs} = RTCRtpSender.getCapabilities('audio');
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


async function startAudioEstablish (constraints) {
    // stopAudio();
    // initAudioContext();
  
    callButton.disabled = true;
    codecSelector.disabled = true;
    console.log('Starting call');
    try {
      stream = await common.getAudioStream(constraints)
    } catch (e) {
      common.error(`[${new Date().toLocaleTimeString()}] capture error: `, e.message, e.name);
      throw e;
    }
  // worklet for audio level
  // levelWorkletNode = await createAudioLevelProcessorNode();
  // let sourceStream = audioContext.createMediaStreamSource(stream);
  // sourceStream.connect(levelWorkletNode)
  
    let [pca, pcb, receiveStream] = await getPeerconnectionStream(stream)
    peerconnectionA = pca;
    peerconnectionB = pcb;
    startStatsMonitor(peerconnectionA, peerconnectionB);
    common.audioSrcObjPlay(receiveStream, commonui.uiGetSelectSpeaker())
    return receiveStream;
  }

  function getSendTrack () {
    return stream?.getAudioTracks()[0];
  }

  function getSendStream() {
    return stream;
  }
  
  const getPeerconnectionStream = async (localStream) => {
    return new Promise((resolve, reject) => {
        let ls = new MediaStream();
        const servers = null;
        let p1 = new RTCPeerConnection(servers);
        console.log('Created local peer connection object p1');
        p1.onicecandidate = e => onIceCandidate(p1, e);
        let p2 = new RTCPeerConnection(servers);
        console.log('Created remote peer connection object p2');
        p2.onicecandidate = e => onIceCandidate(p2, e);
        p2.ontrack = (e) => {
            ls.addTrack(e.track);
            resolve([p1,p2, ls])
        };
        p1.addTrack(localStream.getAudioTracks()[0])
        PCTestGotStream(p1, p2, localStream)
        hangupButton.disabled = false;
    // startGettingAudioLevel();
    });
  }
  
  const onIceCandidate = (pc, event) => {
    getOtherPc(pc).addIceCandidate(event.candidate)
        .then(
            () => onAddIceCandidateSuccess(pc),
            err => onAddIceCandidateError(pc, err)
        );
    console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
  }
  
  const onAddIceCandidateSuccess = () => {
    console.log('AddIceCandidate success.');
  }
  
  const onAddIceCandidateError = (error) => {
    console.log(`Failed to add ICE Candidate: ${error.toString()}`);
  }
  
  const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 0,
    voiceActivityDetection: false
  };
  const PCTestGotStream = (pc1, pc2, st) => {
    console.log('Received local stream');
  
    if (supportsSetCodecPreferences) {
        const preferredCodec = codecPreferences.options[codecPreferences.selectedIndex];
        if (preferredCodec.value !== '') {
        const [mimeType, clockRate, sdpFmtpLine] = preferredCodec.value.split(' ');
        const {codecs} = RTCRtpSender.getCapabilities('audio');
        console.log(mimeType, clockRate, sdpFmtpLine);
        console.log(JSON.stringify(codecs, null, ' '));
        const selectedCodecIndex = codecs.findIndex(c => c.mimeType === mimeType && c.clockRate === parseInt(clockRate, 10) && c.sdpFmtpLine === sdpFmtpLine);
        const selectedCodec = codecs[selectedCodecIndex];
        codecs.splice(selectedCodecIndex, 1);
        codecs.unshift(selectedCodec);
        const transceiver = pc1.getTransceivers().find(t => t.sender && t.sender.track === stream.getAudioTracks()[0]);
        transceiver.setCodecPreferences(codecs);
        console.log('Preferred video codec', selectedCodec);
        }
    };
  
    pc1.createOffer(offerOptions)
      .then(desc => {gotDescription1(desc, pc1, pc2)}, onCreateSessionDescriptionError);
  }
  
  function gotDescription1(desc, pc1, pc2) {
    console.log(`Offer from pc1\n${desc.sdp}`);
    pc1.setLocalDescription(desc)
        .then(() => {
          if (!supportsSetCodecPreferences) {
            desc.sdp = forceChosenAudioCodec(desc.sdp);
          }
          pc2.setRemoteDescription(desc).then(() => {
            return pc2.createAnswer().then(desc => {gotDescription2(desc, pc2, pc1)}, onCreateSessionDescriptionError);
          }, onSetSessionDescriptionError);
        }, onSetSessionDescriptionError);
  }
  
  function gotDescription2(desc, pc2, pc1) {
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
  
  function onCreateSessionDescriptionError(error) {
    console.log(`Failed to create session description: ${error.toString()}`);
  }
  
  export function hangup() {
    stopStatsMonitor();
    console.log('Ending call');
    // clearInterval(getInterval);
    if(stream)
        stream.getTracks().forEach(track => track.stop());
    if(loopbackstream)
        loopbackstream.getTracks().forEach(track => track.stop());
    if(peerconnectionA)
        peerconnectionA.close();
    if(peerconnectionB)
        peerconnectionB.close();
    // if(stream)
    //     commonui.uiUpdateAudioStatus(audioContext, stream.getAudioTracks()[0])
    peerconnectionA = null;
    peerconnectionB = null;
    stream = null;
    loopbackstream = null;
    hangupButton.disabled = true;
    callButton.disabled = false;
    codecSelector.disabled = false;
  }
  
  function getOtherPc(pc) {
    return (pc === peerconnectionA) ? peerconnectionB : peerconnectionA;
  }
  
  function getName(pc) {
    return (pc === peerconnectionA) ? 'peerconnectionA' : 'peerconnectionB';
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
  
  let getAudioLevelInterval;
  function startGettingAudioLevel() {
  clearInterval(getAudioLevelInterval);
  getAudioLevelInterval = setInterval(() => {
    // levelWorkletNode.port.postMessage({"command": "getAudioLevel"})
    if(!pc1 || !pc2) return clearInterval(getAudioLevelInterval);
    
    pc1.getStats().then(stats => {
      // stats.forEach(e=>e.type === "media-source" && console.log(audioLevel.getAudioLevel_R16FromNormalized(e.audioLevel)))
    })	
  }, 200);
  }
  
  function adjustJitterbuffertTaget(bufferInMs) {
    if(!peerconnectionB) return;

    let receivers = peerconnectionB.getReceivers().forEach(recv=>{
        recv.jitterBufferTarget = bufferInMs;
    });
  }

let statsInterval;
let monitor;
function startStatsMonitor (senderPC, recvPC) {
  stopStatsMonitor();
  statsInterval = setInterval(()=>{
    recvPC.getReceivers().forEach(recv=>{
      recv.getStats().then(parseRecvStats);
      let ss = recv.getSynchronizationSources();
      // if(ss && ss.length !=0)
      //   console.log(`Timestamp: ${ss[0].timestamp}, rtpTimestamp: ${ss[0].rtpTimestamp}`)

      let p = recv.getParameters()
      // console.log(p)
    });
    senderPC.getSenders().forEach(send =>{
      send.getStats().then(parseSenderStats);
    })
  },200)
}
function stopStatsMonitor () {
  clearInterval(statsInterval);
}
function parseSenderStats(stats) {
  let tmp = Array.from(stats.values());
  let ir = tmp.find(e=>e.type=="outbound-rtp")
  let mp = tmp.find(e=>e.type=="media-source")
  let ror = tmp.find(e=>e.type=="remote-inbound-rtp");
  let str = '';
  // tmp.forEach(e=>console.log(e.type))
  // if(ror)
  //   console.log(`Timestamp: ${ror.timestamp}, remoteTimestamp: ${ror.remoteTimestamp}`)
  if(ir){
    Object.entries(ir).forEach(entry=>{
      str += `${entry[0]}:${entry[1]} <br>`
    })
    str+="<br>"
  }
  if(ror)
  {
    Object.entries(ror).forEach(entry=>{
      str += `${entry[0]}:${entry[1]} <br>`
    })
    str+="<br>"
  }
  if(mp)
  {
    Object.entries(mp).forEach(entry=>{
      str += `${entry[0]}:${entry[1]} <br>`
    })
  }
  $('#senderStat').html(str);
}

function parseRecvStats(stats) {
  let tmp = Array.from(stats.values());
  let ir = tmp.find(e=>e.type=="inbound-rtp")
  let mp = tmp.find(e=>e.type=="media-playout")
  let ror = tmp.find(e=>e.type=="remote-outbound-rtp");
  let str = '';
  // tmp.forEach(e=>console.log(e.type))
  // if(ror)
  //   console.log(`Timestamp: ${ror.timestamp}, remoteTimestamp: ${ror.remoteTimestamp}`)
  if(ir){
    Object.entries(ir).forEach(entry=>{
      str += `${entry[0]}:${entry[1]} <br>`
    })
    str+="<br>"
  }
  if(ror)
  {
    Object.entries(ror).forEach(entry=>{
      str += `${entry[0]}:${entry[1]} <br>`
    })
    str+="<br>"
  }
  if(mp)
  {
    Object.entries(mp).forEach(entry=>{
      str += `${entry[0]}:${entry[1]} <br>`
    })
  }
  $('#stat').html(str);
  parseAudiojitterbuffer(ir);
}

function parseAudiojitterbuffer(is) {
  if(!monitor)
    monitor = new StatCaculator();
  monitor.updateStat(is);
  
  const [jitterbufferDelayCrt, jitterbufferTargetDelayCrt, jitterbufferMinimunDelayCrt, jitterBufferEmittedCountCrt] = monitor.getJittbufferDelay();
  let jitterbufferDelayCrtInMs = 0,
    jitterbufferTargetDelayCrtInMs = 0,
    jitterbufferMinimunDelayCrtInMs = 0;
  if(jitterBufferEmittedCountCrt>0){
    jitterbufferDelayCrtInMs = Math.round(jitterbufferDelayCrt * 1000/jitterBufferEmittedCountCrt);
    jitterbufferTargetDelayCrtInMs = Math.round(jitterbufferTargetDelayCrt * 1000/jitterBufferEmittedCountCrt);
    jitterbufferMinimunDelayCrtInMs = Math.round(jitterbufferMinimunDelayCrt * 1000/jitterBufferEmittedCountCrt);
  }
  let str = `Audio Jitterbuffer, delay: ${jitterbufferDelayCrtInMs}ms, 
  target: ${jitterbufferTargetDelayCrtInMs}ms,
  minimum: ${jitterbufferMinimunDelayCrtInMs}ms`;
  $('#audiostat').html(str)
  
  if(vcb)
    vcb(jitterbufferDelayCrtInMs);
}

let vcb;
function bindSyncFuncToVideo(cb) {
  vcb = cb;
}
  
  /* 
  
    PeerConnection Testing End
  
  */

function getAudioPlayTag () {
  return common.getAudioPlaytag1();
}

function toggleTrackEnable() {
  if (!stream) return;
  let track = stream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  return track.enabled;
}

async function recapture () {
  if (!stream) return;
  common.stopStream(stream);
  stream = null;

  try {
    stream = await common.getAudioStream(constraints)
  } catch (e) {
    common.error(`[${new Date().toLocaleTimeString()}] capture error: `, e.message, e.name);
    throw e;
  }
  let transceiver = this.publisher.getTransceivers();
  let sender;
  if (transceiver.length) 
    sender = transceiver[0].sender;
  
  stream.getAudioTracks().forEach((track) => {
    if (sender)
    sender.replaceTrack(track).catch((error) => {
      common.error(`[${new Date().toLocaleTimeString()}] replaceTrack error: `, e.message, e);
    });
  });
}

export default {
    startAudioEstablish,
    adjustJitterbuffertTaget,
    hangup,
    bindSyncFuncToVideo,
    getAudioPlayTag,
    toggleTrackEnable,
    getSendTrack,
    getSendStream,
    recapture
}
