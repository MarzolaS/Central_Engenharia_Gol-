// Escala de plantão: calendário, trocas, totais, histórico e configuração (tela_plantao do app.py).
import { useEffect, useMemo, useState } from 'react'
import { api, baixar, enviarArquivo } from '../../api'
import { Grafico } from '../../componentes/Grafico'
import {
  Abas, AreaTexto, Aviso, Botao, Cabecalho, Carregando, Chave, DataCampo, Dialogo, EnvioArquivo, Erro, Expansor,
  Html, Legenda, Markdown, Metrica, Radio, Selecao, Tabela, Texto, useAba, useAcao, useDados, dataBr,
} from '../../componentes/ui'
import { BASES_CRACHA_PADRAO, BarraCalendario, PilulasMulti, PilulasPessoas, adiar, lerAdiado } from './comum'

type Mes = { ano: number; mes: number; titulo: string }
type DadosPlantao = {
  vazia: boolean; hoje: string; faixa_html: string; meses: Mes[]; nomes: { nome: string; cor: string }[]
  colaboradores: Record<string, boolean>; anos: number[]; categorias: Record<string, string>
  cores_categorias: Record<string, string>; motivos: string[]; editar: boolean; configurar: boolean
  dialogo_cracha: { pessoa: string; crachas: { base: string; validade: string; situacao: string; cor: string }[]; vencidos: string[] } | null
  bases_cracha: string[]; inicio_escala: string; fim_escala: string; categoria_por_dia: Record<string, number>
}
type Bloco = { colaborador: string; inicio: string; fim: string; datas: string[]; rotulo: string; rotulos_dias: string[] }

export default function Plantao() {
  const [versao, setVersao] = useState(0)
  const { dados, erro } = useDados(() => api.get<DadosPlantao>('/api/plantao'), [versao])
  const [ok, setOk] = useState<string | null>(null)
  const recarregar = (mensagem?: string) => { if (mensagem) setOk(mensagem); setVersao((v) => v + 1) }

  if (!dados) return <><Cabecalho titulo="Escala de plantão" />{erro ? <Erro erro={erro} /> : <Carregando />}</>
  return (
    <>
      <Cabecalho titulo="Escala de plantão" />
      {ok && <Aviso tipo="success">{ok}</Aviso>}
      {dados.vazia ? (
        <>
          <Aviso tipo="info">A escala ainda não foi carregada no site.</Aviso>
          {dados.configurar && <ImportarPlantao aoImportar={recarregar} />}
        </>
      ) : <Escala dados={dados} versao={versao} recarregar={recarregar} />}
    </>
  )
}

function Escala({ dados, versao, recarregar }: { dados: DadosPlantao; versao: number; recarregar: (m?: string) => void }) {
  const abas = ['Calendário', ...(dados.editar ? ['Trocar plantão'] : []), 'Totais', 'Histórico', ...(dados.configurar ? ['Configurar'] : [])]
  const [aba, setAba] = useAba('plantao', abas)
  const [crachaAdiado, setCrachaAdiado] = useState(() => lerAdiado('cracha_lembrete_adiado'))
  return (
    <>
      {dados.dialogo_cracha && !crachaAdiado && (
        <DialogoCracha info={dados.dialogo_cracha} bases={dados.bases_cracha}
          adiar={() => { adiar('cracha_lembrete_adiado'); setCrachaAdiado(true) }}
          salvo={() => { adiar('cracha_lembrete_adiado'); setCrachaAdiado(true); recarregar('Crachás salvos.') }} />
      )}
      <Html html={dados.faixa_html} />
      <Abas abas={abas} ativa={aba} mudar={setAba} />
      {aba === 'Calendário' && <Calendario dados={dados} versao={versao} />}
      {aba === 'Trocar plantão' && <Trocar dados={dados} versao={versao} recarregar={recarregar} />}
      {aba === 'Totais' && <Totais dados={dados} versao={versao} />}
      {aba === 'Histórico' && <Historico versao={versao} />}
      {aba === 'Configurar' && <Configurar dados={dados} versao={versao} recarregar={recarregar} />}
    </>
  )
}

