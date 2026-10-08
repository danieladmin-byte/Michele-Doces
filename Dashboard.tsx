import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { brl, formatQty, num } from './format'
import type { BaseUnit } from './types'

type Summary = { month_sales: number; estimated_profit: number; open_quotes: number; stock_value: number }
type Low = { id: string; name: string; unit: BaseUnit; current_stock: number; minimum_stock: number }
type Top = { product_id: string; name: string; quantity_sold: number; revenue: number }

export function Dashboard() {
  const { company } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [low, setLow] = useState<Low[]>([])
  const [top, setTop] = useState<Top[]>([])
  const [ingredientCount, setIngredientCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [s, l, t, c] = await Promise.all([
        supabase.rpc('dashboard_summary', { p_company_id: company.id }),
        supabase.from('low_stock_ingredients').select('*').eq('company_id', company.id).order('name').limit(8),
        supabase
          .from('top_selling_products')
          .select('*')
          .eq('company_id', company.id)
          .order('quantity_sold', { ascending: false })
          .limit(5),
        supabase.from('ingredients').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ])
      if (cancelled) return
      const row = (s.data as Summary[] | null)?.[0]
      setSummary(row ?? null)
      setLow((l.data ?? []) as Low[])
      setTop((t.data ?? []) as Top[])
      setIngredientCount(c.count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [company])

  return (
    <>
      <header className="page-head">
        <h1>Início</h1>
        <p className="sub">{company?.name}</p>
      </header>

      {!loading && ingredientCount === 0 && (
        <section className="empty-block">
          <h2>Comece pelos ingredientes</h2>
          <p>
            Cadastre o que você usa e registre a primeira compra: o sistema calcula sozinho o custo médio de cada
            ingrediente.
          </p>
          <div className="row-actions">
            <Link to="/ingredientes" className="btn btn-primary">
              Cadastrar ingredientes
            </Link>
            <Link to="/compras/nova" className="btn">
              Registrar compra
            </Link>
          </div>
        </section>
      )}

      <section className="figures" aria-label="Resumo do mês">
        <div className="figure">
          <span className="figure-label">Vendas do mês</span>
          <strong>{brl(summary?.month_sales)}</strong>
        </div>
        <div className="figure">
          <span className="figure-label">Lucro estimado</span>
          <strong>{brl(summary?.estimated_profit)}</strong>
        </div>
        <div className="figure">
          <span className="figure-label">Orçamentos abertos</span>
          <strong>{num(Number(summary?.open_quotes ?? 0))}</strong>
        </div>
        <div className="figure">
          <span className="figure-label">Valor em estoque</span>
          <strong>{brl(summary?.stock_value)}</strong>
        </div>
      </section>

      <div className="two-col">
        <section>
          <h2 className="section-title">Estoque baixo</h2>
          {low.length === 0 ? (
            <p className="muted">Nenhum ingrediente abaixo do mínimo. Defina o estoque mínimo em cada ingrediente para ser avisado.</p>
          ) : (
            <ul className="plain-list">
              {low.map((i) => (
                <li key={i.id}>
                  <span>{i.name}</span>
                  <span className="warn">
                    {formatQty(i.current_stock, i.unit)} <small>(mín. {formatQty(i.minimum_stock, i.unit)})</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="section-title">Mais vendidos</h2>
          {top.length === 0 ? (
            <p className="muted">Os produtos mais vendidos aparecem aqui quando houver pedidos aprovados.</p>
          ) : (
            <ul className="plain-list">
              {top.map((p) => (
                <li key={p.product_id}>
                  <span>{p.name}</span>
                  <span>
                    {num(p.quantity_sold)} un · {brl(p.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
