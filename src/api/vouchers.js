import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'

// Clean undefined values for Firestore
const clean = (obj) => JSON.parse(JSON.stringify(obj))

// Initial Seed Data for Voucher & Rewards
export const initialVouchers = [
  {
    id: 'vcr-tea-saver-5k',
    name: 'Tea Saver Rp5.000',
    description: 'Nikmati potongan Rp5.000 untuk seduhan teh melati dan menu artisanal favoritmu.',
    rewardType: 'fixed_discount', // 'fixed_discount' | 'free_topping'
    discountAmount: 5000,
    freeToppingName: null,
    pointsRequired: 250,
    quota: 500,
    redeemedCount: 342,
    usedCount: 310,
    maxPerCustomer: 1,
    startDate: '2026-11-01',
    endDate: '2026-12-31',
    validityType: 'duration', // 'duration' | 'fixed_date'
    validityDays: 7,
    fixedExpiryDate: null,
    minPurchase: 25000,
    allowBundle: true,
    active: true,
    status: 'active', // 'active' | 'scheduled' | 'out_of_stock' | 'expired' | 'inactive'
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=400&q=80',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'vcr-free-grass-jelly',
    name: 'Free Grass Jelly Topping',
    description: 'Tambahkan kenikmatan cincau hitam herbal alami gratis ke minuman pilihanmu.',
    rewardType: 'free_topping',
    discountAmount: null,
    freeToppingName: 'Grass Jelly (Cincau Alami)',
    pointsRequired: 180,
    quota: 300,
    redeemedCount: 195,
    usedCount: 180,
    maxPerCustomer: 2,
    startDate: '2026-11-01',
    endDate: '2026-12-31',
    validityType: 'duration',
    validityDays: 7,
    minPurchase: 18000,
    allowBundle: true,
    active: true,
    status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80',
    createdAt: '2026-11-01T09:30:00Z',
  },
  {
    id: 'vcr-weekend-10k',
    name: 'Weekend Treat Rp10.000',
    description: 'Spesial akhir pekan, dapatkan potongan Rp10.000 untuk momen bersantai bersama teman.',
    rewardType: 'fixed_discount',
    discountAmount: 10000,
    freeToppingName: null,
    pointsRequired: 450,
    quota: 200,
    redeemedCount: 200,
    usedCount: 195,
    maxPerCustomer: 1,
    startDate: '2026-11-01',
    endDate: '2026-12-15',
    validityType: 'duration',
    validityDays: 3,
    minPurchase: 45000,
    allowBundle: true,
    active: false,
    status: 'out_of_stock',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80',
    createdAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 'vcr-early-year-3k',
    name: 'Early Year Rp3.000',
    description: 'Sambut tahun baru dengan potongan langsung Rp3.000 di setiap transaksi.',
    rewardType: 'fixed_discount',
    discountAmount: 3000,
    freeToppingName: null,
    pointsRequired: 150,
    quota: 1000,
    redeemedCount: 0,
    usedCount: 0,
    maxPerCustomer: 1,
    startDate: '2027-01-01',
    endDate: '2027-01-31',
    validityType: 'duration',
    validityDays: 14,
    minPurchase: 20000,
    allowBundle: true,
    active: true,
    status: 'scheduled',
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
    createdAt: '2026-11-15T11:00:00Z',
  },
  {
    id: 'vcr-free-boba',
    name: 'Free Boba Popping',
    description: 'Topping boba kenyal gratis dengan cita rasa manis karamel legit.',
    rewardType: 'free_topping',
    discountAmount: null,
    freeToppingName: 'Pearl / Boba',
    pointsRequired: 200,
    quota: 150,
    redeemedCount: 150,
    usedCount: 142,
    maxPerCustomer: 1,
    startDate: '2026-10-01',
    endDate: '2026-11-01',
    validityType: 'duration',
    validityDays: 7,
    minPurchase: 20000,
    allowBundle: false,
    active: false,
    status: 'inactive',
    imageUrl: 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=400&q=80',
    createdAt: '2026-10-01T08:00:00Z',
  },
]

