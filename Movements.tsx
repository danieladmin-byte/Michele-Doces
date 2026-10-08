import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { UnitQty } from './UnitQty'
import { errorCode, friendlyError } from './errors'
import { FAMILY_UNITS, formatDateTime, formatQty, parseNum, toBase } from './format'
import type { Ingredient, MovementType, PurchaseUnit, StockMovement } from './types'

const TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE: 'Compra',
  RECIPE_PRODUCTION: 'Produção',
  MANUAL_IN: 'Entrada manual',
  MANUAL_OUT: 'Saída manual',
  ADJUSTMENT: 'Contagem de estoque',
  WASTE: 'Perda',
}

type AdjustKind = 'MANUAL_IN' | 'MANUAL_OUT' | 'WASTE' | 'COUNT'

export function Movements() {
  const { company } = useAuth()
  const toast = useToast()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState(false)

  const load = useCallback(async () => {
    if (!company) return
    let q = supabase
      .from('stock_movements')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (filter) q = q.eq('ingredient_id', filter)
    const [m, i] = await Promise.all([
      q,
      supabase.from('ingredients').select('*').eq('company_id', company.id).order('name'),
    ])
    if (m.error) toast(friendlyError(m.error), 'error')
    setMovements((m.data ?? []) as StockMovement[])
    setIngredients((i.data ?? []) as Ingredient[])
    setLoading(false)
  }, [company, filter, toast])

  useEffect(() => {
    void load()
  }, [load])

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Movimentações</h1>
          <p className="sub">Histórico de tudo que entrou e saiu do estoque.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdjusting(true)} disabled={ingredients.length === 0}>
          Ajustar estoque
        </button>
      </header>

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar por ingrediente">
          <option value="">Todos os ingredientes</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : movements.length === 0 ? (
        <p className="muted">Nenhuma movimentação ainda. Elas aparecem aqui assim que você registrar uma compra.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ingrediente</th>
                <th>Tipo</th>
                <th className="num">Quantidade</th>
                <th className="num">Saldo depois</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const ing = byId.get(m.ingredient_id)
                const unit = ing?.unit ?? 'g'
                const q = Number(m.quantity)
                return (
                  <tr key={m.id}>
                    <td data-label="Data">{formatDateTime(m.created_at)}</td>
                    <td data-label="Ingrediente">{ing?.name ?? '—'}</td>
                    <td data-label="Tipo">
                      {TYPE_LABEL[m.type]}
                      {m.notes && <small className="muted"> · {m.notes}</small>}
                    </td>
                    <td data-label="Quantidade" className={`num ${q < 0 ? 'neg' : 'pos'}`}>
                      {q > 0 ? '+' : '−'}
                      {formatQty(Math.abs(q), unit)}
                    </td>
                    <td data-label="Saldo depois" className="num">
                      {formatQty(Number(m.stock_after), unit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdjustDialog
        key={adjusting ? 'open' : 'closed'}
        open={adjusting}
        ingredients={ingredients.filter((i) => i.active)}
        onClose={() => setAdjusting(false)}
        onSaved={async () => {
          setAdjusting(false)
          await load()
        }}
      />
    </>
  )
}

type AdjustProps = {
  open: boolean
  ingredients: Ingredient[]
  onClose: () => void
  onSaved: () => Promise<void>
}

function AdjustDialog({ open, ingredients, onClose, onSaved }: AdjustProps) {
  const toast = useToast()
  const [ingredientId, setIngredientId] = useState('')
  const [kind, setKind] = useState<AdjustKind>('COUNT')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState<PurchaseUnit>('kg')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const ing = ingredients.find((i) => i.id === ingredientId)

  function pick(id: string) {
    setIngredientId(id)
    const i = ingredients.find((x) => x.id === id)
    if (i) setUnit(FAMILY_UNITS[i.unit][0])
  }

  async function call(type: MovementType, quantity: number, allowNegative: boolean) {
    return supabase.rpc('adjust_stock', {
      p_ingredient_id: ingredientId,
      p_type: type,
      p_quantity: quantity,
      p_unit: null, // já enviamos na unidade base
      p_notes: notes.trim() || null,
      p_allow_negative: allowNegative,
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ing) return
    const typed = parseNum(qty)
    if (!Number.isFinite(typed) || typed < 0 || (kind !== 'COUNT' && typed === 0)) {
      toast('Informe uma quantidade válida.', 'error')
      return
    }
    const base = toBase(typed, unit)
    let type: MovementType = kind === 'COUNT' ? 'ADJUSTMENT' : kind
    let amount = base
    if (kind === 'COUNT') {
      amount = base - Number(ing.current_stock)
      if (Math.abs(amount) < 0.0001) {
        toast('A contagem é igual ao estoque atual. Nada a ajustar.')
        onClose()
        return
      }
      type = 'ADJUSTMENT'
    }

    setBusy(true)
    let { error } = await call(type, amount, false)
    if (error && errorCode(error) === 'INSUFFICIENT_STOCK') {
      const ok = window.confirm('Esta saída deixa o estoque negativo. Deseja confirmar mesmo assim?')
      if (ok) ({ error } = await call(type, amount, true))
    }
    setBusy(false)
    if (error) {
      toast(friendlyError(error), 'error')
      return
    }
    toast('Estoque atualizado')
    await onSaved()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Ajustar estoque">
      <form onSubmit={submit} className="form">
        <div className="field">
          <label htmlFor="adj-ing">Ingrediente</label>
          <select id="adj-ing" value={ingredientId} onChange={(e) => pick(e.target.value)} required>
            <option value="">Escolha…</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          {ing && <small className="hint">Estoque atual: {formatQty(ing.current_stock, ing.unit)}</small>}
        </div>

        <fieldset className="radio-group">
          <legend>O que aconteceu?</legend>
          {(
            [
              ['COUNT', 'Contei o estoque (informar o total real)'],
              ['MANUAL_IN', 'Entrada sem compra'],
              ['MANUAL_OUT', 'Saída (uso fora de receita)'],
              ['WASTE', 'Perda ou desperdício'],
            ] as [AdjustKind, string][]
          ).map(([k, label]) => (
            <label key={k} className="check">
              <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
              {label}
            </label>
          ))}
        </fieldset>

        {ing && (
          <UnitQty
            id="adj-qty"
            label={kind === 'COUNT' ? 'Quantidade contada' : 'Quantidade'}
            base={ing.unit}
            value={qty}
            unit={unit}
            onValue={setQty}
            onUnit={setUnit}
          />
        )}

        <div className="field">
          <label htmlFor="adj-notes">Observação (opcional)</label>
          <input id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !ing}>
            {busy ? 'Salvando…' : 'Salvar ajuste'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
