/**
 * AudioEncoder Frame Length Validator
 * 验证AudioEncoder编码帧的长度和时长
 *
 * 使用方法:
 * 1. 在浏览器控制台中运行
 * 2. 或在HTML页面中引入此脚本
 */

class AudioEncoderValidator {
  constructor(config = {}) {
    this.config = {
      codec: config.codec || 'opus',
      sampleRate: config.sampleRate || 48000,
      numberOfChannels: config.numberOfChannels || 2,
      bitrate: config.bitrate || 128000,
      frameDuration: config.frameDuration || 20000, // 微秒 (默认20ms=20000μs), Opus only
      testDuration: config.testDuration || 2, // seconds
      ...config
    };

    this.encoder = null;
    this.chunks = [];
    this.startTime = 0;
    this.results = null;
  }

  /**
   * 检查浏览器支持
   */
  static checkSupport() {
    if (typeof AudioEncoder === 'undefined') {
      console.error('❌ AudioEncoder not supported in this browser');
      return false;
    }
    console.log('✓ AudioEncoder is supported');
    return true;
  }

  /**
   * 检查配置支持
   */
  async checkConfig() {
    const encoderConfig = this.getEncoderConfig();

    try {
      const support = await AudioEncoder.isConfigSupported(encoderConfig);

      if (support.supported) {
        console.log('✓ Configuration is supported');
        console.log('Config:', support.config);
        return true;
      } else {
        console.error('❌ Configuration not supported');
        console.error('Config:', encoderConfig);
        return false;
      }
    } catch (error) {
      console.error('❌ Error checking config:', error);
      return false;
    }
  }

  /**
   * 获取编码器配置
   */
  getEncoderConfig() {
    const config = {
      codec: this.config.codec,
      sampleRate: this.config.sampleRate,
      numberOfChannels: this.config.numberOfChannels,
      bitrate: this.config.bitrate
    };

    // Opus特定配置
    if (this.config.codec === 'opus') {
      config.opus = {
        frameDuration: this.config.frameDuration,  // 单位：微秒 (2500-120000)
        complexity: 10,
        useinbandfec: true,
        usedtx: false
      };
    }

    return config;
  }

  /**
   * 运行测试
   */
  async run() {
    console.log('🎵 AudioEncoder Frame Length Validator');
    console.log('=====================================\n');

    // 检查支持
    if (!AudioEncoderValidator.checkSupport()) {
      return null;
    }

    // 检查配置
    if (!(await this.checkConfig())) {
      return null;
    }

    console.log('\n⏳ Starting encoding test...\n');

    // 创建编码器
    this.encoder = new AudioEncoder({
      output: this.handleEncodedChunk.bind(this),
      error: this.handleError.bind(this)
    });

    this.encoder.configure(this.getEncoderConfig());

    // 编码测试数据
    this.chunks = [];
    this.startTime = performance.now();

    await this.encodeTestAudio();

    // 等待编码完成
    await this.encoder.flush();
    this.encoder.close();

    // 分析结果
    this.analyzeResults();

    return this.results;
  }

  /**
   * 编码测试音频
   */
  async encodeTestAudio() {
    const { sampleRate, numberOfChannels, testDuration } = this.config;

    // 每次编码100ms
    const framesPerChunk = Math.floor(sampleRate * 0.1);
    const totalChunks = Math.ceil(testDuration * 10);

    for (let i = 0; i < totalChunks; i++) {
      // 生成440Hz正弦波
      const data = this.generateSineWave(
        440,
        sampleRate,
        framesPerChunk,
        numberOfChannels,
        i * framesPerChunk
      );

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: sampleRate,
        numberOfFrames: framesPerChunk,
        numberOfChannels: numberOfChannels,
        timestamp: (i * framesPerChunk * 1000000) / sampleRate, // 微秒
        data: data
      });

      this.encoder.encode(audioData);
      audioData.close();

      // 避免阻塞
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  /**
   * 生成正弦波
   */
  generateSineWave(frequency, sampleRate, frames, channels, offset) {
    const data = new Float32Array(frames * channels);

    for (let i = 0; i < frames; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * (i + offset) / sampleRate);

      for (let ch = 0; ch < channels; ch++) {
        data[i * channels + ch] = sample * 0.5;
      }
    }

