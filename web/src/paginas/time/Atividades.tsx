// Projetos e atividades do time, como canais (tela_atividades do app.py).
import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../../api'
import {
  AreaTexto, Botao, Carregando, DataCampo, Dialogo, Erro, Expansor, Html, Marcar, Metrica, MultiSelecao,
  Popover, Selecao, Texto, useAcao, useDados,
} from '../../componentes/ui'

type Projeto = {
  id: number; nome: string; descricao: string; lider: string | null; etapa: string; prazo: string | null
  situacao: string; cor: string; motivo: string; feitas: number; total: number; abertas: number
  proxima: { data: string; titulo: string } | null; prazo_curto: string | null
  participantes: Record<string, string | null>; pode_excluir: boolean
}
type Tarefa = {
  id: number; projeto_id: number; titulo: string; descricao: string | null; responsavel: string | null
  prazo: string | null; status: string; concluido_em: string | null; prazo_html: string; prazo_html_curto: string; minha: boolean
}
type Dados = {
  hoje: string; projetos: Projeto[]; tarefas: Tarefa[]; concluidas_30_dias: number
  pessoas: Record<string, string>; meu_nome: string; etapas: string[]; status: string[]
}
type Selecao = 'geral' | 'minhas' | number

const SEM_LIDER = '— Sem líder —'
const SEM_RESPONSAVEL = '— Sem responsável —'
const dias = (a: string, b: string) => Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86400000)
const ordenarPorPrazo = (ts: Tarefa[]) => [...ts].sort((a, b) =>
  (a.prazo === null ? 1 : 0) - (b.prazo === null ? 1 : 0) || String(a.prazo || '').localeCompare(String(b.prazo || '')) || a.id - b.id)
