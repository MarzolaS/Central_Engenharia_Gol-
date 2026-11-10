import { useState } from 'react'
import { api } from '../../api'
import { Aviso, Busca, Cabecalho, Carregando, Erro, Selecao, useDados, useToast } from '../../componentes/ui'
import { AvisoSomenteVisualizacao } from './Aprovacao'
import FormularioFicha, { type Formulario, type Opcoes } from './FormularioFicha'

type Lista = { arvore: Record<string, { pesagem: string; revisoes: string[] }[]> }

export default function Edicao() {
  const lista = useDados<Lista>(() => api.get('/api/fichas'), [])
  const opcoes = useDados<Opcoes>(() => api.get('/api/emissao/aeronaves'), [])
  const [prefixo, setPrefixo] = useState<string | null>(null)
  const [pesagem, setPesagem] = useState<string>('')
  const [revisao, setRevisao] = useState<string>('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const arvore = lista.dados?.arvore || {}
  const pesagens = prefixo ? arvore[prefixo] || [] : []
  const revisoes = pesagens.find((p) => p.pesagem === pesagem)?.revisoes || []
  return (
    <div>
      <Cabecalho titulo="Editar ficha" subtitulo="Altere uma revisão já emitida. Ela volta para aprovação." />
      <AvisoSomenteVisualizacao />
      {(lista.carregando && !lista.dados) || (opcoes.carregando && !opcoes.dados) ? <Carregando /> : lista.erro || opcoes.erro ? <Erro erro={lista.erro || opcoes.erro} /> : (
        <>
          <Busca rotulo="Aeronave" valor={prefixo} opcoes={Object.keys(arvore)} mudar={(v) => { setPrefixo(v); setPesagem(''); setRevisao(''); setMensagem(null) }} />
          {prefixo && <Selecao rotulo="Pesagem a editar" valor={pesagem} opcoes={['', ...pesagens.map((p) => p.pesagem)]} rotulos={(v) => v || ' '} mudar={(v) => { setPesagem(v); setRevisao(''); setMensagem(null) }} />}
          {prefixo && pesagem && <Selecao rotulo="Revisão a editar" valor={revisao} opcoes={['', ...revisoes]} rotulos={(v) => v || ' '} mudar={(v) => { setRevisao(v); setMensagem(null) }} />}
          {mensagem && <Aviso tipo="success">{mensagem}</Aviso>}
          {prefixo && pesagem && revisao && opcoes.dados && (
            <><hr /><EditarFicha key={`${prefixo}|${pesagem}|${revisao}|${versao}`} prefixo={prefixo} pesagem={pesagem} revisao={revisao}
              arvore={pesagens} opcoes={opcoes.dados} aoSalvar={(m) => { setMensagem(m); setVersao((v) => v + 1) }} /></>
          )}
        </>
      )}
    </div>
  )
}

function EditarFicha({ prefixo, pesagem, revisao, arvore, opcoes, aoSalvar }: {
  prefixo: string; pesagem: string; revisao: string; arvore: { pesagem: string; revisoes: string[] }[]; opcoes: Opcoes; aoSalvar: (m: string) => void
}) {
  const toast = useToast()
  const caminho = `/api/fichas/${encodeURIComponent(prefixo)}/${encodeURIComponent(pesagem)}/${encodeURIComponent(revisao)}`
  const { dados, erro } = useDados<{ formulario: Formulario; momento_flaps: number; info_aeronave: { armnose?: number } }>(() => api.get(caminho), [caminho])
  if (erro) return <Erro erro={erro} />
  if (!dados) return <Carregando />
  const p = Math.trunc(Number(pesagem) || 1), r = Math.trunc(Number(revisao) || 0)
  // A anterior é a ficha logo antes desta no sistema (não ela mesma).
  const anteriores = arvore.flatMap((x) => x.revisoes.map((rv) => [Number(x.pesagem), Number(rv)] as const))
    .filter(([a, b]) => a < p || (a === p && b < r)).sort((x, y) => x[0] - y[0] || x[1] - y[1])
  const [pAnt, rAnt] = anteriores.length ? anteriores[anteriores.length - 1] : [0, 0]
  return (
    <FormularioFicha prefixo={prefixo} pesagem={p} revisao={r} pesagemAnterior={pAnt} revisaoAnterior={rAnt}
      inicial={dados.formulario} opcoes={opcoes} armnose={dados.info_aeronave?.armnose ?? 93} momentoFlaps={dados.momento_flaps}
      modo="edicao" basePesagem={p} baseRevisao={r} checarCelulas={false} rotuloSalvar="Enviar alterações para aprovação"
      aoSalvar={(m) => { toast(m, 'success'); aoSalvar(m) }} />
  )
}
