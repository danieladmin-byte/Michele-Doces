import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import logoImg from './logo-transparente.png'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { ProductThumb } from './ProductThumb'
import { friendlyError } from './errors'
import { brl, num } from './format'
import { addPixAccount, productImageUrl, removePixAccount } from './images'
import type { MenuItem, PixAccount, PriceMargin } from './types'

type Row = {
  priceId: string
  productId: string
  name: string
  detail: string
  price: number
  image: string | null
}

function today() {
  const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Cardápio do dia: sabores escolhidos (foto, nome e preço) + QR Code PIX para o cliente pagar. */
export function Menu() {
  const { company, reload } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<MenuItem[]>([])
  const [margins, setMargins] = useState<PriceMargin[]>([])
  const [photos, setPhotos] = useState<Map<string, string | null>>(new Map())
  const [pix, setPix] = useState<PixAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [clientMode, setClientMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addingPix, setAddingPix] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!company) return
    const [mi, pm, pr, px] = await Promise.all([
      supabase.from('menu_items').select('id, price_id').eq('company_id', company.id),
      supabase.from('product_price_margins').select('*').eq('company_id', company.id),
      supabase.from('products').select('id, image_path').eq('company_id', company.id),
      supabase.from('pix_accounts').select('id, name, image_path').eq('company_id', company.id).order('created_at'),
    ])
    const err = mi.error ?? pm.error ?? pr.error ?? px.error
    if (err) toast(friendlyError(err), 'error')
    setItems((mi.data ?? []) as MenuItem[])
    setMargins(((pm.data ?? []) as PriceMargin[]).filter((m) => m.active))
    setPhotos(new Map(((pr.data ?? []) as { id: string; image_path: string | null }[]).map((p) => [p.id, p.image_path])))
    setPix((px.data ?? []) as PixAccount[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  // Nome do formato/preço só aparece quando faz diferença (vários formatos ou preços, ou kit).
  const detailOf = useCallback(
    (m: PriceMargin) => {
      const sameProduct = margins.filter((x) => x.product_id === m.product_id)
      const formats = new Set(sameProduct.map((x) => x.format_id))
      const inFormat = sameProduct.filter((x) => x.format_id === m.format_id)
      const parts: string[] = []
      if (formats.size > 1) parts.push(m.format_name)
      if (inFormat.length > 1 || m.bundle_size > 1) parts.push(m.bundle_size > 1 ? `${m.price_name} · ${num(m.bundle_size)} un` : m.price_name)
      return parts.join(' · ')
    },
    [margins],
  )

  const rows: Row[] = useMemo(() => {
    const byPrice = new Map(margins.map((m) => [m.price_id, m]))
    return items
      .map((it) => byPrice.get(it.price_id))
      .filter((m): m is PriceMargin => !!m)
      .map((m) => ({
        priceId: m.price_id,
        productId: m.product_id,
        name: m.product_name,
        detail: detailOf(m),
        price: Number(m.price),
        image: photos.get(m.product_id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.detail.localeCompare(b.detail, 'pt-BR'))
  }, [items, margins, photos, detailOf])

  const selectedPix = pix.find((p) => p.id === company?.menu_pix_id) ?? null
  const inMenu = useMemo(() => new Set(items.map((i) => i.price_id)), [items])

  async function addMany(priceIds: string[]) {
    if (!company || priceIds.length === 0) return
    setBusy(true)
    const { error } = await supabase.from('menu_items').insert(priceIds.map((price_id) => ({ company_id: company.id, price_id })))
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    setAdding(false)
    toast(priceIds.length === 1 ? 'Adicionado ao cardápio' : `${priceIds.length} itens adicionados`)
    await load()
  }

  async function removeOne(priceId: string) {
    const it = items.find((i) => i.price_id === priceId)
    if (!it) return
    const { error } = await supabase.from('menu_items').delete().eq('id', it.id)
    if (error) return toast(friendlyError(error), 'error')
    setItems((list) => list.filter((i) => i.id !== it.id))
  }

  async function clearAll() {
    if (!company || items.length === 0) return
    if (!window.confirm('Limpar o cardápio de hoje? Os produtos continuam cadastrados.')) return
    const { error } = await supabase.from('menu_items').delete().eq('company_id', company.id)
    if (error) return toast(friendlyError(error), 'error')
    await load()
  }

  async function choosePix(id: string) {
    if (!company) return
    const { error } = await supabase.from('companies').update({ menu_pix_id: id || null }).eq('id', company.id)
    if (error) return toast(friendlyError(error), 'error')
    await reload()
  }

  async function deletePix() {
    if (!selectedPix) return
    if (!window.confirm(`Excluir o QR Code “${selectedPix.name}”?`)) return
    try {
      await removePixAccount(selectedPix.id, selectedPix.image_path)
      toast('QR Code excluído')
      await reload()
      await load()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const qrUrl = productImageUrl(selectedPix?.image_path)
  const logoUrl = company?.logo_path ? supabase.storage.from('company-logos').getPublicUrl(company.logo_path).data.publicUrl : logoImg

  return (
    <div className="menu-page">
      <div className={`menu-brand ${clientMode ? 'big' : ''}`}>
        <img src={logoUrl} alt={company?.name ?? 'Logo'} />
      </div>
      <header className="page-head with-action">
        <div>
          <h1>Cardápio do dia</h1>
          <p className="sub">{today()}</p>
        </div>
        <div className="block-add no-print">
          {!clientMode && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Adicionar sabores
            </button>
          )}
          <button className="btn" onClick={() => setClientMode((v) => !v)} aria-pressed={clientMode}>
            {clientMode ? 'Voltar a editar' : 'Modo cliente'}
          </button>
          <button className="btn" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </header>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="empty-block">
          <strong>O cardápio de hoje está vazio.</strong>
          <p>Escolha os sabores disponíveis. Eles aparecem com foto, nome e preço, prontos para mostrar ao cliente.</p>
          {!clientMode && (
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                Adicionar sabores
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="menu-list">
          {rows.map((r) => (
            <li key={r.priceId} className="menu-row">
              <ProductThumb name={r.name} path={r.image} size="md" />
              <div className="menu-name">
                <strong>{r.name}</strong>
                {r.detail && <small>{r.detail}</small>}
              </div>
              <span className="menu-price">{brl(r.price)}</span>
              {!clientMode && (
                <button className="icon-btn no-print" aria-label={`Tirar ${r.name} do cardápio`} onClick={() => void removeOne(r.priceId)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!clientMode && rows.length > 0 && (
        <p className="menu-tools no-print">
          <button className="link-btn" onClick={() => void clearAll()}>
            Limpar cardápio
          </button>
        </p>
      )}

      <section className="panel pix-panel">
        <h2 className="section-title">Pague com PIX</h2>
        {qrUrl && selectedPix ? (
          <figure className="pix-figure">
            <img src={qrUrl} alt={`QR Code PIX: ${selectedPix.name}`} className="pix-img" />
            <figcaption>{selectedPix.name}</figcaption>
          </figure>
        ) : (
          <div className="pix-empty">
            {clientMode ? 'QR Code PIX não definido.' : 'Adicione o QR Code PIX da conta que vai receber os pagamentos.'}
          </div>
        )}

        {!clientMode && (
          <div className="pix-controls no-print">
            {pix.length > 0 && (
              <div className="field">
                <label htmlFor="pix-sel">Conta PIX de hoje</label>
                <select id="pix-sel" value={selectedPix?.id ?? ''} onChange={(e) => void choosePix(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {pix.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="block-add">
              <button className="btn" onClick={() => setAddingPix(true)}>
                {pix.length > 0 ? 'Adicionar outra conta' : 'Adicionar QR Code PIX'}
              </button>
              {selectedPix && (
                <button className="link-btn" onClick={() => void deletePix()}>
                  Excluir este QR
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <AddItemsDialog open={adding} margins={margins} photos={photos} inMenu={inMenu} detailOf={detailOf} busy={busy} onClose={() => setAdding(false)} onAdd={addMany} />
      <AddPixDialog
        open={addingPix}
        onClose={() => setAddingPix(false)}
        onSaved={async (id) => {
          setAddingPix(false)
          await choosePix(id)
          await load()
          toast('QR Code salvo')
        }}
      />
    </div>
  )
}

function AddItemsDialog({
  open,
  margins,
  photos,
  inMenu,
  detailOf,
  busy,
  onClose,
  onAdd,
}: {
  open: boolean
  margins: PriceMargin[]
  photos: Map<string, string | null>
  inMenu: Set<string>
  detailOf: (m: PriceMargin) => string
  busy: boolean
  onClose: () => void
  onAdd: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) {
      setPicked(new Set())
      setQuery('')
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const list = margins
    .filter((m) => m.product_name.toLowerCase().includes(q))
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'pt-BR') || a.price - b.price)

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar sabores">
      <div className="field">
        <input type="search" placeholder="Buscar produto" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar produto" />
      </div>
      <ul className="pick-list">
        {list.length === 0 && <li className="muted">Nenhum produto com preço encontrado.</li>}
        {list.map((m) => {
          const already = inMenu.has(m.price_id)
          const d = detailOf(m)
          return (
            <li key={m.price_id}>
              <label className={`pick-row ${already ? 'is-off' : ''}`}>
                <input type="checkbox" checked={already || picked.has(m.price_id)} disabled={already} onChange={() => toggle(m.price_id)} />
                <ProductThumb name={m.product_name} path={photos.get(m.product_id)} size="sm" />
                <span className="pick-name">
                  {m.product_name}
                  {d && <small>{d}</small>}
                  {already && <small>já está no cardápio</small>}
                </span>
                <b>{brl(Number(m.price))}</b>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy || picked.size === 0} onClick={() => onAdd([...picked])}>
          {picked.size > 0 ? `Adicionar (${picked.size})` : 'Adicionar'}
        </button>
      </div>
    </Dialog>
  )
}

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
