// Ficha em etapas (Dados da Ficha, Células de Carga, Additions, Deductions, Level Correction, Preview).
// Mesmo fluxo do formulario_pesagem do app.py; as contas finais vêm da API.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, baixar } from '../../api'
import {
  Aviso, Botao, Busca, Carregando, DataCampo, Erro, Expansor, Legenda, Metrica, Numero, Radio, Segmentado, Selecao,
  Tabela, Texto, hojeIso, textoErro, useToast,
} from '../../componentes/ui'
import { CaixaTotal, GradeCelulas, RelatorioPesagem, fmt, type Calculo } from './FichaVisualizacao'

export type Item = { desc: string; peso: number | null; braco: number | null; slot?: number }
export type Formulario = {
  data_emissao: string | null; pesado_por: string; local: string; data_pesagem: string | null; lopa: string; config_lopa: string
  razao: string; vrbl: string; serial: string; line: string; origem_boeing: boolean; celulas: Record<string, number | null>
  boeing_lb: Record<string, number | null>; boeing_braco: Record<string, number | null>; canela_lh: number | null; canela_rh: number | null
  ultima_pesagem_informada: string; ultima_revisao_informada: string; deducoes: Item[]; adicoes: Item[]; angulo: string
}
export type Opcoes = {
  presets: Record<string, string[]>; angulos: string[]; valores_angulo: Record<string, number>
  campos_boeing: [string, string][]; pode_emitir: boolean
}

export const PASSOS = ['Dados da Ficha', 'Células de Carga', 'Additions', 'Deductions', 'Level Correction', 'Preview']
const OPCAO_GOL = 'Pesagem GOL (células de carga em kgf)'
const OPCAO_BOEING = 'Weighing Form da Boeing (em lb)'
const LB_PARA_KGF = 0.45359237
const BASE_BOEING = 705.28
const FATOR_CANELA = 0.1304
const CELULAS_P1: [string, string][] = [
  ['Peso nariz LH', 'Nariz LH'], ['Peso Nariz RH', 'Nariz RH'], ['Peso MLG RH 1 ', 'RH MLG 1'],
  ['Peso MLG RH 2', 'RH MLG 2'], ['Peso MLG LH 1', 'LH MLG 1'], ['Peso MLG LH2', 'LH MLG 2'],
]
const CELULAS_P2: [string, string][] = [
  ['Peso nariz LH pesagem 2', 'Nariz LH P2'], ['Peso Nariz RH pesagem 2', 'Nariz RH P2'], ['Peso MLG RH 1  pesagem 2', 'RH MLG 1 P2'],
  ['Peso MLG RH 2 pesagem 2', 'RH MLG 2 P2'], ['Peso MLG LH 1 pesagem 2', 'LH MLG 1 P2'], ['Peso MLG LH2 pesagem 2', 'LH MLG 2 P2'],
]
// Colunas reais com nome alternativo em fichas antigas (para mostrar "Corrigir" no campo certo).
const ALTERNATIVOS: Record<string, string[]> = {
  'Peso MLG RH 1 ': ['Peso MLG RH 1'], 'Peso MLG LH 1': ['Peso MLG LH 1 '], 'Peso MLG RH 2': ['Peso MLG RH 2 '],
  'Peso MLG LH2': ['Peso MLG LH 2'], 'Peso MLG RH 1  pesagem 2': ['Peso MLG RH 1 pesagem 2'],
}
const n = (v: number | null | undefined) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0)

// Pesos das 6 células da pesagem 1 em kgf, como serão gravados (Boeing: convertidos).
function celulasPesagem1(f: Formulario, campos: [string, string][]) {
  if (f.origem_boeing) {
    const kgf = campos.map(([c]) => n(f.boeing_lb[c]) * LB_PARA_KGF)
    const [lhOb, lhIb, rhIb, rhOb, nariz] = kgf
    return [nariz / 2, nariz / 2, rhOb, rhIb, lhOb, lhIb]
  }
  return CELULAS_P1.map(([c]) => n(f.celulas[c]))
}

