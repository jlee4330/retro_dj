import { useRef, useEffect, useState } from 'react'
import Deck, { DeckHandle } from './Deck'
import Mixer from './Mixer'
import { ensureAudioResumed } from './audioEngine'
import { useDJStore } from './store'

export default function App() {
  const deckARef = useRef<DeckHandle>(null)
  const deckBRef = useRef<DeckHandle>(null)
  const [showKeys, setShowKeys] = useState(true)

  const setCrossfader = useDJStore((s) => s.setCrossfader)
  const crossfader = useDJStore((s) => s.crossfader)

  const handleFirstInteraction = () => {
    ensureAudioResumed()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        // Deck A play/pause
        case 'q':
          e.preventDefault()
          deckARef.current?.play()
          break
        // Deck B play/pause
        case 'w':
          e.preventDefault()
          deckBRef.current?.play()
          break
        // Deck A cue set 1/2/3
        case '1':
          e.preventDefault()
          deckARef.current?.cueSet(0)
          break
        case '2':
          e.preventDefault()
          deckARef.current?.cueSet(1)
          break
        case '3':
          e.preventDefault()
          deckARef.current?.cueSet(2)
          break
        // Deck A cue recall 1/2/3
        case '!':
          e.preventDefault()
          deckARef.current?.cueRecall(0)
          break
        // Deck B cue set 1/2/3
        case '8':
          e.preventDefault()
          deckBRef.current?.cueSet(0)
          break
        case '9':
          e.preventDefault()
          deckBRef.current?.cueSet(1)
          break
        case '0':
          e.preventDefault()
          deckBRef.current?.cueSet(2)
          break
        // Crossfader nudge
        case 'z':
          e.preventDefault()
          setCrossfader(Math.max(0, crossfader - 0.05))
          break
        case 'x':
          e.preventDefault()
          setCrossfader(0.5)
          break
        case 'c':
          e.preventDefault()
          setCrossfader(Math.min(1, crossfader + 0.05))
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [crossfader, setCrossfader])

  return (
    <div
      className="min-h-screen bg-[#111] p-4 flex flex-col gap-4"
      onClick={handleFirstInteraction}
    >
      {/* Top chrome strip */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] border border-[#333] rounded">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-led-red shadow-led" />
          <span className="text-[10px] tracking-[4px] text-gray-500 uppercase">
            Retro DJ System
          </span>
        </div>
        <div className="text-[10px] tracking-[3px] text-gray-600 uppercase">
          CDJ-RX2000 · Digital Audio · 2-Deck Controller
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[4px] text-gray-500 uppercase">
            Web Audio
          </span>
          <div className="w-2 h-2 rounded-full bg-led-green shadow-led" />
        </div>
      </div>

      {/* Main layout: Deck A | Mixer | Deck B */}
      <div className="flex gap-4 flex-1 items-stretch">
        <Deck deckId="A" ref={deckARef} />
        <Mixer />
        <Deck deckId="B" ref={deckBRef} />
      </div>

      {/* Keyboard shortcuts hint bar */}
      {showKeys && (
        <div className="retro-panel px-4 py-2 flex items-center justify-between text-[9px] text-gray-500 tracking-wider">
          <div className="flex gap-4">
            <span><kbd className="text-led-cyan">Q</kbd> Play A</span>
            <span><kbd className="text-led-amber">W</kbd> Play B</span>
            <span><kbd className="text-led-cyan">1 2 3</kbd> Cue A</span>
            <span><kbd className="text-led-amber">8 9 0</kbd> Cue B</span>
          </div>
          <div className="flex gap-4">
            <span><kbd className="text-gray-400">Z</kbd> Xfade←</span>
            <span><kbd className="text-gray-400">X</kbd> Center</span>
            <span><kbd className="text-gray-400">C</kbd> Xfade→</span>
          </div>
          <button
            className="text-gray-600 hover:text-gray-400"
            onClick={() => setShowKeys(false)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom strip */}
      <div className="flex items-center justify-center py-2 gap-4">
        <div className="screw" />
        <span className="text-[8px] tracking-[3px] text-gray-600">
          © 2026 RETRO DJ SYSTEMS · ALL FREQUENCIES RESERVED
        </span>
        <div className="screw" />
      </div>
    </div>
  )
}
