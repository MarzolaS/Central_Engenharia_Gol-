// Peças de tela parecidas com as do Streamlit (botão, campos, abas, diálogo, avisos...).
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react'
import { ErroApi } from '../api'

// --------------------------------------------------------------------------- //
// Avisos flutuantes (st.toast) e mensagem de erro padrão
type Toast = { id: number; texto: string; tipo: string }
const CtxToast = createContext<(texto: string, tipo?: string) => void>(() => {})
export const useToast = () => useContext(CtxToast)

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const mostrar = useCallback((texto: string, tipo = 'info') => {
    const id = Date.now() + Math.random()
    setLista((l) => [...l, { id, texto, tipo }])
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'error' ? 8000 : 4500)
  }, [])
  return (
    <CtxToast.Provider value={mostrar}>
      {children}
      <div className="toasts">
        {lista.map((t) => <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>)}
      </div>
    </CtxToast.Provider>
  )
}

export function textoErro(e: unknown) {
  if (e instanceof ErroApi) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

// Executa uma ação com estado de "ocupado" e erro visível.
export function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const rodar = useCallback(async <T,>(f: () => Promise<T>): Promise<T | undefined> => {
    setOcupado(true)
    setErro(null)
    try {
      return await f()
    } catch (e) {
      setErro(textoErro(e))
      return undefined
    } finally {
      setOcupado(false)
    }
  }, [])
  return { ocupado, erro, setErro, rodar }
}

// Carrega dados da API e recarrega quando as dependências mudam.
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const versao = useRef(0)
  const recarregar = useCallback(async () => {
    const minha = ++versao.current
    setCarregando(true)
    try {
      const d = await carregar()
      if (minha === versao.current) { setDados(d); setErro(null) }
    } catch (e) {
      if (minha === versao.current) setErro(textoErro(e))
    } finally {
      if (minha === versao.current) setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { recarregar() }, [recarregar])
  return { dados, erro, carregando, recarregar, setDados }
}

// --------------------------------------------------------------------------- //
export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando"><div className="gol-loader" /><span>{texto}</span></div>
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  if (children === null || children === undefined || children === '' || children === false) return null
  return <div className={`aviso ${tipo}`}>{children}</div>
}

export function Erro({ erro }: { erro: string | null | undefined }) {
  return erro ? <Aviso tipo="error">{erro}</Aviso> : null
}

export function Legenda({ children }: { children: ReactNode }) {
  return <div className="caption">{children}</div>
}

export function Html({ html, className, style }: { html: string; className?: string; style?: CSSProperties }) {
  return <div className={`html-bloco ${className || ''}`} style={style} dangerouslySetInnerHTML={{ __html: html }} />
}

// Markdown simples (negrito, itálico, código, listas e quebras), como os textos do app.py.
export function markdownSimples(texto: string) {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const linha = (t: string) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  const partes: string[] = []
  let itens: string[] = []
  for (const l of texto.split('\n')) {
    const m = /^\s*[-•*]\s+(.*)$/.exec(l)
    if (m) { itens.push(`<li>${linha(m[1])}</li>`); continue }
    if (itens.length) { partes.push(`<ul>${itens.join('')}</ul>`); itens = [] }
    partes.push(l.trim() ? `<p style="margin:.2rem 0">${linha(l)}</p>` : '')
  }
  if (itens.length) partes.push(`<ul>${itens.join('')}</ul>`)
  return partes.join('')
}

export function Markdown({ texto }: { texto: string }) {
  return <Html html={markdownSimples(texto)} />
}

export function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return <div className="cabecalho"><h1>{titulo}</h1><p>{subtitulo || ''}</p></div>
}

// --------------------------------------------------------------------------- //
type PropsBotao = {
  children?: ReactNode; onClick?: () => void; tipo?: 'primario' | 'secundario' | 'terciario' | 'perigo'
  disabled?: boolean; cheio?: boolean; pequeno?: boolean; titulo?: string; icone?: string; submit?: boolean
  style?: CSSProperties; ocupado?: boolean
}
export function Botao({ children, onClick, tipo = 'secundario', disabled, cheio, pequeno, titulo, icone, submit, style, ocupado }: PropsBotao) {
  const classe = ['botao', tipo !== 'secundario' ? tipo : '', cheio ? 'cheio' : '', pequeno ? 'pequeno' : ''].filter(Boolean).join(' ')
  return (
    <button type={submit ? 'submit' : 'button'} className={classe} onClick={onClick} disabled={disabled || ocupado} title={titulo} style={style}>
      {icone && <Icone nome={icone} />}
      {ocupado ? 'Aguarde…' : children}
    </button>
  )
}