export function avisoCelulas(f: Formulario, campos: [string, string][], base: Formulario | null) {
  const atuais = celulasPesagem1(f, campos)
  if (atuais.reduce((a, b) => a + b, 0) <= 0) return 'vazias'
  if (base) {
    const antes = celulasPesagem1(base, campos)
    if (atuais.every((v, i) => Math.abs(v - antes[i]) < 1e-9)) return 'iguais às da pesagem anterior'
  }
  return null
}

function comPadroes(f: Formulario, pesagem: number, revisao: number): Formulario {
  // Só a pesagem 1 pode vir da Boeing (avião novo); a partir da 2 é sempre célula GOL.
  const digitadas = CELULAS_P1.some(([c]) => n(f.celulas[c]))
  const boeing = pesagem === 1 && (f.origem_boeing || (revisao === 0 && !digitadas))
  return {
    ...f,
    origem_boeing: boeing,
    data_emissao: f.data_emissao || hojeIso(),
    data_pesagem: f.data_pesagem || hojeIso(),
    deducoes: f.deducoes.length ? f.deducoes : [{ desc: 'Fuel (Usable)', peso: 0, braco: 660.5 }],
    adicoes: f.adicoes.length ? f.adicoes : [{ desc: 'Flaps 0 - 40° (up when weighed)', peso: 0, braco: 0 }],
  }
}

export type PropsFormulario = {
  prefixo: string; pesagem: number; revisao: number; pesagemAnterior: number; revisaoAnterior: number
  inicial: Formulario; opcoes: Opcoes; armnose: number; momentoFlaps: number
  modo: 'nova' | 'anterior' | 'correcao' | 'edicao'; basePesagem?: number | null; baseRevisao?: number | null
  camposComErro?: Set<string>; checarCelulas: boolean; baseCelulas?: Formulario | null
  rotuloSalvar: string; bloquearSalvar?: boolean; aoSalvar: (mensagem: string) => void; topo?: ReactNode
}

