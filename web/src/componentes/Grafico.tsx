// Gráfico Vega-Lite (os gráficos Altair do app.py, com a mesma especificação).
import { useEffect, useRef } from 'react'
import embed, { type VisualizationSpec } from 'vega-embed'

const LOCALE_FORMATO = { decimal: ',', thousands: '.', grouping: [3], currency: ['R$', ''] }
const LOCALE_TEMPO = {
  dateTime: '%A, %e de %B de %Y. %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['AM', 'PM'],
  days: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  shortDays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  shortMonths: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
}

export function Grafico({ spec, altura }: { spec: any; altura?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !spec) return
    const completo = { ...spec, width: 'container', autosize: { type: 'fit-x', contains: 'padding' } }
    if (altura && !completo.height) completo.height = altura
    const config = { ...(completo.config || {}) }
    config.font = config.font || 'Source Sans 3, sans-serif'
    completo.config = config
    let resultado: Awaited<ReturnType<typeof embed>> | null = null
    let cancelado = false
    embed(ref.current, completo as VisualizationSpec, {
      actions: false, renderer: 'svg', formatLocale: LOCALE_FORMATO as any, timeFormatLocale: LOCALE_TEMPO as any,
      tooltip: { theme: 'light' },
    }).then((r) => { if (cancelado) r.finalize(); else resultado = r }).catch(() => {})
    return () => { cancelado = true; resultado?.finalize() }
  }, [spec, altura])
  return <div ref={ref} style={{ width: '100%' }} />
}

// Blocos gravados de uma tela só de leitura do app.py (markdown, HTML, gráfico, métrica).
export function Blocos({ blocos }: { blocos: any[] }) {
  return (
    <>
      {blocos.map((b, i) => {
        if (b.tipo === 'vega') return b.spec ? <Grafico key={i} spec={b.spec} /> : null
        if (b.tipo === 'metric') return <div key={i} className="metrica"><div className="rot">{b.rotulo}</div><div className="val">{b.valor}</div></div>
        if (b.tipo === 'caption') return <div key={i} className="caption">{b.conteudo}</div>
        return <div key={i} className="html-bloco" dangerouslySetInnerHTML={{ __html: b.conteudo }} />
      })}
    </>
  )
}
