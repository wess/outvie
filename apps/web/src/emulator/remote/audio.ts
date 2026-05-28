// Served from public/audioworklet.js so the URL stays stable and Vite never
// inlines it as a data: URL (which AudioWorklet.addModule rejects).
const workletUrl = "/audioworklet.js"

const I16_MAX = 32768

export type AudioSink = {
  push: (pcm: Int16Array) => void
  resume: () => Promise<void>
  reset: () => void
  dispose: () => Promise<void>
}

const i16ToFloat32 = (input: Int16Array): Float32Array => {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = (input[i] ?? 0) / I16_MAX
  return out
}

export const createAudioSink = async (sampleRate: number): Promise<AudioSink | null> => {
  if (!sampleRate || sampleRate <= 0) return null
  if (typeof AudioContext === "undefined") return null

  let ctx: AudioContext
  try {
    ctx = new AudioContext({ sampleRate })
  } catch {
    // Some browsers refuse non-default sample rates; fall back to default
    // and let the worklet resample by feeding samples at the requested rate.
    ctx = new AudioContext()
  }

  try {
    await ctx.audioWorklet.addModule(workletUrl)
  } catch (err) {
    console.error("audio worklet load failed:", err)
    await ctx.close().catch(() => {})
    return null
  }

  const node = new AudioWorkletNode(ctx, "outvie-audio", {
    outputChannelCount: [2],
    processorOptions: { bufferSeconds: 0.5 },
  })
  node.connect(ctx.destination)

  return {
    push: (pcm) => {
      if (pcm.length === 0) return
      const floats = i16ToFloat32(pcm)
      node.port.postMessage({ type: "pcm", samples: floats }, [floats.buffer])
    },
    resume: async () => {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume()
        } catch {}
      }
    },
    reset: () => {
      node.port.postMessage({ type: "reset" })
    },
    dispose: async () => {
      try {
        node.disconnect()
      } catch {}
      await ctx.close().catch(() => {})
    },
  }
}
