/**
 * Fórmulas de precio y margen (solo para mostrar en pantalla; los costos los calcula la base de datos).
 *
 *   Lucro   = preço − custo
 *   Margem  = (preço − custo) / preço        (la planilla tenía 3 definiciones distintas; esta es la única)
 *   Markup  = preço / custo
 *   Preço sugerido = custo / (1 − margem)
 */

export type PriceResult = {
  unitPrice: number
  profit: number
  /** Fracción (0.7 = 70 %). null si no hay precio. */
  margin: number | null
  /** Veces el costo (3.3 = 3,3×). null si no hay costo. */
  markup: number | null
  per100: { price: number; cost: number; profit: number }
  batchProfit: number
}

/** Precio de un paquete (Kit 4 = R$ 15) -> precio por unidad. */
export const unitPriceOf = (price: number, bundleSize: number) => (bundleSize > 0 ? price / bundleSize : price)

export function calcPrice(price: number, bundleSize: number, unitCost: number, unitsPerBatch: number): PriceResult {
  const unitPrice = unitPriceOf(price, bundleSize)
  const profit = unitPrice - unitCost
  return {
    unitPrice,
    profit,
    margin: unitPrice > 0 ? profit / unitPrice : null,
    markup: unitCost > 0 ? unitPrice / unitCost : null,
    per100: { price: unitPrice * 100, cost: unitCost * 100, profit: profit * 100 },
    batchProfit: profit * unitsPerBatch,
  }
}

/** Precio por unidad para lograr cierta margen (fracción). null si el margen no es posible (>= 100 %). */
export function suggestedPrice(unitCost: number, margin: number): number | null {
  if (!(margin >= 0) || margin >= 1) return null
  return unitCost / (1 - margin)
}

/** Redondea hacia arriba al múltiplo indicado (0.10 -> R$ 0,10). */
export const roundUp = (v: number, step = 0.1) => Math.ceil(v / step - 1e-9) * step

const pctFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const pct = (fraction: number | null | undefined) =>
  fraction === null || fraction === undefined || Number.isNaN(fraction) ? '—' : `${pctFmt.format(fraction * 100)}%`

const mkFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const times = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${mkFmt.format(v)}×`

/** Clase CSS según el margen: verde >= 50 %, ámbar 30–50 %, rojo < 30 %. */
export const marginTone = (m: number | null | undefined): 'good' | 'mid' | 'low' | 'none' =>
  m === null || m === undefined || Number.isNaN(m) ? 'none' : m >= 0.5 ? 'good' : m >= 0.3 ? 'mid' : 'low'
