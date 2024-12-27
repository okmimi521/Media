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
            $("#audioContextStatus").html($("#audioContextStatus").html() + "->" + uiGenerateDateSpan() +audioContext.state);
            $("#audioContextStatus").attr("status", audioContext.state)
        }
    if(track)
    {
        if($("#audioTrackReadyState").attr("status") != track.readyState)
        {
            $("#audioTrackReadyState").html($("#audioTrackReadyState").html() + "->" + uiGenerateDateSpan() + track.readyState);
            $("#audioTrackReadyState").attr("status", track.readyState)
        }
        if($("#audioTrackMute").attr("status") != track.muted.toString())
        {
            $("#audioTrackMute").html($("#audioTrackMute").html() + "->" + uiGenerateDateSpan() + track.muted);
            $("#audioTrackMute").attr("status", track.muted.toString())
        }
    }
    updateAudioTrackLabel(track);
}

function updateAudioTrackLabel (track) {
    if(!track) return;
    $("#audioTrackReadyLabel").html($("#audioTrackReadyLabel").html() + "->" + uiGenerateDateSpan() + track.label);
    $("#audioTrackReadyLabel").attr("status", track.label+track.id)
}

function uiUpdateVisibilityStatus() {
    if($("#visibilityState").attr("status") != document.visibilityState)
    {
        $("#visibilityState").html($("#visibilityState").html() + "->" + uiGenerateDateSpan() + document.visibilityState);
        $("#visibilityState").attr("status", document.visibilityState)
    }
} 

function uiGetSelectSpeaker() {
    return $('#outputs :selected').val()
}

function uiGetSelectMic() {
    return $('#inputs :selected').val()
}

async function autoChooseDevice(sourceLabel, destinationLabel) {
    let {deviceList, addDeviceList, removeDeviceList, changeList} = await common.enumerateDevices();
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
        deviceNull: $('#deviceNull').is(":checked"),
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

function uiGenerateDateSpan (time = new Date()) {
    return `<span style="color: grey;background: lightgrey; padding: 0 2px; border-radius: 10px;">${time.toLocaleTimeString()}</span>`;
}

function uiGenerateDeviceDiv(deviceList) {
    if (!deviceList) return;
    let str = '';
    deviceList.forEach(device=>{
        str+=`${device.kind}: ${device.label}, ${device.deviceId}<br>`
    })
    return str;
}

export default {
    autoChooseDevice,
    uiGetSelectSpeaker,
    uiGetSelectMic,
    uiGetSelectAPM,
	uiDebugPrint,
    uiUpdateAudioStatus,
    uiGenerateDateSpan,
    uiUpdateVisibilityStatus,
    uiGenerateDeviceDiv,
    updateAudioTrackLabel,
    uiRefreshDeviceList
}