const porConclusao = (ts: Tarefa[]) => [...ts].sort((a, b) => String(b.concluido_em || '').localeCompare(String(a.concluido_em || '')))
const iniciais = (nome: string) => (nome || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
const nomeCurto = (nome: string) => { const p = nome.split(/\s+/).filter(Boolean); return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : nome }

function Avatar({ nome }: { nome: string }) { return <span className="ativ-avatar" title={nome}>{iniciais(nome)}</span> }
function Pessoa({ nome, vazio }: { nome: string | null; vazio: string }) {
  return nome
    ? <div className="ativ-pessoa"><Avatar nome={nome} /><span className="nome" title={nome}>{nomeCurto(nome)}</span></div>
    : <div className="ativ-pessoa"><span className="vazio">{vazio}</span></div>
}
function Progresso({ feitas, total }: { feitas: number; total: number }) {
  const pct = total ? Math.round(100 * feitas / total) : 0
  return <div className="ativ-progresso"><div className="trilho"><div style={{ width: `${pct}%` }} /></div><span>{feitas}/{total}</span></div>
}
const Vazio = ({ children }: { children: ReactNode }) => <div className="ativ-vazio">{children}</div>

export default function Atividades() {
  const [versao, setVersao] = useState(0)
  const { dados, erro } = useDados(() => api.get<Dados>('/api/atividades'), [versao])
  const [selecao, setSelecaoLocal] = useState<Selecao>(() => {
    try { const v = sessionStorage.getItem('ativ_selecao'); if (v) return v === 'geral' || v === 'minhas' ? v : Number(v) } catch { /* */ }
    return 'geral'
  })
  const setSelecao = (s: Selecao) => { setSelecaoLocal(s); try { sessionStorage.setItem('ativ_selecao', String(s)) } catch { /* */ } }
  const [dialogo, setDialogo] = useState<null | { tipo: 'projeto'; projeto?: Projeto } | { tipo: 'tarefa'; projetoId: number; tarefa?: Tarefa }>(null)
  const recarregar = () => setVersao((v) => v + 1)
  if (!dados) return erro ? <Erro erro={erro} /> : <Carregando />

  const atual: Selecao = typeof selecao === 'number' && !dados.projetos.some((p) => p.id === selecao) ? 'geral' : selecao
  const minhasAbertas = dados.tarefas.filter((t) => t.status !== 'Concluída' && t.minha).length
  const grupos: [string, Projeto[]][] = [
    ['Projetos', dados.projetos.filter((p) => p.etapa === 'Em andamento')],
    ['Ideias', dados.projetos.filter((p) => p.etapa === 'Ideia')],
    ['Pausados', dados.projetos.filter((p) => p.etapa === 'Pausado')],
  ]
  const concluidos = dados.projetos.filter((p) => p.etapa === 'Concluído')
  const canal = (p: Projeto) => (
    <button key={p.id} className={`ativ-canal${atual === p.id ? ' ativo' : ''}`} onClick={() => setSelecao(p.id)}>
      <span className="t"># {p.nome}{p.abertas ? `  ·  ${p.abertas}` : ''}</span>
    </button>
  )
  const comum = { dados, recarregar, abrirTarefa: (projetoId: number, tarefa?: Tarefa) => setDialogo({ tipo: 'tarefa', projetoId, tarefa }) }
  return (
    <div className="ativ-layout">
      <div className="ativ-canais">
        <button className={`ativ-canal${atual === 'geral' ? ' ativo' : ''}`} onClick={() => setSelecao('geral')}><span className="t">▦ Visão geral</span></button>
        <button className={`ativ-canal${atual === 'minhas' ? ' ativo' : ''}`} onClick={() => setSelecao('minhas')}>
          <span className="t">▤ Minhas atividades{minhasAbertas ? `  ·  ${minhasAbertas}` : ''}</span>
        </button>
        {grupos.map(([rotulo, lista]) => (lista.length > 0 || rotulo === 'Projetos') && (
          <div key={rotulo}><div className="ativ-rotulo">{rotulo}</div>{lista.map(canal)}</div>
        ))}
        <button className="ativ-canal novo" onClick={() => setDialogo({ tipo: 'projeto' })}><span className="t">+ Novo projeto</span></button>
        {concluidos.length > 0 && (
          <Expansor titulo={`Concluídos (${concluidos.length})`} aberto={concluidos.some((p) => p.id === atual)}>{concluidos.map(canal)}</Expansor>
        )}
      </div>
      <div>
        {atual === 'geral' && <VisaoGeral dados={dados} abrir={setSelecao} />}
        {atual === 'minhas' && <Minhas {...comum} />}
        {typeof atual === 'number' && (
          <VisaoProjeto {...comum} projeto={dados.projetos.find((p) => p.id === atual)!}
            editar={(p) => setDialogo({ tipo: 'projeto', projeto: p })} />
        )}
      </div>
      {dialogo?.tipo === 'projeto' && (
        <DialogoProjeto dados={dados} projeto={dialogo.projeto} fechar={() => setDialogo(null)}
          pronto={(id) => { setDialogo(null); if (id !== undefined) setSelecao(id); recarregar() }} />
      )}
      {dialogo?.tipo === 'tarefa' && (
        <DialogoTarefa dados={dados} projetoId={dialogo.projetoId} tarefa={dialogo.tarefa} fechar={() => setDialogo(null)}
          pronto={() => { setDialogo(null); recarregar() }} />
      )}
    </div>
  )
}

// --------------------------------------------------------------------------- //
function VisaoGeral({ dados, abrir }: { dados: Dados; abrir: (s: Selecao) => void }) {
  const { hoje, projetos, tarefas } = dados
  const ativos = new Set(projetos.filter((p) => p.etapa !== 'Concluído' && p.etapa !== 'Pausado').map((p) => p.id))
  const abertas = tarefas.filter((t) => t.status !== 'Concluída' && ativos.has(t.projeto_id))
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < hoje)
  const proximas = abertas.filter((t) => t.prazo && dias(t.prazo, hoje) >= 0 && dias(t.prazo, hoje) <= 14)
  const nomes = Object.fromEntries(projetos.map((p) => [p.id, p.nome]))
  const ordem: Record<string, number> = { Atrasado: 0, 'Atenção': 1, 'Em dia': 2, Ideia: 3, Pausado: 4, 'Concluído': 5 }
  const lista = [...projetos].sort((a, b) => (ordem[a.situacao] ?? 9) - (ordem[b.situacao] ?? 9) || a.nome.toLowerCase().localeCompare(b.nome.toLowerCase()))

  const carga = new Map<string, { abertas: number; atrasadas: number; semana: number }>()
  for (const t of abertas) {
    const p = t.responsavel || 'Sem responsável'
    const d = carga.get(p) || { abertas: 0, atrasadas: 0, semana: 0 }
    d.abertas += 1
    if (t.prazo && t.prazo < hoje) d.atrasadas += 1
    else if (t.prazo && dias(t.prazo, hoje) <= 7) d.semana += 1
    carga.set(p, d)
  }
  const maximo = Math.max(1, ...[...carga.values()].map((d) => d.abertas))
  const entregas = [...ordenarPorPrazo(atrasadas), ...ordenarPorPrazo(proximas)]
  return (
    <>
      <div className="ativ-titulo">Visão geral</div>
      <p className="ativ-desc">Como estão os projetos e o time hoje.</p>
      <div className="grade g4" style={{ marginTop: '1rem' }}>
        <Metrica rotulo="Projetos ativos" valor={projetos.filter((p) => p.etapa === 'Em andamento').length} />
        <Metrica rotulo="Atividades em aberto" valor={abertas.length} />
        <Metrica rotulo="Atrasadas" valor={atrasadas.length} />
        <Metrica rotulo="Concluídas em 30 dias" valor={dados.concluidas_30_dias} />
      </div>
      {!projetos.length ? <Vazio>Nenhum projeto ainda.<br />Use <b>Novo projeto</b> para começar.</Vazio> : (
        <>
          <div className="ativ-secao">Projetos</div>
          <div className="ativ-cab-tabela"><span>Projeto</span><span>Líder</span><span>Progresso</span><span>Próxima entrega</span><span>Situação</span></div>
          {lista.map((p) => (
            <div key={p.id} className="ativ-painel">
              <div style={{ minWidth: 0 }}>
                <button className="ativ-abrir" onClick={() => abrir(p.id)}># {p.nome}</button>
                <div className="sub ativ-sub-projeto">{p.etapa}{p.prazo_curto ? ` · entrega final ${p.prazo_curto}` : ''}</div>
              </div>
              <Pessoa nome={p.lider} vazio="Sem líder" />
              <Progresso feitas={p.feitas} total={p.total} />
              <div className="ativ-celula-txt" style={{ minWidth: 0 }}>
                {p.proxima ? <><div className="forte">{p.proxima.data}</div><div className="sub">{p.proxima.titulo}</div></> : <div className="sub">—</div>}
              </div>
              <div className="ativ-celula-txt">
                <div className="forte"><span className={`ativ-bolinha ${p.cor}`} />{p.situacao}</div>
                {p.motivo && <div className="sub">{p.motivo}</div>}
              </div>
            </div>
          ))}
          <div className="grade g2" style={{ gap: '2rem' }}>
            <div>
              <div className="ativ-secao">Carga do time</div>
              {!carga.size ? <Vazio>Nenhuma atividade em aberto.</Vazio>
                : [...carga.entries()].sort((a, b) => Number(a[0] === 'Sem responsável') - Number(b[0] === 'Sem responsável')
                  || b[1].abertas - a[1].abertas || a[0].localeCompare(b[0])).map(([pessoa, d]) => (
                  <div key={pessoa} className="ativ-carga">
                    {pessoa === 'Sem responsável' ? <span className="ativ-avatar vazio">?</span> : <Avatar nome={pessoa} />}
                    <div className="info">
                      <div className="linha1"><span>{pessoa}</span><span className="det">
                        {d.abertas} em aberto{d.semana ? ` · ${d.semana} em 7 dias` : ''}
                        {d.atrasadas > 0 && <> · <b className="atraso">{d.atrasadas} atrasada{d.atrasadas > 1 ? 's' : ''}</b></>}
                      </span></div>
                      <div className="trilho"><div style={{ width: `${Math.round(100 * d.abertas / maximo)}%` }} /></div>
                    </div>
                  </div>
                ))}
            </div>
            <div>
              <div className="ativ-secao">Próximas entregas · 14 dias</div>
              {!entregas.length ? <Vazio>Nada previsto para os próximos 14 dias.</Vazio> : (
                <>
                  {entregas.slice(0, 12).map((t) => (
                    <div key={t.id} className="ativ-entrega">
                      <div className="quando"><Html html={t.prazo_html_curto} /></div>
                      <div className="info">
                        <div className="titulo">{t.titulo}</div>
                        <div className="sub">{t.responsavel || 'Sem responsável'} · # {nomes[t.projeto_id] || ''}</div>
                      </div>
                    </div>
                  ))}
                  {entregas.length > 12 && <div className="sub" style={{ padding: '.4rem .2rem' }}>e mais {entregas.length - 12}…</div>}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- //
type Comum = { dados: Dados; recarregar: () => void; abrirTarefa: (projetoId: number, tarefa?: Tarefa) => void }

function LinhaTarefa({ tarefa, nomeProjeto, dados, recarregar, abrirTarefa }: Comum & { tarefa: Tarefa; nomeProjeto?: string }) {
  const feita = tarefa.status === 'Concluída'
  const { erro, rodar } = useAcao()
  const status = (s: string) => rodar(async () => { await api.post(`/api/atividades/tarefas/${tarefa.id}/status`, { status: s }); recarregar() })
  const sub: string[] = []
  if (nomeProjeto) sub.push(`# ${nomeProjeto}`)
  if (nomeProjeto && tarefa.status === 'Em andamento') sub.push('Em andamento')
  if (tarefa.descricao) { const r = tarefa.descricao.split('\n')[0]; sub.push(r.slice(0, 90) + (r.length > 90 ? '…' : '')) }
  return (
    <>
      <div className="ativ-tarefa">
        <input type="checkbox" checked={feita} title="Concluída" onChange={(e) => status(e.target.checked ? 'Concluída' : 'A fazer')} />
        <div className="ativ-linha"><div className="texto">
          <div className={`titulo${feita ? ' feita' : ''}`}>{tarefa.titulo}</div>
          {sub.length > 0 && <div className="sub">{sub.join(' · ')}</div>}
        </div></div>
        <Pessoa nome={tarefa.responsavel} vazio="Sem responsável" />
        <div className="ativ-celula"><Html html={tarefa.prazo_html} /></div>
        <Popover rotulo="⋯" tipo="terciario" direita>{(fechar) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
            {dados.status.filter((s) => s !== tarefa.status).map((s) => (
              <Botao key={s} cheio onClick={() => { fechar(); status(s) }}>Marcar como {s.toLowerCase()}</Botao>
            ))}
            <Botao cheio onClick={() => { fechar(); abrirTarefa(tarefa.projeto_id, tarefa) }}>Editar</Botao>
            <Botao cheio onClick={() => { fechar(); rodar(async () => { await api.del(`/api/atividades/tarefas/${tarefa.id}`); recarregar() }) }}>Excluir</Botao>
          </div>
        )}</Popover>
      </div>
      <Erro erro={erro} />
    </>
  )
}

function Secao({ titulo, tarefas, nomes, ...comum }: Comum & { titulo: string; tarefas: Tarefa[]; nomes?: Record<number, string> }) {
  if (!tarefas.length) return null
  return (
    <>
      <div className="ativ-secao">{titulo} <span className="contagem">{tarefas.length}</span></div>
      {tarefas.map((t) => <LinhaTarefa key={t.id} tarefa={t} nomeProjeto={nomes?.[t.projeto_id]} {...comum} />)}
    </>
  )
}

function Minhas(comum: Comum) {
  const { dados } = comum
  const hoje = dados.hoje
  const nomes = Object.fromEntries(dados.projetos.map((p) => [p.id, p.nome]))
  const minhas = dados.tarefas.filter((t) => t.minha)
  const abertas = ordenarPorPrazo(minhas.filter((t) => t.status !== 'Concluída'))
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < hoje)
  const semana = abertas.filter((t) => t.prazo && dias(t.prazo, hoje) >= 0 && dias(t.prazo, hoje) <= 7)
  const depois = abertas.filter((t) => !atrasadas.includes(t) && !semana.includes(t))
  const concluidas = minhas.filter((t) => t.status === 'Concluída')
  return (
    <>
      <div className="ativ-titulo">Minhas atividades</div>
      <p className="ativ-desc">Tudo o que está com você, em todos os projetos.</p>
      <div className="grade g3" style={{ marginTop: '1rem' }}>
        <Metrica rotulo="Em aberto" valor={abertas.length} />
        <Metrica rotulo="Para os próximos 7 dias" valor={semana.length} />
        <Metrica rotulo="Atrasadas" valor={atrasadas.length} />
      </div>
      {!minhas.length ? <Vazio>Nenhuma atividade com você por enquanto.<br />Quando alguém te colocar como responsável, ela aparece aqui.</Vazio> : (
        <>
          <Secao titulo="Atrasadas" tarefas={atrasadas} nomes={nomes} {...comum} />
          <Secao titulo="Próximos 7 dias" tarefas={semana} nomes={nomes} {...comum} />
          <Secao titulo="Mais pra frente" tarefas={depois} nomes={nomes} {...comum} />
          {concluidas.length > 0 && (
            <Expansor titulo={`Concluídas (${concluidas.length})`}>
              {porConclusao(concluidas).map((t) => <LinhaTarefa key={t.id} tarefa={t} nomeProjeto={nomes[t.projeto_id]} {...comum} />)}
            </Expansor>
          )}
        </>
      )}
    </>
  )
}

const FILTROS = ['Abertas', 'Concluídas', 'Todas'] as const
const TODOS = 'Todos os responsáveis'

function VisaoProjeto({ projeto, editar, ...comum }: Comum & { projeto: Projeto; editar: (p: Projeto) => void }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Abertas')
  const [pessoa, setPessoa] = useState(TODOS)
  useEffect(() => { setFiltro('Abertas'); setPessoa(TODOS) }, [projeto.id])
  const participantes = Object.keys(projeto.participantes)
  let tarefas = comum.dados.tarefas.filter((t) => t.projeto_id === projeto.id)
  const total = tarefas.length
  const feitas = tarefas.filter((t) => t.status === 'Concluída').length
  if (pessoa !== TODOS) tarefas = tarefas.filter((t) => (t.responsavel || '') === pessoa)
  const abertas = ordenarPorPrazo(tarefas.filter((t) => t.status !== 'Concluída'))
  const concluidas = porConclusao(tarefas.filter((t) => t.status === 'Concluída'))
  return (
    <>
      <div className="ativ-topo">
        <div>
          <div className="ativ-titulo"><span className="cerquilha">#</span>{projeto.nome}</div>
          {projeto.descricao && <p className="ativ-desc">{projeto.descricao}</p>}
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexShrink: 0 }}>
          <Botao tipo="primario" onClick={() => comum.abrirTarefa(projeto.id)}>+ Nova atividade</Botao>
          <Botao titulo="Líder, etapa, entrega final e participantes" onClick={() => editar(projeto)}>⚙</Botao>
        </div>
      </div>
      <div className="ativ-faixa">
        <div><span className="rot">Situação</span><span className="val"><span className={`ativ-bolinha ${projeto.cor}`} />{projeto.situacao}</span>
          {projeto.motivo && <span className="det">{projeto.motivo}</span>}</div>
        <div><span className="rot">Etapa</span><span className="val">{projeto.etapa}</span></div>
        <div><span className="rot">Líder</span><span className="val">{projeto.lider || '—'}</span></div>
        <div><span className="rot">Entrega final</span><span className="val">{projeto.prazo_curto || '—'}</span></div>
        <div><span className="rot">Participantes</span><span className="ativ-pilha">
          {participantes.length ? <>{participantes.slice(0, 6).map((n) => <Avatar key={n} nome={n} />)}
            {participantes.length > 6 && <span className="mais">+{participantes.length - 6}</span>}</> : '—'}
        </span></div>
        <div><span className="rot">Progresso</span><Progresso feitas={feitas} total={total} /></div>
      </div>
      <div className="grade" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'center' }}>
        <div className="segmentado">{FILTROS.map((f) => <button key={f} type="button" className={f === filtro ? 'ativo' : ''} onClick={() => setFiltro(f)}>{f}</button>)}</div>
        <Selecao opcoes={[TODOS, ...participantes]} valor={pessoa} mudar={setPessoa} />
      </div>
      {!tarefas.length ? <Vazio>Nenhuma atividade aqui ainda.<br />Use <b>Nova atividade</b> para criar a primeira.</Vazio> : (
        <>
          {filtro !== 'Concluídas' && (
            <>
              <Secao titulo="Em andamento" tarefas={abertas.filter((t) => t.status === 'Em andamento')} {...comum} />
              <Secao titulo="A fazer" tarefas={abertas.filter((t) => t.status === 'A fazer')} {...comum} />
              {!abertas.length && filtro === 'Abertas' && <Vazio>Tudo concluído por aqui.</Vazio>}
            </>
          )}
          {filtro !== 'Abertas' && (
            <>
              <Secao titulo="Concluídas" tarefas={concluidas} {...comum} />
              {!concluidas.length && filtro === 'Concluídas' && <Vazio>Nenhuma atividade concluída ainda.</Vazio>}
            </>
          )}
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- //
function DialogoProjeto({ dados, projeto, fechar, pronto }: {
  dados: Dados; projeto?: Projeto; fechar: () => void; pronto: (s?: Selecao) => void
}) {
  const pessoas = Object.keys(dados.pessoas)
  const atuais = projeto?.participantes || {}
  const [nome, setNome] = useState(projeto?.nome || '')
  const [descricao, setDescricao] = useState(projeto?.descricao || '')
  const liderAtual = projeto ? (projeto.lider || '') : dados.meu_nome
  const opcoesLider = [SEM_LIDER, ...[...new Set([...pessoas, ...Object.keys(atuais), ...(liderAtual ? [liderAtual] : [])])].sort()]
  const [lider, setLider] = useState(opcoesLider.includes(liderAtual) ? liderAtual : SEM_LIDER)
  const [prazo, setPrazo] = useState<string | null>(projeto?.prazo || null)
  const [etapa, setEtapa] = useState(projeto?.etapa || 'Em andamento')
  const [participantes, setParticipantes] = useState<string[]>(
    projeto ? Object.keys(atuais).filter((n) => pessoas.includes(n)) : (pessoas.includes(dados.meu_nome) ? [dados.meu_nome] : []))
  const [semLogin, setSemLogin] = useState(projeto ? Object.entries(atuais).filter(([n, l]) => !l && !pessoas.includes(n)).map(([n]) => n).join(', ') : '')
  const [confirmar, setConfirmar] = useState(false)
  const { ocupado, erro, setErro, rodar } = useAcao()
  const salvar = () => {
    if (!nome.trim()) return setErro('Dê um nome ao projeto.')
    const corpo = { nome, descricao, lider: lider === SEM_LIDER ? null : lider, etapa, prazo, participantes, sem_login: semLogin }
    rodar(async () => {
      if (projeto) { await api.put(`/api/atividades/projetos/${projeto.id}`, corpo); pronto() }
      else { const r = await api.post('/api/atividades/projetos', corpo); pronto(r.id) }
    })
  }
  return (
    <Dialogo titulo={projeto ? 'Editar projeto' : 'Novo projeto'} aberto fechar={fechar}>
      <Texto rotulo="Nome do projeto" valor={nome} mudar={setNome} placeholder="ex.: Pesagem PR-GXX" autoFocus />
      <AreaTexto rotulo="Objetivo (opcional)" valor={descricao} mudar={setDescricao} altura={80} placeholder="O que o projeto quer entregar e por quê" />
      <div className="grade g2">
        <Selecao rotulo="Líder do projeto" opcoes={opcoesLider} valor={lider} mudar={setLider} />
        <DataCampo rotulo="Entrega final (opcional)" valor={prazo} mudar={setPrazo} />
      </div>
      <div className="campo"><label>Etapa</label><div className="segmentado">
        {dados.etapas.map((e) => <button key={e} type="button" className={e === etapa ? 'ativo' : ''} onClick={() => setEtapa(e)}>{e}</button>)}
      </div></div>
      <MultiSelecao rotulo="Participantes" opcoes={pessoas} valor={participantes} mudar={setParticipantes} placeholder="Escolha as pessoas" />
      <Texto rotulo="Pessoas sem login no site (opcional)" valor={semLogin} mudar={setSemLogin} placeholder="Nomes separados por vírgula" />
      <Erro erro={erro} />
      <Botao tipo="primario" cheio ocupado={ocupado} onClick={salvar}>{projeto ? 'Salvar' : 'Criar projeto'}</Botao>
      {projeto?.pode_excluir && (
        <>
          <hr />
          <Marcar rotulo="Quero excluir este projeto e todas as atividades dele" valor={confirmar} mudar={setConfirmar} />
          <Botao cheio disabled={!confirmar} ocupado={ocupado} onClick={() => rodar(async () => {
            await api.del(`/api/atividades/projetos/${projeto.id}`)
            try { sessionStorage.setItem('ativ_selecao', 'geral') } catch { /* */ }
            pronto('geral')
          })}>Excluir projeto</Botao>
        </>
      )}
    </Dialogo>
  )
}

function DialogoTarefa({ dados, projetoId, tarefa, fechar, pronto }: {
  dados: Dados; projetoId: number; tarefa?: Tarefa; fechar: () => void; pronto: () => void
}) {
  const projeto = dados.projetos.find((p) => p.id === projetoId)
  const participantes = Object.keys(projeto?.participantes || {})
  const responsavelAtual = tarefa?.responsavel || ''
  if (responsavelAtual && !participantes.includes(responsavelAtual)) participantes.push(responsavelAtual)
  const opcoes = [SEM_RESPONSAVEL, ...participantes]
  const [titulo, setTitulo] = useState(tarefa?.titulo || '')
  const [descricao, setDescricao] = useState(tarefa?.descricao || '')
  const [responsavel, setResponsavel] = useState(responsavelAtual || SEM_RESPONSAVEL)
  const [prazo, setPrazo] = useState<string | null>(tarefa?.prazo ? tarefa.prazo.slice(0, 10) : null)
  const [status, setStatus] = useState(tarefa?.status || dados.status[0])
  const { ocupado, erro, setErro, rodar } = useAcao()
  const salvar = () => {
    if (!titulo.trim()) return setErro('Escreva o que precisa ser feito.')
    const corpo = { projeto_id: projetoId, titulo, descricao, responsavel: responsavel === SEM_RESPONSAVEL ? null : responsavel, prazo, status }
    rodar(async () => {
      if (tarefa) await api.put(`/api/atividades/tarefas/${tarefa.id}`, corpo)
      else await api.post('/api/atividades/tarefas', corpo)
      pronto()
    })
  }
  return (
    <Dialogo titulo="Atividade" aberto fechar={fechar}>
      <Texto rotulo="O que precisa ser feito" valor={titulo} mudar={setTitulo} autoFocus />
      <AreaTexto rotulo="Detalhes (opcional)" valor={descricao} mudar={setDescricao} altura={80} />
      <div className="grade g2">
        <Selecao rotulo="Responsável" opcoes={opcoes} valor={responsavel} mudar={setResponsavel} />
        <DataCampo rotulo="Data de entrega" valor={prazo} mudar={setPrazo} />
      </div>
      <div className="campo"><label>Situação</label><div className="segmentado">
        {dados.status.map((s) => <button key={s} type="button" className={s === status ? 'ativo' : ''} onClick={() => setStatus(s)}>{s}</button>)}
      </div></div>
      <Erro erro={erro} />
      <Botao tipo="primario" cheio ocupado={ocupado} onClick={salvar}>{tarefa ? 'Salvar' : 'Criar atividade'}</Botao>
      {!participantes.length && <div className="caption" style={{ marginTop: '.5rem' }}>Dica: adicione participantes ao projeto para escolher o responsável.</div>}
    </Dialogo>
  )
}
