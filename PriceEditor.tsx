import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { friendlyError } from '../lib/errors'
import { moneyAuto, num, parseNum } from '../lib/format'
import { calcPrice, marginTone, pct, roundUp, suggestedPrice, times } from '../lib/pricing'
import type { FormatCost, ProductPrice } from '../types'

type Props = {
  companyId: string
  productId: string
  format: FormatCost
  prices: ProductPrice[]
  onChanged: () => Promise<void>
}

const dec = (n: number) => String(n).replace('.', ',')

/** Preços de um formato. Ao mudar o valor, margem, lucro e markup se atualizam na hora. */
export function PriceEditor({ companyId, productId, format, prices, onChanged }: Props) {
  const [adding, setAdding] = useState(false)
  const unitCost = Number(format.cost_total)

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="section-title">Preços · {format.format_name}</h2>
          <p className="muted">
            Custo por unidade: <strong>{moneyAuto(unitCost)}</strong>. Mude o preço e veja a margem na hora.
          </p>
        </div>
        <button className="btn btn-small" onClick={() => setAdding(true)}>
          + Preço
        </button>
      </header>

      {prices.length === 0 ? (
        <p className="muted">Nenhum preço para este formato ainda.</p>
      ) : (
        <ul className="price-list">
          {prices.map((p) => (
            <PriceRow key={`${p.id}:${p.price}:${p.bundle_size}:${p.auto_quote}:${p.active}`} price={p} format={format} onChanged={onChanged} />
          ))}
        </ul>
      )}

      <Sensitivity unitCost={unitCost} unitsPerBatch={Number(format.units_per_batch)} />

      <AddPriceDialog
        key={adding ? `open-${format.format_id}` : 'closed'}
        open={adding}
        companyId={companyId}
        productId={productId}
        format={format}
        existing={prices.map((p) => p.name.toLowerCase())}
        onClose={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false)
          await onChanged()
        }}
      />
    </section>
  )
}

