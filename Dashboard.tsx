import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { brl, formatQty, num } from './format'
import { pct } from './pricing'
import type { BaseUnit } from './types'

type Totals = {
  total_sales: number
  total_profit: number
  orders_count: number
  open_quotes: number
  closed_quotes: number
  month_sales: number
  month_profit: number
  stock_value: number
}
type Low = { id: string; name: string; unit: BaseUnit; current_stock: number; minimum_stock: number }
type Top = { product_id: string; name: string; quantity_sold: number; revenue: number }

export function Dashboard() {
  const { company } = useAuth()
  const [totals, setTotals] = useState<Totals | null>(null)
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
        supabase.rpc('dashboard_totals', { p_company_id: company.id }),
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
      const row = (s.data as Totals[] | null)?.[0]
      setTotals(row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])) as Totals : null)
      setLow((l.data ?? []) as Low[])
      setTop((t.data ?? []) as Top[])
      setIngredientCount(c.count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [company])

  const sales = totals?.total_sales ?? 0
  const profit = totals?.total_profit ?? 0
  const orders = totals?.orders_count ?? 0

  return (
    <>
      <header className="page-head hero">
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

      <section className="kpis" aria-label="Resumo do negócio">
        <article className="kpi t-sun big">
          <span className="kpi-icon" aria-hidden="true">$</span>
          <span className="kpi-label">Faturamento total</span>
          <strong>{brl(sales)}</strong>
          <small>{orders > 0 ? `ticket médio ${brl(sales / orders)}` : 'soma dos pedidos'}</small>
        </article>
        <article className="kpi t-mint big">
          <span className="kpi-icon" aria-hidden="true">↗</span>
          <span className="kpi-label">Lucro total</span>
          <strong>{brl(profit)}</strong>
          <small>{sales > 0 ? `margem de ${pct(profit / sales)}` : 'lucro dos pedidos'}</small>
        </article>
        <article className="kpi t-sky">
          <span className="kpi-icon" aria-hidden="true">✎</span>
          <span className="kpi-label">Orçamentos abertos</span>
          <strong>{num(totals?.open_quotes ?? 0)}</strong>
          <small>aguardando resposta</small>
        </article>
        <article className="kpi t-rose">
          <span className="kpi-icon" aria-hidden="true">✓</span>
          <span className="kpi-label">Orçamentos fechados</span>
          <strong>{num(totals?.closed_quotes ?? 0)}</strong>
          <small>aprovados, viraram pedido</small>
        </article>
        <article className="kpi t-lilac">
          <span className="kpi-icon" aria-hidden="true">▤</span>
          <span className="kpi-label">Quantidade de pedidos</span>
          <strong>{num(orders)}</strong>
          <small>sem contar os cancelados</small>
        </article>
      </section>

      <p className="month-strip" aria-label="Este mês">
        <span>
          Este mês <b>{brl(totals?.month_sales)}</b> em vendas
        </span>
        <span>
          lucro <b>{brl(totals?.month_profit)}</b>
        </span>
        <span>
          estoque <b>{brl(totals?.stock_value)}</b>
        </span>
      </p>

      <div className="two-col">
        <section className="panel tint-rose">
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

        <section className="panel tint-sky">
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
