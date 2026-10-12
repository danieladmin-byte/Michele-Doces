import { supabase } from './supabase'

const BUCKET = 'product-images'

/** Fotos do catálogo (cat-…) podem estar em uso por produtos/kits: nunca se apagam como "foto antiga". */
const isShared = (path: string | null | undefined) => !!path && path.includes('/cat-')
const dropOld = async (path: string | null | undefined) => {
  if (path && !isShared(path)) await supabase.storage.from(BUCKET).remove([path])
}

/** URL pública de la foto de un producto (o null si no tiene). */
export function productImageUrl(path: string | null | undefined): string | null {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null
}

/** Reduz a foto para um quadrado pequeno (JPEG) antes de enviar: leve e rápida no celular. */
export async function resizeSquare(file: File, size = 320): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Não consegui abrir esta imagem.'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    if (!side) throw new Error('Imagem inválida.')
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não consegui processar a imagem.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui processar a imagem.'))), 'image/jpeg', 0.85),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Envia a foto, grava o caminho no produto e apaga a foto anterior. */
export async function uploadProductImage(companyId: string, productId: string, file: File, oldPath: string | null): Promise<string> {
  const blob = await resizeSquare(file)
  const path = `${companyId}/${productId}-${Date.now()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const { error } = await supabase.from('products').update({ image_path: path }).eq('id', productId)
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  await dropOld(oldPath)
  return path
}

export async function removeProductImage(productId: string, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from('products').update({ image_path: null }).eq('id', productId)
  if (error) throw error
  await dropOld(oldPath)
}

/** Exclui o produto (formatos, preços e custos juntos) e apaga a foto, se ela for só dele. */
export async function deleteProduct(productId: string, imagePath: string | null): Promise<void> {
  const { error } = await supabase.rpc('delete_product', { p_product_id: productId })
  if (error) throw error
  await dropOld(imagePath)
}

/** Reduz a imagem mantendo a proporção (para o QR Code PIX continuar nítido e legível). */
export async function resizeFit(file: File, max = 900, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Não consegui abrir esta imagem.'))
      el.src = url
    })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k))
    const h = Math.max(1, Math.round(img.naturalHeight * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não consegui processar a imagem.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui processar a imagem.'))), type, 0.88),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Guarda o QR Code PIX e cria o registro da conta. Devolve o id da conta. */
export async function addPixAccount(companyId: string, name: string, file: File): Promise<string> {
  const blob = await resizeFit(file)
  const path = `${companyId}/pix-${Date.now()}.png`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' })
  if (up.error) throw up.error
  const { data, error } = await supabase.from('pix_accounts').insert({ company_id: companyId, name, image_path: path }).select('id').single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return (data as { id: string }).id
}

export async function removePixAccount(id: string, path: string): Promise<void> {
  const { error } = await supabase.from('pix_accounts').delete().eq('id', id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([path])
}

/** Fotos de kits: mesma ideia das fotos de produtos. */
export async function uploadKitImage(companyId: string, kitId: string, file: File, oldPath: string | null): Promise<string> {
  const blob = await resizeSquare(file)
  const path = `${companyId}/kit-${kitId}-${Date.now()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const { error } = await supabase.from('kits').update({ image_path: path }).eq('id', kitId)
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  await dropOld(oldPath)
  return path
}

export async function removeKitImage(kitId: string, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from('kits').update({ image_path: null }).eq('id', kitId)
  if (error) throw error
  await dropOld(oldPath)
}

/** Catálogo de fotos: guarda uma foto (mantendo a proporção) e devolve o caminho. */
export async function uploadCatalogImage(companyId: string, file: File): Promise<string> {
  const blob = await resizeFit(file, 1000, 'image/jpeg')
  const path = `${companyId}/cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  return path
}

export async function removeImageFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}

/** Usa uma foto do catálogo como foto do produto / do kit (sem copiar o arquivo). */
export async function setProductImagePath(productId: string, path: string | null, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from('products').update({ image_path: path }).eq('id', productId)
  if (error) throw error
  if (oldPath !== path) await dropOld(oldPath)
}

export async function setKitImagePath(kitId: string, path: string | null, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from('kits').update({ image_path: path }).eq('id', kitId)
  if (error) throw error
  if (oldPath !== path) await dropOld(oldPath)
}

/** A foto está em uso por algum produto, kit ou orçamento? (então o arquivo não pode ser apagado) */
export async function isImageInUse(path: string): Promise<boolean> {
  const [a, b, c] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('image_path', path),
    supabase.from('kits').select('id', { count: 'exact', head: true }).eq('image_path', path),
    supabase.from('quote_items').select('id', { count: 'exact', head: true }).eq('image_path', path),
  ])
  return (a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0) > 0
}

/** Carrega uma imagem (com CORS liberado) para desenhar em canvas. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('imagem'))
    img.src = url
  })
}
