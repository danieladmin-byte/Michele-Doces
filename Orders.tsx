import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { brl, formatDate } from './format'
import { pct } from './pricing'
import { ORDER_STATUS } from './docs'
import type { Customer, Order, OrderStatus } from './types'

export function Orders() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'OPEN' | 'ALL' | OrderStatus>('OPEN')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    if (!company) return
    const [o, c] = await Promise.all([
      supabase.from('orders').select('*').eq('company_id', company.id).order('number', { ascending: false }),
      supabase.from('customers').select('*').eq('company_id', company.id),
    ])
    const err = o.error ?? c.error
    if (err) toast(friendlyError(err), 'error')
    setOrders((o.data ?? []) as Order[])
    setCustomers((c.data ?? []) as Customer[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])
  const q = query.trim().toLowerCase()
  const visible = orders.filter((o) => {
    if (status === 'OPEN' && (o.status === 'DELIVERED' || o.status === 'CANCELLED')) return false
    if (status !== 'OPEN' && status !== 'ALL' && o.status !== status) return false
    if (!q) return true
    const who = (o.customer_id && customerName.get(o.customer_id)) || ''
    return who.toLowerCase().includes(q) || (o.event_name ?? '').toLowerCase().includes(q) || String(o.number) === q
  })

  return (
    <>
      <header className="page-head">
        <h1>Pedidos</h1>
        <p className="sub">Nascem quando você aprova um orçamento. Daqui sai a fatura em PDF.</p>
      </header>

      <div className="toolbar">
        <input type="search" placeholder="Buscar por cliente, evento ou número" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar pedido" />
        <select value={status} onChange={(e) => setStatus(e.target.value as 'OPEN' | 'ALL' | OrderStatus)} aria-label="Filtrar por situação">
          <option value="OPEN">Em andamento</option>
          <option value="ALL">Todos</option>
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS[s].label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">{orders.length === 0 ? 'Nenhum pedido ainda. Aprove um orçamento para criar o primeiro.' : 'Nenhum pedido encontrado.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Entrega</th>
                <th className="num">Total</th>
                <th className="num">Margem</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const st = ORDER_STATUS[o.status]
                return (
                  <tr key={o.id} onClick={() => navigate(`/pedidos/${o.id}`)}>
                    <td data-label="Nº">
                      <button className="row-link" onClick={() => navigate(`/pedidos/${o.id}`)}>
                        #{String(o.number).padStart(2, '0')}
                      </button>
                    </td>
                    <td data-label="Cliente">
                      {(o.customer_id && customerName.get(o.customer_id)) || '—'}
                      {o.event_name && <small className="tag"> {o.event_name}</small>}
                    </td>
                    <td data-label="Entrega">{o.event_date ? formatDate(o.event_date) : '—'}</td>
                    <td data-label="Total" className="num strong">{brl(o.total)}</td>
                    <td data-label="Margem" className="num">{pct(Number(o.margin) / 100)}</td>
                    <td data-label="Situação">
                      <span className={`pill-status tone-${st.tone}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
