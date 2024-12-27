import common from "../common.js"
import commonui from "../commonui.js";
import WebRTCAudio from '../WebrtcAudio.js'
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
  const {agc, ns, ec, deviceNull} = commonui.uiGetSelectAPM();
  constraints.audio.autoGainControl = agc;
  constraints.audio.noiseSuppression = ns;
  constraints.audio.echoCancellation = ec;
  constraints.audio.deviceId = deviceNull ? undefined : {exact: commonui.uiGetSelectMic()};
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
      $("#audioRecvTrackReadyState").html($("#audioRecvTrackReadyState").html() + "->" + commonui.uiGenerateDateSpan() + track.readyState);
      $("#audioRecvTrackReadyState").attr("status", track.readyState)
  }
  if($("#audioRecvTrackMute").attr("status") != track.muted.toString())
  {
      $("#audioRecvTrackMute").html($("#audioRecvTrackMute").html() + "->" + commonui.uiGenerateDateSpan() + track.muted);
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
      $("#audioPlayTag").html($("#audioPlayTag").html() + "->" + commonui.uiGenerateDateSpan() + eventText);
      $("#audioPlayTag").attr("status", eventText)
  }
  if($("#audioPlayTagPaused").attr("status") != tag.paused.toString())
    {
        $("#audioPlayTagPaused").html($("#audioPlayTagPaused").html() + "->" + commonui.uiGenerateDateSpan() + tag.paused);
        $("#audioPlayTagPaused").attr("status", tag.paused.toString())
    }
}

let audioContextList = [];
function createAudioContext() {
  let ctx = new AudioContext();
  audioContextList.push({ctx: ctx, stateList: [{time: new Date(), state: ctx.state, isEvent: false}]});
  ctx.onstatechange = ()=>{
    audioContextList.forEach(e=>{
      if(e.ctx==ctx && e.stateList[e.stateList.length - 1].state != ctx.state) 
        e.stateList.push({time: new Date(), state: ctx.state, isEvent: true})
    })
    updateAudioContextStatus();
  }
  updateAudioContextStatus();
}

function clearAudioContext() {
  audioContextList.forEach(e=>{
    e.ctx.close().then(()=>log("one audioconext closed")).catch(e=>{error("one audioconext closed failed: ", e)});
  })
  audioContextList = [];
}

let audioContextWithWorkletList = [];
function createAudioContextWithWorklet() {
  if(!window.AudioWorkletNode)
    return console.warn("AudioWorkletNode not support.")
  let ctx = new AudioContext();
  audioContextWithWorkletList.push({ctx: ctx, stateList: [{time: new Date(), state: ctx.state, isEvent: false}]});
  ctx.onstatechange = ()=>{
    audioContextWithWorkletList.forEach(e=>{
      if(e.ctx==ctx && e.stateList[e.stateList.length - 1].state != ctx.state) 
        e.stateList.push({time: new Date(), state: ctx.state, isEvent: true})
    })
    updateAudioContextStatus();
  }
  createAudioLevelProcessorNode(ctx);
  updateAudioContextStatus();
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
let stream;
const createAudioLevelProcessorNode = async (ctx) => {
    if(!levelWorkletprocessorjs)
	levelWorkletprocessorjs = await common.requestJS(`${document.location.origin}/interrupt/audioLevelProcessor.js`);
    await ctx.audioWorklet.addModule(levelWorkletprocessorjs);

    let levelWorkletNode = new ZoomAudioLevelAudioWorkletNode(ctx, 'audioLevelProcessor');
    if(stream){
      let snode = ctx.createMediaStreamSource(
        stream
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
}

function updateAudioContextStatus() {
  let str = '';
  if(audioContextList.length) {
    str += "AudioContext: ";
    audioContextList.forEach((e,i)=>{
      str+= `<br>[${i}]`
      e.stateList.forEach((e,i)=>{
        str+=  `${commonui.uiGenerateDateSpan(e.time)}${e.isEvent ? "(Event)" + e.state : e.state}->`
      })
    })
  }
  
  
  if(audioContextWithWorkletList.length) {
    str += `<br>\tAudioContext with worklet: `;
    audioContextWithWorkletList.forEach((e,i)=>{
      str+= `<br>[${i}]`
      e.stateList.forEach((e,i)=>{
        str+= `${commonui.uiGenerateDateSpan(e.time)}${e.isEvent ? "(Event)" + e.state : e.state}->`
      })
    })
    $('#audioContextStatus').html(str);
  }
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
    $('#callButton').click(async e => {
        await call();
        createAudioContextWithWorklet();
        $('#createAudioContextWithWorklet').attr('disabled', false)
    })
    $('#callButton3Secs').click(e => {
      setTimeout(call, 30000);
    })
    $('#disableTrackButton').click(e => {
      let result = WebRTCAudio.toggleTrackEnable();
      if(result != undefined) 
        $('#disableTrackButton').text(result ? "Disable Track" : "Enable Track" )
    })
    $('#enumerateDevice').click(updateDevice)
    $('#hangupButton').click(()=>{
      hangup();
      $('#createAudioContextWithWorklet').attr('disabled', true)
    })
    $('#updateTrackLabelButton').click(updateTrackLabel);
    $('#createAudioContext').click(createAudioContext);
    $('#clearAudioContext').click(clearAudioContext);
    $('#createAudioContextWithWorklet').click(createAudioContextWithWorklet);
    $('#clearAudioContextWithWorklet').click(clearAudioContextWithWorklet);
    $('#playTagButton').click(mannualPlayAudioTag);
    $('#resumeAudioContext').click(mannualResumeAllAudioContext);
    $('#replaceStream').click(async function() {
	await WebRTCAudio.recapture(prepareConstraints());
    })
    updateDevice();
    navigator.mediaDevices.addEventListener("devicechange", updateDevice);
    document.addEventListener('visibilitychange', () => {
      commonui.uiUpdateVisibilityStatus();
      log(`[${new Date().toLocaleTimeString()}] document visibilitychange: `, document.visibilityState)
    });
});

async function updateDevice(event) {
  let {deviceList, addDeviceList, removeDeviceList, changeList} = await common.enumerateDevices();
  if($("#deviceList").attr("status") == "")
  {
    $("#deviceList").html($("#deviceList").html() + commonui.uiGenerateDateSpan() + commonui.uiGenerateDeviceDiv(deviceList));
    $("#deviceList").attr("status", true)
  } else {
    $("#deviceList").html($("#deviceList").html() + "<br>" + commonui.uiGenerateDateSpan() + commonui.uiGenerateDeviceDiv(changeList) + "+" + commonui.uiGenerateDeviceDiv(addDeviceList) + "-" + commonui.uiGenerateDeviceDiv(removeDeviceList));
  }
  if(event)
    log(`[${new Date().toLocaleTimeString()}] ondevicechange: `, deviceList)
}

function updateTrackLabel () {
  commonui.updateAudioTrackLabel(WebRTCAudio.getSendTrack());
}

async function call () {
  try {
    audioTag = WebRTCAudio.getAudioPlayTag();
    registerPlayTagListner(audioTag);
    let audioRecvStream = await WebRTCAudio.startAudioEstablish(prepareConstraints());
    registerRecvTrackListener(audioRecvStream);
    stream = WebRTCAudio.getSendStream();
  } catch (e) {
    hangup()
  }
}

function hangup () {
  WebRTCAudio.hangup();
  stream = null;
}
