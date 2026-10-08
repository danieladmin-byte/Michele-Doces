import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { supabase } from './supabase'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { UnitQty } from './UnitQty'
import { friendlyError } from './errors'
import { FAMILY_UNITS, formatQty, moneyAuto, num, parseNum, toBase } from './format'
import { laborFromTime, lineParts, totalOf } from './costing'
import type { Basis, CostLine, ExtraCost, ExtraType, Ingredient, PurchaseUnit, RecipeCost, Section } from './types'

type Owner = 'recipe' | 'product'

type Props = {
  owner: Owner
  ownerId: string
  companyId: string
  lines: CostLine[]
  extras: ExtraCost[]
  ingredients: Ingredient[]
  /** Recetas disponibles con su costo (para usarlas como línea). */
  recipes: RecipeCost[]
  onChanged: () => Promise<void>
}

type Row = {
  key: string
  kind: 'line' | 'inherited' | 'extra'
  label: string
  qtyText: string
  basis?: Basis
  amount: number
  manual?: boolean
  line?: CostLine
  extra?: ExtraCost
}

const EXTRA_LABEL: Record<ExtraType, string> = {
  LABOR: 'Mão de obra',
  ENERGY: 'Energia',
  GAS: 'Gás',
  WASTE: 'Perdas',
  OTHER: 'Outros',
}

const TABLES = {
  recipe: { items: 'recipe_items', extras: 'recipe_extra_costs', fk: 'recipe_id', sub: 'sub_recipe_id' },
  product: { items: 'product_items', extras: 'product_extra_costs', fk: 'product_id', sub: 'recipe_id' },
} as const

const BASIS_LABEL: Record<Basis, string> = { BATCH: 'por tanda', UNIT: 'por unidade' }

function sum(rows: Row[]) {
  let batch = 0
  let unit = 0
  let flat = 0
  for (const r of rows) {
    if (r.basis === 'BATCH') batch += r.amount
    else if (r.basis === 'UNIT') unit += r.amount
    else flat += r.amount
  }
  return { batch, unit, flat }
}

