import { useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Cabecalho, Carregando, Erro, Selecao, useAba, Abas, useDados } from '../../componentes/ui'
import { useSessao } from '../../sessao'
import FichaVisualizacao from './FichaVisualizacao'

type Pendente = { prefixo: string; pesagem: string; revisao: string; erros: { descricao: string }[]; fluxo: { gerador_nome: string } }
type Lista = { aprovacao: Pendente[]; correcao: Pendente[]; pode_emitir: boolean }
const rotulo = (f: Pendente) => `${f.prefixo} | Pesagem ${f.pesagem} | Revisão ${f.revisao}`

export function AvisoSomenteVisualizacao() {
  const { sessao } = useSessao()
  if (sessao?.permissoes.emitir) return null
  return <Aviso>Modo visualização: seu perfil pode ver esta tela, mas não pode gerar, alterar, devolver ou aprovar fichas.</Aviso>
}

export default function Aprovacao() {
  const { dados, erro, carregando, recarregar } = useDados<Lista>(() => api.get('/api/aprovacao'), [])
  const [aba, setAba] = useAba('aprovacao', ['Pendentes de aprovação', 'Pendentes de correção'])
  const [escolhaA, setEscolhaA] = useState<string | null>(null)
  const [escolhaC, setEscolhaC] = useState<string | null>(null)
  const [aprovada, setAprovada] = useState<Pendente | null>(null)

  const listaA = dados?.aprovacao || []
  const listaC = dados?.correcao || []
  const fichaA = listaA.find((f) => rotulo(f) === escolhaA) || listaA[0]
  const fichaC = listaC.find((f) => rotulo(f) === escolhaC) || listaC[0]

  return (
    <div>
      <Cabecalho titulo="Aprovação" subtitulo="Revise, devolva para correção ou aprove as fichas emitidas." />
      <AvisoSomenteVisualizacao />
      <Abas abas={['Pendentes de aprovação', 'Pendentes de correção']} ativa={aba} mudar={setAba} />
      {carregando && !dados ? <Carregando /> : erro ? <Erro erro={erro} /> : aba === 'Pendentes de aprovação' ? (
        aprovada ? (
          <>
            <Aviso tipo="success">Ficha já aprovada: {rotulo(aprovada)}. Baixe o Excel ou o PDF abaixo.</Aviso>
            <Botao onClick={() => setAprovada(null)}>Voltar às fichas pendentes</Botao>
            <div className="espaco" />
            <FichaVisualizacao prefixo={aprovada.prefixo} pesagem={aprovada.pesagem} revisao={aprovada.revisao} />
          </>
        ) : !listaA.length ? <Aviso tipo="success">Não há fichas pendentes de aprovação.</Aviso> : (
          <>
            <Selecao rotulo="Selecione a ficha para revisar" valor={rotulo(fichaA)} opcoes={listaA.map(rotulo)} mudar={setEscolhaA} />
            <FichaVisualizacao key={rotulo(fichaA)} prefixo={fichaA.prefixo} pesagem={fichaA.pesagem} revisao={fichaA.revisao} modoAprovacao
              aoAprovar={() => { setAprovada(fichaA); recarregar() }} />
          </>
        )
      ) : !listaC.length ? <Aviso tipo="success">Não há fichas aguardando correção do emissor.</Aviso> : (
        <>
          <Selecao rotulo="Selecione a ficha devolvida" valor={rotulo(fichaC)} opcoes={listaC.map(rotulo)} mudar={setEscolhaC} />
          <Aviso tipo="warning">Devolvida para correção por {fichaC.fluxo.gerador_nome}. O emissor pode abrir “Nova ficha”, selecionar esta ficha e reenviá-la para aprovação.</Aviso>
          <p><b>Campos que precisam de correção:</b></p>
          {fichaC.erros.map((e) => <div key={e.descricao} style={{ color: '#D92D20' }}>🔴 {e.descricao}</div>)}
          <div className="espaco" />
          <FichaVisualizacao key={rotulo(fichaC)} prefixo={fichaC.prefixo} pesagem={fichaC.pesagem} revisao={fichaC.revisao} destacarErros />
        </>
      )}
    </div>
  )
}
