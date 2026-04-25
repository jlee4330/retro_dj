import { create } from 'zustand'

export type DeckId = 'A' | 'B'

export interface CuePoint {
  id: number
  time: number
  label: string
}

export type FxName = 'echo' | 'reverb' | 'flanger' | 'lofi'

export interface FxState {
  enabled: boolean
  amount: number  // 0-1
}

export interface DeckState {
  file: File | null
  fileName: string
  isPlaying: boolean
  isLoading: boolean
  isLoaded: boolean
  currentTime: number
  duration: number
  volume: number
  lowFilter: number   // 0-100, 50 = neutral
  highFilter: number  // 0-100, 50 = neutral
  loopEnabled: boolean
  loopStart: number
  loopEnd: number
  cuePoints: CuePoint[]
  bpm: number | null
  playbackRate: number
  statusMessage: string
  fx: Record<FxName, FxState>
}

interface DJStore {
  deckA: DeckState
  deckB: DeckState
  crossfader: number        // 0 (full A) to 1 (full B)
  masterVolume: number      // 0 to 1
  dramaticMode: boolean
  levelA: number            // 0 to 1, for meter display
  levelB: number            // 0 to 1, for meter display
  autoCrossfadeActive: boolean
  autoCrossfadeDuration: number  // seconds
  autoCrossfadeDirection: 'AtoB' | 'BtoA'

  updateDeck: (id: DeckId, partial: Partial<DeckState>) => void
  setCrossfader: (value: number) => void
  setMasterVolume: (value: number) => void
  toggleDramaticMode: () => void
  setLevel: (id: DeckId, value: number) => void
  setAutoCrossfade: (active: boolean, direction?: 'AtoB' | 'BtoA') => void
  setAutoCrossfadeDuration: (seconds: number) => void
}

const initialFx: Record<FxName, FxState> = {
  echo:    { enabled: false, amount: 0.5 },
  reverb:  { enabled: false, amount: 0.5 },
  flanger: { enabled: false, amount: 0.5 },
  lofi:    { enabled: false, amount: 0.5 },
}

const initialDeck: DeckState = {
  file: null,
  fileName: '',
  isPlaying: false,
  isLoading: false,
  isLoaded: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  lowFilter: 50,
  highFilter: 50,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  cuePoints: [],
  bpm: null,
  playbackRate: 1,
  statusMessage: 'NO DISC',
  fx: { ...initialFx },
}

export const useDJStore = create<DJStore>((set) => ({
  deckA: { ...initialDeck },
  deckB: { ...initialDeck },
  crossfader: 0.5,
  masterVolume: 0.85,
  dramaticMode: false,
  levelA: 0,
  levelB: 0,
  autoCrossfadeActive: false,
  autoCrossfadeDuration: 8,
  autoCrossfadeDirection: 'AtoB' as const,

  updateDeck: (id, partial) =>
    set((state) => ({
      [id === 'A' ? 'deckA' : 'deckB']: {
        ...(id === 'A' ? state.deckA : state.deckB),
        ...partial,
      },
    })),

  setCrossfader: (value) => set({ crossfader: value }),
  setMasterVolume: (value) => set({ masterVolume: value }),
  toggleDramaticMode: () => set((s) => ({ dramaticMode: !s.dramaticMode })),
  setLevel: (id, value) =>
    set({ [id === 'A' ? 'levelA' : 'levelB']: value }),
  setAutoCrossfade: (active, direction) =>
    set((s) => ({
      autoCrossfadeActive: active,
      ...(direction ? { autoCrossfadeDirection: direction } : {}),
    })),
  setAutoCrossfadeDuration: (seconds) =>
    set({ autoCrossfadeDuration: Math.max(1, Math.min(30, seconds)) }),
}))
