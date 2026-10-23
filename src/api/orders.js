import { collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
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
