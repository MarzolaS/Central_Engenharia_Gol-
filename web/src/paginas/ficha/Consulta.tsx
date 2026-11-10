import { useMemo, useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Busca, Cabecalho, Carregando, Erro, Legenda, Metrica, Selecao, useDados } from '../../componentes/ui'
import FichaVisualizacao from './FichaVisualizacao'

type Lista = {
  somente_ultimas: boolean; aeronaves: number; fichas_emitidas: number
  arvore: Record<string, { pesagem: string; revisoes: string[] }[]>
  aguardando_aprovacao?: number; devolvidas?: number
}

export default function Consulta() {
  const { dados, erro, carregando, recarregar } = useDados<Lista>(() => api.get('/api/fichas'), [])
  const [prefixo, setPrefixo] = useState<string | null>(null)
  const [pesagem, setPesagem] = useState<string | null>(null)
  const [revisao, setRevisao] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const prefixos = useMemo(() => Object.keys(dados?.arvore || {}), [dados])
  const pesagens = prefixo && dados ? dados.arvore[prefixo] || [] : []

  const escolherPrefixo = (p: string | null) => {
    setPrefixo(p)
    const lista = p && dados ? dados.arvore[p] || [] : []
    const ultima = lista[lista.length - 1]
    setPesagem(ultima?.pesagem ?? null)
    setRevisao(ultima ? ultima.revisoes[ultima.revisoes.length - 1] : null)
  }
  const escolherPesagem = (p: string) => {
    setPesagem(p)
    const revs = pesagens.find((x) => x.pesagem === p)?.revisoes || []
    setRevisao(revs[revs.length - 1] ?? null)
  }
  const revisoes = pesagens.find((x) => x.pesagem === pesagem)?.revisoes || []

  return (
    <div>
      <Cabecalho titulo="Consultar fichas" subtitulo="Visão geral e consulta do histórico de pesagens." />
      <Botao icone="refresh-cw" onClick={async () => { await api.post('/api/graficos/atualizar'); await recarregar(); setVersao((v) => v + 1) }}>Atualizar</Botao>
      <div className="espaco" />
      {carregando && !dados ? <Carregando /> : erro ? <Erro erro={erro} /> : dados && (
        dados.fichas_emitidas === 0 ? (
          <Aviso tipo="warning">Nenhuma ficha foi carregada do banco conectado ao site.</Aviso>
        ) : (
          <>
            {dados.somente_ultimas ? (
              <>
                <Legenda>Seu perfil mostra apenas a ficha mais recente de cada aeronave.</Legenda>
                <div style={{ maxWidth: 300 }}><Metrica rotulo="Aeronaves com ficha" valor={dados.aeronaves} /></div>
              </>
            ) : (
              <div className="grade g4">
                <Metrica rotulo="Aeronaves com ficha" valor={dados.aeronaves} />
                <Metrica rotulo="Fichas emitidas" valor={dados.fichas_emitidas} />
                <Metrica rotulo="Aguardando aprovação" valor={dados.aguardando_aprovacao ?? 0} />
                <Metrica rotulo="Devolvidas para correção" valor={dados.devolvidas ?? 0} />
              </div>
            )}
            <div className="vidro" style={{ marginTop: '1rem', borderRadius: 10 }}>
              <p style={{ margin: '0 0 .5rem' }}><b>Consultar ficha</b></p>
              <div className="grade" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                <Busca rotulo="Aeronave" valor={prefixo} opcoes={prefixos} mudar={escolherPrefixo} placeholder="Digite ou escolha o prefixo" />
                <Selecao rotulo="Pesagem" valor={pesagem} opcoes={pesagens.map((p) => p.pesagem)} mudar={escolherPesagem} disabled={!prefixo} vazio={prefixo ? undefined : '—'} />
                <Selecao rotulo="Revisão" valor={revisao} opcoes={revisoes} mudar={setRevisao} disabled={!pesagem} vazio={pesagem ? undefined : '—'} />
              </div>
            </div>
            {prefixo && pesagem && revisao && (
              <>
                <hr />
                <FichaVisualizacao key={`${prefixo}|${pesagem}|${revisao}`} prefixo={prefixo} pesagem={pesagem} revisao={revisao} versao={versao} />
              </>
            )}
          </>
        )
      )}
    </div>
  )
}
