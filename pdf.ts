/**
 * PDF de Orçamento / Fatura con la plantilla de Michele Doces.
 * Se dibuja en vectores (texto seleccionable) sobre una hoja A4 usando las medidas
 * (en píxeles) del modelo original de 1132 × 1600; K las pasa a milímetros.
 * jsPDF y las fuentes solo se cargan al pedir el PDF.
 */

export type PdfItem = { description: string; quantity: number; unit_price: number; total_price: number }

export type PdfData = {
  kind: 'ORCAMENTO' | 'FATURA'
  number: number
  /** yyyy-mm-dd */
  date: string
  validUntil?: string | null
  eventName?: string | null
  customer: { name: string; phone?: string | null; city?: string | null } | null
  items: PdfItem[]
  subtotal: number
  discount: number
  shipping: number
  total: number
  /** Una línea por elemento (ej.: "50% Antecipado"). */
  terms: string[]
  phone?: string | null
  instagram?: string | null
  /** Logo de la empresa (URL pública) y el logo por defecto si el primero falla. */
  logoUrl?: string | null
  fallbackLogoUrl: string
}

const W = 1132
const K = 210 / W // mm por px
const PT = (K * 72) / 25.4 // pt por px

const YELLOW = '#ffdf72'
const PINK = '#ffb5b4'
const CREAM = '#fffbf0'
const CELL = '#ffefbb'
const TITLE_PILL = '#fff0bb'
const INK = '#000000'
const MUTED = '#5f5a50'

const COLS = [
  { x: 94, w: 270 },
  { x: 373, w: 277 },
  { x: 659, w: 168 },
  { x: 836, w: 182 },
]

const money = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))

function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo'))
    img.src = url
  })
}

/** Recorta la imagen en un círculo (centro, cubriendo) y devuelve un PNG. */
function circleCrop(img: HTMLImageElement, size = 480): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  g.closePath()
  g.clip()
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, size, size)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
  return c.toDataURL('image/png')
}

function gradientBg(): string {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 512
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, '#dbeaf0')
  grad.addColorStop(0.5, '#cfd8dc')
  grad.addColorStop(1, '#efd4cd')
  g.fillStyle = grad
  g.fillRect(0, 0, 8, 512)
  return c.toDataURL('image/png')
}

type Row = { lines: string[]; qty: string; unit: string; total: string; h: number }

