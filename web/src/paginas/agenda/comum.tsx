// Peças comuns da Agenda (escala de plantão e férias).
import type { ReactNode } from 'react'
import { Botao } from '../../componentes/ui'

export const BASES_CRACHA_PADRAO = ['CGH', 'BSB', 'CNF', 'POA']

// Barra do calendário no estilo Google Agenda: Hoje, ‹ ›, título e a visão.
export function BarraCalendario({ aoHoje, aoAnterior, aoSeguinte, semAnterior, semSeguinte, titulo, direita }: {
  aoHoje?: () => void; aoAnterior?: () => void; aoSeguinte?: () => void; semAnterior?: boolean; semSeguinte?: boolean
  titulo: ReactNode; direita?: ReactNode
}) {
  return (
    <div className="barra-calendario">
      {aoHoje && <Botao pequeno onClick={aoHoje}>Hoje</Botao>}
      {aoAnterior && <Botao pequeno onClick={aoAnterior} disabled={semAnterior} titulo="Mês anterior">‹</Botao>}
      {aoSeguinte && <Botao pequeno onClick={aoSeguinte} disabled={semSeguinte} titulo="Mês seguinte">›</Botao>}
      <div className="titulo-mes">{titulo}</div>
      {direita && <div className="direita">{direita}</div>}
    </div>
  )
}

// Pílulas de escolha única (ou nenhuma), com a bolinha da cor de cada pessoa.
export function PilulasPessoas({ nomes, valor, mudar }: {
  nomes: { nome: string; cor: string }[]; valor: string | null; mudar: (v: string | null) => void
}) {
  return (
    <div className="pilulas" style={{ margin: '.2rem 0 .8rem' }}>
      {nomes.map(({ nome, cor }) => (
        <button key={nome} type="button" className={`pilula${valor === nome ? ' ativa' : ''}`}
          onClick={() => mudar(valor === nome ? null : nome)}>
          <span className="bola-pessoa" style={{ background: cor }} />{nome}
        </button>
      ))}
    </div>
  )
}

// Pílulas de escolha múltipla (st.pills selection_mode="multi").
export function PilulasMulti({ rotulo, opcoes, valor, mudar, textos }: {
  rotulo?: string; opcoes: string[]; valor: string[]; mudar: (v: string[]) => void; textos?: (v: string) => string
}) {
  return (
    <div className="campo">
      {rotulo && <label>{rotulo}</label>}
      <div className="pilulas">
        {opcoes.map((o) => {
          const ativo = valor.includes(o)
          return (
            <button key={o} type="button" className={`pilula${ativo ? ' ativa' : ''}`}
              onClick={() => mudar(ativo ? valor.filter((x) => x !== o) : opcoes.filter((x) => x === o || valor.includes(x)))}>
              {textos ? textos(o) : o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function lerAdiado(chave: string) {
  try { return sessionStorage.getItem(chave) === '1' } catch { return false }
}

export function adiar(chave: string) {
  try { sessionStorage.setItem(chave, '1') } catch { /* */ }
}
