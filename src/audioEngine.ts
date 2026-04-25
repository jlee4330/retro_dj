/**
 * Audio engine: manages Web Audio API nodes per deck
 * Chain: source -> lowBiquad -> highBiquad -> [FX insert] -> gainNode -> analyser -> master
 */

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let analyserA: AnalyserNode | null = null
let analyserB: AnalyserNode | null = null

export type FxType = 'echo' | 'reverb' | 'flanger' | 'lofi'

interface FxNodes {
  echo: {
    delay: DelayNode
    feedback: GainNode
    wet: GainNode
    dry: GainNode
  }
  reverb: {
    convolver: ConvolverNode
    wet: GainNode
    dry: GainNode
  }
  flanger: {
    delay: DelayNode
    lfo: OscillatorNode
    lfoGain: GainNode
    feedback: GainNode
    wet: GainNode
    dry: GainNode
  }
  lofi: {
    crusher: AudioWorkletNode | null  // fallback if worklet unavailable
    filter: BiquadFilterNode
    wet: GainNode
    dry: GainNode
  }
}

interface DeckAudioNodes {
  gainNode: GainNode
  lowBiquad: BiquadFilterNode
  highBiquad: BiquadFilterNode
  analyser: AnalyserNode
  fx: FxNodes
  fxInput: GainNode   // node before FX
  fxOutput: GainNode  // node after FX, before gainNode
  masterDry: GainNode // single dry path through FX section
}

const deckNodes: Record<string, DeckAudioNodes> = {}

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function ensureAudioResumed(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    return ctx.resume()
  }
  return Promise.resolve()
}

export function initDeckNodes(deckId: string): DeckAudioNodes {
  if (deckNodes[deckId]) return deckNodes[deckId]

  const ctx = getAudioContext()

  const gainNode = ctx.createGain()
  gainNode.gain.value = 0.8

  const lowBiquad = ctx.createBiquadFilter()
  lowBiquad.type = 'lowshelf'
  lowBiquad.frequency.value = 300
  lowBiquad.gain.value = 0

  const highBiquad = ctx.createBiquadFilter()
  highBiquad.type = 'highshelf'
  highBiquad.frequency.value = 3000
  highBiquad.gain.value = 0

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256

  // FX insert points
  const fxInput = ctx.createGain()
  fxInput.gain.value = 1
  const fxOutput = ctx.createGain()
  fxOutput.gain.value = 1

  // --- Create FX nodes ---

  // ECHO (delay + feedback)
  const echoDelay = ctx.createDelay(2.0)
  echoDelay.delayTime.value = 0.35
  const echoFeedback = ctx.createGain()
  echoFeedback.gain.value = 0.4
  const echoWet = ctx.createGain()
  echoWet.gain.value = 0  // off by default
  const echoDry = ctx.createGain()
  echoDry.gain.value = 1

  // echo wiring (wet only, dry handled by masterDry):
  //   fxInput -> delay -> wet -> fxOutput
  //   delay -> feedback -> delay
  fxInput.connect(echoDelay)
  echoDelay.connect(echoWet)
  echoDelay.connect(echoFeedback)
  echoFeedback.connect(echoDelay)

  // REVERB (convolver)
  const reverbConvolver = ctx.createConvolver()
  reverbConvolver.buffer = generateImpulseResponse(ctx, 2, 2)
  const reverbWet = ctx.createGain()
  reverbWet.gain.value = 0
  const reverbDry = ctx.createGain()
  reverbDry.gain.value = 1

  // FLANGER (modulated delay)
  const flangerDelay = ctx.createDelay(0.02)
  flangerDelay.delayTime.value = 0.005
  const flangerLfo = ctx.createOscillator()
  flangerLfo.type = 'sine'
  flangerLfo.frequency.value = 0.5
  const flangerLfoGain = ctx.createGain()
  flangerLfoGain.gain.value = 0.003
  flangerLfo.connect(flangerLfoGain)
  flangerLfoGain.connect(flangerDelay.delayTime)
  flangerLfo.start()
  const flangerFeedback = ctx.createGain()
  flangerFeedback.gain.value = 0.5
  const flangerWet = ctx.createGain()
  flangerWet.gain.value = 0
  const flangerDry = ctx.createGain()
  flangerDry.gain.value = 1

  // LOFI (lowpass filter as simple bitcrusher substitute)
  const lofiFilter = ctx.createBiquadFilter()
  lofiFilter.type = 'lowpass'
  lofiFilter.frequency.value = 2000
  lofiFilter.Q.value = 5
  const lofiWet = ctx.createGain()
  lofiWet.gain.value = 0
  const lofiDry = ctx.createGain()
  lofiDry.gain.value = 1

  const fx: FxNodes = {
    echo: { delay: echoDelay, feedback: echoFeedback, wet: echoWet, dry: echoDry },
    reverb: { convolver: reverbConvolver, wet: reverbWet, dry: reverbDry },
    flanger: { delay: flangerDelay, lfo: flangerLfo, lfoGain: flangerLfoGain, feedback: flangerFeedback, wet: flangerWet, dry: flangerDry },
    lofi: { crusher: null, filter: lofiFilter, wet: lofiWet, dry: lofiDry },
  }

  // --- Wire everything ---
  // Chain: source -> lowBiquad -> highBiquad -> fxInput -> masterDry -> fxOutput -> gainNode -> analyser -> master
  //                                             fxInput -> [FX wet paths] -> fxOutput
  lowBiquad.connect(highBiquad)
  highBiquad.connect(fxInput)

  // Single master dry path
  const masterDry = ctx.createGain()
  masterDry.gain.value = 1
  fxInput.connect(masterDry)
  masterDry.connect(fxOutput)

  // Echo wet path
  echoWet.connect(fxOutput)

  // Reverb wet path
  fxInput.connect(reverbConvolver)
  reverbConvolver.connect(reverbWet)
  reverbWet.connect(fxOutput)

  // Flanger wet path
  fxInput.connect(flangerDelay)
  flangerDelay.connect(flangerFeedback)
  flangerFeedback.connect(flangerDelay)
  flangerDelay.connect(flangerWet)
  flangerWet.connect(fxOutput)

  // Lofi wet path
  fxInput.connect(lofiFilter)
  lofiFilter.connect(lofiWet)
  lofiWet.connect(fxOutput)

  fxOutput.connect(gainNode)
  gainNode.connect(analyser)

  if (!masterGain) {
    masterGain = ctx.createGain()
    masterGain.gain.value = 0.85
    masterGain.connect(ctx.destination)
  }

  analyser.connect(masterGain)

  if (deckId === 'A') analyserA = analyser
  else analyserB = analyser

  deckNodes[deckId] = { gainNode, lowBiquad, highBiquad, analyser, fx, fxInput, fxOutput, masterDry }
  return deckNodes[deckId]
}

