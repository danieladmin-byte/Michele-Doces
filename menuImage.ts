/**
 * Cardápio como imagem (para postar no Instagram) e como PDF.
 *  - ONLINE: arte colorida, no estilo "Sabores Disponíveis" (1080 px de largura).
 *  - PRINT:  fundo branco, simples e barato de imprimir (A4).
 * Tudo é desenhado em canvas; o PDF só embrulha essas imagens.
 */
import logoDefault from './logo-transparente.png'
import { brl } from './format'
import { loadImage } from './images'

export type MenuCard = { name: string; detail: string; price: number; imageUrl: string | null }

export type MenuRender = {
  kind: 'ONLINE' | 'PRINT'
  title: string
  dateLabel: string
  flavors: MenuCard[]
  kits: MenuCard[]
  showPrices: boolean
  qr: { url: string; name: string } | null
  logoUrl: string | null
  phone?: string | null
  instagram?: string | null
}

/** Preço em R$ com espaço comum (as fontes embutidas não têm o espaço não separável). */
const priceText = (n: number) => brl(n).replace(/\u00a0/g, ' ')

const BROWN = '#5b2c1c'
const PINK_TXT = '#ef8797'
const PINK = '#f9bcc3'
const PINK_DEEP = '#f08c9b'
const LINE = '#f5c5c9'


// ------------------------------------------------------------------ recursos
let fontsReady: Promise<void> | null = null
function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const f = await import('./pdfFonts')
      const faces = [
        new FontFace('MCaprasimo', `url(data:font/ttf;base64,${f.caprasimo})`, { weight: '400' }),
        new FontFace('MPoppins', `url(data:font/ttf;base64,${f.poppins})`, { weight: '400' }),
        new FontFace('MPoppins', `url(data:font/ttf;base64,${f.poppinsSemi})`, { weight: '700' }),
      ]
      await Promise.all(faces.map((x) => x.load()))
      faces.forEach((x) => document.fonts.add(x))
    })()
  }
  return fontsReady
}

