// Ficha gravada: abas Dados Gerais, Células, Deductions, Additions e Weighing Report.
// Na aprovação cada campo ganha a caixa "Erro" para devolver ao emissor.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, baixar } from '../../api'
import { useSessao } from '../../sessao'
import {
  Abas, Aviso, Botao, Carregando, Erro, Expansor, Legenda, Marcar, Metrica, Tabela, useAcao, useDados, useToast,
} from '../../componentes/ui'

type CampoV = { campo: string; rotulo: string; valor: string; permitir_erro: boolean }
type ItemV = { indice: number; descricao: string; peso: number; braco: number; campo: string; campos: string[] }
export type Visualizacao = {
  dados_gerais: CampoV[][]; boeing: boolean; boeing_campos?: CampoV[]; boeing_bracos?: CampoV[]; boeing_legenda?: string
  pesagens?: { titulo: string; celulas: CampoV[] }[]; canelas?: CampoV[]; deducoes: ItemV[]; adicoes: ItemV[]
}
export type LinhaRelatorio = { item: string; peso: number; braco: number; momento: number }
export type Calculo = { relatorio: LinhaRelatorio[]; peso_basico: number; braco_basico: number; cg_mac: number }
type DadosFicha = {
  prefixo: string; pesagem: string; revisao: string; visualizacao: Visualizacao; calculo: Calculo
  fluxo: { gerador_nome: string; aprovador_nome: string; gerador_usuario: string }
  historico: Record<string, unknown>[] | null; campos_com_erro: { campo: string; descricao: string }[]
  pode_aprovar: boolean; eh_emissor: boolean
}

export const fmt = (v: number, casas: number) =>
  (v ?? 0).toLocaleString('en-US', { minimumFractionDigits: casas, maximumFractionDigits: casas })

export function RelatorioPesagem({ calculo }: { calculo: Calculo }) {
  return (
    <>
      <div className="grade g3" style={{ marginBottom: '.8rem' }}>
        <Metrica rotulo="Aircraft Basic Weight" valor={`${fmt(calculo.peso_basico, 2)} kgf`} />
        <Metrica rotulo="Aircraft Basic Arm" valor={`${fmt(calculo.braco_basico, 4)} in`} />
        <Metrica rotulo="C.G. (% MAC)" valor={`${(calculo.cg_mac ?? 0).toFixed(2)} %`} />
      </div>
      <Tabela linhas={calculo.relatorio} colunas={[
        { chave: 'item', titulo: 'Reaction / Item' },
        { chave: 'peso', titulo: 'Weight (kgf)', numero: true, formato: (v) => (v ?? 0).toFixed(2) },
        { chave: 'braco', titulo: 'Arm (inch)', numero: true, formato: (v) => (v ?? 0).toFixed(4) },
        { chave: 'momento', titulo: 'Moment (kgf x inch)', numero: true, formato: (v) => fmt(v, 2) },
      ]} />
    </>
  )
}

// Caixa de total ao lado das células (como na ficha manual).
export function CaixaTotal({ valor, espaco }: { valor: number; espaco: number }) {
  return (
    <div>
      <div style={{ height: espaco }} />
      <div style={{ fontSize: '.875rem', marginBottom: 6 }}>Total</div>
      <div style={{ border: '1px solid #C9CED6', borderRadius: 8, padding: '8px 12px', background: '#FFF4EC', fontWeight: 700, minHeight: 40 }}>
        {Math.round(valor || 0).toLocaleString('pt-BR')}
      </div>
    </div>
  )
}

// Grade das 6 células: 0 Nariz LH, 1 Nariz RH, 2 RH MLG 1, 3 RH MLG 2, 4 LH MLG 1, 5 LH MLG 2.
export function GradeCelulas({ render, valores }: { render: (i: number) => ReactNode; valores: number[] }) {
  return (
    <div className="grade g4">
      <div><div style={{ height: 75 }} />{render(0)}{render(1)}</div>
      <CaixaTotal valor={(valores[0] || 0) + (valores[1] || 0)} espaco={112} />
      <div>{render(2)}{render(3)}{render(4)}{render(5)}</div>
      <div><CaixaTotal valor={(valores[2] || 0) + (valores[3] || 0)} espaco={40} /><CaixaTotal valor={(valores[4] || 0) + (valores[5] || 0)} espaco={80} /></div>
    </div>
  )
}

