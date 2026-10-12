import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { ProductThumb } from './ProductThumb'
import { friendlyError } from './errors'
import { BASE_LABEL, dec, moneyAuto, num, parseNum } from './format'
import { marginTone, pct, roundUp, suggestedPrice, times } from './pricing'
import { removeKitImage, setKitImagePath, uploadKitImage } from './images'
import { PhotoPicker } from './PhotoPicker'
import { useKitData } from './kitData'
import type { FormatCost } from './types'


/** Campo numérico que grava ao sair do campo (blur) só se o valor mudou. */
function CommitInput({ value, onCommit, label, width }: { value: number; onCommit: (n: number) => unknown; label: string; width?: number }) {
  const [text, setText] = useState(dec(value))
  useEffect(() => setText(dec(value)), [value])
  return (
    <input
      className="mini-input"
      style={width ? { width } : undefined}
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = parseNum(text)
        if (n > 0 && n !== value) void onCommit(n)
        else setText(dec(value))
      }}
    />
  )
}

export function KitDetail() {
  const { id } = useParams()
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const d = useKitData()
  const kit = d.kits.find((k) => k.id === id)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [savingInfo, setSavingInfo] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)
  const [packIng, setPackIng] = useState('')
  const [packQty, setPackQty] = useState('1')
  const [extraDesc, setExtraDesc] = useState('')
  const [extraAmt, setExtraAmt] = useState('')
  const [priceName, setPriceName] = useState('Varejo')
  const [priceVal, setPriceVal] = useState('')
  const [margin, setMargin] = useState('60')

  useEffect(() => {
    if (!kit) return
    setName(kit.name)
    setDescription(kit.description ?? '')
    setActive(kit.active)
  }, [kit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = d.items.filter((i) => i.kit_id === id)
  const pack = d.packaging.filter((i) => i.kit_id === id)
  const extras = d.extras.filter((i) => i.kit_id === id)
  const prices = d.prices.filter((i) => i.kit_id === id)
  const totalUnits = items.reduce((a, i) => a + i.quantity, 0)
  const cost = id ? d.costOf(id) : { products: 0, packaging: 0, extras: 0, total: 0 }

  const ingGroups = useMemo(() => {
    const cats = [...d.ingCategories]
    const rank = (n: string) => (n.toLowerCase().includes('embal') ? 0 : 1)
    cats.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'pt-BR'))
    const groups = cats.map((c) => ({ id: c.id, name: c.name, list: d.ingredients.filter((i) => i.category_id === c.id) }))
    groups.push({ id: 'none', name: 'Sem categoria', list: d.ingredients.filter((i) => !i.category_id || !cats.some((c) => c.id === i.category_id)) })
    return groups.filter((g) => g.list.length > 0)
  }, [d.ingCategories, d.ingredients])

  async function run(op: PromiseLike<{ error: unknown }>, ok?: string) {
    const { error } = await op
    if (error) {
      toast(friendlyError(error), 'error')
      return false
    }
    if (ok) toast(ok)
    await d.reload()
    return true
  }

  if (d.loading) return <p className="muted">Carregando…</p>
  if (!kit || !company || !id) {
    return (
      <>
        <Link to="/kits" className="back">← Kits</Link>
        <p className="muted">Kit não encontrado.</p>
      </>
    )
  }

  async function saveInfo(e: FormEvent) {
    e.preventDefault()
    setSavingInfo(true)
    await run(supabase.from('kits').update({ name: name.trim(), description: description.trim() || null, active }).eq('id', kit!.id), 'Kit atualizado')
    setSavingInfo(false)
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Escolha um arquivo de imagem.', 'error')
    setPhotoBusy(true)
    try {
      await uploadKitImage(company!.id, kit!.id, file, kit!.image_path)
      toast('Foto atualizada')
      await d.reload()
    } catch (err) {
      toast(`Não consegui enviar a foto. ${friendlyError(err)}`, 'error')
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onCatalogPick(path: string | null) {
    setPicking(false)
    if (!path) return
    setPhotoBusy(true)
    try {
      await setKitImagePath(kit!.id, path, kit!.image_path)
      toast('Foto atualizada')
      await d.reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function onRemovePhoto() {
    if (!window.confirm('Remover a foto deste kit?')) return
    setPhotoBusy(true)
    try {
      await removeKitImage(kit!.id, kit!.image_path)
      toast('Foto removida')
      await d.reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function addProduct(f: FormatCost, qty: number) {
    const ok = await run(supabase.from('kit_items').insert({ company_id: company!.id, kit_id: kit!.id, format_id: f.format_id, quantity: qty }))
    if (ok) toast(`${num(qty)}× ${f.product_name} adicionado`)
  }

  async function addPack(e: FormEvent) {
    e.preventDefault()
    const q = parseNum(packQty)
    if (!packIng || !(q > 0)) return toast('Escolha a embalagem e a quantidade.', 'error')
    const ok = await run(supabase.from('kit_packaging').insert({ company_id: company!.id, kit_id: kit!.id, ingredient_id: packIng, quantity: q }))
    if (ok) {
      setPackIng('')
      setPackQty('1')
    }
  }

  async function addExtra(e: FormEvent) {
    e.preventDefault()
    const a = parseNum(extraAmt)
    if (!extraDesc.trim() || !(a >= 0) || extraAmt.trim() === '') return toast('Informe a descrição e o valor.', 'error')
    const ok = await run(supabase.from('kit_extras').insert({ company_id: company!.id, kit_id: kit!.id, description: extraDesc.trim(), amount: a }))
    if (ok) {
      setExtraDesc('')
      setExtraAmt('')
    }
  }

  async function addPrice(e: FormEvent) {
    e.preventDefault()
    const v = parseNum(priceVal)
    if (!priceName.trim() || !(v > 0)) return toast('Informe o nome e o preço.', 'error')
    const ok = await run(supabase.from('kit_prices').insert({ company_id: company!.id, kit_id: kit!.id, name: priceName.trim(), price: v }))
    if (ok) setPriceVal('')
  }

  async function removeKit() {
    if (!window.confirm(`Excluir o kit “${kit!.name}”? Orçamentos já feitos não mudam.`)) return
    if (await run(supabase.from('kits').delete().eq('id', kit!.id))) {
      if (kit!.image_path && !kit!.image_path.includes('/cat-')) await supabase.storage.from('product-images').remove([kit!.image_path])
      navigate('/kits')
    }
  }

  const sugg = suggestedPrice(cost.total, parseNum(margin) / 100)

  return (
    <>
      <header className="page-head with-action">
        <div>
          <Link to="/kits" className="back">← Kits</Link>
          <div className="title-row">
            <ProductThumb name={kit.name} path={kit.image_path} size="lg" />
            <h1>{kit.name}</h1>
          </div>
          <div className="photo-actions">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
            <button className="btn" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? 'Enviando…' : kit.image_path ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            <button className="btn" disabled={photoBusy} onClick={() => setPicking(true)}>
              Escolher do catálogo
            </button>
            {kit.image_path && !photoBusy && (
              <button className="link-btn" onClick={() => void onRemovePhoto()}>
                Remover foto
              </button>
            )}
          </div>
          <p className="sub">Escolha os produtos prontos e a quantidade de cada um, some a embalagem e defina o preço.</p>
        </div>
      </header>

      <section className="summary-strip" aria-label="Custo do kit">
        <div><span>Produtos</span><strong>{moneyAuto(cost.products)}</strong></div>
        <div><span>Embalagem</span><strong>{moneyAuto(cost.packaging)}</strong></div>
        <div><span>Outros custos</span><strong>{moneyAuto(cost.extras)}</strong></div>
        <div className="is-total"><span>Custo do kit</span><strong>{moneyAuto(cost.total)}</strong></div>
        {totalUnits > 0 && <div><span>Custo por unidade</span><strong>{moneyAuto(cost.total / totalUnits)}</strong></div>}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2 className="section-title">Produtos do kit</h2>
          <button className="btn btn-primary btn-small" onClick={() => setAdding(true)}>
            Adicionar produto
          </button>
        </header>
        {items.length === 0 ? (
          <p className="muted">Nenhum produto ainda. Escolha, por exemplo, o Brigadeiro e a quantidade 4.</p>
        ) : (
          <ul className="kit-lines">
            {items.map((i) => {
              const f = d.formatById.get(i.format_id)
              const p = f ? d.productById.get(f.product_id) : undefined
              const multi = f ? d.formats.filter((x) => x.product_id === f.product_id).length > 1 : false
              return (
                <li key={i.id} className="kit-line">
                  <ProductThumb name={f?.product_name ?? '?'} path={p?.image_path} size="sm" />
                  <div className="kit-line-name">
                    <strong>{f?.product_name ?? 'Produto removido'}</strong>
                    {f && <small>{multi ? `${f.format_name} · ` : ''}custo {moneyAuto(f.cost_total)} cada</small>}
                  </div>
                  <label className="kit-qty">
                    <span>Qtde</span>
                    <CommitInput value={i.quantity} label={`Quantidade de ${f?.product_name ?? 'produto'}`} width={72} onCommit={(n) => run(supabase.from('kit_items').update({ quantity: n }).eq('id', i.id))} />
                  </label>
                  <span className="kit-line-cost">{moneyAuto(i.quantity * Number(f?.cost_total ?? 0))}</span>
                  <button className="icon-btn small" aria-label="Remover produto do kit" onClick={() => void run(supabase.from('kit_items').delete().eq('id', i.id))}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2 className="section-title">Embalagem do kit</h2>
        {pack.length > 0 && (
          <ul className="kit-lines">
            {pack.map((i) => {
              const ing = d.ingById.get(i.ingredient_id)
              return (
                <li key={i.id} className="kit-line">
                  <div className="kit-line-name">
                    <strong>{ing?.name ?? 'Item removido'}</strong>
                    {ing && <small>custo {moneyAuto(Number(ing.cost))} por {BASE_LABEL[ing.unit]}</small>}
                  </div>
                  <label className="kit-qty">
                    <span>{ing ? BASE_LABEL[ing.unit] : 'Qtde'}</span>
                    <CommitInput value={i.quantity} label="Quantidade de embalagem" width={72} onCommit={(n) => run(supabase.from('kit_packaging').update({ quantity: n }).eq('id', i.id))} />
                  </label>
                  <span className="kit-line-cost">{moneyAuto(i.quantity * Number(ing?.cost ?? 0))}</span>
                  <button className="icon-btn small" aria-label="Remover embalagem" onClick={() => void run(supabase.from('kit_packaging').delete().eq('id', i.id))}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form className="kit-add" onSubmit={addPack}>
          <div className="field">
            <label htmlFor="pk-ing">Adicionar embalagem</label>
            <select id="pk-ing" value={packIng} onChange={(e) => setPackIng(e.target.value)}>
              <option value="">Escolha caixa, fita, saquinho…</option>
              {ingGroups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.list.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({BASE_LABEL[i.unit]})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pk-qty">Quantidade</label>
            <input id="pk-qty" inputMode="decimal" value={packQty} onChange={(e) => setPackQty(e.target.value)} />
          </div>
          <button className="btn">Adicionar</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="section-title">Outros custos</h2>
        {extras.length > 0 && (
          <ul className="kit-lines">
            {extras.map((x) => (
              <li key={x.id} className="kit-line">
                <div className="kit-line-name">
                  <strong>{x.description}</strong>
                </div>
                <span className="kit-line-cost">{moneyAuto(x.amount)}</span>
                <button className="icon-btn small" aria-label="Remover custo" onClick={() => void run(supabase.from('kit_extras').delete().eq('id', x.id))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="kit-add" onSubmit={addExtra}>
          <div className="field">
            <label htmlFor="ex-d">Descrição</label>
            <input id="ex-d" value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} placeholder="Ex.: etiqueta, mão de obra para montar" />
          </div>
          <div className="field">
            <label htmlFor="ex-a">Valor (R$)</label>
            <input id="ex-a" inputMode="decimal" value={extraAmt} onChange={(e) => setExtraAmt(e.target.value)} placeholder="0,00" />
          </div>
          <button className="btn">Adicionar</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="section-title">Preços do kit</h2>
        {prices.length > 0 && (
          <ul className="kit-lines">
            {prices.map((p) => {
              const m = p.price > 0 ? (p.price - cost.total) / p.price : null
              return (
                <li key={p.id} className={`kit-line tone-${marginTone(m)}`}>
                  <div className="kit-line-name">
                    <strong>{p.name}</strong>
                    <small>
                      lucro {moneyAuto(p.price - cost.total)} · markup {times(cost.total > 0 ? p.price / cost.total : null)}
                      {totalUnits > 0 ? ` · ${moneyAuto(p.price / totalUnits)} por unidade` : ''}
                    </small>
                  </div>
                  <label className="kit-qty">
                    <span>R$</span>
                    <CommitInput value={p.price} label={`Preço ${p.name}`} width={92} onCommit={(n) => run(supabase.from('kit_prices').update({ price: n }).eq('id', p.id))} />
                  </label>
                  <span className={`pt-margin tone-${marginTone(m)}`}>{pct(m)}</span>
                  <button className="icon-btn small" aria-label="Remover preço" onClick={() => void run(supabase.from('kit_prices').delete().eq('id', p.id))}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form className="kit-add" onSubmit={addPrice}>
          <div className="field">
            <label htmlFor="pr-n">Nome do preço</label>
            <input id="pr-n" value={priceName} onChange={(e) => setPriceName(e.target.value)} placeholder="Varejo, Atacado…" />
          </div>
          <div className="field">
            <label htmlFor="pr-v">Preço (R$)</label>
            <input id="pr-v" inputMode="decimal" value={priceVal} onChange={(e) => setPriceVal(e.target.value)} placeholder="0,00" />
          </div>
          <button className="btn">Adicionar</button>
        </form>
        <div className="kit-suggest">
          <label htmlFor="pr-m">Quero uma margem de</label>
          <input id="pr-m" className="mini-input" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} style={{ width: 64 }} />
          <span>%</span>
          {sugg !== null && cost.total > 0 ? (
            <button type="button" className="link-btn" onClick={() => setPriceVal(dec(roundUp(sugg)))}>
              Sugerir {moneyAuto(roundUp(sugg))}
            </button>
          ) : (
            <small className="muted">Adicione produtos para ver a sugestão.</small>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Dados do kit</h2>
        <form className="form form-wide" onSubmit={saveInfo}>
          <div className="field">
            <label htmlFor="k-name">Nome</label>
            <input id="k-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="k-desc">Descrição (opcional)</label>
            <textarea id="k-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Kit ativo (aparece ao montar orçamentos)
          </label>
          <div className="dialog-actions">
            <button type="button" className="link-btn" onClick={() => void removeKit()}>
              Excluir kit
            </button>
            <button className="btn btn-primary" disabled={savingInfo || !name.trim()}>
              {savingInfo ? 'Salvando…' : 'Salvar dados'}
            </button>
          </div>
        </form>
      </section>

      <PhotoPicker open={picking} onClose={() => setPicking(false)} onPick={(p) => void onCatalogPick(p)} selected={kit.image_path} />
      <AddProductDialog open={adding} formats={d.formats} photos={d.productById} onClose={() => setAdding(false)} onAdd={addProduct} />
    </>
  )
}

function AddProductDialog({
  open,
  formats,
  photos,
  onClose,
  onAdd,
}: {
  open: boolean
  formats: FormatCost[]
  photos: Map<string, { image_path: string | null }>
  onClose: () => void
  onAdd: (f: FormatCost, qty: number) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setQuery('')
      setQty({})
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const list = formats
    .filter((f) => f.product_active && f.product_name.toLowerCase().includes(q))
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'pt-BR') || a.sort_order - b.sort_order)
  const multi = (productId: string) => formats.filter((x) => x.product_id === productId).length > 1

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar produto ao kit">
      <div className="field">
        <input type="search" placeholder="Buscar produto" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar produto" />
      </div>
      <ul className="pick-list">
        {list.length === 0 && <li className="muted">Nenhum produto encontrado.</li>}
        {list.map((f) => (
          <li key={f.format_id} className="pick-row kit-pick">
            <ProductThumb name={f.product_name} path={photos.get(f.product_id)?.image_path} size="sm" />
            <span className="pick-name">
              {f.product_name}
              <small>
                {multi(f.product_id) ? `${f.format_name} · ` : ''}custo {moneyAuto(f.cost_total)}
              </small>
            </span>
            <input
              className="mini-input"
              inputMode="decimal"
              aria-label={`Quantidade de ${f.product_name}`}
              value={qty[f.format_id] ?? '1'}
              onChange={(e) => setQty((s) => ({ ...s, [f.format_id]: e.target.value }))}
              style={{ width: 56 }}
            />
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                const n = parseNum(qty[f.format_id] ?? '1')
                if (n > 0) void onAdd(f, n)
              }}
            >
              Adicionar
            </button>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Pronto
        </button>
      </div>
    </Dialog>
  )
}