export async function buildPdf(d: PdfData) {
  const [{ jsPDF }, fonts] = await Promise.all([import('jspdf'), import('./pdfFonts')])

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  doc.addFileToVFS('Caprasimo.ttf', fonts.caprasimo)
  doc.addFont('Caprasimo.ttf', 'Caprasimo', 'normal')
  doc.addFileToVFS('Poppins-Regular.ttf', fonts.poppins)
  doc.addFont('Poppins-Regular.ttf', 'Poppins', 'normal')
  doc.addFileToVFS('Poppins-SemiBold.ttf', fonts.poppinsSemi)
  doc.addFont('Poppins-SemiBold.ttf', 'Poppins', 'bold')

  // logo y fondo
  let logo: string | null = null
  for (const url of [d.logoUrl, d.fallbackLogoUrl]) {
    if (!url) continue
    try {
      logo = circleCrop(await loadImage(url))
      break
    } catch {
      /* prueba el siguiente */
    }
  }
  const bg = gradientBg()

  type Font = 'Caprasimo' | 'Poppins' | 'PoppinsBold'
  const setFont = (f: Font, sizePx: number) => {
    if (f === 'Caprasimo') doc.setFont('Caprasimo', 'normal')
    else doc.setFont('Poppins', f === 'PoppinsBold' ? 'bold' : 'normal')
    doc.setFontSize(sizePx * PT)
  }
  /** Ancho del texto en px (incluye el espaciado entre letras). */
  const tw = (t: string, f: Font, size: number, cs = 0) => {
    setFont(f, size)
    return doc.getTextWidth(t) / K + cs * Math.max(t.length - 1, 0)
  }
  const fit = (t: string, f: Font, maxW: number, maxSize: number, minSize = 12, cs = 0) => {
    let s = maxSize
    while (s > minSize && tw(t, f, s, cs) > maxW) s -= 1
    return s
  }

  type TextOpts = {
    size: number
    font?: Font
    color?: string
    align?: 'left' | 'center' | 'right'
    cs?: number
    outline?: { fill: string; width: number }
  }
  const text = (t: string, x: number, y: number, o: TextOpts) => {
    const f = o.font ?? 'Poppins'
    const cs = o.cs ?? 0
    const w = tw(t, f, o.size, cs)
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
    setFont(f, o.size)
    if (o.outline) {
      doc.setTextColor(o.outline.fill)
      doc.setDrawColor(INK)
      doc.setLineWidth(o.outline.width * K)
      doc.setLineJoin('round')
      doc.text(t, left * K, y * K, { baseline: 'middle', charSpace: cs * K, renderingMode: 'fillThenStroke' })
    } else {
      doc.setTextColor(o.color ?? INK)
      doc.text(t, left * K, y * K, { baseline: 'middle', charSpace: cs * K })
    }
  }

  const shape = (x: number, y: number, w: number, h: number, r: number, fill: string, lw = 3) => {
    doc.setFillColor(fill)
    doc.setDrawColor(INK)
    doc.setLineWidth(lw * K)
    doc.roundedRect(x * K, y * K, w * K, h * K, r * K, r * K, 'FD')
  }
  const pill = (x: number, y: number, w: number, h: number, fill: string, lw = 3) => shape(x, y, w, h, h / 2, fill, lw)

  // ---------------------------------------------------------------- filas
  const items: PdfItem[] = [...d.items]
  if (d.shipping > 0) items.push({ description: 'Frete / entrega', quantity: 1, unit_price: d.shipping, total_price: d.shipping })

  const colTextW = COLS[0].w - 32
  const rows: Row[] = items.map((it) => {
    setFont('Poppins', 21)
    let lines = doc.splitTextToSize(it.description, colTextW * K) as string[]
    if (lines.length > 2) {
      lines = lines.slice(0, 2)
      lines[1] = lines[1].replace(/.{0,2}$/, '…')
    }
    return {
      lines,
      qty: qtyText(it.quantity),
      unit: money(it.unit_price),
      total: money(it.total_price),
      h: lines.length > 1 ? 92 : 66,
    }
  })
  const GAP = 8
  const blank = (): Row => ({ lines: [], qty: '', unit: '', total: '', h: 66 })

  const frame = (first: boolean) => {
    doc.addImage(bg, 'PNG', 0, 0, 210, 297)
    if (first) {
      shape(68, 310, 996, 1058, 46, CREAM, 3.5) // hoja
      pill(565, 246, 413, 219, YELLOW) // fecha y número
      pill(153, 246, 569, 219, PINK) // A/C
      pill(268, 122, 594, 150, TITLE_PILL) // título
      const title = d.kind === 'FATURA' ? 'FATURA' : 'ORÇAMENTO'
      const size = fit(title, 'Caprasimo', 520, 112, 40)
      text(title, 565, 200, { size, font: 'Caprasimo', align: 'center', outline: { fill: '#fdd96b', width: Math.max(3, size / 21) } })
      text('A/C', 215, 293, { size: 38, font: 'Caprasimo', outline: { fill: '#fdd96b', width: 2.5 } })

      const name = d.customer?.name ?? ''
      const ns = fit(name, 'PoppinsBold', 470, 32, 18)
      if (name) text(name, 218, 346, { size: ns, font: 'PoppinsBold' })
      const sub: string[] = []
      if (d.customer?.phone) sub.push(d.customer.phone)
      if (d.customer?.city) sub.push(d.customer.city)
      if (sub.length) text(sub.join('  ·  '), 218, 388, { size: 21, color: '#3d3a34' })
      if (d.eventName) text(`Evento: ${d.eventName}`, 218, 424, { size: fit(`Evento: ${d.eventName}`, 'Poppins', 470, 21, 14), color: '#3d3a34' })

      const num = String(d.number).padStart(2, '0')
      text(`Número #${num}`, 932, 341, { size: 23, align: 'right' })
      text(`Data:  ${shortDate(d.date)}`, 932, 371, { size: 23, align: 'right' })
      if (d.validUntil) text(`Válido até ${shortDate(d.validUntil)}`, 932, 401, { size: 19, align: 'right', color: '#3d3a34' })

      // logo
      doc.setFillColor('#ffffff')
      doc.setDrawColor(INK)
      doc.setLineWidth(2 * K)
      doc.circle(990 * K, 122 * K, 86 * K, 'FD')
      if (logo) doc.addImage(logo, 'PNG', (990 - 76) * K, (122 - 76) * K, 152 * K, 152 * K)
      doc.setLineWidth(2 * K)
      doc.setDrawColor(INK)
      doc.circle(990 * K, 122 * K, 77 * K, 'S')
    } else {
      shape(68, 60, 996, 1320, 46, CREAM, 3.5)
    }

    // cabecera de la tabla
    const hy = first ? 517 : 100
    pill(803, hy, 230, 46, PINK, 2)
    pill(640, hy, 206, 46, YELLOW, 2)
    pill(440, hy, 235, 46, PINK, 2)
    pill(98, hy, 378, 46, YELLOW, 2)
    const hs = { size: 24, font: 'PoppinsBold' as Font, cs: 4, align: 'center' as const }
    text('PRODUTO', 287, hy + 23, hs)
    text('QUANT.', 566, hy + 23, hs)
    text('VALOR', 745, hy + 23, hs)
    text('TOTAL', 925, hy + 23, hs)

    // pie con teléfono e Instagram
    pill(22, 1483, 1088, 44, PINK, 2)
    const phone = d.phone?.trim()
    if (phone) {
      const w = Math.max(216, tw(phone, 'Poppins', 22, 1) + 56)
      pill(22, 1483, w, 44, YELLOW, 2)
      text(phone, 22 + w / 2, 1505, { size: 22, align: 'center', cs: 1 })
    }
    const ig = d.instagram?.trim()
    if (ig) {
      const label = ig.startsWith('@') ? ig : `@${ig}`
      const w = Math.max(388, tw(label, 'Poppins', 22, 1) + 56)
      pill(1110 - w, 1483, w, 44, YELLOW, 2)
      text(label, 1110 - w / 2, 1505, { size: 22, align: 'center', cs: 1 })
    }
  }

  const drawRow = (r: Row, y: number) => {
    doc.setFillColor(CELL)
    doc.setDrawColor(INK)
    doc.setLineWidth(1.6 * K)
    for (const c of COLS) doc.rect(c.x * K, y * K, c.w * K, r.h * K, 'FD')
    const mid = y + r.h / 2
    const lh = 27
    r.lines.forEach((ln, i) => text(ln, COLS[0].x + 16, mid + (i - (r.lines.length - 1) / 2) * lh, { size: 21, color: MUTED }))
    if (r.qty) text(r.qty, COLS[1].x + COLS[1].w / 2, mid, { size: 21, color: MUTED, align: 'center' })
    if (r.unit) text(r.unit, COLS[2].x + COLS[2].w / 2, mid, { size: 21, color: MUTED, align: 'center' })
    if (r.total) text(r.total, COLS[3].x + COLS[3].w / 2, mid, { size: 21, color: MUTED, align: 'center' })
  }

  const closing = () => {
    const grossTotal = d.subtotal + d.shipping
    pill(624, 1193, 405, 54, YELLOW, 2.5)
    text(`TOTAL: R$ ${money(grossTotal)}`, 826, 1221, { size: 28, font: 'PoppinsBold', align: 'center', cs: 1 })

    pill(28, 1300, 484, 132, CREAM, 3.5)
    text('TERMOS E CONDIÇÕES', 270, 1334, { size: 24, font: 'PoppinsBold', align: 'center', cs: 2 })
    const lines = d.terms.filter((l) => l.trim()).slice(0, 4)
    const many = lines.length > 2
    lines.forEach((ln, i) => {
      const s = fit(ln, 'Poppins', 430, many ? 22 : 28, 14)
      text(ln, 270, (many ? 1362 : 1372) + i * (many ? 26 : 33), { size: s, align: 'center' })
    })

    pill(626, 1300, 486, 132, CREAM, 3.5)
    const label = d.discount > 0 ? 'TOTAL C/ DESCONTO:' : 'TOTAL A PAGAR:'
    text(label, 869, 1345, { size: 29, font: 'PoppinsBold', align: 'center', cs: 1 })
    text(`R$ ${money(d.total)}`, 869, 1399, { size: 31, font: 'PoppinsBold', align: 'center', cs: 1 })
  }

  // ---------------------------------------------------------------- paginación
  const FIRST_TOP = 616
  const NEXT_TOP = 170
  const LAST_BOTTOM = 1175
  const MID_BOTTOM = 1340
  let i = 0
  let page = 0
  for (;;) {
    if (page > 0) doc.addPage()
    const first = page === 0
    frame(first)
    const top = first ? FIRST_TOP : NEXT_TOP
    const rest = rows.slice(i)
    const restH = rest.reduce((a, r) => a + r.h + GAP, 0) - (rest.length ? GAP : 0)
    const fitsAll = top + restH <= LAST_BOTTOM
    const bottom = fitsAll ? LAST_BOTTOM : MID_BOTTOM
    let y = top
    let placed = 0
    while (i < rows.length && (y + rows[i].h <= bottom || placed === 0)) {
      drawRow(rows[i], y)
      y += rows[i].h + GAP
      i++
      placed++
    }
    if (i >= rows.length) {
      if (first) {
        // hoja única: completa con filas vacías, como en el modelo (mínimo 7 filas)
        let count = placed
        while (count < 7 && y + 66 <= LAST_BOTTOM) {
          drawRow(blank(), y)
          y += 66 + GAP
          count++
        }
      }
      closing()
      break
    }
    page++
  }

  return doc
}

export async function downloadPdf(d: PdfData, filename: string) {
  const doc = await buildPdf(d)
  doc.save(filename)
}
