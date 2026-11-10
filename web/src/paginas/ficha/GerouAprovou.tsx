import { useMemo, useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Cabecalho, Carregando, Erro, Expansor, Legenda, Metrica, MultiSelecao, Radio, Selecao, useAcao, useDados } from '../../componentes/ui'

type Ficha = { prefixo: string; pesagem: string; revisao: string; data: string | null; gerado_por: string | null; aprovado_por: string | null }
type Dados = { fichas: Ficha[]; usuarios: { usuario: string; nome: string }[]; fora_aprovacao: number }
const FALTANDO = 'Faltando quem gerou ou aprovou'
const TODAS = 'Todas as fichas'
const VAZIO = '—'
const chave = (f: Ficha) => `${f.prefixo}|${f.pesagem}|${f.revisao}`

export default function GerouAprovou() {
  const { dados, erro, carregando, recarregar } = useDados<Dados>(() => api.get('/api/gerou-aprovou'), [])
  const [mostrar, setMostrar] = useState(FALTANDO)
  const [aeronaves, setAeronaves] = useState<string[]>([])
  const [pendentes, setPendentes] = useState<Record<string, { gerado_por?: string | null; aprovado_por?: string | null }>>({})
  const [lote, setLote] = useState<{ g: string; a: string }>({ g: '', a: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const acao = useAcao()

  // Rótulo de cada usuário: o nome; se dois tiverem o mesmo nome, o login vai junto.
  const { rotulo, opcoes } = useMemo(() => {
    const r: Record<string, string> = {}
    const usuarios = dados?.usuarios || []
    const nomes = usuarios.map((u) => u.nome || u.usuario)
    usuarios.forEach((u, i) => { r[u.usuario] = nomes.filter((n) => n === nomes[i]).length > 1 ? `${nomes[i]} (${u.usuario})` : nomes[i] })
    for (const f of dados?.fichas || []) for (const v of [f.gerado_por, f.aprovado_por]) if (v && !r[v]) r[v] = `${v} (sem cadastro)`
    const logins = Object.keys(r).sort((a, b) => r[a].localeCompare(r[b], 'pt-BR', { sensitivity: 'base' }))
    return { rotulo: r, opcoes: logins }
  }, [dados])

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  if (!dados) return null
  const valor = (f: Ficha, campo: 'gerado_por' | 'aprovado_por') => {
    const p = pendentes[chave(f)]
    return p && campo in p ? p[campo] ?? null : f[campo]
  }
  let filtradas = dados.fichas
  if (mostrar === FALTANDO) filtradas = filtradas.filter((f) => !f.gerado_por || !f.aprovado_por)
  if (aeronaves.length) filtradas = filtradas.filter((f) => aeronaves.includes(f.prefixo))
  const mudancas = dados.fichas.filter((f) => valor(f, 'gerado_por') !== f.gerado_por || valor(f, 'aprovado_por') !== f.aprovado_por)
  const alterar = (f: Ficha, campo: 'gerado_por' | 'aprovado_por', v: string | null) =>
    setPendentes((p) => ({ ...p, [chave(f)]: { ...p[chave(f)], [campo]: v } }))
  const preencherLote = () => setPendentes((p) => {
    const novo = { ...p }
    for (const f of filtradas) {
      const item = { ...novo[chave(f)] }
      if (lote.g && !valor(f, 'gerado_por')) item.gerado_por = lote.g
      if (lote.a && !valor(f, 'aprovado_por')) item.aprovado_por = lote.a
      novo[chave(f)] = item
    }
    return novo
  })
  const seletor = (f: Ficha, campo: 'gerado_por' | 'aprovado_por') => (
    <select className="celula" value={valor(f, campo) || ''} onChange={(e) => alterar(f, campo, e.target.value || null)}>
      <option value="">{VAZIO}</option>
      {opcoes.map((o) => <option key={o} value={o}>{rotulo[o]}</option>)}
    </select>
  )
  return (
    <div>
      <Cabecalho titulo="Gerou e aprovou" subtitulo="Informe quem gerou e quem aprovou as fichas que vieram do banco antigo sem esse registro." />
      {msg && <Aviso tipo="success">{msg}</Aviso>}
      <div className="grade g3">
        <Metrica rotulo="Fichas" valor={dados.fichas.length} />
        <Metrica rotulo="Sem quem gerou" valor={dados.fichas.filter((f) => !f.gerado_por).length} />
        <Metrica rotulo="Sem quem aprovou" valor={dados.fichas.filter((f) => !f.aprovado_por).length} />
      </div>
      {dados.fora_aprovacao > 0 && <Legenda>{dados.fora_aprovacao} fichas que aguardavam aprovação em 21/10/2026 não aparecem na tela Aprovação: são resolvidas só aqui.</Legenda>}
      <div className="grade" style={{ gridTemplateColumns: '1fr 1.4fr', marginTop: '.6rem' }}>
        <Radio rotulo="Mostrar" horizontal opcoes={[FALTANDO, TODAS]} valor={mostrar} mudar={setMostrar} />
        <MultiSelecao rotulo="Aeronaves" valor={aeronaves} opcoes={[...new Set(dados.fichas.map((f) => f.prefixo))].sort()} mudar={setAeronaves} placeholder="Todas" />
      </div>
      <Expansor titulo="Preencher várias fichas de uma vez">
        <Legenda>Coloca a pessoa escolhida só nos campos vazios das fichas listadas abaixo. Nada é gravado até você clicar em Salvar.</Legenda>
        <div className="grade fim" style={{ gridTemplateColumns: '1fr 1fr .8fr' }}>
          <Selecao rotulo="Gerou" valor={lote.g} opcoes={['', ...opcoes]} rotulos={(o) => (o ? rotulo[o] : 'Não alterar')} mudar={(v) => setLote({ ...lote, g: v })} />
          <Selecao rotulo="Aprovou" valor={lote.a} opcoes={['', ...opcoes]} rotulos={(o) => (o ? rotulo[o] : 'Não alterar')} mudar={(v) => setLote({ ...lote, a: v })} />
          <div className="campo"><Botao cheio disabled={!filtradas.length || !(lote.g || lote.a)} onClick={preencherLote}>Preencher {filtradas.length} fichas</Botao></div>
        </div>
      </Expansor>
      {!filtradas.length ? <Aviso tipo="success">Nenhuma ficha faltando quem gerou ou aprovou nesta seleção.</Aviso> : (
        <div className="tabela-caixa" style={{ maxHeight: 560 }}>
          <table className="tabela">
            <thead><tr><th>Aeronave</th><th>Pesagem</th><th>Revisão</th><th>Data da pesagem</th><th>Gerou</th><th>Aprovou</th></tr></thead>
            <tbody>
              {filtradas.map((f) => (
                <tr key={chave(f)}>
                  <td>{f.prefixo}</td><td>{f.pesagem}</td><td>{f.revisao}</td>
                  <td>{f.data ? new Date(f.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}</td>
                  <td style={{ minWidth: 200 }}>{seletor(f, 'gerado_por')}</td><td style={{ minWidth: 200 }}>{seletor(f, 'aprovado_por')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="linha-botoes" style={{ marginTop: '.8rem' }}>
        <Botao tipo="primario" disabled={!mudancas.length} ocupado={acao.ocupado} onClick={() => acao.rodar(async () => {
          const r = await api.post('/api/gerou-aprovou', mudancas.map((f) => ({
            prefixo: f.prefixo, pesagem: f.pesagem, revisao: f.revisao,
            gerado_por: valor(f, 'gerado_por'), aprovado_por: valor(f, 'aprovado_por'),
          })))
          setMsg(r.mensagem)
          setPendentes({})
          await recarregar()
        })}>{mudancas.length ? `Salvar ${mudancas.length} fichas` : 'Salvar'}</Botao>
        <Botao disabled={!mudancas.length} onClick={() => setPendentes({})}>Descartar alterações</Botao>
        {mudancas.length > 0 && <span className="caption" style={{ margin: 0 }}>{mudancas.length} fichas com alterações ainda não salvas.</span>}
      </div>
      <Erro erro={acao.erro} />
    </div>
  )
}
