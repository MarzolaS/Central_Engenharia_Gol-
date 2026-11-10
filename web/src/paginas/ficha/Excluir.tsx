import { useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Busca, Cabecalho, Carregando, Erro, Marcar, Selecao, useAcao, useDados, useToast } from '../../componentes/ui'

type Lista = { arvore: Record<string, { pesagem: string; revisoes: string[] }[]> }

export default function Excluir() {
  const { dados, erro, carregando, recarregar } = useDados<Lista>(() => api.get('/api/fichas'), [])
  const [prefixo, setPrefixo] = useState<string | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)
  const prefixos = Object.keys(dados?.arvore || {})
  const atual = prefixo || prefixos[0] || null
  const opcoes = atual && dados ? (dados.arvore[atual] || []).flatMap((p) => p.revisoes.map((r) => `Pesagem ${p.pesagem} | Revisão ${r}`)) : []
  const escolhida = ficha && opcoes.includes(ficha) ? ficha : opcoes[0]
  return (
    <div>
      <Cabecalho titulo="Excluir ficha" subtitulo="Remoção permanente de uma revisão." />
      {carregando && !dados ? <Carregando /> : erro ? <Erro erro={erro} /> : !prefixos.length ? <Aviso>Não há fichas disponíveis para exclusão.</Aviso> : (
        <>
          <Busca rotulo="Aeronave" valor={atual} opcoes={prefixos} mudar={(v) => { setPrefixo(v); setFicha(null) }} />
          {!opcoes.length ? <Aviso>Não há fichas para esta aeronave.</Aviso> : (
            <>
              <Selecao rotulo="Ficha" valor={escolhida} opcoes={opcoes} mudar={setFicha} />
              <Confirmar key={`${atual}|${escolhida}`} prefixo={atual!} texto={escolhida} aoExcluir={() => { setFicha(null); recarregar() }} />
            </>
          )}
        </>
      )}
    </div>
  )
}

function Confirmar({ prefixo, texto, aoExcluir }: { prefixo: string; texto: string; aoExcluir: () => void }) {
  const [, pesagem, revisao] = /Pesagem (.+) \| Revisão (.+)/.exec(texto) || []
  const caminho = `/api/fichas/${encodeURIComponent(prefixo)}/${encodeURIComponent(pesagem)}/${encodeURIComponent(revisao)}`
  const { dados } = useDados<{ fluxo: { gerador_nome: string; aprovador_nome: string } }>(() => api.get(caminho), [caminho])
  const [ok, setOk] = useState(false)
  const acao = useAcao()
  const toast = useToast()
  return (
    <>
      <p>Gerada por: {dados?.fluxo.gerador_nome ?? '…'}</p>
      <p>Aprovada por: {dados?.fluxo.aprovador_nome ?? '…'}</p>
      <div className="vidro" style={{ borderRadius: 10 }}>
        <Aviso tipo="warning">A exclusão é permanente e também remove os dados de aprovação desta ficha.</Aviso>
        <Marcar rotulo={`Confirmo excluir ${prefixo}, Pesagem ${pesagem}, Revisão ${revisao}.`} valor={ok} mudar={setOk} />
        <Botao tipo="primario" ocupado={acao.ocupado} onClick={() => {
          if (!ok) { acao.setErro('Marque a confirmação para excluir a ficha.'); return }
          acao.rodar(async () => { const r = await api.del(caminho); toast(r.mensagem, 'success'); aoExcluir() })
        }}>Excluir ficha</Botao>
        <Erro erro={acao.erro} />
      </div>
    </>
  )
}
