/* 

    Common functions

*/


/* 

    ---- Modify bellow by yourself ----

*/

const IP = `localhost`
const PORT = `443`
const DOMAIN = `http://${IP}:${PORT}`
const DELAY_URL = `${document.location.origin}/latency`
/* 

    ---- Modify above by yourself ----

*/
import commonui from './commonui.js'

const log = (...args) => {console.log(...args), commonui.uiDebugPrint(...args)}
const error = (...args) => {console.error(...args), commonui.uiDebugPrint(...args)}
let audioTag = new Audio();
let audioTag2 = new Audio();
audioTag.autoplay = audioTag2.autoplay = true;
let deviceList;

export async function enumerateDevices() { 
    if(!navigator.mediaDevices)
        return [];
    let stream = await  navigator.mediaDevices.getUserMedia({audio: true, video: false})
    stream.getTracks().forEach(track =>{
        track.stop();
    }); 
    stream = null;
    deviceList = await navigator.mediaDevices.enumerateDevices();
    deviceList.forEach((device) => {
        log(`${device.kind}: ${device.label} deviceId = ${device.deviceId}`);
    });
    return deviceList;
}

export function getBrowserUserAgent() {
    return navigator.userAgent;
}

export function isBrowserFirefox() {
    return getBrowserUserAgent().match("Firefox");
}
export function isBrowserChrome() {
    return getBrowserUserAgent().match("Chrome");
}

async function getDestktopMediaStream() {
    return await navigator.mediaDevices
        .getDisplayMedia({
        video: true,
        audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false},
        })
}


async function getAudioStream(constraints) {
    let defaultConstraints = {
        audio: {
            autoGainControl: false,
            noiseSuppression: false,
            latency: 0,
            echoCancellation: false,
        },
        video: false
      };
    if(constraints.audio.deviceId && constraints.audio.deviceId.exact )
      log("Using Microphone : ", deviceList.find(e=>e.deviceId === constraints.audio.deviceId.exact))
    let stream =  await navigator.mediaDevices
      .getUserMedia(Object.assign({}, defaultConstraints, constraints))

      let audioTrack = stream.getAudioTracks()[0];
      commonui.uiUpdateAudioStatus(0, audioTrack);
      audioTrack.onmute = (event) => {
        commonui.uiUpdateAudioStatus(0, audioTrack)
      };
      audioTrack.onunmute = (event) => {
        commonui.uiUpdateAudioStatus(0, audioTrack)
      };
      audioTrack.onended = (event) => {commonui.uiUpdateAudioStatus(0, audioTrack)};
    return stream;
}