export function Icone({ nome, tamanho = 16 }: { nome: string; tamanho?: number }) {
  return (
    <span className="ic" aria-hidden style={{
      width: tamanho, height: tamanho, display: 'inline-block', backgroundColor: 'currentColor',
      WebkitMask: `url(/icones/${nome}.svg) no-repeat center / contain`, mask: `url(/icones/${nome}.svg) no-repeat center / contain`,
    }} />
  )
}

type PropsCampo = { rotulo?: ReactNode; ajuda?: ReactNode; children: ReactNode; style?: CSSProperties }
export function Campo({ rotulo, ajuda, children, style }: PropsCampo) {
  return (
    <div className="campo" style={style}>
      {rotulo !== undefined && <label>{rotulo}</label>}
      {children}
      {ajuda && <div className="ajuda">{ajuda}</div>}
    </div>
  )
}

type PropsTexto = {
  rotulo?: ReactNode; valor: string; mudar: (v: string) => void; placeholder?: string; disabled?: boolean
  tipo?: string; ajuda?: ReactNode; erro?: boolean; max?: number; aoEnter?: () => void; autoFocus?: boolean
}
export function Texto({ rotulo, valor, mudar, placeholder, disabled, tipo = 'text', ajuda, erro, max, aoEnter, autoFocus }: PropsTexto) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <input className={`entrada${erro ? ' erro' : ''}`} type={tipo} value={valor ?? ''} placeholder={placeholder} disabled={disabled}
        maxLength={max} autoFocus={autoFocus}
        onChange={(e) => mudar(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && aoEnter) aoEnter() }} />
    </Campo>
  )
}

export function AreaTexto({ rotulo, valor, mudar, placeholder, altura = 100, disabled, ajuda }: {
  rotulo?: ReactNode; valor: string; mudar: (v: string) => void; placeholder?: string; altura?: number; disabled?: boolean; ajuda?: ReactNode
}) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <textarea className="entrada" value={valor ?? ''} placeholder={placeholder} disabled={disabled}
        style={{ height: altura }} onChange={(e) => mudar(e.target.value)} />
    </Campo>
  )
}

// Número com vírgula ou ponto; devolve number ou null.
export function Numero({ rotulo, valor, mudar, disabled, passo, ajuda, min, max, erro, placeholder }: {
  rotulo?: ReactNode; valor: number | null | undefined; mudar: (v: number | null) => void; disabled?: boolean
  passo?: number; ajuda?: ReactNode; min?: number; max?: number; erro?: boolean; placeholder?: string
}) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? '' : String(valor))
  const ultimo = useRef(valor)
  useEffect(() => {
    if (valor !== ultimo.current) {
      ultimo.current = valor
      setTexto(valor === null || valor === undefined ? '' : String(valor))
    }
  }, [valor])
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <input className={`entrada${erro ? ' erro' : ''}`} inputMode="decimal" value={texto} disabled={disabled} placeholder={placeholder}
        step={passo} min={min} max={max}
        onChange={(e) => {
          const t = e.target.value
          setTexto(t)
          const n = t.trim() === '' ? null : Number(t.replace(',', '.'))
          const v = n === null || Number.isNaN(n) ? null : n
          ultimo.current = v
          mudar(v)
        }} />
    </Campo>
  )
}

export function DataCampo({ rotulo, valor, mudar, disabled, ajuda, min, max }: {
  rotulo?: ReactNode; valor: string | null | undefined; mudar: (v: string | null) => void; disabled?: boolean; ajuda?: ReactNode; min?: string; max?: string
}) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <input className="entrada" type="date" value={(valor || '').slice(0, 10)} disabled={disabled} min={min} max={max}
        onChange={(e) => mudar(e.target.value || null)} />
    </Campo>
  )
}