export function BotoesExportacao({ prefixo, pesagem, revisao }: { prefixo: string; pesagem: string; revisao: string }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const exportar = async (tipo: 'xlsx' | 'pdf') => {
    setOcupado(tipo)
    try {
      await baixar(`/api/fichas/${encodeURIComponent(prefixo)}/${encodeURIComponent(pesagem)}/${encodeURIComponent(revisao)}/arquivo/${tipo}`, `ficha.${tipo}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setOcupado(null)
    }
  }
  return (
    <div className="grade g2" style={{ marginTop: '1rem' }}>
      <Botao cheio onClick={() => exportar('xlsx')} ocupado={ocupado === 'xlsx'}>Exportar Excel</Botao>
      <Botao cheio onClick={() => exportar('pdf')} ocupado={ocupado === 'pdf'}>{ocupado === 'pdf' ? 'Gerando o PDF…' : 'Exportar PDF'}</Botao>
    </div>
  )
}

const num = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isNaN(n) ? 0 : n }

export default function FichaVisualizacao({ prefixo, pesagem, revisao, modoAprovacao = false, destacarErros = false, aoAprovar, versao = 0 }: {
  prefixo: string; pesagem: string; revisao: string; modoAprovacao?: boolean; destacarErros?: boolean
  aoAprovar?: () => void; versao?: number
}) {
  const caminho = `/api/fichas/${encodeURIComponent(prefixo)}/${encodeURIComponent(pesagem)}/${encodeURIComponent(revisao)}`
  const { dados, erro, carregando, recarregar } = useDados<DadosFicha>(() => api.get(caminho), [caminho, versao])
  const [aba, setAba] = useState('Dados Gerais')
  const [marcados, setMarcados] = useState<Record<string, string>>({})
  const [conferiu, setConferiu] = useState(false)
  const acao = useAcao()
  const toast = useToast()
  const emitir = !!useSessao().sessao?.permissoes.emitir

  const sinalizados = useMemo(() => new Set((dados?.campos_com_erro || []).map((c) => c.campo)), [dados])
  useEffect(() => {
    if (!dados) return
    const v = dados.visualizacao
    const rotulos: Record<string, string> = {}
    const todos = [...v.dados_gerais.flat(), ...(v.boeing_campos || []), ...(v.boeing_bracos || []),
      ...(v.pesagens || []).flatMap((p) => p.celulas), ...(v.canelas || [])]
    for (const c of todos) if (sinalizados.has(c.campo) && c.permitir_erro) rotulos[c.campo] = `${c.rotulo}: ${c.valor}`
    for (const [tipo, lista] of [['Deductions', v.deducoes], ['Additions', v.adicoes]] as const) {
      for (const i of lista) if (i.campos.some((c) => sinalizados.has(c))) rotulos[i.campo] = `${tipo} item ${i.indice}: ${i.descricao}`
    }
    setMarcados(rotulos)
    setConferiu(false)
  }, [dados, sinalizados])

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  if (!dados) return null
  const v = dados.visualizacao
  const fluxo = dados.fluxo
  const pendentes = dados.campos_com_erro

  const marcar = (c: string, rotulo: string, ligado: boolean) => setMarcados((m) => {
    const novo = { ...m }
    if (ligado) novo[c] = rotulo
    else delete novo[c]
    return novo
  })

  const mostrar = (c: CampoV, chave?: string | number) => {
    const comErro = modoAprovacao && c.permitir_erro
    const marcado = !!marcados[c.campo]
    return (
      <div key={chave ?? c.campo} style={comErro ? { display: 'grid', gridTemplateColumns: '5fr 1fr', gap: '.6rem', alignItems: 'end' } : undefined}>
        <div className="campo">
          {destacarErros && sinalizados.has(c.campo) && <div style={{ color: '#D92D20', fontSize: '.9rem' }}>🔴 {c.rotulo} precisa de correção</div>}
          <label>{c.rotulo}</label>
          <input className="entrada" value={c.valor} disabled />
          {comErro && marcado && <div style={{ color: '#D92D20', fontSize: '.85rem' }}>🔴 {c.rotulo} marcado para correção</div>}
        </div>
        {comErro && <div style={{ paddingBottom: marcado ? '1.9rem' : '.6rem' }}><Marcar rotulo="Erro" valor={marcado} mudar={(x) => marcar(c.campo, `${c.rotulo}: ${c.valor}`, x)} /></div>}
      </div>
    )
  }

  const itensTabela = (tipo: 'Deductions' | 'Additions', lista: ItemV[]) => {
    if (modoAprovacao) {
      if (!lista.length) return <Legenda>Nenhum item.</Legenda>
      return (
        <Tabela linhas={lista} colunas={[
          { chave: 'indice', titulo: '#' },
          { chave: 'descricao', titulo: 'Descrição', formato: (d, l) => <>{d}{marcados[l.campo] && <div style={{ color: '#D92D20', fontSize: '.85rem' }}>🔴 marcado para correção</div>}</> },
          { chave: 'peso', titulo: 'Peso (kgf)', numero: true, formato: (x) => fmt(x, 2) },
          { chave: 'braco', titulo: 'Braço (in)', numero: true, formato: (x) => fmt(x, 2) },
          { chave: 'momento', titulo: 'Momento', numero: true, formato: (_, l) => fmt(l.peso * l.braco, 2) },
          { chave: 'erro', titulo: 'Erro', formato: (_, l) => <input type="checkbox" style={{ accentColor: 'var(--laranja)' }} checked={!!marcados[l.campo]}
            onChange={(e) => marcar(l.campo, `${tipo} item ${l.indice}: ${l.descricao}`, e.target.checked)} /> },
        ]} />
      )
    }
    if (!lista.length) return null
    return (
      <Tabela linhas={lista} colunas={[
        { chave: 'descricao', titulo: 'Descrição' },
        { chave: 'peso', titulo: 'Peso [kgf]', numero: true, formato: (x) => fmt(x, 2) },
        { chave: 'braco', titulo: 'Arm [pol]', numero: true, formato: (x) => fmt(x, 2) },
      ]} />
    )
  }

  const enviarCorrecao = (campos: Record<string, string>) => acao.rodar(async () => {
    const r = await api.post(`${caminho}/devolver`, { campos })
    toast(r.mensagem, 'success')
    await recarregar()
  })
  const aprovar = () => acao.rodar(async () => {
    const r = await api.post(`${caminho}/aprovar`)
    toast(r.mensagem, 'success')
    aoAprovar?.()
  })

  const selecionados = Object.keys(marcados).length
  const podeAprovar = dados.pode_aprovar && !selecionados

  return (
    <div>
      <h3 style={{ margin: '0 0 .2rem', fontSize: '1.5rem' }}>{prefixo} · Pesagem {dados.pesagem} · Revisão {dados.revisao}</h3>
      <Legenda>Emissor (responsável, último a gerar ou editar): {fluxo.gerador_nome} | Aprovada por: {fluxo.aprovador_nome}</Legenda>
      {dados.historico !== null && (
        <Expansor titulo="Histórico de alterações">
          {dados.historico.length
            ? <Tabela linhas={dados.historico} colunas={Object.keys(dados.historico[0]).map((k) => ({ chave: k, titulo: k }))} />
            : <Legenda>Nenhuma alteração registrada. O histórico começa a contar a partir de 14/10/2026.</Legenda>}
        </Expansor>
      )}
      {pendentes.length > 0 && !modoAprovacao && (
        <Aviso tipo="warning">Ficha devolvida ao emissor ({fluxo.gerador_nome}) para correção: {pendentes.map((c) => c.descricao).join('; ')}</Aviso>
      )}
      <Abas abas={['Dados Gerais', 'Células de Carga', 'Deductions', 'Additions', 'Weighing Report']} ativa={aba} mudar={setAba} />

      <div style={{ display: aba === 'Dados Gerais' ? 'block' : 'none' }}>
        {v.dados_gerais.map((linha, i) => (
          <div key={i} className={`grade g${linha.length}`}>{linha.map((c) => mostrar(c))}</div>
        ))}
      </div>

      <div style={{ display: aba === 'Células de Carga' ? 'block' : 'none' }}>
        {v.boeing ? (
          <>
            <p><b>Weighing Form da Boeing (lb)</b></p>
            <div className="grade g4">
              {(v.boeing_campos || []).map((c) => mostrar(c))}
              {(v.boeing_bracos || []).map((c) => mostrar(c))}
            </div>
            <Legenda>{v.boeing_legenda}</Legenda>
          </>
        ) : (
          <>
            {(v.pesagens || []).map((p) => (
              <div key={p.titulo}>
                <p style={{ margin: '.6rem 0 .3rem' }}><b>{p.titulo}</b></p>
                <GradeCelulas render={(i) => mostrar(p.celulas[i], p.titulo + i)} valores={p.celulas.map((c) => num(c.valor))} />
              </div>
            ))}
            <p style={{ margin: '.6rem 0 .3rem' }}><b>Medidas das canelas</b></p>
            <div className="grade g2">{(v.canelas || []).map((c) => mostrar(c))}</div>
          </>
        )}
      </div>

      <div style={{ display: aba === 'Deductions' ? 'block' : 'none' }}>{itensTabela('Deductions', v.deducoes)}</div>
      <div style={{ display: aba === 'Additions' ? 'block' : 'none' }}>{itensTabela('Additions', v.adicoes)}</div>
      <div style={{ display: aba === 'Weighing Report' ? 'block' : 'none' }}>
        <RelatorioPesagem calculo={dados.calculo} />
        {modoAprovacao ? (
          <>
            <hr />
            <h3>Campos marcados para correção</h3>
            {selecionados > 0 ? (
              <>
                <ul>{Object.values(marcados).map((r) => <li key={r}>{r}</li>)}</ul>
                <Botao disabled={!emitir} onClick={() => enviarCorrecao(marcados)} ocupado={acao.ocupado}>Enviar para o emissor alterar</Botao>
              </>
            ) : pendentes.length ? (
              <>
                <Aviso>Nenhum campo está marcado. Envie a lista vazia para remover as sinalizações existentes.</Aviso>
                <Botao disabled={!emitir} onClick={() => enviarCorrecao({})} ocupado={acao.ocupado}>Limpar sinalizações</Botao>
              </>
            ) : <Legenda>Marque “Erro” ao lado dos campos que precisam de correção.</Legenda>}
            <div style={{ marginTop: '1rem' }}>
              {pendentes.length ? <Aviso tipo="error">A aprovação está bloqueada até o emissor corrigir os campos sinalizados.</Aviso>
                : dados.eh_emissor ? <Aviso tipo="warning">Quem emitiu a ficha não pode aprová-la.</Aviso>
                : !dados.pode_aprovar ? <Legenda>Seu perfil não pode aprovar fichas.</Legenda>
                : <Marcar rotulo="Confirmei os dados e o valor do C.G. (% MAC)." valor={conferiu} mudar={setConferiu} />}
            </div>
            <Erro erro={acao.erro} />
            <div className="grade g2">
              <BotoesExportacao prefixo={prefixo} pesagem={dados.pesagem} revisao={dados.revisao} />
              <div style={{ marginTop: '1rem' }}>
                <Botao tipo="primario" cheio disabled={!podeAprovar || !conferiu} onClick={aprovar} ocupado={acao.ocupado}>Aprovar ficha</Botao>
              </div>
            </div>
          </>
        ) : (
          <BotoesExportacao prefixo={prefixo} pesagem={dados.pesagem} revisao={dados.revisao} />
        )}
      </div>
    </div>
  )
}
