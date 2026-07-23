# AudioEncoder Frame Length Validator

验证WebCodecs AudioEncoder编码帧的长度和时长的测试工具。

## 📋 功能特性

- ✅ 验证编码帧的实际时长 (ptime)
- ✅ 统计帧大小（字节数）
- ✅ 计算实际比特率
- ✅ 支持多种编解码器配置
- ✅ 提供可视化界面和命令行两种方式
- ✅ 详细的统计数据和验证报告

## 🚀 使用方法

### 方法一：浏览器可视化界面

1. 在浏览器中打开 `audio-encoder-validator.html`
2. 配置编码参数：
   - Codec（编解码器）：opus, AAC, FLAC等
   - Sample Rate（采样率）：8000, 16000, 24000, 48000 Hz
   - Channels（声道数）：1 (Mono), 2 (Stereo)
   - Bitrate（比特率）：自定义
   - Frame Duration（帧时长）：2.5, 5, 10, 20, 40, 60 ms (Opus)
   - Test Duration（测试时长）：1-10秒
3. 点击"开始测试"按钮
4. 查看详细的测试结果和统计数据

**截图示例：**
```
📊 编码结果统计
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总帧数: 100 帧
总数据量: 25.6 KB
总时长: 2.000 秒

帧时长统计 (基于timestamp差值)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
预期帧时长: 20 ms
实际平均帧时长: 20.012 ms ✓
最小帧时长: 19.998 ms
最大帧时长: 20.023 ms
```

### 方法二：浏览器控制台

1. 在HTML页面中引入脚本：
```html
<script src="audio-encoder-validator.js"></script>
```

2. 打开浏览器控制台运行：

**快速测试（使用默认配置）：**
```javascript
await testAudioEncoder();
```

**自定义配置测试：**
```javascript
await testAudioEncoder({
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 128000,
  frameDuration: 60000,  // ⚠️ 单位是微秒！60ms = 60000μs
  testDuration: 3        // 测试3秒
});
```

**使用预设配置：**
```javascript
// Opus 20ms (默认)
await testAudioEncoder(TEST_CONFIGS.opus_20ms);

// Opus 60ms
await testAudioEncoder(TEST_CONFIGS.opus_60ms);

// Opus 10ms
await testAudioEncoder(TEST_CONFIGS.opus_10ms);

// AAC
await testAudioEncoder(TEST_CONFIGS.aac);
```

**运行所有预设测试：**
```javascript
const results = await runAllTests();
```

**高级使用：**
```javascript
// 创建验证器实例
const validator = new AudioEncoderValidator({
  frameDuration: 40000,  // ⚠️ 40ms = 40000微秒
  testDuration: 5
});

// 运行测试
await validator.run();

// 获取详细结果
const results = validator.getResults();
console.log(results);

// 获取所有编码帧信息
const chunks = validator.getChunks();
console.log(chunks);
```

## 📊 输出结果说明

### 基本统计 (Basic Statistics)
- **Total Frames**: 编码的总帧数
- **Total Bytes**: 编码数据的总大小（KB和bytes）
- **Total Duration**: 音频总时长（秒）
- **Encoding Time**: 编码耗时（秒）

### 帧大小统计 (Frame Size)
- **Average**: 平均帧大小（bytes）
- **Min**: 最小帧大小（bytes）
- **Max**: 最大帧大小（bytes）

### 帧时长统计 (Frame Duration / ptime)
- **Expected**: 配置的预期帧时长（ms）
- **Actual (avg timestamp diff)**: 基于timestamp差值计算的实际平均帧时长（ms）
- **Min timestamp diff**: 最小时间间隔（ms）
- **Max timestamp diff**: 最大时间间隔（ms）
- **Std Dev**: 标准差（ms）
- **Average chunk.duration**: chunk对象的duration属性平均值（如果有）

### 比特率 (Bitrate)
- **Configured**: 配置的目标比特率（kbps）
- **Actual**: 实际测量的比特率（kbps）

### 验证结果 (Validation)
- **Status**: ✓ PASSED 或 ✗ FAILED
- **Deviation**: 实际帧时长与预期的偏差（ms）

## 🔍 验证原理

### 帧时长计算方法

1. **基于timestamp差值**（主要方法）：
   ```javascript
   frameDuration = (chunk[i].timestamp - chunk[i-1].timestamp) / 1000
   ```
   - 优点：准确反映编码器的实际行为
   - 缺点：依赖timestamp的准确性

2. **基于chunk.duration**（辅助方法）：
   ```javascript
   frameDuration = chunk.duration / 1000
   ```
   - 优点：直接来自编码器
   - 缺点：某些编解码器可能不提供此字段

### 验证标准

- **通过条件**: `|实际帧时长 - 预期帧时长| < 1ms`
- **警告条件**: 偏差 ≥ 1ms 但 < 5ms
- **失败条件**: 偏差 ≥ 5ms

## 📦 支持的编解码器

| 编解码器 | codec值 | 备注 |
|---------|---------|------|
| Opus | `opus` | WebRTC标准，支持可变帧时长 |
| AAC-LC | `mp4a.40.2` | 常用的AAC编码 |
| HE-AAC | `mp4a.40.5` | 高效AAC |
| FLAC | `flac` | 无损压缩 |
| PCM | `pcm-s16`, `pcm-f32` | 未压缩 |

