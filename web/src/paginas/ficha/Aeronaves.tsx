import { useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Cabecalho, Carregando, Erro, Expansor, Legenda, Numero, Selecao, Tabela, Texto, useAcao, useDados } from '../../componentes/ui'

type Dados = {
  modelos: { modelo: string; armnose: number }[]
  cadastradas: { prefixo: string; modelo: string; serial: string; vrbl: string; line: string; armnose: number; cadastrado_por: string; removivel: boolean }[]
}

export default function Aeronaves() {
  const { dados, erro, carregando, recarregar } = useDados<Dados>(() => api.get('/api/aeronaves'), [])
  const [modelo, setModelo] = useState('')
  const [f, setF] = useState({ prefixo: '', serial: '', vrbl: '', line: '' })
  const [armnose, setArmnose] = useState<number | null>(93)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [remover, setRemover] = useState<string | null>(null)
  const acao = useAcao()
  const acaoRemover = useAcao()
  const escolherModelo = (m: string) => {
    setModelo(m)
    setArmnose(dados?.modelos.find((x) => x.modelo === m)?.armnose ?? 93)
  }
  const cadastrar = () => acao.rodar(async () => {
    setSucesso(null)
    const r = await api.post('/api/aeronaves', { ...f, modelo, armnose: armnose ?? 93 })
    setSucesso(r.mensagem)
    setF({ prefixo: '', serial: '', vrbl: '', line: '' })
    await recarregar()
  })
  const removiveis = (dados?.cadastradas || []).filter((a) => a.removivel).map((a) => a.prefixo)
  return (
    <div>
      <Cabecalho titulo="Aeronaves" subtitulo="Cadastre aeronaves que ainda não estão na frota do sistema." />
      <Legenda>A aeronave cadastrada aparece na lista de Nova ficha. O modelo define o momento do flap sugerido na primeira ficha, a partir das fichas de outras aeronaves do mesmo modelo.</Legenda>
      {carregando && !dados ? <Carregando /> : erro ? <Erro erro={erro} /> : dados && (
        <>
          <Selecao rotulo="Modelo da aeronave" valor={modelo} opcoes={['', ...dados.modelos.map((m) => m.modelo)]} rotulos={(v) => v || ' '} mudar={escolherModelo} />
          <form className="vidro" style={{ borderRadius: 10 }} onSubmit={(e) => { e.preventDefault(); cadastrar() }}>
            <div className="grade g2">
              <Texto rotulo="Prefixo" valor={f.prefixo} mudar={(v) => setF({ ...f, prefixo: v })} placeholder="PR-XXX" />
              <Texto rotulo="Serial number (MSN)" valor={f.serial} mudar={(v) => setF({ ...f, serial: v })} />
            </div>
            <div className="grade g3">
              <Texto rotulo="VRBL number" valor={f.vrbl} mudar={(v) => setF({ ...f, vrbl: v })} />
              <Texto rotulo="Line number" valor={f.line} mudar={(v) => setF({ ...f, line: v })} />
              <Numero key={modelo} rotulo="Arm nose (in)" valor={armnose} mudar={setArmnose} ajuda="Sugerido a partir das outras aeronaves do mesmo modelo." />
            </div>
            <Botao tipo="primario" submit ocupado={acao.ocupado}>Cadastrar aeronave</Botao>
            <Erro erro={acao.erro} />
          </form>
          {sucesso && <Aviso tipo="success">{sucesso}</Aviso>}
          <hr />
          <h3>Aeronaves cadastradas pelo app</h3>
          {!dados.cadastradas.length ? <Aviso>Nenhuma aeronave cadastrada pelo app ainda.</Aviso> : (
            <>
              <Tabela linhas={dados.cadastradas} colunas={[
                { chave: 'prefixo', titulo: 'Prefixo' }, { chave: 'modelo', titulo: 'Modelo' }, { chave: 'serial', titulo: 'Serial' },
                { chave: 'vrbl', titulo: 'VRBL' }, { chave: 'line', titulo: 'Line' }, { chave: 'armnose', titulo: 'Arm nose', numero: true },
                { chave: 'cadastrado_por', titulo: 'Cadastrado por' },
              ]} />
              {removiveis.length > 0 && (
                <Expansor titulo="Remover aeronave cadastrada por engano">
                  <Legenda>Só é possível remover aeronaves que ainda não têm ficha.</Legenda>
                  <Selecao rotulo="Aeronave" valor={remover && removiveis.includes(remover) ? remover : removiveis[0]} opcoes={removiveis} mudar={setRemover} />
                  <Botao ocupado={acaoRemover.ocupado} onClick={() => acaoRemover.rodar(async () => {
                    const alvo = remover && removiveis.includes(remover) ? remover : removiveis[0]
                    await api.del(`/api/aeronaves/${encodeURIComponent(alvo)}`)
                    await recarregar()
                  })}>Remover aeronave</Botao>
                  <Erro erro={acaoRemover.erro} />
                </Expansor>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
