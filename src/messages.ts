type MessageMap = Record<string, { normal: string; dramatic: string }>

const messages: MessageMap = {
  noDisc:       { normal: 'NO DISC',              dramatic: 'VOID — NO SIGNAL DETECTED' },
  loading:      { normal: 'TOC READING...',        dramatic: 'SUMMONING AUDIO DATA...' },
  loaded:       { normal: 'TRACK READY',           dramatic: 'MEMORY OF SOUND ACQUIRED' },
  playing:      { normal: 'PLAY ▶',               dramatic: 'THE SOUND AWAKENS' },
  paused:       { normal: 'PAUSE ❚❚',             dramatic: 'SILENCE HOLDS ITS BREATH' },
  cueSet:       { normal: 'CUE SET',              dramatic: 'A MOMENT HAS BEEN CHOSEN' },
  cueRecall:    { normal: 'CUE RECALL',           dramatic: 'RETURNING TO THE CHOSEN MOMENT' },
  loopOn:       { normal: 'LOOP ON',              dramatic: 'THIS LOOP SHALL CONTINUE' },
  loopOff:      { normal: 'LOOP OFF',             dramatic: 'THE CYCLE IS BROKEN' },
  crossfading:  { normal: 'CROSSFADE',            dramatic: 'CROSSFADE IN PROGRESS' },
  ejecting:     { normal: 'EJECT',                dramatic: 'RELEASING THE DISC FROM ITS DUTY' },
  syncing:      { normal: 'SYNC',                 dramatic: 'ALIGNING THE TEMPORAL FLOW' },
  endOfTrack:   { normal: 'END',                  dramatic: 'THE JOURNEY HAS CONCLUDED' },
  seekTo:       { normal: 'SEEK',                 dramatic: 'TRAVERSING THE TIMELINE' },
  filterChange: { normal: 'FILTER',               dramatic: 'RESHAPING THE FREQUENCIES' },
  autoCrossfadeStart: { normal: 'AUTO XFADE ▶',   dramatic: 'THE TRANSITION HAS BEGUN' },
  autoCrossfadeEnd:   { normal: 'AUTO XFADE DONE', dramatic: 'THE PASSAGE IS COMPLETE' },
  killLow:      { normal: 'LOW KILL',             dramatic: 'THE BASS HAS BEEN SILENCED' },
  killHigh:     { normal: 'HIGH KILL',            dramatic: 'THE HIGHS HAVE BEEN BANISHED' },
  restoreLow:   { normal: 'LOW RESTORE',          dramatic: 'THE BASS RETURNS FROM EXILE' },
  restoreHigh:  { normal: 'HIGH RESTORE',         dramatic: 'THE HIGHS RISE ONCE MORE' },
  endingSoon:   { normal: 'TRACK ENDING',         dramatic: 'THE END DRAWS NEAR...' },
  fxEcho:       { normal: 'ECHO ON',              dramatic: 'ECHOES FROM ANOTHER DIMENSION' },
  fxReverb:     { normal: 'REVERB ON',            dramatic: 'YOU HAVE ENTERED THE CATHEDRAL' },
  fxFlanger:    { normal: 'FLANGER ON',           dramatic: 'REALITY BEGINS TO WARP' },
  fxLofi:       { normal: 'LO-FI ON',             dramatic: 'DEGRADING TO A FORGOTTEN ERA' },
  fxOff:        { normal: 'FX OFF',               dramatic: 'THE ALTERATION HAS CEASED' },
}

export function getStatusMessage(key: string, dramatic: boolean): string {
  const msg = messages[key]
  if (!msg) return key.toUpperCase()
  return dramatic ? msg.dramatic : msg.normal
}
