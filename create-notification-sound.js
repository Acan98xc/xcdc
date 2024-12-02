const fs = require('fs');
const path = require('path');
const { AudioContext, AudioBuffer } = require('web-audio-api');

// 创建音频上下文
const audioContext = new AudioContext();
const sampleRate = 44100;
const duration = 0.5;  // 0.5秒
const frequency = 880; // A5音符

// 创建音频缓冲区
const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
const channel = buffer.getChannelData(0);

// 生成音频数据
for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    // 生成一个简单的"叮"声
    channel[i] = Math.sin(2 * Math.PI * frequency * t) *
        Math.exp(-3 * t); // 添加衰减
}

// 创建 WAV 文件头
function createWAVHeader(buffer) {
    const arrayBuffer = new ArrayBuffer(44);
    const view = new DataView(arrayBuffer);

    // WAV 文件头
    view.setUint32(0, 0x52494646); // "RIFF"
    view.setUint32(4, 36 + buffer.length * 2, true); // 文件大小
    view.setUint32(8, 0x57415645); // "WAVE"
    view.setUint32(12, 0x666D7420); // "fmt "
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // 音频格式 (1 = PCM)
    view.setUint16(22, 1, true); // 声道数
    view.setUint32(24, sampleRate, true); // 采样率
    view.setUint32(28, sampleRate * 2, true); // 字节率
    view.setUint16(32, 2, true); // 块对齐
    view.setUint16(34, 16, true); // 位深度
    view.setUint32(36, 0x64617461); // "data"
    view.setUint32(40, buffer.length * 2, true); // 数据大小

    return new Uint8Array(arrayBuffer);
}

// 创建 WAV 文件数据
function createWAVData(buffer) {
    const samples = new Int16Array(buffer.length);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
        samples[i] = channelData[i] * 32767;
    }

    return new Uint8Array(samples.buffer);
}

// 合并头部和数据
const header = createWAVHeader(buffer);
const data = createWAVData(buffer);
const wavFile = new Uint8Array(header.length + data.length);
wavFile.set(header);
wavFile.set(data, header.length);

// 保存文件
const filePath = path.join(__dirname, 'public', 'sounds', 'notification.wav');
fs.writeFileSync(filePath, wavFile);

console.log('通知音效文件已创建：', filePath); 