export function CostBuilder(props: Props) {
  const { owner, lines, extras, ingredients, recipes, onChanged } = props
  const toast = useToast()
  const T = TABLES[owner]
  const [lineDlg, setLineDlg] = useState<{ section: Section; kind: 'ingredient' | 'recipe'; line?: CostLine } | null>(null)
  const [extraDlg, setExtraDlg] = useState<{ extra?: ExtraCost } | null>(null)

  const ingMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients])
  const recMap = useMemo(() => new Map(recipes.map((r) => [r.recipe_id, r])), [recipes])

  const blocks = useMemo(() => {
    const prod: Row[] = []
    const pack: Row[] = []
    const lab: Row[] = []
    for (const l of lines) {
      const parts = lineParts(l, ingMap, recMap)
      const ing = l.ingredient_id ? ingMap.get(l.ingredient_id) : undefined
      const rec = l.recipe_id ? recMap.get(l.recipe_id) : undefined
      const label = ing?.name ?? rec?.name ?? 'Item removido'
      const qtyText = ing
        ? formatQty(Number(l.quantity), ing.unit)
        : `${num(Number(l.quantity))} ${Number(l.quantity) === 1 ? 'tanda' : 'tandas'}`
      const base: Row = { key: l.id, kind: 'line', label, qtyText, basis: l.basis, amount: 0, manual: l.manual_cost !== null, line: l }
      if (l.recipe_id && l.manual_cost === null) {
        // Una receta aporta a las tres secciones: la línea editable vive en Producto,
        // y en las otras dos aparece lo que hereda (solo lectura).
        prod.push({ ...base, amount: parts.product })
        if (parts.packaging > 0)
          pack.push({ key: `${l.id}:k`, kind: 'inherited', label: `${label} · da receita`, qtyText, basis: l.basis, amount: parts.packaging, line: l })
        if (parts.labor > 0)
          lab.push({ key: `${l.id}:l`, kind: 'inherited', label: `${label} · da receita`, qtyText, basis: l.basis, amount: parts.labor, line: l })
      } else {
        ;(l.section === 'PRODUCT' ? prod : pack).push({ ...base, amount: totalOf(parts) })
      }
    }
    for (const e of extras) {
      const detail =
        e.minutes && e.hourly_rate ? `${num(Number(e.minutes))} min × ${moneyAuto(Number(e.hourly_rate))}/h` : ''
      lab.push({
        key: e.id,
        kind: 'extra',
        label: e.description?.trim() || EXTRA_LABEL[e.type],
        qtyText: detail,
        basis: e.basis,
        amount: Number(e.amount),
        extra: e,
      })
    }
    return { prod, pack, lab }
  }, [lines, extras, ingMap, recMap])

  async function remove(table: string, id: string, what: string) {
    if (!window.confirm(`Remover "${what}"?`)) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return toast(friendlyError(error), 'error')
    await onChanged()
  }

  function renderBlock(title: string, hint: string, rows: Row[], actions: ReactNode) {
    const s = sum(rows)
    const hasBasis = owner === 'product'
    return (
      <section className="block">
        <header className="block-head">
          <div>
            <h3>{title}</h3>
            <p className="muted">{hint}</p>
          </div>
          <div className="block-total">
            {hasBasis ? (
              <>
                {s.batch > 0 && (
                  <span>
                    {moneyAuto(s.batch)} <small>por tanda</small>
                  </span>
                )}
                {s.unit > 0 && (
                  <span>
                    {moneyAuto(s.unit)} <small>por unidade</small>
                  </span>
                )}
                {s.batch === 0 && s.unit === 0 && <span>{moneyAuto(0)}</span>}
              </>
            ) : (
              <span>{moneyAuto(s.flat)}</span>
            )}
          </div>
        </header>

        {rows.length === 0 ? (
          <p className="muted block-empty">Nada aqui ainda.</p>
        ) : (
          <ul className="rows">
            {rows.map((r) => (
              <li key={r.key} className={`row row-${r.kind}`}>
                <div className="row-main">
                  <strong>{r.label}</strong>
                  {r.manual && <span className="badge" title="Valor escrito à mão">editado</span>}
                  {r.qtyText && <small className="muted">{r.qtyText}</small>}
                </div>
                {hasBasis && r.basis && <span className="chip">{BASIS_LABEL[r.basis]}</span>}
                <span className="row-cost">{moneyAuto(r.amount)}</span>
                <div className="row-actions-inline">
                  {r.kind === 'line' && r.line && (
                    <button
                      className="link-btn"
                      onClick={() =>
                        setLineDlg({ section: r.line!.section, kind: r.line!.ingredient_id ? 'ingredient' : 'recipe', line: r.line })
                      }
                    >
                      Editar
                    </button>
                  )}
                  {r.kind === 'extra' && r.extra && (
                    <button className="link-btn" onClick={() => setExtraDlg({ extra: r.extra })}>
                      Editar
                    </button>
                  )}
                  {r.kind === 'inherited' && <span className="muted small">automático</span>}
                  {r.kind === 'line' && r.line && (
                    <button className="icon-btn small" aria-label={`Remover ${r.label}`} onClick={() => void remove(T.items, r.line!.id, r.label)}>
                      ×
                    </button>
                  )}
                  {r.kind === 'extra' && r.extra && (
                    <button className="icon-btn small" aria-label={`Remover ${r.label}`} onClick={() => void remove(T.extras, r.extra!.id, r.label)}>
                      ×
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="block-add">{actions}</div>
      </section>
    )
  }

  return (
    <div className="builder">
      {renderBlock(
        'Produto',
        owner === 'recipe' ? 'Ingredientes e outras receitas' : 'Receita, ingredientes extras e coberturas',
        blocks.prod,
        <>
          <button className="btn btn-small" onClick={() => setLineDlg({ section: 'PRODUCT', kind: 'ingredient' })}>
            + Ingrediente
          </button>
          <button className="btn btn-small" onClick={() => setLineDlg({ section: 'PRODUCT', kind: 'recipe' })}>
            + Receita
          </button>
        </>,
      )}
      {renderBlock(
        'Embalagem',
        owner === 'recipe' ? 'Formas, caixas, adesivos…' : 'Formas, bolha, adesivos… (por unidade vendida ou por tanda)',
        blocks.pack,
        <button className="btn btn-small" onClick={() => setLineDlg({ section: 'PACKAGING', kind: 'ingredient' })}>
          + Embalagem
        </button>,
      )}
      {renderBlock(
        'Mão de obra',
        'Tempo de trabalho, energia, gás e perdas',
        blocks.lab,
        <button className="btn btn-small" onClick={() => setExtraDlg({})}>
          + Mão de obra ou custo extra
        </button>,
      )}

      <LineDialog
        key={lineDlg ? `${lineDlg.line?.id ?? 'new'}-${lineDlg.section}-${lineDlg.kind}` : 'none'}
        state={lineDlg}
        {...props}
        onClose={() => setLineDlg(null)}
        onSaved={async () => {
          setLineDlg(null)
          await onChanged()
        }}
      />
      <ExtraDialog
        key={extraDlg ? (extraDlg.extra?.id ?? 'new') : 'none'}
        state={extraDlg}
        {...props}
        onClose={() => setExtraDlg(null)}
        onSaved={async () => {
          setExtraDlg(null)
          await onChanged()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- línea (ingrediente o receta)
type LineDialogProps = Props & {
  state: { section: Section; kind: 'ingredient' | 'recipe'; line?: CostLine } | null
  onClose: () => void
  onSaved: () => Promise<void>
}

function LineDialog({ state, owner, ownerId, companyId, ingredients, recipes, onClose, onSaved }: LineDialogProps) {
  const toast = useToast()
  const T = TABLES[owner]
  const line = state?.line
  const kind = state?.kind ?? 'ingredient'
  const section = state?.section ?? 'PRODUCT'

  const [itemId, setItemId] = useState(line ? (line.ingredient_id ?? line.recipe_id ?? '') : '')
  const initIng = line?.ingredient_id ? ingredients.find((i) => i.id === line.ingredient_id) : undefined
  const bigInit = Boolean(initIng && initIng.unit !== 'unit' && Number(line!.quantity) >= 1000)
  const [qty, setQty] = useState(
    line ? String(bigInit ? Number(line.quantity) / 1000 : Number(line.quantity)).replace('.', ',') : '',
  )
  const [unit, setUnit] = useState<PurchaseUnit>(
    initIng ? (bigInit ? FAMILY_UNITS[initIng.unit][0] : FAMILY_UNITS[initIng.unit].slice(-1)[0]) : 'g',
  )
  const [basis, setBasis] = useState<Basis>(line?.basis ?? (section === 'PACKAGING' ? 'UNIT' : 'BATCH'))
  const [manual, setManual] = useState(line?.manual_cost != null ? String(line.manual_cost).replace('.', ',') : '')
  const [busy, setBusy] = useState(false)

  const ing = kind === 'ingredient' ? ingredients.find((i) => i.id === itemId) : undefined
  const rec = kind === 'recipe' ? recipes.find((r) => r.recipe_id === itemId) : undefined

  const typedQty = parseNum(qty)
  const calc =
    ing && typedQty > 0
      ? toBase(typedQty, unit) * Number(ing.cost)
      : rec && typedQty > 0
        ? typedQty * Number(rec.total_cost)
        : null

  function pickIngredient(id: string) {
    setItemId(id)
    const i = ingredients.find((x) => x.id === id)
    if (i) setUnit(FAMILY_UNITS[i.unit][i.unit === 'unit' ? 0 : 1])
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!itemId) return toast('Escolha um item.', 'error')
    if (!(typedQty > 0)) return toast('Informe uma quantidade válida.', 'error')
    const m = manual.trim() ? parseNum(manual) : null
    if (m !== null && !(m >= 0)) return toast('Custo manual inválido.', 'error')

    const payload: Record<string, unknown> = {
      quantity: ing ? toBase(typedQty, unit) : typedQty,
      manual_cost: m,
      section,
    }
    if (owner === 'product') payload.basis = basis

    setBusy(true)
    const base = { ...payload, [kind === 'ingredient' ? 'ingredient_id' : T.sub]: itemId }
    const { error } = line
      ? await supabase.from(T.items).update(base).eq('id', line.id)
      : await supabase.from(T.items).insert({ ...base, company_id: companyId, [T.fk]: ownerId })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(line ? 'Linha atualizada' : 'Linha adicionada')
    await onSaved()
  }

  const title = `${line ? 'Editar' : 'Adicionar'} ${kind === 'recipe' ? 'receita' : section === 'PACKAGING' ? 'embalagem' : 'ingrediente'}`
  const usable = ingredients.filter((i) => i.active || i.id === itemId)

  return (
    <Dialog open={state !== null} onClose={onClose} title={title}>
      <form className="form" onSubmit={submit}>
        {kind === 'ingredient' ? (
          <div className="field">
            <label htmlFor="cl-item">Ingrediente</label>
            <select id="cl-item" value={itemId} onChange={(e) => pickIngredient(e.target.value)} required autoFocus>
              <option value="">Escolha…</option>
              {usable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="cl-item">Receita</label>
            <select id="cl-item" value={itemId} onChange={(e) => setItemId(e.target.value)} required autoFocus>
              <option value="">Escolha…</option>
              {recipes
                .filter((r) => (r.active || r.recipe_id === itemId) && !(owner === 'recipe' && r.recipe_id === ownerId))
                .map((r) => (
                  <option key={r.recipe_id} value={r.recipe_id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {ing ? (
          <UnitQty id="cl-qty" label="Quantidade" base={ing.unit} value={qty} unit={unit} onValue={setQty} onUnit={setUnit} />
        ) : (
          <div className="field">
            <label htmlFor="cl-qty">{kind === 'recipe' ? 'Quantidade de tandas' : 'Quantidade'}</label>
            <input id="cl-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />
            {kind === 'recipe' && <small className="hint">Use 0,5 para meia tanda, 2 para duas tandas.</small>}
          </div>
        )}

        {owner === 'product' && (
          <div className="field">
            <label htmlFor="cl-basis">Esta quantidade é</label>
            <select id="cl-basis" value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
              <option value="BATCH">Por tanda (divide pelo rendimento)</option>
              <option value="UNIT">Por unidade vendida</option>
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="cl-manual">Custo manual (opcional)</label>
          <input
            id="cl-manual"
            inputMode="decimal"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={calc !== null ? moneyAuto(calc).replace('R$', '').trim() : 'Deixe vazio para calcular'}
          />
          <small className="hint">
            {calc !== null ? `Calculado: ${moneyAuto(calc)}. ` : ''}
            {manual.trim() ? 'Este valor substitui o calculado.' : 'Preencha só se quiser fixar o valor desta linha.'}
          </small>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------- mano de obra / otros costos
type ExtraDialogProps = Props & {
  state: { extra?: ExtraCost } | null
  onClose: () => void
  onSaved: () => Promise<void>
}

const HOURLY_KEY = 'doce-gestao.hourly-rate'
const readHourly = () => {
  try {
    return localStorage.getItem(HOURLY_KEY) ?? ''
  } catch {
    return ''
  }
}

function ExtraDialog({ state, owner, ownerId, companyId, onClose, onSaved }: ExtraDialogProps) {
  const toast = useToast()
  const T = TABLES[owner]
  const ex = state?.extra
  const [type, setType] = useState<ExtraType>(ex?.type ?? 'LABOR')
  const [description, setDescription] = useState(ex?.description ?? '')
  const [minutes, setMinutes] = useState(ex?.minutes ? String(ex.minutes).replace('.', ',') : '')
  const [hourly, setHourly] = useState(ex?.hourly_rate ? String(ex.hourly_rate).replace('.', ',') : readHourly())
  const [amount, setAmount] = useState(ex ? String(ex.amount).replace('.', ',') : '')
  const [basis, setBasis] = useState<Basis>(ex?.basis ?? 'BATCH')
  const [busy, setBusy] = useState(false)

  function recompute(nextMinutes: string, nextHourly: string) {
    const m = parseNum(nextMinutes)
    const h = parseNum(nextHourly)
    if (m > 0 && h >= 0) setAmount(laborFromTime(m, h).toFixed(2).replace('.', ','))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const a = parseNum(amount)
    if (!(a >= 0)) return toast('Informe o valor em reais.', 'error')
    const m = minutes.trim() ? parseNum(minutes) : null
    const h = hourly.trim() ? parseNum(hourly) : null
    if ((m !== null && !(m >= 0)) || (h !== null && !(h >= 0))) return toast('Tempo ou valor por hora inválido.', 'error')

    const payload: Record<string, unknown> = {
      type,
      description: description.trim() || null,
      minutes: type === 'LABOR' ? m : null,
      hourly_rate: type === 'LABOR' ? h : null,
      amount: a,
    }
    if (owner === 'product') payload.basis = basis

    setBusy(true)
    const { error } = ex
      ? await supabase.from(T.extras).update(payload).eq('id', ex.id)
      : await supabase.from(T.extras).insert({ ...payload, company_id: companyId, [T.fk]: ownerId })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    if (type === 'LABOR' && h !== null) {
      try {
        localStorage.setItem(HOURLY_KEY, hourly)
      } catch {
        /* ignora */
      }
    }
    toast(ex ? 'Custo atualizado' : 'Custo adicionado')
    await onSaved()
  }

  return (
    <Dialog open={state !== null} onClose={onClose} title={ex ? 'Editar mão de obra / custo' : 'Mão de obra ou custo extra'}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="ex-type">Tipo</label>
          <select id="ex-type" value={type} onChange={(e) => setType(e.target.value as ExtraType)} autoFocus>
            {(Object.keys(EXTRA_LABEL) as ExtraType[]).map((t) => (
              <option key={t} value={t}>
                {EXTRA_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ex-desc">Descrição (opcional)</label>
          <input id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: enrolar e decorar" />
        </div>

        {type === 'LABOR' && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="ex-min">Tempo (minutos)</label>
              <input
                id="ex-min"
                inputMode="decimal"
                value={minutes}
                onChange={(e) => {
                  setMinutes(e.target.value)
                  recompute(e.target.value, hourly)
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="ex-rate">Valor da sua hora (R$)</label>
              <input
                id="ex-rate"
                inputMode="decimal"
                value={hourly}
                onChange={(e) => {
                  setHourly(e.target.value)
                  recompute(minutes, e.target.value)
                }}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="ex-amount">Valor (R$)</label>
          <input id="ex-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0,00" />
          {type === 'LABOR' && <small className="hint">Calculado com tempo × valor da hora, mas você pode ajustar à mão.</small>}
        </div>

        {owner === 'product' && (
          <div className="field">
            <label htmlFor="ex-basis">Este valor é</label>
            <select id="ex-basis" value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
              <option value="BATCH">Por tanda (divide pelo rendimento)</option>
              <option value="UNIT">Por unidade vendida</option>
            </select>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
