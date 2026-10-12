import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dialog } from './Dialog'
import { productImageUrl } from './images'
import { ALL, NONE, filterPhotos, useCatalogData } from './catalogData'

/** Escolhe uma foto do catálogo (com busca e famílias). onPick(null) = sem foto. */
export function PhotoPicker({
  open,
  onClose,
  onPick,
  selected,
  productId,
}: {
  open: boolean
  onClose: () => void
  onPick: (path: string | null) => void
  selected?: string | null
  productId?: string
}) {
  const d = useCatalogData()
  const [tab, setTab] = useState(ALL)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) {
      setTab(ALL)
      setQuery('')
    }
  }, [open])

  const list = filterPhotos(d.photos, tab, query).sort(
    (a, b) => Number(b.product_id === productId && !!productId) - Number(a.product_id === productId && !!productId),
  )
  const countOf = (cid: string | null) => d.photos.filter((p) => p.category_id === cid).length

  return (
    <Dialog open={open} onClose={onClose} title="Escolher foto do catálogo">
      <div className="field">
        <input type="search" placeholder="Buscar por nome ou código SKU" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar foto" />
      </div>
      <div className="tabs" role="tablist" aria-label="Famílias">
        <button type="button" role="tab" aria-selected={tab === ALL} className={`tab ${tab === ALL ? 'on' : ''}`} onClick={() => setTab(ALL)}>
          Todas
        </button>
        {d.categories
          .filter((c) => countOf(c.id) > 0)
          .map((c) => (
            <button type="button" key={c.id} role="tab" aria-selected={tab === c.id} className={`tab ${tab === c.id ? 'on' : ''}`} onClick={() => setTab(c.id)}>
              {c.name}
            </button>
          ))}
        {countOf(null) > 0 && (
          <button type="button" role="tab" aria-selected={tab === NONE} className={`tab ${tab === NONE ? 'on' : ''}`} onClick={() => setTab(NONE)}>
            Sem família
          </button>
        )}
      </div>
      {d.loading ? (
        <p className="muted">Carregando…</p>
      ) : list.length === 0 ? (
        <p className="muted">
          {d.photos.length === 0 ? (
            <>
              O catálogo ainda está vazio. <Link to="/catalogo">Adicione fotos no Catálogo</Link>.
            </>
          ) : (
            'Nenhuma foto encontrada.'
          )}
        </p>
      ) : (
        <ul className="cat-grid picker">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className={`cat-card ${selected === p.image_path ? 'is-on' : ''}`} onClick={() => onPick(p.image_path)}>
                <img src={productImageUrl(p.image_path) ?? ''} alt={p.title} loading="lazy" />
                <span className="cat-title">{p.title}</span>
                {p.sku && <small className="cat-sku">{p.sku}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog-actions">
        <button type="button" className="link-btn" onClick={() => onPick(null)}>
          Sem foto
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Dialog>
  )
}
