// Pengecil foto menu di browser, supaya aman disimpan sebagai teks (data URL) di Firestore.
// Hasil: crop tengah rasio 4:3, maksimal 640x480, WebP (JPEG kalau browser tidak bisa menulis WebP).
// Target ukuran teks tersimpan <= MAX_STORED_CHARS (sekitar 40 KB gambar asli setelah base64).

export const ASPECT = 4 / 3
export const MAX_WIDTH = 640
export const MIN_WIDTH = 240
export const MAX_STORED_CHARS = 60_000 // jauh di bawah batas 1 MB per dokumen Firestore
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024 // tolak file mentah > 15 MB

// Area crop tengah dari gambar sumber (w x h) agar rasio = ASPECT.
export function coverRect(w, h, aspect = ASPECT) {
  const srcAspect = w / h
  if (srcAspect > aspect) {
    const sw = Math.round(h * aspect)
    return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h }
  }
  const sh = Math.round(w / aspect)
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh }
}

// Perkiraan ukuran gambar asli (byte) dari data URL base64.
export function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const b64 = dataUrl.slice(comma + 1)
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

export const formatKB = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('File bukan gambar yang valid.'))
    }
    img.src = url
  })
}

function canEncodeWebp() {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  return c.toDataURL('image/webp').startsWith('data:image/webp')
}

/**
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, width: number, height: number, bytes: number, mime: string }>}
 */
export async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Pilih file gambar (JPG, PNG, atau WebP).')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('File terlalu besar (maksimal 15 MB).')

  const img = await loadImage(file)
  const { sx, sy, sw, sh } = coverRect(img.naturalWidth, img.naturalHeight)
  const mime = canEncodeWebp() ? 'image/webp' : 'image/jpeg'

  let width = Math.min(MAX_WIDTH, sw)
  for (;;) {
    const height = Math.round(width / ASPECT)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff' // latar putih untuk PNG transparan (JPEG tidak punya alpha)
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)

    for (let q = 0.82; q >= 0.4; q -= 0.07) {
      const dataUrl = canvas.toDataURL(mime, q)
      if (dataUrl.length <= MAX_STORED_CHARS) {
        return { dataUrl, width, height, bytes: dataUrlBytes(dataUrl), mime }
      }
    }
    if (width <= MIN_WIDTH) {
      throw new Error('Foto terlalu detail untuk dikecilkan. Coba foto lain atau yang lebih sederhana.')
    }
    width = Math.max(MIN_WIDTH, Math.round(width * 0.85))
  }
}
