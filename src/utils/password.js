// Password sementara untuk akun karyawan baru. Tidak pernah ditampilkan ke siapa pun:
// karyawan langsung diminta membuat passwordnya sendiri lewat tautan email.
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGIT = '23456789'
const SYMBOL = '!@#$%^&*-_'
const ALL = LOWER + UPPER + DIGIT + SYMBOL

function randomInt(max) {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / max) * max // buang nilai yang membuat distribusi miring
  do {
    globalThis.crypto.getRandomValues(buf)
  } while (buf[0] >= limit)
  return buf[0] % max
}

const pick = (set) => set[randomInt(set.length)]

// Selalu memuat huruf besar, kecil, angka, dan simbol (jaga-jaga kalau Firebase mewajibkan kebijakan password).
export function generateTempPassword(length = 24) {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)]
  while (chars.length < length) chars.push(pick(ALL))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
