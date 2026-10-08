import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Company, Role } from './types'

type Membership = { company: Company; role: Role }

type AuthCtx = {
  session: Session | null
  loading: boolean
  memberships: Membership[]
  company: Company | null
  role: Role | null
  canManage: boolean
  selectCompany: (id: string) => void
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)
const STORAGE_KEY = 'doce-gestao.company'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [membersReady, setMembersReady] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s) // nada de chamadas ao Supabase aqui dentro (evita travar o auth)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const loadMemberships = useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setMembersReady(true)
      return
    }
    const { data, error } = await supabase
      .from('company_members')
      .select('role, companies(*)')
      .eq('user_id', userId)
    if (error) console.error(error)
    const rows = (data ?? []) as unknown as Array<{ role: Role; companies: Company | null }>
    setMemberships(
      rows.filter((r) => r.companies).map((r) => ({ company: r.companies as Company, role: r.role })),
    )
    setMembersReady(true)
  }, [userId])

  useEffect(() => {
    if (!sessionReady) return
    setMembersReady(false)
    void loadMemberships()
  }, [sessionReady, loadMemberships])

  const selectCompany = useCallback((id: string) => {
    setActiveId(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* ignora */
    }
  }, [])

  const value = useMemo<AuthCtx>(() => {
    const active = memberships.find((m) => m.company.id === activeId) ?? memberships[0] ?? null
    const role = active?.role ?? null
    return {
      session,
      loading: !sessionReady || (Boolean(session) && !membersReady),
      memberships,
      company: active?.company ?? null,
      role,
      canManage: role === 'OWNER' || role === 'ADMIN',
      selectCompany,
      reload: loadMemberships,
      signOut: async () => {
        await supabase.auth.signOut()
        setMemberships([])
      },
    }
  }, [session, sessionReady, membersReady, memberships, activeId, selectCompany, loadMemberships])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