    return data;
  }

  /**
   * 处理编码帧
   */
  handleEncodedChunk(chunk, metadata) {
    const chunkInfo = {
      index: this.chunks.length + 1,
      type: chunk.type,
      timestamp: chunk.timestamp,
      duration: chunk.duration,
      byteLength: chunk.byteLength,
      receivedTime: performance.now()
    };

    this.chunks.push(chunkInfo);

    if (metadata && metadata.decoderConfig) {
      console.log('Decoder config received:', metadata.decoderConfig);
    }
  }

  /**
   * 处理错误
   */
  handleError(error) {
    console.error('❌ Encoding error:', error);
  }

  /**
   * 分析结果
   */
  analyzeResults() {
    if (this.chunks.length === 0) {
      console.log('⚠ No encoded chunks received');
      return;
    }

    const chunks = this.chunks;

    // 基本统计
    const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const avgByteLength = totalBytes / chunks.length;
    const minByteLength = Math.min(...chunks.map(c => c.byteLength));
    const maxByteLength = Math.max(...chunks.map(c => c.byteLength));

    // 计算帧时长 (基于timestamp差值)
    const durations = [];
    for (let i = 1; i < chunks.length; i++) {
      const timeDiff = (chunks[i].timestamp - chunks[i-1].timestamp) / 1000; // ms
      durations.push(timeDiff);
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const stdDevDuration = this.calculateStdDev(durations);

    // chunk.duration统计
    const chunkDurations = chunks
      .filter(c => c.duration !== undefined && c.duration !== null)
      .map(c => c.duration / 1000);

    const avgChunkDuration = chunkDurations.length > 0
      ? chunkDurations.reduce((a, b) => a + b, 0) / chunkDurations.length
      : null;

    // 计算实际比特率
    const totalDurationMs = chunks[chunks.length - 1].timestamp / 1000;
    const actualBitrate = (totalBytes * 8) / (totalDurationMs / 1000);

    // 计算编码时间
    const encodingTime = (chunks[chunks.length - 1].receivedTime - this.startTime) / 1000;

    // 保存结果
    this.results = {
      config: this.config,
      frameCount: chunks.length,
      totalBytes: totalBytes,
      totalDurationMs: totalDurationMs,
      encodingTimeSeconds: encodingTime,

      frameSize: {
        avg: avgByteLength,
        min: minByteLength,
        max: maxByteLength
      },

      frameDuration: {
        expected: this.config.frameDuration / 1000,  // 转换为ms显示
        avgTimestampDiff: avgDuration,
        minTimestampDiff: minDuration,
        maxTimestampDiff: maxDuration,
        stdDev: stdDevDuration,
        avgChunkDuration: avgChunkDuration
      },

      bitrate: {
        configured: this.config.bitrate,
        actual: actualBitrate
      },

      validation: {
        passed: Math.abs(avgDuration - this.config.frameDuration / 1000) < 1,
        deviation: avgDuration - this.config.frameDuration / 1000
      }
    };

    // 打印结果
    this.printResults();
  }

  /**
   * 计算标准差
   */
  calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * 打印结果
   */
  printResults() {
    const r = this.results;

    console.log('\n📊 Encoding Results');
    console.log('==================\n');

    console.log('📦 Basic Statistics:');
    console.log(`  Total Frames: ${r.frameCount}`);
    console.log(`  Total Bytes: ${(r.totalBytes / 1024).toFixed(2)} KB (${r.totalBytes} bytes)`);
    console.log(`  Total Duration: ${(r.totalDurationMs / 1000).toFixed(3)} s`);
    console.log(`  Encoding Time: ${r.encodingTimeSeconds.toFixed(3)} s`);

    console.log('\n📏 Frame Size (Byte Length):');
    console.log(`  Average: ${r.frameSize.avg.toFixed(2)} bytes`);
    console.log(`  Min: ${r.frameSize.min} bytes`);
    console.log(`  Max: ${r.frameSize.max} bytes`);

    console.log('\n⏱️  Frame Duration (ptime):');
    console.log(`  Expected: ${r.frameDuration.expected} ms`);
    console.log(`  Actual (avg timestamp diff): ${r.frameDuration.avgTimestampDiff.toFixed(3)} ms`);
    console.log(`  Min timestamp diff: ${r.frameDuration.minTimestampDiff.toFixed(3)} ms`);
    console.log(`  Max timestamp diff: ${r.frameDuration.maxTimestampDiff.toFixed(3)} ms`);
    console.log(`  Std Dev: ${r.frameDuration.stdDev.toFixed(3)} ms`);

    if (r.frameDuration.avgChunkDuration !== null) {
      console.log(`  Average chunk.duration: ${r.frameDuration.avgChunkDuration.toFixed(3)} ms`);
    }

    console.log('\n🚀 Bitrate:');
    console.log(`  Configured: ${(r.bitrate.configured / 1000).toFixed(0)} kbps`);
    console.log(`  Actual: ${(r.bitrate.actual / 1000).toFixed(2)} kbps`);

    console.log('\n✓ Validation:');
    console.log(`  Status: ${r.validation.passed ? '✓ PASSED' : '✗ FAILED'}`);
    console.log(`  Deviation: ${r.validation.deviation.toFixed(3)} ms`);

    console.log('\n⚙️  Configuration:');
    console.log(JSON.stringify(r.config, null, 2));

    // 显示前10帧详情
    console.log('\n📋 First 10 Frames:');
    console.table(
      this.chunks.slice(0, 10).map((c, i) => ({
        Index: c.index,
        Type: c.type,
        'Timestamp (ms)': (c.timestamp / 1000).toFixed(3),
        'Duration (ms)': c.duration ? (c.duration / 1000).toFixed(3) : '-',
        'Time Diff (ms)': i > 0
          ? ((c.timestamp - this.chunks[i-1].timestamp) / 1000).toFixed(3)
          : '-',
        'Bytes': c.byteLength
      }))
    );

    console.log('\n=====================================\n');
  }

  /**
   * 获取详细结果
   */
  getResults() {
    return this.results;
  }

  /**
   * 获取所有chunk信息
   */
  getChunks() {
    return this.chunks;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioEncoderValidator;
}

// 全局使用
if (typeof window !== 'undefined') {
  window.AudioEncoderValidator = AudioEncoderValidator;
}

// 快捷测试函数
async function testAudioEncoder(config = {}) {
  const validator = new AudioEncoderValidator(config);
  return await validator.run();
}

// 预设测试配置
const TEST_CONFIGS = {
  // Opus 20ms (默认)
  opus_20ms: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128000,
    frameDuration: 20000  // 20ms = 20000 微秒
  },

  // Opus 60ms
  opus_60ms: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128000,
    frameDuration: 60000  // 60ms = 60000 微秒
  },

  // Opus 10ms
  opus_10ms: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128000,
    frameDuration: 10000  // 10ms = 10000 微秒
  },

  // Opus 2.5ms
  opus_2_5ms: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128000,
    frameDuration: 2500  // 2.5ms = 2500 微秒
  },

  // AAC
  aac: {
    codec: 'mp4a.40.2',
    sampleRate: 48000,
    numberOfChannels: 2,
    bitrate: 128000
  }
};

