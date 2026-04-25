import { useEffect, useRef, useState, useCallback } from 'react'
import { useDJStore } from './store'
import { setCrossfaderGains, setMasterVolume, getLevel } from './audioEngine'
import { getStatusMessage } from './messages'

export default function Mixer() {
  const crossfader = useDJStore((s) => s.crossfader)
  const masterVolume = useDJStore((s) => s.masterVolume)
  const setCrossfaderState = useDJStore((s) => s.setCrossfader)
  const setMasterVolumeState = useDJStore((s) => s.setMasterVolume)
  const dramaticMode = useDJStore((s) => s.dramaticMode)
  const toggleDramaticMode = useDJStore((s) => s.toggleDramaticMode)

  const deckA = useDJStore((s) => s.deckA)
  const deckB = useDJStore((s) => s.deckB)
  const updateDeck = useDJStore((s) => s.updateDeck)

  const autoCrossfadeActive = useDJStore((s) => s.autoCrossfadeActive)
  const autoCrossfadeDuration = useDJStore((s) => s.autoCrossfadeDuration)
  const autoCrossfadeDirection = useDJStore((s) => s.autoCrossfadeDirection)
  const setAutoCrossfade = useDJStore((s) => s.setAutoCrossfade)
  const setAutoCrossfadeDuration = useDJStore((s) => s.setAutoCrossfadeDuration)

  const [levelA, setLevelA] = useState(0)
  const [levelB, setLevelB] = useState(0)
  const animRef = useRef<number>(0)
  const autoCrossfadeRef = useRef<number>(0)
  const autoCrossfadeStartRef = useRef<number>(0)
  const autoCrossfadeFromRef = useRef<number>(0.5)

  // Sync crossfader gains to audio engine
  useEffect(() => {
    setCrossfaderGains(crossfader, deckA.volume, deckB.volume)
  }, [crossfader, deckA.volume, deckB.volume])

  useEffect(() => {
    setMasterVolume(masterVolume)
  }, [masterVolume])

  // Level meters
  useEffect(() => {
    const update = () => {
      setLevelA(getLevel('A'))
      setLevelB(getLevel('B'))
      animRef.current = requestAnimationFrame(update)
    }
    animRef.current = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // Auto crossfade animation
  useEffect(() => {
    if (!autoCrossfadeActive) {
      cancelAnimationFrame(autoCrossfadeRef.current)
      return
    }

    autoCrossfadeStartRef.current = performance.now()
    autoCrossfadeFromRef.current = crossfader

    const target = autoCrossfadeDirection === 'AtoB' ? 1 : 0
    const from = autoCrossfadeFromRef.current
    const durationMs = autoCrossfadeDuration * 1000

    const animate = (now: number) => {
      const elapsed = now - autoCrossfadeStartRef.current
      const progress = Math.min(elapsed / durationMs, 1)
      // Ease in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2

      const value = from + (target - from) * eased
      setCrossfaderState(value)

      if (progress >= 1) {
        setAutoCrossfade(false)
        return
      }
      autoCrossfadeRef.current = requestAnimationFrame(animate)
    }
    autoCrossfadeRef.current = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(autoCrossfadeRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCrossfadeActive, autoCrossfadeDirection, autoCrossfadeDuration])

  const handleSync = (targetDeck: 'A' | 'B') => {
    const source = targetDeck === 'A' ? deckB : deckA
    const target = targetDeck === 'A' ? deckA : deckB

    if (!source.bpm || !target.bpm) return

    const ratio = source.bpm / target.bpm
    updateDeck(targetDeck, {
      playbackRate: ratio,
      statusMessage: getStatusMessage('syncing', dramaticMode),
    })
  }

  const renderMeter = (level: number, side: 'left' | 'right') => {
    const bars = Array.from({ length: 16 }, (_, i) => {
      const threshold = (i + 1) / 16
      const isActive = level >= threshold
      let color = 'bg-led-green'
      if (i >= 13) color = 'bg-led-red'
      else if (i >= 10) color = 'bg-led-amber'
      return (
        <div
          key={i}
          className={`w-3 h-[6px] rounded-sm ${isActive ? color : 'bg-gray-800'}`}
        />
      )
    })
    return (
      <div className="flex flex-col-reverse gap-[2px] items-center">
        <span className="text-[8px] text-gray-500 mt-1">{side === 'left' ? 'A' : 'B'}</span>
        {bars}
      </div>
    )
  }

  return (
    <div className="retro-panel p-4 flex flex-col items-center gap-4 min-w-[200px]">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="screw" />
        <span className="brand-label">MIXER</span>
        <div className="screw" />
      </div>

      {/* Level Meters */}
      <div className="flex gap-3 items-end">
        {renderMeter(levelA, 'left')}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] text-gray-500">MASTER</span>
          <div className="segment-display text-[10px] px-2 py-1 text-center" style={{ minWidth: 80 }}>
            {Math.round(masterVolume * 100)}%
          </div>
        </div>
        {renderMeter(levelB, 'right')}
      </div>

      {/* Master Volume */}
      <div className="flex flex-col items-center gap-1 w-full">
        <span className="text-[9px] text-gray-500">MASTER VOL</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => setMasterVolumeState(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Crossfader */}
      <div className="flex flex-col items-center gap-1 w-full mt-2">
        <span className="text-[9px] text-gray-500">CROSSFADER</span>
        <div className="flex items-center gap-2 w-full">
          <span className="text-[10px] text-led-cyan">A</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={crossfader}
            onChange={(e) => setCrossfaderState(parseFloat(e.target.value))}
            className="crossfader w-full"
          />
          <span className="text-[10px] text-led-amber">B</span>
        </div>
      </div>

      {/* Sync Buttons */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <span className="text-[9px] text-gray-500">SYNC</span>
        <div className="flex gap-2">
          <button
            className="retro-btn text-[10px]"
            onClick={() => handleSync('A')}
            disabled={!deckA.bpm || !deckB.bpm}
            title="Match Deck A speed to Deck B's BPM"
          >
            A←B
          </button>
          <button
            className="retro-btn text-[10px]"
            onClick={() => handleSync('B')}
            disabled={!deckA.bpm || !deckB.bpm}
            title="Match Deck B speed to Deck A's BPM"
          >
            A→B
          </button>
        </div>
        {deckA.playbackRate !== 1 && (
          <span className="text-[9px] text-led-cyan">
            A: ×{deckA.playbackRate.toFixed(2)}
          </span>
        )}
        {deckB.playbackRate !== 1 && (
          <span className="text-[9px] text-led-amber">
            B: ×{deckB.playbackRate.toFixed(2)}
          </span>
        )}
      </div>

      {/* BPM Display */}
      <div className="flex gap-4 mt-2">
        <div className="segment-display text-center px-3 py-1 cyan">
          <div className="text-[8px] opacity-60">DECK A</div>
          <div className="text-sm">{deckA.bpm ? `${deckA.bpm}` : '---'}</div>
          <div className="text-[8px] opacity-60">BPM</div>
        </div>
        <div className="segment-display text-center px-3 py-1 amber">
          <div className="text-[8px] opacity-60">DECK B</div>
          <div className="text-sm">{deckB.bpm ? `${deckB.bpm}` : '---'}</div>
          <div className="text-[8px] opacity-60">BPM</div>
        </div>
      </div>

      {/* Auto Crossfade */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <span className="text-[9px] text-gray-500">AUTO CROSSFADE</span>
        <div className="flex gap-2">
          <button
            className={`retro-btn text-[10px] ${autoCrossfadeActive && autoCrossfadeDirection === 'AtoB' ? 'active' : ''}`}
            onClick={() => {
              if (autoCrossfadeActive) {
                setAutoCrossfade(false)
              } else {
                setAutoCrossfade(true, 'AtoB')
              }
            }}
          >
            A → B
          </button>
          <button
            className={`retro-btn text-[10px] ${autoCrossfadeActive && autoCrossfadeDirection === 'BtoA' ? 'active' : ''}`}
            onClick={() => {
              if (autoCrossfadeActive) {
                setAutoCrossfade(false)
              } else {
                setAutoCrossfade(true, 'BtoA')
              }
            }}
          >
            B → A
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-500">{autoCrossfadeDuration}s</span>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={autoCrossfadeDuration}
            onChange={(e) => setAutoCrossfadeDuration(parseInt(e.target.value))}
            className="w-20"
          />
        </div>
        {autoCrossfadeActive && (
          <span className="text-[9px] text-led-green blink">
            ● FADING {autoCrossfadeDirection === 'AtoB' ? 'A→B' : 'B→A'}
          </span>
        )}
      </div>

      {/* Dramatic Mode Toggle */}
      <div className="mt-4 flex flex-col items-center gap-1">
        <button
          className={`retro-btn ${dramaticMode ? 'active' : ''}`}
          onClick={toggleDramaticMode}
        >
          {dramaticMode ? '🎭 DRAMATIC ON' : '🎭 DRAMATIC'}
        </button>
        {dramaticMode && (
          <span className="text-[9px] text-led-green blink">
            ✦ MAXIMUM GRAVITAS ✦
          </span>
        )}
      </div>

      {/* Model label */}
      <div className="mt-auto pt-4 text-center">
        <div className="brand-label">CDJ-RX2000</div>
        <div className="text-[8px] text-gray-600">PROFESSIONAL CD PLAYER</div>
        <div className="text-[7px] text-gray-700 mt-1">SERIAL NO. 20260321</div>
      </div>
    </div>
  )
}