const tryImage = async (url: string | null | undefined) => {
  if (!url) return null
  try {
    return await loadImage(url)
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ desenho
type Ctx = CanvasRenderingContext2D

function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function cover(g: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  g.save()
  rr(g, x, y, w, h, r)
  g.clip()
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * k
  const dh = img.naturalHeight * k
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  g.restore()
}

function contain(g: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * k
  const dh = img.naturalHeight * k
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

const font = (weight: 400 | 700, size: number, family: 'MCaprasimo' | 'MPoppins') => `${weight} ${size}px ${family}, 'Trebuchet MS', sans-serif`

/** Maior tamanho (até max) em que o texto cabe em maxW. */
function fitSize(g: Ctx, text: string, family: 'MCaprasimo' | 'MPoppins', weight: 400 | 700, maxW: number, max: number, min = 12) {
  let s = max
  while (s > min) {
    g.font = font(weight, s, family)
    if (g.measureText(text).width <= maxW) break
    s -= 1
  }
  return s
}

function placeholder(g: Ctx, name: string, x: number, y: number, w: number, h: number, r: number) {
  g.save()
  rr(g, x, y, w, h, r)
  g.fillStyle = PINK
  g.fill()
  g.fillStyle = BROWN
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(400, Math.min(w, h) * 0.45, 'MCaprasimo')
  g.fillText((name.trim().charAt(0) || '?').toUpperCase(), x + w / 2, y + h / 2 + 4)
  g.restore()
}

function splitTitle(title: string): [string, string] {
  const t = title.trim() || 'Cardápio'
  const i = t.indexOf(' ')
  return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1)]
}

/** Gerador pseudo-aleatório fixo: o confete sai sempre igual. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

// ------------------------------------------------------------------ ONLINE
/** Linhas de contato (telefone e Instagram) que saem no rodapé da arte. */
function contactLines(d: MenuRender): string[] {
  const ig = d.instagram?.trim() ?? ''
  return [d.phone?.trim() ? `Encomendas: ${d.phone.trim()}` : '', ig ? (ig.startsWith('@') ? ig : '@' + ig) : ''].filter(Boolean)
}

async function drawOnline(d: MenuRender): Promise<HTMLCanvasElement> {
  const W = 1080
  const COLS_X = [48, 368]
  const CW = 282
  const CH = 265
  const STEP = 295
  const TOP = 340
  const rows = Math.ceil(d.flavors.length / 2)
  const leftBottom = TOP + Math.max(rows, 2) * STEP + 20

  // coluna da direita: logo, nuvem, kits, QR
  const RX = 700
  const RW = 340
  const cloudY = 330
  let rightBottom = cloudY + 270
  const kitH = d.kits.length > 0 ? 114 + d.kits.length * 86 : 0
  const kitY = rightBottom + 30
  if (kitH) rightBottom = kitY + kitH
  const qrH = d.qr ? 400 : 0
  const qrY = rightBottom + 30
  if (qrH) rightBottom = qrY + qrH
  const contact = contactLines(d)
  const H = Math.max(1080, leftBottom + (contact.length ? 28 + 14 + contact.length * 32 + 20 : 0), rightBottom + 235)

  const [logo, qrImg, ...photos] = await Promise.all([
    tryImage(d.logoUrl).then((x) => x ?? tryImage(logoDefault)),
    tryImage(d.qr?.url),
    ...d.flavors.map((f) => tryImage(f.imageUrl)),
  ])

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  // fundo creme
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fff6f1')
  bg.addColorStop(1, '#fde7e4')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  // painel rosa à direita (borda ondulada)
  const wave = () => {
    g.beginPath()
    g.moveTo(565, 0)
    g.lineTo(W, 0)
    g.lineTo(W, H)
    g.lineTo(735, H)
    g.bezierCurveTo(712, H * 0.82, 742, H * 0.62, 722, 540)
    g.bezierCurveTo(705, 420, 700, 300, 660, 200)
    g.bezierCurveTo(630, 120, 580, 70, 565, 0)
    g.closePath()
  }
  const pk = g.createLinearGradient(560, 0, W, H)
  pk.addColorStop(0, '#fbc5ca')
  pk.addColorStop(1, '#f3a0ac')
  wave()
  g.fillStyle = pk
  g.fill()
  g.save()
  g.translate(-18, 0)
  wave()
  g.setLineDash([12, 9])
  g.lineWidth = 2.5
  g.strokeStyle = '#e8899a'
  g.stroke()
  g.restore()

  // título
  const [l1, l2] = splitTitle(d.title)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  const s1 = fitSize(g, l1, 'MCaprasimo', 400, 560, 128, 50)
  g.font = font(400, s1, 'MCaprasimo')
  g.fillStyle = BROWN
  g.fillText(l1, 48, 40 + s1 * 0.95)
  if (l2) {
    const s2 = fitSize(g, l2, 'MCaprasimo', 400, 560, 120, 46)
    g.font = font(400, s2, 'MCaprasimo')
    g.fillStyle = PINK_TXT
    g.fillText(l2, 48, 40 + s1 * 0.95 + s2 * 0.98)
  }
  // fio decorativo com coração
  g.strokeStyle = PINK_DEEP
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(90, 292)
  g.bezierCurveTo(200, 268, 300, 312, 330, 288)
  g.moveTo(350, 288)
  g.bezierCurveTo(380, 312, 480, 268, 570, 292)
  g.stroke()
  g.fillStyle = PINK_DEEP
  g.beginPath()
  g.moveTo(340, 296)
  g.bezierCurveTo(326, 284, 328, 274, 336, 274)
  g.bezierCurveTo(340, 274, 340, 280, 340, 280)
  g.bezierCurveTo(340, 280, 340, 274, 344, 274)
  g.bezierCurveTo(352, 274, 354, 284, 340, 296)
  g.fill()

  // logo
  if (logo) contain(g, logo, RX + 10, 20, RW - 10, 270)

  // cartões dos sabores
  d.flavors.forEach((f, i) => {
    const x = COLS_X[i % 2]
    const y = TOP + Math.floor(i / 2) * STEP
    g.save()
    g.shadowColor = 'rgba(214,120,140,0.28)'
    g.shadowBlur = 16
    g.shadowOffsetY = 6
    rr(g, x, y, CW, CH, 30)
    g.fillStyle = '#fff7f4'
    g.fill()
    g.restore()
    rr(g, x, y, CW, CH, 30)
    g.lineWidth = 3
    g.strokeStyle = LINE
    g.stroke()
    // foto
    const px = x + 22
    const py = y + 54
    const pw = CW - 44
    const ph = CH - 54 - 22
    const img = photos[i]
    if (img) cover(g, img, px, py, pw, ph, 22)
    else placeholder(g, f.name, px, py, pw, ph, 22)
    // fita com o nome (uma linha; nomes longos quebram em duas)
    const rw = 234
    const rx = x + (CW - rw) / 2
    g.fillStyle = PINK
    g.beginPath()
    g.moveTo(rx, y + 12)
    g.lineTo(rx + rw, y + 12)
    g.lineTo(rx + rw - 12, y + 32)
    g.lineTo(rx + rw, y + 52)
    g.lineTo(rx, y + 52)
    g.lineTo(rx + 12, y + 32)
    g.closePath()
    g.fill()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = BROWN
    const maxNameW = rw - 44
    const one = fitSize(g, f.name, 'MCaprasimo', 400, maxNameW, 26, 12)
    const words = f.name.trim().split(/\s+/)
    if (one >= 18 || words.length < 2) {
      g.font = font(400, one, 'MCaprasimo')
      g.fillText(f.name, x + CW / 2, y + 33)
    } else {
      // divide no espaço mais perto do meio
      let best = 1
      let gap = Infinity
      for (let k = 1; k < words.length; k++) {
        const diff = Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length)
        if (diff < gap) {
          gap = diff
          best = k
        }
      }
      const l1 = words.slice(0, best).join(' ')
      const l2 = words.slice(best).join(' ')
      const ts = Math.min(fitSize(g, l1, 'MCaprasimo', 400, maxNameW, 19, 11), fitSize(g, l2, 'MCaprasimo', 400, maxNameW, 19, 11))
      g.font = font(400, ts, 'MCaprasimo')
      g.fillText(l1, x + CW / 2, y + 24)
      g.fillText(l2, x + CW / 2, y + 41)
    }
    // número
    g.beginPath()
    g.arc(x + CW - 38, y + CH - 38, 30, 0, Math.PI * 2)
    g.fillStyle = PINK_DEEP
    g.fill()
    g.lineWidth = 3
    g.strokeStyle = '#fff'
    g.stroke()
    g.fillStyle = '#fff'
    g.font = font(400, 28, 'MCaprasimo')
    g.fillText(String(i + 1).padStart(2, '0'), x + CW - 38, y + CH - 36)
    // preço
    if (d.showPrices) {
      const label = `${f.detail ? f.detail + ' · ' : ''}${priceText(f.price)}`
      const fs = fitSize(g, label, 'MPoppins', 700, CW - 130, 22, 12)
      g.font = font(700, fs, 'MPoppins')
      const tw = g.measureText(label).width + 28
      rr(g, x + 16, y + CH - 52, tw, 36, 18)
      g.fillStyle = BROWN
      g.fill()
      g.fillStyle = '#fff'
      g.textAlign = 'left'
      g.fillText(label, x + 30, y + CH - 33)
    }
  })

  // nuvem "Monte do seu jeito!"
  {
    const cx = RX + RW / 2 + 5
    const cy = cloudY + 110
    const rx = 168
    const ry = 98
    g.fillStyle = '#6a3524'
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2
      g.beginPath()
      g.arc(cx + rx * Math.cos(a), cy + ry * Math.sin(a), 38, 0, Math.PI * 2)
      g.fill()
    }
    g.beginPath()
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    g.fill()
    g.setLineDash([9, 7])
    g.lineWidth = 2.5
    g.strokeStyle = '#d9a99a'
    g.beginPath()
    g.ellipse(cx, cy, rx + 14, ry + 12, 0, 0, Math.PI * 2)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#fff2e8'
    g.textAlign = 'center'
    g.textBaseline = 'alphabetic'
    g.font = font(400, 54, 'MCaprasimo')
    g.fillText('Monte do', cx, cy - 6)
    g.fillText('seu jeito!', cx, cy + 56)
  }

  // painel dos kits
  const panel = (y: number, h: number, label: string) => {
    const x = RX + 10
    const w = RW - 20
    g.save()
    g.shadowColor = 'rgba(190,90,110,0.25)'
    g.shadowBlur = 14
    rr(g, x, y, w, h, 40)
    g.fillStyle = '#fff3ef'
    g.fill()
    g.restore()
    rr(g, x, y, w, h, 40)
    g.lineWidth = 3
    g.strokeStyle = LINE
    g.stroke()
    // fita
    const rw = w - 50
    const rx = x + 25
    g.fillStyle = PINK
    rr(g, rx, y + 22, rw, 64, 6)
    g.fill()
    g.fillStyle = '#fff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = font(400, 54, 'MCaprasimo')
    g.fillText(label, x + w / 2, y + 56)
    return { x, w }
  }
  if (kitH) {
    const { x, w } = panel(kitY, kitH, 'Kit')
    d.kits.forEach((k, i) => {
      const y = kitY + 112 + i * 86
      const pw = w - 36
      rr(g, x + 18, y, pw, 62, 31)
      g.fillStyle = '#fde3e3'
      g.fill()
      // bloco do preço
      const bw = 128
      rr(g, x + 18 + pw - bw, y - 2, bw, 66, 16)
      g.fillStyle = PINK_DEEP
      g.fill()
      g.textBaseline = 'middle'
      g.textAlign = 'center'
      const ps = fitSize(g, priceText(k.price), 'MCaprasimo', 400, bw - 12, 27, 14)
      g.font = font(400, ps, 'MCaprasimo')
      g.fillStyle = '#fff'
      g.fillText(priceText(k.price), x + 18 + pw - bw / 2, y + 33)
      // nome do kit
      const ns = fitSize(g, k.name, 'MCaprasimo', 400, pw - bw - 30, 30, 13)
      g.font = font(400, ns, 'MCaprasimo')
      g.fillStyle = BROWN
      g.textAlign = 'left'
      g.fillText(k.name, x + 38, y + 33)
    })
  }

  // QR PIX
  if (d.qr) {
    const { x, w } = panel(qrY, qrH, 'PIX')
    const qs = 230
    rr(g, x + (w - qs - 20) / 2, qrY + 106, qs + 20, qs + 20, 18)
    g.fillStyle = '#fff'
    g.fill()
    g.lineWidth = 2
    g.strokeStyle = LINE
    g.stroke()
    if (qrImg) contain(g, qrImg, x + (w - qs) / 2, qrY + 116, qs, qs)
    g.fillStyle = BROWN
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const ns = fitSize(g, d.qr.name, 'MPoppins', 700, w - 40, 22, 12)
    g.font = font(700, ns, 'MPoppins')
    g.fillText(d.qr.name, x + w / 2, qrY + qrH - 30)
  }

  // respingo de chocolate (canto inferior direito)
  {
    const k = 0.8 // altura do respingo
    const ch = g.createLinearGradient(0, H - 260 * k, 0, H)
    ch.addColorStop(0, '#7b4025')
    ch.addColorStop(1, '#3d1b10')
    g.fillStyle = ch
    g.beginPath()
    g.moveTo(650, H)
    g.bezierCurveTo(668, H - 56, 705, H - 32, 722, H - 90)
    g.bezierCurveTo(740, H - 148, 800, H - 76, 832, H - 110)
    g.bezierCurveTo(876, H - 154, 902, H - 93, 944, H - 134)
    g.bezierCurveTo(982, H - 181, 1010, H - 102, 1046, H - 158)
    g.lineTo(W, H - 200)
    g.lineTo(W, H)
    g.closePath()
    g.fill()
    g.strokeStyle = 'rgba(255,214,176,0.35)'
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(760, H - 56)
    g.bezierCurveTo(840, H - 104, 900, H - 48, 990, H - 96)
    g.stroke()
    for (const [dx, dy, r] of [[930, 222, 8], [1010, 262, 6], [880, 188, 5], [1050, 214, 7], [972, 280, 4]]) {
      g.beginPath()
      g.arc(dx, H - dy * k, r, 0, Math.PI * 2)
      g.fillStyle = '#5a2a18'
      g.fill()
    }
  }

  // confete no canto inferior esquerdo
  {
    const rand = rng(7)
    const colors = ['#f9a8b4', '#fbd36b', '#bfe3f5', '#c9e8b8', '#f5b5d8']
    for (let k = 0; k < 46; k++) {
      const x = rand() * 250
      const y = H - 20 - rand() * 130 * (1 - x / 330)
      g.save()
      g.translate(x, y)
      g.rotate(rand() * Math.PI)
      g.fillStyle = colors[Math.floor(rand() * colors.length)]
      rr(g, -9, -3, 18, 6, 3)
      g.fill()
      g.restore()
    }
  }

  // contato (duas linhas, sobre uma pílula clara para ler bem por cima do confete)
  if (contact.length) {
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.font = font(700, 22, 'MPoppins')
    const tw = Math.max(...contact.map((l) => g.measureText(l).width))
    const ph = 14 + contact.length * 32
    rr(g, 36, H - 28 - ph, Math.min(tw + 44, 590), ph, 22)
    g.fillStyle = 'rgba(255,247,244,0.92)'
    g.fill()
    g.fillStyle = BROWN
    contact.forEach((l, i) => g.fillText(l, 58, H - 28 - ph + 14 + 16 + i * 32))
  }
  return c
}

