import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import type { CatalogPhoto, CatalogTheme, ProductCategory } from './types'

/** Fotos do catálogo + famílias (as mesmas dos produtos). */
export function useCatalogData() {
  const { company } = useAuth()
  const toast = useToast()
  const [photos, setPhotos] = useState<CatalogPhoto[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [themes, setThemes] = useState<CatalogTheme[]>([])
  const [products, setProducts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!company) return
    const [ph, c, p, th] = await Promise.all([
      supabase.from('catalog_photos').select('id, title, sku, category_id, theme_id, product_id, image_path').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('product_categories').select('id, name').eq('company_id', company.id).order('name'),
      supabase.from('products').select('id, name').eq('company_id', company.id).order('name'),
      supabase.from('catalog_themes').select('id, name').eq('company_id', company.id).order('name'),
    ])
    const err = ph.error ?? c.error ?? p.error ?? th.error
    if (err) toast(friendlyError(err), 'error')
    setPhotos((ph.data ?? []) as CatalogPhoto[])
    setCategories((c.data ?? []) as ProductCategory[])
    setProducts((p.data ?? []) as { id: string; name: string }[])
    setThemes((th.data ?? []) as CatalogTheme[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void reload()
  }, [reload])

  return { photos, categories, themes, products, loading, reload }
}

/** Próximo código sequencial (DOC-001, DOC-002…) olhando os já usados. */
export function nextSku(photos: CatalogPhoto[], offset = 0): string {
  const max = photos.reduce((m, p) => {
    const n = /^DOC-(\d+)$/i.exec(p.sku ?? '')
    return n ? Math.max(m, Number(n[1])) : m
  }, 0)
  return `DOC-${String(max + 1 + offset).padStart(3, '0')}`
}

export const ALL = '__all__'
export const NONE = '__none__'

/** Filtra por família (tab), tema e busca (nome ou SKU). */
export function filterPhotos(photos: CatalogPhoto[], tab: string, query: string, theme: string = ALL): CatalogPhoto[] {
  const q = query.trim().toLowerCase()
  return photos.filter(
    (p) =>
      (tab === ALL || (tab === NONE ? p.category_id === null : p.category_id === tab)) &&
      (theme === ALL || (theme === NONE ? p.theme_id === null : p.theme_id === theme)) &&
      (p.title.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)),
  )
}
