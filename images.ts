import { supabase } from './supabase'

const BUCKET = 'product-images'

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
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
  return path
}

export async function removeProductImage(productId: string, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from('products').update({ image_path: null }).eq('id', productId)
  if (error) throw error
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
}
