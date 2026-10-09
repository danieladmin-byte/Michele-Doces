import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { brl, formatDate } from './format'
import { pct } from './pricing'
import { QUOTE_STATUS } from './docs'
import type { Customer, Quote, QuoteStatus } from './types'

export function Quotes() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'ALL' | QuoteStatus>('ALL')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    if (!company) return
    const [q, c] = await Promise.all([
      supabase.from('quotes').select('*').eq('company_id', company.id).order('number', { ascending: false }),
      supabase.from('customers').select('*').eq('company_id', company.id),
    ])
    const err = q.error ?? c.error
    if (err) toast(friendlyError(err), 'error')
    setQuotes((q.data ?? []) as Quote[])
    setCustomers((c.data ?? []) as Customer[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])
  const q = query.trim().toLowerCase()
  const visible = quotes.filter((x) => {
    if (status !== 'ALL' && x.status !== status) return false
    if (!q) return true
    const who = (x.customer_id && customerName.get(x.customer_id)) || ''
    return who.toLowerCase().includes(q) || (x.event_name ?? '').toLowerCase().includes(q) || String(x.number) === q
  })

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Orçamentos</h1>
          <p className="sub">Monte o orçamento, veja o lucro na hora e baixe o PDF para enviar ao cliente.</p>
        </div>
        <Link className="btn btn-primary" to="/orcamentos/novo">
          Novo orçamento
        </Link>
      </header>

      <div className="toolbar">
        <input type="search" placeholder="Buscar por cliente, evento ou número" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar orçamento" />
        <select value={status} onChange={(e) => setStatus(e.target.value as 'ALL' | QuoteStatus)} aria-label="Filtrar por situação">
          <option value="ALL">Todas as situações</option>
          {(Object.keys(QUOTE_STATUS) as QuoteStatus[]).map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS[s].label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">{quotes.length === 0 ? 'Nenhum orçamento ainda. Crie o primeiro.' : 'Nenhum orçamento encontrado.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Data</th>
                <th className="num">Total</th>
                <th className="num">Margem</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => {
                const st = QUOTE_STATUS[x.status]
                return (
                  <tr key={x.id} onClick={() => navigate(`/orcamentos/${x.id}`)}>
                    <td data-label="Nº">
                      <button className="row-link" onClick={() => navigate(`/orcamentos/${x.id}`)}>
                        #{String(x.number).padStart(2, '0')}
                      </button>
                    </td>
                    <td data-label="Cliente">
                      {(x.customer_id && customerName.get(x.customer_id)) || '—'}
                      {x.event_name && <small className="tag"> {x.event_name}</small>}
                    </td>
                    <td data-label="Data">{formatDate(x.issue_date)}</td>
                    <td data-label="Total" className="num strong">{brl(x.total)}</td>
                    <td data-label="Margem" className="num">{pct(Number(x.margin) / 100)}</td>
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
