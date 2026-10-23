import { collection, onSnapshot, doc, addDoc, setDoc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase.js'

const clean = (obj) => JSON.parse(JSON.stringify(obj))

/**
 * Dengarkan semua item menu di collection "menuItems" secara real-time.
 * Beda dengan versi di app customer: di sini TIDAK ada fallback ke seed data,
 * karena admin perlu tahu kondisi ASLI database (kosong atau tidak).
 * @param {Function} callback - menerima array item
 * @returns {Function} unsubscribe
 */
export function listenToMenuItemsAdmin(callback) {
  return onSnapshot(
    collection(db, 'menuItems'),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('Gagal memuat menu:', err)
  )
}

/** Tambah item menu baru (id digenerate otomatis oleh Firestore). */
export async function addMenuItem(data) {
  await addDoc(collection(db, 'menuItems'), data)
}

/** Update sebagian field item menu (field lain, mis. optionGroupIds, tidak ikut terhapus). */
export async function updateMenuItem(id, data) {
  await updateDoc(doc(db, 'menuItems', id), data)
}

/** Hapus item menu. */
export async function deleteMenuItem(id) {
  await deleteDoc(doc(db, 'menuItems', id))
}

/**
 * Isi data contoh: menu + template grup. HANYA menulis dokumen yang id-nya belum ada,
 * jadi menu/grup yang sudah kamu ubah tidak tertimpa. Mengembalikan jumlah dokumen yang ditulis.
 */
export async function importSeed(menuItems, groups) {
  const [menuSnap, groupSnap] = await Promise.all([
    getDocs(collection(db, 'menuItems')),
    getDocs(collection(db, 'optionGroups')),
  ])
  const haveMenu = new Set(menuSnap.docs.map((d) => d.id))
  const haveGroups = new Set(groupSnap.docs.map((d) => d.id))
  const writes = []

  for (const g of groups) {
    if (haveGroups.has(g.id)) continue
    const { id, ...rest } = g
    writes.push(setDoc(doc(db, 'optionGroups', id), clean(rest)))
  }
  for (const m of menuItems) {
    if (haveMenu.has(m.id)) continue
    const { id, basePrice, ...rest } = m // basePrice = field lama, tidak dipakai lagi
    writes.push(setDoc(doc(db, 'menuItems', id), clean(rest)))
  }
  await Promise.all(writes)
  return writes.length
}