export function Selecao<T extends string | number>({ rotulo, valor, opcoes, mudar, disabled, rotulos, ajuda, vazio }: {
  rotulo?: ReactNode; valor: T | null | undefined; opcoes: readonly T[]; mudar: (v: T) => void; disabled?: boolean
  rotulos?: (v: T) => string; ajuda?: ReactNode; vazio?: string
}) {
  const indice = opcoes.findIndex((o) => o === valor)
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <select className="entrada" value={indice < 0 ? '' : String(indice)} disabled={disabled}
        onChange={(e) => { const i = Number(e.target.value); if (!Number.isNaN(i) && e.target.value !== '') mudar(opcoes[i]) }}>
        {(indice < 0 || vazio) && <option value="" disabled={!vazio}>{vazio || 'Escolha uma opção'}</option>}
        {opcoes.map((o, i) => <option key={i} value={String(i)}>{rotulos ? rotulos(o) : String(o)}</option>)}
      </select>
    </Campo>
  )
}

export function MultiSelecao({ rotulo, valor, opcoes, mudar, placeholder = 'Escolha', disabled, ajuda, permitirNovo }: {
  rotulo?: ReactNode; valor: string[]; opcoes: string[]; mudar: (v: string[]) => void; placeholder?: string; disabled?: boolean; ajuda?: ReactNode
  permitirNovo?: boolean
}) {
  const restantes = opcoes.filter((o) => !valor.includes(o))
  const [novo, setNovo] = useState('')
  const incluirNovo = () => {
    const t = novo.trim().replace(/\s+/g, ' ')
    if (t && !valor.includes(t)) mudar([...valor, t])
    setNovo('')
  }
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <div className="multi">
        {valor.map((v) => (
          <span key={v} className="chip">{v}{!disabled && <button type="button" onClick={() => mudar(valor.filter((x) => x !== v))}>×</button>}</span>
        ))}
        {!disabled && restantes.length > 0 && (
          <select value="" onChange={(e) => { if (e.target.value) mudar([...valor, e.target.value]) }}>
            <option value="">{valor.length ? 'Adicionar…' : placeholder}</option>
            {restantes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {!disabled && permitirNovo && (
          <input className="multi-novo" value={novo} placeholder="Nome novo + Enter" onChange={(e) => setNovo(e.target.value)}
            onBlur={incluirNovo} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluirNovo() } }} />
        )}
      </div>
    </Campo>
  )
}

export function Marcar({ rotulo, valor, mudar, disabled }: { rotulo: ReactNode; valor: boolean; mudar: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="caixa-marcar" style={disabled ? { opacity: .5, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" checked={!!valor} disabled={disabled} onChange={(e) => mudar(e.target.checked)} />
      <span>{rotulo}</span>
    </label>
  )
}

export function Chave({ rotulo, valor, mudar, disabled }: { rotulo: ReactNode; valor: boolean; mudar: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`chave${disabled ? ' desligada' : ''}`}>
      <input type="checkbox" checked={!!valor} disabled={disabled} onChange={(e) => mudar(e.target.checked)} />
      <span className="trilho" />
      <span>{rotulo}</span>
    </label>
  )
}

export function Segmentado<T extends string>({ opcoes, valor, mudar, rotulos }: {
  opcoes: readonly T[]; valor: T; mudar: (v: T) => void; rotulos?: (v: T) => string
}) {
  return (
    <div className="segmentado">
      {opcoes.map((o) => (
        <button key={o} type="button" className={o === valor ? 'ativo' : ''} onClick={() => mudar(o)}>{rotulos ? rotulos(o) : o}</button>
      ))}
    </div>
  )
}

export function Radio<T extends string>({ rotulo, opcoes, valor, mudar, horizontal, rotulos }: {
  rotulo?: ReactNode; opcoes: readonly T[]; valor: T; mudar: (v: T) => void; horizontal?: boolean; rotulos?: (v: T) => string
}) {
  return (
    <Campo rotulo={rotulo}>
      <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap: horizontal ? '1.2rem' : '.3rem', flexWrap: 'wrap' }}>
        {opcoes.map((o) => (
          <label key={o} className="caixa-marcar" style={{ margin: 0 }}>
            <input type="radio" checked={o === valor} onChange={() => mudar(o)} style={{ accentColor: 'var(--laranja)' }} />
            <span>{rotulos ? rotulos(o) : o}</span>
          </label>
        ))}
      </div>
    </Campo>
  )
}