// --------------------------------------------------------------------------- //
function Calendario({ dados, versao }: { dados: DadosPlantao; versao: number }) {
  const hoje = new Date(dados.hoje + 'T12:00:00')
  const indiceHoje = () => {
    const i = dados.meses.findIndex((m) => m.ano === hoje.getFullYear() && m.mes === hoje.getMonth() + 1)
    return i >= 0 ? i : 0
  }
  const [indice, setIndice] = useState(() => {
    try {
      const s = sessionStorage.getItem('plantao_mes')
      if (s) { const i = dados.meses.findIndex((m) => `${m.ano}-${m.mes}` === s); if (i >= 0) return i }
    } catch { /* */ }
    return indiceHoje()
  })
  const mes = dados.meses[Math.min(indice, dados.meses.length - 1)]
  useEffect(() => { try { sessionStorage.setItem('plantao_mes', `${mes.ano}-${mes.mes}`) } catch { /* */ } }, [mes])
  const [visao, setVisao] = useState<'Mês' | 'Agenda'>('Mês')
  const [destaque, setDestaque] = useState<string | null>(null)
  const { dados: html } = useDados(
    () => api.get<{ html: string }>(`/api/plantao/mes?ano=${mes.ano}&mes=${mes.mes}&visao=${encodeURIComponent(visao)}${destaque ? `&destaque=${encodeURIComponent(destaque)}` : ''}`),
    [mes.ano, mes.mes, visao, destaque, versao],
  )
  const { ocupado, erro, rodar } = useAcao()
  return (
    <>
      <BarraCalendario
        aoHoje={() => setIndice(indiceHoje())}
        aoAnterior={() => setIndice((i) => Math.max(0, i - 1))} semAnterior={indice === 0}
        aoSeguinte={() => setIndice((i) => Math.min(dados.meses.length - 1, i + 1))} semSeguinte={indice >= dados.meses.length - 1}
        titulo={mes.titulo}
        direita={<div className="segmentado">{(['Mês', 'Agenda'] as const).map((v) => (
          <button key={v} type="button" className={v === visao ? 'ativo' : ''} onClick={() => setVisao(v)}>{v}</button>
        ))}</div>}
      />
      <PilulasPessoas nomes={dados.nomes} valor={destaque} mudar={setDestaque} />
      {html ? <Html html={html.html} /> : <Carregando />}
      {visao === 'Mês' && (
        <Legenda>
          ⇄ dia trocado em relação à escala original. Passe o mouse no nome para ver o motivo.
          Retângulo cinza "Férias": quem está de férias no dia.
          "de férias" em vermelho: a pessoa escalada está de férias nesse dia.
        </Legenda>
      )}
      <Erro erro={erro} />
      <Botao icone="download" ocupado={ocupado} onClick={() => rodar(() => baixar('/api/plantao/excel', 'Escala_plantao.xlsx'))}>
        Baixar escala em Excel
      </Botao>
    </>
  )
}

// --------------------------------------------------------------------------- //
const TIPOS_TROCA = ['Passar para outra pessoa', 'Trocar com um plantão de outra pessoa'] as const

