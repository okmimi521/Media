# WebRTC Audio Playback Demo

这个目录直接以 WebRTC 官方的
[Peer connection: audio only](https://webrtc.github.io/samples/src/content/peerconnection/audio/)
为代码基线，只增加了播放方式选择：

- `audio tag`：保持官方 sample 的 `audio2.srcObject = stream` 播放方式。
- `AudioContext`：增加 `MediaStreamAudioSourceNode → audioContext.destination` 播放方式。

在 AudioContext 模式下，远端流仍会绑定到静音、暂停的 `audio2` 元素，再由
`MediaStreamAudioSourceNode` 直接连接 `audioContext.destination`；没有使用
`AudioWorkletNode`。

`app.js` 中带有 `AudioContext playback extension` 注释的部分，是相对官方 sample
新增的代码。其余 PeerConnection、SDP、codec、ICE 和 stats 逻辑均保留官方实现。

## 运行

请在仓库根目录启动 HTTP 服务（不要直接使用 `file://`）：

```bash
python3 -m http.server 8080
```

然后打开：

```text
http://localhost:8080/tools/webrtc-audio-playback-demo/
```

允许麦克风权限后，可在通话前或通话中切换播放方式。
如果 iOS 显示 AudioContext 为 `suspended` 或 `interrupted`，点击
**Resume AudioContext**，在明确的用户操作中恢复播放。

收到远端音轨后，点击 **Start Recording** 开始保存当前远端音频；再次点击
**Stop Recording** 会结束录音，并在页面上显示下载链接。页面会根据浏览器能力
优先保存为 Opus/WebM，在 Safari 上回退为 MP4/M4A。

上游源码采用 BSD-style license，版权声明保留在页面和脚本文件头部：
[webrtc/samples](https://github.com/webrtc/samples/tree/gh-pages/src/content/peerconnection/audio)。

统计图依赖 `graph.js` 也复制自 WebRTC 官方 sample，并从当前目录加载，避免本地测试时因远程脚本未加载而出现 `TimelineDataSeries is not defined`。
