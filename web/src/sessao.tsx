// Sessão: login na API, Firebase Auth (custom token) e dados do usuário.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged, type Auth } from 'firebase/auth'
import { api, configurarToken } from './api'

export type Pagina = { id: string; titulo: string }
export type Area = { id: string; titulo: string; descricao: string; icone: string; menu: string; grupos: { titulo: string; paginas: Pagina[] }[] }
export type Permissoes = {
  emitir: boolean; gerou_aprovou: boolean; editar_plantao: boolean; configurar_plantao: boolean
  configurar_time: boolean; editar_pintura: boolean; excluir_pintura: boolean; atualizar_srs: boolean
}
export type DadosSessao = { usuario: string; nome: string; nivel: number; perfil: string; areas: Area[]; permissoes: Permissoes }

let firebaseAuth: Auth | null = null
function auth(): Auth | null {
  if (firebaseAuth) return firebaseAuth
  const bruto = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined
  if (!bruto) return null
  try {
    const app: FirebaseApp = initializeApp(JSON.parse(bruto))
    firebaseAuth = getAuth(app)
  } catch {
    firebaseAuth = null
  }
  return firebaseAuth
}

const CHAVE_LOCAL = 'central_token_local'
function lerLocal() {
  try { return localStorage.getItem(CHAVE_LOCAL) } catch { return null }
}
function gravarLocal(token: string | null) {
  try {
    if (token) localStorage.setItem(CHAVE_LOCAL, token)
    else localStorage.removeItem(CHAVE_LOCAL)
  } catch { /* sem storage */ }
}

async function tokenAtual(): Promise<string | null> {
  const a = auth()
  if (a?.currentUser) return a.currentUser.getIdToken()
  return lerLocal()
}

type Contexto = {
  sessao: DadosSessao | null
  carregando: boolean
  entrar: (usuario: string, senha: string) => Promise<void>
  sair: () => Promise<void>
  recarregar: () => Promise<void>
}
const Ctx = createContext<Contexto>(null as unknown as Contexto)
export const useSessao = () => useContext(Ctx)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<DadosSessao | null>(null)
  const [carregando, setCarregando] = useState(true)

  const limpar = useCallback(() => { gravarLocal(null); setSessao(null) }, [])

  useEffect(() => {
    configurarToken(tokenAtual, () => {
      const a = auth()
      if (a) signOut(a).catch(() => {})
      limpar()
    })
  }, [limpar])

  const recarregar = useCallback(async () => {
    try {
      setSessao(await api.get<DadosSessao>('/api/sessao'))
    } catch {
      setSessao(null)
    }
  }, [])

  useEffect(() => {
    const a = auth()
    if (!a) {
      if (lerLocal()) recarregar().finally(() => setCarregando(false))
      else setCarregando(false)
      return
    }
    return onAuthStateChanged(a, async (u) => {
      if (u) await recarregar()
      else setSessao(null)
      setCarregando(false)
    })
  }, [recarregar])

  const entrar = useCallback(async (usuario: string, senha: string) => {
    const r = await api.post<{ modo: string; token: string }>('/api/login', { usuario, senha })
    const a = auth()
    if (r.modo === 'firebase') {
      if (!a) throw new Error('O site está sem a configuração do Firebase.')
      await signInWithCustomToken(a, r.token)
    } else {
      gravarLocal(r.token)
    }
    await recarregar()
  }, [recarregar])

  const sair = useCallback(async () => {
    const a = auth()
    if (a) await signOut(a).catch(() => {})
    limpar()
  }, [limpar])

  const valor = useMemo(() => ({ sessao, carregando, entrar, sair, recarregar }), [sessao, carregando, entrar, sair, recarregar])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