/** Generate a simple impulse response buffer for reverb */
function generateImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}

export function getDeckNodes(deckId: string): DeckAudioNodes | null {
  return deckNodes[deckId] || null
}

export function setDeckVolume(deckId: string, volume: number) {
  const nodes = deckNodes[deckId]
  if (nodes) {
    nodes.gainNode.gain.value = volume
  }
}

export function setDeckFilter(deckId: string, type: 'low' | 'high', value: number) {
  const nodes = deckNodes[deckId]
  if (!nodes) return
  // value: 0-100, 50 = neutral
  // Map to -20dB to +20dB
  const db = ((value - 50) / 50) * 20
  if (type === 'low') {
    nodes.lowBiquad.gain.value = db
  } else {
    nodes.highBiquad.gain.value = db
  }
}

export function setCrossfaderGains(crossfader: number, volumeA: number, volumeB: number) {
  // crossfader 0 = full A, 1 = full B, 0.5 = center
  const nodesA = deckNodes['A']
  const nodesB = deckNodes['B']

  // Equal-power crossfade
  const angleA = (1 - crossfader) * Math.PI / 2
  const angleB = crossfader * Math.PI / 2

  if (nodesA) {
    nodesA.gainNode.gain.value = volumeA * Math.cos(angleB)
  }
  if (nodesB) {
    nodesB.gainNode.gain.value = volumeB * Math.cos(angleA)
  }
}

export function setMasterVolume(volume: number) {
  if (masterGain) {
    masterGain.gain.value = volume
  }
}

export function getAnalyserData(deckId: string): Uint8Array | null {
  const nodes = deckNodes[deckId]
  if (!nodes) return null
  const data = new Uint8Array(nodes.analyser.frequencyBinCount)
  nodes.analyser.getByteFrequencyData(data)
  return data
}

export function getLevel(deckId: string): number {
  const data = getAnalyserData(deckId)
  if (!data) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
  }
  return sum / (data.length * 255)
}

/**
 * Simple BPM detection: analyzes audio buffer peaks
 * Returns a rough estimate, not production-grade
 */
