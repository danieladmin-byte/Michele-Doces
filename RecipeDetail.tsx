import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { CostBuilder } from './CostBuilder'
import { errorCode, friendlyError } from './errors'
import { moneyAuto, num, parseNum } from './format'
import type { CostLine, ExtraCost, Ingredient, Recipe, RecipeCost } from './types'

type RawItem = Omit<CostLine, 'recipe_id'> & { sub_recipe_id: string | null }

export function RecipeDetail() {
  const { id } = useParams()
  const { company } = useAuth()
  const toast = useToast()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [lines, setLines] = useState<CostLine[]>([])
  const [extras, setExtras] = useState<ExtraCost[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [costs, setCosts] = useState<RecipeCost[]>([])
  const [usedIn, setUsedIn] = useState(0)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [minutes, setMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [savingInfo, setSavingInfo] = useState(false)
  const [producing, setProducing] = useState(false)

  const load = useCallback(async () => {
    if (!company || !id) return
    const [r, li, ex, ing, co, used] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id).maybeSingle(),
      supabase.from('recipe_items').select('*').eq('recipe_id', id).order('created_at'),
      supabase.from('recipe_extra_costs').select('*').eq('recipe_id', id).order('created_at'),
      supabase.from('ingredients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('recipe_cost_summary').select('*').eq('company_id', company.id).order('name'),
      supabase.from('product_items').select('id', { count: 'exact', head: true }).eq('recipe_id', id),
    ])
    if (!r.data) {
      setMissing(true)
      setLoading(false)
      return
    }
    const rec = r.data as Recipe
    setRecipe(rec)
    setName((n) => (n === '' ? rec.name : n))
    setLines(((li.data ?? []) as RawItem[]).map((x) => ({ ...x, recipe_id: x.sub_recipe_id })))
    setExtras((ex.data ?? []) as ExtraCost[])
    setIngredients((ing.data ?? []) as Ingredient[])
    setCosts((co.data ?? []) as RecipeCost[])
    setUsedIn(used.count ?? 0)
    setLoading(false)
  }, [company, id, toast])

  useEffect(() => {
    void load()
  }, [load])

  // formulario de datos: se inicializa una sola vez al cargar la receta
  useEffect(() => {
    if (!recipe) return
    setName(recipe.name)
    setDescription(recipe.description ?? '')
    setMinutes(recipe.preparation_time_minutes != null ? String(recipe.preparation_time_minutes) : '')
    setNotes(recipe.notes ?? '')
    setActive(recipe.active)
  }, [recipe?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveInfo(e: FormEvent) {
    e.preventDefault()
    if (!recipe) return
    const m = minutes.trim() ? Math.round(parseNum(minutes)) : null
    if (m !== null && !(m >= 0)) return toast('Tempo de preparo inválido.', 'error')
    setSavingInfo(true)
    const { error } = await supabase
      .from('recipes')
      .update({ name: name.trim(), description: description.trim() || null, preparation_time_minutes: m, notes: notes.trim() || null, active })
      .eq('id', recipe.id)
    setSavingInfo(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Receita atualizada')
    await load()
  }

  if (loading) return <p className="muted">Carregando…</p>
  if (missing || !recipe || !company) {
    return (
      <>
        <Link to="/receitas" className="back">← Receitas</Link>
        <p className="muted">Receita não encontrada.</p>
      </>
    )
  }

  const total = costs.find((c) => c.recipe_id === recipe.id)

  return (
    <>
      <header className="page-head">
        <Link to="/receitas" className="back">← Receitas</Link>
        <h1>{recipe.name}</h1>
        <p className="sub">
          {usedIn > 0 ? `Usada em ${num(usedIn)} ${usedIn === 1 ? 'linha de produto' : 'linhas de produtos'}.` : 'Ainda não usada em nenhum produto.'}
        </p>
      </header>

      <section className="summary-strip" aria-label="Custo da tanda">
        <div><span>Produto</span><strong>{moneyAuto(total?.cost_product)}</strong></div>
        <div><span>Embalagem</span><strong>{moneyAuto(total?.cost_packaging)}</strong></div>
        <div><span>Mão de obra</span><strong>{moneyAuto(total?.cost_labor)}</strong></div>
        <div className="is-total"><span>Custo da tanda</span><strong>{moneyAuto(total?.total_cost)}</strong></div>
      </section>

      <CostBuilder
        owner="recipe"
        ownerId={recipe.id}
        companyId={company.id}
        lines={lines}
        extras={extras}
        ingredients={ingredients}
        recipes={costs}
        onChanged={load}
      />

      <section className="panel">
        <h2 className="section-title">Dados da receita</h2>
        <form className="form form-wide" onSubmit={saveInfo}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="r-name">Nome</label>
              <input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="r-min">Tempo de preparo (minutos)</label>
              <input id="r-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="r-desc">Descrição</label>
            <input id="r-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="r-notes">Anotações / modo de preparo</label>
            <textarea id="r-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Receita ativa
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setProducing(true)}>
              Registrar produção
            </button>
            <button className="btn btn-primary" disabled={savingInfo || !name.trim()}>
              {savingInfo ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        </form>
      </section>

      <ProduceDialog
        key={producing ? 'open' : 'closed'}
        open={producing}
        recipe={recipe}
        onClose={() => setProducing(false)}
        onDone={async () => {
          setProducing(false)
          await load()
        }}
      />
    </>
  )
}

function ProduceDialog({
  open,
  recipe,
  onClose,
  onDone,
}: {
  open: boolean
  recipe: Recipe
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const toast = useToast()
  const [batches, setBatches] = useState('1')
  const [busy, setBusy] = useState(false)

  async function call(allowNegative: boolean) {
    return supabase.rpc('register_production', {
      p_recipe_id: recipe.id,
      p_batches: parseNum(batches),
      p_allow_negative: allowNegative,
      p_notes: null,
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!(parseNum(batches) > 0)) return toast('Informe quantas tandas.', 'error')
    setBusy(true)
    let { error } = await call(false)
    if (error && errorCode(error) === 'INSUFFICIENT_STOCK') {
      if (window.confirm('Faltam ingredientes no estoque e ele ficaria negativo. Registrar mesmo assim?')) {
        ;({ error } = await call(true))
      }
    }
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Produção registrada. Estoque atualizado.')
    await onDone()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Registrar produção">
      <form className="form" onSubmit={submit}>
        <p className="muted">Desconta do estoque todos os ingredientes e embalagens de {recipe.name}.</p>
        <div className="field">
          <label htmlFor="pr-b">Quantas tandas?</label>
          <input id="pr-b" inputMode="decimal" value={batches} onChange={(e) => setBatches(e.target.value)} autoFocus />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Registrando…' : 'Registrar'}</button>
        </div>
      </form>
    </Dialog>
  )
}
