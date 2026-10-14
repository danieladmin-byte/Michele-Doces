import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { CustomerDialog } from './Customers'
import { friendlyError } from './errors'
import { dec, moneyAuto, parseNum, todayISO } from './format'
import { marginTone, pct } from './pricing'
import { ProductThumb } from './ProductThumb'
import { PaymentTermsField, usePaymentMethods } from './PaymentTerms'
import { useKitData } from './kitData'
import { useCatalogData } from './catalogData'
import { PhotoPicker } from './PhotoPicker'
import { productImageUrl } from './images'
import type { Customer, DocItem, FormatCost, Product, ProductCategory, ProductPrice, Quote } from './types'

const NEW_CUSTOMER = '__new__'
const CUSTOM = '__custom__'

type Line = {
  key: string
  kind: 'product' | 'free' | 'kit'
  kitId: string
  imagePath: string
  productId: string
  formatId: string
  priceId: string
  bundle: number
  description: string
  qty: string
  unit: string
  freeCost: string
}

let seq = 0
const newKey = () => `l${++seq}`
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function QuoteEditor() {
  const { id } = useParams()
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [formats, setFormats] = useState<FormatCost[]>([])
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [number, setNumber] = useState<number | null>(null)

  const [customerId, setCustomerId] = useState('')
  const [eventName, setEventName] = useState('')
  const [issueDate, setIssueDate] = useState(todayISO())
  const [validUntil, setValidUntil] = useState(addDays(todayISO(), 7))
  const [eventDate, setEventDate] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('')
  const [shipping, setShipping] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [newCustomer, setNewCustomer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [payTerms, setPayTerms] = useState('')
  const [showUnit, setShowUnit] = useState(true)
  const [payTouched, setPayTouched] = useState(false)
  const pay = usePaymentMethods()
  const kd = useKitData()
  const cat = useCatalogData()
  const [pickerFor, setPickerFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!company) return
    const [c, p, cat, f, pr] = await Promise.all([
      supabase.from('customers').select('*').eq('company_id', company.id).order('name'),
      supabase.from('products').select('*').eq('company_id', company.id).eq('active', true).order('name'),
      supabase.from('product_categories').select('id, name').eq('company_id', company.id).order('name'),
      supabase.from('product_format_costs').select('*').eq('company_id', company.id).order('sort_order'),
      supabase.from('product_prices').select('*').eq('company_id', company.id).eq('active', true).order('created_at'),
    ])
    const err = c.error ?? p.error ?? cat.error ?? f.error ?? pr.error
    if (err) toast(friendlyError(err), 'error')
    const fmts = ((f.data ?? []) as FormatCost[]).filter((x) => x.active)
    const prs = (pr.data ?? []) as ProductPrice[]
    setCustomers((c.data ?? []) as Customer[])
    setProducts((p.data ?? []) as Product[])
    setCategories((cat.data ?? []) as ProductCategory[])
    setFormats(fmts)
    setPrices(prs)

    if (id) {
      const [q, it] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', id).maybeSingle(),
        supabase.from('quote_items').select('*').eq('quote_id', id).order('created_at'),
      ])
      const quote = q.data as Quote | null
      if (!quote) setBlocked('Orçamento não encontrado.')
      else if (quote.status !== 'DRAFT') setBlocked('Só dá para editar orçamentos em rascunho.')
      else {
        setNumber(quote.number)
        setCustomerId(quote.customer_id ?? '')
        setEventName(quote.event_name ?? '')
        setIssueDate(quote.issue_date)
        setValidUntil(quote.valid_until ?? '')
        setEventDate(quote.event_date ?? '')
        setNotes(quote.notes ?? '')
        setDiscount(Number(quote.discount) ? dec(Number(quote.discount)) : '')
        setShipping(Number(quote.shipping) ? dec(Number(quote.shipping)) : '')
        if (quote.payment_terms) {
          setPayTerms(quote.payment_terms)
          setPayTouched(true)
        }
        setShowUnit(quote.show_unit_price !== false)
        setLines(
          ((it.data ?? []) as DocItem[]).map((x): Line => {
            if (x.product_id && x.format_id) {
              const fc = fmts.find((y) => y.format_id === x.format_id)
              const bundle = fc && fc.cost_total > 0 ? Math.max(1, Math.round(Number(x.cost_snapshot) / Number(fc.cost_total))) : 1
              const match = prs.find((y) => y.format_id === x.format_id && Number(y.price) === Number(x.unit_price) && Number(y.bundle_size) === bundle)
              return {
                key: newKey(),
                kind: 'product',
                kitId: '',
                imagePath: x.image_path ?? '',
                productId: x.product_id,
                formatId: x.format_id,
                priceId: match?.id ?? CUSTOM,
                bundle,
                description: x.description,
                qty: dec(Number(x.quantity)),
                unit: dec(Number(x.unit_price)),
                freeCost: '',
              }
            }
            return {
              key: newKey(),
              kind: 'free',
              kitId: '',
              imagePath: x.image_path ?? '',
              productId: '',
              formatId: '',
              priceId: '',
              bundle: 1,
              description: x.description,
              qty: dec(Number(x.quantity)),
              unit: dec(Number(x.unit_price)),
              freeCost: dec(Number(x.cost_snapshot)),
            }
          }),
        )
      }
    }
    setLoading(false)
  }, [company, id, toast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (pay.loaded && !payTouched) setPayTerms(pay.defaultText)
  }, [pay.loaded, pay.defaultText, payTouched])

  const fcById = useMemo(() => new Map(formats.map((f) => [f.format_id, f])), [formats])
  const formatsOf = useMemo(() => {
    const m = new Map<string, FormatCost[]>()
    for (const f of formats) m.set(f.product_id, [...(m.get(f.product_id) ?? []), f])
    return m
  }, [formats])
  const pricesOf = useMemo(() => {
    const m = new Map<string, ProductPrice[]>()
    for (const p of prices) m.set(p.format_id, [...(m.get(p.format_id) ?? []), p])
    return m
  }, [prices])

  const sellable = (p: Product) => (formatsOf.get(p.id) ?? []).some((f) => (pricesOf.get(f.format_id) ?? []).length > 0)

  const descFor = (productId: string, formatId: string, price?: ProductPrice) => {
    const p = products.find((x) => x.id === productId)
    const f = fcById.get(formatId)
    if (!p || !f) return ''
    const multi = (formatsOf.get(productId) ?? []).length > 1
    return `${p.name}${multi ? ` (${f.format_name})` : ''}${price && Number(price.bundle_size) > 1 ? ` · ${price.name}` : ''}`
  }

  const defaultPrice = (formatId: string) => {
    const list = pricesOf.get(formatId) ?? []
    const singles = list.filter((x) => x.auto_quote && Number(x.bundle_size) === 1).sort((a, b) => Number(b.price) - Number(a.price))
    return singles[0] ?? list[0]
  }

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))

  function pickFormat(key: string, productId: string, formatId: string) {
    const pr = defaultPrice(formatId)
    patch(key, {
      productId,
      formatId,
      priceId: pr?.id ?? CUSTOM,
      bundle: pr ? Number(pr.bundle_size) : 1,
      unit: pr ? dec(Number(pr.price)) : '',
      description: descFor(productId, formatId, pr),
    })
  }

  function suggestedPhoto(productId: string): string {
    return cat.photos.find((p) => p.product_id === productId)?.image_path ?? products.find((p) => p.id === productId)?.image_path ?? ''
  }

  function pickProduct(key: string, productId: string) {
    patch(key, { imagePath: suggestedPhoto(productId) })
    const f = (formatsOf.get(productId) ?? [])[0]
    if (!f) return patch(key, { productId, formatId: '', priceId: '', description: '' })
    pickFormat(key, productId, f.format_id)
  }

  function pickPrice(key: string, l: Line, priceId: string) {
    if (priceId === CUSTOM) return patch(key, { priceId: CUSTOM, bundle: 1, description: descFor(l.productId, l.formatId) })
    const pr = prices.find((x) => x.id === priceId)
    if (!pr) return
    patch(key, {
      priceId,
      bundle: Number(pr.bundle_size),
      unit: dec(Number(pr.price)),
      description: descFor(l.productId, l.formatId, pr),
    })
  }

  const activeKits = kd.kits.filter((k) => k.active && kd.prices.some((p) => p.kit_id === k.id))

  function pickKit(key: string, kitId: string) {
    const kit = kd.kits.find((k) => k.id === kitId)
    if (!kit) return patch(key, { kitId: '', priceId: '', description: '', unit: '', freeCost: '' })
    const first = kd.prices.filter((p) => p.kit_id === kitId).sort((a, b) => b.price - a.price)[0]
    patch(key, {
      kitId,
      imagePath: kit.image_path ?? '',
      priceId: first?.id ?? CUSTOM,
      unit: first ? dec(first.price) : '',
      description: kit.name,
      freeCost: dec(kd.costOf(kitId).total),
    })
  }

  function pickKitPrice(key: string, priceId: string) {
    if (priceId === CUSTOM) return patch(key, { priceId: CUSTOM })
    const pr = kd.prices.find((p) => p.id === priceId)
    if (pr) patch(key, { priceId, unit: dec(pr.price) })
  }

  const calc = (l: Line) => {
    const qty = parseNum(l.qty)
    const price = parseNum(l.unit)
    const unitCost = l.kind === 'product' ? Number(fcById.get(l.formatId)?.cost_total ?? 0) * l.bundle : parseNum(l.freeCost) || 0
    const okQty = qty > 0
    const okPrice = price >= 0
    const total = okQty && okPrice ? Math.round(qty * price * 100) / 100 : 0
    return {
      qty: okQty ? qty : 0,
      total,
      cost: okQty ? qty * unitCost : 0,
      margin: okPrice && price > 0 ? (price - unitCost) / price : null,
      valid: okQty && okPrice && (l.kind === 'product' ? l.productId !== '' && l.formatId !== '' : l.description.trim() !== '' && (l.kind !== 'kit' || l.kitId !== '')),
    }
  }

  const calcs = lines.map(calc)
  const subtotal = calcs.reduce((a, c) => a + c.total, 0)
  const costTotal = calcs.reduce((a, c) => a + c.cost, 0)
  const discountN = parseNum(discount) > 0 ? parseNum(discount) : 0
  const shippingN = parseNum(shipping) > 0 ? parseNum(shipping) : 0
  const total = subtotal - discountN + shippingN
  const profit = total - costTotal
  const margin = total > 0 ? profit / total : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    if (lines.length === 0) return toast('Adicione ao menos um item.', 'error')
    if (calcs.some((c) => !c.valid)) return toast('Revise os itens: escolha o produto e informe quantidade e preço.', 'error')
    if (total < 0) return toast('O desconto é maior que o total.', 'error')

    const items = lines.map((l) => {
      const qty = parseNum(l.qty)
      const unit_price = parseNum(l.unit)
      if (l.kind !== 'product') return { description: l.description.trim(), quantity: qty, unit_price, cost: parseNum(l.freeCost) || 0, image_path: l.imagePath || undefined }
      return {
        product_id: l.productId,
        format_id: l.formatId,
        quantity: qty,
        unit_price,
        description: l.description.trim() || undefined,
        image_path: l.imagePath || undefined,
        ...(l.bundle > 1 ? { bundle_size: l.bundle } : {}),
      }
    })

    setBusy(true)
    const { data, error } = await supabase.rpc('save_quote', {
      p_company_id: company.id,
      p_quote_id: id ?? null,
      p_customer_id: customerId || null,
      p_event_name: eventName.trim() || null,
      p_issue_date: issueDate || null,
      p_valid_until: validUntil || null,
      p_event_date: eventDate || null,
      p_discount: discountN,
      p_shipping: shippingN,
      p_notes: notes.trim() || null,
      p_items: items,
    })
    if (error) {
      setBusy(false)
      return toast(friendlyError(error), 'error')
    }
    const saved = data as string
    const [terms, unit] = await Promise.all([
      supabase.rpc('set_quote_payment_terms', { p_quote_id: saved, p_terms: payTerms }),
      supabase.rpc('set_quote_show_unit_price', { p_quote_id: saved, p_show: showUnit }),
    ])
    setBusy(false)
    const failed = terms.error ?? unit.error
    if (failed) toast(`Orçamento salvo, mas a forma de pagamento ou a opção do PDF não foi gravada. ${friendlyError(failed)}`, 'error')
    else toast('Orçamento salvo')
    navigate(`/orcamentos/${saved}`)
  }

  if (loading) return <p className="muted">Carregando…</p>
  if (blocked)
    return (
      <>
        <Link to="/orcamentos" className="back">← Orçamentos</Link>
        <p className="muted">{blocked}</p>
      </>
    )

  const grouped = [
    ...categories.map((c) => ({ id: c.id, name: c.name, list: products.filter((p) => p.category_id === c.id) })),
    { id: 'none', name: 'Sem família', list: products.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id)) },
  ].filter((g) => g.list.length > 0)

  return (
    <>
      <header className="page-head">
        <Link to={id ? `/orcamentos/${id}` : '/orcamentos'} className="back">← {id ? 'Voltar ao orçamento' : 'Orçamentos'}</Link>
        <h1>{id ? `Editar orçamento #${String(number ?? 0).padStart(2, '0')}` : 'Novo orçamento'}</h1>
        <p className="sub">Escolha os produtos e ajuste o preço de cada linha: a margem aparece na hora.</p>
      </header>

      <form onSubmit={submit}>
        <section className="panel">
          <h2 className="section-title">Cliente e evento</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="q-cust">Cliente (A/C)</label>
              <select
                id="q-cust"
                value={customerId}
                onChange={(e) => (e.target.value === NEW_CUSTOMER ? setNewCustomer(true) : setCustomerId(e.target.value))}
              >
                <option value="">Sem cliente</option>
                {customers
                  .filter((c) => c.active || c.id === customerId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                <option value={NEW_CUSTOMER}>+ Novo cliente…</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-event">Evento (opcional)</label>
              <input id="q-event" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Ex.: Aniversário da Ana" />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="q-issue">Data do orçamento</label>
              <input id="q-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="q-valid">Válido até</label>
              <input id="q-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="q-event-date">Data do evento / entrega</label>
              <input id="q-event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2 className="section-title">Itens</h2>
            <div className="block-add">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: 'product', kitId: '', imagePath: '', productId: '', formatId: '', priceId: '', bundle: 1, description: '', qty: '', unit: '', freeCost: '' }])}
              >
                + Produto
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: 'kit', kitId: '', imagePath: '', productId: '', formatId: '', priceId: '', bundle: 1, description: '', qty: '1', unit: '', freeCost: '' }])}
              >
                + Kit
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: 'free', kitId: '', imagePath: '', productId: '', formatId: '', priceId: '', bundle: 1, description: '', qty: '1', unit: '', freeCost: '' }])}
              >
                + Item livre
              </button>
            </div>
          </header>

          {lines.length === 0 ? (
            <p className="muted">Nenhum item ainda. Use “+ Produto” ou “+ Kit” para escolher do seu catálogo, ou “+ Item livre” para serviços e entregas.</p>
          ) : (
            <ul className="q-lines">
              {lines.map((l, idx) => {
                const c = calcs[idx]
                const fl = formatsOf.get(l.productId) ?? []
                const pl = pricesOf.get(l.formatId) ?? []
                const tone = marginTone(c.margin)
                return (
                  <li key={l.key} className="q-line">
                    {l.kind === 'product' ? (
                      <div className="q-pick">
                        <div className="field q-pick-thumb">
                          {l.productId && (() => {
                            const pr = products.find((x) => x.id === l.productId)
                            return pr ? <ProductThumb name={pr.name} path={pr.image_path} size="sm" /> : null
                          })()}
                          <div className="q-pick-field">
                          <label htmlFor={`${l.key}-p`}>Produto</label>
                          <select id={`${l.key}-p`} value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)}>
                            <option value="">Escolha…</option>
                            {grouped.map((g) => (
                              <optgroup key={g.id} label={g.name}>
                                {g.list.map((p) => (
                                  <option key={p.id} value={p.id} disabled={!sellable(p)}>
                                    {p.name}
                                    {sellable(p) ? '' : ' (sem preço)'}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          </div>
                        </div>
                        {fl.length > 1 && (
                          <div className="field">
                            <label htmlFor={`${l.key}-f`}>Formato</label>
                            <select id={`${l.key}-f`} value={l.formatId} onChange={(e) => pickFormat(l.key, l.productId, e.target.value)}>
                              {fl.map((f) => (
                                <option key={f.format_id} value={f.format_id}>
                                  {f.format_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {l.formatId && (
                          <div className="field">
                            <label htmlFor={`${l.key}-pr`}>Preço da tabela</label>
                            <select id={`${l.key}-pr`} value={l.priceId} onChange={(e) => pickPrice(l.key, l, e.target.value)}>
                              {pl.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} · {moneyAuto(Number(p.price))}
                                  {Number(p.bundle_size) > 1 ? ` (pacote de ${Number(p.bundle_size)})` : ''}
                                </option>
                              ))}
                              <option value={CUSTOM}>Outro valor</option>
                            </select>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {l.kind === 'kit' && (
                      <div className="q-pick">
                        <div className="field q-pick-thumb">
                          {l.kitId && (() => {
                            const k = kd.kits.find((x) => x.id === l.kitId)
                            return k ? <ProductThumb name={k.name} path={k.image_path} size="sm" /> : null
                          })()}
                          <div className="q-pick-field">
                            <label htmlFor={`${l.key}-k`}>Kit</label>
                            <select id={`${l.key}-k`} value={l.kitId} onChange={(e) => pickKit(l.key, e.target.value)}>
                              <option value="">Escolha…</option>
                              {activeKits.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {l.kitId && (
                          <div className="field">
                            <label htmlFor={`${l.key}-kp`}>Preço do kit</label>
                            <select id={`${l.key}-kp`} value={l.priceId} onChange={(e) => pickKitPrice(l.key, e.target.value)}>
                              {kd.prices
                                .filter((p) => p.kit_id === l.kitId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} · {moneyAuto(p.price)}
                                  </option>
                                ))}
                              <option value={CUSTOM}>Outro valor</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="field">
                      <label htmlFor={`${l.key}-d`}>{l.kind === 'free' ? 'Descrição' : 'Texto no orçamento'}</label>
                      <input
                        id={`${l.key}-d`}
                        value={l.description}
                        onChange={(e) => patch(l.key, { description: e.target.value })}
                        placeholder={l.kind === 'free' ? 'Ex.: Taxa de entrega, arte personalizada…' : ''}
                      />
                    </div>

                    <div className="q-photo">
                      {l.imagePath ? <img className="thumb" src={productImageUrl(l.imagePath) ?? ''} alt="" /> : <span className="thumb sm muted" aria-hidden="true">—</span>}
                      <button type="button" className="btn btn-small" onClick={() => setPickerFor(l.key)}>
                        {l.imagePath ? 'Trocar foto' : 'Escolher foto do catálogo'}
                      </button>
                      {l.imagePath && (
                        <button type="button" className="link-btn" onClick={() => patch(l.key, { imagePath: '' })}>
                          Tirar foto
                        </button>
                      )}
                    </div>

                    <div className="q-nums">
                      <div className="field">
                        <label htmlFor={`${l.key}-q`}>{l.bundle > 1 ? 'Pacotes' : 'Quantidade'}</label>
                        <input id={`${l.key}-q`} inputMode="decimal" value={l.qty} onChange={(e) => patch(l.key, { qty: e.target.value })} />
                      </div>
                      <div className="field">
                        <label htmlFor={`${l.key}-u`}>{l.bundle > 1 ? 'Preço do pacote (R$)' : 'Preço unit. (R$)'}</label>
                        <input
                          id={`${l.key}-u`}
                          inputMode="decimal"
                          value={l.unit}
                          onChange={(e) => patch(l.key, { unit: e.target.value, ...(l.kind !== 'free' ? { priceId: CUSTOM } : {}) })}
                        />
                      </div>
                      {l.kind === 'free' && (
                        <div className="field">
                          <label htmlFor={`${l.key}-c`}>Seu custo (R$)</label>
                          <input id={`${l.key}-c`} inputMode="decimal" value={l.freeCost} onChange={(e) => patch(l.key, { freeCost: e.target.value })} placeholder="0" />
                        </div>
                      )}
                      <div className="q-total">
                        <span>Total</span>
                        <strong>{moneyAuto(c.total)}</strong>
                      </div>
                      <div className={`q-margin tone-${tone}`} aria-live="polite">
                        <span>Margem</span>
                        <strong>{pct(c.margin)}</strong>
                      </div>
                      <button type="button" className="icon-btn small" aria-label="Remover item" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                        ×
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="section-title">Pagamento</h2>
          <PaymentTermsField
            value={payTerms}
            onChange={(v) => {
              setPayTerms(v)
              setPayTouched(true)
            }}
            methods={pay.methods}
            reload={pay.reload}
          />
          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={showUnit} onChange={(e) => setShowUnit(e.target.checked)} />
            Mostrar o valor unitário no PDF
          </label>
          <p className="hint">Desmarque para o cliente ver só a quantidade e o total de cada item.</p>
        </section>

        <section className="panel">
          <h2 className="section-title">Fechamento</h2>
          <div className="q-close">
            <div className="form">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="q-disc">Desconto (R$)</label>
                  <input id="q-disc" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                </div>
                <div className="field">
                  <label htmlFor="q-ship">Frete / entrega (R$)</label>
                  <input id="q-ship" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="q-notes">Observações (só para você)</label>
                <textarea id="q-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <dl className={`q-summary tone-${marginTone(margin)}`} aria-live="polite">
              <div><dt>Subtotal</dt><dd>{moneyAuto(subtotal)}</dd></div>
              {discountN > 0 && <div><dt>Desconto</dt><dd>− {moneyAuto(discountN)}</dd></div>}
              {shippingN > 0 && <div><dt>Frete</dt><dd>{moneyAuto(shippingN)}</dd></div>}
              <div className="q-sum-total"><dt>Total do cliente</dt><dd>{moneyAuto(total)}</dd></div>
              <div><dt>Seu custo</dt><dd>{moneyAuto(costTotal)}</dd></div>
              <div><dt>Lucro</dt><dd>{moneyAuto(profit)}</dd></div>
              <div className="q-sum-margin"><dt>Margem</dt><dd>{pct(margin)}</dd></div>
            </dl>
          </div>
        </section>

        <div className="dialog-actions sticky-actions">
          <Link className="btn" to={id ? `/orcamentos/${id}` : '/orcamentos'}>
            Cancelar
          </Link>
          <button className="btn btn-primary" disabled={busy || lines.length === 0}>
            {busy ? 'Salvando…' : 'Salvar orçamento'}
          </button>
        </div>
      </form>

      <PhotoPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        selected={lines.find((x) => x.key === pickerFor)?.imagePath}
        productId={lines.find((x) => x.key === pickerFor)?.productId || undefined}
        onPick={(path) => {
          if (pickerFor) patch(pickerFor, { imagePath: path ?? '' })
          setPickerFor(null)
        }}
      />

      <CustomerDialog
        key={newCustomer ? 'open' : 'closed'}
        target={newCustomer ? 'new' : null}
        onClose={() => setNewCustomer(false)}
        onSaved={async (cid) => {
          setNewCustomer(false)
          if (company) {
            const { data } = await supabase.from('customers').select('*').eq('company_id', company.id).order('name')
            setCustomers((data ?? []) as Customer[])
          }
          setCustomerId(cid)
        }}
      />
    </>
  )
}
