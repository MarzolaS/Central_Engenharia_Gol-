import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useSessao, type Area } from './sessao'
import { Botao, Carregando, Erro, Texto, textoErro } from './componentes/ui'

const PAGINAS: Record<string, ComponentType> = {
  consulta: lazy(() => import('./paginas/ficha/Consulta')),
  graficos: lazy(() => import('./paginas/ficha/Graficos')),
  nova_ficha: lazy(() => import('./paginas/ficha/NovaFicha')),
  edicao: lazy(() => import('./paginas/ficha/Edicao')),
  aprovar: lazy(() => import('./paginas/ficha/Aprovacao')),
  excluir: lazy(() => import('./paginas/ficha/Excluir')),
  cadastrar_aeronave: lazy(() => import('./paginas/ficha/Aeronaves')),
  criar_login: lazy(() => import('./paginas/ficha/Usuarios')),
  assinaturas: lazy(() => import('./paginas/ficha/Assinaturas')),
  gerou_aprovou: lazy(() => import('./paginas/ficha/GerouAprovou')),
  plantao: lazy(() => import('./paginas/agenda/Plantao')),
  ferias: lazy(() => import('./paginas/agenda/Ferias')),
  time: lazy(() => import('./paginas/time/Time')),
  atividades: lazy(() => import('./paginas/time/Atividades')),
  consulta_srs: lazy(() => import('./paginas/srs/ConsultaSrs')),
  pintura: lazy(() => import('./paginas/pintura/Pintura')),
}

const ICONES_MENU: Record<string, string> = {
  consulta: 'layout-dashboard', graficos: 'chart-column', nova_ficha: 'file-plus', edicao: 'file-pen-line',
  aprovar: 'circle-check-big', cadastrar_aeronave: 'plane', criar_login: 'users', assinaturas: 'signature',
  excluir: 'trash-2', gerou_aprovou: 'user-check', plantao: 'calendar-days', ferias: 'palmtree',
  atividades: 'list-checks', time: 'users', consulta_srs: 'file-text', pintura: 'paintbrush',
}

const ICONES_AREA: Record<string, string> = {
  paintbrush: '<path d="m14.622 17.897-10.68-2.913"/><path d="M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z"/><path d="M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 .858.316c.86-.098 2.394-.505 3.394-2.016"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  'calendar-days': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
}

export const Logo = ({ altura = 40 }: { altura?: number }) => <img src="/logo_gol.png" alt="GOL" style={{ height: altura, width: 'auto' }} />

// Endereço: #/area/pagina (o botão Voltar do navegador funciona).
function lerEndereco() {
  const [, area, pagina] = window.location.hash.replace(/^#/, '').split('/')
  return { area: area || null, pagina: pagina || null }
}
export function irPara(area: string | null, pagina?: string | null) {
  const novo = area ? `#/${area}${pagina ? '/' + pagina : ''}` : '#/'
  if (window.location.hash !== novo) window.location.hash = novo
}
function useEndereco() {
  const [endereco, setEndereco] = useState(lerEndereco)
  useEffect(() => {
    const mudou = () => setEndereco(lerEndereco())
    window.addEventListener('hashchange', mudou)
    return () => window.removeEventListener('hashchange', mudou)
  }, [])
  return endereco
}

export default function App() {
  const { sessao, carregando } = useSessao()
  const [boasVindas, setBoasVindas] = useState(false)
  const endereco = useEndereco()
  if (carregando) return <TelaCarregando texto="Carregando o site…" />
  if (!sessao) return <Login aoEntrar={() => setBoasVindas(true)} />
  if (boasVindas) return <BoasVindas nome={sessao.nome} fim={() => setBoasVindas(false)} />
  const areas = sessao.areas
  const area = areas.find((a) => a.id === endereco.area)
  if (!area) {
    if (areas.length === 1) { irPara(areas[0].id); return null }
    return <EscolhaArea areas={areas} />
  }
  const paginas = area.grupos.flatMap((g) => g.paginas.map((p) => p.id))
  const pagina = paginas.includes(endereco.pagina || '') ? endereco.pagina! : paginas[0]
  return <Estrutura area={area} pagina={pagina} outras={areas.length > 1} />
}

function TelaCarregando({ texto }: { texto: string }) {
  useEffect(() => { document.body.classList.add('fundo-escolha'); return () => document.body.classList.remove('fundo-escolha') }, [])
  return (
    <div className="boas-vindas">
      <Logo />
      <div className="boas-vindas-marca">Central Engenharia Gol</div>
      <div className="gol-loader" />
      <p>{texto}</p>
    </div>
  )
}

function Login({ aoEntrar }: { aoEntrar: () => void }) {
  const { entrar } = useSessao()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { document.body.classList.add('fundo-escolha'); return () => document.body.classList.remove('fundo-escolha') }, [])
  const enviar = async () => {
    setOcupado(true)
    setErro(null)
    try {
      await entrar(usuario, senha)
      aoEntrar()
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '14vh 16px 2rem' }}>
      <form className="vidro login-caixa" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <div className="login-topo">
          <Logo />
          <div className="login-titulo">Central Engenharia Gol</div>
          <div className="login-sub">Entre com seu usuário para continuar.</div>
        </div>
        <Texto rotulo="Usuário" valor={usuario} mudar={setUsuario} autoFocus />
        <Texto rotulo="Senha" tipo="password" valor={senha} mudar={setSenha} />
        <Botao tipo="primario" cheio submit ocupado={ocupado}>Acessar</Botao>
        <div style={{ marginTop: '.8rem' }}><Erro erro={erro} /></div>
      </form>
    </div>
  )
}