export async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  // Downsample to reduce computation
  const step = Math.floor(sampleRate / 200) // ~200 samples per second
  const samples: number[] = []
  for (let i = 0; i < channelData.length; i += step) {
    samples.push(Math.abs(channelData[i]))
  }

  // Simple peak detection
  const threshold = 0.6 * Math.max(...samples)
  const peaks: number[] = []
  const minDistance = 15 // minimum ~75ms between peaks at 200Hz

  for (let i = 1; i < samples.length - 1; i++) {
    if (
      samples[i] > threshold &&
      samples[i] > samples[i - 1] &&
      samples[i] > samples[i + 1]
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > minDistance) {
        peaks.push(i)
      }
    }
  }

  if (peaks.length < 2) return 120 // default fallback

  // Calculate intervals
  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1])
  }

  // Find most common interval (histogram approach)
  const buckets = new Map<number, number>()
  for (const interval of intervals) {
    const rounded = Math.round(interval / 2) * 2
    buckets.set(rounded, (buckets.get(rounded) || 0) + 1)
  }

  let bestInterval = intervals[0]
  let bestCount = 0
  for (const [interval, count] of buckets) {
    if (count > bestCount) {
      bestCount = count
      bestInterval = interval
    }
  }

  // Convert interval (in downsampled units) to BPM
  const secondsPerBeat = bestInterval / 200
  let bpm = 60 / secondsPerBeat

  // Normalize to 60-180 range
  while (bpm > 180) bpm /= 2
  while (bpm < 60) bpm *= 2

  return Math.round(bpm * 10) / 10
}

export function cleanupDeck(deckId: string) {
  const nodes = deckNodes[deckId]
  if (nodes) {
    try {
      nodes.lowBiquad.disconnect()
      nodes.highBiquad.disconnect()
      nodes.gainNode.disconnect()
      nodes.analyser.disconnect()
      nodes.fxInput.disconnect()
      nodes.fxOutput.disconnect()
      nodes.masterDry.disconnect()
      nodes.fx.flanger.lfo.stop()
    } catch {
      // already disconnected
    }
    delete deckNodes[deckId]
  }
}

/**
 * Set FX wet/dry mix.
 * amount: 0 = fully dry (off), 1 = fully wet (max effect)
 *
 * Uses single masterDry path + per-FX wet paths.
 * masterDry is reduced proportionally to the strongest active effect.
 */
export function setFxAmount(deckId: string, fxType: FxType, amount: number) {
  const nodes = deckNodes[deckId]
  if (!nodes) return

  const clamped = Math.max(0, Math.min(1, amount))
  nodes.fx[fxType].wet.gain.value = clamped

  // Reduce master dry based on strongest active wet to preserve balance
  const maxWet = Math.max(
    nodes.fx.echo.wet.gain.value,
    nodes.fx.reverb.wet.gain.value,
    nodes.fx.flanger.wet.gain.value,
    nodes.fx.lofi.wet.gain.value,
  )
  nodes.masterDry.gain.value = 1 - maxWet * 0.6
}

/** Enable/disable FX (sets to full amount or zero) */
export function toggleFx(deckId: string, fxType: FxType, enabled: boolean, amount: number = 0.5) {
  setFxAmount(deckId, fxType, enabled ? amount : 0)
}

/** Adjust FX-specific parameters based on the amount knob (0-1) */
export function setFxParameter(deckId: string, fxType: FxType, amount: number) {
  const nodes = deckNodes[deckId]
  if (!nodes) return
  const clamped = Math.max(0, Math.min(1, amount))

  switch (fxType) {
    case 'echo': {
      // delay time: 0.05s to 0.6s, feedback: 0.1 to 0.7
      nodes.fx.echo.delay.delayTime.value = 0.05 + clamped * 0.55
      nodes.fx.echo.feedback.gain.value = 0.1 + clamped * 0.6
      break
    }
    case 'reverb': {
      // Just wet/dry — amount controls mix already
      break
    }
    case 'flanger': {
      // LFO speed: 0.1 to 5 Hz, depth: 0.001 to 0.005
      nodes.fx.flanger.lfo.frequency.value = 0.1 + clamped * 4.9
      nodes.fx.flanger.lfoGain.gain.value = 0.001 + clamped * 0.004
      nodes.fx.flanger.feedback.gain.value = 0.3 + clamped * 0.5
      break
    }
    case 'lofi': {
      // Lowpass cutoff: 4000 down to 400 Hz, resonance up
      nodes.fx.lofi.filter.frequency.value = 4000 - clamped * 3600
      nodes.fx.lofi.filter.Q.value = 1 + clamped * 15
      break
    }
  }
}
