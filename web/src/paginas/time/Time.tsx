// Time: quem é focal e quem é backup de cada frente (tela_time do app.py).
import { useEffect, useMemo, useState } from 'react'
import { api, baixar, enviarArquivo } from '../../api'
import {
  Abas, Aviso, Botao, Busca, Carregando, Erro, EnvioArquivo, Expansor, Legenda, MultiSelecao, Selecao, Texto,
  useAba, useAcao, useDados,
} from '../../componentes/ui'

type Linha = { grupo: string; frente: string; descricao: string; pessoa: string; papel: string }
type Dados = { linhas: Linha[]; eu: string | null; configurar: boolean; papeis: string[] }

const semAcento = (t: string) => (t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ordenar = (lista: string[]) => [...new Set(lista.filter(Boolean))].sort((a, b) => semAcento(a).localeCompare(semAcento(b)))
const unicos = <T,>(lista: T[]) => [...new Set(lista)]
const iniciais = (nome: string) => (nome.split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('') || '?').toUpperCase()

export default function Time() {
  const [versao, setVersao] = useState(0)
  const { dados, erro } = useDados(() => api.get<Dados>('/api/time'), [versao])
  const abas = ['Por pessoa', 'Por frente', ...(dados?.configurar ? ['Configurar'] : [])]
  const [aba, setAba] = useAba('time', abas)
  const [ok, setOk] = useState<string | null>(null)
  if (!dados) return erro ? <Erro erro={erro} /> : <Carregando />
  const pessoas = unicos(dados.linhas.map((l) => l.pessoa))
  const frentes = unicos(dados.linhas.map((l) => l.frente))
  const recarregar = (m?: string) => { if (m) setOk(m); setVersao((v) => v + 1) }
  return (
    <>
      <div className="time-topo">
        <div className="ativ-titulo">Time</div>
        <p className="ativ-desc">Engenharia de Estruturas: quem é focal e quem é backup de cada frente.</p>
        <div className="ativ-resumo">
          {pessoas.length ? <><b>{pessoas.length}</b> pessoas · <b>{frentes.length}</b> frentes</> : 'Nenhuma função cadastrada ainda'}
        </div>
      </div>
      <Abas abas={abas} ativa={aba} mudar={setAba} />
      {aba !== 'Configurar' && !dados.linhas.length && (
        <div className="ativ-vazio">As funções do time ainda não foram cadastradas.{dados.configurar && <><br />Importe a planilha em Configurar.</>}</div>
      )}
      {aba === 'Por pessoa' && dados.linhas.length > 0 && <PorPessoa linhas={dados.linhas} eu={dados.eu} />}
      {aba === 'Por frente' && dados.linhas.length > 0 && <PorFrente linhas={dados.linhas} eu={dados.eu} />}
      {aba === 'Configurar' && (
        <>
          {ok && <Aviso tipo="success">{ok}</Aviso>}
          <Configurar linhas={dados.linhas} recarregar={recarregar} />
        </>
      )}
    </>
  )
}

function Chips({ frentes, focal, descricoes }: { frentes: string[]; focal?: boolean; descricoes: Record<string, string> }) {
  if (!frentes.length) return <span className="time-nada">—</span>
  return <>{frentes.map((f) => <span key={f} className={`time-chip${focal ? ' focal' : ''}`} title={descricoes[f] || ''}>{f}</span>)}</>
}

function PorPessoa({ linhas, eu }: { linhas: Linha[]; eu: string | null }) {
  const descricoes = Object.fromEntries(linhas.map((l) => [l.frente, l.descricao]))
  const todas = ordenar(linhas.map((l) => l.pessoa))
  const [filtro, setFiltro] = useState<string[]>([])
  let pessoas = filtro.length ? todas.filter((p) => filtro.includes(p)) : todas
  if (eu && pessoas.includes(eu)) pessoas = [eu, ...pessoas.filter((p) => p !== eu)]
  return (
    <>
      <div className="pilulas" style={{ margin: '.6rem 0 0' }}>
        {todas.map((p) => (
          <button key={p} type="button" className={`pilula${filtro.includes(p) ? ' ativa' : ''}`}
            onClick={() => setFiltro((f) => f.includes(p) ? f.filter((x) => x !== p) : [...f, p])}>{p}</button>
        ))}
      </div>
      <div className="time-grade">
        {pessoas.map((pessoa) => {
          const dela = linhas.filter((l) => l.pessoa === pessoa)
          const focal = unicos(dela.filter((l) => l.papel === 'Focal').map((l) => l.frente))
          const backup = unicos(dela.filter((l) => l.papel === 'Backup').map((l) => l.frente))
          const voce = pessoa === eu
          return (
            <div key={pessoa} className={`time-cartao${voce ? ' voce' : ''}`}>
              <div className="time-cab">
                <div className="ativ-avatar grande">{iniciais(pessoa)}</div>
                <div>
                  <div className="time-nome">{pessoa}{voce && <span className="time-voce">Você</span>}</div>
                  <div className="time-sub">{focal.length} como focal · {backup.length} como backup</div>
                </div>
              </div>
              <div className="time-rot">Focal</div><div className="time-chips"><Chips frentes={focal} focal descricoes={descricoes} /></div>
              <div className="time-rot">Backup</div><div className="time-chips"><Chips frentes={backup} descricoes={descricoes} /></div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function Nomes({ nomes, eu }: { nomes: string[]; eu: string | null }) {
  if (!nomes.length) return <span className="time-nada">—</span>
  return <>{nomes.map((n, i) => <span key={n}>{i > 0 && ', '}{n === eu ? <span className="eu">{n}</span> : n}</span>)}</>
}

function PorFrente({ linhas, eu }: { linhas: Linha[]; eu: string | null }) {
  const [busca, setBusca] = useState('')
  const termo = semAcento(busca).trim()
  const grupos = new Map<string, { frente: string; dela: Linha[] }[]>()
  for (const frente of unicos(linhas.map((l) => l.frente))) {
    const dela = linhas.filter((l) => l.frente === frente)
    const texto = semAcento([frente, dela[0].descricao, ...dela.map((l) => l.pessoa)].join(' '))
    if (termo && !texto.includes(termo)) continue
    const g = dela[0].grupo || 'Outras frentes'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g)!.push({ frente, dela })
  }
  return (
    <>
      <div style={{ marginTop: '.6rem' }}><Texto valor={busca} mudar={setBusca} placeholder="Buscar frente, assunto ou pessoa" /></div>
      {!grupos.size ? <div className="ativ-vazio">Nenhuma frente encontrada.</div> : [...grupos.entries()].map(([grupo, itens]) => (
        <div key={grupo}>
          <div className="time-grupo">{grupo}<span className="contagem">{itens.length}</span></div>
          <div className="time-grade">
            {itens.map(({ frente, dela }) => {
              const focal = dela.filter((l) => l.papel === 'Focal').map((l) => l.pessoa)
              const backup = dela.filter((l) => l.papel === 'Backup').map((l) => l.pessoa)
              const descricao = dela[0].descricao
              return (
                <div key={frente} className={`time-cartao${eu && [...focal, ...backup].includes(eu) ? ' voce' : ''}`}>
                  <div className="time-frente">{frente}</div>
                  {descricao && <div className="time-desc">{descricao}</div>}
                  <div className="time-linha"><div className="time-rot">Focal</div><div className="time-pessoas"><Nomes nomes={focal} eu={eu} /></div></div>
                  <div className="time-linha"><div className="time-rot">Backup</div><div className="time-pessoas"><Nomes nomes={backup} eu={eu} /></div></div>
                  {!focal.length ? <div className="time-alerta">Sem focal definido</div>
                    : !backup.length ? <div className="time-alerta">Sem backup definido</div> : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

// --------------------------------------------------------------------------- //
const NOVA_FRENTE = '+ Nova frente'
const MODOS = ['Editar uma frente', 'Editar uma pessoa'] as const

function Configurar({ linhas, recarregar }: { linhas: Linha[]; recarregar: (m?: string) => void }) {
  const [modo, setModo] = useState<(typeof MODOS)[number]>(MODOS[0])
  return (
    <>
      <div className="segmentado" style={{ margin: '.6rem 0 .4rem' }}>
        {MODOS.map((m) => <button key={m} type="button" className={m === modo ? 'ativo' : ''} onClick={() => setModo(m)}>{m}</button>)}
      </div>
      <Legenda>{modo === MODOS[0] ? 'Escolha a frente e marque o focal e os backups.'
        : 'Escolha a pessoa e marque as frentes em que ela é focal e em que é backup.'}</Legenda>
      {modo === MODOS[0] ? <PorFrenteEditar linhas={linhas} recarregar={recarregar} /> : <PorPessoaEditar linhas={linhas} recarregar={recarregar} />}
      <ImportarTime recarregar={recarregar} />
    </>
  )
}

function PorFrenteEditar({ linhas, recarregar }: { linhas: Linha[]; recarregar: (m?: string) => void }) {
  const frentes = unicos(linhas.map((l) => l.frente))
  const pessoas = ordenar(linhas.map((l) => l.pessoa))
  const gruposExistentes = unicos(linhas.map((l) => l.grupo).filter(Boolean))
  const grupos = gruposExistentes.length ? gruposExistentes : ['Projetos by owners']
  const [escolha, setEscolha] = useState(frentes[0] || NOVA_FRENTE)
  const nova = escolha === NOVA_FRENTE || !frentes.includes(escolha)
  const dela = linhas.filter((l) => l.frente === escolha)
  const [nome, setNome] = useState('')
  const [grupo, setGrupo] = useState<string | null>(null)
  const [descricao, setDescricao] = useState('')
  const [focais, setFocais] = useState<string[]>([])
  const [backups, setBackups] = useState<string[]>([])
  useEffect(() => {
    setNome(nova ? '' : escolha)
    setGrupo(nova ? grupos[grupos.length - 1] : (dela[0]?.grupo || grupos[grupos.length - 1]))
    setDescricao(nova ? '' : dela[0]?.descricao || '')
    setFocais(nova ? [] : dela.filter((l) => l.papel === 'Focal').map((l) => l.pessoa))
    setBackups(nova ? [] : dela.filter((l) => l.papel === 'Backup').map((l) => l.pessoa))
  }, [escolha, linhas])
  const repetidos = focais.filter((p) => backups.includes(p))
  const { ocupado, erro, setErro, rodar } = useAcao()
  const nomeLimpo = nome.replace(/\s+/g, ' ').trim()
  return (
    <>
      <Selecao rotulo="Frente" opcoes={[NOVA_FRENTE, ...frentes]} valor={nova ? NOVA_FRENTE : escolha} mudar={setEscolha} />
      <div className="vidro" style={{ marginBottom: '1rem' }}>
        <div className="grade" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
          <Texto rotulo="Nome da frente" valor={nome} mudar={setNome} />
          <Busca rotulo="Grupo" valor={grupo} opcoes={ordenar([...grupos, grupo || ''])} mudar={setGrupo} permitirNovo />
        </div>
        <Texto rotulo="O que a frente faz" valor={descricao} mudar={setDescricao} />
        <MultiSelecao rotulo="Focal" opcoes={pessoas} valor={focais} mudar={setFocais} permitirNovo
          placeholder="Escolha a pessoa (ou digite um nome novo)" />
        <MultiSelecao rotulo="Backups (na ordem: 1º backup, 2º backup…)" opcoes={pessoas} valor={backups} mudar={setBackups} permitirNovo
          placeholder="Escolha as pessoas (ou digite um nome novo)" />
        {repetidos.length > 0 && <Aviso tipo="warning">{repetidos.join(', ')} está como focal e backup ao mesmo tempo.</Aviso>}
        <Erro erro={erro} />
        <div style={{ display: 'flex', gap: '.6rem' }}>
          <Botao tipo="primario" disabled={repetidos.length > 0} ocupado={ocupado} onClick={() => {
            if (!nomeLimpo) return setErro('Dê um nome para a frente.')
            if (!focais.length && !backups.length) return setErro('Escolha pelo menos uma pessoa.')
            if (nomeLimpo !== escolha && frentes.includes(nomeLimpo)) return setErro(`Já existe a frente ${nomeLimpo}.`)
            rodar(async () => {
              const r = await api.post('/api/time/frente', {
                original: nova ? null : escolha, nome: nomeLimpo, grupo: grupo || '', descricao, focais, backups,
              })
              setEscolha(nomeLimpo)
              recarregar(r.mensagem)
            })
          }}>Salvar frente</Botao>
          {!nova && (
            <Botao ocupado={ocupado} onClick={() => rodar(async () => {
              const r = await api.del(`/api/time/frente?frente=${encodeURIComponent(escolha)}`)
              setEscolha(frentes.find((f) => f !== escolha) || NOVA_FRENTE)
              recarregar(r.mensagem)
            })}>Excluir frente</Botao>
          )}
        </div>
      </div>
    </>
  )
}

function PorPessoaEditar({ linhas, recarregar }: { linhas: Linha[]; recarregar: (m?: string) => void }) {
  const frentes = unicos(linhas.map((l) => l.frente))
  const pessoas = ordenar(linhas.map((l) => l.pessoa))
  const [pessoa, setPessoa] = useState<string | null>(pessoas[0] || null)
  const [nome, setNome] = useState('')
  const [focalEm, setFocalEm] = useState<string[]>([])
  const [backupEm, setBackupEm] = useState<string[]>([])
  const p = (pessoa || '').replace(/\s+/g, ' ').trim()
  useEffect(() => {
    const dela = linhas.filter((l) => l.pessoa === p)
    setNome(p)
    setFocalEm(unicos(dela.filter((l) => l.papel === 'Focal').map((l) => l.frente)))
    setBackupEm(unicos(dela.filter((l) => l.papel === 'Backup').map((l) => l.frente)))
  }, [p, linhas])
  const repetidas = focalEm.filter((f) => backupEm.includes(f))
  const outras = useMemo(() => new Set(linhas.filter((l) => l.pessoa !== p).map((l) => l.frente)), [linhas, p])
  const vazias = frentes.filter((f) => !focalEm.includes(f) && !backupEm.includes(f) && !outras.has(f))
  const nomeLimpo = nome.replace(/\s+/g, ' ').trim()
  const { ocupado, erro, setErro, rodar } = useAcao()
  if (!frentes.length) return <Aviso tipo="info">Cadastre primeiro as frentes (em Editar uma frente ou importando a planilha).</Aviso>
  return (
    <>
      <Busca rotulo="Pessoa" valor={pessoa} opcoes={pessoas} mudar={setPessoa} permitirNovo placeholder="Escolha ou digite um nome novo" />
      {p && (
        <div className="vidro" style={{ marginBottom: '1rem' }}>
          <Texto rotulo="Nome" valor={nome} mudar={setNome} ajuda="Mude aqui para corrigir o nome em todas as frentes." />
          <MultiSelecao rotulo="É focal de" opcoes={frentes} valor={focalEm} mudar={setFocalEm} placeholder="Escolha as frentes" />
          <MultiSelecao rotulo="É backup de" opcoes={frentes} valor={backupEm} mudar={setBackupEm} placeholder="Escolha as frentes" />
          {repetidas.length > 0 && <Aviso tipo="warning">Focal e backup ao mesmo tempo em: {repetidas.join(', ')}.</Aviso>}
          {vazias.length > 0 && (
            <Aviso tipo="warning">Ficariam sem ninguém e sairiam da lista: {vazias.join(', ')}. Para manter, escolha outra pessoa nelas antes.</Aviso>
          )}
          <Erro erro={erro} />
          <Botao tipo="primario" disabled={repetidas.length > 0 || !nomeLimpo} ocupado={ocupado} onClick={() => {
            if (nomeLimpo !== p && pessoas.includes(nomeLimpo)) return setErro(`${nomeLimpo} já está no time. Escolha essa pessoa na lista.`)
            rodar(async () => {
              const r = await api.post('/api/time/pessoa', { original: p, nome: nomeLimpo, focal_em: focalEm, backup_em: backupEm })
              setPessoa(nomeLimpo)
              recarregar(r.mensagem)
            })
          }}>Salvar pessoa</Botao>
        </div>
      )}
    </>
  )
}

function ImportarTime({ recarregar }: { recarregar: (m?: string) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<{ erros: string[]; resumo: string } | null>(null)
  const { ocupado, erro, setErro, rodar } = useAcao()
  useEffect(() => {
    setPrevia(null); setErro(null)
    if (arquivo) rodar(async () => setPrevia(await api.post('/api/time/importar', enviarArquivo('arquivo', arquivo))))
  }, [arquivo])
  return (
    <Expansor titulo="Importar planilha">
      <Legenda>
        CSV ou Excel com as colunas Grupo, Frente, Descrição, Pessoa e Papel (Focal ou Backup), uma linha por pessoa em cada
        frente. A planilha substitui tudo o que está na aba Time.
      </Legenda>
      <EnvioArquivo aceitar=".csv,.xlsx,.xlsm" arquivo={arquivo} mudar={setArquivo} />
      <Erro erro={erro} />
      {previa && arquivo && (
        <>
          {previa.erros.map((e, i) => <Aviso key={i} tipo="warning">{e}</Aviso>)}
          <Legenda>{previa.resumo}</Legenda>
          <Botao tipo="primario" disabled={previa.erros.length > 0} ocupado={ocupado} onClick={() => rodar(async () => {
            const r = await api.post('/api/time/importar?confirmar=true', enviarArquivo('arquivo', arquivo))
            setArquivo(null)
            recarregar(r.mensagem)
          })}>Importar e substituir</Botao>
        </>
      )}
      <div style={{ marginTop: '.6rem' }}>
        <Botao icone="download" onClick={() => rodar(() => baixar('/api/time/planilha', 'funcoes_time.csv'))}>Baixar planilha atual</Botao>
      </div>
    </Expansor>
  )
}
