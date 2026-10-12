import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import type { Category, FormatCost, Ingredient, Kit, KitExtra, KitItem, KitPackaging, KitPrice } from './types'

export type KitCost = { products: number; packaging: number; extras: number; total: number }

type ProductLite = { id: string; name: string; image_path: string | null }

/** Carrega tudo o que os kits precisam (kits, componentes, custos dos produtos e ingredientes). */
export function useKitData() {
  const { company } = useAuth()
  const toast = useToast()
  const [kits, setKits] = useState<Kit[]>([])
  const [items, setItems] = useState<KitItem[]>([])
  const [packaging, setPackaging] = useState<KitPackaging[]>([])
  const [extras, setExtras] = useState<KitExtra[]>([])
  const [prices, setPrices] = useState<KitPrice[]>([])
  const [formats, setFormats] = useState<FormatCost[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ingCategories, setIngCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<ProductLite[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!company) return
    const c = company.id
    const [k, ki, kp, ke, kr, f, ing, ic, p] = await Promise.all([
      supabase.from('kits').select('*').eq('company_id', c).order('name'),
      supabase.from('kit_items').select('id, kit_id, format_id, quantity').eq('company_id', c).order('created_at'),
      supabase.from('kit_packaging').select('id, kit_id, ingredient_id, quantity').eq('company_id', c).order('created_at'),
      supabase.from('kit_extras').select('id, kit_id, description, amount').eq('company_id', c).order('created_at'),
      supabase.from('kit_prices').select('id, kit_id, name, price').eq('company_id', c).order('created_at'),
      supabase.from('product_format_costs').select('*').eq('company_id', c).order('sort_order'),
      supabase.from('ingredients').select('*').eq('company_id', c).order('name'),
      supabase.from('ingredient_categories').select('id, name').eq('company_id', c).order('name'),
      supabase.from('products').select('id, name, image_path').eq('company_id', c).order('name'),
    ])
    const err = k.error ?? ki.error ?? kp.error ?? ke.error ?? kr.error ?? f.error ?? ing.error ?? ic.error ?? p.error
    if (err) toast(friendlyError(err), 'error')
    setKits((k.data ?? []) as Kit[])
    setItems(((ki.data ?? []) as KitItem[]).map((x) => ({ ...x, quantity: Number(x.quantity) })))
    setPackaging(((kp.data ?? []) as KitPackaging[]).map((x) => ({ ...x, quantity: Number(x.quantity) })))
    setExtras(((ke.data ?? []) as KitExtra[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setPrices(((kr.data ?? []) as KitPrice[]).map((x) => ({ ...x, price: Number(x.price) })))
    setFormats(((f.data ?? []) as FormatCost[]).filter((x) => x.active))
    setIngredients(((ing.data ?? []) as Ingredient[]).filter((x) => x.active))
    setIngCategories((ic.data ?? []) as Category[])
    setProducts((p.data ?? []) as ProductLite[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const formatById = useMemo(() => new Map(formats.map((f) => [f.format_id, f])), [formats])
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const costOf = useCallback(
    (kitId: string): KitCost => {
      const prod = items
        .filter((i) => i.kit_id === kitId)
        .reduce((a, i) => a + i.quantity * Number(formatById.get(i.format_id)?.cost_total ?? 0), 0)
      const pack = packaging
        .filter((i) => i.kit_id === kitId)
        .reduce((a, i) => a + i.quantity * Number(ingById.get(i.ingredient_id)?.cost ?? 0), 0)
      const ext = extras.filter((i) => i.kit_id === kitId).reduce((a, i) => a + i.amount, 0)
      return { products: prod, packaging: pack, extras: ext, total: prod + pack + ext }
    },
    [items, packaging, extras, formatById, ingById],
  )

  return {
    kits, items, packaging, extras, prices, formats, ingredients, ingCategories, products,
    formatById, ingById, productById, costOf, loading, reload: load,
  }
}
