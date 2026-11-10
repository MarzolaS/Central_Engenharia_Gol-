// Pintura da frota: modelos, prefixos, livery, planejamento, vistas, observações, atas e material
// (tela_pintura do app.py).
import { useEffect, useRef, useState } from 'react'
import { api, baixar, enviarArquivo } from '../../api'
import { Blocos } from '../../componentes/Grafico'
import {
  Abas, AreaTexto, Botao, Carregando, Chave, DataCampo, Dialogo, EditorTabela, EnvioArquivo, Erro,
  Expansor, Html, Marcar, Markdown, MultiSelecao, Popover, Selecao, Tabela, Texto, dataBr, useAba, useAcao,
  useDados, useToast,
} from '../../componentes/ui'

const ICONE_AVIAO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>'
const IMAGENS = '.png,.jpg,.jpeg,.webp'

type Modelo = { id: number; nome: string; imagem: string | null }
type Aeronave = {
  id: number; modelo_id: number; prefixo: string; data_inicio: string | null; data_fim: string | null
  data_vencimento: string | null; observacoes: string | null; livery_mini: string | null; tem_livery: boolean
  status: string; vencimento_html: string; prazo_vencimento: string; avanco: number | null
  tarefas: number; tarefas_feitas: number; observacoes_tecnicas: number; materiais: number
  atualizado_em: string | null; atualizado_por: string | null; atualizado_em_texto: string
}
type Inicio = { modelos: Modelo[]; aeronaves: Aeronave[]; editar: boolean; excluir: boolean; dias_aviso_vencimento: number; hoje: string; vistas: Record<string, string> }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
function guardado(chave: string): number | null {
  try { const v = sessionStorage.getItem(chave); return v ? Number(v) : null } catch { return null }
}
function guardar(chave: string, v: number | null) {
  try { if (v === null) sessionStorage.removeItem(chave); else sessionStorage.setItem(chave, String(v)) } catch { /* */ }
}

export default function Pintura() {
  const [versao, setVersao] = useState(0)
  const { dados, erro } = useDados(() => api.get<Inicio>('/api/pintura'), [versao])
  const [modeloId, setModeloIdLocal] = useState<number | null>(() => guardado('pint_modelo'))
  const [aeronaveId, setAeronaveIdLocal] = useState<number | null>(() => guardado('pint_aeronave'))
  const setModeloId = (v: number | null) => { setModeloIdLocal(v); guardar('pint_modelo', v) }
  const setAeronaveId = (v: number | null) => { setAeronaveIdLocal(v); guardar('pint_aeronave', v) }
  const recarregar = () => setVersao((v) => v + 1)
  useEffect(() => { window.scrollTo(0, 0) }, [modeloId, aeronaveId])
  if (!dados) return erro ? <Erro erro={erro} /> : <Carregando />

  const modelos = new Map(dados.modelos.map((m) => [m.id, m]))
  const aeronave = dados.aeronaves.find((a) => a.id === aeronaveId)
  const modelo = modelos.get(modeloId ?? -1)
  if (aeronave && modelos.has(aeronave.modelo_id)) {
    return <TelaAeronave dados={dados} modelo={modelos.get(aeronave.modelo_id)!} aeronave={aeronave} versao={versao}
      recarregar={recarregar} voltar={() => { setModeloId(aeronave.modelo_id); setAeronaveId(null) }} />
  }
  if (modelo) {
    return <TelaModelo dados={dados} modelo={modelo} recarregar={recarregar}
      voltar={() => { setModeloId(null); setAeronaveId(null) }} abrir={(id) => setAeronaveId(id)} />
  }
  return <TelaModelos dados={dados} recarregar={recarregar} abrir={(id) => { setModeloId(id); setAeronaveId(null) }} />
}

// --------------------------------------------------------------------------- //
function TelaModelos({ dados, recarregar, abrir }: { dados: Inicio; recarregar: () => void; abrir: (id: number) => void }) {
  const [novo, setNovo] = useState(false)
  const { modelos, aeronaves } = dados
  const emAndamento = aeronaves.filter((a) => a.status === 'Em andamento').length
  const vencendo = aeronaves.filter((a) => a.data_vencimento && Math.round((new Date(a.data_vencimento).getTime() - new Date(dados.hoje).getTime()) / 86400000) <= dados.dias_aviso_vencimento).length
  return (
    <>
      <div className="pint-topo">
        <div className="ativ-titulo">Pintura da frota</div>
        <p className="ativ-desc">Escolha o modelo para ver os prefixos, a livery, as datas e o material de cada pintura.</p>
        <div className="ativ-resumo">
          <b>{modelos.length}</b> modelo{modelos.length !== 1 ? 's' : ''} · <b>{aeronaves.length}</b> prefixo{aeronaves.length !== 1 ? 's' : ''} · <b>{emAndamento}</b> em andamento
          {vencendo > 0 && <> · <b>{vencendo}</b> vencida{vencendo !== 1 ? 's' : ''} ou vencendo em até 6 meses</>}
        </div>
      </div>
      {!modelos.length && !dados.editar ? <div className="ativ-vazio">Nenhum modelo cadastrado ainda.</div> : (
        <div className="pint-grade">
          {modelos.map((m) => (
            <button key={m.id} className="pint-clicavel" onClick={() => abrir(m.id)}>
              <div className="pint-cartao">
                <div className="pint-foto">{m.imagem ? <img src={m.imagem} alt="" /> : <span dangerouslySetInnerHTML={{ __html: ICONE_AVIAO }} />}</div>
                <div className="pint-corpo"><div className="pint-nome">{m.nome}</div></div>
              </div>
            </button>
          ))}
          {dados.editar && (
            <button className="pint-clicavel" onClick={() => setNovo(true)}>
              <div className="pint-novo"><span className="mais">+</span>Adicionar modelo</div>
            </button>
          )}
        </div>
      )}
      {novo && <DialogoModelo dados={dados} fechar={() => setNovo(false)} pronto={(id) => { setNovo(false); recarregar(); if (id) abrir(id) }} />}
    </>
  )
}

