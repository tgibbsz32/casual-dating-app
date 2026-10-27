/**
 * Generates the PWA / app icons into public/icons.
 *
 *   node scripts/make-icons.mjs
 *
 * No image library: the icons are written straight through a minimal PNG
 * encoder (zlib + CRC32), so the project has no raster-image dependency.
 */
import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

/* ── minimal PNG encoder (RGBA, 8-bit) ─────────────────────────────── */
const TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── icon artwork ──────────────────────────────────────────────────── */
const A = [255, 77, 126] // #ff4d7e
const B = [255, 154, 61] // #ff9a3d

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * @param size      edge length in px
 * @param corner    corner radius in px (0 = full-bleed, for maskable)
 * @param starScale size of the sparkle as a fraction of the edge
 */
function renderIcon(size, corner, starScale) {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const star = (size * starScale) / 2
  const edge = size * 0.06

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4

      // rounded-rect alpha
      let alpha = 255
      if (corner > 0) {
        const dx = x < corner ? corner - x : x > size - 1 - corner ? x - (size - 1 - corner) : 0
        const dy = y < corner ? corner - y : y > size - 1 - corner ? y - (size - 1 - corner) : 0
        const d = Math.hypot(dx, dy) - corner
        alpha = d <= 0 ? 255 : d >= 1 ? 0 : Math.round(255 * (1 - d))
      }

      // diagonal gradient
      const t = Math.min(1, Math.max(0, (x + y) / (size * 2)))
      let r = Math.round(lerp(A[0], B[0], t))
      let g = Math.round(lerp(A[1], B[1], t))
      let b = Math.round(lerp(A[2], B[2], t))

      // sparkle: astroid → four concave points
      const nx = (x + 0.5 - cx) / star
      const ny = (y + 0.5 - cy) / star
      const starMask = Math.sqrt(Math.abs(nx)) + Math.sqrt(Math.abs(ny)) <= 1
      if (starMask) {
        r = 255
        g = 255
        b = 255
      } else {
        // thin inner ring for a little depth
        const ring = Math.abs(Math.hypot(nx, ny) - 1.25)
        if (ring < 0.035) {
          r = Math.min(255, Math.round(r * 0.55 + 255 * 0.45))
          g = Math.min(255, Math.round(g * 0.55 + 255 * 0.45))
          b = Math.min(255, Math.round(b * 0.55 + 255 * 0.45))
        }
      }

      // subtle outer edge so icons read on light and dark launchers
      if (x < edge || y < edge || x >= size - edge || y >= size - edge) {
        r = Math.round(r * 0.92)
        g = Math.round(g * 0.92)
        b = Math.round(b * 0.92)
      }

      buf[i] = r
      buf[i + 1] = g
      buf[i + 2] = b
      buf[i + 3] = alpha
    }
  }
  return encodePng(size, size, buf)
}

const targets = [
  ['icon-192.png', 192, 42, 0.62],
  ['icon-512.png', 512, 110, 0.62],
  ['icon-maskable-512.png', 512, 0, 0.5],
  ['apple-touch-icon.png', 180, 38, 0.62],
]

for (const [name, size, corner, scale] of targets) {
  writeFileSync(join(outDir, name), renderIcon(size, corner, scale))
  console.log(`wrote public/icons/${name} (${size}×${size})`)
}
