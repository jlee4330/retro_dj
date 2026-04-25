import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useDJStore, DeckId, FxName } from './store'
import {
  getAudioContext,
  ensureAudioResumed,
  initDeckNodes,
  setDeckFilter,
  detectBPM,
  getLevel,
  toggleFx,
  setFxAmount,
  setFxParameter,
} from './audioEngine'
import { getStatusMessage } from './messages'

interface DeckProps {
  deckId: DeckId
}

export interface DeckHandle {
  play: () => void
  cueSet: (index: number) => void
  cueRecall: (index: number) => void
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const Deck = forwardRef<DeckHandle, DeckProps>(function Deck({ deckId }, ref) {
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const animFrameRef = useRef<number>(0)

  const deck = useDJStore((s) => (deckId === 'A' ? s.deckA : s.deckB))
  const updateDeck = useDJStore((s) => s.updateDeck)
  const dramaticMode = useDJStore((s) => s.dramaticMode)
  const setLevel = useDJStore((s) => s.setLevel)

  const [meterLevel, setMeterLevel] = useState(0)
  const endingWarnRef = useRef(false)

  // Expose imperative handle for keyboard shortcuts
  useImperativeHandle(ref, () => ({
    play: handlePlay,
    cueSet: handleCueSet,
    cueRecall: handleCueRecall,
  }))

  const msg = useCallback(
    (key: string) => getStatusMessage(key, dramaticMode),
    [dramaticMode]
  )

  // Initialize wavesurfer
  useEffect(() => {
    if (!waveformRef.current) return

    const ctx = getAudioContext()
    const nodes = initDeckNodes(deckId)

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: deckId === 'A' ? '#00e5ff' : '#ffab00',
      progressColor: deckId === 'A' ? '#006680' : '#805500',
      cursorColor: '#ff1744',
      cursorWidth: 2,
      height: 70,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
    })

    // Connect wavesurfer's media element through our filter chain
    let sourceConnected = false
    const connectAudio = () => {
      if (sourceConnected) return
      try {
        const mediaEl = ws.getMediaElement()
        if (mediaEl) {
          // Prevent default output so we route through our chain
          mediaEl.crossOrigin = 'anonymous'
          const source = ctx.createMediaElementSource(mediaEl)
          source.connect(nodes.lowBiquad)
          sourceConnected = true
        }
      } catch {
        // Source may already be connected
      }
    }

    ws.on('ready', () => {
      connectAudio()
      updateDeck(deckId, {
        isLoading: false,
        isLoaded: true,
        duration: ws.getDuration(),
        statusMessage: msg('loaded'),
      })
      // Detect BPM from decoded data
      const decoded = ws.getDecodedData()
      if (decoded) {
        detectBPM(decoded)
          .then((bpm) => updateDeck(deckId, { bpm }))
          .catch(() => updateDeck(deckId, { bpm: 120 }))
      }
    })

    ws.on('timeupdate', (time: number) => {
      updateDeck(deckId, { currentTime: time })

      // Check loop
      const state = useDJStore.getState()
      const d = deckId === 'A' ? state.deckA : state.deckB
      if (d.loopEnabled && d.loopEnd > d.loopStart && time >= d.loopEnd) {
        ws.setTime(d.loopStart)
      }

      // Ending soon warning (30s before end)
      const remaining = d.duration - time
      if (d.duration > 0 && remaining <= 30 && remaining > 0 && !endingWarnRef.current) {
        endingWarnRef.current = true
        updateDeck(deckId, {
          statusMessage: getStatusMessage('endingSoon', state.dramaticMode),
        })
      } else if (remaining > 30) {
        endingWarnRef.current = false
      }
    })

    ws.on('finish', () => {
      updateDeck(deckId, {
        isPlaying: false,
        statusMessage: msg('endOfTrack'),
      })
    })

    wavesurferRef.current = ws

    // Level meter animation
    const updateMeter = () => {
      const level = getLevel(deckId)
      setMeterLevel(level)
      setLevel(deckId, level)
      animFrameRef.current = requestAnimationFrame(updateMeter)
    }
    animFrameRef.current = requestAnimationFrame(updateMeter)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      ws.destroy()
      wavesurferRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  // Sync playback rate
  useEffect(() => {
    if (wavesurferRef.current && deck.isLoaded) {
      wavesurferRef.current.setPlaybackRate(deck.playbackRate)
    }
  }, [deck.playbackRate, deck.isLoaded])

  // Sync filters
  useEffect(() => {
    setDeckFilter(deckId, 'low', deck.lowFilter)
  }, [deckId, deck.lowFilter])

  useEffect(() => {
    setDeckFilter(deckId, 'high', deck.highFilter)
  }, [deckId, deck.highFilter])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    await ensureAudioResumed()

    updateDeck(deckId, {
      file,
      fileName: file.name,
      isLoading: true,
      isLoaded: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      cuePoints: [],
      bpm: null,
      playbackRate: 1,
      loopEnabled: false,
      statusMessage: msg('loading'),
    })

    const url = URL.createObjectURL(file)
    wavesurferRef.current?.load(url)
  }

  const handlePlay = async () => {
    await ensureAudioResumed()
    if (!wavesurferRef.current || !deck.isLoaded) return

    if (deck.isPlaying) {
      wavesurferRef.current.pause()
      updateDeck(deckId, { isPlaying: false, statusMessage: msg('paused') })
    } else {
      wavesurferRef.current.play()
      updateDeck(deckId, { isPlaying: true, statusMessage: msg('playing') })
    }
  }

  const handleEject = () => {
    if (!wavesurferRef.current) return
    wavesurferRef.current.stop()
    wavesurferRef.current.empty()
    updateDeck(deckId, {
      file: null,
      fileName: '',
      isPlaying: false,
      isLoaded: false,
      currentTime: 0,
      duration: 0,
      cuePoints: [],
      bpm: null,
      playbackRate: 1,
      loopEnabled: false,
      lowFilter: 50,
      highFilter: 50,
      statusMessage: msg('ejecting'),
    })
    setTimeout(() => {
      updateDeck(deckId, { statusMessage: msg('noDisc') })
    }, 1500)
  }

  const handleCueSet = (cueIndex: number) => {
    if (!deck.isLoaded) return
    const newCue = {
      id: cueIndex,
      time: deck.currentTime,
      label: `CUE ${cueIndex + 1}`,
    }
    const cues = [...deck.cuePoints]
    const existing = cues.findIndex((c) => c.id === cueIndex)
    if (existing >= 0) cues[existing] = newCue
    else cues.push(newCue)
    updateDeck(deckId, { cuePoints: cues, statusMessage: msg('cueSet') })
  }

  const handleCueRecall = (cueIndex: number) => {
    const cue = deck.cuePoints.find((c) => c.id === cueIndex)
    if (cue && wavesurferRef.current) {
      wavesurferRef.current.setTime(cue.time)
      updateDeck(deckId, { statusMessage: msg('cueRecall') })
    }
  }

  const handleLoop = () => {
    if (!deck.isLoaded) return
    if (!deck.loopEnabled) {
      // Set loop start at current position
      updateDeck(deckId, {
        loopEnabled: true,
        loopStart: deck.currentTime,
        loopEnd: Math.min(deck.currentTime + 4, deck.duration), // default 4s loop
        statusMessage: msg('loopOn'),
      })
    } else {
      updateDeck(deckId, {
        loopEnabled: false,
        statusMessage: msg('loopOff'),
      })
    }
  }

  const handleVolumeChange = (value: number) => {
    updateDeck(deckId, { volume: value })
  }

  const handleKillLow = () => {
    if (deck.lowFilter === 0) {
      updateDeck(deckId, { lowFilter: 50, statusMessage: msg('restoreLow') })
    } else {
      updateDeck(deckId, { lowFilter: 0, statusMessage: msg('killLow') })
    }
  }

  const handleKillHigh = () => {
    if (deck.highFilter === 0) {
      updateDeck(deckId, { highFilter: 50, statusMessage: msg('restoreHigh') })
    } else {
      updateDeck(deckId, { highFilter: 0, statusMessage: msg('killHigh') })
    }
  }

  const fxLabels: Record<FxName, { icon: string; msgOn: string }> = {
    echo:    { icon: '🔊', msgOn: 'fxEcho' },
    reverb:  { icon: '🏛️', msgOn: 'fxReverb' },
    flanger: { icon: '🌀', msgOn: 'fxFlanger' },
    lofi:    { icon: '📼', msgOn: 'fxLofi' },
  }

  const handleFxToggle = (fxName: FxName) => {
    const current = deck.fx[fxName]
    const newEnabled = !current.enabled
    const newFx = {
      ...deck.fx,
      [fxName]: { ...current, enabled: newEnabled },
    }
    toggleFx(deckId, fxName, newEnabled, current.amount)
    if (newEnabled) {
      setFxParameter(deckId, fxName, current.amount)
    }
    updateDeck(deckId, {
      fx: newFx,
      statusMessage: msg(newEnabled ? fxLabels[fxName].msgOn : 'fxOff'),
    })
  }

  const handleFxAmountChange = (fxName: FxName, amount: number) => {
    const current = deck.fx[fxName]
    const newFx = {
      ...deck.fx,
      [fxName]: { ...current, amount },
    }
    updateDeck(deckId, { fx: newFx })
    if (current.enabled) {
      setFxAmount(deckId, fxName, amount)
      setFxParameter(deckId, fxName, amount)
    }
  }

  // Is track ending soon?
  const isEndingSoon = deck.isPlaying && deck.duration > 0 && (deck.duration - deck.currentTime) <= 30

  // Meter bars rendering
  const meterBars = Array.from({ length: 12 }, (_, i) => {
    const threshold = (i + 1) / 12
    const isActive = meterLevel >= threshold
    let colorClass = 'bg-led-green'
    if (i >= 10) colorClass = 'bg-led-red'
    else if (i >= 8) colorClass = 'bg-led-amber'
    return (
      <div
        key={i}
        className={`meter-bar h-3 ${isActive ? colorClass : 'bg-gray-800'}`}
        style={{ width: 6 }}
      />
    )
  })

  const isA = deckId === 'A'

  return (
    <div className="retro-panel p-4 flex flex-col gap-3 flex-1 min-w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="screw" />
          <span className="brand-label">DECK {deckId}</span>
          <div className="screw" />
        </div>
        <span className="brand-label">RETRO CDJ-2000</span>
        <div className={`led ${isEndingSoon ? 'on-red blink' : deck.isPlaying ? 'on' : deck.isLoaded ? 'on-amber' : ''}`} />
      </div>

      {/* Display Panel */}
      <div className={`segment-display ${isA ? 'cyan' : 'amber'} text-center`}>
        <div className="text-[10px] opacity-60 mb-1">
          {deck.fileName || '—'}
        </div>
        <div className={`text-lg font-bold ${deck.isLoading ? 'blink' : ''}`}>
          {deck.statusMessage}
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span>{formatTime(deck.currentTime)}</span>
          <span>{deck.bpm ? `${(deck.bpm * deck.playbackRate).toFixed(1)} BPM` : '--- BPM'}</span>
          <span>-{formatTime(deck.duration - deck.currentTime)}</span>
        </div>
      </div>

      {/* Tempo / Pitch Slider */}
      <div className="flex items-center gap-2 px-2">
        <span className="text-[9px] text-gray-500 w-10">TEMPO</span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={deck.playbackRate}
          onChange={(e) => {
            const rate = parseFloat(e.target.value)
            updateDeck(deckId, { playbackRate: rate })
          }}
          className="flex-1"
          disabled={!deck.isLoaded}
        />
        <span className="text-[10px] text-gray-400 w-16 text-right">
          {deck.playbackRate === 1 ? '±0%' : `${deck.playbackRate > 1 ? '+' : ''}${((deck.playbackRate - 1) * 100).toFixed(1)}%`}
        </span>
        <button
          className="retro-btn text-[9px] px-2 py-0.5"
          onClick={() => updateDeck(deckId, { playbackRate: 1 })}
          title="Reset tempo to original"
        >
          RST
        </button>
      </div>

      {/* Disc visual */}
      <div className="flex justify-center">
        <div
          className={`w-16 h-16 rounded-full border-4 ${
            isA ? 'border-led-cyan' : 'border-led-amber'
          } flex items-center justify-center ${
            deck.isPlaying ? 'disc-spin' : 'disc-spin paused'
          }`}
          style={{
            background: 'radial-gradient(circle, #333 30%, #111 31%, #222 60%, #111 61%, #191919 100%)',
          }}
        >
          <div className="w-3 h-3 rounded-full bg-gray-600 border border-gray-500" />
        </div>
      </div>

      {/* Waveform */}
      <div className="waveform-container" style={{ height: 70 }}>
        <div ref={waveformRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Level Meter */}
      <div className="flex items-center gap-1 justify-center">
        <span className="text-[9px] text-gray-500 mr-1">LVL</span>
        {meterBars}
      </div>

      {/* Transport Controls */}
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <button
          className={`retro-btn ${deck.isPlaying ? 'active' : ''}`}
          onClick={handlePlay}
          disabled={!deck.isLoaded}
        >
          {deck.isPlaying ? '❚❚ PAUSE' : '▶ PLAY'}
        </button>
        <button
          className="retro-btn"
          onClick={() => {
            if (wavesurferRef.current) {
              wavesurferRef.current.stop()
              updateDeck(deckId, { isPlaying: false, currentTime: 0 })
            }
          }}
          disabled={!deck.isLoaded}
        >
          ■ STOP
        </button>
        <button className="retro-btn danger" onClick={handleEject}>
          ⏏ EJECT
        </button>
        <button
          className="retro-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          💿 LOAD
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* CUE Points */}
      <div className="flex items-center gap-2 justify-center">
        <span className="text-[9px] text-gray-500">CUE</span>
        {[0, 1, 2].map((i) => {
          const cue = deck.cuePoints.find((c) => c.id === i)
          return (
            <div key={i} className="flex gap-1">
              <button
                className={`retro-btn text-[10px] px-2 py-1 ${cue ? 'active' : ''}`}
                onClick={() => handleCueSet(i)}
                title={`Set CUE ${i + 1} at current position`}
              >
                SET {i + 1}
              </button>
              <button
                className={`retro-btn text-[10px] px-2 py-1 ${cue ? '' : 'opacity-30'}`}
                onClick={() => handleCueRecall(i)}
                disabled={!cue}
                title={cue ? `Go to ${formatTime(cue.time)}` : 'Not set'}
              >
                ▶{i + 1}
              </button>
            </div>
          )
        })}
      </div>

      {/* Loop */}
      <div className="flex items-center gap-2 justify-center">
        <button
          className={`retro-btn ${deck.loopEnabled ? 'active' : ''}`}
          onClick={handleLoop}
          disabled={!deck.isLoaded}
        >
          {deck.loopEnabled ? '🔁 LOOP ON' : '🔁 LOOP'}
        </button>
        {deck.loopEnabled && (
          <span className="text-[10px] text-led-green">
            {formatTime(deck.loopStart)} → {formatTime(deck.loopEnd)}
          </span>
        )}
      </div>

      {/* Volume & Filters */}
      <div className="grid grid-cols-3 gap-3 mt-1">
        {/* Volume */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-gray-500">VOLUME</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={deck.volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-full"
            style={{ writingMode: 'vertical-lr' as any, height: 80 }}
          />
          <span className="text-[10px] text-gray-400">
            {Math.round(deck.volume * 100)}
          </span>
        </div>

        {/* Low Filter */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-gray-500">LOW</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={deck.lowFilter}
            onChange={(e) =>
              updateDeck(deckId, { lowFilter: parseInt(e.target.value) })
            }
            className="w-full"
            style={{ writingMode: 'vertical-lr' as any, height: 80 }}
          />
          <button
            className={`retro-btn text-[9px] px-2 py-0.5 mt-1 ${deck.lowFilter === 0 ? 'danger' : ''}`}
            onClick={handleKillLow}
            title="Kill / restore low frequencies"
          >
            {deck.lowFilter === 0 ? 'LOW ✕' : 'KILL'}
          </button>
          <span className="text-[10px] text-gray-400">
            {deck.lowFilter - 50 > 0 ? '+' : ''}
            {deck.lowFilter - 50}
          </span>
        </div>

        {/* High Filter */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-gray-500">HIGH</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={deck.highFilter}
            onChange={(e) =>
              updateDeck(deckId, { highFilter: parseInt(e.target.value) })
            }
            className="w-full"
            style={{ writingMode: 'vertical-lr' as any, height: 80 }}
          />
          <button
            className={`retro-btn text-[9px] px-2 py-0.5 mt-1 ${deck.highFilter === 0 ? 'danger' : ''}`}
            onClick={handleKillHigh}
            title="Kill / restore high frequencies"
          >
            {deck.highFilter === 0 ? 'HIGH ✕' : 'KILL'}
          </button>
          <span className="text-[10px] text-gray-400">
            {deck.highFilter - 50 > 0 ? '+' : ''}
            {deck.highFilter - 50}
          </span>
        </div>
      </div>

      {/* FX Panel */}
      <div className="mt-2 p-2 bg-[#151515] border border-[#333] rounded">
        <div className="flex items-center justify-center gap-1 mb-2">
          <div className={`led ${Object.values(deck.fx).some(f => f.enabled) ? 'on' : ''}`} />
          <span className="text-[9px] text-gray-500 tracking-widest">EFFECTS</span>
          <div className={`led ${Object.values(deck.fx).some(f => f.enabled) ? 'on' : ''}`} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(fxLabels) as FxName[]).map((fxName) => {
            const fxState = deck.fx[fxName]
            const label = fxLabels[fxName]
            return (
              <div key={fxName} className="flex flex-col items-center gap-1">
                <button
                  className={`retro-btn text-[9px] px-2 py-1 w-full ${fxState.enabled ? 'active' : ''}`}
                  onClick={() => handleFxToggle(fxName)}
                >
                  {label.icon} {fxName.toUpperCase()}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={fxState.amount}
                  onChange={(e) => handleFxAmountChange(fxName, parseFloat(e.target.value))}
                  className="w-full"
                  style={{ height: 4 }}
                />
                <span className="text-[8px] text-gray-600">
                  {Math.round(fxState.amount * 100)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export default Deck
