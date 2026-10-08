import { createClient } from '@supabase/supabase-js'

// Acepta los nombres VITE_ y también los que crea la integración de Supabase en Vercel (NEXT_PUBLIC_).
// Solo se usan claves PÚBLICAS (URL + anon/publishable). Nunca pongas aquí la service_role ni la secret.
const env = import.meta.env as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const key =
  env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

// Se faltarem as variáveis, o app mostra uma tela de aviso em vez de quebrar.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key')
