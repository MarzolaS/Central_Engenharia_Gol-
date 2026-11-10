// Consulta de SRs Boeing em tela inteira (tela_consulta_srs do app.py).
// A página fica no banco (dado proprietário): o site busca com o token e mostra num iframe.
import { useEffect, useState } from 'react'
import { api, buscarBlob, enviarArquivo } from '../../api'
import { useSessao } from '../../sessao'
import { Aviso, Botao, EnvioArquivo, Erro, Markdown, Texto, Legenda, useAcao, useDados, useToast } from '../../componentes/ui'

type Info = {
  tem_html: boolean; base_anexos: string; atualizado_em_texto: string; configurar: boolean
  exemplo_anexo: [string, string] | null; atualizado_em: string | null
}

export default function ConsultaSrs() {
  const { sessao, sair } = useSessao()
  const [versao, setVersao] = useState(0)
  const { dados: info, erro } = useDados(() => api.get<Info>('/api/srs'), [versao])
  const [configurando, setConfigurando] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [erroPagina, setErroPagina] = useState<string | null>(null)
  const outras = (sessao?.areas.length || 0) > 1

  useEffect(() => {
    if (!info?.tem_html) return
    let vivo = true
    let atual: string | null = null
    setPronto(false)
    buscarBlob('/api/srs/pagina', 'text/html')
      .then((b) => { if (!vivo) return; atual = URL.createObjectURL(b); setUrl(atual) })
      .catch((e) => vivo && setErroPagina(e.message || String(e)))
    return () => { vivo = false; if (atual) URL.revokeObjectURL(atual) }
  }, [info?.atualizado_em, info?.base_anexos, info?.tem_html])

  useEffect(() => {
    const ouvir = (ev: MessageEvent) => { if (ev.data?.tipo === 'srs-pronto') setPronto(true) }
    window.addEventListener('message', ouvir)
    // Como no app.py: a tela de carregamento desiste depois de 40 s.
    const t = setTimeout(() => setPronto(true), 40000)
    return () => { window.removeEventListener('message', ouvir); clearTimeout(t) }
  }, [])

  const carregando = !configurando && (!info || (info.tem_html && !pronto && !erroPagina))
  return (
    <div className="srs-tela">
      {carregando && !erro && (
        <div className="srs-carregando">
          <img src="/logo_gol.png" alt="GOL" />
          <div className="srs-carregando-marca">Central de Engenharia</div>
          <div className="srs-carregando-titulo">Consulta SR's</div>
          <div className="gol-loader" /><p>Carregando os SRs…</p>
        </div>
      )}
      <div className="srs-barra">
        <div className="srs-marca">
          <img src="/logo_gol.png" alt="GOL" /><div className="srs-marca-sep" />
          <div className="srs-marca-titulo">Consulta SR's</div>
          <div className="srs-marca-info">{info?.tem_html ? <>Atualizada em <b>{info.atualizado_em_texto}</b></> : 'Página ainda não enviada'}</div>
        </div>
        {info?.configurar && (configurando
          ? <Botao onClick={() => setConfigurando(false)}>← Voltar à consulta</Botao>
          : <Botao titulo="Enviar uma nova Consulta_SRs.html e o endereço dos anexos" onClick={() => setConfigurando(true)}>⚙ Atualizar</Botao>)}
        {outras && <Botao titulo="Voltar para a tela inicial, com as outras partes do site" onClick={() => { window.location.hash = '#/' }}>Início</Botao>}
        <Botao tipo="terciario" onClick={sair}>Sair</Botao>
      </div>
      <Erro erro={erro || erroPagina} />
      {info && configurando && <Configurar info={info} pronto={() => setVersao((v) => v + 1)} />}
      {info && !configurando && !info.tem_html && (
        <div className="ativ-vazio">A consulta de SRs ainda não foi carregada.<br />
          {info.configurar ? 'Envie a Consulta_SRs.html em Atualizar.' : 'Peça ao usuário engenharia para enviar a página.'}</div>
      )}
      {info && !configurando && info.tem_html && (
        <>
          {!info.base_anexos && info.configurar && <Aviso tipo="info">Os anexos (PDFs) só abrem depois que o endereço da pasta no SharePoint for salvo em Atualizar.</Aviso>}
          {url && <iframe className="srs-quadro" title="Consulta SR's" src={url}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-forms allow-modals" />}
        </>
      )}
    </div>
  )
}

function Configurar({ info, pronto }: { info: Info; pronto: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [endereco, setEndereco] = useState(info.base_anexos)
  const { ocupado, erro, setErro, rodar } = useAcao()
  const toast = useToast()
  return (
    <div style={{ maxWidth: '56rem', marginTop: '.6rem' }}>
      <h5>1. Página de consulta</h5>
      <Legenda>Rode o Atualizar_banco.bat no seu PC e envie aqui a Consulta_SRs.html que ele gerou. A página fica guardada no banco do site (não no GitHub) e só quem tem login vê.</Legenda>
      <EnvioArquivo rotulo="Consulta_SRs.html" aceitar=".html,.htm" arquivo={arquivo} mudar={setArquivo} />
      <Botao tipo="primario" ocupado={ocupado} onClick={() => {
        if (!arquivo) return setErro('Escolha o arquivo Consulta_SRs.html antes de enviar.')
        rodar(async () => { const r = await api.post('/api/srs/pagina', enviarArquivo('arquivo', arquivo)); toast(r.mensagem, 'success'); setArquivo(null); pronto() })
      }}>Enviar página</Botao>

      <h5>2. Anexos (PDFs) no SharePoint</h5>
      <Legenda>
        Os PDFs continuam no SharePoint da Engenharia, onde já estão. Abra no navegador a pasta do SharePoint onde fica a
        Consulta_SRs.html (a mesma pasta em que você rodou o .bat, ex.: General › BD › teste) e cole aqui o endereço da barra
        do navegador. Quem clicar num anexo abre o PDF no SharePoint com o próprio login da GOL.
      </Legenda>
      <Texto rotulo="Endereço da pasta no SharePoint" valor={endereco} mudar={setEndereco}
        placeholder="https://empresa.sharepoint.com/sites/.../Shared Documents/General/BD/teste" />
      <Botao ocupado={ocupado} onClick={() => rodar(async () => { const r = await api.put('/api/srs/anexos', { endereco }); toast(r.mensagem, 'success'); pronto() })}>Salvar endereço</Botao>
      <Erro erro={erro} />
      {info.base_anexos && (
        <>
          <Markdown texto={`Pasta usada para os anexos: \`${info.base_anexos}\``} />
          {info.exemplo_anexo && <p>Teste um anexo: <a href={info.exemplo_anexo[1]} target="_blank" rel="noreferrer">{info.exemplo_anexo[0]}</a></p>}
        </>
      )}
    </div>
  )
}