## 🎯 典型测试场景

### 场景1：验证WebRTC中的默认ptime

```javascript
// 测试默认配置
await testAudioEncoder({
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 128000
  // 不设置frameDuration，使用浏览器默认值
});

// 预期结果：实际帧时长应该是20ms
```

### 场景2：测试不同帧时长对比特率的影响

```javascript
// 测试不同的帧时长
const durations = [10, 20, 40, 60];

for (const duration of durations) {
  console.log(`\n测试 ${duration}ms 帧时长:`);
  const result = await testAudioEncoder({
    codec: 'opus',
    frameDuration: duration,
    testDuration: 3
  });
  
  console.log(`实际比特率: ${(result.bitrate.actual / 1000).toFixed(2)} kbps`);
}
```

### 场景3：对比不同编解码器

```javascript
const codecs = [
  { codec: 'opus', frameDuration: 20 },
  { codec: 'mp4a.40.2' },  // AAC
  { codec: 'flac' }
];

for (const config of codecs) {
  console.log(`\n测试编解码器: ${config.codec}`);
  await testAudioEncoder(config);
}
```

### 场景4：压力测试

```javascript
// 长时间测试
await testAudioEncoder({
  codec: 'opus',
  frameDuration: 20,
  testDuration: 10  // 10秒
});

// 高比特率测试
await testAudioEncoder({
  codec: 'opus',
  frameDuration: 20,
  bitrate: 256000  // 256 kbps
});
```

## ⚠️ 重要提示

### frameDuration 单位是微秒（microseconds）！

这是最容易出错的地方：

```javascript
// ❌ 错误 - 这会导致错误
frameDuration: 20  // 实际是 20微秒 = 0.02ms

// ✓ 正确
frameDuration: 20000  // 20ms = 20000微秒
```

**常用转换表：**
| 毫秒 (ms) | 微秒 (μs) |
|-----------|-----------|
| 2.5 ms | 2500 |
| 5 ms | 5000 |
| 10 ms | 10000 |
| 20 ms | 20000 ⭐ 默认 |
| 40 ms | 40000 |
| 60 ms | 60000 |
| 120 ms | 120000 |

**允许范围：** 2500 - 120000 微秒 (2.5ms - 120ms)

## 🐛 常见问题

### Q1: 浏览器不支持AudioEncoder？
**A:** AudioEncoder需要Chrome 94+或Edge 94+。Firefox和Safari暂不支持（截至2026年）。

**检查方法：**
```javascript
if (typeof AudioEncoder === 'undefined') {
  console.log('不支持AudioEncoder');
} else {
  console.log('支持AudioEncoder');
}
```

### Q2: 帧时长总是不准确？
**A:** 可能的原因：
1. 浏览器的timestamp精度问题
2. 编解码器不支持精确的帧时长控制
3. 系统负载导致的时间波动

**解决方法：**
- 增加测试时长获得更准确的平均值
- 检查标准差，如果很大说明不稳定
- 使用chunk.duration作为参考

### Q3: 某个编解码器配置不支持？
**A:** 使用`isConfigSupported`检查：
```javascript
const support = await AudioEncoder.isConfigSupported({
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2
});

console.log('支持:', support.supported);
console.log('实际配置:', support.config);
```

### Q4: 如何导出测试结果？
**A:** 
```javascript
const validator = new AudioEncoderValidator(config);
await validator.run();

// 导出JSON
const results = validator.getResults();
const json = JSON.stringify(results, null, 2);
console.log(json);

// 或复制到剪贴板
copy(json);  // 在Chrome控制台中可用
```

## 📝 扩展开发

### 添加自定义统计指标

```javascript
class MyValidator extends AudioEncoderValidator {
  analyzeResults() {
    super.analyzeResults();
    
    // 添加自定义分析
    const chunks = this.chunks;
    
    // 例如：计算帧大小的变异系数
    const byteLengths = chunks.map(c => c.byteLength);
    const avgBytes = byteLengths.reduce((a, b) => a + b) / byteLengths.length;
    const stdDev = this.calculateStdDev(byteLengths);
    const cv = (stdDev / avgBytes) * 100;
    
    this.results.frameSizeCV = cv;
    
    console.log(`\n📊 帧大小变异系数: ${cv.toFixed(2)}%`);
  }
}
```

### 集成到自动化测试

```javascript
// Jest测试示例
describe('AudioEncoder Frame Length', () => {
  it('should produce 20ms frames for Opus', async () => {
    const validator = new AudioEncoderValidator({
      codec: 'opus',
      frameDuration: 20
    });
    
    await validator.run();
    const results = validator.getResults();
    
    expect(results.validation.passed).toBe(true);
    expect(Math.abs(results.validation.deviation)).toBeLessThan(1);
  });
});
```

## 🔗 相关资源

- [WebCodecs API 规范](https://www.w3.org/TR/webcodecs/)
- [Opus 编解码器](https://opus-codec.org/)
- [MDN - AudioEncoder](https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder)
- [RFC 7587 - RTP Payload Format for Opus](https://tools.ietf.org/html/rfc7587)

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！
