import { productImageUrl } from './images'

/** Foto pequena do produto; sem foto, mostra a inicial do nome. */
export function ProductThumb({ name, path, size }: { name: string; path?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const url = productImageUrl(path)
  const cls = `thumb${size ? ` ${size}` : ''}`
  if (url) return <img className={cls} src={url} alt="" loading="lazy" />
  return (
    <span className={cls} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
