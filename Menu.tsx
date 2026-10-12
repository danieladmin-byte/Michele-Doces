import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import logoImg from './logo-transparente.png'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { ProductThumb } from './ProductThumb'
import { friendlyError } from './errors'
import { brl } from './format'
import { addPixAccount, productImageUrl, removePixAccount } from './images'
import { KIND_INFO, TITLE_PRESETS, useMenuData } from './menuData'
import type { MenuRow } from './menuData'
import { downloadMenuImages, downloadMenuPdf, renderMenu } from './menuImage'
import type { MenuKind } from './types'

const CUSTOM = '__custom__'

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Cardápio colorido (estilo "Sabores Disponíveis") para postar no Instagram e WhatsApp. */
export function MenuOnline() {
  return <MenuEditor kind="ONLINE" />
}

/** Cardápio de fundo branco, simples e barato de imprimir. */
export function MenuPrint() {
  return <MenuEditor kind="PRINT" />
}

function MenuEditor({ kind }: { kind: MenuKind }) {
  const { company } = useAuth()
  const toast = useToast()
  const m = useMenuData(kind)
  const { settings, rows, flavors, kitRows, selectedPix, render } = m
  const [clientMode, setClientMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addingPix, setAddingPix] = useState(false)
  const [busy, setBusy] = useState<'' | 'pdf' | 'img'>('')
  const online = kind === 'ONLINE'
  const editing = !clientMode || online
  const logoUrl = company?.logo_path ? supabase.storage.from('company-logos').getPublicUrl(company.logo_path).data.publicUrl : logoImg

  async function download(what: 'pdf' | 'img') {
    setBusy(what)
    try {
      const base = `${slug(settings.title) || 'cardapio'}-${kind === 'ONLINE' ? 'online' : 'imprimir'}`
      if (what === 'pdf') await downloadMenuPdf(render, base)
      else await downloadMenuImages(render, base)
    } catch (err) {
      toast(`Não consegui gerar o arquivo. ${friendlyError(err)}`, 'error')
    } finally {
      setBusy('')
    }
  }

  async function clearAll() {
    if (rows.length === 0) return
    if (!window.confirm(`Limpar o ${KIND_INFO[kind].name.toLowerCase()}? Os produtos e kits continuam cadastrados.`)) return
    await m.clearAll()
  }

  async function deletePix() {
    if (!selectedPix) return
    if (!window.confirm(`Excluir o QR Code “${selectedPix.name}”?`)) return
    try {
      await removePixAccount(selectedPix.id, selectedPix.image_path)
      toast('QR Code excluído')
      await m.reload()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const empty = !m.loading && rows.length === 0

  return (
    <div className={online ? 'menu-online' : 'menu-page'}>
      <header className="page-head with-action no-print">
        <div>
          <h1>{KIND_INFO[kind].name}</h1>
          <p className="sub">
            {online
              ? 'Arte colorida para postar no Instagram e mandar no WhatsApp.'
              : 'Fundo branco, para imprimir gastando pouca tinta.'}
          </p>
        </div>
        <div className="block-add">
          {editing && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Adicionar sabores e kits
            </button>
          )}
          {!online && (
            <button className="btn" onClick={() => setClientMode((v) => !v)} aria-pressed={clientMode}>
              {clientMode ? 'Voltar a editar' : 'Modo cliente'}
            </button>
          )}
        </div>
      </header>

      {editing && (
        <section className="panel menu-settings no-print" aria-label="Ajustes do cardápio">
          <TitleField value={settings.title} onSave={(title) => void m.saveSettings({ title })} />
          <div className="menu-checks">
            <label className="check">
              <input type="checkbox" checked={settings.show_qr} onChange={(e) => void m.saveSettings({ show_qr: e.target.checked })} />
              Mostrar QR Code PIX
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.show_prices} onChange={(e) => void m.saveSettings({ show_prices: e.target.checked })} />
              Mostrar o preço de cada sabor
            </label>
          </div>

          {settings.show_qr && (
            <div className="pix-controls">
              {m.pix.length > 0 && (
                <div className="field">
                  <label htmlFor="pix-sel">Conta PIX</label>
                  <select id="pix-sel" value={selectedPix?.id ?? ''} onChange={(e) => void m.saveSettings({ pix_id: e.target.value || null })}>
                    <option value="">Nenhuma</option>
                    {m.pix.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="block-add">
                <button className="btn btn-small" onClick={() => setAddingPix(true)}>
                  {m.pix.length > 0 ? 'Adicionar outra conta' : 'Adicionar QR Code PIX'}
                </button>
                {selectedPix && (
                  <button className="link-btn" onClick={() => void deletePix()}>
                    Excluir este QR
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="menu-export">
            <button className="btn" disabled={busy !== '' || empty} onClick={() => void download('pdf')}>
              {busy === 'pdf' ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
            <button className="btn" disabled={busy !== '' || empty} onClick={() => void download('img')}>
              {busy === 'img' ? 'Gerando imagem…' : 'Baixar imagem'}
            </button>
            {!online && (
              <button className="btn" disabled={empty} onClick={() => window.print()}>
                Imprimir
              </button>
            )}
          </div>
        </section>
      )}

      {m.loading ? (
        <p className="muted">Carregando…</p>
      ) : empty ? (
        <div className="empty-block">
          <strong>Este cardápio está vazio.</strong>
          <p>Escolha os sabores e kits disponíveis. Eles aparecem com foto, nome e preço, prontos para mostrar ao cliente.</p>
          {editing && (
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                Adicionar sabores e kits
              </button>
            </div>
          )}
        </div>
      ) : online ? (
        <OnlinePreview render={render} title={settings.title}>
          <MenuRows rows={flavors} label="Sabores" showPrice={settings.show_prices} editing onMove={m.move} onRemove={m.removeItem} />
          <MenuRows rows={kitRows} label="Kits" showPrice editing onMove={m.move} onRemove={m.removeItem} />
          <p className="menu-tools">
            <button className="link-btn" onClick={() => void clearAll()}>
              Limpar cardápio
            </button>
          </p>
        </OnlinePreview>
      ) : (
        <>
          <div className="menu-sheet">
            <div className={`menu-brand ${clientMode ? 'big' : ''}`}>
              <img src={logoUrl} alt={company?.name ?? 'Logo'} />
            </div>
            <div className="menu-title">
              <h2>{settings.title}</h2>
              <p className="sub">{render.dateLabel}</p>
            </div>
            <MenuRows rows={flavors} showPrice={settings.show_prices} editing={editing} onMove={m.move} onRemove={m.removeItem} />
            {kitRows.length > 0 && <h3 className="menu-sub">Kits</h3>}
            <MenuRows rows={kitRows} showPrice editing={editing} onMove={m.move} onRemove={m.removeItem} />

            {settings.show_qr && (
              <section className="panel pix-panel">
                <h3 className="section-title">Pague com PIX</h3>
                {selectedPix ? (
                  <figure className="pix-figure">
                    <img src={productImageUrl(selectedPix.image_path) ?? ''} alt={`QR Code PIX: ${selectedPix.name}`} className="pix-img" />
                    <figcaption>{selectedPix.name}</figcaption>
                  </figure>
                ) : (
                  <div className="pix-empty no-print">
                    {clientMode ? 'QR Code PIX não definido.' : 'Escolha ou adicione o QR Code PIX nos ajustes acima.'}
                  </div>
                )}
              </section>
            )}
          </div>
          {editing && (
            <p className="menu-tools no-print">
              <button className="link-btn" onClick={() => void clearAll()}>
                Limpar cardápio
              </button>
            </p>
          )}
        </>
      )}

      <AddItemsDialog open={adding} data={m} onClose={() => setAdding(false)} />
      <AddPixDialog
        open={addingPix}
        onClose={() => setAddingPix(false)}
        onSaved={async (id) => {
          setAddingPix(false)
          await m.saveSettings({ pix_id: id })
          await m.reload()
          toast('QR Code salvo')
        }}
      />
    </div>
  )
}

// ------------------------------------------------------------------ título
function TitleField({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  const [custom, setCustom] = useState(!TITLE_PRESETS.includes(value))
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
    if (!TITLE_PRESETS.includes(value)) setCustom(true)
  }, [value])

  function commit() {
    const t = draft.trim()
    if (!t) return setDraft(value)
    if (t !== value) onSave(t)
  }

  return (
    <div className="menu-title-field">
      <div className="field">
        <label htmlFor="menu-title-sel">Título do cardápio</label>
        <select
          id="menu-title-sel"
          value={custom ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) return setCustom(true)
            setCustom(false)
            onSave(e.target.value)
          }}
        >
          {TITLE_PRESETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={CUSTOM}>Outro título…</option>
        </select>
      </div>
      {custom && (
        <div className="field">
          <label htmlFor="menu-title-txt">Seu título</label>
          <input
            id="menu-title-txt"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            placeholder="Ex.: Especial de Páscoa"
          />
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ lista de itens
function MenuRows({
  rows,
  label,
  showPrice,
  editing,
  onMove,
  onRemove,
}: {
  rows: MenuRow[]
  label?: string
  showPrice: boolean
  editing: boolean
  onMove: (itemId: string, dir: -1 | 1) => void | Promise<void>
  onRemove: (itemId: string) => void | Promise<void>
}) {
  if (rows.length === 0) return null
  return (
    <>
      {label && <h3 className="menu-sub no-print">{label}</h3>}
      <ul className="menu-list">
        {rows.map((r, i) => (
          <li key={r.itemId} className="menu-row">
            <ProductThumb name={r.name} path={r.image} size="md" />
            <div className="menu-name">
              <strong>{r.name}</strong>
              {r.detail && <small>{r.detail}</small>}
            </div>
            {showPrice && <span className="menu-price">{brl(r.price)}</span>}
            {editing && (
              <span className="menu-move no-print">
                <button className="icon-btn small" aria-label={`Subir ${r.name}`} disabled={i === 0} onClick={() => void onMove(r.itemId, -1)}>
                  ↑
                </button>
                <button className="icon-btn small" aria-label={`Descer ${r.name}`} disabled={i === rows.length - 1} onClick={() => void onMove(r.itemId, 1)}>
                  ↓
                </button>
                <button className="icon-btn small" aria-label={`Tirar ${r.name} do cardápio`} onClick={() => void onRemove(r.itemId)}>
                  ×
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

// ------------------------------------------------------------------ prévia da imagem (cardápio online)
function OnlinePreview({ render, title, children }: { render: ReturnType<typeof useMenuData>['render']; title: string; children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [state, setState] = useState<'busy' | 'ok' | 'error'>('busy')

  // Redesenha quando algo muda (com uma pequena espera para não desenhar a cada clique).
  const key = useMemo(() => JSON.stringify(render), [render])
  useEffect(() => {
    let cancelled = false
    setState('busy')
    const t = setTimeout(async () => {
      try {
        const [canvas] = await renderMenu(JSON.parse(key))
        if (cancelled) return
        setUrl(canvas.toDataURL('image/jpeg', 0.88))
        setSize({ w: canvas.width, h: canvas.height })
        setState('ok')
      } catch {
        if (!cancelled) setState('error')
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [key])

  const tall = size && size.h > size.w * 1.25

  return (
    <div className="menu-online-grid">
      <div className="menu-preview">
        {url && <img src={url} alt={`Prévia: ${title}`} className={state === 'busy' ? 'is-busy' : ''} />}
        {state === 'busy' && <p className="muted small">Gerando prévia…</p>}
        {state === 'error' && <p className="muted small">Não consegui desenhar a prévia. Confira as fotos e tente de novo.</p>}
        {size && <p className="hint">{`${size.w} × ${size.h} px`}</p>}
        {tall && (
          <p className="hint">
            Esta arte ficou comprida. No feed do Instagram o ideal é até 1080 × 1350 px; para ficar menor, tire alguns itens ou desligue o QR Code.
          </p>
        )}
      </div>
      <div className="menu-edit">{children}</div>
    </div>
  )
}

// ------------------------------------------------------------------ adicionar sabores e kits
function AddItemsDialog({ open, data, onClose }: { open: boolean; data: ReturnType<typeof useMenuData>; onClose: () => void }) {
  const [tab, setTab] = useState<'p' | 'k'>('p')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPicked(new Set())
      setQuery('')
      setTab('p')
    }
  }, [open])

  const inMenu = useMemo(() => new Set(data.items.map((i) => (i.price_id ? `p:${i.price_id}` : `k:${i.kit_price_id}`))), [data.items])
  const q = query.trim().toLowerCase()

  const products = data.margins
    .filter((x) => x.product_name.toLowerCase().includes(q))
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'pt-BR') || a.price - b.price)
  const kits = data.kitPrices
    .map((kp) => ({ kp, kit: data.kitById.get(kp.kit_id) }))
    .filter((x): x is { kp: (typeof data.kitPrices)[number]; kit: NonNullable<typeof x.kit> } => !!x.kit && x.kit.active && x.kit.name.toLowerCase().includes(q))
    .sort((a, b) => a.kit.name.localeCompare(b.kit.name, 'pt-BR') || a.kp.price - b.kp.price)

  function toggle(key: string) {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  async function add() {
    setBusy(true)
    const keys = [...picked]
    const ok = await data.addItems({
      priceIds: keys.filter((k) => k.startsWith('p:')).map((k) => k.slice(2)),
      kitPriceIds: keys.filter((k) => k.startsWith('k:')).map((k) => k.slice(2)),
    })
    setBusy(false)
    if (ok) onClose()
  }

  const count = (prefix: string) => [...picked].filter((k) => k.startsWith(prefix)).length

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar ao cardápio">
      <div className="tabs" role="tablist" aria-label="O que adicionar">
        <button role="tab" aria-selected={tab === 'p'} className={`tab ${tab === 'p' ? 'on' : ''}`} onClick={() => setTab('p')}>
          Sabores {count('p:') > 0 && <small>{count('p:')}</small>}
        </button>
        <button role="tab" aria-selected={tab === 'k'} className={`tab ${tab === 'k' ? 'on' : ''}`} onClick={() => setTab('k')}>
          Kits {count('k:') > 0 && <small>{count('k:')}</small>}
        </button>
      </div>
      <div className="field">
        <input type="search" placeholder={tab === 'p' ? 'Buscar produto' : 'Buscar kit'} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar" />
      </div>
      <ul className="pick-list">
        {tab === 'p' && products.length === 0 && <li className="muted">Nenhum produto com preço encontrado.</li>}
        {tab === 'k' && kits.length === 0 && <li className="muted">Nenhum kit com preço encontrado. Crie o kit e defina o preço na aba Kits.</li>}
        {tab === 'p' &&
          products.map((x) => {
            const key = `p:${x.price_id}`
            const already = inMenu.has(key)
            const d = data.detailOf(x)
            return (
              <li key={key}>
                <label className={`pick-row ${already ? 'is-off' : ''}`}>
                  <input type="checkbox" checked={already || picked.has(key)} disabled={already} onChange={() => toggle(key)} />
                  <ProductThumb name={x.product_name} path={data.photos.get(x.product_id)} size="sm" />
                  <span className="pick-name">
                    {x.product_name}
                    {d && <small>{d}</small>}
                    {already && <small>já está no cardápio</small>}
                  </span>
                  <b>{brl(Number(x.price))}</b>
                </label>
              </li>
            )
          })}
        {tab === 'k' &&
          kits.map(({ kp, kit }) => {
            const key = `k:${kp.id}`
            const already = inMenu.has(key)
            const d = data.kitDetailOf(kp)
            return (
              <li key={key}>
                <label className={`pick-row ${already ? 'is-off' : ''}`}>
                  <input type="checkbox" checked={already || picked.has(key)} disabled={already} onChange={() => toggle(key)} />
                  <ProductThumb name={kit.name} path={kit.image_path} size="sm" />
                  <span className="pick-name">
                    {kit.name}
                    {d && <small>{d}</small>}
                    {already && <small>já está no cardápio</small>}
                  </span>
                  <b>{brl(kp.price)}</b>
                </label>
              </li>
            )
          })}
      </ul>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy || picked.size === 0} onClick={() => void add()}>
          {picked.size > 0 ? `Adicionar (${picked.size})` : 'Adicionar'}
        </button>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ QR Code PIX
function AddPixDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void | Promise<void> }) {
  const { company } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setFile(null)
    }
  }, [open])

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company || !file) return
    setBusy(true)
    try {
      const id = await addPixAccount(company.id, name.trim(), file)
      await onSaved(id)
    } catch (err) {
      toast(`Não consegui salvar o QR Code. ${friendlyError(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="QR Code PIX">
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="pix-name">Nome da conta</label>
          <input id="pix-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Nubank da Michele" />
        </div>
        <div className="field">
          <label htmlFor="pix-file">Imagem do QR Code</label>
          <input id="pix-file" ref={fileRef} type="file" accept="image/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <small className="hint">Pode ser um print do QR Code do seu banco. Use a imagem inteira, sem cortar as bordas.</small>
        </div>
        {preview && <img src={preview} alt="Pré-visualização do QR Code" className="pix-img pix-preview" />}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !file || !name.trim()}>
            {busy ? 'Salvando…' : 'Salvar QR Code'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
