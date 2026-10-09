import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { brl, formatDate, num } from './format'
import { marginTone, pct } from './pricing'
import { ORDER_STATUS, pdfDataFor, pdfFileName } from './docs'
import { downloadPdf } from './pdf'
import type { Customer, DocItem, Order, OrderStatus } from './types'

export function OrderDetail() {
  const { id } = useParams()
  const { company } = useAuth()
  const toast = useToast()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<DocItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [eventDate, setEventDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [o, it] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
    ])
    const oo = (o.data ?? null) as Order | null
    setOrder(oo)
    setItems((it.data ?? []) as DocItem[])
    if (oo) {
      setEventDate(oo.event_date ?? '')
      setNotes(oo.notes ?? '')
    }
    if (oo?.customer_id) {
      const { data } = await supabase.from('customers').select('*').eq('id', oo.customer_id).maybeSingle()
      setCustomer((data ?? null) as Customer | null)
    } else setCustomer(null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function changeStatus(s: OrderStatus) {
    if (!order) return
    if (s === 'CANCELLED' && !window.confirm('Cancelar este pedido?')) return
    const { error } = await supabase.from('orders').update({ status: s }).eq('id', order.id)
    if (error) return toast(friendlyError(error), 'error')
    toast(`Pedido: ${ORDER_STATUS[s].label.toLowerCase()}`)
    await load()
  }

  async function saveInfo() {
    if (!order) return
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ event_date: eventDate || null, notes: notes.trim() || null })
      .eq('id', order.id)
    setSaving(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Pedido atualizado')
    await load()
  }

  async function pdf() {
    if (!order || !company) return
    setPdfBusy(true)
    try {
      await downloadPdf(
        pdfDataFor('FATURA', company, customer, { ...order, issue_date: order.created_at.slice(0, 10) }, items),
        pdfFileName('FATURA', order.number, customer),
      )
    } catch (err) {
      toast(`Não consegui gerar o PDF. ${friendlyError(err)}`, 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) return <p className="muted">Carregando…</p>
  if (!order)
    return (
      <>
        <Link to="/pedidos" className="back">← Pedidos</Link>
        <p className="muted">Pedido não encontrado.</p>
      </>
    )

  const st = ORDER_STATUS[order.status]
  const margin = Number(order.total) > 0 ? Number(order.profit) / Number(order.total) : null
  const flow: OrderStatus[] = ['PENDING', 'IN_PRODUCTION', 'READY', 'DELIVERED']

  return (
    <>
      <header className="page-head with-action">
        <div>
          <Link to="/pedidos" className="back">← Pedidos</Link>
          <h1>
            Pedido #{String(order.number).padStart(2, '0')} <span className={`pill-status tone-${st.tone}`}>{st.label}</span>
          </h1>
          <p className="sub">
            {customer ? `Cliente: ${customer.name}` : 'Sem cliente'}
            {order.event_name ? ` · ${order.event_name}` : ''}
          </p>
        </div>
        <div className="block-add">
          <button className="btn btn-primary" disabled={pdfBusy} onClick={() => void pdf()}>
            {pdfBusy ? 'Gerando PDF…' : 'Baixar fatura (PDF)'}
          </button>
          {order.quote_id && (
            <Link className="btn" to={`/orcamentos/${order.quote_id}`}>
              Ver orçamento
            </Link>
          )}
        </div>
      </header>

      <div className="tabs" role="group" aria-label="Situação do pedido">
        {flow.map((s) => (
          <button key={s} className={`tab ${order.status === s ? 'on' : ''}`} aria-pressed={order.status === s} onClick={() => void changeStatus(s)}>
            {ORDER_STATUS[s].label}
          </button>
        ))}
        <button className={`tab tab-add ${order.status === 'CANCELLED' ? 'on' : ''}`} onClick={() => void changeStatus('CANCELLED')}>
          Cancelar pedido
        </button>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="table static">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Quant.</th>
                <th className="num">Valor</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td data-label="Produto">{i.description}</td>
                  <td data-label="Quant." className="num">{num(Number(i.quantity))}</td>
                  <td data-label="Valor" className="num">{brl(i.unit_price)}</td>
                  <td data-label="Total" className="num strong">{brl(i.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="doc-totals">
          <div><dt>Subtotal</dt><dd>{brl(order.subtotal)}</dd></div>
          {Number(order.discount) > 0 && <div><dt>Desconto</dt><dd>− {brl(order.discount)}</dd></div>}
          {Number(order.shipping) > 0 && <div><dt>Frete</dt><dd>{brl(order.shipping)}</dd></div>}
          <div className="doc-grand"><dt>Total</dt><dd>{brl(order.total)}</dd></div>
        </dl>
        <p className="muted small">Aprovado em {formatDate(order.created_at)}</p>
      </section>

      <section className={`panel internal tone-${marginTone(margin)}`}>
        <h2 className="section-title">Só você vê isto</h2>
        <div className="summary-strip" aria-label="Números internos">
          <div><span>Seu custo</span><strong>{brl(order.internal_cost)}</strong></div>
          <div><span>Lucro</span><strong>{brl(order.profit)}</strong></div>
          <div><span>Margem</span><strong>{pct(margin)}</strong></div>
          <div><span>Total do cliente</span><strong>{brl(order.total)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Entrega e anotações</h2>
        <div className="form form-wide">
          <div className="field">
            <label htmlFor="o-date">Data da entrega / evento</label>
            <input id="o-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="o-notes">Anotações</label>
            <textarea id="o-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="dialog-actions">
            <button className="btn btn-primary" disabled={saving} onClick={() => void saveInfo()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
