// Bunyi singkat di browser. Browser menolak bunyi sebelum halaman pernah disentuh,
// jadi AudioContext dibuka kuncinya (unlockAudio) pada klik pertama.
let ctx = null

function getCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    if (!ctx) ctx = new Ctx()
    return ctx
}

export function unlockAudio() {
    const c = getCtx()
    if (c && c.state === 'suspended') c.resume().catch(() => { })
}

export function isAudioRunning() {
    return !!ctx && ctx.state === 'running'
}

// times=2 -> dua nada naik (untuk pembayaran diterima); times=1 -> satu nada.
export function playChime(times = 1) {
    const c = getCtx()
    if (!c) return
    if (c.state === 'suspended') c.resume().catch(() => { })
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