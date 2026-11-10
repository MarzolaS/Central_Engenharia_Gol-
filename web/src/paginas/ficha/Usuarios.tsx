import { useState } from 'react'
import { api } from '../../api'
import { Aviso, Botao, Cabecalho, Carregando, Erro, Legenda, Selecao, Texto, useAcao, useDados } from '../../componentes/ui'

type Dados = { usuarios: { usuario: string; nome: string; nivel_acesso: number }[]; perfis: { nivel: number; nome: string }[] }

export default function Usuarios() {
  const { dados, erro, carregando, recarregar } = useDados<Dados>(() => api.get('/api/usuarios'), [])
  const [novo, setNovo] = useState({ nome: '', usuario: '', senha: '', confirmar: '', nivel: 2 })
  const [msgNovo, setMsgNovo] = useState<string | null>(null)
  const [alvoPerfil, setAlvoPerfil] = useState<string | null>(null)
  const [nivelPerfil, setNivelPerfil] = useState<number | null>(null)
  const [msgPerfil, setMsgPerfil] = useState<string | null>(null)
  const [alvoSenha, setAlvoSenha] = useState<string | null>(null)
  const [senha, setSenha] = useState({ nova: '', confirmar: '' })
  const [msgSenha, setMsgSenha] = useState<string | null>(null)
  const aNovo = useAcao(), aPerfil = useAcao(), aSenha = useAcao()
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  if (!dados) return null
  const perfis = dados.perfis.map((p) => p.nivel)
  const nomePerfil = (n: number) => dados.perfis.find((p) => p.nivel === n)?.nome || '—'
  const logins = dados.usuarios.map((u) => u.usuario)
  const rotulo = (l: string) => { const u = dados.usuarios.find((x) => x.usuario === l); return u ? `${u.nome} (${u.usuario})` : l }
  const escolhido = alvoPerfil && logins.includes(alvoPerfil) ? alvoPerfil : logins[0]
  const nivelAtual = dados.usuarios.find((u) => u.usuario === escolhido)?.nivel_acesso
  const nivelEscolhido = nivelPerfil ?? (nivelAtual && perfis.includes(nivelAtual) ? nivelAtual : perfis[0])
  const alvoS = alvoSenha && logins.includes(alvoSenha) ? alvoSenha : logins[0]

  const criar = () => aNovo.rodar(async () => {
    setMsgNovo(null)
    if (!novo.nome.trim() || !novo.usuario.trim()) throw new Error('Informe o nome e o usuário.')
    if (novo.senha.length < 1) throw new Error('A senha deve ter pelo menos 1 caracteres.')
    if (novo.senha !== novo.confirmar) throw new Error('As senhas não coincidem.')
    const r = await api.post('/api/usuarios', { nome: novo.nome, usuario: novo.usuario, senha: novo.senha, nivel: novo.nivel })
    setMsgNovo(r.mensagem)
    setNovo({ nome: '', usuario: '', senha: '', confirmar: '', nivel: 2 })
    await recarregar()
  })
  return (
    <div>
      <Cabecalho titulo="Usuários" subtitulo="Crie acessos para a equipe." />
      <form className="vidro" style={{ borderRadius: 10 }} onSubmit={(e) => { e.preventDefault(); criar() }}>
        <Texto rotulo="Nome completo" valor={novo.nome} mudar={(v) => setNovo({ ...novo, nome: v })} />
        <Texto rotulo="Usuário" valor={novo.usuario} mudar={(v) => setNovo({ ...novo, usuario: v })} />
        <Texto rotulo="Senha" tipo="password" valor={novo.senha} mudar={(v) => setNovo({ ...novo, senha: v })} />
        <Texto rotulo="Confirmar senha" tipo="password" valor={novo.confirmar} mudar={(v) => setNovo({ ...novo, confirmar: v })} />
        <Selecao rotulo="Perfil" valor={novo.nivel} opcoes={perfis} rotulos={nomePerfil} mudar={(v) => setNovo({ ...novo, nivel: v })}
          ajuda="Consulta só visualiza. Gera e aprova emite, edita e aprova fichas. Especialista GOL vê as telas de emissão e aprovação, mas não gera nem aprova. Administrador também gerencia usuários e assinaturas." />
        <Botao tipo="primario" submit ocupado={aNovo.ocupado}>Criar usuário</Botao>
        <Erro erro={aNovo.erro} />
        {msgNovo && <Aviso tipo="success">{msgNovo}</Aviso>}
      </form>
      <hr />
      <h3>Alterar perfil</h3>
      <div className="grade fim" style={{ gridTemplateColumns: '2fr 1.3fr 1fr' }}>
        <Selecao rotulo="Usuário" valor={escolhido} opcoes={logins} rotulos={rotulo} mudar={(v) => { setAlvoPerfil(v); setNivelPerfil(null); setMsgPerfil(null) }} />
        <Selecao rotulo="Novo perfil" valor={nivelEscolhido} opcoes={perfis} rotulos={nomePerfil} mudar={setNivelPerfil} />
        <div className="campo"><Botao cheio ocupado={aPerfil.ocupado} onClick={() => aPerfil.rodar(async () => {
          const r = await api.put(`/api/usuarios/${encodeURIComponent(escolhido)}/perfil`, { nivel: nivelEscolhido })
          setMsgPerfil(r.mensagem)
          await recarregar()
        })}>Salvar perfil</Botao></div>
      </div>
      <Erro erro={aPerfil.erro} />
      {msgPerfil && <Aviso tipo="success">{msgPerfil}</Aviso>}
      <hr />
      <h3>Redefinir senha</h3>
      <Legenda>As senhas ficam criptografadas e não podem ser vistas; defina uma nova e informe à pessoa.</Legenda>
      <form className="vidro" style={{ borderRadius: 10 }} onSubmit={(e) => {
        e.preventDefault()
        aSenha.rodar(async () => {
          setMsgSenha(null)
          if (!senha.nova) throw new Error('Informe a nova senha.')
          if (senha.nova !== senha.confirmar) throw new Error('As senhas não coincidem.')
          const r = await api.put(`/api/usuarios/${encodeURIComponent(alvoS)}/senha`, { senha: senha.nova })
          setMsgSenha(r.mensagem)
          setSenha({ nova: '', confirmar: '' })
        })
      }}>
        <Selecao rotulo="Usuário" valor={alvoS} opcoes={logins} rotulos={rotulo} mudar={setAlvoSenha} />
        <div className="grade g2">
          <Texto rotulo="Nova senha" tipo="password" valor={senha.nova} mudar={(v) => setSenha({ ...senha, nova: v })} />
          <Texto rotulo="Confirmar nova senha" tipo="password" valor={senha.confirmar} mudar={(v) => setSenha({ ...senha, confirmar: v })} />
        </div>
        <Botao tipo="primario" submit ocupado={aSenha.ocupado}>Redefinir senha</Botao>
        <Erro erro={aSenha.erro} />
        {msgSenha && <Aviso tipo="success">{msgSenha}</Aviso>}
      </form>
    </div>
  )
}