// --------------------------------------------------------------------------- //
export function Abas({ abas, ativa, mudar }: { abas: string[]; ativa: string; mudar: (a: string) => void }) {
  return (
    <div className="abas" role="tablist">
      {abas.map((a) => <button key={a} className={`aba${a === ativa ? ' ativa' : ''}`} onClick={() => mudar(a)} role="tab">{a}</button>)}
    </div>
  )
}

// Abas que guardam a escolha na sessão do navegador (voltar à tela mantém a aba).
export function useAba(chave: string, abas: string[]) {
  const [ativa, setAtiva] = useState<string>(() => {
    try { const v = sessionStorage.getItem('aba_' + chave); if (v && abas.includes(v)) return v } catch { /* */ }
    return abas[0]
  })
  const mudar = useCallback((a: string) => {
    setAtiva(a)
    try { sessionStorage.setItem('aba_' + chave, a) } catch { /* */ }
  }, [chave])
  return [abas.includes(ativa) ? ativa : abas[0], mudar] as const
}

export function Expansor({ titulo, children, aberto, aoAbrir }: { titulo: ReactNode; children: ReactNode; aberto?: boolean; aoAbrir?: (v: boolean) => void }) {
  const [abertoLocal, setAberto] = useState(!!aberto)
  return (
    <details className="expansor" open={abertoLocal} onToggle={(e) => { const v = (e.target as HTMLDetailsElement).open; setAberto(v); aoAbrir?.(v) }}>
      <summary>{titulo}</summary>
      {abertoLocal && <div className="corpo">{children}</div>}
    </details>
  )
}

export function Dialogo({ titulo, aberto, fechar, children, largo }: { titulo: string; aberto: boolean; fechar: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, fechar])
  if (!aberto) return null
  return (
    <div className="fundo-dialogo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className={`dialogo${largo ? ' largo' : ''}`} role="dialog">
        <div className="dialogo-topo"><h3>{titulo}</h3><button className="botao terciario" onClick={fechar} aria-label="Fechar">✕</button></div>
        {children}
      </div>
    </div>
  )
}

