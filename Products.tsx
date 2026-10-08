import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { friendlyError } from './errors'
import { moneyAuto, num, parseNum } from './format'
import { marginTone, pct } from './pricing'
import type { FormatCost, PriceMargin, Product, ProductCategory } from './types'

const ALL = '__all__'
const NONE = '__none__'
const NEW_CATEGORY = '__new__'

export function Products() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [formats, setFormats] = useState<FormatCost[]>([])
  const [margins, setMargins] = useState<PriceMargin[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>(ALL)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!company) return
    const [p, c, f, m] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', company.id).order('name'),
      supabase.from('product_categories').select('id, name').eq('company_id', company.id).order('name'),
      supabase.from('product_format_costs').select('*').eq('company_id', company.id).order('sort_order'),
      supabase.from('product_price_margins').select('*').eq('company_id', company.id),
    ])
    const err = p.error ?? c.error ?? f.error ?? m.error
    if (err) toast(friendlyError(err), 'error')
    setProducts((p.data ?? []) as Product[])
    setCategories((c.data ?? []) as ProductCategory[])
    setFormats((f.data ?? []) as FormatCost[])
    setMargins((m.data ?? []) as PriceMargin[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const formatsOf = useMemo(() => {
    const map = new Map<string, FormatCost[]>()
    for (const f of formats) {
      if (!f.active) continue
      const list = map.get(f.product_id) ?? []
      list.push(f)
      map.set(f.product_id, list)
    }
    return map
  }, [formats])

  const pricesOf = useMemo(() => {
    const map = new Map<string, PriceMargin[]>()
    for (const m of margins) {
      if (!m.active) continue
      const list = map.get(m.format_id) ?? []
      list.push(m)
      map.set(m.format_id, list)
    }
    return map
  }, [margins])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of products) {
      if (!showInactive && !p.active) continue
      const k = p.category_id ?? NONE
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [products, showInactive])

  const hasUncategorized = (counts.get(NONE) ?? 0) > 0
  const q = query.trim().toLowerCase()
  const visible = products.filter(
    (p) =>
      (showInactive || p.active) &&
      (tab === ALL || (tab === NONE ? p.category_id === null : p.category_id === tab)) &&
      p.name.toLowerCase().includes(q),
  )
  const total = products.filter((p) => showInactive || p.active).length

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Produtos</h1>
          <p className="sub">Cada produto tem seus formatos, custo por unidade e preços com a margem ao vivo.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          Novo produto
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Famílias de produtos">
        <button role="tab" aria-selected={tab === ALL} className={`tab ${tab === ALL ? 'on' : ''}`} onClick={() => setTab(ALL)}>
          Todos <small>{total}</small>
        </button>
        {categories
          .filter((c) => (counts.get(c.id) ?? 0) > 0 || tab === c.id)
          .map((c) => (
          <button key={c.id} role="tab" aria-selected={tab === c.id} className={`tab ${tab === c.id ? 'on' : ''}`} onClick={() => setTab(c.id)}>
            {c.name} <small>{counts.get(c.id) ?? 0}</small>
          </button>
        ))}
        {hasUncategorized && (
          <button role="tab" aria-selected={tab === NONE} className={`tab ${tab === NONE ? 'on' : ''}`} onClick={() => setTab(NONE)}>
            Sem família <small>{counts.get(NONE)}</small>
          </button>
        )}
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Buscar produto" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar produto" />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {products.length === 0
            ? 'Nenhum produto ainda. Crie o primeiro e monte o custo a partir das receitas e ingredientes.'
            : 'Nenhum produto encontrado.'}
        </p>
      ) : (
        <div className="cards">
          {visible.map((p) => {
            const fs = formatsOf.get(p.id) ?? []
            const cat = categories.find((c) => c.id === p.category_id)
            return (
              <article key={p.id} className={`card ${p.active ? '' : 'row-off'}`}>
                <header className="card-head">
                  <button className="row-link card-title" onClick={() => navigate(`/produtos/${p.id}`)}>
                    {p.name}
                  </button>
                  {cat && <span className="chip">{cat.name}</span>}
                  {!p.active && <span className="chip">inativo</span>}
                </header>

                {fs.length === 0 ? (
                  <p className="muted small">Sem formato. Abra o produto para definir o rendimento.</p>
                ) : (
                  <ul className="card-formats">
                    {fs.map((f) => {
                      const prices = pricesOf.get(f.format_id) ?? []
                      return (
                        <li key={f.format_id}>
                          <div className="cf-head">
                            <strong>{f.format_name}</strong>
                            <span className="muted small">rende {num(f.units_per_batch)}</span>
                            <span className="cf-cost">custo {moneyAuto(f.cost_total)}</span>
                          </div>
                          {prices.length === 0 ? (
                            <p className="muted small">Sem preço definido.</p>
                          ) : (
                            <div className="cf-prices">
                              {prices.map((m) => {
                                const margin = m.unit_price > 0 ? m.profit / m.unit_price : null
                                return (
                                  <span key={m.price_id} className={`pill tone-${marginTone(margin)}`} title={`${m.price_name}: ${moneyAuto(m.price)}${m.bundle_size > 1 ? ` por ${num(m.bundle_size)} un` : ''}`}>
                                    <span>{m.price_name}</span>
                                    <b>{moneyAuto(m.price)}</b>
                                    <i>{pct(margin)}</i>
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      )}

      <NewProductDialog
        key={creating ? 'open' : 'closed'}
        open={creating}
        categories={categories}
        defaultCategory={tab !== ALL && tab !== NONE ? tab : ''}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/produtos/${id}`)}
      />
    </>
  )
}

function NewProductDialog({
  open,
  categories,
  defaultCategory,
  onClose,
  onCreated,
}: {
  open: boolean
  categories: ProductCategory[]
  defaultCategory: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { company } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(defaultCategory)
  const [newCategory, setNewCategory] = useState('')
  const [formatName, setFormatName] = useState('Padrão')
  const [yieldQty, setYieldQty] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    const y = parseNum(yieldQty)
    if (!(y > 0)) return toast('Informe quantas unidades rende uma tanda.', 'error')
    setBusy(true)
    try {
      let catId: string | null = categoryId || null
      if (categoryId === NEW_CATEGORY) {
        const { data, error } = await supabase
          .from('product_categories')
          .insert({ company_id: company.id, name: newCategory.trim() })
          .select('id')
          .single()
        if (error) throw error
        catId = data.id as string
      }
      const { data: prod, error: pe } = await supabase
        .from('products')
        .insert({ company_id: company.id, name: name.trim(), category_id: catId })
        .select('id')
        .single()
      if (pe) throw pe
      const { error: fe } = await supabase.from('product_formats').insert({
        company_id: company.id,
        product_id: prod.id,
        name: formatName.trim() || 'Padrão',
        units_per_batch: y,
      })
      if (fe) throw fe
      onCreated(prod.id as string)
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Novo produto">
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="np-name">Nome do produto</label>
          <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex.: Brigadeiro tradicional" />
        </div>
        <div className="field">
          <label htmlFor="np-cat">Família</label>
          <select id="np-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem família</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ Nova família…</option>
          </select>
        </div>
        {categoryId === NEW_CATEGORY && (
          <div className="field">
            <label htmlFor="np-newcat">Nome da nova família</label>
            <input id="np-newcat" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} required placeholder="Ex.: Brigadeiros" />
          </div>
        )}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="np-fmt">Formato</label>
            <input id="np-fmt" value={formatName} onChange={(e) => setFormatName(e.target.value)} placeholder="Ex.: 18g" />
          </div>
          <div className="field">
            <label htmlFor="np-yield">Rende (unidades por tanda)</label>
            <input id="np-yield" inputMode="decimal" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} required placeholder="Ex.: 40" />
          </div>
        </div>
        <p className="hint">O rendimento fica só aqui, no produto. Outros formatos (ex.: 13g) você adiciona depois.</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Criando…' : 'Criar produto'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
