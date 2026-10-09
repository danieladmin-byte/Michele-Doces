import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { moneyAuto } from './format'
import { marginTone, pct } from './pricing'
import { ProductThumb } from './ProductThumb'
import type { FormatCost, PriceMargin, ProductCategory } from './types'

/** Tabela de preços: uma linha por produto/formato, uma coluna por tipo de preço. */
export function PriceTable() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [formats, setFormats] = useState<FormatCost[]>([])
  const [margins, setMargins] = useState<PriceMargin[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [cento, setCento] = useState(false)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    if (!company) return
    const [f, m, c, pp] = await Promise.all([
      supabase.from('product_format_costs').select('*').eq('company_id', company.id).order('sort_order'),
      supabase.from('product_price_margins').select('*').eq('company_id', company.id),
      supabase.from('product_categories').select('id, name').eq('company_id', company.id).order('name'),
      supabase.from('products').select('id, image_path').eq('company_id', company.id),
    ])
    const err = f.error ?? m.error ?? c.error
    if (err) toast(friendlyError(err), 'error')
    setFormats(((f.data ?? []) as FormatCost[]).filter((x) => x.active && x.product_active))
    setMargins(((m.data ?? []) as PriceMargin[]).filter((x) => x.active))
    setCategories((c.data ?? []) as ProductCategory[])
    setPhotos(new Map(((pp.data ?? []) as { id: string; image_path: string | null }[]).map((x) => [x.id, x.image_path])))
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const priceNames = useMemo(() => {
    const count = new Map<string, number>()
    for (const m of margins) count.set(m.price_name, (count.get(m.price_name) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([n]) => n)
  }, [margins])

  const cell = useMemo(() => {
    const map = new Map<string, PriceMargin>()
    for (const m of margins) map.set(`${m.format_id}|${m.price_name}`, m)
    return map
  }, [margins])

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const list = formats.filter((f) => f.product_name.toLowerCase().includes(q))
    const out: { id: string; name: string; rows: FormatCost[] }[] = categories
      .map((c) => ({ id: c.id, name: c.name, rows: list.filter((f) => f.category_id === c.id) }))
      .filter((g) => g.rows.length > 0)
    const rest = list.filter((f) => !f.category_id || !categories.some((c) => c.id === f.category_id))
    if (rest.length > 0) out.push({ id: 'none', name: 'Sem família', rows: rest })
    for (const g of out) g.rows.sort((a, b) => a.product_name.localeCompare(b.product_name, 'pt-BR') || a.sort_order - b.sort_order)
    return out
  }, [formats, categories, q])

  const mult = cento ? 100 : 1

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Tabela de preços</h1>
          <p className="sub">Todos os produtos lado a lado, com a margem de cada preço. Clique numa linha para ajustar.</p>
        </div>
        <div className="seg" role="group" aria-label="Unidade de exibição">
          <button className={`seg-btn ${!cento ? 'on' : ''}`} aria-pressed={!cento} onClick={() => setCento(false)}>
            Por unidade
          </button>
          <button className={`seg-btn ${cento ? 'on' : ''}`} aria-pressed={cento} onClick={() => setCento(true)}>
            Por cento
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input type="search" placeholder="Buscar produto" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar produto" />
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : groups.length === 0 ? (
        <p className="muted">Nenhum produto com formato ainda.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="pt-group">
            <h2 className="section-title">{g.name}</h2>
            <div className="table-wrap">
              <table className="table pt-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Custo</th>
                    {priceNames.map((n) => (
                      <th key={n} className="num">{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((f) => (
                    <tr key={f.format_id} onClick={() => navigate(`/produtos/${f.product_id}`)}>
                      <td data-label="Produto">
                        <span className="pt-name">
                          <ProductThumb name={f.product_name} path={photos.get(f.product_id)} size="sm" />
                          <button className="row-link" onClick={() => navigate(`/produtos/${f.product_id}`)}>
                            {f.product_name}
                          </button>{' '}
                          <small className="tag">{f.format_name}</small>
                        </span>
                      </td>
                      <td data-label="Custo" className="num">{moneyAuto(f.cost_total * mult)}</td>
                      {priceNames.map((n) => {
                        const m = cell.get(`${f.format_id}|${n}`)
                        if (!m) return <td key={n} data-label={n} className="num muted">—</td>
                        const margin = m.unit_price > 0 ? m.profit / m.unit_price : null
                        return (
                          <td key={n} data-label={n} className="num">
                            <span className="pt-price">{moneyAuto(m.unit_price * mult)}</span>
                            <span className={`pt-margin tone-${marginTone(margin)}`}>{pct(margin)}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  )
}
