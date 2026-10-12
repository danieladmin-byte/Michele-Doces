import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { num } from './format'
import { productImageUrl } from './images'
import type { MenuCard, MenuRender } from './menuImage'
import type { MenuItem, MenuKind, MenuSettings, PixAccount, PriceMargin } from './types'

export const TITLE_PRESETS = ['Cardápio do dia', 'Cardápio da Semana', 'Sabores Disponíveis']
export const KIND_INFO: Record<MenuKind, { name: string; defaultTitle: string; showPrices: boolean }> = {
  ONLINE: { name: 'Cardápio online', defaultTitle: 'Sabores Disponíveis', showPrices: false },
  PRINT: { name: 'Cardápio para imprimir', defaultTitle: 'Cardápio do dia', showPrices: true },
}

type KitLite = { id: string; name: string; image_path: string | null; active: boolean }
type KitPriceLite = { id: string; kit_id: string; name: string; price: number }
type KitItemLite = { kit_id: string; format_id: string }

export type MenuRow = {
  itemId: string
  kind: 'product' | 'kit'
  refId: string // price_id ou kit_price_id
  productId?: string // só nos sabores
  name: string
  detail: string
  price: number
  image: string | null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Segunda-feira, 12 de outubro" ou, no cardápio da semana, "Semana de 12 a 18 de outubro". */
export function menuDateLabel(title: string, now = new Date()) {
  if (/semana/i.test(title)) {
    const start = new Date(now)
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // segunda-feira
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const m = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long' })
    return start.getMonth() === end.getMonth()
      ? `Semana de ${start.getDate()} a ${end.getDate()} de ${m(end)}`
      : `Semana de ${start.getDate()} de ${m(start)} a ${end.getDate()} de ${m(end)}`
  }
  return cap(now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))
}

