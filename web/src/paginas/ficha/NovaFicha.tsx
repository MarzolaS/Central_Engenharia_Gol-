import { useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Busca, Cabecalho, Carregando, Erro, Numero, Radio, Selecao, useDados } from '../../componentes/ui'
import { AvisoSomenteVisualizacao } from './Aprovacao'
import FormularioFicha, { type Formulario, type Opcoes } from './FormularioFicha'

type Devolvida = { prefixo: string; pesagem: string; revisao: string; erros: { campo: string; descricao: string }[] }
type DadosEmissao = Opcoes & { aeronaves: string[]; devolvidas: Devolvida[] }
type Contexto = {
  prefixo: string; fichas: { pesagem: number; revisao: number }[]; ultima: { pesagem: number; revisao: number } | null
  formulario: Formulario; formulario_vazio: Formulario; aviso_devolvida?: string; momento_flaps: number; armnose: number
}
const MANUAL = 'Digitar Pesagem e Revisão manualmente'
const rotuloDev = (d: Devolvida) => `${d.prefixo} | Pesagem ${d.pesagem} | Revisão ${d.revisao}`

export default function NovaFicha() {
  const { dados, erro, carregando, recarregar } = useDados<DadosEmissao>(() => api.get('/api/emissao/aeronaves'), [])
  const [salva, setSalva] = useState<string | null>(null)
  const [escolhaDev, setEscolhaDev] = useState('Nova ficha')
  const [prefixo, setPrefixo] = useState<string | null>(null)

  if (salva) {
    return (
      <div>
        <Cabecalho titulo="Nova ficha" subtitulo="Escolha a aeronave e siga as etapas com o botão Próxima. Na última (Preview) você confere o resultado e gera a ficha." />
        <Aviso tipo="success">{salva}</Aviso>
        <Botao tipo="primario" onClick={() => { setSalva(null); setPrefixo(null); setEscolhaDev('Nova ficha'); recarregar() }}>Emitir outra ficha</Botao>
      </div>
    )
  }
  const devolvida = dados?.devolvidas.find((d) => rotuloDev(d) === escolhaDev) || null
  return (
    <div>
      <Cabecalho titulo="Nova ficha" subtitulo="Escolha a aeronave e siga as etapas com o botão Próxima. Na última (Preview) você confere o resultado e gera a ficha." />
      <AvisoSomenteVisualizacao />
      {carregando && !dados ? <Carregando /> : erro ? <Erro erro={erro} /> : dados && (
        <>
          {dados.devolvidas.length > 0 && (
            <>
              <Aviso>Há fichas devolvidas para correção. Selecione uma para revisar e reenviar.</Aviso>
              <Selecao rotulo="Ficha pendente de correção" valor={escolhaDev} opcoes={['Nova ficha', ...dados.devolvidas.map(rotuloDev)]} mudar={setEscolhaDev} />
            </>
          )}
          {devolvida ? (
            <Correcao key={rotuloDev(devolvida)} devolvida={devolvida} opcoes={dados} aoSalvar={setSalva} />
          ) : (
            <>
              <Busca rotulo="Aeronave" valor={prefixo} opcoes={dados.aeronaves} mudar={setPrefixo} />
              {prefixo && <><hr /><Emissao key={prefixo} prefixo={prefixo} opcoes={dados} aoSalvar={setSalva} /></>}
            </>
          )}
        </>
      )}
    </div>
  )
}

function Correcao({ devolvida, opcoes, aoSalvar }: { devolvida: Devolvida; opcoes: DadosEmissao; aoSalvar: (m: string) => void }) {
  const caminho = `/api/fichas/${encodeURIComponent(devolvida.prefixo)}/${encodeURIComponent(devolvida.pesagem)}/${encodeURIComponent(devolvida.revisao)}`
  const { dados, erro } = useDados<{ formulario: Formulario; momento_flaps: number; info_aeronave: { armnose?: number } }>(() => api.get(caminho), [caminho])
  if (erro) return <Aviso tipo="error">A ficha devolvida não foi encontrada no histórico desta aeronave. Atualize a lista e tente novamente.</Aviso>
  if (!dados) return <Carregando />
  const p = Number(devolvida.pesagem), r = Number(devolvida.revisao)
  return (
    <>
      <hr />
      <p><b>Campos que precisam de correção:</b></p>
      {devolvida.erros.map((e) => <div key={e.campo + e.descricao} style={{ color: '#D92D20' }}>🔴 {e.descricao}</div>)}
      <div className="espaco" />
      <FormularioFicha prefixo={devolvida.prefixo} pesagem={p} revisao={r} pesagemAnterior={p} revisaoAnterior={r}
        inicial={dados.formulario} opcoes={opcoes} armnose={dados.info_aeronave?.armnose ?? 93} momentoFlaps={dados.momento_flaps}
        modo="correcao" basePesagem={p} baseRevisao={r} camposComErro={new Set(devolvida.erros.map((e) => e.campo))}
        checarCelulas={false} rotuloSalvar="Emitir ficha e enviar para aprovação" aoSalvar={aoSalvar} />
    </>
  )
}

