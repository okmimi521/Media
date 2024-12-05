/*
 * @Author: steven.ye steven.ye@zoom.us
 * @Date: 2023-08-25 13:59:44
 * @LastEditors: steven.ye steven.ye@zoom.us
 * @LastEditTime: 2024-05-17 09:38:14
 * @FilePath: \tools_repo\commonui.js
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/* 

    UI related functions

*/

import common from "./common.js";

function uiRefreshDeviceList(deviceList) {
    let inputs = deviceList.filter(device => device.kind === "audioinput");
    let outputs = deviceList.filter(device => device.kind === "audiooutput");
    
    $("#inputs").empty();
    inputs.forEach(input => $("#inputs").append($(`<option value=${input.deviceId}>${input.label}</option>`)));
    
    $("#outputs").empty();
    outputs.forEach(input => $("#outputs").append($(`<option value=${input.deviceId}>${input.label}</option>`)));

    
    const captureDevice = outputs.find(e => e.label.match("H340") && e.kind === "audiooutput")
    if(captureDevice){
        $("#outputs").val(captureDevice.deviceId)
    }
}

function uiUpdateAudioStatus(audioContext, track) 
{
    if(audioContext)
        if($("#audioContextStatus").attr("status") != audioContext.state)
        {
            $("#audioContextStatus").text($("#audioContextStatus").text() + "->" + audioContext.state);
            $("#audioContextStatus").attr("status", audioContext.state)
        }
    if(track)
    {
        if($("#audioTrackReadyState").attr("status") != track.readyState)
        {
            $("#audioTrackReadyState").text($("#audioTrackReadyState").text() + "->" + track.readyState);
            $("#audioTrackReadyState").attr("status", track.readyState)
        }
        if($("#audioTrackMute").attr("status") != track.muted.toString())
        {
            $("#audioTrackMute").text($("#audioTrackMute").text() + "->" + track.muted);
            $("#audioTrackMute").attr("status", track.muted.toString())
        }
    }
}

function uiGetSelectSpeaker() {
    return $('#outputs :selected').val()
}

function uiGetSelectMic() {
    return $('#inputs :selected').val()
}

async function autoChooseDevice(sourceLabel, destinationLabel) {
    let deviceList = await common.enumerateDevices();
    deviceList = deviceList.filter(device => device.kind === "audioinput" || (device.kind === "audiooutput"));
    uiRefreshDeviceList(deviceList);
    
    const renderDevice = deviceList.find(e => e.label.match(destinationLabel) && e.kind === "audiooutput")
    if(renderDevice){
        $("#outputs").val(renderDevice.deviceId)
    }

    const captureDevice = deviceList.find(e => e.label.match(sourceLabel) && e.kind === "audioinput")
    if(captureDevice){
        $("#inputs").val(captureDevice.deviceId)
    }
}

function uiGetSelectAPM() {
    return {
        agc: $('#agc').is(":checked"),
        ns: $('#ns').is(":checked"),
        ec: $('#ec').is(":checked"),
    }
};

function uiDebugPrint(...args) {
	$("#debug").text($("#debug").text() + "\n");
	for (let arg of args) {
		if(typeof arg === "object") 
			arg = JSON.stringify(arg);
		$("#debug").text($("#debug").text() + arg);
	}
	$("#debug").scrollTop($("#debug").prop("scrollHeight"));
}

export default {
    autoChooseDevice,
    uiGetSelectSpeaker,
    uiGetSelectMic,
    uiGetSelectAPM,
	uiDebugPrint,
    uiUpdateAudioStatus
}