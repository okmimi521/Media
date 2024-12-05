import common from "../common.js"
import commonui from "../commonui.js";
import WebRTCAudio from '../webrtcAudio.js'
const { log , error, requestJS, chromeAECWorkaroundStream, chromeAECWorkaroundStream2 }= common;


const prepareConstraints = () => {
  let constraints = {
    audio: {
        autoGainControl: true,
        noiseSuppression: true,
        latency: 0,
        echoCancellation: true,
    },
    video: false
  };
  const {agc, ns, ec} = commonui.uiGetSelectAPM();
  constraints.audio.autoGainControl = agc;
  constraints.audio.noiseSuppression = ns;
  constraints.audio.echoCancellation = ec;
  constraints.audio.deviceId = {exact: commonui.uiGetSelectMic()};
  return constraints;
};

function registerRecvTrackListener(audioRecvStream) {
  let audioTrack = audioRecvStream.getAudioTracks()[0];
  updateRecvStatusInUI(audioTrack);
  audioTrack.onmute = (event) => {updateRecvStatusInUI(audioTrack)};
  audioTrack.onunmute = (event) => {updateRecvStatusInUI(audioTrack)};
  audioTrack.onended = (event) => {updateRecvStatusInUI(audioTrack)};
}

function updateRecvStatusInUI(track) {
  if($("#audioRecvTrackReadyState").attr("status") != track.readyState)
  {
      $("#audioRecvTrackReadyState").text($("#audioRecvTrackReadyState").text() + "->" + track.readyState);
      $("#audioRecvTrackReadyState").attr("status", track.readyState)
  }
  if($("#audioRecvTrackMute").attr("status") != track.muted.toString())
  {
      $("#audioRecvTrackMute").text($("#audioRecvTrackMute").text() + "->" + track.muted);
      $("#audioRecvTrackMute").attr("status", track.muted.toString())
  }
}

function registerPlayTagListner(tag) {
  updatePlaytagStatusInUI(tag);
  tag.oncanplay = (event) => {updatePlaytagStatusInUI(tag, "oncanplay")};
  tag.onabort = (event) => {updatePlaytagStatusInUI(tag, "onabort")};
  tag.oncanplaythrough = (event) => {updatePlaytagStatusInUI(tag, "oncanplaythrough")};
  tag.onended = (event) => {updatePlaytagStatusInUI(tag, "onended")};
  tag.onerror = (event) => {updatePlaytagStatusInUI(tag, "onerror")};
  tag.onloadeddata = (event) => {updatePlaytagStatusInUI(tag, "onloadeddata")};
  tag.onloadedmetadata = (event) => {updatePlaytagStatusInUI(tag, "onloadedmetadata")};
  tag.onplay = (event) => {updatePlaytagStatusInUI(tag, "onplay")};
  tag.onplaying = (event) => {updatePlaytagStatusInUI(tag, "onplaying")};
  tag.onpause = (event) => {updatePlaytagStatusInUI(tag, "onpause")};
}

function updatePlaytagStatusInUI (tag, eventText) {
  if(!eventText)return;
  if($("#audioPlayTag").attr("status") != eventText)
  {
      $("#audioPlayTag").text($("#audioPlayTag").text() + "->" + eventText);
      $("#audioPlayTag").attr("status", eventText)
  }
}

let audioContextList = [];
function createAudioContext() {
  let ctx = new AudioContext();
  audioContextList.push({ctx: ctx, stateList: []});
  ctx.onstatechange = ()=>{
    audioContextList.forEach(e=>{
      if(e.ctx==ctx) 
        e.stateList.push(ctx.state)
    })
    updateAudioContextStatus();
  }
  updateAudioContextAmountInUI();
}

function clearAudioContext() {
  audioContextList.forEach(e=>{
    e.ctx.close().then(()=>log("one audioconext closed")).catch(e=>{error("one audioconext closed failed: ", e)});
  })
  audioContextList = [];
  updateAudioContextAmountInUI();
}
function updateAudioContextAmountInUI() {
  $('#audioContextAmount').text(audioContextList.length);
}

let audioContextWithWorkletList = [];
function createAudioContextWithWorklet() {
  if(!window.AudioWorkletNode)
    return console.warn("AudioWorkletNode not support.")
  let ctx = new AudioContext();
  ctx.onstatechange = ()=>{
    audioContextWithWorkletList.forEach(e=>{
      if(e.ctx==ctx) 
        e.stateList.push(ctx.state)
    })
    updateAudioContextStatus();
  }
  createAudioLevelProcessorNode(ctx);
  audioContextWithWorkletList.push({ctx: ctx, stateList: []});
  
  updateAudioContextWithWorkletAmountInUI();
}

let levelWorkletprocessorjs;
// if(window.AudioWorkletNode) {
  class ZoomAudioLevelAudioWorkletNode extends AudioWorkletNode
  {
  constructor(context) {
      super(context, 'audioLevelProcessor');
      this.port.onmessage = this.handleMessage.bind(this);
  }

  handleMessage(event) {
      var data = event.data;
  console.log(data);
      switch (data.status) {
      }
  }

  postData(status, data) {
      this.port.postMessage({
          status: status,
          data: data
      }, [data.data.buffer]);
  }

  postCMD(status, data) {
      this.port.postMessage({
          status: status,
          data: data
      })
  }
  }
