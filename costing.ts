import type { CostLine, ExtraCost, Ingredient, RecipeCost, Section } from './types'

/** Reparto del costo en las tres secciones que ve el usuario. */
export type Parts = { product: number; packaging: number; labor: number }

export const noParts = (): Parts => ({ product: 0, packaging: 0, labor: 0 })
export const totalOf = (p: Parts) => p.product + p.packaging + p.labor
export const addParts = (a: Parts, b: Parts): Parts => ({
  product: a.product + b.product,
  packaging: a.packaging + b.packaging,
  labor: a.labor + b.labor,
})

/**
 * Costo de una línea (ingrediente o receta). Espejo de las funciones de la base de datos
 * (recipe_cost_parts / product_cost_parts): sirve para mostrar el detalle línea a línea;
 * los totales oficiales siempre vienen de la base.
 *  - costo manual de la línea -> reemplaza al calculado y va a la sección de la línea
 *  - ingrediente -> cantidad × costo del ingrediente, a la sección de la línea
 *  - receta -> cantidad de tandas × (producto, embalaje, mano de obra) de la receta
 */
export function lineParts(
  l: CostLine,
  ingredients: Map<string, Ingredient>,
  recipes: Map<string, RecipeCost>,
): Parts {
  const p = noParts()
  const into = (section: Section, v: number) => {
    if (section === 'PRODUCT') p.product += v
    else p.packaging += v
  }
  if (l.manual_cost !== null) {
    into(l.section, Number(l.manual_cost))
    return p
  }
  if (l.ingredient_id) {
    into(l.section, Number(l.quantity) * Number(ingredients.get(l.ingredient_id)?.cost ?? 0))
    return p
  }
  const r = l.recipe_id ? recipes.get(l.recipe_id) : undefined
  if (r) {
    p.product = Number(l.quantity) * Number(r.cost_product)
    p.packaging = Number(l.quantity) * Number(r.cost_packaging)
    p.labor = Number(l.quantity) * Number(r.cost_labor)
  }
  return p
}

export const extraAmount = (e: ExtraCost) => Number(e.amount)

/** Mano de obra = minutos / 60 × valor por hora. */
export const laborFromTime = (minutes: number, hourly: number) => (minutes / 60) * hourly