function DialogoModelo({ dados, modelo, fechar, pronto, excluido }: {
  dados: Inicio; modelo?: Modelo; fechar: () => void; pronto: (id?: number) => void; excluido?: () => void
}) {
  const [nome, setNome] = useState(modelo?.nome || '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const { ocupado, erro, setErro, rodar } = useAcao()
  const qtd = modelo ? dados.aeronaves.filter((a) => a.modelo_id === modelo.id).length : 0
  return (
    <Dialogo titulo={modelo ? 'Editar modelo' : 'Novo modelo'} aberto fechar={fechar}>
      <Texto rotulo="Nome do modelo" valor={nome} mudar={setNome} placeholder="ex.: Boeing 737 MAX 8" autoFocus />
      <EnvioArquivo rotulo={'Imagem do modelo' + (modelo?.imagem ? ' (deixe vazio para manter a atual)' : '')} aceitar={IMAGENS} arquivo={arquivo} mudar={setArquivo} />
      <Erro erro={erro} />
      <Botao tipo="primario" cheio ocupado={ocupado} onClick={() => {
        if (!nome.trim()) return setErro('Dê um nome ao modelo.')
        rodar(async () => {
          const f = new FormData()
          f.append('nome', nome)
          if (modelo) f.append('modelo_id', String(modelo.id))
          if (arquivo) f.append('imagem', arquivo)
          const r = await api.post('/api/pintura/modelos', f)
          pronto(modelo ? undefined : r.id)
        })
      }}>{modelo ? 'Salvar' : 'Adicionar modelo'}</Botao>
      {modelo && dados.excluir && (
        <div style={{ marginTop: '1rem' }}>
          <Expansor titulo="Excluir este modelo">
            <div className="caption">{qtd ? `Apaga o modelo e ${plural(qtd, 'prefixo', 'prefixos')} com as liveries e listas de material.` : 'O modelo não tem prefixos.'}</div>
            <Marcar rotulo="Quero excluir" valor={confirmar} mudar={setConfirmar} />
            {confirmar && <Botao ocupado={ocupado} onClick={() => rodar(async () => { await api.del(`/api/pintura/modelos/${modelo.id}`); excluido?.() })}>Excluir modelo</Botao>}
          </Expansor>
        </div>
      )}
    </Dialogo>
  )
}

// --------------------------------------------------------------------------- //
const FILTROS = ['Todos', 'Em andamento', 'Finalizados'] as const

function TelaModelo({ dados, modelo, recarregar, voltar, abrir }: {
  dados: Inicio; modelo: Modelo; recarregar: () => void; voltar: () => void; abrir: (id: number) => void
}) {
  const aeronaves = dados.aeronaves.filter((a) => a.modelo_id === modelo.id)
  const andamento = aeronaves.filter((a) => a.status === 'Em andamento')
  const finalizadas = aeronaves.filter((a) => a.status === 'Finalizada')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todos')
  const [busca, setBusca] = useState('')
  const [dialogo, setDialogo] = useState<'prefixo' | 'modelo' | null>(null)
  const rotulos = { Todos: `Todos (${aeronaves.length})`, 'Em andamento': `Em andamento (${andamento.length})`, Finalizados: `Finalizados (${finalizadas.length})` }
  let lista = filtro === 'Em andamento' ? andamento : filtro === 'Finalizados' ? finalizadas : aeronaves
  const termo = busca.replace(/[\s-]/g, '').toUpperCase()
  if (termo) lista = lista.filter((a) => a.prefixo.replace(/-/g, '').includes(termo))
  const ordem = (a: Aeronave) => -(new Date(a.data_fim || a.data_inicio || '0001-01-01').getTime())
  lista = [...lista].sort((a, b) => Number(a.status === 'Finalizada') - Number(b.status === 'Finalizada') || ordem(a) - ordem(b) || a.prefixo.localeCompare(b.prefixo))
  return (
    <>
      <button className="pint-voltar-btn" onClick={voltar}>← Modelos</button>
      <div className="ativ-topo">
        <div>
          <div className="ativ-titulo">{modelo.nome}</div>
          <div className="ativ-resumo"><b>{aeronaves.length}</b> prefixo{aeronaves.length !== 1 ? 's' : ''} · <b>{andamento.length}</b> em andamento · <b>{finalizadas.length}</b> finalizado{finalizadas.length !== 1 ? 's' : ''}</div>
        </div>
        {dados.editar && (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <Botao tipo="primario" onClick={() => setDialogo('prefixo')}>+ Prefixo</Botao>
            <Botao onClick={() => setDialogo('modelo')}>Editar</Botao>
          </div>
        )}
      </div>
      <div className="grade" style={{ gridTemplateColumns: '2fr 1.3fr', alignItems: 'center', marginTop: '.6rem' }}>
        <div className="segmentado">{FILTROS.map((f) => <button key={f} type="button" className={f === filtro ? 'ativo' : ''} onClick={() => setFiltro(f)}>{rotulos[f]}</button>)}</div>
        <Texto valor={busca} mudar={setBusca} placeholder="Buscar prefixo" />
      </div>
      {!lista.length ? (
        <div className="ativ-vazio">
          {!aeronaves.length ? <>Nenhum prefixo neste modelo ainda.{dados.editar && <><br />Use o botão <b>+ Prefixo</b> para adicionar.</>}</> : 'Nenhum prefixo com esse filtro.'}
        </div>
      ) : (
        <div className="pint-grade">
          {lista.map((a) => (
            <button key={a.id} className="pint-clicavel" onClick={() => abrir(a.id)}>
              <div className="pint-cartao">
                <div className="pint-foto livery">{a.livery_mini ? <img src={a.livery_mini} alt="" /> : <span dangerouslySetInnerHTML={{ __html: ICONE_AVIAO }} />}</div>
                <div className="pint-corpo">
                  <div className="pint-linha"><div className="pint-nome">{a.prefixo}</div>
                    <span className={`pint-chip ${a.status === 'Finalizada' ? 'finalizada' : 'andamento'}`}>{a.status}</span></div>
                  <div className="pint-datas">Início {dataBr(a.data_inicio) || '—'} · Fim {dataBr(a.data_fim) || '—'}</div>
                  <div className="pint-chips"><span dangerouslySetInnerHTML={{ __html: a.vencimento_html }} style={{ display: 'contents' }} />
                    {a.avanco !== null && <span className="pint-chip">Avanço {a.avanco}%</span>}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {dialogo === 'modelo' && <DialogoModelo dados={dados} modelo={modelo} fechar={() => setDialogo(null)}
        pronto={() => { setDialogo(null); recarregar() }} excluido={() => { setDialogo(null); voltar(); recarregar() }} />}
      {dialogo === 'prefixo' && <DialogoPrefixo modelo={modelo} fechar={() => setDialogo(null)} pronto={(id) => { setDialogo(null); recarregar(); abrir(id) }} />}
    </>
  )
}

function DialogoPrefixo({ modelo, fechar, pronto }: { modelo: Modelo; fechar: () => void; pronto: (id: number) => void }) {
  const [prefixo, setPrefixo] = useState('')
  const [inicio, setInicio] = useState<string | null>(null)
  const { ocupado, erro, setErro, rodar } = useAcao()
  return (
    <Dialogo titulo="Novo prefixo" aberto fechar={fechar}>
      <Texto rotulo="Prefixo" valor={prefixo} mudar={setPrefixo} placeholder="ex.: PR-GXA" autoFocus />
      <DataCampo rotulo="Início da pintura (opcional)" valor={inicio} mudar={setInicio} />
      <Erro erro={erro} />
      <Botao tipo="primario" cheio ocupado={ocupado} onClick={() => {
        if (!prefixo.trim()) return setErro('Digite o prefixo.')
        rodar(async () => pronto((await api.post('/api/pintura/aeronaves', { modelo_id: modelo.id, prefixo, data_inicio: inicio })).id))
      }}>Adicionar prefixo</Botao>
    </Dialogo>
  )
}

// --------------------------------------------------------------------------- //
const ABAS = ['Livery e datas', 'Planejamento', 'Vistas e áreas', 'Observações técnicas', 'Atas de reunião', 'Lista de material']

function TelaAeronave({ dados, modelo, aeronave, versao, recarregar, voltar }: {
  dados: Inicio; modelo: Modelo; aeronave: Aeronave; versao: number; recarregar: () => void; voltar: () => void
}) {
  const [aba, setAba] = useAba('pintura_aeronave', ABAS)
  const a = aeronave
  const props = { dados, aeronave: a, modelo, versao, recarregar }
  return (
    <>
      <button className="pint-voltar-btn" onClick={voltar}>← {modelo.nome}</button>
      <div className="pint-linha" style={{ justifyContent: 'flex-start', gap: '.7rem' }}>
        <div className="ativ-titulo">{a.prefixo}</div>
        <span className={`pint-chip ${a.status === 'Finalizada' ? 'finalizada' : 'andamento'}`}>{a.status}</span>
      </div>
      <p className="ativ-desc">{modelo.nome}</p>
      <div className="ativ-faixa">
        <div><span className="rot">Início da pintura</span><span className="val">{dataBr(a.data_inicio) || '—'}</span></div>
        <div><span className="rot">Fim da pintura</span><span className="val">{dataBr(a.data_fim) || '—'}</span></div>
        <div><span className="rot">Vencimento</span><span className="val">{dataBr(a.data_vencimento) || '—'}</span><span className="det">{a.prazo_vencimento}</span></div>
        {a.tarefas > 0 && <div><span className="rot">Avanço físico</span><span className="val">{a.avanco}%</span><span className="det">{a.tarefas_feitas} de {a.tarefas} tarefas</span></div>}
        <div><span className="rot">Observações técnicas</span><span className="val">{a.observacoes_tecnicas}</span></div>
        <div><span className="rot">Lista de material</span><span className="val">{a.materiais} ite{a.materiais !== 1 ? 'ns' : 'm'}</span></div>
      </div>
      <Abas abas={ABAS} ativa={aba} mudar={setAba} />
      {aba === ABAS[0] && <AbaLivery {...props} saiu={voltar} />}
      {aba === ABAS[1] && <AbaPlanejamento {...props} />}
      {aba === ABAS[2] && <AbaVistas {...props} />}
      {aba === ABAS[3] && <AbaObservacoes {...props} />}
      {aba === ABAS[4] && <AbaAtas {...props} />}
      {aba === ABAS[5] && <AbaMaterial {...props} />}
      {a.atualizado_em && <div className="pint-rodape">Última alteração: {a.atualizado_por || '—'}, {a.atualizado_em_texto}</div>}
    </>
  )
}

type PropsAba = { dados: Inicio; aeronave: Aeronave; modelo: Modelo; versao: number; recarregar: () => void }

function AbaLivery({ dados, aeronave: a, versao, recarregar, saiu }: PropsAba & { saiu: () => void }) {
  const { dados: det } = useDados(() => api.get<{ livery: string | null }>(`/api/pintura/aeronaves/${a.id}`), [a.id, versao])
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [inicio, setInicio] = useState(a.data_inicio)
  const [fim, setFim] = useState(a.data_fim)
  const [vencimento, setVencimento] = useState(a.data_vencimento)
  const [obs, setObs] = useState(a.observacoes || '')
  const [prefixo, setPrefixo] = useState(a.prefixo)
  const [confirmar, setConfirmar] = useState(false)
  useEffect(() => { setInicio(a.data_inicio); setFim(a.data_fim); setVencimento(a.data_vencimento); setObs(a.observacoes || ''); setPrefixo(a.prefixo) }, [a])
  const { ocupado, erro, setErro, rodar } = useAcao()
  const livery = det?.livery
  return (
    <div className="grade" style={{ gridTemplateColumns: '1.7fr 1fr', gap: '2rem', marginTop: '.8rem' }}>
      <div>
        {!det ? <Carregando /> : livery
          ? <div className="pint-livery-grande"><img src={livery} alt="Livery" /></div>
          : <div className="pint-livery-grande"><div className="pint-livery-vazia"><span dangerouslySetInnerHTML={{ __html: ICONE_AVIAO }} />Nenhuma imagem da livery ainda.</div></div>}
        {dados.editar && (
          <>
            <EnvioArquivo rotulo={livery ? 'Trocar a imagem da livery' : 'Enviar a imagem da livery'} aceitar={IMAGENS} arquivo={arquivo} mudar={setArquivo} />
            {arquivo && (
              <div className="grade g2">
                <Botao tipo="primario" cheio ocupado={ocupado} onClick={() => rodar(async () => {
                  await api.put(`/api/pintura/aeronaves/${a.id}/livery`, enviarArquivo('imagem', arquivo)); setArquivo(null); recarregar()
                })}>Salvar imagem</Botao>
                {livery && <Botao cheio ocupado={ocupado} onClick={() => rodar(async () => {
                  await api.del(`/api/pintura/aeronaves/${a.id}/livery`); setArquivo(null); recarregar()
                })}>Remover imagem</Botao>}
              </div>
            )}
          </>
        )}
      </div>
      <div>
        {!dados.editar ? (
          <><div className="ativ-secao">Observações</div><div className="ativ-desc">{a.observacoes || '—'}</div></>
        ) : (
          <>
            <DataCampo rotulo="Início da pintura" valor={inicio} mudar={setInicio} />
            <DataCampo rotulo="Fim da pintura" valor={fim} mudar={setFim} />
            <DataCampo rotulo="Vencimento da pintura" valor={vencimento} mudar={setVencimento} />
            <AreaTexto rotulo="Observações" valor={obs} mudar={setObs} altura={90} placeholder="Hangar, fornecedor de tinta, pendências..." />
            <Erro erro={erro} />
            <Botao tipo="primario" cheio ocupado={ocupado} onClick={() => {
              if (inicio && fim && fim < inicio) return setErro('O fim da pintura está antes do início.')
              if (fim && vencimento && vencimento <= fim) return setErro('O vencimento precisa ser depois do fim da pintura.')
              rodar(async () => { await api.put(`/api/pintura/aeronaves/${a.id}/datas`, { data_inicio: inicio, data_fim: fim, data_vencimento: vencimento, observacoes: obs }); recarregar() })
            }}>Salvar datas</Botao>
            <div className="caption" style={{ marginTop: '.4rem' }}>Com a data de fim preenchida, o prefixo passa para Finalizados a partir desse dia.</div>
            <Expansor titulo="Mais opções">
              <Texto rotulo="Corrigir o prefixo" valor={prefixo} mudar={setPrefixo} />
              <Botao ocupado={ocupado} onClick={() => {
                if (!prefixo.trim()) return setErro('Digite o prefixo.')
                rodar(async () => { await api.put(`/api/pintura/aeronaves/${a.id}/prefixo`, { prefixo }); recarregar() })
              }}>Salvar prefixo</Botao>
              {dados.excluir && (
                <>
                  <hr />
                  <Marcar rotulo="Quero excluir este prefixo" valor={confirmar} mudar={setConfirmar} />
                  {confirmar && <Botao ocupado={ocupado} onClick={() => rodar(async () => { await api.del(`/api/pintura/aeronaves/${a.id}`); saiu(); recarregar() })}>Excluir prefixo</Botao>}
                </>
              )}
            </Expansor>
          </>
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------- //
type Planejamento = { tabela: Record<string, any>[]; tarefas: any[]; editar: boolean; tem_base: boolean; curva: any[]; gantt_html: string; gantt_altura: number }
const COLUNAS_TAREFAS = [
  { chave: 'fase', titulo: 'Fase', ajuda: 'ex.: 5. Selagem', largura: '16%' },
  { chave: 'tarefa', titulo: 'Tarefa', largura: '30%' },
  { chave: 'inicio', titulo: 'Início', tipo: 'data' as const },
  { chave: 'fim', titulo: 'Fim', tipo: 'data' as const },
  { chave: 'fim_real', titulo: 'Concluída em', tipo: 'data' as const },
  { chave: 'base_inicio', titulo: 'Base: início', tipo: 'data' as const, desabilitada: true },
  { chave: 'base_fim', titulo: 'Base: fim', tipo: 'data' as const, desabilitada: true },
]

function AbaPlanejamento({ aeronave: a, versao, recarregar }: PropsAba) {
  const [base, setBase] = useState(false)
  const [escala, setEscala] = useState<'Dias' | 'Semanas'>('Dias')
  const { dados: p } = useDados(() => api.get<Planejamento>(`/api/pintura/aeronaves/${a.id}/planejamento?mostrar_base=${base}&escala=${escala}`), [a.id, base, escala, versao])
  const [linhas, setLinhas] = useState<Record<string, any>[]>([])
  useEffect(() => { if (p) setLinhas(p.tabela.map((l) => ({ ...l }))) }, [p?.tabela])
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<{ resumo: string; tarefas: number } | null>(null)
  const { ocupado, erro, setErro, rodar } = useAcao()
  const toast = useToast()
  useEffect(() => {
    setPrevia(null); setErro(null)
    if (arquivo) rodar(async () => setPrevia(await api.post(`/api/pintura/aeronaves/${a.id}/tarefas/importar`, enviarArquivo('arquivo', arquivo))))
  }, [arquivo])
  if (!p) return <Carregando />
  const tem = p.tarefas.length > 0
  return (
    <>
      {tem ? (
        <>
          <div className="plan-caixa"><Blocos blocos={p.curva} /></div>
          <div className="plan-secao">Planejamento</div>
          <div className="plan-caixa">
            <div className="grade" style={{ gridTemplateColumns: '3fr 1.1fr 1.3fr', alignItems: 'center' }}>
              <div className="plan-titulo">Gantt</div>
              <Chave rotulo="Linha de base" valor={base} mudar={setBase} disabled={!p.tem_base} />
              <div className="segmentado">{(['Dias', 'Semanas'] as const).map((z) => <button key={z} type="button" className={z === escala ? 'ativo' : ''} onClick={() => setEscala(z)}>{z}</button>)}</div>
            </div>
            <iframe title="Gantt" srcDoc={p.gantt_html} style={{ height: p.gantt_altura }} />
          </div>
        </>
      ) : (
        <div className="ativ-vazio">Nenhuma tarefa planejada ainda.{p.editar && <><br />Cadastre as tarefas abaixo (ou importe uma planilha) para ver o Gantt e a curva S.</>}</div>
      )}
      {p.editar && (
        <>
          <div className="plan-secao">Tarefas</div>
          <div className="caption">Preencha a data em "Concluída em" quando a tarefa terminar: é ela que conta no executado da curva S. Use a última linha da tabela para incluir uma tarefa.</div>
          <EditorTabela linhas={linhas} colunas={COLUNAS_TAREFAS} mudar={setLinhas} altura={520} />
          <Erro erro={erro} />
          <div style={{ display: 'flex', gap: '.6rem', margin: '.6rem 0' }}>
            <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => {
              const r = await api.put(`/api/pintura/aeronaves/${a.id}/tarefas`, { linhas })
              toast(r.mensagem, 'success'); recarregar()
            })}>Salvar tarefas</Botao>
            <Popover rotulo="Salvar linha de base" disabled={!tem}>{(fechar) => (
              <>
                <Markdown texto={'A linha de base guarda as datas de início e fim **atuais** de todas as tarefas. É contra ela que a curva S mede o planejado.' + (p.tem_base ? ' A linha de base anterior será substituída.' : '')} />
                <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => { await api.post(`/api/pintura/aeronaves/${a.id}/linha-base`); fechar(); recarregar() })}>Salvar linha de base agora</Botao>
              </>
            )}</Popover>
          </div>
          <Expansor titulo="Importar planilha (Excel ou CSV)">
            <div className="caption">
              Aceita o Gantt exportado do monday do jeito que ele sai (cada grupo vira uma fase; Início, Fim, Baseline e Status vêm junto,
              e as tarefas Concluídas entram com a Data Exec). Também aceita uma planilha simples com as colunas Fase, Tarefa, Início, Fim e,
              se tiver, Concluída em (datas em dd/mm/aaaa). A importação substitui as tarefas deste prefixo.
            </div>
            <Botao pequeno icone="download" onClick={() => rodar(() => baixar('/api/pintura/modelo-planilha', 'modelo_planejamento_pintura.csv'))}>Baixar modelo de planilha</Botao>
            <EnvioArquivo aceitar=".xlsx,.xls,.csv" arquivo={arquivo} mudar={setArquivo} />
            {previa && arquivo && (
              <>
                <Markdown texto={previa.resumo} />
                <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => {
                  await api.post(`/api/pintura/aeronaves/${a.id}/tarefas/importar?confirmar=true`, enviarArquivo('arquivo', arquivo))
                  toast(`Planejamento importado (${previa.tarefas} tarefas).`, 'success'); setArquivo(null); recarregar()
                })}>{tem ? `Importar e substituir as ${p.tarefas.length} tarefas atuais` : 'Importar'}</Botao>
              </>
            )}
          </Expansor>
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- //
type Vista = { imagem: string | null; largura: number; altura: number; areas: any[]; notas: any[]; atualizado_em: string | null }
type Legenda = { id: number; nome: string; cor: string }
type DadosVistas = { vistas: Record<string, Vista>; legendas: Legenda[]; uso_legendas: Record<string, number>; copiar_de: { id: number; prefixo: string }[]; editar: boolean; nomes: Record<string, string> }

function AbaVistas({ aeronave: a, modelo, versao, recarregar }: PropsAba) {
  const [local, setLocal] = useState(0)
  const { dados: v } = useDados(() => api.get<DadosVistas>(`/api/pintura/aeronaves/${a.id}/vistas`), [a.id, versao, local])
  const [escolha, setEscolha] = useState('lateral')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [origem, setOrigem] = useState<number | null>(null)
  const [apagar, setApagar] = useState(false)
  const { ocupado, erro, rodar } = useAcao()
  const toast = useToast()
  if (!v) return <Carregando />
  const atualizar = () => { setLocal((x) => x + 1); recarregar() }
  const vista = v.vistas[escolha]
  const nomeVista = v.nomes[escolha].toLowerCase()
  return (
    <>
      <div className="segmentado" style={{ margin: '.8rem 0' }}>
        {Object.keys(v.nomes).map((k) => (
          <button key={k} type="button" className={k === escolha ? 'ativo' : ''} onClick={() => { setEscolha(k); setArquivo(null); setApagar(false) }}>
            {v.nomes[k]}{v.vistas[k] ? '' : ' (sem imagem)'}
          </button>
        ))}
      </div>
      {vista?.imagem ? (
        <>
          {!vista.areas.length && !vista.notas.length && !v.editar && <div className="caption">Nenhuma área marcada nesta vista.</div>}
          <Desenho key={`${a.id}-${escolha}`} vista={vista} legendas={v.legendas} editar={v.editar}
            salvar={async (valor) => {
              const r = await api.put(`/api/pintura/aeronaves/${a.id}/vistas/${escolha}/areas`, valor)
              toast(r.mensagem, 'success'); atualizar()
            }} />
        </>
      ) : (
        <div className="pint-livery-grande"><div className="pint-livery-vazia"><span dangerouslySetInnerHTML={{ __html: ICONE_AVIAO }} />
          Nenhuma imagem da vista {nomeVista} ainda.{v.editar && <><br />Envie a imagem abaixo para começar a marcar as áreas.</>}</div></div>
      )}
      {v.editar && (
        <>
          <EnvioArquivo rotulo={`${vista ? 'Trocar' : 'Enviar'} a imagem da vista ${nomeVista}`} aceitar={IMAGENS} arquivo={arquivo} mudar={setArquivo}
            ajuda="Desenho ou foto da aeronave vista de cima, de lado ou de frente." />
          {arquivo && (
            <>
              {vista && vista.areas.length > 0 && <div className="caption">As áreas já desenhadas continuam no mesmo lugar da imagem. Use uma imagem com o mesmo enquadramento ou redesenhe as áreas.</div>}
              <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => {
                await api.put(`/api/pintura/aeronaves/${a.id}/vistas/${escolha}/imagem`, enviarArquivo('imagem', arquivo)); setArquivo(null); atualizar()
              })}>Salvar imagem</Botao>
            </>
          )}
          <Erro erro={erro} />
          <div className="grade g2" style={{ marginTop: '.8rem' }}>
            <Expansor titulo="Legendas"><Legendas legendas={v.legendas} uso={v.uso_legendas} atualizar={atualizar} /></Expansor>
            <Expansor titulo="Copiar de outro prefixo">
              {!v.copiar_de.length ? <div className="caption">Nenhum outro prefixo de {modelo.nome} tem vistas cadastradas.</div> : (
                <>
                  <div className="caption">Copia as três vistas, com as áreas e as notas, e substitui as deste prefixo.</div>
                  <Selecao rotulo="Copiar de" opcoes={v.copiar_de.map((o) => o.id)} valor={origem ?? v.copiar_de[0].id} mudar={setOrigem}
                    rotulos={(id) => v.copiar_de.find((o) => o.id === id)?.prefixo || String(id)} />
                  <Botao ocupado={ocupado} onClick={() => rodar(async () => {
                    await api.post(`/api/pintura/aeronaves/${a.id}/vistas/copiar`, { origem_id: origem ?? v.copiar_de[0].id }); atualizar()
                  })}>Copiar vistas</Botao>
                </>
              )}
              {vista && (
                <>
                  <hr />
                  <Marcar rotulo={`Quero apagar a vista ${nomeVista}`} valor={apagar} mudar={setApagar} />
                  {apagar && <Botao ocupado={ocupado} onClick={() => rodar(async () => {
                    await api.del(`/api/pintura/aeronaves/${a.id}/vistas/${escolha}`); setApagar(false); atualizar()
                  })}>Apagar vista</Botao>}
                </>
              )}
            </Expansor>
          </div>
        </>
      )}
    </>
  )
}

// Hospeda o componente de desenho do app.py (mesmo HTML), falando o protocolo do Streamlit.
function Desenho({ vista, legendas, editar, salvar }: {
  vista: Vista; legendas: Legenda[]; editar: boolean; salvar: (valor: { areas: any[]; notas: any[]; legendas_novas: any[] }) => Promise<void>
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState(500)
  const feitos = useRef(new Set<string>())
  const args = { imagem: vista.imagem, largura: vista.largura, altura: vista.altura, areas: vista.areas, notas: vista.notas, legendas, editar, versao: `${vista.atualizado_em}|${legendas.length}` }
  const argsRef = useRef(args)
  argsRef.current = args
  const enviar = () => ref.current?.contentWindow?.postMessage({ type: 'streamlit:render', args: argsRef.current }, '*')
  const salvarRef = useRef(salvar)
  salvarRef.current = salvar
  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      if (ev.source !== ref.current?.contentWindow || !ev.data?.isStreamlitMessage) return
      const d = ev.data
      if (d.type === 'streamlit:componentReady') enviar()
      else if (d.type === 'streamlit:setFrameHeight') setAltura(d.height)
      else if (d.type === 'streamlit:setComponentValue' && editar) {
        const valor = d.value || {}
        if (feitos.current.has(valor.pedido)) return
        feitos.current.add(valor.pedido)
        salvarRef.current({ areas: valor.areas || [], notas: valor.notas || [], legendas_novas: valor.legendas_novas || [] })
          .catch(() => { feitos.current.delete(valor.pedido); enviar() })
      }
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [editar])
  useEffect(() => { enviar() }, [args.versao, args.imagem, editar])
  return <iframe ref={ref} className="pint-desenho" title="Vista" src="/componentes/areas_aeronave/index.html" style={{ height: altura }} />
}

function Legendas({ legendas, uso, atualizar }: { legendas: Legenda[]; uso: Record<string, number>; atualizar: () => void }) {
  const [editadas, setEditadas] = useState<Record<number, Legenda>>({})
  useEffect(() => setEditadas(Object.fromEntries(legendas.map((l) => [l.id, { ...l }]))), [legendas])
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('#12B76A')
  const { ocupado, erro, rodar } = useAcao()
  return (
    <>
      <div className="caption">As legendas valem para todas as aeronaves. Também dá para criar uma direto no desenho.</div>
      {legendas.map((l) => {
        const e = editadas[l.id] || l
        const usos = uso[String(l.id)] || 0
        return (
          <div key={l.id} className="grade fim" style={{ gridTemplateColumns: '3fr 1fr 1.2fr 1.2fr', marginBottom: '.3rem' }}>
            <Texto valor={e.nome} mudar={(v) => setEditadas((x) => ({ ...x, [l.id]: { ...e, nome: v } }))} />
            <input type="color" className="entrada" value={e.cor} onChange={(ev) => setEditadas((x) => ({ ...x, [l.id]: { ...e, cor: ev.target.value } }))} style={{ padding: 2, height: '2.5rem' }} />
            <Botao cheio ocupado={ocupado} onClick={() => rodar(async () => { await api.put(`/api/pintura/legendas/${l.id}`, { nome: e.nome, cor: e.cor }); atualizar() })}>Salvar</Botao>
            <Botao cheio disabled={usos > 0} titulo={usos ? `Usada em ${plural(usos, 'área', 'áreas')}; apague as áreas antes.` : undefined}
              onClick={() => rodar(async () => { await api.del(`/api/pintura/legendas/${l.id}`); atualizar() })}>Excluir</Botao>
          </div>
        )
      })}
      <div className="grade fim" style={{ gridTemplateColumns: '3fr 1fr 2.4fr' }}>
        <Texto rotulo="Nova legenda" valor={nome} mudar={setNome} placeholder="ex.: Fibra de vidro" />
        <div className="campo"><label>Cor</label><input type="color" className="entrada" value={cor} onChange={(e) => setCor(e.target.value)} style={{ padding: 2, height: '2.5rem' }} /></div>
        <div className="campo"><Botao cheio ocupado={ocupado} onClick={() => rodar(async () => { await api.post('/api/pintura/legendas', { nome, cor }); setNome(''); atualizar() })}>Adicionar</Botao></div>
      </div>
      <Erro erro={erro} />
    </>
  )
}

// --------------------------------------------------------------------------- //
type Nota = { id: number; texto: string; quem: string; quando: string; editada: boolean }

function AbaObservacoes({ aeronave: a, versao, recarregar }: PropsAba) {
  const { dados: d } = useDados(() => api.get<{ observacoes: Nota[]; editar: boolean }>(`/api/pintura/aeronaves/${a.id}/observacoes`), [a.id, versao])
  const [editando, setEditando] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [nova, setNova] = useState('')
  const { ocupado, erro, setErro, rodar } = useAcao()
  if (!d) return <Carregando />
  return (
    <div style={{ marginTop: '.8rem' }}>
      {!d.observacoes.length && <div className="ativ-vazio">Nenhuma observação técnica ainda.{d.editar && <><br />Escreva abaixo, ex.: "Lixa permitida para lixar composto: 320".</>}</div>}
      {d.observacoes.map((n, i) => (
        <div key={n.id} className="pint-nota-caixa">
          {d.editar && editando === n.id ? (
            <div style={{ flex: 1 }}>
              <AreaTexto valor={texto} mudar={setTexto} altura={90} />
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <Botao tipo="primario" ocupado={ocupado} onClick={() => {
                  if (!texto.trim()) return setErro('A observação está vazia.')
                  rodar(async () => { await api.put(`/api/pintura/aeronaves/${a.id}/observacoes/${n.id}`, { texto }); setEditando(null); recarregar() })
                }}>Salvar</Botao>
                <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
              </div>
            </div>
          ) : (
            <>
              <div className="pint-nota"><span className="num">{i + 1}</span><div>
                <div className="txt" style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</div>
                <div className="meta">{n.quem} · {n.quando}{n.editada ? ' (editada)' : ''}</div>
              </div></div>
              {d.editar && (
                <>
                  <button className="pint-icone-btn" title="Editar" onClick={() => { setEditando(n.id); setTexto(n.texto) }}>✎</button>
                  <button className="pint-icone-btn" title="Excluir" onClick={() => rodar(async () => { await api.del(`/api/pintura/aeronaves/${a.id}/observacoes/${n.id}`); recarregar() })}>🗑</button>
                </>
              )}
            </>
          )}
        </div>
      ))}
      <Erro erro={erro} />
      {d.editar && (
        <>
          <AreaTexto rotulo="Nova observação técnica" valor={nova} mudar={setNova} altura={90} placeholder="ex.: Lixa permitida para lixar composto: 320" />
          <Botao tipo="primario" ocupado={ocupado} onClick={() => {
            if (!nova.trim()) return setErro('Escreva a observação.')
            rodar(async () => { await api.post(`/api/pintura/aeronaves/${a.id}/observacoes`, { texto: nova }); setNova(''); recarregar() })
          }}>Adicionar observação</Botao>
        </>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------- //
type Ata = { id: number; titulo: string; data: string; participantes: string[]; discutido: string; discutido_html: string; quem: string; quando: string; editada: boolean }
const semAcento = (t: string) => (t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

function AbaAtas({ aeronave: a, versao, recarregar }: PropsAba) {
  const { dados: d } = useDados(() => api.get<{ atas: Ata[]; editar: boolean; pessoas: string[] }>(`/api/pintura/aeronaves/${a.id}/atas`), [a.id, versao])
  const [busca, setBusca] = useState('')
  const [dialogo, setDialogo] = useState<{ ata?: Ata } | null>(null)
  const { ocupado, erro, rodar } = useAcao()
  if (!d) return <Carregando />
  const termo = semAcento(busca).trim()
  const atas = termo ? d.atas.filter((x) => semAcento([x.titulo, x.discutido, ...x.participantes].join(' ')).includes(termo)) : d.atas
  return (
    <div style={{ marginTop: '.8rem' }}>
      <div className="ativ-topo" style={{ alignItems: 'center' }}>
        <div className="ativ-resumo"><b>{d.atas.length}</b> ata{d.atas.length !== 1 ? 's' : ''} de reunião</div>
        {d.editar && <Botao tipo="primario" onClick={() => setDialogo({})}>+ Nova ata</Botao>}
      </div>
      {!d.atas.length ? (
        <div className="ativ-vazio">Nenhuma ata de reunião ainda.{d.editar && <><br />Use o botão <b>Nova ata</b> para registrar a reunião, a data, os participantes e o que foi discutido.</>}</div>
      ) : (
        <>
          {d.atas.length > 4 && <Texto valor={busca} mudar={setBusca} placeholder="Buscar por reunião, participante ou assunto" />}
          {termo && !atas.length && <div className="caption">Nenhuma ata encontrada.</div>}
          <Erro erro={erro} />
          {atas.map((ata, i) => (
            <Expansor key={ata.id} titulo={`${dataBr(ata.data)} · ${ata.titulo}`} aberto={i === 0}>
              <div className="time-rot">Participantes ({ata.participantes.length})</div>
              <div className="time-chips">{ata.participantes.length ? ata.participantes.map((p) => <span key={p} className="time-chip">{p}</span>) : <span className="time-nada">Sem participantes informados</span>}</div>
              <div className="time-rot">O que foi discutido</div>
              <Html className="pint-ata" html={ata.discutido_html} />
              <div className="pint-nota"><div className="meta">Registrada por {ata.quem} · {ata.quando}{ata.editada ? ' (editada)' : ''}</div></div>
              {d.editar && (
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                  <Botao onClick={() => setDialogo({ ata })}>Editar</Botao>
                  <Popover rotulo="Excluir">{(fechar) => (
                    <>
                      <p>Excluir esta ata de reunião?</p>
                      <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => { await api.del(`/api/pintura/aeronaves/${a.id}/atas/${ata.id}`); fechar(); recarregar() })}>Excluir ata</Botao>
                    </>
                  )}</Popover>
                </div>
              )}
            </Expansor>
          ))}
        </>
      )}
      {dialogo && <DialogoAta aeronaveId={a.id} pessoas={d.pessoas} ata={dialogo.ata} fechar={() => setDialogo(null)} pronto={() => { setDialogo(null); recarregar() }} />}
    </div>
  )
}

function DialogoAta({ aeronaveId, pessoas, ata, fechar, pronto }: { aeronaveId: number; pessoas: string[]; ata?: Ata; fechar: () => void; pronto: () => void }) {
  const hoje = new Date().toLocaleDateString('sv-SE')
  const [titulo, setTitulo] = useState(ata?.titulo || '')
  const [data, setData] = useState<string | null>(ata?.data?.slice(0, 10) || hoje)
  const [participantes, setParticipantes] = useState<string[]>((ata?.participantes || []).filter((p) => pessoas.includes(p)))
  const [outros, setOutros] = useState((ata?.participantes || []).filter((p) => !pessoas.includes(p)).join(', '))
  const [discutido, setDiscutido] = useState(ata?.discutido || '')
  const { ocupado, erro, setErro, rodar } = useAcao()
  return (
    <Dialogo titulo={ata ? 'Editar ata de reunião' : 'Nova ata de reunião'} aberto fechar={fechar} largo>
      <div className="grade" style={{ gridTemplateColumns: '2.4fr 1fr' }}>
        <Texto rotulo="Reunião" valor={titulo} mudar={setTitulo} placeholder="ex.: Kick-off da pintura com o hangar" autoFocus />
        <DataCampo rotulo="Data" valor={data} mudar={setData} />
      </div>
      <MultiSelecao rotulo="Participantes" opcoes={pessoas} valor={participantes} mudar={setParticipantes} placeholder="Escolha as pessoas do site" />
      <Texto rotulo="Outros participantes (opcional)" valor={outros} mudar={setOutros} placeholder="Nomes separados por vírgula, ex.: João (hangar), Maria (fornecedor de tinta)" />
      <AreaTexto rotulo="O que foi discutido" valor={discutido} mudar={setDiscutido} altura={220} placeholder="Assuntos, decisões e próximos passos. Cada linha que começar com - vira um item da lista." />
      <Erro erro={erro} />
      <Botao tipo="primario" cheio ocupado={ocupado} onClick={() => {
        if (!titulo.trim()) return setErro('Dê um nome à reunião.')
        if (!discutido.trim()) return setErro('Escreva o que foi discutido.')
        const corpo = { titulo, data, participantes, outros, discutido }
        rodar(async () => {
          if (ata) await api.put(`/api/pintura/aeronaves/${aeronaveId}/atas/${ata.id}`, corpo)
          else await api.post(`/api/pintura/aeronaves/${aeronaveId}/atas`, corpo)
          pronto()
        })
      }}>{ata ? 'Salvar ata' : 'Adicionar ata'}</Botao>
    </Dialogo>
  )
}

// --------------------------------------------------------------------------- //
const COLUNAS_MATERIAL = [
  { chave: 'material', titulo: 'Material', largura: '30%' },
  { chave: 'part_number', titulo: 'Part number' },
  { chave: 'quantidade', titulo: 'Qtd.', tipo: 'numero' as const, largura: 90 },
  { chave: 'unidade', titulo: 'Unidade', ajuda: 'ex.: L, gal, kg, un', largura: 100 },
  { chave: 'observacao', titulo: 'Observação', largura: '28%' },
]

function AbaMaterial({ aeronave: a, versao, recarregar }: PropsAba) {
  const { dados: d } = useDados(() => api.get<{ linhas: Record<string, any>[]; editar: boolean }>(`/api/pintura/aeronaves/${a.id}/material`), [a.id, versao])
  const [linhas, setLinhas] = useState<Record<string, any>[]>([])
  useEffect(() => { if (d) setLinhas(d.linhas.map((l) => ({ ...l }))) }, [d])
  const { ocupado, erro, rodar } = useAcao()
  const toast = useToast()
  if (!d) return <Carregando />
  const csv = d.linhas.length > 0 && (
    <Botao icone="download" onClick={() => rodar(() => baixar(`/api/pintura/aeronaves/${a.id}/material.csv`, `${a.prefixo}_material_pintura.csv`))}>Baixar CSV</Botao>
  )
  if (!d.editar) {
    if (!d.linhas.length) return <div className="ativ-vazio">Nenhum material cadastrado.</div>
    return (
      <div style={{ marginTop: '.8rem' }}>
        <Tabela linhas={d.linhas} colunas={COLUNAS_MATERIAL.map((c) => ({ chave: c.chave, titulo: c.titulo, numero: c.tipo === 'numero' }))} />
        <div style={{ marginTop: '.6rem' }}>{csv}</div>
      </div>
    )
  }
  return (
    <div style={{ marginTop: '.8rem' }}>
      <div className="caption">Clique numa célula para editar. Use a última linha para incluir um material.</div>
      <EditorTabela linhas={linhas} colunas={COLUNAS_MATERIAL} mudar={setLinhas} altura={520} />
      <Erro erro={erro} />
      <div style={{ display: 'flex', gap: '.6rem', marginTop: '.6rem' }}>
        <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => {
          const r = await api.put(`/api/pintura/aeronaves/${a.id}/material`, { linhas }); toast(r.mensagem, 'success'); recarregar()
        })}>Salvar lista</Botao>
        {csv}
      </div>
    </div>
  )
}