function Trocar({ dados, versao, recarregar }: { dados: DadosPlantao; versao: number; recarregar: (m?: string) => void }) {
  const [passados, setPassados] = useState(false)
  const { dados: lista } = useDados(
    () => api.get<{ blocos: Bloco[]; indice_padrao: number; ativos: string[] }>(`/api/plantao/blocos?passados=${passados}`),
    [passados, versao],
  )
  const [inicio, setInicio] = useState<string | null>(null)
  const [dias, setDias] = useState<string[]>([])
  const [tipo, setTipo] = useState<(typeof TIPOS_TROCA)[number]>(TIPOS_TROCA[0])
  const [pessoa, setPessoa] = useState<string | null>(null)
  const [inicioOutro, setInicioOutro] = useState<string | null>(null)
  const [diasOutro, setDiasOutro] = useState<string[]>([])
  const [motivo, setMotivo] = useState(dados.motivos[0])
  const [observacao, setObservacao] = useState('')
  const [simulacao, setSimulacao] = useState<{ como_fica: { dia: string; antes: string; depois: string }[]; avisos: string[] } | null>(null)
  const { ocupado, erro, rodar } = useAcao()

  const blocos = lista?.blocos || []
  const bloco = blocos.find((b) => b.inicio === inicio) || blocos[lista?.indice_padrao ?? 0]
  useEffect(() => { if (bloco) setDias(bloco.datas) }, [bloco?.inicio])
  const outros = (lista?.ativos || []).filter((n) => n !== bloco?.colaborador)
  const passar = tipo === TIPOS_TROCA[0]
  const blocosPessoa = pessoa && !passar ? blocos.filter((b) => b.colaborador === pessoa) : []
  const perto = useMemo(() => {
    if (!bloco || !blocosPessoa.length) return null
    const t = new Date(bloco.inicio).getTime()
    return blocosPessoa.reduce((m, b) => Math.abs(new Date(b.inicio).getTime() - t) < Math.abs(new Date(m.inicio).getTime() - t) ? b : m)
  }, [bloco?.inicio, pessoa, blocosPessoa.length])
  const blocoOutro = blocosPessoa.find((b) => b.inicio === inicioOutro) || perto
  useEffect(() => { if (blocoOutro) setDiasOutro(blocoOutro.datas) }, [blocoOutro?.inicio])

  const diasEfetivos = bloco && bloco.datas.length > 1 ? dias : bloco?.datas || []
  const diasOutroEfetivos = blocoOutro && blocoOutro.datas.length > 1 ? diasOutro : blocoOutro?.datas || []
  const mudancas: [string, string][] = !bloco || !pessoa ? []
    : passar ? diasEfetivos.map((d) => [d, pessoa])
      : blocoOutro ? [...diasEfetivos.map((d) => [d, pessoa] as [string, string]), ...diasOutroEfetivos.map((d) => [d, bloco.colaborador] as [string, string])]
        : []
  const chaveMudancas = JSON.stringify(mudancas)

  useEffect(() => {
    if (!mudancas.length || !bloco || !pessoa) { setSimulacao(null); return }
    let vivo = true
    api.post('/api/plantao/simular', { mudancas, envolvidos: [bloco.colaborador, pessoa] })
      .then((r) => { if (vivo) setSimulacao(r) }).catch(() => {})
    return () => { vivo = false }
  }, [chaveMudancas])

  if (!lista) return <Carregando />
  const rotuloDia = (b: Bloco) => (d: string) => b.rotulos_dias[b.datas.indexOf(d)] || d
  return (
    <>
      <Legenda>Escolha o plantão, quem assume e o motivo. A troca fica no histórico com seu nome e a hora.</Legenda>
      <div style={{ margin: '.3rem 0 .6rem' }}><Chave rotulo="Mostrar também plantões que já passaram" valor={passados} mudar={(v) => { setPassados(v); setInicio(null) }} /></div>
      {!blocos.length ? <Aviso tipo="info">Não há plantões futuros na escala.</Aviso> : bloco && (
        <>
          <Selecao rotulo="Plantão" opcoes={blocos.map((b) => b.inicio)} valor={bloco.inicio}
            rotulos={(v) => blocos.find((b) => b.inicio === v)?.rotulo || v}
            mudar={(v) => { setInicio(v); setInicioOutro(null) }} />
          {bloco.datas.length > 1 && (
            <PilulasMulti rotulo="Dias que mudam" opcoes={bloco.datas} valor={dias} mudar={setDias} textos={rotuloDia(bloco)} />
          )}
          <Radio rotulo="O que fazer" opcoes={TIPOS_TROCA} valor={tipo} mudar={(v) => setTipo(v)} horizontal />
          <Selecao rotulo={passar ? 'Quem assume' : 'Trocar com'} opcoes={outros} valor={pessoa}
            vazio={pessoa ? undefined : 'Escolha o colaborador'} mudar={(v) => { setPessoa(v); setInicioOutro(null) }} />
          {pessoa && !passar && (!blocosPessoa.length
            ? <Aviso tipo="warning">{pessoa} não tem plantões para trocar no período.</Aviso>
            : blocoOutro && (
              <>
                <Selecao rotulo={`Plantão de ${pessoa} que ${bloco.colaborador} assume`} opcoes={blocosPessoa.map((b) => b.inicio)}
                  valor={blocoOutro.inicio} rotulos={(v) => blocosPessoa.find((b) => b.inicio === v)?.rotulo || v} mudar={setInicioOutro} />
                {blocoOutro.datas.length > 1 && (
                  <PilulasMulti rotulo="Dias que mudam" opcoes={blocoOutro.datas} valor={diasOutro} mudar={setDiasOutro} textos={rotuloDia(blocoOutro)} />
                )}
              </>
            ))}
          <div className="grade" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <Selecao rotulo="Motivo" opcoes={dados.motivos} valor={motivo} mudar={setMotivo} />
            <Texto rotulo="Observação (opcional)" valor={observacao} mudar={setObservacao} placeholder="Ex.: atestado até sexta" />
          </div>
          {mudancas.length > 0 && simulacao && (
            <>
              <Markdown texto={'**Como fica**\n' + simulacao.como_fica.map((c) => `- ${c.dia}: ${c.antes} → **${c.depois}**`).join('\n')} />
              {simulacao.avisos.map((a, i) => <Aviso key={i} tipo="warning">{a}</Aviso>)}
            </>
          )}
          <Erro erro={erro} />
          <Botao tipo="primario" disabled={!mudancas.length} ocupado={ocupado} onClick={() => rodar(async () => {
            const r = await api.post('/api/plantao/trocar', { mudancas, motivo, observacao, envolvidos: [bloco.colaborador, pessoa] })
            setPessoa(null); setObservacao('')
            recarregar(r.mensagem)
          })}>Confirmar troca</Botao>
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- //
const PERIODOS = ['Ano inteiro (escala)', 'Só o que já passou'] as const

function Totais({ dados, versao }: { dados: DadosPlantao; versao: number }) {
  const anoHoje = Number(dados.hoje.slice(0, 4))
  const [ano, setAno] = useState(dados.anos.includes(anoHoje) ? anoHoje : dados.anos[dados.anos.length - 1])
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(PERIODOS[0])
  const { dados: t } = useDados(
    () => api.get<{ colunas: string[]; linhas: Record<string, any>[]; rotulo_intervalos: string; intervalo_minimo: number }>(
      `/api/plantao/totais?ano=${ano}&so_passado=${periodo !== PERIODOS[0]}`),
    [ano, periodo, versao],
  )
  const categorias = Object.values(dados.categorias)
  const spec = useMemo(() => {
    if (!t?.linhas.length) return null
    const valores = t.linhas.flatMap((l) => categorias.map((c) => ({ Colaborador: l.Colaborador, Categoria: c, Dias: l[c] })))
    return {
      data: { values: valores }, mark: { type: 'bar' }, height: 34 * t.linhas.length + 40,
      encoding: {
        x: { field: 'Dias', type: 'quantitative', title: 'Dias de plantão' },
        y: { field: 'Colaborador', type: 'nominal', sort: '-x', title: null },
        color: {
          field: 'Categoria', type: 'nominal', legend: { orient: 'top', title: null },
          scale: { domain: categorias, range: Object.keys(dados.categorias).map((k) => dados.cores_categorias[k]) },
        },
        order: { field: 'Categoria', type: 'nominal', sort: 'descending' },
        tooltip: [{ field: 'Colaborador' }, { field: 'Categoria' }, { field: 'Dias' }],
      },
    }
  }, [t])
  return (
    <>
      <div className="grade" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <Selecao rotulo="Ano" opcoes={dados.anos} valor={ano} mudar={setAno} />
        <Radio rotulo="Período" opcoes={PERIODOS} valor={periodo} mudar={setPeriodo} horizontal />
      </div>
      {!t ? <Carregando /> : !t.linhas.length ? <Aviso tipo="info">Sem plantões no período.</Aviso> : (
        <>
          <Legenda>
            Pontos por dia: semana 1, fim de semana 2, feriado/ponte 3. "{t.rotulo_intervalos}" conta quantas vezes a pessoa
            teve menos de {t.intervalo_minimo} dias livres entre um plantão e o seguinte.
          </Legenda>
          <Tabela linhas={t.linhas} colunas={t.colunas.map((c) => ({
            chave: c, titulo: c, numero: c !== 'Colaborador' && c !== 'Próximo plantão',
            formato: c === 'Diferença da média'
              ? (v: number) => (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : undefined,
          }))} />
          {spec && <Grafico spec={spec} />}
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- //
function Historico({ versao }: { versao: number }) {
  const { dados } = useDados(() => api.get<Record<string, string>[]>('/api/plantao/historico'), [versao])
  if (!dados) return <Carregando />
  if (!dados.length) return <Aviso tipo="info">Nenhuma alteração registrada ainda.</Aviso>
  return (
    <Tabela linhas={dados} altura={560} colunas={[
      { chave: 'quando', titulo: 'Quando' }, { chave: 'acao', titulo: 'O quê' }, { chave: 'dia', titulo: 'Dia do plantão' },
      { chave: 'antes', titulo: 'Antes' }, { chave: 'depois', titulo: 'Depois' }, { chave: 'motivo', titulo: 'Motivo' },
      { chave: 'por', titulo: 'Por' },
    ]} />
  )
}

// --------------------------------------------------------------------------- //
const AUTOMATICO = 'Automático (pelo nome do login)'

function Configurar({ dados, versao, recarregar }: { dados: DadosPlantao; versao: number; recarregar: (m?: string) => void }) {
  const { dados: conf, recarregar: recarregarConf } = useDados(
    () => api.get<{ emails: Record<string, string>; logins: { usuario: string; nome: string }[];
      vinculos: { colaborador: string; manual: string | null; achado: string | null; achado_nome: string | null }[] }>('/api/plantao/config'),
    [versao],
  )
  const hoje = dados.hoje
  const [dia, setDia] = useState(hoje < dados.inicio_escala ? dados.inicio_escala : hoje > dados.fim_escala ? dados.fim_escala : hoje)
  const chavesCategoria = Object.keys(dados.categorias).map(Number)
  const [categoria, setCategoria] = useState<number>(dados.categoria_por_dia[dia] ?? 1)
  useEffect(() => { setCategoria(dados.categoria_por_dia[dia] ?? 1) }, [dia, dados])
  const [novoNome, setNovoNome] = useState('')
  const [lista, setLista] = useState('')
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [logins, setLogins] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!conf) return
    setEmails(conf.emails)
    setLogins(Object.fromEntries(conf.vinculos.map((v) => [v.colaborador, v.manual || AUTOMATICO])))
  }, [conf])
  const { ocupado, erro, rodar } = useAcao()
  const feito = (r: { mensagem: string }) => { recarregar(r.mensagem); recarregarConf() }

  return (
    <>
      <Erro erro={erro} />
      <Markdown texto="**Feriados e pontes**" />
      <div className="grade fim" style={{ gridTemplateColumns: '1fr 1.4fr 1fr' }}>
        <DataCampo rotulo="Dia" valor={dia} mudar={(v) => v && setDia(v)} min={dados.inicio_escala} max={dados.fim_escala} />
        <Selecao rotulo="Categoria" opcoes={chavesCategoria} valor={categoria} mudar={setCategoria} rotulos={(c) => dados.categorias[String(c)]} />
        <div className="campo"><Botao ocupado={ocupado} onClick={() => rodar(async () => feito(await api.post('/api/plantao/categoria', { data: dia, categoria })))}>Salvar categoria</Botao></div>
      </div>
      <hr />

      <Markdown texto="**Colaboradores da escala**" />
      <Legenda>Quem sai da escala continua nos totais e no histórico, mas não aparece para assumir plantões.</Legenda>
      {Object.entries(dados.colaboradores).map(([nome, ativo]) => (
        <div key={nome} style={{ margin: '.25rem 0' }}>
          <Chave rotulo={nome} valor={ativo}
            mudar={(v) => rodar(async () => feito(await api.post('/api/plantao/colaboradores', { nome, ativo: v })))} />
        </div>
      ))}
      <div className="grade fim" style={{ gridTemplateColumns: '3fr 1fr' }}>
        <Texto rotulo="Incluir colaborador" valor={novoNome} mudar={setNovoNome} placeholder="Nome como aparece na escala" />
        <div className="campo"><Botao disabled={!novoNome.trim()} onClick={() => rodar(async () => {
          feito(await api.post('/api/plantao/colaboradores', { nome: novoNome.trim(), ativo: true })); setNovoNome('')
        })}>Incluir</Botao></div>
      </div>
      <hr />

      <Markdown texto="**E-mails**" />
      <Legenda>Quem tem e-mail é marcado no e-mail semanal da escala quando estiver de plantão.</Legenda>
      <AreaTexto rotulo="Colar lista do Outlook" valor={lista} mudar={setLista}
        placeholder={'"Nome Completo" <nome@voegol.com.br>; "Outro Nome" <outro@voegol.com.br>'}
        ajuda="Copie os destinatários de um e-mail no Outlook e cole aqui. Cada nome da escala é associado ao contato com esse nome." />
      <Botao disabled={!lista.trim()} onClick={() => rodar(async () => { feito(await api.post('/api/plantao/emails', { lista })); setLista('') })}>Preencher e-mails</Botao>
      <div style={{ height: '.8rem' }} />
      {conf ? (
        <>
          {Object.keys(dados.colaboradores).map((nome) => (
            <Texto key={nome} rotulo={nome} valor={emails[nome] || ''} placeholder="nome@voegol.com.br"
              mudar={(v) => setEmails((e) => ({ ...e, [nome]: v }))} />
          ))}
          <Botao onClick={() => rodar(async () => feito(await api.post('/api/plantao/emails', { emails })))}>Salvar e-mails</Botao>
        </>
      ) : <Carregando />}
      <hr />

      <Markdown texto="**Login de cada colaborador**" />
      <Legenda>
        O site acha a pessoa da escala pelo nome do login (ex.: "Davi Souza" → Davi). Ligue à mão só quem não foi achado ou foi achado errado.
      </Legenda>
      {conf && (
        <>
          {conf.vinculos.map((v) => (
            <div key={v.colaborador} className="grade" style={{ gridTemplateColumns: '1.2fr 2.5fr 2fr', alignItems: 'center' }}>
              <b>{v.colaborador}</b>
              <Selecao opcoes={[AUTOMATICO, ...conf.logins.map((l) => l.usuario)]} valor={logins[v.colaborador] || AUTOMATICO}
                rotulos={(l) => l === AUTOMATICO ? l : `${conf.logins.find((x) => x.usuario === l)?.nome} (${l})`}
                mudar={(l) => setLogins((x) => ({ ...x, [v.colaborador]: l }))} />
              <Legenda>{v.achado ? `Agora: ${v.achado_nome || v.achado}` : 'Agora: nenhum login achado'}</Legenda>
            </div>
          ))}
          <Botao onClick={() => rodar(async () => feito(await api.post('/api/plantao/logins', {
            ligacoes: Object.fromEntries(Object.entries(logins).map(([n, l]) => [n, l === AUTOMATICO ? null : l])),
          })))}>Salvar logins</Botao>
        </>
      )}
      <hr />
      <ImportarPlantao aoImportar={recarregar} />
    </>
  )
}

type Previa = {
  avisos: string[]; dias: number; de: string; ate: string; colaboradores: number; resumo: string
  linhas: { data: string; colaborador: string; categoria: string; antes: string; motivo: string }[]
}

function ImportarPlantao({ aoImportar }: { aoImportar: (m?: string) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const { ocupado, erro, setErro, rodar } = useAcao()
  useEffect(() => {
    setPrevia(null); setErro(null)
    if (arquivo) rodar(async () => setPrevia(await api.post('/api/plantao/importar', enviarArquivo('arquivo', arquivo))))
  }, [arquivo])
  return (
    <>
      <Markdown texto="**Importar planilha**" />
      <Legenda>
        Aceita a planilha de plantão da Engenharia (CSV ou Excel) com as colunas Data, Colaborador, Antes do ajuste e
        Pontos (Ref). Os dias da planilha substituem os mesmos dias no site; os outros dias não mudam.
      </Legenda>
      <EnvioArquivo aceitar=".csv,.xlsx,.xlsm" arquivo={arquivo} mudar={setArquivo} />
      <Erro erro={erro} />
      {previa && arquivo && (
        <>
          {previa.avisos.map((a, i) => <Aviso key={i} tipo="warning">{a}</Aviso>)}
          <div className="grade g4">
            <Metrica rotulo="Dias" valor={previa.dias} /><Metrica rotulo="De" valor={previa.de} />
            <Metrica rotulo="Até" valor={previa.ate} /><Metrica rotulo="Colaboradores" valor={previa.colaboradores} />
          </div>
          <Legenda>{previa.resumo}</Legenda>
          <Expansor titulo="Conferir linhas lidas">
            <Tabela linhas={previa.linhas} altura={420} colunas={[
              { chave: 'data', titulo: 'Data' }, { chave: 'colaborador', titulo: 'Colaborador' },
              { chave: 'categoria', titulo: 'Categoria' }, { chave: 'antes', titulo: 'Antes do ajuste' }, { chave: 'motivo', titulo: 'Motivo' },
            ]} />
          </Expansor>
          <Botao tipo="primario" ocupado={ocupado} onClick={() => rodar(async () => {
            const r = await api.post('/api/plantao/importar?confirmar=true', enviarArquivo('arquivo', arquivo))
            setArquivo(null)
            aoImportar(r.mensagem)
          })}>Importar escala</Botao>
        </>
      )}
    </>
  )
}

// --------------------------------------------------------------------------- //
function DialogoCracha({ info, bases, adiar, salvo }: {
  info: NonNullable<DadosPlantao['dialogo_cracha']>; bases: string[]; adiar: () => void; salvo: () => void
}) {
  const lista = bases.length ? bases : BASES_CRACHA_PADRAO
  const [linhas, setLinhas] = useState<{ base: string | null; validade: string | null }[]>(
    () => [{ base: info.vencidos[0] && lista.includes(info.vencidos[0]) ? info.vencidos[0] : null, validade: null }],
  )
  const { ocupado, erro, setErro, rodar } = useAcao()
  const salvar = () => {
    const preenchidas = linhas.filter((l) => l.base || l.validade)
    if (!preenchidas.length) return setErro('Escolha a base e a validade de pelo menos um crachá.')
    if (preenchidas.some((l) => !l.base || !l.validade)) return setErro('Em cada crachá, escolha a base e a validade.')
    rodar(async () => {
      await api.post('/api/crachas', { crachas: preenchidas.map((l) => [l.base, l.validade]) })
      salvo()
    })
  }
  return (
    <Dialogo titulo="Crachás" aberto fechar={adiar}>
      <Markdown texto={info.vencidos.length
        ? `Olá, **${info.pessoa}**. Crachá vencido: **${info.vencidos.join(', ')}**. Informe a nova validade (escolha a mesma base).`
        : `Olá, **${info.pessoa}**. Informe a base e a validade de cada crachá que você tem.`} />
      {info.crachas.length > 0 && (
        <>
          <Markdown texto="**Já cadastrados**" />
          <ul>{info.crachas.map((c) => (
            <li key={c.base}><b>{c.base}</b> · {dataBr(c.validade)} · <span style={{ color: c.cor, fontWeight: 600 }}>{c.situacao}</span></li>
          ))}</ul>
        </>
      )}
      {linhas.map((l, i) => (
        <div key={i} className="grade" style={{ gridTemplateColumns: '1fr 2fr' }}>
          <Selecao rotulo="Base" opcoes={lista} valor={l.base} vazio={l.base ? undefined : 'Escolha'}
            mudar={(b) => setLinhas((x) => x.map((y, j) => j === i ? { ...y, base: b } : y))} />
          <DataCampo rotulo="Validade" valor={l.validade} min="2020-01-01" max="2040-12-31"
            mudar={(v) => setLinhas((x) => x.map((y, j) => j === i ? { ...y, validade: v } : y))} />
        </div>
      ))}
      {linhas.length < lista.length && (
        <Botao tipo="terciario" onClick={() => setLinhas((x) => [...x, { base: null, validade: null }])}>+ Adicionar crachá de outra base</Botao>
      )}
      <Erro erro={erro} />
      <div className="grade g2" style={{ marginTop: '1rem' }}>
        <Botao tipo="primario" cheio ocupado={ocupado} onClick={salvar}>Salvar</Botao>
        <Botao cheio onClick={adiar}>Marcar depois</Botao>
      </div>
    </Dialogo>
  )
}

