import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { Dialog } from '../components/Dialog'
import { UnitQty } from '../components/UnitQty'
import { friendlyError } from '../lib/errors'
import { BASE_LABEL, FAMILY_UNITS, formatAvgCost, formatQty, parseNum, toBase } from '../lib/format'
import type { BaseUnit, Category, Ingredient, PurchaseUnit } from '../types'

const NEW_CATEGORY = '__new__'

export function Ingredients() {
  const { company } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<Ingredient[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null)

  const load = useCallback(async () => {
    if (!company) return
    const [i, c] = await Promise.all([
      supabase.from('ingredients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('ingredient_categories').select('id, name').eq('company_id', company.id).order('name'),
    ])
    if (i.error) toast(friendlyError(i.error), 'error')
    setItems((i.data ?? []) as Ingredient[])
    setCategories((c.data ?? []) as Category[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const visible = items.filter(
    (i) => (showInactive || i.active) && i.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Ingredientes</h1>
          <p className="sub">O custo médio é calculado automaticamente a cada compra.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          Novo ingrediente
        </button>
      </header>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar ingrediente"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar ingrediente"
        />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {items.length === 0
            ? 'Nenhum ingrediente ainda. Cadastre o primeiro para registrar compras.'
            : 'Nenhum ingrediente encontrado.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Categoria</th>
                <th className="num">Estoque</th>
                <th className="num">Mínimo</th>
                <th className="num">Custo médio</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const isLow = i.minimum_stock > 0 && i.current_stock <= i.minimum_stock
                return (
                  <tr key={i.id} className={i.active ? '' : 'row-off'} onClick={() => setEditing(i)}>
                    <td data-label="Ingrediente">
                      <button className="row-link" onClick={() => setEditing(i)}>
                        {i.name}
                      </button>
                      {!i.active && <small className="tag"> inativo</small>}
                    </td>
                    <td data-label="Categoria">{(i.category_id && catName.get(i.category_id)) || '—'}</td>
                    <td data-label="Estoque" className={`num ${isLow ? 'warn' : ''}`}>
                      {formatQty(i.current_stock, i.unit)}
                      {isLow && <small> · baixo</small>}
                    </td>
                    <td data-label="Mínimo" className="num">
                      {i.minimum_stock > 0 ? formatQty(i.minimum_stock, i.unit) : '—'}
                    </td>
                    <td data-label="Custo médio" className="num">
                      {formatAvgCost(i.avg_cost, i.unit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <IngredientDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        target={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await load()
        }}
      />
    </>
  )
}

type DialogProps = {
  target: Ingredient | 'new' | null
  categories: Category[]
  onClose: () => void
  onSaved: () => Promise<void>
}

function IngredientDialog({ target, categories, onClose, onSaved }: DialogProps) {
  const { company } = useAuth()
  const toast = useToast()
  const existing = target && target !== 'new' ? target : null

  const [name, setName] = useState(existing?.name ?? '')
  const [unit, setUnit] = useState<BaseUnit>(existing?.unit ?? 'g')
  const [categoryId, setCategoryId] = useState<string>(existing?.category_id ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [minQty, setMinQty] = useState('')
  const [minUnit, setMinUnit] = useState<PurchaseUnit>(FAMILY_UNITS[existing?.unit ?? 'g'][0])
  const [active, setActive] = useState(existing?.active ?? true)
  const [busy, setBusy] = useState(false)

  // Mostra o mínimo atual já convertido para a unidade maior (ex.: 2000 g -> 2 kg)
  useEffect(() => {
    if (!existing || existing.minimum_stock <= 0) return
    const big = FAMILY_UNITS[existing.unit][0]
    const useBig = big !== 'unit' && existing.minimum_stock >= 1000
    const u = useBig ? big : FAMILY_UNITS[existing.unit].slice(-1)[0]
    setMinUnit(u)
    setMinQty(String(existing.minimum_stock / (useBig ? 1000 : 1)).replace('.', ','))
  }, [existing])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    setBusy(true)
    try {
      let catId: string | null = categoryId || null
      if (categoryId === NEW_CATEGORY) {
        const { data, error } = await supabase
          .from('ingredient_categories')
          .insert({ company_id: company.id, name: newCategory.trim() })
          .select('id')
          .single()
        if (error) throw error
        catId = data.id as string
      }

      const min = minQty.trim() ? parseNum(minQty) : 0
      if (Number.isNaN(min) || min < 0) throw new Error('Estoque mínimo inválido.')
      const minimum_stock = toBase(min, minUnit)

      if (existing) {
        const { error } = await supabase
          .from('ingredients')
          .update({ name: name.trim(), category_id: catId, minimum_stock, active })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('ingredients')
          .insert({ company_id: company.id, name: name.trim(), category_id: catId, unit, minimum_stock })
        if (error) throw error
      }
      toast(existing ? 'Ingrediente atualizado' : 'Ingrediente cadastrado')
      await onSaved()
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={target !== null} onClose={onClose} title={existing ? 'Editar ingrediente' : 'Novo ingrediente'}>
      <form onSubmit={submit} className="form">
        <div className="field">
          <label htmlFor="ing-name">Nome</label>
          <input id="ing-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>

        <div className="field">
          <label htmlFor="ing-unit">Controlar estoque em</label>
          <select
            id="ing-unit"
            value={unit}
            disabled={Boolean(existing)}
            onChange={(e) => {
              const u = e.target.value as BaseUnit
              setUnit(u)
              setMinUnit(FAMILY_UNITS[u][0])
            }}
          >
            <option value="g">Peso (g / kg)</option>
            <option value="ml">Volume (ml / L)</option>
            <option value="unit">Unidades</option>
          </select>
          <small className="hint">
            {existing
              ? 'A unidade não pode mudar depois que o ingrediente existe.'
              : 'Internamente tudo é guardado em ' + BASE_LABEL[unit] + ', mas você pode comprar em kg ou L.'}
          </small>
        </div>

        <div className="field">
          <label htmlFor="ing-cat">Categoria</label>
          <select id="ing-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ Nova categoria…</option>
          </select>
        </div>
        {categoryId === NEW_CATEGORY && (
          <div className="field">
            <label htmlFor="ing-newcat">Nome da nova categoria</label>
            <input id="ing-newcat" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} required />
          </div>
        )}

        <UnitQty
          id="ing-min"
          label="Estoque mínimo (opcional)"
          base={unit}
          value={minQty}
          unit={minUnit}
          onValue={setMinQty}
          onUnit={setMinUnit}
        />

        {existing && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Ingrediente ativo
          </label>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
