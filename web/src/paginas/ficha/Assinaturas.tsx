import { useEffect, useState } from 'react'
import { api, buscarBlob, enviarArquivo } from '../../api'
import { Aviso, Botao, Cabecalho, Carregando, EnvioArquivo, Erro, Selecao, Tabela, useAcao, useDados } from '../../componentes/ui'

type Dados = { usuarios: { usuario: string; nome: string; perfil: string; tem_assinatura: boolean }[] }

export default function Assinaturas() {
  const { dados, erro, carregando, recarregar } = useDados<Dados>(() => api.get('/api/usuarios'), [])
  const [alvo, setAlvo] = useState<string | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [imagem, setImagem] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const acao = useAcao()
  const usuarios = dados?.usuarios || []
  const login = alvo && usuarios.some((u) => u.usuario === alvo) ? alvo : usuarios[0]?.usuario
  const atual = usuarios.find((u) => u.usuario === login)
  useEffect(() => {
    setImagem(null)
    if (!login || !atual?.tem_assinatura) return
    let url: string | null = null
    buscarBlob(`/api/assinaturas/${encodeURIComponent(login)}`).then((b) => { url = URL.createObjectURL(b); setImagem(url) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [login, atual?.tem_assinatura])
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const rotulo = (l: string) => { const u = usuarios.find((x) => x.usuario === l); return u ? `${u.nome} (${u.usuario})` : l }
  return (
    <div>
      <Cabecalho titulo="Assinaturas" subtitulo="Assinaturas usadas no Excel da ficha." />
      {!usuarios.length ? <Aviso>Não há usuários cadastrados.</Aviso> : (
        <>
          <Tabela linhas={usuarios.map((u) => ({ Nome: u.nome, Usuário: u.usuario, Perfil: u.perfil, Assinatura: u.tem_assinatura ? 'Cadastrada' : 'Pendente' }))}
            colunas={['Nome', 'Usuário', 'Perfil', 'Assinatura'].map((c) => ({ chave: c, titulo: c }))} />
          <div className="espaco" />
          <Selecao rotulo="Selecione o usuário para cadastrar ou atualizar a assinatura" valor={login} opcoes={usuarios.map((u) => u.usuario)} rotulos={rotulo}
            mudar={(v) => { setAlvo(v); setArquivo(null); setMsg(null) }} />
          {imagem && <figure style={{ margin: '0 0 1rem' }}><img src={imagem} alt="Assinatura" style={{ width: 300, background: '#fff' }} /><figcaption className="caption">Assinatura cadastrada</figcaption></figure>}
          <EnvioArquivo key={login} rotulo="Enviar assinatura (PNG ou JPEG, até 5 MB)" aceitar=".png,.jpg,.jpeg" arquivo={arquivo} mudar={setArquivo} />
          <div className="grade g2">
            <Botao tipo="primario" cheio disabled={!arquivo} ocupado={acao.ocupado} onClick={() => acao.rodar(async () => {
              await api.put(`/api/assinaturas/${encodeURIComponent(login!)}`, enviarArquivo('arquivo', arquivo!))
              setMsg(`Assinatura de ${rotulo(login!)} salva.`)
              setArquivo(null)
              await recarregar()
            })}>Salvar assinatura</Botao>
            {atual?.tem_assinatura && <Botao cheio onClick={() => acao.rodar(async () => {
              await api.del(`/api/assinaturas/${encodeURIComponent(login!)}`)
              setMsg(`Assinatura de ${rotulo(login!)} removida.`)
              await recarregar()
            })}>Remover assinatura</Botao>}
          </div>
          <Erro erro={acao.erro} />
          {msg && <Aviso tipo="success">{msg}</Aviso>}
        </>
      )}
    </div>
  )
}
