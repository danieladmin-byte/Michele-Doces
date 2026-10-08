import type { BaseUnit, PurchaseUnit } from './types'

export const UNIT_LABEL: Record<PurchaseUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'L',
  unit: 'un',
}

export const BASE_LABEL: Record<BaseUnit, string> = { g: 'g', ml: 'ml', unit: 'un' }

/** Unidades que o usuário pode digitar para cada unidade de controle. */
export const FAMILY_UNITS: Record<BaseUnit, PurchaseUnit[]> = {
  g: ['kg', 'g'],
  ml: ['l', 'ml'],
  unit: ['unit'],
}

export const UNIT_FACTOR: Record<PurchaseUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  unit: 1,
}

export const toBase = (qty: number, unit: PurchaseUnit) => qty * UNIT_FACTOR[unit]

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (n: number | null | undefined) => brlFmt.format(Number(n ?? 0))

const brlPreciseFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
export const brlPrecise = (n: number) => brlPreciseFmt.format(n)

const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
export const num = (n: number) => numFmt.format(n)

/** Quantidade em unidade base -> texto legível (2000 g -> "2 kg"). */
export function formatQty(base: number, unit: BaseUnit): string {
  const v = Number(base)
  if (unit === 'g') return Math.abs(v) >= 1000 ? `${num(v / 1000)} kg` : `${num(v)} g`
  if (unit === 'ml') return Math.abs(v) >= 1000 ? `${num(v / 1000)} L` : `${num(v)} ml`
  return `${num(v)} un`
}

/** Custo médio guardado por unidade base -> "R$ 43,33 / kg". */
export function formatAvgCost(avg: number, unit: BaseUnit): string {
  if (!avg) return '—'
  if (unit === 'g') return `${brl(avg * 1000)} / kg`
  if (unit === 'ml') return `${brl(avg * 1000)} / L`
  return `${brlPrecise(avg)} / un`
}

export function formatDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Aceita "1,5", "1.5" e "1.234,56". Retorna NaN se inválido. */
export function parseNum(s: string): number {
  const t = s.trim()
  if (!t) return NaN
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  return Number(t)
}

export const todayISO = () => {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Dinero con detalle solo cuando hace falta: R$ 0,0298 (centavos fraccionarios) pero R$ 22,57. */
export const moneyAuto = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return Math.abs(v) < 1 && v !== 0 ? brlPrecise(v) : brl(v)
}

/** Costo por unidad base -> costo por kg / L / un (para mostrar). */
export function perBigUnit(cost: number, unit: BaseUnit): { value: number; label: string } {
  if (unit === 'g') return { value: cost * 1000, label: 'kg' }
  if (unit === 'ml') return { value: cost * 1000, label: 'L' }
  return { value: cost, label: 'un' }
}
