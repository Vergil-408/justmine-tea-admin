// Bunyi notifikasi pesanan masuk & pembayaran di browser.
// Menggunakan custom sound Cha-Ching mp3 dengan fallback Web Audio synthesizer.

let audioInstance = null
let ctx = null

function getAudio() {
  if (typeof window === 'undefined') return null
  if (!audioInstance) {
    audioInstance = new Audio('/sounds/chaching.mp3')
    audioInstance.preload = 'auto'
  }
  return audioInstance
}

function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!ctx) ctx = new Ctx()
  return ctx
}

export function unlockAudio() {
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
  const a = getAudio()
  if (a) {
    a.load()
  }
}

export function isAudioRunning() {
  return (!!ctx && ctx.state === 'running') || !!audioInstance
}

function playSynthesizerFallback(times = 1) {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  const notes = times > 1 ? [880, 1175] : [880]
  notes.forEach((freq, i) => {
    const t0 = c.currentTime + i * 0.22
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25)
    osc.start(t0)
    osc.stop(t0 + 0.27)
  })
}

// Memutar suara notifikasi: pertama coba mp3 custom cha-ching, jika diblokir/gagal fallback ke synth
export function playChime(times = 1) {
  try {
    const audio = new Audio('/sounds/chaching.mp3')
    audio.volume = 0.9
    const playPromise = audio.play()
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback jika mp3 gagal diputar atau browser memblokir audio element
        playSynthesizerFallback(times)
      })
    }
  } catch {
    playSynthesizerFallback(times)
  }
}