// 批量测试
async function runAllTests() {
  console.log('🎵 Running All AudioEncoder Tests\n');

  const results = {};

  for (const [name, config] of Object.entries(TEST_CONFIGS)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Testing: ${name}`);
    console.log('='.repeat(50));

    try {
      const validator = new AudioEncoderValidator(config);
      results[name] = await validator.run();
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      results[name] = { error: error.message };
    }
  }

  console.log('\n\n📊 Summary of All Tests');
  console.log('======================\n');

  for (const [name, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`❌ ${name}: ERROR - ${result.error}`);
    } else if (result.validation.passed) {
      console.log(`✓ ${name}: PASSED (${result.frameDuration.avgTimestampDiff.toFixed(3)}ms)`);
    } else {
      console.log(`⚠ ${name}: FAILED (${result.frameDuration.avgTimestampDiff.toFixed(3)}ms, expected ${result.frameDuration.expected}ms)`);
    }
  }

  return results;
}

// 使用示例
console.log(`
🎵 AudioEncoder Frame Length Validator
======================================

使用方法:

1. 快速测试 (默认配置 - Opus 20ms):
   await testAudioEncoder();

2. 自定义配置测试 (⚠️ frameDuration单位是微秒！):
   await testAudioEncoder({
     codec: 'opus',
     frameDuration: 60000,  // 60ms = 60000微秒
     testDuration: 3
   });

3. 使用预设配置:
   await testAudioEncoder(TEST_CONFIGS.opus_60ms);

4. 运行所有预设测试:
   await runAllTests();

5. 高级使用:
   const validator = new AudioEncoderValidator({
     frameDuration: 40000  // 40ms = 40000微秒
   });
   await validator.run();
   const results = validator.getResults();
   const chunks = validator.getChunks();

⚠️  重要: Opus的frameDuration单位是微秒 (μs)
   - 2.5ms  = 2500
   - 10ms   = 10000
   - 20ms   = 20000 (默认)
   - 40ms   = 40000
   - 60ms   = 60000
   - 120ms  = 120000

======================================
`);