async function audioSrcObjPlay(stream, deviceId) {
    if (audioTag.srcObject !== stream ) {
        audioTag.srcObject = stream;
        audioTag.play();
		
    }

    if(!deviceId) 
        return audioTag

	try {
		if(audioTag.setSinkId){
			await audioTag.setSinkId(deviceId);
			log("Received stream play, Success Using Speaker : ", deviceList.find(e=>e.deviceId === deviceId && e.kind=="audiooutput"))  
		} else {
			log("Received stream play, Success System Default speaker.");
		}
	} catch (err) {
		let errorMessage = err.message;
		if (err.name === 'SecurityError') {
			errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`;
		}
		error(errorMessage);
		// Jump back to first output device in the list as it's the default.
		audioOutputSelect.selectedIndex = 0;
		log("Received stream play, Error Using Speaker. You need to use HTTPS for selecting audio output device : ", deviceList.find(e=>e.deviceId === deviceId && e.kind=="audiooutput")) 
	} 
    return audioTag;
    // sourceStream = audioContext.createMediaStreamSource(e.streams[0])
    // sourceStream.connect(audioContext.destination);
    // console.log('Received remote stream');
}

async function audioSrcObjPlay2(stream, deviceId, loop =false) {
    if (audioTag2.srcObject !== stream) {
        audioTag2.srcObject = stream;
        audioTag2.play();
        if(!isBrowserChrome()) // setSinkId for chrome only https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
            return;
        try {
            await audioTag2.setSinkId(deviceId);
            log("Received stream play2, Success Using Speaker : ", deviceList.find(e=>e.deviceId === deviceId && e.kind=="audiooutput"))  
        } catch (err) {
            let errorMessage = err;
            if (err.name === 'SecurityError') {
                errorMessage = `You need to use HTTPS for selecting audio output device: ${err}`;
            }
            error(errorMessage);
            // Jump back to first output device in the list as it's the default.
            audioOutputSelect.selectedIndex = 0;
            log("Received stream play2, Error Using Speaker. You need to use HTTPS for selecting audio output device : ", deviceList.find(e=>e.deviceId === deviceId && e.kind=="audiooutput")) 
        } 
    }
    
    // sourceStream = audioContext.createMediaStreamSource(e.streams[0])
    // sourceStream.connect(audioContext.destination);
    // console.log('Received remote stream');
}

function stopStream (stream){
    stream.getTracks().forEach( e=>e.stop() );
}

let pc1, pc2;
const chromeAECWorkaroundStream = (localStream) => {
    if(pc1) pc1.close();
    if(pc2) pc2.close();
    return new Promise(async (resolve,reject)=>{
        let ls = new MediaStream();
        const servers = null;
        pc1 = new RTCPeerConnection(servers);
        log('Created local peer connection object pc1');
        pc1.onicecandidate = e => {e.candidate &&
            pc2.addIceCandidate(new RTCIceCandidate(e.candidate))
        }
        pc2 = new RTCPeerConnection(servers);
        log('Created remote peer connection object pc2');
        pc2.onicecandidate = e => {e.candidate &&
            pc1.addIceCandidate(new RTCIceCandidate(e.candidate))
        }
        pc2.ontrack = (e) => {
            ls.addTrack(e.track);
            resolve(ls)
        };
        pc1.addTrack(localStream.getAudioTracks()[0])
        const offerOptions = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 0,
            voiceActivityDetection: false
        };
        let pc1Descp = await pc1.createOffer(offerOptions)
        let chromeversion = getBrowserVersion();
        if (chromeversion >= 104) {
            pc1Descp.sdp = pc1Descp.sdp.replace('SAVPF 111', 'SAVPF 100 111');
            pc1Descp.sdp = pc1Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:100 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        } else {
            pc1Descp.sdp = pc1Descp.sdp.replace('SAVPF 111', 'SAVPF 10 111');
            pc1Descp.sdp = pc1Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:10 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        }
        await pc1.setLocalDescription(pc1Descp)
        await pc2.setRemoteDescription(pc1Descp);

        let pc2Descp = await pc2.createAnswer();
        if (chromeversion >= 104) {
            
            pc2Descp.sdp = pc2Descp.sdp.replace('SAVPF 111', 'SAVPF 100 111');
            pc2Descp.sdp = pc2Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:100 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        } else {
            
            pc2Descp.sdp = pc2Descp.sdp.replace('SAVPF 111', 'SAVPF 10 111');
            pc2Descp.sdp = pc2Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:10 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        }
        await pc2.setLocalDescription(pc2Descp)
        pc1.setRemoteDescription(pc2Descp);
        
        log('Peer connection connected');

    })
}

function closeAECChromeAECWorkaroundStream () {
    if(pc1) pc1.close();
    if(pc2) pc2.close();
    pc1 = null;
    pc2 = null;
}

let pc3, pc4;
const chromeAECWorkaroundStream2 = async (localStream) => {
    if(pc3) pc3.close();
    if(pc4) pc4.close();

    return new Promise(async (resolve,reject)=>{
        let ls = new MediaStream();
        const servers = null;
        pc3 = new RTCPeerConnection(servers);
        log('Created local peer connection object pc3');
        pc3.onicecandidate = e => {e.candidate &&
            pc4.addIceCandidate(new RTCIceCandidate(e.candidate))
        }
        pc4 = new RTCPeerConnection(servers);
        log('Created remote peer connection object pc4');
        pc4.onicecandidate = e => {e.candidate &&
            pc3.addIceCandidate(new RTCIceCandidate(e.candidate))
        }
        pc4.ontrack = (e) => {
            e.streams[0].getTracks().forEach((track) => {
                ls.addTrack(track);
            });
            resolve(ls)
        };
        pc3.addStream(new MediaStream(localStream.getAudioTracks()))
        const offerOptions = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 0,
            voiceActivityDetection: false
        };
        let pc3Descp = await pc3.createOffer(offerOptions)
        let chromeversion = getBrowserVersion();
        if (chromeversion >= 104) {
            pc3Descp.sdp = pc3Descp.sdp.replace('SAVPF 111', 'SAVPF 100 111');
            pc3Descp.sdp = pc3Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:100 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        } else {
            pc3Descp.sdp = pc3Descp.sdp.replace('SAVPF 111', 'SAVPF 10 111');
            pc3Descp.sdp = pc3Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:10 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        }
        await pc3.setLocalDescription(pc3Descp)
        await pc4.setRemoteDescription(pc3Descp);

        let pc4Descp = await pc4.createAnswer();
        if (chromeversion >= 104) {
            
            pc4Descp.sdp = pc4Descp.sdp.replace('SAVPF 111', 'SAVPF 100 111');
            pc4Descp.sdp = pc4Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:100 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        } else {
            
            pc4Descp.sdp = pc4Descp.sdp.replace('SAVPF 111', 'SAVPF 10 111');
            pc4Descp.sdp = pc4Descp.sdp.replace(
            'a=rtpmap:111 opus/48000/2',
            'a=rtpmap:10 L16/48000\na=rtpmap:111 opus/48000/2'
            );
        }
        await pc4.setLocalDescription(pc4Descp)
        pc3.setRemoteDescription(pc4Descp);
        
        log('Peer connection 2 connected');
    })
}

function closeAECChromeAECWorkaroundStream2 () {
    if(pc3) pc3.close();
    if(pc4) pc4.close();
    pc3 = null;
    pc4 = null;
}



function getBrowserInfo() {
    var agent = navigator.userAgent.toLowerCase();
    var regStr_ff = /firefox\/[\d.]+/gi;
    var regStr_chrome = /chrome\/[\d.]+/gi;
    var regStrChrome2 = /ipad; cpu os (\d+_\d+)/gi;
    var regStr_saf = /safari\/[\d.]+/gi;
    var regStr_saf2 = /safari\/[\d.]+/gi;
    var regStr_edg = /edg\/[\d.]+/gi;
  
    // firefox
    if (agent.indexOf('firefox') > 0) {
      return agent.match(regStr_ff);
    }
    
    // Safari
    if (agent.indexOf('safari') > 0 && agent.indexOf('chrome') < 0) {
        var tmpInfo = 'safari/unknow';
        var tmpInfo2;
        tmpInfo = agent.match(regStr_saf);
        tmpInfo2 = agent.match(regStr_saf2);
        if (tmpInfo) {
        tmpInfo = [tmpInfo.toString().replace('version', 'safari')];
        }
        if (tmpInfo2) {
        tmpInfo = [tmpInfo2.toString().replace('version', 'safari')];
        }
        return tmpInfo;
    }

    // Chrome
    if (agent.indexOf('chrome') > 0) {
        return agent.match(regStr_chrome);
    }

    return 'other';
}

function getBrowserVersion() {
    return getBrowserInfo()[0].match(/(\d+)/)[0];
}

async function requestJS (url)  {
    return new Promise ((resolve) => {  
        let XR = new XMLHttpRequest();
        XR.onload = function () {
            const processorBlob = new Blob([this.responseText], { type: 'text/javascript' });
            const processorURL = URL.createObjectURL(processorBlob);
            resolve(processorURL);
        }
        XR.open("get", url, true);
        XR.send();
    }); 
}

async function httpPost (url, json)  {
    return new Promise ((resolve) => {  
        let XR = new XMLHttpRequest();
        XR.open("post", url, true);
        XR.onload = function () {
            resolve(this.responseText);
        }
        XR.setRequestHeader("Content-Type", "application/json");
        // XR.setResponseHeader("Content-Type", "application/json");
        XR.send(json);
    }); 
}

function getAudioPlaytag1 () {
    return audioTag
}

export default {
    log,
    error,
    enumerateDevices,
    getAudioStream,
    getDestktopMediaStream,
    audioSrcObjPlay,
    getAudioPlaytag1,
    audioSrcObjPlay2,
    stopStream,
    chromeAECWorkaroundStream,
    closeAECChromeAECWorkaroundStream,
    chromeAECWorkaroundStream2,
    closeAECChromeAECWorkaroundStream2,
    requestJS,
    httpPost,
	isBrowserFirefox,
    DOMAIN,
    DELAY_URL
}