export const initialRedemptions = [
  {
    id: 'rdm-001',
    customerName: 'Siti Rahma',
    customerId: 'CST-081',
    voucherId: 'vcr-tea-saver-5k',
    voucherName: 'Tea Saver Rp5.000',
    pointsDeducted: 250,
    redeemedAt: '2026-11-21T19:40:00Z',
    expiresAt: '2026-11-28T23:59:59Z',
    status: 'used', // 'available' | 'used' | 'expired' | 'cancelled'
    usedAt: '2026-11-21T20:15:00Z',
    orderNumber: '#JT-20261121-08',
  },
  {
    id: 'rdm-002',
    customerName: 'Budi Santoso',
    customerId: 'CST-014',
    voucherId: 'vcr-tea-saver-5k',
    voucherName: 'Tea Saver Rp5.000',
    pointsDeducted: 250,
    redeemedAt: '2026-11-21T18:15:00Z',
    expiresAt: '2026-11-28T23:59:59Z',
    status: 'available',
    usedAt: null,
    orderNumber: null,
  },
  {
    id: 'rdm-003',
    customerName: 'Dimas Anggara',
    customerId: 'CST-042',
    voucherId: 'vcr-free-grass-jelly',
    voucherName: 'Free Grass Jelly Topping',
    pointsDeducted: 180,
    redeemedAt: '2026-11-20T12:10:00Z',
    expiresAt: '2026-11-27T23:59:59Z',
    status: 'used',
    usedAt: '2026-11-20T14:30:00Z',
    orderNumber: '#JT-20261120-14',
  },
  {
    id: 'rdm-004',
    customerName: 'Clarissa Lin',
    customerId: 'CST-118',
    voucherId: 'vcr-weekend-10k',
    voucherName: 'Weekend Treat Rp10.000',
    pointsDeducted: 450,
    redeemedAt: '2026-11-14T10:05:00Z',
    expiresAt: '2026-11-21T23:59:59Z',
    status: 'expired',
    usedAt: null,
    orderNumber: null,
  },
  {
    id: 'rdm-005',
    customerName: 'Kevin Sanjaya',
    customerId: 'CST-099',
    voucherId: 'vcr-tea-saver-5k',
    voucherName: 'Tea Saver Rp5.000',
    pointsDeducted: 250,
    redeemedAt: '2026-11-12T15:30:00Z',
    expiresAt: '2026-11-19T23:59:59Z',
    status: 'cancelled',
    usedAt: null,
    orderNumber: null,
  },
  {
    id: 'rdm-006',
    customerName: 'Amanda Putri',
    customerId: 'CST-109',
    voucherId: 'vcr-free-grass-jelly',
    voucherName: 'Free Grass Jelly Topping',
    pointsDeducted: 180,
    redeemedAt: '2026-11-21T14:02:00Z',
    expiresAt: '2026-11-28T23:59:59Z',
    status: 'used',
    usedAt: '2026-11-21T16:10:00Z',
    orderNumber: '#JT-20261121-02',
  },
]

// Fallback local state in case Firestore collection is empty or offline
let localVouchers = [...initialVouchers]
let localRedemptions = [...initialRedemptions]

/**
 * Dengarkan koleksi vouchers secara realtime.
 * Jika koleksi kosong → seed data awal ke Firestore agar tidak perlu manual input.
 */
export function listenToVouchersAdmin(callback) {
  try {
    return onSnapshot(
      collection(db, 'vouchers'),
      async (snap) => {
        if (snap.empty) {
          // Seed initial vouchers ke Firestore saat koleksi kosong
          try {
            const batch = writeBatch(db)
            initialVouchers.forEach((v) => {
              batch.set(doc(db, 'vouchers', v.id), clean(v))
            })
            await batch.commit()
          } catch (seedErr) {
            console.warn('Firestore voucher seed failed, using local data:', seedErr)
          }
          callback(localVouchers)
        } else {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
          localVouchers = list
          callback(list)
        }
      },
      (err) => {
        console.warn('Firestore vouchers offline/fallback to seed:', err)
        callback(localVouchers)
      }
    )
  } catch {
    callback(localVouchers)
    return () => {}
  }
}

/**
 * Simpan atau perbarui voucher
 */
export async function saveVoucher(voucher) {
  const id = voucher.id || 'vcr-' + Date.now()
  const payload = clean({
    ...voucher,
    id,
    updatedAt: new Date().toISOString(),
  })

  // Update in local array
  const idx = localVouchers.findIndex((v) => v.id === id)
  if (idx >= 0) {
    localVouchers[idx] = payload
  } else {
    localVouchers.unshift(payload)
  }

  try {
    await setDoc(doc(db, 'vouchers', id), payload)
  } catch (err) {
    console.warn('Firestore setDoc voucher error, saved in memory:', err)
  }
  return payload
}

/**
 * Ubah status voucher (Aktif / Nonaktif).
 * Gunakan setDoc dengan merge agar tetap berjalan meski dokumen belum ada di Firestore.
 */
export async function toggleVoucherStatus(id, active) {
  const status = active ? 'active' : 'inactive'
  const idx = localVouchers.findIndex((v) => v.id === id)
  if (idx >= 0) {
    localVouchers[idx] = { ...localVouchers[idx], active, status }
  }
  try {
    // setDoc dengan merge: aman untuk dokumen yang belum ada maupun yang sudah ada
    await setDoc(doc(db, 'vouchers', id), { active, status, updatedAt: new Date().toISOString() }, { merge: true })
  } catch (err) {
    console.warn('Firestore toggleVoucherStatus error:', err)
  }
}

/**
 * Hapus voucher (Hanya jika belum pernah ditukarkan)
 */
export async function deleteVoucher(id) {
  localVouchers = localVouchers.filter((v) => v.id !== id)
  try {
    await deleteDoc(doc(db, 'vouchers', id))
  } catch (err) {
    // Dokumen mungkin tidak ada di Firestore (hanya ada di seed lokal) — tidak perlu throw
    console.warn('Firestore deleteDoc voucher error (safe to ignore if doc not in DB):', err)
  }
}

/**
 * Dengarkan data riwayat penukaran poin.
 * Jika koleksi kosong → tampilkan seed lokal saja (redemptions tidak di-seed ke Firestore).
 */
export function listenToRedemptionsAdmin(callback) {
  try {
    return onSnapshot(
      collection(db, 'voucherRedemptions'),
      (snap) => {
        if (snap.empty) {
          // Koleksi kosong di Firestore: tampilkan seed data lokal untuk demo/dev
          callback(localRedemptions)
        } else {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
          localRedemptions = list
          callback(list)
        }
      },
      (err) => {
        console.warn('Firestore redemptions fallback to seed:', err)
        callback(localRedemptions)
      }
    )
  } catch {
    callback(localRedemptions)
    return () => {}
  }
}

