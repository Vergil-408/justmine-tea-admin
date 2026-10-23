// Aturan pengelolaan admin (murni, mudah dites). Peran: owner = semua, kasir = hanya Pesanan.
export const ROLES = ['owner', 'kasir']
export const ROLE_LABEL = { owner: 'Owner', kasir: 'Kasir' }

const ownerCount = (admins) => admins.filter((a) => a.role === 'owner').length

// admins: [{ uid, role, email, name }]
export function canChangeRole(admins, targetUid, newRole, selfUid) {
  if (!ROLES.includes(newRole)) return { ok: false, reason: 'Peran tidak valid.' }
  if (targetUid === selfUid) return { ok: false, reason: 'Kamu tidak bisa mengubah perannya sendiri.' }
  const target = admins.find((a) => a.uid === targetUid)
  if (!target) return { ok: false, reason: 'Admin tidak ditemukan.' }
  if (target.role === 'owner' && newRole !== 'owner' && ownerCount(admins) <= 1) {
    return { ok: false, reason: 'Harus ada minimal satu owner.' }
  }
  return { ok: true }
}

export function canRemove(admins, targetUid, selfUid) {
  if (targetUid === selfUid) return { ok: false, reason: 'Kamu tidak bisa menghapus dirimu sendiri.' }
  const target = admins.find((a) => a.uid === targetUid)
  if (!target) return { ok: false, reason: 'Admin tidak ditemukan.' }
  if (target.role === 'owner' && ownerCount(admins) <= 1) return { ok: false, reason: 'Harus ada minimal satu owner.' }
  return { ok: true }
}