export function Popover({ rotulo, children, disabled, direita, cheio, icone, tipo }: {
  rotulo: ReactNode; children: (fechar: () => void) => ReactNode; disabled?: boolean; direita?: boolean; cheio?: boolean; icone?: string; tipo?: 'primario' | 'secundario' | 'terciario'
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  return (
    <div className="popover" ref={ref} style={cheio ? { width: '100%' } : undefined}>
      <Botao onClick={() => setAberto(!aberto)} disabled={disabled} cheio={cheio} icone={icone} tipo={tipo}>{rotulo}</Botao>
      {aberto && <div className={`popover-corpo${direita ? ' direita' : ''}`}>{children(() => setAberto(false))}</div>}
    </div>
  )
}

// Confirmação em duas etapas ("Quero excluir" + botão), como no app.py.
export function ConfirmarExclusao({ texto, botao, acao, ocupado }: { texto: string; botao: string; acao: () => void; ocupado?: boolean }) {
  const [ok, setOk] = useState(false)
  return (
    <div>
      <Marcar rotulo={texto} valor={ok} mudar={setOk} />
      {ok && <Botao tipo="perigo" onClick={acao} ocupado={ocupado}>{botao}</Botao>}
    </div>
  )
}

export function Metrica({ rotulo, valor, delta }: { rotulo: string; valor: ReactNode; delta?: ReactNode }) {
  return (
    <div className="metrica">
      <div className="rot">{rotulo}</div>
      <div className="val">{valor}</div>
      {delta !== undefined && delta !== null && <div className="delta">{delta}</div>}
    </div>
  )
}

// --------------------------------------------------------------------------- //
export function EnvioArquivo({ rotulo, aceitar, arquivo, mudar, ajuda, disabled }: {
  rotulo?: ReactNode; aceitar?: string; arquivo: File | null; mudar: (f: File | null) => void; ajuda?: ReactNode; disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <div className={`envio${arrastando ? ' arrastando' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) mudar(f) }}>
        <Botao pequeno onClick={() => ref.current?.click()} disabled={disabled}>Escolher arquivo</Botao>
        <span className="nome">{arquivo ? `${arquivo.name} (${formatarTamanho(arquivo.size)})` : 'Arraste o arquivo aqui ou clique para escolher'}</span>
        {arquivo && <Botao tipo="terciario" pequeno onClick={() => { mudar(null); if (ref.current) ref.current.value = '' }}>✕</Botao>}
        <input ref={ref} type="file" accept={aceitar} onChange={(e) => mudar(e.target.files?.[0] || null)} />
      </div>
    </Campo>
  )
}

export function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// --------------------------------------------------------------------------- //
// Tabela de leitura (st.dataframe)
export type Coluna<T> = { chave: string; titulo: string; formato?: (v: any, linha: T) => ReactNode; numero?: boolean; largura?: number | string }
export function Tabela<T extends Record<string, any>>({ linhas, colunas, aoClicar, selecionada, altura }: {
  linhas: T[]; colunas: Coluna<T>[]; aoClicar?: (l: T, i: number) => void; selecionada?: number | null; altura?: number
}) {
  return (
    <div className="tabela-caixa" style={altura ? { maxHeight: altura } : undefined}>
      <table className="tabela">
        <thead><tr>{colunas.map((c) => <th key={c.chave} style={{ width: c.largura }}>{c.titulo}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className={`${aoClicar ? 'clicavel' : ''}${selecionada === i ? ' selecionada' : ''}`} onClick={aoClicar ? () => aoClicar(l, i) : undefined}>
              {colunas.map((c) => (
                <td key={c.chave} className={c.numero ? 'num' : ''}>{c.formato ? c.formato(l[c.chave], l) : formatarCelula(l[c.chave])}</td>
              ))}
            </tr>
          ))}
          {!linhas.length && <tr><td colSpan={colunas.length} className="mudo centro">Sem linhas.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function formatarCelula(v: unknown): ReactNode {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
  if (typeof v === 'boolean') return v ? '✓' : ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T00:00:00)?$/.test(v)) return dataBr(v)
  return String(v)
}

// Editor de tabela (st.data_editor com linhas dinâmicas)
export type ColunaEditor = {
  chave: string; titulo: string; tipo?: 'texto' | 'numero' | 'data' | 'opcoes' | 'marcar'; opcoes?: string[]
  desabilitada?: boolean; largura?: number | string; ajuda?: string
}
export function EditorTabela({ linhas, colunas, mudar, dinamica = true, altura }: {
  linhas: Record<string, any>[]; colunas: ColunaEditor[]; mudar: (l: Record<string, any>[]) => void; dinamica?: boolean; altura?: number
}) {
  const vazia = useMemo(() => Object.fromEntries(colunas.map((c) => [c.chave, null])), [colunas])
  const todas = dinamica ? [...linhas, vazia] : linhas
  const alterar = (i: number, chave: string, valor: unknown) => {
    const novas = linhas.map((l) => ({ ...l }))
    if (i >= linhas.length) novas.push({ ...vazia, [chave]: valor })
    else novas[i][chave] = valor
    mudar(novas)
  }
  return (
    <div className="tabela-caixa" style={altura ? { maxHeight: altura } : undefined}>
      <table className="tabela">
        <thead><tr>
          {colunas.map((c) => <th key={c.chave} style={{ width: c.largura }} title={c.ajuda}>{c.titulo}</th>)}
          {dinamica && <th style={{ width: 32 }} />}
        </tr></thead>
        <tbody>
          {todas.map((l, i) => {
            const nova = i >= linhas.length
            return (
              <tr key={i} style={nova ? { opacity: .7 } : undefined}>
                {colunas.map((c) => {
                  const v = l[c.chave]
                  const comum = { className: 'celula', disabled: c.desabilitada }
                  let campo: ReactNode
                  if (c.tipo === 'opcoes') {
                    campo = (
                      <select {...comum} value={v ?? ''} onChange={(e) => alterar(i, c.chave, e.target.value || null)}>
                        <option value="" />
                        {(c.opcoes || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )
                  } else if (c.tipo === 'marcar') {
                    campo = <input type="checkbox" disabled={c.desabilitada} checked={!!v} onChange={(e) => alterar(i, c.chave, e.target.checked)} />
                  } else if (c.tipo === 'data') {
                    campo = <input {...comum} type="date" value={v ? String(v).slice(0, 10) : ''} onChange={(e) => alterar(i, c.chave, e.target.value || null)} />
                  } else if (c.tipo === 'numero') {
                    campo = <CelulaNumero valor={v} disabled={c.desabilitada} mudar={(n) => alterar(i, c.chave, n)} />
                  } else {
                    campo = <input {...comum} value={v ?? ''} placeholder={nova ? '+' : ''} onChange={(e) => alterar(i, c.chave, e.target.value)} />
                  }
                  return <td key={c.chave} style={{ padding: '.15rem .3rem' }}>{campo}</td>
                })}
                {dinamica && (
                  <td style={{ padding: '.15rem .2rem' }}>
                    {!nova && <button className="botao terciario pequeno" title="Apagar linha" onClick={() => mudar(linhas.filter((_, j) => j !== i))}>✕</button>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CelulaNumero({ valor, mudar, disabled }: { valor: unknown; mudar: (n: number | null) => void; disabled?: boolean }) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? '' : String(valor))
  useEffect(() => {
    const atual = texto.trim() === '' ? null : Number(texto.replace(',', '.'))
    if (valor !== atual) setTexto(valor === null || valor === undefined ? '' : String(valor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])
  return (
    <input className="celula" inputMode="decimal" value={texto} disabled={disabled} style={{ textAlign: 'right' }}
      onChange={(e) => {
        setTexto(e.target.value)
        const n = e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.'))
        mudar(n === null || Number.isNaN(n) ? null : n)
      }} />
  )
}

// --------------------------------------------------------------------------- //
// Datas no formato brasileiro
export function dataBr(v: string | null | undefined) {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v
}
export function hojeIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}
export function numeroBr(v: number | null | undefined, casas = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

// Caixa de escolha com busca (st.selectbox em que dá para digitar).
export function Busca({ rotulo, valor, opcoes, mudar, placeholder = 'Digite ou escolha', disabled, ajuda, permitirNovo }: {
  rotulo?: ReactNode; valor: string | null; opcoes: string[]; mudar: (v: string | null) => void; placeholder?: string
  disabled?: boolean; ajuda?: ReactNode; permitirNovo?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  const termo = texto.trim().toLowerCase()
  const filtradas = termo ? opcoes.filter((o) => o.toLowerCase().includes(termo)) : opcoes
  const escolher = (o: string | null) => { mudar(o); setTexto(''); setAberto(false) }
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <div ref={ref} style={{ position: 'relative' }}>
        <input className="entrada" disabled={disabled} placeholder={valor ?? placeholder} value={aberto ? texto : (valor ?? '')}
          onFocus={() => { setAberto(true); setTexto(''); setDestaque(0) }}
          onChange={(e) => { setTexto(e.target.value); setAberto(true); setDestaque(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque((d) => Math.min(d + 1, filtradas.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque((d) => Math.max(d - 1, 0)) }
            else if (e.key === 'Enter') {
              e.preventDefault()
              if (filtradas[destaque]) escolher(filtradas[destaque])
              else if (permitirNovo && texto.trim()) escolher(texto.trim())
            } else if (e.key === 'Escape') setAberto(false)
          }} />
        {aberto && !disabled && (
          <div className="busca-lista">
            {filtradas.slice(0, 200).map((o, i) => (
              <div key={o} className={`busca-item${i === destaque ? ' destaque' : ''}${o === valor ? ' escolhido' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); escolher(o) }} onMouseEnter={() => setDestaque(i)}>{o}</div>
            ))}
            {permitirNovo && texto.trim() && !opcoes.some((o) => o.toLowerCase() === termo) && (
              <div className="busca-item" onMouseDown={(e) => { e.preventDefault(); escolher(texto.trim()) }}>Usar “{texto.trim()}”</div>
            )}
            {!filtradas.length && !permitirNovo && <div className="busca-item mudo">Nenhuma opção.</div>}
          </div>
        )}
      </div>
    </Campo>
  )
}
