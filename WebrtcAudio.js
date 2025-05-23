<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dual Player Mode</title>
    <style>
        .player, .microphone, .recorder {
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
        }
        button {
            font-size: 16px;
            margin: 5px;
            padding: 10px 20px;
        }
        .audioControls {
            margin-top: 10px;
        }
        select {
            padding: 5px;
            margin: 10px 0;
            width: 300px;
        }
        .mode-select {
            margin-bottom: 10px;
        }
        #logContainer {
            margin-top: 20px;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
            background-color: #f5f5f5;
            max-height: 300px;
            overflow-y: auto;
        }
        .log-entry {
            margin: 5px 0;
            padding: 5px;
            border-bottom: 1px solid #ddd;
        }
        .log-time {
            color: #666;
            font-size: 0.9em;
        }
        .log-message {
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="player">
        <h2>Audio Player 1</h2>
        <div class="mode-select">
            <label>播放模式：</label>
            <select id="playMode">
                <option value="audio">Audio标签</option>
                <option value="context">AudioContext</option>
            </select>
        </div>
        <audio id="audioPlayer1" loop>
            <source src="test3.mp3" type="audio/mpeg">
            Your browser does not support the audio element.
        </audio>
        <audio id="audioPlayer2">
          <source src="test2.mp3" type="audio/mpeg">
          Your browser does not support the audio element.
      </audio>
        <div class="audioControls">
            <button id="playButton1">Play1</button>
            <button id="pauseButton1">Pause1</button>
            <button id="stopButton1">Stop1</button>
            <button id="playButton2">Play2</button>
            <button id="pauseButton2">Pause2</button>
            <button id="stopButton2">Stop2</button>
        </div>
    </div>

    <div class="recorder">
        <h2>Audio Recorder (WAV)</h2>
        <select id="micSelect">
            <option value="">选择麦克风设备...</option>
        </select>
        <button id="refreshMicList">刷新设备列表</button>
        <br>
        <button id="startRecordButton">Start Recording</button>
        <button id="stopRecordButton">Stop Recording</button>
        <div id="downloadLink"></div>
    </div>

    <div id="logContainer">
        <h3>操作日志</h3>
        <div id="logs"></div>
    </div>

    <script>
        let stream;
        let selectedMicId = '';
        let micId;
        let micLabel;
        let audioContext;
        let audioBuffer;
        let sourceNode;
        let isPlaying = false;
        let currentPlayMode = 'audio';

        // 添加日志功能
        function addLog(message) {
            const logsDiv = document.getElementById('logs');
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            const time = new Date().toLocaleTimeString();
            logEntry.innerHTML = `
                <span class="log-time">[${time}]</span>
                <span class="log-message">${message}</span>
            `;
            
            logsDiv.insertBefore(logEntry, logsDiv.firstChild);
        }

        const playModeSelect = document.getElementById('playMode');
        const audioElement = document.getElementById('audioPlayer1');
        const audioElement2 = document.getElementById('audioPlayer2');

        playModeSelect.addEventListener('change', function(e) {
            const newMode = e.target.value;
            addLog(`播放模式切换为: ${newMode}`);
            if (isPlaying) {
                stopAudio();
            }
            currentPlayMode = newMode;
        });

        function createAudioContext() {
            if (!audioContext) {
                audioContext = new AudioContext({
                    latencyHint: 'balanced',
                    sampleRate: 48000
                });
                addLog('AudioContext已创建');
            }
        }

        async function playAudio() {
            if (currentPlayMode === 'audio') {
                audioElement.play();
                isPlaying = true;
                addLog('开始播放音频1');
            } 
        }

        async function playAudio2() {
            if (currentPlayMode === 'audio') {
                audioElement2.play();
                isPlaying = true;
                addLog('开始播放音频2');
            } 
        }

        function pauseAudio() {
            if (currentPlayMode === 'audio') {
                audioElement.pause();
                isPlaying = false;
                addLog('音频已暂停');
            } else if (audioContext && audioContext.state === 'running') {
                audioContext.suspend();
                isPlaying = false;
                addLog('AudioContext已暂停');
            }
        }

        function stopAudio() {
            if (currentPlayMode === 'audio') {
                audioElement.pause();
                audioElement.currentTime = 0;
                isPlaying = false;
                addLog('音频1已停止');
            } else if (sourceNode) {
                sourceNode.stop();
                sourceNode.disconnect();
                isPlaying = false;
                addLog('AudioContext已停止');
            }
        }

        function stopAudio2() {
            if (currentPlayMode === 'audio') {
                audioElement2.pause();
                audioElement2.currentTime = 0;
                addLog('音频2已停止');
            } else if (sourceNode) {
                sourceNode.stop();
                sourceNode.disconnect();
                isPlaying = false;
                addLog('AudioContext已停止');
            }
        }

        async function getMicrophoneList() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const micSelect = document.getElementById('micSelect');

                micSelect.innerHTML = '<option value="">选择麦克风设备...</option>';
                
                devices.forEach(device => {
                    if (device.kind === 'audioinput') {
                        const option = document.createElement('option');
                        option.value = device.deviceId;
                        option.text = device.label || `麦克风 ${micSelect.length + 1}`;
                        micSelect.appendChild(option);
                    }
                });
                addLog(`发现 ${devices.filter(d => d.kind === 'audioinput').length} 个麦克风设备`);
            } catch (error) {
                addLog(`获取麦克风列表失败: ${error.message}`);
                console.error('获取麦克风列表失败:', error);
            }
        }

        function initDeviceSelection() {
            const micSelect = document.getElementById('micSelect');
            const refreshButton = document.getElementById('refreshMicList');

            micSelect.addEventListener('change', (e) => {
                selectedMicId = e.target.value;
                if (selectedMicId) {
                    addLog(`选择麦克风: ${e.target.options[e.target.selectedIndex].text}`);
                }
            });

            refreshButton.addEventListener('click', getMicrophoneList);
            getMicrophoneList();
        }

        function setupAudioPlayer() {
            const playButton = document.getElementById('playButton1');
            const playButton2 = document.getElementById('playButton2');
            const pauseButton = document.getElementById('pauseButton1');
            const stopButton = document.getElementById('stopButton1');
            const stopButton2 = document.getElementById('stopButton2');

            playButton.addEventListener('click', playAudio);
            pauseButton.addEventListener('click', pauseAudio);
            stopButton.addEventListener('click', stopAudio);
            playButton2.addEventListener('click', playAudio2);
            stopButton2.addEventListener('click', stopAudio2);
        }

        let mediaRecorder;
        let audioChunks = [];
        const startRecordButton = document.getElementById('startRecordButton');
        const stopRecordButton = document.getElementById('stopRecordButton');
        const downloadLink = document.getElementById('downloadLink');

        startRecordButton.addEventListener('click', startRecording);
        stopRecordButton.addEventListener('click', stopRecording);

        async function startRecording() {
            if (!selectedMicId) {
                selectedMicId = 'default';
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        deviceId: { exact: selectedMicId },
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        latency: 0,
                        channelCount: 2,
                        sampleRate: 48000
                    } 
                });

                const audioTrack = stream?.getAudioTracks()[0];
                micId = audioTrack.deviceId;
                micLabel = audioTrack.label;
                
                // startRecordButton.disabled = true;
                stopRecordButton.disabled = false;
                addLog(`开始录音 - 使用设备: ${micLabel}`);
                addLog(`audioTrack:  ${audioTrack}`);
            } catch (error) {
                addLog(`录音失败: ${error.message}`);
                console.error('Error starting recording:', error);
            }
        }

        function stopRecording() {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            startRecordButton.disabled = false;
            stopRecordButton.disabled = true;
            addLog('录音已停止');
        }

        window.addEventListener('load', () => {
            initDeviceSelection();
            setupAudioPlayer();
            addLog('页面初始化完成');
        });

        function cleanup() {
            if (sourceNode) {
                sourceNode.stop();
                sourceNode.disconnect();
            }
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            audioBuffer = null;
            isPlaying = false;
            addLog('资源已清理');
        }
        
        window.addEventListener('unload', cleanup);
    </script>
</body>
</html>
