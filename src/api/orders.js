import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  setDoc,
  increment,
} from 'firebase/firestore'
import { db } from './firebase.js'

/**
 * Dengarkan SEMUA pesanan (lintas user & tamu) secara real-time, terbaru di atas.
 * @param {Function} callback - menerima array order
 * @returns {Function} unsubscribe
 */
export function listenToAllOrders(callback) {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('Gagal memuat daftar pesanan:', err)
  )
}

/**
 * Ubah status 1 pesanan.
 * @param {string} orderId
 * @param {'menunggu'|'diproses'|'siap'|'selesai'|'dibatalkan'} newStatus
 */
export async function updateOrderStatus(orderId, newStatus) {
  await updateDoc(doc(db, 'orders', orderId), { status: newStatus })
}

/** Kasir menandai pesanan "Bayar di Kasir" sudah dibayar. (Pembayaran QRIS ditandai otomatis oleh server.) */
export async function markOrderPaid(orderId) {
  await updateDoc(doc(db, 'orders', orderId), { paymentStatus: 'dibayar', paidAt: serverTimestamp() })
}

/** Hapus 1 pesanan permanen (hanya owner; dipakai hati-hati, misal data uji coba). */
export async function deleteOrder(orderId) {
  await deleteDoc(doc(db, 'orders', orderId))
}

// Tanggal (yyyymmdd) menurut WIB, dipakai untuk reset nomor urut harian.
export function jakartaDateKey(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

export const formatOrderCode = (n) => `JT-${String(n).padStart(4, '0')}`

/**
 * Cari member berdasarkan nomor WhatsApp atau Nama
 * @param {string} searchStr
 */
export async function findMemberByPhone(searchStr) {
  const clean = String(searchStr || '').trim()
  if (!clean || clean.length < 3) return []

  const digits = clean.replace(/[\s-]/g, '')
  let formatted = digits
  if (formatted.startsWith('0')) formatted = '62' + formatted.slice(1)
  if (formatted.startsWith('+62')) formatted = formatted.slice(1)

  const variations = Array.from(new Set([digits, formatted, `0${formatted.slice(2)}`, `+${formatted}`])).filter(Boolean)

  try {
    const q = query(collection(db, 'users'), where('phone', 'in', variations.slice(0, 10)))
    const snap = await getDocs(q)
    if (!snap.empty) {
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    }
  } catch (err) {
    console.warn('Query member via "in" error, fallback full match:', err)
  }

  // Fallback search jika query indexed belum match atau user mencari nama
  try {
    const snap = await getDocs(collection(db, 'users'))
    const lower = clean.toLowerCase()
    return snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => {
        const p = String(u.phone || '').replace(/[\s-]/g, '')
        const n = String(u.displayName || '').toLowerCase()
        const e = String(u.email || '').toLowerCase()
        return (digits && p.includes(digits)) || n.includes(lower) || e.includes(lower)
      })
      .slice(0, 8)
  } catch (err) {
    console.warn('Gagal mencari member:', err)
    return []
  }
}

/**
 * Tambahkan poin ke profil member setelah transaksi POS berhasil.
 */
export async function addMemberPoints(uid, orderTotal) {
  if (!uid) return 0
  const pointsEarned = Math.floor(orderTotal / 1000)
  try {
    const userRef = doc(db, 'users', uid)
    await updateDoc(userRef, {
      points: increment(pointsEarned),
      totalOrders: increment(1),
    })
    return pointsEarned
  } catch (err) {
    console.warn('Gagal menambah poin member:', err)
    return pointsEarned
  }
}

/**
 * Membuat pesanan baru langsung dari POS Kasir.
 * Menggunakan runTransaction untuk nomor urut harian counter,
 * dengan fallback aman bila ada kendala permissions.
 */
export async function createPosOrder(orderData) {
  const dateKey = jakartaDateKey()
  const counterRef = doc(db, 'counters', `orders-${dateKey}`)
  const orderRef = doc(collection(db, 'orders'))

  let orderCode = ''
  let success = false

  try {
    await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef)
      const next = (counterSnap.exists() ? counterSnap.data().last || 0 : 0) + 1
      orderCode = formatOrderCode(next)
      tx.set(counterRef, { last: next }, { merge: true })
      tx.set(orderRef, {
        ...orderData,
        orderCode,
        createdAt: serverTimestamp(),
        paidAt: serverTimestamp(),
      })
    })
    success = true
  } catch (err) {
    console.warn('POS transaction fallback:', err)
  }

  if (!success) {
    // Fallback direct set
    const fallbackCode = `JT-${Math.floor(1000 + Math.random() * 9000)}`
    orderCode = fallbackCode
    await setDoc(orderRef, {
      ...orderData,
      orderCode,
      createdAt: serverTimestamp(),
      paidAt: serverTimestamp(),
    })
  }

  // Tambah poin jika ada userId member
  if (orderData.userId) {
    await addMemberPoints(orderData.userId, orderData.total || orderData.subtotal).catch(() => {})
  }

  return { orderId: orderRef.id, orderCode }
}
