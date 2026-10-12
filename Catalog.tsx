import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { friendlyError } from './errors'
import { isImageInUse, productImageUrl, removeImageFile, uploadCatalogImage } from './images'
import { ALL, NONE, filterPhotos, nextSku, useCatalogData } from './catalogData'
import type { CatalogPhoto } from './types'

const prettyTitle = (filename: string) =>
  filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Foto'

/** Catálogo: galeria com as fotos dos doces já feitos. Serve para escolher a foto de cada item nos orçamentos. */
export function Catalog() {
  const { company } = useAuth()
  const toast = useToast()
  const d = useCatalogData()
  const [tab, setTab] = useState(ALL)
  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [editing, setEditing] = useState<CatalogPhoto | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const visible = filterPhotos(d.photos, tab, query)
  const countOf = (cid: string | null) => d.photos.filter((p) => p.category_id === cid).length
  const hasNone = countOf(null) > 0

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || !company) return
    const list = [...files].filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return toast('Escolha arquivos de imagem.', 'error')
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      setProgress(`Enviando ${i + 1} de ${list.length}…`)
      try {
        const path = await uploadCatalogImage(company.id, list[i])
        const { error } = await supabase.from('catalog_photos').insert({
          company_id: company.id,
          title: prettyTitle(list[i].name),
          sku: nextSku(d.photos, ok),
          image_path: path,
          category_id: tab !== ALL && tab !== NONE ? tab : null,
        })
        if (error) {
          await removeImageFile(path)
          throw error
        }
        ok++
      } catch (err) {
        toast(`Não consegui enviar “${list[i].name}”. ${friendlyError(err)}`, 'error')
      }
    }
    setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
    if (ok > 0) {
      toast(ok === 1 ? 'Foto adicionada' : `${ok} fotos adicionadas`)
      await d.reload()
    }
  }

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Catálogo</h1>
          <p className="sub">As fotos dos doces que você já fez. Depois é só escolher a foto de cada item nos orçamentos.</p>
        </div>
        <div className="block-add">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
          <button className="btn btn-primary" disabled={!!progress} onClick={() => fileRef.current?.click()}>
            {progress ?? 'Adicionar fotos'}
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Famílias">
        <button role="tab" aria-selected={tab === ALL} className={`tab ${tab === ALL ? 'on' : ''}`} onClick={() => setTab(ALL)}>
          Todas <small>{d.photos.length}</small>
        </button>
        {d.categories
          .filter((c) => countOf(c.id) > 0 || tab === c.id)
          .map((c) => (
            <button key={c.id} role="tab" aria-selected={tab === c.id} className={`tab ${tab === c.id ? 'on' : ''}`} onClick={() => setTab(c.id)}>
              {c.name} <small>{countOf(c.id)}</small>
            </button>
          ))}
        {hasNone && (
          <button role="tab" aria-selected={tab === NONE} className={`tab ${tab === NONE ? 'on' : ''}`} onClick={() => setTab(NONE)}>
            Sem família <small>{countOf(null)}</small>
          </button>
        )}
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Buscar por nome ou código SKU" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar foto" />
      </div>

      {d.loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {d.photos.length === 0 ? 'Nenhuma foto ainda. Use “Adicionar fotos” e escolha várias de uma vez.' : 'Nenhuma foto encontrada.'}
        </p>
      ) : (
        <ul className="cat-grid">
          {visible.map((p) => (
            <li key={p.id}>
              <button className="cat-card" onClick={() => setEditing(p)}>
                <img src={productImageUrl(p.image_path) ?? ''} alt={p.title} loading="lazy" />
                <span className="cat-title">{p.title}</span>
                {p.sku && <small className="cat-sku">{p.sku}</small>}
                {p.category_id && <small className="cat-chip">{d.categories.find((c) => c.id === p.category_id)?.name}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <EditDialog
        key={editing?.id ?? 'none'}
        photo={editing}
        categories={d.categories}
        products={d.products}
        onClose={() => setEditing(null)}
        onChanged={async () => {
          setEditing(null)
          await d.reload()
        }}
      />
    </>
  )
}

function EditDialog({
  photo,
  categories,
  products,
  onClose,
  onChanged,
}: {
  photo: CatalogPhoto | null
  categories: { id: string; name: string }[]
  products: { id: string; name: string }[]
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const toast = useToast()
  const [title, setTitle] = useState(photo?.title ?? '')
  const [categoryId, setCategoryId] = useState(photo?.category_id ?? '')
  const [productId, setProductId] = useState(photo?.product_id ?? '')
  const [sku, setSku] = useState(photo?.sku ?? '')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!photo) return
    setBusy(true)
    const { error } = await supabase
      .from('catalog_photos')
      .update({ title: title.trim(), sku: sku.trim() || null, category_id: categoryId || null, product_id: productId || null })
      .eq('id', photo.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Foto atualizada')
    await onChanged()
  }

  async function remove() {
    if (!photo) return
    if (!window.confirm('Excluir esta foto do catálogo? Orçamentos já feitos não mudam.')) return
    setBusy(true)
    const { error } = await supabase.from('catalog_photos').delete().eq('id', photo.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    if (!(await isImageInUse(photo.image_path))) await removeImageFile(photo.image_path)
    toast('Foto excluída')
    await onChanged()
  }

  return (
    <Dialog open={!!photo} onClose={onClose} title="Foto do catálogo">
      {photo && (
        <form className="form" onSubmit={save}>
          <img className="cat-preview" src={productImageUrl(photo.image_path) ?? ''} alt={photo.title} />
          <div className="grid-2">
            <div className="field">
              <label htmlFor="ct-title">Nome</label>
              <input id="ct-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="ct-sku">Código SKU</label>
              <input id="ct-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: DOC-001" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="ct-cat">Família</label>
              <select id="ct-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem família</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ct-prod">Produto relacionado</label>
              <select id="ct-prod" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Nenhum</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="hint">Se você ligar a foto a um produto, ela já vem sugerida quando esse produto entra num orçamento.</p>
          <div className="dialog-actions">
            <button type="button" className="link-btn" disabled={busy} onClick={() => void remove()}>
              Excluir foto
            </button>
            <button className="btn btn-primary" disabled={busy || !title.trim()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
