import { useCallback, useEffect, useRef, useState } from 'react'
import { detectOrderEvents, describeEvent, shouldShowDesktopNotification } from '../utils/orderAlerts.js'
import { isAudioRunning, playChime, unlockAudio } from '../utils/chime.js'

const PREF_KEY = 'justmine_admin_sound'

export function loadSoundPref() {
    try {
        return window.localStorage.getItem(PREF_KEY) !== 'off'
    } catch {
        return true
    }
}

export function saveSoundPref(on) {
    try {
        window.localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
    } catch {
        /* penyimpanan tidak tersedia: tidak masalah */
    }
}

/**
 * Membunyikan chime dan menampilkan banner saat ada pesanan baru (bayar di kasir) atau pembayaran masuk.
 * ready=false selama data pertama belum datang, supaya pesanan lama tidak ikut berbunyi.
 */
export function useOrderAlerts(orders, ready, soundOn) {
    const prevRef = useRef(null)
    const soundRef = useRef(soundOn)
    const [alert, setAlert] = useState(null)
    const [permission, setPermission] = useState(() =>
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
    )
    const permissionRef = useRef(permission)
    useEffect(() => { permissionRef.current = permission }, [permission])

    // Harus dipanggil dari klik pengguna (syarat browser).
    const askPermission = useCallback(async () => {
        if (typeof Notification === 'undefined') return
        try {
            setPermission(await Notification.requestPermission())
        } catch {
            setPermission(Notification.permission)
        }
    }, [])

    useEffect(() => { soundRef.current = soundOn }, [soundOn])

    // Buka kunci audio pada klik/sentuhan pertama.
    useEffect(() => {
        const events = ['pointerdown', 'keydown']
        const handler = () => {
            unlockAudio()
            if (isAudioRunning()) events.forEach((e) => window.removeEventListener(e, handler))
        }
        events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
        return () => events.forEach((e) => window.removeEventListener(e, handler))
    }, [])

    useEffect(() => {
        if (!ready) return
        const { events, next } = detectOrderEvents(prevRef.current, orders)
        prevRef.current = next
        if (events.length === 0) return
        const last = events[events.length - 1]
        setAlert({ key: `${Date.now()}`, type: last.type, extra: events.length - 1, ...describeEvent(last) })
        if (soundRef.current) {
            try { playChime(last.type === 'paid' ? 2 : 1) } catch { /* audio diblokir browser */ }
        }
        if (shouldShowDesktopNotification(permissionRef.current, document.hidden, document.hasFocus())) {
            try {
                const info = describeEvent(last)
                const n = new Notification(info.title, { body: info.body, tag: `${last.order.id}:${last.type}`, silent: false })
                n.onclick = () => {
                    window.focus()
                    n.close()
                }
            } catch {
                /* notifikasi tidak didukung di perangkat ini */
            }
        }
    }, [orders, ready])

    // Banner hilang sendiri setelah 8 detik.
    useEffect(() => {
        if (!alert) return undefined
        const t = setTimeout(() => setAlert(null), 8000)
        return () => clearTimeout(t)
    }, [alert])

    const dismiss = useCallback(() => setAlert(null), [])
    return { alert, dismiss, permission, askPermission }
}