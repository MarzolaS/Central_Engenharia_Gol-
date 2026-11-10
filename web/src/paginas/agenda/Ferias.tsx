// Férias e crachás do time (tela_ferias do app.py).
import { useState } from 'react'
import { api } from '../../api'
import {
  Abas, Aviso, Botao, Cabecalho, Carregando, DataCampo, Dialogo, Erro, Expansor, Html, Legenda, Markdown,
  Selecao, useAba, useAcao, useDados,
} from '../../componentes/ui'
import { BASES_CRACHA_PADRAO, BarraCalendario, adiar, lerAdiado } from './comum'

type DadosFerias = {
  hoje: string; pessoa: string | null; pode_configurar: boolean
  conflitos: { nome: string; inicio: string; fim: string; dias: string[] }[]
  anos: number[]; crachas_html: string
  meus_crachas: { base: string; validade: string; data: string; situacao: string; cor: string }[]
  minhas_ferias: { id: number; texto: string; passou: boolean }[]
  excluiveis: { id: number; colaborador: string; texto: string }[]
  bases_cracha: string[]; ano_ferias_pedidas: number
  dialogo_ferias: { pessoa: string; ja_marcadas: string[] } | null
}

export default function Ferias() {
  const [versao, setVersao] = useState(0)
  const { dados, erro } = useDados(() => api.get<DadosFerias>('/api/ferias'), [versao])
  const [ok, setOk] = useState<string | null>(null)
  const recarregar = (m?: string) => { if (m) setOk(m); setVersao((v) => v + 1) }
  const [aba, setAba] = useAba('ferias', ['Férias do time', 'Minhas férias e crachás'])
  const [adiado, setAdiado] = useState(() => lerAdiado('ferias_lembrete_adiado'))

  const cab = <Cabecalho titulo="Férias e crachás" subtitulo="Calendário de férias e validade dos crachás do time" />
  if (!dados) return <>{cab}{erro ? <Erro erro={erro} /> : <Carregando />}</>
  const totalConflitos = dados.conflitos.reduce((s, c) => s + c.dias.length, 0)
  return (
    <>
      {cab}
      {ok && <Aviso tipo="success">{ok}</Aviso>}
      {dados.dialogo_ferias && !adiado && (
        <DialogoFerias info={dados.dialogo_ferias} hoje={dados.hoje} ano={dados.ano_ferias_pedidas}
          adiar={() => { adiar('ferias_lembrete_adiado'); setAdiado(true) }}
          salvo={() => { adiar('ferias_lembrete_adiado'); setAdiado(true); recarregar('Férias marcadas. Obrigado!') }} />
      )}
      {dados.conflitos.length > 0 && (
        <Expansor titulo={`📅 ${totalConflitos} dia(s) de plantão caem nas férias de quem está escalado`}>
          <Markdown texto={dados.conflitos.map((c) => `- **${c.nome}**: ${c.dias.join(', ')} (férias de ${c.inicio} a ${c.fim})`).join('\n')} />
          <Legenda>Esses plantões precisam ser trocados em Escala de plantão → Trocar plantão.</Legenda>
        </Expansor>
      )}
      <Abas abas={['Férias do time', 'Minhas férias e crachás']} ativa={aba} mudar={setAba} />
      {aba === 'Férias do time' ? <FeriasDoTime dados={dados} versao={versao} recarregar={recarregar} />
        : <MinhasFerias dados={dados} recarregar={recarregar} />}
    </>
  )
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function FeriasDoTime({ dados, versao, recarregar }: { dados: DadosFerias; versao: number; recarregar: (m?: string) => void }) {
  const anoHoje = Number(dados.hoje.slice(0, 4))
  const mesHoje = Number(dados.hoje.slice(5, 7))
  const [visao, setVisao] = useState<'Mês' | 'Lista' | 'Ano'>('Mês')
  const [[ano, mes], setMes] = useState<[number, number]>([anoHoje, mesHoje])
  const [anoLinha, setAnoLinha] = useState(dados.anos.includes(anoHoje) ? anoHoje : dados.anos[0])
  const mudarMes = (passo: number) => setMes(([a, m]) => {
    const t = a * 12 + (m - 1) + passo
    return [Math.floor(t / 12), (t % 12) + 1]
  })
  const { dados: html } = useDados(
    () => api.get<{ html: string }>(`/api/ferias/html?visao=${encodeURIComponent(visao)}&ano=${visao === 'Ano' ? anoLinha : ano}&mes=${mes}`),
    [visao, ano, mes, anoLinha, versao],
  )
  const { erro, rodar } = useAcao()
  const visoes = (
    <div className="segmentado">{(['Mês', 'Lista', 'Ano'] as const).map((v) => (
      <button key={v} type="button" className={v === visao ? 'ativo' : ''} onClick={() => setVisao(v)}>{v}</button>
    ))}</div>
  )
  return (
    <>
      {visao === 'Mês' && (
        <BarraCalendario aoHoje={() => setMes([anoHoje, mesHoje])} aoAnterior={() => mudarMes(-1)} aoSeguinte={() => mudarMes(1)}
          titulo={`${MESES[mes - 1]} de ${ano}`} direita={visoes} />
      )}
      {visao === 'Lista' && <BarraCalendario titulo="Próximas férias" direita={visoes} />}
      {visao === 'Ano' && (
        <BarraCalendario direita={visoes} titulo={
          <div className="segmentado" style={{ display: 'inline-flex' }}>{dados.anos.map((a) => (
            <button key={a} type="button" className={a === anoLinha ? 'ativo' : ''} onClick={() => setAnoLinha(a)}>{a}</button>
          ))}</div>
        } />
      )}
      {html ? <Html html={html.html} /> : <Carregando />}
      {visao === 'Mês' && <Legenda>Passe o mouse na barra para ver o período completo.</Legenda>}
      {visao === 'Ano' && <Legenda>A linha laranja marca o dia de hoje. Passe o mouse no bloco para ver o período.</Legenda>}

      {(dados.pessoa || dados.pode_configurar) && (
        <Expansor titulo={`🗑 ${dados.pode_configurar ? 'Excluir férias do time' : 'Excluir suas férias'} (${dados.excluiveis.length})`}>
          {!dados.excluiveis.length && <Legenda>Nenhuma férias marcada daqui para frente.</Legenda>}
          <Erro erro={erro} />
          {dados.excluiveis.map((l) => (
            <div key={l.id} className="linha-acoes">
              <div className="texto">{dados.pode_configurar && <><b>{l.colaborador}</b> · </>}{l.texto}</div>
              <Botao pequeno onClick={() => rodar(async () => {
                await api.del(`/api/ferias/${l.id}`)
                recarregar(`Férias de ${l.colaborador} excluídas: ${l.texto}.`)
              })}>Excluir</Botao>
            </div>
          ))}
        </Expansor>
      )}
      <h5>Validade dos crachás</h5>
      <Html html={dados.crachas_html} />
    </>
  )
}

function MinhasFerias({ dados, recarregar }: { dados: DadosFerias; recarregar: (m?: string) => void }) {
  const bases = dados.bases_cracha.length ? dados.bases_cracha : BASES_CRACHA_PADRAO
  const [base, setBase] = useState(bases[0])
  const [validade, setValidade] = useState<string | null>(null)
  const [inicio, setInicio] = useState<string | null>(null)
  const [fim, setFim] = useState<string | null>(null)
  const { ocupado, erro, setErro, rodar } = useAcao()
  if (!dados.pessoa) return <Aviso tipo="info">Esta é a conta geral da Engenharia. Entre com o seu login para marcar férias e crachá.</Aviso>
  const jaTem = dados.meus_crachas.some((c) => c.base === base)
  return (
    <>
      <Erro erro={erro} />
      <h5>Seus crachás</h5>
      {!dados.meus_crachas.length && <Legenda>Nenhum crachá cadastrado ainda.</Legenda>}
      {dados.meus_crachas.map((c) => (
        <div key={c.base} className="linha-acoes">
          <b style={{ width: 70 }}>{c.base}</b>
          <span style={{ width: 140 }}>{c.data}</span>
          <span className="texto" style={{ color: c.cor, fontWeight: 600 }}>{c.situacao}</span>
          <Botao pequeno onClick={() => rodar(async () => recarregar((await api.del(`/api/crachas/${encodeURIComponent(c.base)}`)).mensagem))}>Excluir</Botao>
        </div>
      ))}
      <div className="grade fim" style={{ gridTemplateColumns: '1.3fr 2.5fr 1.5fr', marginTop: '.6rem' }}>
        <Selecao rotulo="Base" opcoes={bases} valor={base} mudar={setBase} />
        <DataCampo rotulo="Validade" valor={validade} mudar={setValidade} min="2020-01-01" max="2040-12-31" />
        <div className="campo">
          <Botao tipo="primario" cheio disabled={!validade} ocupado={ocupado} onClick={() => rodar(async () => {
            const r = await api.post('/api/crachas', { crachas: [[base, validade]] })
            setValidade(null)
            recarregar(r.mensagem)
          })}>{jaTem ? 'Atualizar crachá' : 'Adicionar crachá'}</Botao>
        </div>
      </div>

      <h5>Suas férias</h5>
      {!dados.minhas_ferias.length && <Legenda>Nenhuma férias marcada ainda.</Legenda>}
      {dados.minhas_ferias.map((f) => (
        <div key={f.id} className="linha-acoes">
          <span className="texto" style={{ color: f.passou ? '#9AA0A6' : '#1F2430' }}>{f.texto}{f.passou ? ' · já passou' : ''}</span>
          <Botao pequeno onClick={() => rodar(async () => recarregar((await api.del(`/api/ferias/${f.id}`)).mensagem))}>Excluir</Botao>
        </div>
      ))}
      <div className="grade fim" style={{ gridTemplateColumns: '2fr 2fr 1.2fr', marginTop: '.6rem' }}>
        <DataCampo rotulo="Novo período: primeiro dia" valor={inicio} mudar={setInicio} min="2025-01-01" max="2030-12-31" />
        <DataCampo rotulo="Último dia" valor={fim} mudar={setFim} min={inicio || '2025-01-01'} max="2030-12-31" />
        <div className="campo">
          <Botao tipo="primario" cheio ocupado={ocupado} onClick={() => {
            if (!inicio || !fim) return setErro('Escolha o primeiro e o último dia das férias.')
            rodar(async () => {
              const r = await api.post('/api/ferias', { periodos: [[inicio, fim]] })
              setInicio(null); setFim(null)
              recarregar(r.mensagem)
            })
          }}>Adicionar férias</Botao>
        </div>
      </div>
    </>
  )
}

function DialogoFerias({ info, hoje, ano, adiar, salvo }: {
  info: NonNullable<DadosFerias['dialogo_ferias']>; hoje: string; ano: number; adiar: () => void; salvo: () => void
}) {
  const [periodos, setPeriodos] = useState<{ inicio: string | null; fim: string | null }[]>([{ inicio: null, fim: null }])
  const { ocupado, erro, setErro, rodar } = useAcao()
  const max = `${ano}-12-31`
  const salvar = () => {
    if (periodos.some((p) => !!p.inicio !== !!p.fim)) return setErro('Em um dos períodos falta o último dia das férias.')
    const cheios = periodos.filter((p) => p.inicio && p.fim)
    if (!cheios.length) return setErro('Escolha pelo menos um período.')
    rodar(async () => {
      await api.post('/api/ferias', { periodos: cheios.map((p) => [p.inicio, p.fim]) })
      salvo()
    })
  }
  return (
    <Dialogo titulo="Férias" aberto fechar={adiar}>
      <Markdown texto={`Olá, **${info.pessoa}**. Marque as férias que você já tem programadas até o fim de ${ano}. Para cada período, escolha o primeiro e o último dia.`} />
      {info.ja_marcadas.length > 0 && <Markdown texto={'**Já marcadas**\n' + info.ja_marcadas.map((t) => `- ${t}`).join('\n')} />}
      {periodos.map((p, i) => (
        <div key={i} className="grade g2">
          <DataCampo rotulo={i === 0 ? 'Período de férias: primeiro dia' : `${i + 1}º período: primeiro dia`} valor={p.inicio} min={hoje} max={max}
            mudar={(v) => setPeriodos((x) => x.map((y, j) => j === i ? { ...y, inicio: v } : y))} />
          <DataCampo rotulo="Último dia" valor={p.fim} min={p.inicio || hoje} max={max}
            mudar={(v) => setPeriodos((x) => x.map((y, j) => j === i ? { ...y, fim: v } : y))} />
        </div>
      ))}
      {periodos.length < 4 && (
        <Botao tipo="terciario" onClick={() => setPeriodos((x) => [...x, { inicio: null, fim: null }])}>+ Adicionar outro período</Botao>
      )}
      <Erro erro={erro} />
      <div className="grade g2" style={{ marginTop: '1rem' }}>
        <Botao tipo="primario" cheio ocupado={ocupado} onClick={salvar}>Salvar</Botao>
        <Botao cheio onClick={adiar}>Marcar depois</Botao>
      </div>
    </Dialogo>
  )
}
