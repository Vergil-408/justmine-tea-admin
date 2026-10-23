// Mendeteksi kejadian yang perlu diberi bunyi di halaman Pesanan (murni, mudah dites).
//  - 'paid': pembayaran sebuah pesanan baru saja menjadi 'dibayar' (QRIS lunas, atau kasir menandai lunas)
//  - 'new' : pesanan "Bayar di Kasir" baru masuk (pesanan QRIS yang belum dibayar sengaja tidak berbunyi,
//            bunyinya menunggu sampai lunas supaya tidak berisik)
// prev = peta { [orderId]: paymentStatus } dari pengecekan sebelumnya; null = pengecekan pertama
// (hanya dijadikan dasar, tidak membunyikan apa pun untuk pesanan lama).

const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

export function detectOrderEvents(prev, orders) {
    const next = {}
    const events = []
    for (const o of orders) {
        next[o.id] = o.paymentStatus || null
        if (prev === null || o.status === 'dibatalkan') continue
        const before = prev[o.id]
        if (before === undefined) {
            if (o.paymentMethod === 'Bayar di Kasir' || o.paymentStatus === 'dibayar') events.push({ type: 'new', order: o })
        } else if (before !== 'dibayar' && o.paymentStatus === 'dibayar') {
            events.push({ type: 'paid', order: o })
        }
    }
    return { events, next }
}

export function describeEvent({ type, order }) {
    const meja = order.tableNumber ? ` · Meja ${order.tableNumber}` : ''
    const code = order.orderCode ? `#${order.orderCode}` : 'Pesanan'
    if (type === 'paid') {
        return { title: 'Pembayaran diterima', body: `${code}${meja} · ${rupiah(order.total ?? order.subtotal)}` }
    }
    const unpaid = order.paymentStatus === 'dibayar' ? '' : ' · bayar di kasir'
    return { title: 'Pesanan baru', body: `${code}${meja}${unpaid}` }
}

// Notifikasi desktop (pojok layar + bunyi bawaan sistem) hanya saat izin sudah diberikan
// DAN halaman Pesanan sedang tidak dilihat. Kalau sedang dilihat, banner + chime sudah cukup.
export function shouldShowDesktopNotification(permission, hidden, focused) {
    return permission === 'granted' && (hidden || !focused)
}