function BoasVindas({ nome, fim }: { nome: string; fim: () => void }) {
  useEffect(() => { const t = setTimeout(fim, 1600); return () => clearTimeout(t) }, [fim])
  const primeiro = nome.split(' ')[0]
  useEffect(() => { document.body.classList.add('fundo-escolha'); return () => document.body.classList.remove('fundo-escolha') }, [])
  return (
    <div className="boas-vindas">
      <Logo />
      <div className="boas-vindas-marca">Central Engenharia Gol</div>
      <div className="boas-vindas-titulo">Bem-vindo, {primeiro}</div>
      <div className="gol-loader" />
      <p>Carregando o site…</p>
    </div>
  )
}

function SvgArea({ nome }: { nome: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONES_AREA[nome] || '' }} />
}

function EscolhaArea({ areas }: { areas: Area[] }) {
  const { sessao, sair } = useSessao()
  useEffect(() => { document.body.classList.add('fundo-escolha'); return () => document.body.classList.remove('fundo-escolha') }, [])
  const primeiro = (sessao?.nome || '').split(' ')[0]
  // Com quatro partes, duas linhas de duas; com cinco ou seis, linhas de três.
  const porLinha = areas.length === 4 ? 2 : areas.length > 4 ? 3 : areas.length
  return (
    <div style={{ maxWidth: porLinha <= 2 ? 820 : 1180, margin: '0 auto', padding: '0 16px 3rem' }}>
      <div className="escolha-topo">
        <div className="escolha-marca">Central Engenharia Gol</div>
        <div className="escolha-titulo">Olá, {primeiro}</div>
        <p>Para onde você quer seguir?</p>
      </div>
      <div className="escolha-grade" style={{ ['--por-linha' as any]: porLinha }}>
        {areas.map((a) => (
          <button key={a.id} className="cartao-area" onClick={() => irPara(a.id)}>
            <div className="cartao-area-icone"><SvgArea nome={a.icone} /></div>
            <div className="cartao-area-titulo">{a.titulo}</div>
            <p>{a.descricao}</p>
            <div className="cartao-area-seta">Entrar →</div>
          </button>
        ))}
      </div>
      <div style={{ maxWidth: 260, margin: '2.2rem auto 0' }}><Botao cheio onClick={sair}>Sair</Botao></div>
    </div>
  )
}

function Estrutura({ area, pagina, outras }: { area: Area; pagina: string; outras: boolean }) {
  const { sessao, sair } = useSessao()
  const [menuAberto, setMenuAberto] = useState(false)
  const Tela = PAGINAS[pagina]
  useEffect(() => { setMenuAberto(false); window.scrollTo(0, 0) }, [pagina])
  const iniciais = useMemo(() => (sessao?.nome || '').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?', [sessao])
  // A Consulta SR's usa a tela inteira, com a própria barra no topo.
  if (area.id === 'srs') {
    return <Suspense fallback={<Carregando />}><Tela /></Suspense>
  }
  return (
    <div className="layout">
      <button className="botao botao-menu-movel" onClick={() => setMenuAberto(!menuAberto)} aria-label="Menu">☰</button>
      <aside className={`lateral${menuAberto ? ' aberta' : ''}`}>
        <div className="menu-marca"><Logo altura={20} /><div className="menu-marca-sep" /><div className="menu-marca-nome">{area.menu}</div></div>
        {outras && (
          <button className="item-menu menu-inicio" onClick={() => irPara(null)} title="Voltar para a tela inicial, com as outras partes do site">
            <span className="ic" style={{ ['--icone' as any]: 'url(/icones/layout-grid.svg)' }} />Início
          </button>
        )}
        {area.grupos.map((g) => (
          <div key={g.titulo}>
            <div className="grupo-menu">{g.titulo}</div>
            {g.paginas.map((p) => (
              <button key={p.id} className={`item-menu${p.id === pagina ? ' ativo' : ''}`} onClick={() => irPara(area.id, p.id)}>
                {ICONES_MENU[p.id] ? <span className="ic" style={{ ['--icone' as any]: `url(/icones/${ICONES_MENU[p.id]}.svg)` }} /> : <span style={{ width: '1.05rem' }} />}
                {p.titulo}
              </button>
            ))}
          </div>
        ))}
        <div className="menu-rodape">
          <div className="usuario"><div className="usuario-avatar">{iniciais}</div><div><b>{sessao?.nome}</b><br /><span>{sessao?.perfil}</span></div></div>
          <button className="item-menu" style={{ color: 'var(--cinza)', minHeight: '2rem', fontSize: '.9rem' }} onClick={sair}>
            <span className="ic" style={{ ['--icone' as any]: 'url(/icones/log-out.svg)' }} />Sair
          </button>
        </div>
      </aside>
      <main className="conteudo">
        <Suspense fallback={<Carregando />}>{Tela ? <Tela key={pagina} /> : null}</Suspense>
      </main>
    </div>
  )
}
