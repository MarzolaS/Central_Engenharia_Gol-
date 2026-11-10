// Gráficos da frota: a tela do app.py (Altair, contas e textos) gravada pela API.
import { TelaGravada } from '../../componentes/TelaGravada'

export default function Graficos() {
  return <TelaGravada caminho="/api/graficos/tela" />
}
