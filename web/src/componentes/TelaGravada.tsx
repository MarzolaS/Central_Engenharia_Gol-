// Desenha uma tela do app.py gravada pela API (árvore de blocos: colunas, abas,
// quadros, gráficos, tabelas e campos). Mudar um campo pede a tela de novo com
// os valores escolhidos, como o Streamlit faz ao redesenhar.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api'
import { Grafico } from './Grafico'
import { salvarBlob } from '../api'
import {
  Abas, Aviso, Botao, Carregando, Chave, Erro, Expansor, Marcar, Markdown, Metrica, MultiSelecao, Radio,
  Selecao, Campo, textoErro, useAba, dataBr,
} from './ui'

type Bloco = { tipo: string; filhos?: Bloco[]; [k: string]: any }
type Valores = Record<string, unknown>
type Ctx = { valores: Valores; mudar: (chave: string, valor: unknown, botao?: boolean) => void; ocupado: boolean }

export function TelaGravada({ caminho }: { caminho: string }) {
  const [valores, setValores] = useState<Valores>({})
  const [blocos, setBlocos] = useState<Bloco[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const pedido = useRef(0)

  const pedir = useCallback(async (v: Valores) => {
    const n = ++pedido.current
    setOcupado(true)
    try {
      const r = await api.post<{ blocos: Bloco[] }>(caminho, { valores: v })
      if (n === pedido.current) { setBlocos(r.blocos); setErro(null) }
    } catch (e) {
      if (n === pedido.current) setErro(textoErro(e))
    } finally {
      if (n === pedido.current) setOcupado(false)
    }
  }, [caminho])

  useEffect(() => { pedir({}) }, [pedir])

  const mudar = useCallback((chave: string, valor: unknown, botao?: boolean) => {
    if (botao) {
      // Botão vale só para um redesenho, como no Streamlit.
      pedir({ ...valores, [chave]: true })
      return
    }
    const novos = { ...valores, [chave]: valor }
    setValores(novos)
    pedir(novos)
  }, [valores, pedir])

  if (!blocos) return erro ? <Erro erro={erro} /> : <Carregando />
  return (
    <div style={{ opacity: ocupado ? 0.6 : 1, transition: 'opacity .2s' }}>
      {erro && <Erro erro={erro} />}
      <Arvore blocos={blocos} ctx={{ valores, mudar, ocupado }} caminho="t" />
    </div>
  )
}

function Arvore({ blocos, ctx, caminho }: { blocos: Bloco[]; ctx: Ctx; caminho: string }) {
  return <>{blocos.map((b, i) => <Um key={i} b={b} ctx={ctx} caminho={`${caminho}.${i}`} />)}</>
}

function Um({ b, ctx, caminho }: { b: Bloco; ctx: Ctx; caminho: string }): ReactNode {
  const filhos = b.filhos || []
  switch (b.tipo) {
    case 'html':
      return <div className="html-bloco" dangerouslySetInnerHTML={{ __html: b.conteudo }} />
    case 'markdown':
      return <Markdown texto={b.conteudo} />
    case 'caption':
      return <div className="caption"><Markdown texto={b.conteudo} /></div>
    case 'aviso':
      return <Aviso tipo={b.nivel}><Markdown texto={b.conteudo} /></Aviso>
    case 'metric':
      return <Metrica rotulo={b.rotulo} valor={b.valor} delta={b.delta} />
    case 'vega':
      return b.spec ? <Grafico spec={b.spec} /> : null
    case 'tabela':
      return <TabelaGravada b={b} />
    case 'download':
      return (
        <Botao icone="download" onClick={() => {
          const bytes = Uint8Array.from(atob(b.dados), (c) => c.charCodeAt(0))
          salvarBlob(new Blob([bytes], { type: b.mime }), b.nome)
        }}>{b.rotulo}</Botao>
      )
    case 'colunas': {
      const pesos: number[] = b.pesos || filhos.map(() => 1)
      return (
        <div className="grade colunas-gravadas" style={{ gridTemplateColumns: pesos.map((p) => `minmax(0, ${p}fr)`).join(' ') }}>
          {filhos.map((f, i) => <div key={i} className="coluna-gravada"><Arvore blocos={f.filhos || []} ctx={ctx} caminho={`${caminho}.${i}`} /></div>)}
        </div>
      )
    }
    case 'abas':
      return <AbasGravadas b={b} ctx={ctx} caminho={caminho} />
    case 'container':
      return b.borda
        ? <div className="vidro" style={{ marginBottom: '1rem' }}><Arvore blocos={filhos} ctx={ctx} caminho={caminho} /></div>
        : <div><Arvore blocos={filhos} ctx={ctx} caminho={caminho} /></div>
    case 'expander':
      return <Expansor titulo={b.titulo} aberto={b.aberto}><Arvore blocos={filhos} ctx={ctx} caminho={caminho} /></Expansor>
    case 'campo':
      return <CampoGravado b={b} ctx={ctx} />
    case 'botao':
      return (
        <div style={{ margin: '.3rem 0 .8rem' }}>
          <Botao tipo={b.primario ? 'primario' : 'secundario'} ocupado={ctx.ocupado} onClick={() => ctx.mudar(b.chave, true, true)}>{b.rotulo}</Botao>
        </div>
      )
    default:
      return filhos.length ? <Arvore blocos={filhos} ctx={ctx} caminho={caminho} /> : null
  }
}

function AbasGravadas({ b, ctx, caminho }: { b: Bloco; ctx: Ctx; caminho: string }) {
  const rotulos: string[] = b.rotulos || []
  const [ativa, mudar] = useAba(`gravada_${rotulos.join('|')}`, rotulos)
  const i = Math.max(0, rotulos.indexOf(ativa))
  const filho = (b.filhos || [])[i]
  return (
    <>
      <Abas abas={rotulos} ativa={ativa} mudar={mudar} />
      {filho && <Arvore blocos={filho.filhos || []} ctx={ctx} caminho={`${caminho}.${i}`} />}
    </>
  )
}

function CampoGravado({ b, ctx }: { b: Bloco; ctx: Ctx }) {
  const opcoes: string[] = b.opcoes || []
  const textos: string[] = b.textos || opcoes
  const rotulo = (v: string) => textos[opcoes.indexOf(v)] ?? v
  const mudar = (v: unknown) => ctx.mudar(b.chave, v)
  switch (b.widget) {
    case 'pills': {
      const valor: string[] = b.multi ? (b.valor || []) : (b.valor == null ? [] : [b.valor])
      return (
        <Campo rotulo={b.rotulo}>
          <div className="pilulas">
            {opcoes.map((o) => {
              const ativo = valor.includes(o)
              return (
                <button key={o} type="button" className={`pilula${ativo ? ' ativa' : ''}`} onClick={() => {
                  if (b.multi) mudar(ativo ? valor.filter((x) => x !== o) : opcoes.filter((x) => x === o || valor.includes(x)))
                  else mudar(ativo ? null : o)
                }}>{rotulo(o)}</button>
              )
            })}
          </div>
        </Campo>
      )
    }
    case 'segmentado':
    case 'radio':
      return <Radio rotulo={b.rotulo} opcoes={opcoes} valor={b.valor ?? ''} mudar={mudar} horizontal={b.horizontal || b.widget === 'segmentado'} rotulos={rotulo} />
    case 'selectbox':
      return <Selecao rotulo={b.rotulo} opcoes={opcoes} valor={b.valor ?? ''} mudar={mudar} rotulos={rotulo} />
    case 'multiselect':
      return <MultiSelecao rotulo={b.rotulo} opcoes={opcoes} valor={b.valor || []} mudar={mudar} placeholder={b.placeholder || 'Escolha'} />
    case 'toggle':
      return <div style={{ margin: '.4rem 0 .8rem' }}><Chave rotulo={b.rotulo} valor={!!b.valor} mudar={mudar} disabled={b.desabilitado} /></div>
    case 'checkbox':
      return <Marcar rotulo={b.rotulo} valor={!!b.valor} mudar={mudar} disabled={b.desabilitado} />
    default:
      return null
  }
}

// st.dataframe com os formatos de column_config ("%.1f", "DD/MM/YYYY").
function TabelaGravada({ b }: { b: Bloco }) {
  const colunas: { nome: string; rotulo: string; tipo?: string; formato?: string }[] = b.colunas || []
  const linhas: unknown[][] = b.linhas || []
  return (
    <div className="tabela-caixa" style={{ maxHeight: 420 }}>
      <table className="tabela">
        <thead><tr>{colunas.map((c) => <th key={c.nome}>{c.rotulo}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>{colunas.map((c, j) => <td key={c.nome} className={typeof l[j] === 'number' ? 'num' : ''}>{celula(l[j], c)}</td>)}</tr>
          ))}
          {!linhas.length && <tr><td colSpan={colunas.length} className="mudo centro">Sem linhas.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function celula(v: unknown, c: { tipo?: string; formato?: string }): ReactNode {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'boolean') return v ? '✓' : ''
  if (typeof v === 'number') {
    const m = c.formato?.match(/%\.(\d+)f/)
    const casas = m ? Number(m[1]) : undefined
    return v.toLocaleString('pt-BR', casas !== undefined
      ? { minimumFractionDigits: casas, maximumFractionDigits: casas }
      : { maximumFractionDigits: 4 })
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    if (c.tipo === 'data' || /T00:00:00/.test(v) || v.length === 10) return dataBr(v.slice(0, 10))
    return new Date(v).toLocaleString('pt-BR')
  }
  return String(v)
}