/** Tudo o que um cardápio (ONLINE ou PRINT) precisa: itens, ajustes, produtos, kits e contas PIX. */
export function useMenuData(kind: MenuKind) {
  const { company } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<MenuItem[]>([])
  const [settings, setSettings] = useState<MenuSettings>({
    kind,
    title: KIND_INFO[kind].defaultTitle,
    show_qr: kind === 'PRINT',
    show_prices: KIND_INFO[kind].showPrices,
    pix_id: null,
  })
  const [margins, setMargins] = useState<PriceMargin[]>([])
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map())
  const [kits, setKits] = useState<KitLite[]>([])
  const [kitPrices, setKitPrices] = useState<KitPriceLite[]>([])
  const [pix, setPix] = useState<PixAccount[]>([])
  const [kitItems, setKitItems] = useState<KitItemLite[]>([])
  const [formatProduct, setFormatProduct] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!company) return
    const c = company.id
    const [mi, ms, pm, pr, kt, kp, px, ki, fc] = await Promise.all([
      supabase.from('menu_items').select('id, kind, price_id, kit_price_id, position').eq('company_id', c).eq('kind', kind).order('position'),
      supabase.from('menu_settings').select('kind, title, show_qr, show_prices, pix_id').eq('company_id', c).eq('kind', kind).maybeSingle(),
      supabase.from('product_price_margins').select('*').eq('company_id', c),
      supabase.from('products').select('id, image_path').eq('company_id', c),
      supabase.from('kits').select('id, name, image_path, active').eq('company_id', c),
      supabase.from('kit_prices').select('id, kit_id, name, price').eq('company_id', c).order('price'),
      supabase.from('pix_accounts').select('id, name, image_path').eq('company_id', c).order('created_at'),
      supabase.from('kit_items').select('kit_id, format_id').eq('company_id', c),
      supabase.from('product_format_costs').select('format_id, product_id').eq('company_id', c),
    ])
    const err = mi.error ?? ms.error ?? pm.error ?? pr.error ?? kt.error ?? kp.error ?? px.error ?? ki.error ?? fc.error
    if (err) toast(friendlyError(err), 'error')
    setItems((mi.data ?? []) as MenuItem[])
    if (ms.data) setSettings(ms.data as MenuSettings)
    setMargins(((pm.data ?? []) as PriceMargin[]).filter((m) => m.active))
    setPhotos(new Map(((pr.data ?? []) as { id: string; image_path: string | null }[]).map((p) => [p.id, p.image_path])))
    setKits((kt.data ?? []) as KitLite[])
    setKitPrices(((kp.data ?? []) as KitPriceLite[]).map((x) => ({ ...x, price: Number(x.price) })))
    setPix((px.data ?? []) as PixAccount[])
    setKitItems((ki.data ?? []) as KitItemLite[])
    setFormatProduct(new Map(((fc.data ?? []) as { format_id: string; product_id: string }[]).map((x) => [x.format_id, x.product_id])))
    setLoading(false)
  }, [company, kind, toast])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // O nome do formato/preço só aparece quando faz diferença (vários formatos ou preços, ou combo).
  const detailOf = useCallback(
    (m: PriceMargin) => {
      const sameProduct = margins.filter((x) => x.product_id === m.product_id)
      const formats = new Set(sameProduct.map((x) => x.format_id))
      const inFormat = sameProduct.filter((x) => x.format_id === m.format_id)
      const parts: string[] = []
      if (formats.size > 1) parts.push(m.format_name)
      if (inFormat.length > 1 || m.bundle_size > 1) parts.push(m.bundle_size > 1 ? `${m.price_name} · ${num(m.bundle_size)} un` : m.price_name)
      return parts.join(' · ')
    },
    [margins],
  )

  const kitById = useMemo(() => new Map(kits.map((k) => [k.id, k])), [kits])

  /** Nome de um preço de kit; só inclui o nome do preço quando o kit tem mais de um. */
  const kitDetailOf = useCallback(
    (kp: KitPriceLite) => (kitPrices.filter((x) => x.kit_id === kp.kit_id).length > 1 ? kp.name : ''),
    [kitPrices],
  )

  const rows: MenuRow[] = useMemo(() => {
    const byPrice = new Map(margins.map((m) => [m.price_id, m]))
    const byKitPrice = new Map(kitPrices.map((k) => [k.id, k]))
    const out: MenuRow[] = []
    for (const it of [...items].sort((a, b) => a.position - b.position)) {
      if (it.price_id) {
        const m = byPrice.get(it.price_id)
        if (m) out.push({ itemId: it.id, kind: 'product', refId: m.price_id, productId: m.product_id, name: m.product_name, detail: detailOf(m), price: Number(m.price), image: photos.get(m.product_id) ?? null })
      } else if (it.kit_price_id) {
        const kp = byKitPrice.get(it.kit_price_id)
        const kit = kp ? kitById.get(kp.kit_id) : undefined
        if (kp && kit) out.push({ itemId: it.id, kind: 'kit', refId: kp.id, name: kit.name, detail: kitDetailOf(kp), price: kp.price, image: kit.image_path })
      }
    }
    return out
  }, [items, margins, kitPrices, kitById, photos, detailOf, kitDetailOf])

  const flavors = useMemo(() => rows.filter((r) => r.kind === 'product'), [rows])
  const kitRows = useMemo(() => rows.filter((r) => r.kind === 'kit'), [rows])
  /** Kits (com preço) cujos produtos são todos sabores deste cardápio e que ainda não estão nele. */
  const suggestedKits = useMemo(() => {
    const inMenuProducts = new Set(flavors.map((r) => r.productId))
    const inMenuKitPrices = new Set(kitRows.map((r) => r.refId))
    return kitPrices
      .filter((kp) => {
        const kit = kitById.get(kp.kit_id)
        if (!kit || !kit.active || inMenuKitPrices.has(kp.id)) return false
        const products = kitItems.filter((i) => i.kit_id === kp.kit_id).map((i) => formatProduct.get(i.format_id))
        return products.length > 0 && products.every((p) => !!p && inMenuProducts.has(p))
      })
      .map((kp) => ({ kp, kit: kitById.get(kp.kit_id)! }))
  }, [flavors, kitRows, kitPrices, kitById, kitItems, formatProduct])

  const selectedPix = pix.find((p) => p.id === settings.pix_id) ?? null

  const render: MenuRender = useMemo(() => {
    const card = (r: MenuRow): MenuCard => ({
      name: r.kind === 'kit' && r.detail ? `${r.name} · ${r.detail}` : r.name,
      detail: r.detail,
      price: r.price,
      imageUrl: productImageUrl(r.image),
    })
    return {
      kind,
      title: settings.title,
      dateLabel: menuDateLabel(settings.title),
      flavors: flavors.map(card),
      kits: kitRows.map(card),
      showPrices: settings.show_prices,
      qr: kind === 'PRINT' && settings.show_qr && selectedPix ? { url: productImageUrl(selectedPix.image_path) ?? '', name: selectedPix.name } : null,
      logoUrl: company?.logo_path ? supabase.storage.from('company-logos').getPublicUrl(company.logo_path).data.publicUrl : null,
      phone: company?.phone ?? null,
      instagram: company?.instagram ?? null,
    }
  }, [kind, settings, flavors, kitRows, selectedPix, company])

  /** Troca ajustes (título, QR, preços, conta PIX). A linha é criada na primeira vez. */
  async function saveSettings(patch: Partial<Omit<MenuSettings, 'kind'>>) {
    if (!company) return
    const next = { ...settings, ...patch }
    setSettings(next)
    const { error } = await supabase
      .from('menu_settings')
      .upsert({ company_id: company.id, kind, title: next.title, show_qr: next.show_qr, show_prices: next.show_prices, pix_id: next.pix_id }, { onConflict: 'company_id,kind' })
    if (error) {
      toast(friendlyError(error), 'error')
      await load()
    }
  }

  /** Adiciona sabores (price_id) e/ou kits (kit_price_id) no fim da lista. */
  async function addItems(picks: { priceIds: string[]; kitPriceIds: string[] }) {
    if (!company) return false
    let pos = items.reduce((a, i) => Math.max(a, i.position), 0)
    const payload = [
      ...picks.priceIds.map((price_id) => ({ company_id: company.id, kind, price_id, position: ++pos })),
      ...picks.kitPriceIds.map((kit_price_id) => ({ company_id: company.id, kind, kit_price_id, position: ++pos })),
    ]
    if (payload.length === 0) return false
    const { error } = await supabase.from('menu_items').insert(payload)
    if (error) {
      toast(friendlyError(error), 'error')
      return false
    }
    toast(payload.length === 1 ? 'Adicionado ao cardápio' : `${payload.length} itens adicionados`)
    await load()
    return true
  }

  async function removeItem(itemId: string) {
    const { error } = await supabase.from('menu_items').delete().eq('id', itemId)
    if (error) return toast(friendlyError(error), 'error')
    setItems((list) => list.filter((i) => i.id !== itemId))
  }

  async function clearAll() {
    if (!company || items.length === 0) return false
    const { error } = await supabase.from('menu_items').delete().eq('company_id', company.id).eq('kind', kind)
    if (error) {
      toast(friendlyError(error), 'error')
      return false
    }
    await load()
    return true
  }

  /** Sobe ou desce um item dentro do seu grupo (sabores ou kits). */
  async function move(itemId: string, dir: -1 | 1) {
    const row = rows.find((r) => r.itemId === itemId)
    if (!row) return
    const group = rows.filter((r) => r.kind === row.kind)
    const i = group.findIndex((r) => r.itemId === itemId)
    const other = group[i + dir]
    if (!other) return
    const a = items.find((x) => x.id === itemId)
    const b = items.find((x) => x.id === other.itemId)
    if (!a || !b) return
    // troca as posições (se forem iguais, separa)
    const pa = a.position
    const pb = b.position === a.position ? b.position + dir : b.position
    setItems((list) => list.map((x) => (x.id === a.id ? { ...x, position: pb } : x.id === b.id ? { ...x, position: pa } : x)))
    const r = await Promise.all([
      supabase.from('menu_items').update({ position: pb }).eq('id', a.id),
      supabase.from('menu_items').update({ position: pa }).eq('id', b.id),
    ])
    const err = r[0].error ?? r[1].error
    if (err) {
      toast(friendlyError(err), 'error')
      await load()
    }
  }

  return {
    items, settings, margins, photos, kits, kitPrices, pix, loading,
    rows, flavors, kitRows, suggestedKits, selectedPix, render, detailOf, kitDetailOf, kitById,
    reload: load, saveSettings, addItems, removeItem, clearAll, move,
  }
}
