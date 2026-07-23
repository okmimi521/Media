# Chrome 103 frameDuration 兼容性问题

## 问题描述

在 **Chrome 103** 及周边的早期版本(约 103-109)中,AudioEncoder 的 `opus.frameDuration` 参数**不会生效**,编码器会忽略该设置并使用固定的 **60ms** 默认帧时长。

## 原因分析

1. **WebCodecs API 实现不完整**
   - Chrome 103 (2022年7月发布) 是 WebCodecs API 刚稳定后的早期版本
   - Opus 编码器的很多特定参数(如 `frameDuration`)支持不完善
   - 这是 Chromium 实现的已知 bug

2. **默认行为**
   - `AudioEncoder.configure()` 会成功,不会报错
   - `AudioEncoder.isConfigSupported()` 也会返回 `supported: true`
   - 但实际编码时,`frameDuration` 被内部忽略,使用 60ms

3. **修复版本**
   - Chrome **110+** 版本修复了这个问题
   - 从 Chrome 110 开始,`frameDuration` 参数才能正确生效

## 验证方法

使用本工具测试:

```javascript
// 测试 20ms 配置
await testAudioEncoder({
  codec: 'opus',
  frameDuration: 20000,  // 20ms
  testDuration: 2
});

// 如果是 Chrome 103,实际输出会是 60ms,而不是 20ms
```

## 解决方案

### 方案1: 升级浏览器(推荐)

**最简单直接的方案**,升级到 Chrome 110+ 版本。

```javascript
// 添加版本检查和用户提示
static checkChromeVersion() {
  const match = navigator.userAgent.match(/Chrome\/(\d+)/);
  const version = match ? parseInt(match[1]) : 0;
  
  if (version > 0 && version < 110) {
    console.warn('⚠️ 检测到 Chrome ' + version);
    console.warn('frameDuration 参数可能不生效,建议升级到 Chrome 110+');
    return false;
  }
  return true;
}
```

### 方案2: 应用层兼容处理

如果必须支持旧版本 Chrome,在应用层面做兼容:

```javascript
class OpusEncoderWrapper {
  constructor(config) {
    this.requestedFrameDuration = config.frameDuration || 20000;
    this.actualFrameDuration = this.detectActualFrameDuration();
    
    // 如果浏览器不支持自定义,警告并使用默认值
    if (this.actualFrameDuration !== this.requestedFrameDuration) {
      console.warn(`frameDuration 不支持自定义,使用 ${this.actualFrameDuration/1000}ms`);
    }
    
    this.encoder = new AudioEncoder({
      output: this.handleOutput.bind(this),
      error: this.handleError.bind(this)
    });
    
    this.encoder.configure(this.getEncoderConfig(config));
  }
  
  detectActualFrameDuration() {
    const chromeVersion = this.getChromeVersion();
    
    // Chrome < 110: 强制使用 60ms
    if (chromeVersion > 0 && chromeVersion < 110) {
      return 60000; // 60ms in microseconds
    }
    
    return this.requestedFrameDuration;
  }
  
  getChromeVersion() {
    const match = navigator.userAgent.match(/Chrome\/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
  
  getEncoderConfig(config) {
    return {
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
      bitrate: config.bitrate,
      opus: {
        frameDuration: this.requestedFrameDuration,
        complexity: config.complexity || 10,
        useinbandfec: config.useinbandfec !== false,
        usedtx: config.usedtx || false
      }
    };
  }
  
  // 调整输入音频大小以匹配实际帧时长
  getOptimalInputSize() {
    const sampleRate = 48000;
    // 返回与实际帧时长匹配的采样数
    return Math.floor(sampleRate * this.actualFrameDuration / 1000000);
  }
}

// 使用示例
const wrapper = new OpusEncoderWrapper({
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 128000,
  frameDuration: 20000  // 期望 20ms
});

// wrapper.actualFrameDuration 会告诉你实际使用的帧时长
console.log(`实际帧时长: ${wrapper.actualFrameDuration/1000}ms`);
```

### 方案3: 条件降级

根据浏览器版本选择不同的编码策略:

```javascript
async function createAudioEncoder(preferredFrameDuration) {
  const chromeVersion = getChromeVersion();
  
  // Chrome < 110: 使用固定 60ms 配置
  if (chromeVersion > 0 && chromeVersion < 110) {
    console.warn('使用兼容模式: 60ms 帧时长');
    return createEncoderConfig({
      frameDuration: 60000,  // 明确指定 60ms
      // 其他参数优化以适应 60ms
    });
  }
  
  // Chrome >= 110: 使用期望的配置
  return createEncoderConfig({
    frameDuration: preferredFrameDuration
  });
}
```

## 影响范围

### 受影响的配置

- ✗ `frameDuration: 2500` (2.5ms)
- ✗ `frameDuration: 5000` (5ms)  
- ✗ `frameDuration: 10000` (10ms)
- ✗ `frameDuration: 20000` (20ms) ← 最常用
- ✗ `frameDuration: 40000` (40ms)
- ✓ `frameDuration: 60000` (60ms) ← 默认值,不受影响
- ✗ `frameDuration: 120000` (120ms)

### 不受影响的配置

其他 Opus 参数在 Chrome 103 中正常工作:
- ✓ `complexity`
- ✓ `useinbandfec`
- ✓ `usedtx`
- ✓ `sampleRate`
- ✓ `numberOfChannels`
- ✓ `bitrate`

## 相关资源

- [WebCodecs API 规范](https://w3c.github.io/webcodecs/)
- [Chrome 110 Release Notes](https://chromestatus.com/features/schedule)
- [Opus Codec Documentation](https://opus-codec.org/docs/)

## 总结

**对于新项目**: 要求 Chrome 110+ 版本

**对于已有项目**: 
1. 检测浏览器版本
2. 如果 < 110,提示用户升级或使用 60ms 降级模式
3. 在应用层面跟踪实际使用的帧时长

**验证器已更新**: 本工具已添加自动检测和警告功能,会在检测到旧版 Chrome 时给出明确提示。
