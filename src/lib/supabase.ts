import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined

export const isConfigured = Boolean(url && key)

// Se faltarem as variáveis, o app mostra uma tela de aviso em vez de quebrar.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key')
