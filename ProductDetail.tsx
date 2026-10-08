import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { Dialog } from '../components/Dialog'
import { CostBuilder } from '../components/CostBuilder'
import { PriceEditor } from '../components/PriceEditor'
import { friendlyError } from '../lib/errors'
import { moneyAuto, num, parseNum } from '../lib/format'
import type { CostLine, ExtraCost, FormatCost, Ingredient, Product, ProductCategory, ProductFormat, ProductPrice, RecipeCost } from '../types'

export function ProductDetail() {
  const { id } = useParams()
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [product, setProduct] = useState<Product | null>(null)
  const [formats, setFormats] = useState<ProductFormat[]>([])
  const [formatCosts, setFormatCosts] = useState<FormatCost[]>([])
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [lines, setLines] = useState<CostLine[]>([])
  const [extras, setExtras] = useState<ExtraCost[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<RecipeCost[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [selected, setSelected] = useState<string>('')
  const [formatDlg, setFormatDlg] = useState<{ format?: ProductFormat } | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [active, setActive] = useState(true)
  const [savingInfo, setSavingInfo] = useState(false)

  const load = useCallback(async () => {
    if (!company || !id) return
    const [p, f, fc, pr, li, ex, ing, rc, cat] = await Promise.all([
      supabase.from('products').select('*').eq('id', id).maybeSingle(),
      supabase.from('product_formats').select('*').eq('product_id', id).order('sort_order').order('created_at'),
      supabase.from('product_format_costs').select('*').eq('product_id', id).order('sort_order'),
      supabase.from('product_prices').select('*').eq('product_id', id).order('created_at'),
      supabase.from('product_items').select('*').eq('product_id', id).order('created_at'),
      supabase.from('product_extra_costs').select('*').eq('product_id', id).order('created_at'),
      supabase.from('ingredients').select('*').eq('company_id', company.id).order('name'),
      supabase.from('recipe_cost_summary').select('*').eq('company_id', company.id).order('name'),
      supabase.from('product_categories').select('id, name').eq('company_id', company.id).order('name'),
    ])
    if (!p.data) {
      setMissing(true)
      setLoading(false)
      return
    }
    const err = f.error ?? fc.error ?? pr.error ?? li.error ?? ex.error
    if (err) toast(friendlyError(err), 'error')
    const fmts = (f.data ?? []) as ProductFormat[]
    setProduct(p.data as Product)
    setFormats(fmts)
    setFormatCosts((fc.data ?? []) as FormatCost[])
    setPrices((pr.data ?? []) as ProductPrice[])
    setLines((li.data ?? []) as CostLine[])
    setExtras((ex.data ?? []) as ExtraCost[])
    setIngredients((ing.data ?? []) as Ingredient[])
    setRecipes((rc.data ?? []) as RecipeCost[])
    setCategories((cat.data ?? []) as ProductCategory[])
    setSelected((s) => (fmts.some((x) => x.id === s) ? s : (fmts[0]?.id ?? '')))
    setLoading(false)
  }, [company, id, toast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!product) return
    setName(product.name)
    setDescription(product.description ?? '')
    setCategoryId(product.category_id ?? '')
    setActive(product.active)
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveInfo(e: FormEvent) {
    e.preventDefault()
    if (!product) return
    setSavingInfo(true)
    const { error } = await supabase
      .from('products')
      .update({ name: name.trim(), description: description.trim() || null, category_id: categoryId || null, active })
      .eq('id', product.id)
    setSavingInfo(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Produto atualizado')
    await load()
  }

  if (loading) return <p className="muted">Carregando…</p>
  if (missing || !product || !company) {
    return (
      <>
        <Link to="/produtos" className="back">← Produtos</Link>
        <p className="muted">Produto não encontrado.</p>
      </>
    )
  }

  const fmt = formats.find((f) => f.id === selected)
  const cost = formatCosts.find((c) => c.format_id === selected)
  const fmtPrices = prices.filter((p) => p.format_id === selected)

  return (
    <>
      <header className="page-head with-action">
        <div>
          <Link to="/produtos" className="back">← Produtos</Link>
          <h1>{product.name}</h1>
          <p className="sub">Monte o custo por partes, defina o rendimento de cada formato e ajuste os preços vendo a margem.</p>
        </div>
        <button className="btn" onClick={() => setDuplicating(true)}>
          Duplicar produto
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Formatos">
        {formats.map((f) => (
          <button key={f.id} role="tab" aria-selected={f.id === selected} className={`tab ${f.id === selected ? 'on' : ''} ${f.active ? '' : 'off'}`} onClick={() => setSelected(f.id)}>
            {f.name} <small>rende {num(Number(f.units_per_batch))}</small>
          </button>
        ))}
        <button className="tab tab-add" onClick={() => setFormatDlg({})}>
          + Formato
        </button>
      </div>

      {fmt && cost ? (
        <>
          <section className="summary-strip" aria-label={`Custo por unidade · ${fmt.name}`}>
            <div><span>Produto</span><strong>{moneyAuto(cost.cost_product)}</strong></div>
            <div><span>Embalagem</span><strong>{moneyAuto(cost.cost_packaging)}</strong></div>
            <div><span>Mão de obra</span><strong>{moneyAuto(cost.cost_labor)}</strong></div>
            <div className="is-total"><span>Custo por unidade</span><strong>{moneyAuto(cost.cost_total)}</strong></div>
          </section>
          <p className="muted strip-note">
            Tanda de {num(Number(fmt.units_per_batch))} unidades custa {moneyAuto(cost.batch_total)}.{' '}
            <button className="link-btn inline" onClick={() => setFormatDlg({ format: fmt })}>
              Editar formato
            </button>
          </p>
        </>
      ) : (
        <div className="empty-block">
          <strong>Este produto ainda não tem formato.</strong>
          <p>O formato define o rendimento da tanda (ex.: 18g rende 40 unidades).</p>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => setFormatDlg({})}>Criar formato</button>
          </div>
        </div>
      )}

      <h2 className="section-title">Custo</h2>
      <p className="muted section-note">
        Linhas “por tanda” são divididas pelo rendimento; linhas “por unidade” somam direto no custo de cada unidade. Valem para todos os formatos.
      </p>
      <CostBuilder
        owner="product"
        ownerId={product.id}
        companyId={company.id}
        lines={lines}
        extras={extras}
        ingredients={ingredients}
        recipes={recipes}
        onChanged={load}
      />

      {fmt && cost && (
        <PriceEditor companyId={company.id} productId={product.id} format={cost} prices={fmtPrices} onChanged={load} />
      )}

      <section className="panel">
        <h2 className="section-title">Dados do produto</h2>
        <form className="form form-wide" onSubmit={saveInfo}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-name">Nome</label>
              <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="p-cat">Família</label>
              <select id="p-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem família</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="p-desc">Descrição</label>
            <input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Produto ativo
          </label>
          <div className="dialog-actions">
            <button className="btn btn-primary" disabled={savingInfo || !name.trim()}>
              {savingInfo ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        </form>
      </section>

      <FormatDialog
        key={formatDlg ? (formatDlg.format?.id ?? 'new') : 'none'}
        state={formatDlg}
        companyId={company.id}
        productId={product.id}
        nextOrder={formats.length}
        onClose={() => setFormatDlg(null)}
        onSaved={async (newId) => {
          setFormatDlg(null)
          if (newId) setSelected(newId)
          await load()
        }}
        onDeleted={async () => {
          setFormatDlg(null)
          await load()
        }}
      />

      <DuplicateDialog
        key={duplicating ? 'open' : 'closed'}
        open={duplicating}
        product={product}
        onClose={() => setDuplicating(false)}
        onDone={(newId) => {
          setDuplicating(false)
          navigate(`/produtos/${newId}`)
        }}
      />
    </>
  )
}

function FormatDialog({
  state,
  companyId,
  productId,
  nextOrder,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: { format?: ProductFormat } | null
  companyId: string
  productId: string
  nextOrder: number
  onClose: () => void
  onSaved: (newId?: string) => Promise<void>
  onDeleted: () => Promise<void>
}) {
  const toast = useToast()
  const f = state?.format
  const [name, setName] = useState(f?.name ?? '')
  const [yieldQty, setYieldQty] = useState(f ? String(f.units_per_batch).replace('.', ',') : '')
  const [active, setActive] = useState(f?.active ?? true)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const y = parseNum(yieldQty)
    if (!(y > 0)) return toast('O rendimento precisa ser maior que zero.', 'error')
    setBusy(true)
    if (f) {
      const { error } = await supabase.from('product_formats').update({ name: name.trim(), units_per_batch: y, active }).eq('id', f.id)
      setBusy(false)
      if (error) return toast(friendlyError(error), 'error')
      toast('Formato atualizado')
      await onSaved()
    } else {
      const { data, error } = await supabase
        .from('product_formats')
        .insert({ company_id: companyId, product_id: productId, name: name.trim(), units_per_batch: y, sort_order: nextOrder })
        .select('id')
        .single()
      setBusy(false)
      if (error) return toast(friendlyError(error), 'error')
      toast('Formato criado')
      await onSaved(data.id as string)
    }
  }

  async function remove() {
    if (!f) return
    if (!window.confirm(`Remover o formato "${f.name}" e todos os seus preços?`)) return
    const { error } = await supabase.from('product_formats').delete().eq('id', f.id)
    if (error) return toast(friendlyError(error), 'error')
    toast('Formato removido')
    await onDeleted()
  }

  return (
    <Dialog open={state !== null} onClose={onClose} title={f ? 'Editar formato' : 'Novo formato'}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="fm-name">Nome do formato</label>
          <input id="fm-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex.: 18g, 13g, Caixa 9" />
        </div>
        <div className="field">
          <label htmlFor="fm-yield">Rende (unidades por tanda)</label>
          <input id="fm-yield" inputMode="decimal" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} required />
          <small className="hint">É aqui, e só aqui, que o rendimento é informado. O custo por unidade = custo da tanda ÷ rendimento.</small>
        </div>
        {f && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Formato ativo
          </label>
        )}
        <div className="dialog-actions">
          {f && (
            <button type="button" className="btn" onClick={() => void remove()}>
              Remover
            </button>
          )}
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

function DuplicateDialog({
  open,
  product,
  onClose,
  onDone,
}: {
  open: boolean
  product: Product
  onClose: () => void
  onDone: (newId: string) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(`${product.name} (cópia)`)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc('duplicate_product', { p_product_id: product.id, p_new_name: name.trim() })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Produto duplicado')
    onDone(data as string)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Duplicar produto">
      <form className="form" onSubmit={submit}>
        <p className="muted">Copia formatos, custos e preços. Útil para criar um sabor novo a partir de outro.</p>
        <div className="field">
          <label htmlFor="dp-name">Nome do novo produto</label>
          <input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Duplicando…' : 'Duplicar'}</button>
        </div>
      </form>
    </Dialog>
  )
}
