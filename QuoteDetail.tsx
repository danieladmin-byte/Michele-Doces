import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { brl, formatDate, num } from './format'
import { marginTone, pct } from './pricing'
import { QUOTE_STATUS, pdfDataFor, pdfFileName } from './docs'
import { downloadPdf } from './pdf'
import type { Customer, DocItem, Quote, QuoteStatus } from './types'

export function QuoteDetail() {
  const { id } = useParams()
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [items, setItems] = useState<DocItem[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [q, it, o] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', id).maybeSingle(),
      supabase.from('quote_items').select('*').eq('quote_id', id).order('created_at'),
      supabase.from('orders').select('id').eq('quote_id', id).maybeSingle(),
    ])
    const qq = (q.data ?? null) as Quote | null
    setQuote(qq)
    setItems((it.data ?? []) as DocItem[])
    setOrderId((o.data as { id: string } | null)?.id ?? null)
    if (qq?.customer_id) {
      const { data } = await supabase.from('customers').select('*').eq('id', qq.customer_id).maybeSingle()
      setCustomer((data ?? null) as Customer | null)
    } else setCustomer(null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(s: QuoteStatus, confirmText?: string) {
    if (!quote) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    const { error } = await supabase.rpc('set_quote_status', { p_quote_id: quote.id, p_status: s })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(`Orçamento: ${QUOTE_STATUS[s].label.toLowerCase()}`)
    await load()
  }

  async function approve() {
    if (!quote) return
    if (!window.confirm('Aprovar este orçamento e criar o pedido? Os valores ficam congelados no pedido.')) return
    setBusy(true)
    const { data, error } = await supabase.rpc('approve_quote', { p_quote_id: quote.id })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Orçamento aprovado. Pedido criado.')
    navigate(`/pedidos/${data as string}`)
  }

  async function remove() {
    if (!quote) return
    if (!window.confirm(`Excluir o orçamento #${String(quote.number).padStart(2, '0')} para sempre? Isso não pode ser desfeito.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('delete_quote', { p_quote_id: quote.id })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Orçamento excluído')
    navigate('/orcamentos')
  }

  async function pdf() {
    if (!quote || !company) return
    setPdfBusy(true)
    try {
      await downloadPdf(pdfDataFor('ORCAMENTO', company, customer, quote, items), pdfFileName('ORCAMENTO', quote.number, customer))
    } catch (err) {
      toast(`Não consegui gerar o PDF. ${friendlyError(err)}`, 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) return <p className="muted">Carregando…</p>
  if (!quote)
    return (
      <>
        <Link to="/orcamentos" className="back">← Orçamentos</Link>
        <p className="muted">Orçamento não encontrado.</p>
      </>
    )

  const st = QUOTE_STATUS[quote.status]
  const open = quote.status === 'DRAFT' || quote.status === 'SENT'
  const margin = Number(quote.total) > 0 ? Number(quote.profit) / Number(quote.total) : null

  return (
    <>
      <header className="page-head with-action">
        <div>
          <Link to="/orcamentos" className="back">← Orçamentos</Link>
          <h1>
            Orçamento #{String(quote.number).padStart(2, '0')} <span className={`pill-status tone-${st.tone}`}>{st.label}</span>
          </h1>
          <p className="sub">
            {customer ? `Cliente: ${customer.name}` : 'Sem cliente'}
            {quote.event_name ? ` · ${quote.event_name}` : ''}
          </p>
        </div>
        <div className="block-add">
          <button className="btn btn-primary" disabled={pdfBusy} onClick={() => void pdf()}>
            {pdfBusy ? 'Gerando PDF…' : 'Baixar PDF'}
          </button>
          {quote.status === 'DRAFT' && (
            <Link className="btn" to={`/orcamentos/${quote.id}/editar`}>
              Editar
            </Link>
          )}
        </div>
      </header>

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
          <div><dt>Subtotal</dt><dd>{brl(quote.subtotal)}</dd></div>
          {Number(quote.discount) > 0 && <div><dt>Desconto</dt><dd>− {brl(quote.discount)}</dd></div>}
          {Number(quote.shipping) > 0 && <div><dt>Frete</dt><dd>{brl(quote.shipping)}</dd></div>}
          <div className="doc-grand"><dt>Total</dt><dd>{brl(quote.total)}</dd></div>
        </dl>
        <p className="muted small">
          Emitido em {formatDate(quote.issue_date)}
          {quote.valid_until ? ` · válido até ${formatDate(quote.valid_until)}` : ''}
          {quote.event_date ? ` · evento em ${formatDate(quote.event_date)}` : ''}
        </p>
      </section>

      <section className={`panel internal tone-${marginTone(margin)}`}>
        <h2 className="section-title">Só você vê isto</h2>
        <div className="summary-strip" aria-label="Números internos">
          <div><span>Seu custo</span><strong>{brl(quote.internal_cost)}</strong></div>
          <div><span>Lucro</span><strong>{brl(quote.profit)}</strong></div>
          <div><span>Margem</span><strong>{pct(margin)}</strong></div>
          <div><span>Total do cliente</span><strong>{brl(quote.total)}</strong></div>
        </div>
        {quote.notes && <p className="notes-box">{quote.notes}</p>}
        <p className="hint">O custo e o preço ficam guardados como estavam hoje: mudar a tabela de preços depois não altera este orçamento.</p>
      </section>

      <section className="panel">
        <h2 className="section-title">Próximo passo</h2>
        {orderId ? (
          <Link className="btn btn-primary" to={`/pedidos/${orderId}`}>
            Ver o pedido
          </Link>
        ) : open ? (
          <div className="block-add">
            {quote.status === 'DRAFT' && (
              <button className="btn" disabled={busy} onClick={() => void setStatus('SENT')}>
                Marcar como enviado
              </button>
            )}
            <button className="btn btn-primary" disabled={busy} onClick={() => void approve()}>
              Cliente aprovou: criar pedido
            </button>
            <button className="btn" disabled={busy} onClick={() => void setStatus('REJECTED', 'Marcar este orçamento como recusado?')}>
              Cliente recusou
            </button>
            <button className="btn" disabled={busy} onClick={() => void setStatus('CANCELLED', 'Cancelar este orçamento?')}>
              Cancelar
            </button>
          </div>
        ) : (
          <p className="muted">Este orçamento está {st.label.toLowerCase()}.</p>
        )}
        {!orderId && (
          <div className="block-add" style={{ marginTop: 14 }}>
            <button className="btn btn-danger" disabled={busy} onClick={() => void remove()}>
              Excluir orçamento
            </button>
          </div>
        )}
      </section>
    </>
  )
}