function PriceRow({ price, format, onChanged }: { price: ProductPrice; format: FormatCost; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [value, setValue] = useState(dec(Number(price.price)))
  const [bundle, setBundle] = useState(dec(Number(price.bundle_size)))
  const [auto, setAuto] = useState(price.auto_quote)
  const [active, setActive] = useState(price.active)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const unitCost = Number(format.cost_total)
  const upb = Number(format.units_per_batch)
  const v = parseNum(value)
  const b = parseNum(bundle)
  const valid = v > 0 && b > 0
  const calc = valid ? calcPrice(v, b, unitCost, upb) : null
  const tone = marginTone(calc?.margin)

  const dirty =
    v !== Number(price.price) || b !== Number(price.bundle_size) || auto !== price.auto_quote || active !== price.active

  const t = parseNum(target) / 100
  const sugUnit = target.trim() ? suggestedPrice(unitCost, t) : null
  const sugPack = sugUnit !== null && b > 0 ? roundUp(sugUnit * b, 0.1) : null

  async function save() {
    if (!valid) return toast('Preço e tamanho do pacote precisam ser maiores que zero.', 'error')
    setBusy(true)
    const { error } = await supabase
      .from('product_prices')
      .update({ price: v, bundle_size: b, auto_quote: auto, active })
      .eq('id', price.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Preço salvo')
    await onChanged()
  }

  async function remove() {
    if (!window.confirm(`Remover o preço "${price.name}"?`)) return
    const { error } = await supabase.from('product_prices').delete().eq('id', price.id)
    if (error) return toast(friendlyError(error), 'error')
    await onChanged()
  }

  return (
    <li className={`price-row ${active ? '' : 'row-off'}`}>
      <div className="price-name">
        <strong>{price.name}</strong>
        {b > 1 && <small className="muted">pacote com {num(b)}</small>}
      </div>

      <div className="price-inputs">
        <div className="field">
          <label htmlFor={`pv-${price.id}`}>{b > 1 ? 'Preço do pacote' : 'Preço por unidade'} (R$)</label>
          <input id={`pv-${price.id}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`pb-${price.id}`}>Unidades no pacote</label>
          <input id={`pb-${price.id}`} inputMode="decimal" value={bundle} onChange={(e) => setBundle(e.target.value)} />
        </div>
      </div>

      <dl className={`price-result tone-${tone}`} aria-live="polite">
        <div className="pr-main">
          <dt>Margem</dt>
          <dd>{calc ? pct(calc.margin) : '—'}</dd>
        </div>
        <div>
          <dt>Por unidade</dt>
          <dd>{calc ? moneyAuto(calc.unitPrice) : '—'}</dd>
        </div>
        <div>
          <dt>Lucro/un</dt>
          <dd>{calc ? moneyAuto(calc.profit) : '—'}</dd>
        </div>
        <div>
          <dt>Markup</dt>
          <dd>{calc ? times(calc.markup) : '—'}</dd>
        </div>
        <div>
          <dt>Cento</dt>
          <dd>{calc ? moneyAuto(calc.per100.price) : '—'}</dd>
        </div>
        <div>
          <dt>Lucro da tanda</dt>
          <dd>{calc ? moneyAuto(calc.batchProfit) : '—'}</dd>
        </div>
      </dl>

      <div className="price-target">
        <label htmlFor={`pt-${price.id}`}>Quero margem de</label>
        <input id={`pt-${price.id}`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="60" />
        <span>%</span>
        {target.trim() && (
          <span className="muted">
            {sugPack === null ? (
              'Margem impossível (precisa ser menor que 100%).'
            ) : (
              <>
                cobrar <strong>{moneyAuto(sugPack)}</strong>
                {b > 1 ? ` o pacote (${moneyAuto(sugPack / b)}/un)` : ''}{' '}
                <button type="button" className="link-btn inline" onClick={() => setValue(dec(Number(sugPack.toFixed(2))))}>
                  usar
                </button>
              </>
            )}
          </span>
        )}
      </div>

      <div className="price-foot">
        <label className="check small">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Usar nos orçamentos
        </label>
        <label className="check small">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Ativo
        </label>
        <span className="spacer" />
        <button type="button" className="link-btn" onClick={() => void remove()}>
          Remover
        </button>
        <button type="button" className="btn btn-small btn-primary" disabled={!dirty || busy || !valid} onClick={() => void save()}>
          {busy ? 'Salvando…' : dirty ? 'Salvar preço' : 'Salvo'}
        </button>
      </div>
    </li>
  )
}

/** Tira de sensibilidade: que preço cobrar para cada margem. */
function Sensitivity({ unitCost, unitsPerBatch }: { unitCost: number; unitsPerBatch: number }) {
  if (!(unitCost > 0)) return null
  const steps = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
  return (
    <div className="sens">
      <h3>Que preço cobrar?</h3>
      <div className="sens-grid">
        {steps.map((m) => {
          const unit = suggestedPrice(unitCost, m)!
          return (
            <div key={m} className={`sens-cell tone-${marginTone(m)}`}>
              <span>{pct(m)}</span>
              <strong>{moneyAuto(roundUp(unit, 0.05))}</strong>
              <small>
                lucro da tanda {moneyAuto((roundUp(unit, 0.05) - unitCost) * unitsPerBatch)}
              </small>
            </div>
          )
        })}
      </div>
      <p className="hint">Preço por unidade, arredondado para cima em R$ 0,05.</p>
    </div>
  )
}

function AddPriceDialog({
  open,
  companyId,
  productId,
  format,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean
  companyId: string
  productId: string
  format: FormatCost
  existing: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [bundle, setBundle] = useState('1')
  const [busy, setBusy] = useState(false)

  const v = parseNum(value)
  const b = parseNum(bundle)
  const calc = v > 0 && b > 0 ? calcPrice(v, b, Number(format.cost_total), Number(format.units_per_batch)) : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (existing.includes(name.trim().toLowerCase())) return toast('Já existe um preço com esse nome neste formato.', 'error')
    if (!(v > 0) || !(b > 0)) return toast('Informe preço e unidades no pacote.', 'error')
    setBusy(true)
    const { error } = await supabase.from('product_prices').insert({
      company_id: companyId,
      product_id: productId,
      format_id: format.format_id,
      name: name.trim(),
      price: v,
      bundle_size: b,
    })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Preço adicionado')
    await onSaved()
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Novo preço · ${format.format_name}`}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="ap-name">Nome do preço</label>
          <input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex.: Varejo, Atacado, Kit 4" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ap-price">Preço (R$)</label>
            <input id="ap-price" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ap-bundle">Unidades no pacote</label>
            <input id="ap-bundle" inputMode="decimal" value={bundle} onChange={(e) => setBundle(e.target.value)} />
          </div>
        </div>
        {calc && (
          <p className={`msg msg-info tone-${marginTone(calc.margin)}`}>
            {moneyAuto(calc.unitPrice)} por unidade · margem <strong>{pct(calc.margin)}</strong> · lucro {moneyAuto(calc.profit)}/un
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