// ------------------------------------------------------------------ PRINT (A4, fundo branco)
async function drawPrint(d: MenuRender): Promise<HTMLCanvasElement[]> {
  const W = 1240
  const H = 1754
  const M = 80
  const ROW = 116
  const [logo, qrImg, ...imgs] = await Promise.all([
    tryImage(d.logoUrl).then((x) => x ?? tryImage(logoDefault)),
    tryImage(d.qr?.url),
    ...[...d.flavors, ...d.kits].map((f) => tryImage(f.imageUrl)),
  ])

  type Item = { card: MenuCard; img: HTMLImageElement | null; kit: boolean } | { heading: string }
  const list: Item[] = []
  d.flavors.forEach((card, i) => list.push({ card, img: imgs[i], kit: false }))
  if (d.kits.length) list.push({ heading: 'Kits' })
  d.kits.forEach((card, i) => list.push({ card, img: imgs[d.flavors.length + i], kit: true }))

  const HEAD_H = 440
  const QR_H = d.qr ? 440 : 0
  const pages: Item[][] = [[]]
  let used = HEAD_H
  for (const it of list) {
    const h = 'heading' in it ? 80 : ROW
    if (used + h > H - M - 20) {
      pages.push([])
      used = M
    }
    pages[pages.length - 1].push(it)
    used += h
  }
  const qrOnNewPage = !!d.qr && used + QR_H > H - M
  if (qrOnNewPage) pages.push([])

  return pages.map((items, pi) => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    let y = M
    if (pi === 0) {
      if (logo) contain(g, logo, W / 2 - 150, M - 30, 300, 190)
      const [l1, l2] = splitTitle(d.title)
      const full = l2 ? `${l1} ${l2}` : l1
      g.textAlign = 'center'
      g.textBaseline = 'alphabetic'
      const s = fitSize(g, full, 'MCaprasimo', 400, W - 2 * M, 96, 44)
      g.font = font(400, s, 'MCaprasimo')
      g.fillStyle = BROWN
      g.fillText(full, W / 2, M + 280)
      g.font = font(400, 28, 'MPoppins')
      g.fillStyle = '#6b6258'
      g.fillText(d.dateLabel, W / 2, M + 332)
      y = HEAD_H
    }
    for (const it of items) {
      if ('heading' in it) {
        g.textAlign = 'left'
        g.textBaseline = 'middle'
        g.font = font(400, 46, 'MCaprasimo')
        g.fillStyle = PINK_TXT
        g.fillText(it.heading, M, y + 40)
        y += 80
        continue
      }
      const { card, img, kit } = it
      const withPrice = kit || d.showPrices
      const ps = ROW - 24
      if (img) cover(g, img, M, y + 8, ps, ps, 18)
      else placeholder(g, card.name, M, y + 8, ps, ps, 18)
      g.lineWidth = 2
      g.strokeStyle = BROWN
      rr(g, M, y + 8, ps, ps, 18)
      g.stroke()
      g.textBaseline = 'middle'
      g.textAlign = 'left'
      const priceTxt = priceText(card.price)
      g.font = font(700, 38, 'MPoppins')
      const pw = withPrice ? g.measureText(priceTxt).width : 0
      const nameW = W - 2 * M - ps - 30 - (withPrice ? pw + 30 : 0)
      const ns = fitSize(g, card.name, 'MPoppins', 700, nameW, 38, 18)
      g.font = font(700, ns, 'MPoppins')
      g.fillStyle = '#1b1b1b'
      g.fillText(card.name, M + ps + 30, y + ROW / 2 - (card.detail ? 14 : 0))
      if (card.detail) {
        g.font = font(400, 24, 'MPoppins')
        g.fillStyle = '#6b6258'
        g.fillText(card.detail, M + ps + 30, y + ROW / 2 + 20)
      }
      if (withPrice) {
        g.textAlign = 'right'
        g.font = font(700, 38, 'MPoppins')
        g.fillStyle = '#1b1b1b'
        g.fillText(priceTxt, W - M, y + ROW / 2)
      }
      g.strokeStyle = LINE
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(M, y + ROW)
      g.lineTo(W - M, y + ROW)
      g.stroke()
      y += ROW
    }
    // QR PIX na última página
    if (d.qr && pi === pages.length - 1) {
      const qy = Math.min(Math.max(y + 40, M), H - M - QR_H + 20)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = font(400, 46, 'MCaprasimo')
      g.fillStyle = BROWN
      g.fillText('Pague com PIX', W / 2, qy + 30)
      const qs = 270
      rr(g, W / 2 - qs / 2 - 14, qy + 70, qs + 28, qs + 28, 18)
      g.strokeStyle = BROWN
      g.lineWidth = 2
      g.stroke()
      if (qrImg) contain(g, qrImg, W / 2 - qs / 2, qy + 84, qs, qs)
      g.font = font(700, 28, 'MPoppins')
      g.fillStyle = '#1b1b1b'
      g.fillText(d.qr.name, W / 2, qy + 84 + qs + 50)
    }
    const contact = contactLines(d).join('   ·   ')
    if (contact) {
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = font(400, 24, 'MPoppins')
      g.fillStyle = '#6b6258'
      g.fillText(contact, W / 2, H - 36)
    }
    return c
  })
}

// ------------------------------------------------------------------ API
export async function renderMenu(d: MenuRender): Promise<HTMLCanvasElement[]> {
  await ensureFonts()
  return d.kind === 'ONLINE' ? [await drawOnline(d)] : drawPrint(d)
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('imagem'))), type, q))

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function downloadMenuImages(d: MenuRender, baseName: string) {
  const pages = await renderMenu(d)
  for (let i = 0; i < pages.length; i++) {
    saveBlob(await toBlob(pages[i]), pages.length > 1 ? `${baseName}-${i + 1}.png` : `${baseName}.png`)
  }
}

export async function downloadMenuPdf(d: MenuRender, baseName: string) {
  const [pages, { jsPDF }] = await Promise.all([renderMenu(d), import('jspdf')])
  const w = 210
  const first = pages[0]
  const h = d.kind === 'ONLINE' ? (w * first.height) / first.width : 297
  const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true })
  pages.forEach((p, i) => {
    if (i > 0) doc.addPage([w, h], 'portrait')
    doc.addImage(p.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h)
  })
  saveBlob(doc.output('blob'), `${baseName}.pdf`)
}
