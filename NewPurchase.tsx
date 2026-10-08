import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { FAMILY_UNITS, UNIT_LABEL, brl, brlPrecise, parseNum, todayISO } from './format'
import type { Ingredient, PurchaseUnit, Supplier } from './types'

type Line = { key: number; ingredientId: string; qty: string; unit: PurchaseUnit; total: string }

let lineKey = 1
const emptyLine = (): Line => ({ key: lineKey++, ingredientId: '', qty: '', unit: 'kg', total: '' })

export function NewPurchase() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [date, setDate] = useState(todayISO())
  const [supplierId, setSupplierId] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplier, setNewSupplier] = useState('')
  const [invoice, setInvoice] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!company) return
    ;(async () => {
      const [i, s] = await Promise.all([
        supabase.from('ingredients').select('*').eq('company_id', company.id).eq('active', true).order('name'),
        supabase.from('suppliers').select('id, name').eq('company_id', company.id).eq('active', true).order('name'),
      ])
      setIngredients((i.data ?? []) as Ingredient[])
      setSuppliers((s.data ?? []) as Supplier[])
    })()
  }, [company])

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])

  function patch(key: number, p: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))
  }

  function pickIngredient(key: number, id: string) {
    const ing = byId.get(id)
    patch(key, { ingredientId: id, unit: ing ? FAMILY_UNITS[ing.unit][0] : 'kg' })
  }

  const parsed = lines.map((l) => ({ qty: parseNum(l.qty), total: parseNum(l.total) }))
  const grandTotal = parsed.reduce((s, p) => s + (Number.isFinite(p.total) ? p.total : 0), 0)

  async function saveSupplier() {
    if (!company || !newSupplier.trim()) return
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ company_id: company.id, name: newSupplier.trim() })
      .select('id, name')
      .single()
    if (error) {
      toast(friendlyError(error), 'error')
      return
    }
    const s = data as Supplier
    setSuppliers((l) => [...l, s].sort((a, b) => a.name.localeCompare(b.name)))
    setSupplierId(s.id)
    setAddingSupplier(false)
    setNewSupplier('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    for (let n = 0; n < lines.length; n++) {
      const l = lines[n]
      const p = parsed[n]
      if (!l.ingredientId || !(p.qty > 0) || !(p.total >= 0) || Number.isNaN(p.total)) {
        toast(`Revise o item ${n + 1}: escolha o ingrediente, a quantidade e o valor pago.`, 'error')
        return
      }
    }
    setBusy(true)
    const { error } = await supabase.rpc('register_purchase', {
      p_company_id: company.id,
      p_supplier_id: supplierId || null,
      p_purchase_date: date,
      p_invoice_number: invoice.trim() || null,
      p_notes: notes.trim() || null,
      p_items: lines.map((l, n) => ({
        ingredient_id: l.ingredientId,
        quantity: parsed[n].qty,
        unit: l.unit,
        total_price: parsed[n].total,
      })),
    })
    setBusy(false)
    if (error) {
      toast(friendlyError(error), 'error')
      return
    }
    toast('Compra registrada. Estoque e custos atualizados.')
    navigate('/compras')
  }

  return (
    <>
      <header className="page-head">
        <Link to="/compras" className="back">
          ← Compras
        </Link>
        <h1>Nova compra</h1>
      </header>

      {ingredients.length === 0 ? (
        <p className="muted">
          Você ainda não tem ingredientes cadastrados. <Link to="/ingredientes">Cadastre o primeiro</Link> para registrar
          uma compra.
        </p>
      ) : (
        <form className="ticket" onSubmit={submit}>
          <div className="ticket-head">
            <div className="field">
              <label htmlFor="p-date">Data</label>
              <input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="p-sup">Fornecedor</label>
              {addingSupplier ? (
                <div className="inline-add">
                  <input
                    value={newSupplier}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    placeholder="Nome do fornecedor"
                    autoFocus
                  />
                  <button type="button" className="btn btn-small" onClick={() => void saveSupplier()}>
                    Salvar
                  </button>
                  <button type="button" className="link-btn" onClick={() => setAddingSupplier(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <select
                  id="p-sup"
                  value={supplierId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') setAddingSupplier(true)
                    else setSupplierId(e.target.value)
                  }}
                >
                  <option value="">Sem fornecedor</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="__new__">+ Novo fornecedor…</option>
                </select>
              )}
            </div>
            <div className="field">
              <label htmlFor="p-inv">Nota fiscal (opcional)</label>
              <input id="p-inv" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            </div>
          </div>

          <div className="ticket-lines">
            {lines.map((l, n) => {
              const ing = byId.get(l.ingredientId)
              const p = parsed[n]
              const unitPrice = p.qty > 0 && Number.isFinite(p.total) ? p.total / p.qty : null
              return (
                <div className="ticket-line" key={l.key}>
                  <div className="field line-ing">
                    <label htmlFor={`ing-${l.key}`}>Ingrediente</label>
                    <select id={`ing-${l.key}`} value={l.ingredientId} onChange={(e) => pickIngredient(l.key, e.target.value)}>
                      <option value="">Escolha…</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field line-qty">
                    <label htmlFor={`qty-${l.key}`}>Quantidade</label>
                    <div className="unit-qty">
                      <input
                        id={`qty-${l.key}`}
                        inputMode="decimal"
                        value={l.qty}
                        placeholder="0"
                        onChange={(e) => patch(l.key, { qty: e.target.value })}
                      />
                      {ing && FAMILY_UNITS[ing.unit].length > 1 ? (
                        <select
                          value={l.unit}
                          aria-label="Unidade"
                          onChange={(e) => patch(l.key, { unit: e.target.value as PurchaseUnit })}
                        >
                          {FAMILY_UNITS[ing.unit].map((u) => (
                            <option key={u} value={u}>
                              {UNIT_LABEL[u]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="unit-fixed">{ing ? UNIT_LABEL[FAMILY_UNITS[ing.unit][0]] : '—'}</span>
                      )}
                    </div>
                  </div>
                  <div className="field line-total">
                    <label htmlFor={`tot-${l.key}`}>Valor pago (R$)</label>
                    <input
                      id={`tot-${l.key}`}
                      inputMode="decimal"
                      value={l.total}
                      placeholder="0,00"
                      onChange={(e) => patch(l.key, { total: e.target.value })}
                    />
                    {unitPrice !== null && (
                      <small className="hint">
                        {brlPrecise(unitPrice)} por {UNIT_LABEL[l.unit]}
                      </small>
                    )}
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn line-remove"
                      aria-label={`Remover item ${n + 1}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
            <button type="button" className="link-btn" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              + Adicionar outro item
            </button>
          </div>

          <div className="ticket-foot">
            <div className="field notes">
              <label htmlFor="p-notes">Observações (opcional)</label>
              <input id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="ticket-total">
              <span>Total da compra</span>
              <strong>{brl(grandTotal)}</strong>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Registrando…' : 'Registrar compra'}
            </button>
          </div>
        </form>
      )}
    </>
  )
}