// }

let levelnodeList = [];
let levelSourceNodeList = [];
const createAudioLevelProcessorNode = async (ctx) => {
    if(!levelWorkletprocessorjs)
	levelWorkletprocessorjs = await common.requestJS(`${document.location.origin}/interrupt/audioLevelProcessor.js`);
    await ctx.audioWorklet.addModule(levelWorkletprocessorjs);

    let levelWorkletNode = new ZoomAudioLevelAudioWorkletNode(ctx, 'audioLevelProcessor');
    if(window.audioStream){
      let snode = ctx.createMediaStreamSource(
        window.audioStream
      );
      snode.connect(levelWorkletNode);
      log("stream source connected to ZoomAudioLevelAudioWorkletNode")
      levelSourceNodeList.push(snode);
    } else {
      levelSourceNodeList.push(null)
    }
    levelnodeList.push(levelWorkletNode)
	return levelWorkletNode;
}

const destroyAudioLevelProcessorNode = async (ctx) => {
    if(!levelnodeList.length) return;
    try {
      for (let i =0;i<=levelSourceNodeList.length;i++){
        if(levelSourceNodeList[i])
          levelSourceNodeList[i].disconnect();
        levelnodeList[i].disconnect();
      }
    } catch(e) {
    };
    levelnodeList = [];
    levelSourceNodeList = [];
};

function clearAudioContextWithWorklet() {
  audioContextWithWorkletList.forEach(e=>{
    destroyAudioLevelProcessorNode(e)
    e.ctx.close().then(()=>log("one audioconext with worklet closed")).catch(e=>{error("one audioconext with worklet closed failed: ", e)});
  })
  audioContextWithWorkletList = [];
  updateAudioContextWithWorkletAmountInUI();
}
function updateAudioContextWithWorkletAmountInUI() {
  $('#audioContextWithWorkletAmount').text(audioContextWithWorkletList.length);
}

function updateAudioContextStatus() {
  let str = "AudioContext: ";
  audioContextList.forEach((e,i)=>{
    str+= `<br>[${i}]`
    e.stateList.forEach((e,i)=>{
      str+= `${e}=>`
    })
  })
  
  str += `<br>\tAudioContext with worklet: `;
  audioContextWithWorkletList.forEach((e,i)=>{
    str+= `<br>[${i}]`
    e.stateList.forEach((e,i)=>{
      str+= `${e}=>`
    })
  })
  $('#audioContextStatus').html(str);
}

let audioTag;
function mannualPlayAudioTag() {
  if(audioTag)
    audioTag.play()
      .then(()=>log(`mannualPlayAudioTag OK.`))
      .catch(err=>error("mannualPlayAudioTag failed: " , err));
}

function mannualResumeAllAudioContext () {
  audioContextList.forEach((e,i)=>{
    e.ctx.resume()
    .then(()=>log(`Audio Context[${i}] resume OK.`))
    .catch(e=>error(`Audio Context[${i}] resume failed :${e.message}`))
  })
  
  audioContextWithWorkletList.forEach((e,i)=>{
    e.ctx.resume()
    .then(()=>log(`Audio Context with worklet [${i}] resume OK.`))
    .catch(e=>error(`Audio Context with worklet [${i}] resume failed :${e.message}`))
  })
}

window.addEventListener('load', async () => {
    $('#callButton').click(e => {
        call();
    })
    $('#callButton3Secs').click(e => {
      setTimeout(call, 30000);
    })
    $('#disableTrackButton').click(e => {
      let result = WebRTCAudio.toggleTrackEnable();
      if(result != undefined) 
        $('#disableTrackButton').text(result ? "Disable Track" : "Enable Track" )
    })
    $('#hangupButton').click(hangup)
    $('#createAudioContext').click(createAudioContext);
    $('#clearAudioContext').click(clearAudioContext);
    $('#createAudioContextWithWorklet').click(createAudioContextWithWorklet);
    $('#clearAudioContextWithWorklet').click(clearAudioContextWithWorklet);
    $('#playTagButton').click(mannualPlayAudioTag);
    $('#resumeAudioContext').click(mannualResumeAllAudioContext);
    navigator.mediaDevices.ondevicechange = async event => {
      let deviceList = await navigator.mediaDevices.enumerateDevices();
      log(`[${new Date().toLocaleTimeString()}] ondevicechange: `, deviceList)
    }
    document.addEventListener('visibilitychange', () => {
      log(`[${new Date().toLocaleTimeString()}] document visibilitychange: `, document.visibilityState)
    });
});

async function call () {
  audioTag = WebRTCAudio.getAudioPlayTag();
  registerPlayTagListner(audioTag);
  let audioRecvStream = await WebRTCAudio.startAudioEstablish(prepareConstraints());
  registerRecvTrackListener(audioRecvStream);
}

function hangup () {
  WebRTCAudio.hangup();
}