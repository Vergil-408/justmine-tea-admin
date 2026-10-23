import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase.js'

// Firestore menolak nilai `undefined`; lewat JSON semua field undefined ikut terbuang.
const clean = (obj) => JSON.parse(JSON.stringify(obj))

/**
 * Dengarkan SEMUA template grup (termasuk yang nonaktif), urut berdasarkan `order`.
 * Tanpa fallback seed: admin perlu melihat kondisi asli database.
 */
export function listenToOptionGroupsAdmin(callback) {
  return onSnapshot(
    collection(db, 'optionGroups'),
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ ...d.data(), id: d.id }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      ),
    (err) => console.error('Gagal memuat optionGroups:', err)
  )
}

/** Simpan (buat/timpa) satu grup. `group.id` jadi id dokumen. */
export async function saveOptionGroup(group) {
  const { id, ...rest } = group
  await setDoc(doc(db, 'optionGroups', id), clean(rest))
}

export async function deleteOptionGroup(id) {
  await deleteDoc(doc(db, 'optionGroups', id))
}
