// Передаю mono PCM небольшими блоками. Выход остаётся беззвучным, чтобы микрофон не звучал в динамиках.
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(1024);
    this.position = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const value of channel) {
      this.samples[this.position++] = value;
      if (this.position === this.samples.length) {
        this.port.postMessage(this.samples.slice());
        this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor("voice-capture", VoiceCapture);
