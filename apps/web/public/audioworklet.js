// Outvie streaming audio processor. Receives stereo Float32 chunks via
// postMessage and feeds the AudioContext's render quantum from an internal
// ring buffer. Sample rate is fixed at AudioContext construction time and
// must match the engine's reported sample rate.

class OutvieAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    const seconds = opts.bufferSeconds || 1.0
    this.capacity = Math.max(2048, Math.floor(sampleRate * seconds) * 2)
    this.buffer = new Float32Array(this.capacity)
    this.readPos = 0
    this.writePos = 0
    this.available = 0
    this.targetFill = Math.floor(sampleRate * 0.04) * 2 // ~40ms of stereo samples
    this.warmedUp = false

    this.port.onmessage = (event) => {
      const data = event.data
      if (!data) return
      if (data.type === 'reset') {
        this.readPos = 0
        this.writePos = 0
        this.available = 0
        this.warmedUp = false
        return
      }
      if (data.type === 'pcm' && data.samples instanceof Float32Array) {
        this.append(data.samples)
      }
    }
  }

  append(samples) {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePos] = samples[i]
      this.writePos = (this.writePos + 1) % this.capacity
      if (this.available < this.capacity) {
        this.available++
      } else {
        // overflow: advance read pointer to drop oldest sample
        this.readPos = (this.readPos + 1) % this.capacity
      }
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    if (!output || output.length === 0) return true
    const left = output[0]
    const right = output[1] || output[0]
    const needStereo = left.length * 2

    if (!this.warmedUp) {
      if (this.available >= this.targetFill) this.warmedUp = true
      else {
        for (let i = 0; i < left.length; i++) {
          left[i] = 0
          if (right !== left) right[i] = 0
        }
        return true
      }
    }

    for (let i = 0; i < left.length; i++) {
      if (this.available >= 2) {
        left[i] = this.buffer[this.readPos]
        this.readPos = (this.readPos + 1) % this.capacity
        right[i] = this.buffer[this.readPos]
        this.readPos = (this.readPos + 1) % this.capacity
        this.available -= 2
      } else {
        left[i] = 0
        if (right !== left) right[i] = 0
      }
    }
    void needStereo
    return true
  }
}

registerProcessor('outvie-audio', OutvieAudioProcessor)