export default function FormularioFicha(p: PropsFormulario) {
  const toast = useToast()
  const [f, setF] = useState<Formulario>(() => comPadroes(p.inicial, p.pesagem, p.revisao))
  const [passo, setPasso] = useState(0)
  const [unidade, setUnidade] = useState<'in' | 'mm'>('in')
  const [confirmadas, setConfirmadas] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ calculo: Calculo; aviso_celulas: string | null; ja_existe: boolean } | null>(null)
  const [erroPreview, setErroPreview] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [exportando, setExportando] = useState<string | null>(null)
  const [presets, setPresets] = useState(p.opcoes.presets)
  const topo = useRef<HTMLDivElement>(null)
  const erros = p.camposComErro || new Set<string>()
  const temErro = (campo: string) => erros.has(campo) || (ALTERNATIVOS[campo] || []).some((c) => erros.has(c))
  const rotulo = (campo: string, texto: string) => (
    temErro(campo) ? <>{texto}<span style={{ color: '#D92D20', display: 'block', fontSize: '.85rem' }}>🔴 Corrigir: {texto}</span></> : texto
  )
  const campos = p.opcoes.campos_boeing
  const muda = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }))

  const valoresCelulas = JSON.stringify(celulasPesagem1(f, campos))
  const aviso = p.checarCelulas ? avisoCelulas(f, campos, p.baseCelulas || null) : null
  const celulasPendentes = !!aviso && confirmadas !== valoresCelulas

  useEffect(() => { topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }, [passo])

  const pedido = (confirmar = false) => ({
    prefixo: p.prefixo, pesagem: p.pesagem, revisao: p.revisao, modo: p.modo, formulario: f,
    base_pesagem: p.basePesagem ?? null, base_revisao: p.baseRevisao ?? null, confirmar_celulas: confirmar,
  })

  useEffect(() => {
    if (passo !== PASSOS.length - 1) return
    let cancelado = false
    setPreview(null)
    setErroPreview(null)
    api.post('/api/emissao/calcular', pedido()).then((r) => { if (!cancelado) setPreview(r) }).catch((e) => { if (!cancelado) setErroPreview(textoErro(e)) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo])

  const novaOpcao = (categoria: string, valor: string | null) => {
    if (!valor || !p.opcoes.pode_emitir) return
    const lista = presets[categoria] || []
    if (lista.some((o) => o.toLowerCase() === valor.toLowerCase())) return
    setPresets((x) => ({ ...x, [categoria]: [...(x[categoria] || []), valor] }))
    api.post('/api/emissao/opcoes', { categoria, valor }).then((r) => { if (r?.mensagem) toast(r.mensagem, 'success') }).catch(() => {})
  }

  const preset = (campo: string, chave: keyof Formulario, texto: string, categoria: string, salvar = true) => {
    const valor = String(f[chave] || '')
    const lista = presets[categoria] || []
    const opcoes = valor && !lista.includes(valor) ? [valor, ...lista] : lista
    return (
      <Busca rotulo={rotulo(campo, texto)} valor={valor || null} opcoes={opcoes} permitirNovo placeholder="Digite ou selecione"
        mudar={(v) => { muda(chave, (v || '') as never); if (salvar) novaOpcao(categoria, v) }} />
    )
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const r = await api.post('/api/emissao/salvar', pedido(!celulasPendentes && !!aviso))
      p.aoSalvar(r.mensagem)
    } catch (e) {
      toast(textoErro(e), 'error')
    } finally {
      setSalvando(false)
    }
  }
  const exportar = async (tipo: 'xlsx' | 'pdf') => {
    setExportando(tipo)
    try {
      await baixar(`/api/emissao/arquivo/${tipo}`, `ficha.${tipo}`, 'POST', pedido())
    } catch (e) {
      toast(textoErro(e), 'error')
    } finally {
      setExportando(null)
    }
  }

  const ultimaSistema = p.pesagemAnterior > 0 ? `Pesagem ${p.pesagemAnterior}, Revisão ${p.revisaoAnterior}` : 'nenhuma'
  const fatorUnidade = unidade === 'mm' ? 25.4 : 1
  const canela = (v: number | null) => (v === null || v === undefined ? null : Math.round(v * fatorUnidade * 1e6) / 1e6)

  // ------------------------------------------------------------------ etapas
  const etapaDados = (
    <div>
      <h3>Controle de Identificação</h3>
      <div className="grade g2">
        <Texto rotulo="Número da Pesagem:" valor={String(p.pesagem)} mudar={() => {}} disabled />
        <Texto rotulo="Número da Revisão:" valor={String(p.revisao)} mudar={() => {}} disabled />
      </div>
      <Expansor titulo={`Última ficha no sistema: ${ultimaSistema}. Ela não está no sistema? Clique para informar.`} aberto={!!p.inicial.ultima_pesagem_informada}>
        <div className="grade g2">
          <Texto rotulo="Última pesagem:" valor={f.ultima_pesagem_informada} mudar={(v) => muda('ultima_pesagem_informada', v)} placeholder="Deixe em branco para usar a do sistema" />
          <Texto rotulo="Última revisão:" valor={f.ultima_revisao_informada} mudar={(v) => muda('ultima_revisao_informada', v)} placeholder="Deixe em branco para usar a do sistema" />
        </div>
      </Expansor>
      <hr />
      <div className="grade g3">
        <DataCampo rotulo={rotulo('Data da ficha', 'Data de emissão:')} valor={f.data_emissao} mudar={(v) => muda('data_emissao', v)} />
        {preset('Pesado Por', 'pesado_por', 'Pesado por:', 'pesado_por')}
        {preset('Local da pesagem', 'local', 'Local da pesagem:', 'local')}
      </div>
      <div className="grade g3">
        <DataCampo rotulo={rotulo('Data_da_Pesagem', 'Data da pesagem:')} valor={f.data_pesagem} mudar={(v) => muda('data_pesagem', v)} />
        {preset('lopa', 'lopa', 'LOPA:', 'lopa', false)}
        {preset('config_lopa', 'config_lopa', 'Configuração LOPA:', 'config_lopa', false)}
      </div>
      <div className="grade g3">
        <Texto rotulo={rotulo('VRBL', 'VRBL. NUMBER:')} valor={f.vrbl} mudar={(v) => muda('vrbl', v)} />
        <Texto rotulo={rotulo('SERIAL', 'SERIAL NUMBER:')} valor={f.serial} mudar={(v) => muda('serial', v)} />
        <Texto rotulo={rotulo('LINE', 'LINE NUMBER:')} valor={f.line} mudar={(v) => muda('line', v)} />
      </div>
      {preset('Motivo', 'razao', 'Razão para emissão:', 'motivo')}
    </div>
  )

  const linhasBoeing = useMemo(() => {
    const linhas = campos.map(([c, r], i) => {
      const lb = n(f.boeing_lb[c])
      const kgf = lb * LB_PARA_KGF
      const braco = i === 4 ? p.armnose : n(f.boeing_braco[r.includes('LH') ? 'LH' : 'RH'])
      return { ponto: r, lb, kgf, braco, momento: kgf * braco }
    })
    const totalLb = linhas.reduce((a, l) => a + l.lb, 0)
    const totalKgf = linhas.reduce((a, l) => a + l.kgf, 0)
    const momento = linhas.reduce((a, l) => a + l.momento, 0)
    return [...linhas, { ponto: 'TOTAL', lb: totalLb, kgf: totalKgf, braco: totalKgf ? momento / totalKgf : 0, momento }]
  }, [f.boeing_lb, f.boeing_braco, campos, p.armnose])

  const campoLb = (c: string, r: string) => (
    <Numero key={c} rotulo={rotulo(c, `${r} (lb)`)} valor={f.boeing_lb[c]} mudar={(v) => muda('boeing_lb', { ...f.boeing_lb, [c]: v })} />
  )
  const etapaCelulas = (
    <div>
      {p.pesagem === 1 && (
        <Radio rotulo="De onde vêm os dados da pesagem?" horizontal opcoes={[OPCAO_GOL, OPCAO_BOEING]} valor={f.origem_boeing ? OPCAO_BOEING : OPCAO_GOL}
          mudar={(v) => muda('origem_boeing', v === OPCAO_BOEING)} />
      )}
      {f.origem_boeing ? (
        <>
          <Aviso>Digite os valores da WEIGHING FORM da Boeing como estão nela: peso líquido (NET WGT) em lb. O sistema converte para kgf (1 lb = 0,45359237 kgf).</Aviso>
          <p><b>Trem principal</b></p>
          <div className="grade g4">{campos.slice(0, 4).map(([c, r]) => campoLb(c, r))}</div>
          <p><b>Braço do trem principal</b></p>
          <div className="grade g4">
            {(['LH', 'RH'] as const).flatMap((lado) => {
              const braco = f.boeing_braco[lado]
              return [
                <Numero key={lado} rotulo={rotulo(`Canela MLG ${lado}`, `Balance arm Main ${lado} (in)`)} valor={braco} placeholder="ex.: 707.9"
                  ajuda={`BALANCE ARM IN. das linhas Main ${lado} da Weighing Form da Boeing.`}
                  mudar={(v) => muda('boeing_braco', { ...f.boeing_braco, [lado]: v })} />,
                <Texto key={lado + 'dim'} rotulo={`DIM "A" ${lado} calculado (in)`} valor={braco ? ((braco - BASE_BOEING) / FATOR_CANELA).toFixed(2) : ''} mudar={() => {}} disabled />,
              ]
            })}
          </div>
          {!(n(f.boeing_braco.LH) && n(f.boeing_braco.RH)) && <Aviso tipo="warning">Digite a balance arm do trem principal LH e RH (ex.: 707.9).</Aviso>}
          <p><b>Nariz</b></p>
          <div className="grade g3">
            {campoLb(campos[4][0], campos[4][1])}
            <Texto rotulo="Balance arm Nose (in)" valor={p.armnose.toFixed(2)} mudar={() => {}} disabled ajuda="Vem do cadastro da aeronave (Aeronaves)." />
          </div>
          <p><b>Conversão para kgf</b></p>
          <Tabela linhas={linhasBoeing} colunas={[
            { chave: 'ponto', titulo: 'Ponto' },
            { chave: 'lb', titulo: 'Peso (lb)', numero: true, formato: (v) => fmt(v, 1) },
            { chave: 'kgf', titulo: 'Peso (kgf)', numero: true, formato: (v) => fmt(v, 1) },
            { chave: 'braco', titulo: 'Braço (in)', numero: true, formato: (v) => fmt(v, 2) },
            { chave: 'momento', titulo: 'Momento (kgf.in)', numero: true, formato: (v) => fmt(v, 0) },
          ]} />
          <Legenda>Confira com a linha Reference da Boeing: weight = {linhasBoeing[5].kgf.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kgf.</Legenda>
        </>
      ) : (
        <>
          {([['Pesagem 01', CELULAS_P1], ['Pesagem 02', CELULAS_P2]] as const).map(([titulo, lista]) => (
            <div key={titulo}>
              <p style={{ margin: '.6rem 0 .3rem' }}><b>{titulo}</b></p>
              <GradeCelulas valores={lista.map(([c]) => n(f.celulas[c]))} render={(i) => (
                <Numero key={lista[i][0]} rotulo={rotulo(lista[i][0], lista[i][1])} valor={f.celulas[lista[i][0]]}
                  mudar={(v) => setF((x) => ({ ...x, celulas: { ...x.celulas, [lista[i][0]]: v } }))} />
              )} />
            </div>
          ))}
          <p style={{ margin: '.6rem 0 .3rem' }}><b>Canelas</b></p>
          <Radio rotulo="Unidade da canela" horizontal opcoes={['in', 'mm'] as const} valor={unidade} mudar={setUnidade} />
          <div className="grade g2">
            <Numero key={'lh' + unidade} rotulo={rotulo('Canela MLG LH', `Canela LH (${unidade})`)} valor={canela(f.canela_lh)}
              mudar={(v) => muda('canela_lh', v === null ? null : v / fatorUnidade)} />
            <Numero key={'rh' + unidade} rotulo={rotulo('Canela MLG RH', `Canela RH (${unidade})`)} valor={canela(f.canela_rh)}
              mudar={(v) => muda('canela_rh', v === null ? null : v / fatorUnidade)} />
          </div>
        </>
      )}
    </div>
  )

  const editorItens = (chave: 'adicoes' | 'deducoes', categoria: string, prefixoErro: string, momentoFlaps: number) => {
    const itens = f[chave]
    const lista = presets[categoria] || []
    const alterar = (i: number, item: Partial<Item>) => muda(chave, itens.map((x, j) => (j === i ? { ...x, ...item } : x)))
    return (
      <div>
        <div className="grade" style={{ gridTemplateColumns: '4fr 1fr 1fr 1fr .9fr', gap: '.6rem', marginBottom: '.2rem' }}>
          {['Descrição', 'Peso (kgf)', 'Braço (in)', 'Momento (kgf.in)', 'Ação'].map((t) => <div key={t} className="caption" style={{ margin: 0 }}>{t}</div>)}
        </div>
        {itens.map((item, i) => {
          const flap = item.desc.toLowerCase().includes('flap')
          const momento = (flap ? 0 : n(item.peso) * n(item.braco)) + (flap && momentoFlaps ? momentoFlaps : 0)
          const devolvido = item.slot !== undefined && ['description', 'weigth', 'arm']
            .some((c) => [...erros].some((e) => e.toLowerCase() === `${prefixoErro} ${c} ${item.slot}`.toLowerCase()))
          const opcoes = item.desc && !lista.includes(item.desc) ? [...lista, item.desc] : lista
          return (
            <div key={i}>
              {devolvido && <div style={{ color: '#D92D20', fontSize: '.85rem' }}>🔴 Este item foi devolvido para correção</div>}
              <div className="grade fim" style={{ gridTemplateColumns: '4fr 1fr 1fr 1fr .9fr', gap: '.6rem' }}>
                <Busca valor={item.desc || null} opcoes={opcoes} permitirNovo placeholder="Digite ou selecione"
                  mudar={(v) => { alterar(i, { desc: v || '' }); novaOpcao(categoria, v) }} />
                <Numero valor={flap ? 0 : item.peso} disabled={flap} mudar={(v) => alterar(i, { peso: v })} />
                <Numero valor={flap ? 0 : item.braco} disabled={flap} mudar={(v) => alterar(i, { braco: v })} />
                <div className="campo"><div style={{ minHeight: '2.5rem', display: 'flex', alignItems: 'center' }}>{fmt(momento, 2)}</div></div>
                <div className="campo"><Botao tipo="terciario" titulo="Excluir esta linha" onClick={() => muda(chave, itens.filter((_, j) => j !== i))}>🗑</Botao></div>
              </div>
            </div>
          )
        })}
        <Botao onClick={() => muda(chave, [...itens, { desc: '', peso: 0, braco: 0 }])}>Adicionar item</Botao>
      </div>
    )
  }

  const fator = p.opcoes.valores_angulo[f.angulo] ?? 0
  const etapaLevel = (
    <div style={{ maxWidth: 520 }}>
      <Selecao rotulo={rotulo('Graus correção do cg', 'Ângulo de inclinação')} valor={f.angulo || ''} opcoes={['', ...p.opcoes.angulos]}
        rotulos={(a) => a || '—'} mudar={(v) => muda('angulo', v)} />
      <Metrica rotulo="Valor correspondente" valor={fator.toFixed(1)} />
    </div>
  )

  const etapaPreview = erroPreview ? <Erro erro={erroPreview} /> : !preview ? <Carregando texto="Calculando a ficha…" /> : (
    <>
      {preview.ja_existe && <Aviso tipo="error">Já existe uma ficha para {p.prefixo}, Pesagem {p.pesagem}, Revisão {p.revisao}. Escolha outro número. Para alterar essa ficha, use a tela Editar ficha.</Aviso>}
      <RelatorioPesagem calculo={preview.calculo} />
    </>
  )

  const etapas = [etapaDados, etapaCelulas, editorItens('adicoes', 'additions', 'Additions', p.momentoFlaps),
    editorItens('deducoes', 'deductions', 'Deductions', 0), etapaLevel, etapaPreview]
  const ultima = passo === PASSOS.length - 1

  return (
    <div ref={topo} style={{ scrollMarginTop: '1rem' }}>
      {p.topo}
      <div style={{ marginBottom: '1rem' }}>
        <Segmentado opcoes={PASSOS} valor={PASSOS[passo]} mudar={(v) => setPasso(PASSOS.indexOf(v))} rotulos={(v) => `${PASSOS.indexOf(v) + 1}. ${v}`} />
      </div>
      {etapas.map((e, i) => <div key={i} style={{ display: i === passo ? 'block' : 'none' }}>{e}</div>)}
      <hr />
      {PASSOS[passo] === 'Células de Carga' && celulasPendentes && (
        <Aviso tipo="warning">As Células de Carga estão {aviso}. Confira os valores antes de seguir: a Próxima tela confirma que estão certas.</Aviso>
      )}
      {ultima && celulasPendentes && (
        <Aviso tipo="warning">As Células de Carga estão {aviso}. Volte à etapa Células de Carga e confirme antes de gerar a ficha.</Aviso>
      )}
      {!ultima ? (
        <div className="grade g3">
          <div>{passo > 0 && <Botao cheio onClick={() => setPasso(passo - 1)}>← Voltar: {PASSOS[passo - 1]}</Botao>}</div>
          <div />
          <Botao tipo="primario" cheio onClick={() => {
            if (PASSOS[passo] === 'Células de Carga' && celulasPendentes) setConfirmadas(valoresCelulas)
            setPasso(passo + 1)
          }}>Próxima tela →</Botao>
        </div>
      ) : (
        <div className="grade" style={{ gridTemplateColumns: '1fr 1.3fr 1.7fr' }}>
          <Botao cheio onClick={() => setPasso(passo - 1)}>← Voltar: {PASSOS[passo - 1]}</Botao>
          <Botao tipo="primario" cheio onClick={salvar} ocupado={salvando}
            disabled={!p.opcoes.pode_emitir || celulasPendentes || !!p.bloquearSalvar || !!preview?.ja_existe}>{p.rotuloSalvar}</Botao>
          <div className="grade g2" style={{ gap: '.5rem' }}>
            <Botao cheio onClick={() => exportar('xlsx')} ocupado={exportando === 'xlsx'}>Exportar Excel</Botao>
            <Botao cheio onClick={() => exportar('pdf')} ocupado={exportando === 'pdf'}>{exportando === 'pdf' ? 'Gerando…' : 'Exportar PDF'}</Botao>
          </div>
        </div>
      )}
    </div>
  )
}

export { CaixaTotal }