function Emissao({ prefixo, opcoes, aoSalvar }: { prefixo: string; opcoes: DadosEmissao; aoSalvar: (m: string) => void }) {
  const { dados: ctx, erro } = useDados<Contexto>(() => api.get(`/api/emissao/contexto/${encodeURIComponent(prefixo)}`), [prefixo])
  const [anterior, setAnterior] = useState(false)
  const [acao, setAcao] = useState<string | null>(null)
  const [manual, setManual] = useState<{ p: number | null; r: number | null } | null>(null)
  if (erro) return <Erro erro={erro} />
  if (!ctx) return <Carregando />

  const u = ctx.ultima
  let pNova: number, rNova: number, pAnt = 0, rAnt = 0
  let opcoesAcao: string[] = []
  let base: Formulario
  let numeracaoManual = false
  if (u && anterior) {
    numeracaoManual = true
    ;[pNova, rNova] = u.revisao > 0 ? [u.pesagem, u.revisao - 1] : [Math.max(u.pesagem - 1, 1), 0]
    base = ctx.formulario_vazio
  } else if (u) {
    opcoesAcao = [`Nova Revisão (Pesagem ${u.pesagem}, Revisão ${u.revisao + 1})`, `Nova Pesagem (Pesagem ${u.pesagem + 1}, Revisão 0)`, MANUAL]
    const escolha = acao && opcoesAcao.includes(acao) ? acao : opcoesAcao[0]
    numeracaoManual = escolha === MANUAL
    ;[pNova, rNova] = escolha.startsWith('Nova Pesagem') ? [u.pesagem + 1, 0] : [u.pesagem, u.revisao + 1]
    pAnt = u.pesagem; rAnt = u.revisao
    base = ctx.formulario
  } else {
    opcoesAcao = ['Primeira ficha (Pesagem 1, Revisão 0)', MANUAL]
    numeracaoManual = (acao && opcoesAcao.includes(acao) ? acao : opcoesAcao[0]) === MANUAL
    pNova = 1; rNova = 0
    base = ctx.formulario_vazio
  }
  const chaveManual = `${anterior}`
  if (numeracaoManual && manual && (manual as any).chave === chaveManual) {
    pNova = Math.max(1, Math.trunc(manual.p ?? pNova))
    rNova = Math.max(0, Math.trunc(manual.r ?? rNova))
  }
  const jaExiste = numeracaoManual && ctx.fichas.some((x) => x.pesagem === pNova && x.revisao === rNova)
  const modo = anterior ? 'anterior' : 'nova'

  return (
    <>
      {u && anterior ? (
        <>
          <Aviso>📥 <b>Cadastrar ficha anterior.</b> Use para incluir uma ficha antiga que não está no sistema. Digite a Pesagem e a Revisão dela e preencha as abas com os dados da ficha em papel. Ela não muda a última ficha da aeronave.</Aviso>
          <Botao onClick={() => { setAnterior(false); setManual(null) }}>Voltar para nova ficha</Botao>
          <div className="espaco" />
        </>
      ) : u ? (
        <>
          <Aviso>📋 <b>Base Encontrada:</b> A última ficha dessa aeronave foi a <b>Pesagem {u.pesagem} | Revisão {u.revisao}</b>. Os dados foram copiados para agilizar o preenchimento.</Aviso>
          <Radio rotulo="Escolha a ação desejada:" horizontal opcoes={opcoesAcao} valor={acao && opcoesAcao.includes(acao) ? acao : opcoesAcao[0]} mudar={(v) => { setAcao(v); setManual(null) }} />
          <Botao tipo="terciario" titulo="Inclui uma ficha antiga (por exemplo, a que veio antes da última) sem copiar os dados da última ficha."
            onClick={() => { setAnterior(true); setManual(null) }}>⟲ Cadastrar ficha anterior que falta no sistema</Botao>
        </>
      ) : (
        <>
          <Aviso>🆕 <b>Nenhuma ficha anterior encontrada.</b> Iniciando a primeira Pesagem (1), Revisão (0) com a ficha em branco.</Aviso>
          <Radio rotulo="Escolha a ação desejada:" horizontal opcoes={opcoesAcao} valor={acao && opcoesAcao.includes(acao) ? acao : opcoesAcao[0]} mudar={(v) => { setAcao(v); setManual(null) }} />
        </>
      )}
      {!anterior && pAnt > 0 && ctx.aviso_devolvida && <Aviso tipo="warning">{ctx.aviso_devolvida}</Aviso>}
      {numeracaoManual && (
        <div className="grade g2">
          <Numero rotulo="Número da Pesagem" valor={pNova} min={1} mudar={(v) => setManual({ p: v, r: rNova, chave: chaveManual } as any)} />
          <Numero rotulo="Número da Revisão" valor={rNova} min={0} mudar={(v) => setManual({ p: pNova, r: v, chave: chaveManual } as any)} />
        </div>
      )}
      {jaExiste && <Aviso tipo="error">Já existe uma ficha para {prefixo}, Pesagem {pNova}, Revisão {rNova}. Escolha outro número. Para alterar essa ficha, use a tela Editar ficha.</Aviso>}
      <FormularioFicha key={`${modo}_${prefixo}_${pNova}_${rNova}`} prefixo={prefixo} pesagem={pNova} revisao={rNova}
        pesagemAnterior={pAnt} revisaoAnterior={rAnt} inicial={base} opcoes={opcoes} armnose={ctx.armnose} momentoFlaps={ctx.momento_flaps}
        modo={modo} basePesagem={u && !anterior ? u.pesagem : null} baseRevisao={u && !anterior ? u.revisao : null}
        checarCelulas baseCelulas={u && !anterior && pNova !== pAnt ? ctx.formulario : null} bloquearSalvar={jaExiste}
        rotuloSalvar={anterior ? 'Cadastrar ficha anterior' : 'Gerar ficha e enviar para aprovação'} aoSalvar={aoSalvar} />
    </>
  )
}
