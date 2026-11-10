"""Time: funções (focal/backup) e projetos e atividades (regras do app.py)."""
import datetime
import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from .auth import usuario_atual
from .base import L, Usuario, ativar, exigir, exigir_nivel, para_json

rotas = APIRouter(prefix="/api")


def _data(texto):
    if not texto:
        return None
    try:
        return datetime.date.fromisoformat(str(texto)[:10])
    except ValueError:
        raise HTTPException(400, f"Data inválida: {texto}")


# --------------------------------------------------------------------------- #
# Funções do time
@rotas.get("/time")
def time(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, *L.NIVEIS_TIME)
    tabela = L.carregar_funcoes_time()
    pessoas = list(dict.fromkeys(tabela["pessoa"]))
    return para_json({
        "linhas": tabela.to_dict("records"),
        "eu": L.pessoa_do_usuario_no_time(pessoas) if pessoas else None,
        "configurar": L.pode_configurar_time(),
        "papeis": L.PAPEIS_TIME,
    })


class Frente(BaseModel):
    original: str | None = None
    nome: str
    grupo: str = ""
    descricao: str = ""
    focais: list[str] = []
    backups: list[str] = []


def _limpo(texto):
    return " ".join(L.safe_str(texto).split())


@rotas.post("/time/frente")
def salvar_frente(pedido: Frente, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_configurar_time(), "Só o usuário engenharia altera as funções do time.")
    tabela = L.carregar_funcoes_time()
    frentes = list(dict.fromkeys(tabela["frente"]))
    nome = _limpo(pedido.nome)
    focais = [_limpo(p) for p in pedido.focais if _limpo(p)]
    backups = [_limpo(p) for p in pedido.backups if _limpo(p)]
    repetidos = [p for p in focais if p in backups]
    exigir(not repetidos, f"{', '.join(repetidos)} está como focal e backup ao mesmo tempo.", 400)
    exigir(nome, "Dê um nome para a frente.", 400)
    exigir(focais or backups, "Escolha pelo menos uma pessoa.", 400)
    exigir(not (nome != pedido.original and nome in frentes), f"Já existe a frente {nome}.", 409)
    L.salvar_frente_time(tabela, pedido.original or None, nome, _limpo(pedido.grupo),
                         _limpo(pedido.descricao), focais, backups)
    return {"ok": True, "mensagem": f"Frente {nome} salva."}


@rotas.delete("/time/frente")
def excluir_frente(frente: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_configurar_time(), "Só o usuário engenharia altera as funções do time.")
    tabela = L.carregar_funcoes_time()
    L.salvar_funcoes_time(tabela[tabela["frente"] != frente].reset_index(drop=True))
    return {"ok": True, "mensagem": f"Frente {frente} excluída."}


class Pessoa(BaseModel):
    original: str
    nome: str
    focal_em: list[str] = []
    backup_em: list[str] = []


@rotas.post("/time/pessoa")
def salvar_pessoa(pedido: Pessoa, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_configurar_time(), "Só o usuário engenharia altera as funções do time.")
    tabela = L.carregar_funcoes_time()
    pessoas = L.opcoes_ordenadas(tabela["pessoa"])
    nome = _limpo(pedido.nome)
    original = _limpo(pedido.original)
    repetidas = [f for f in pedido.focal_em if f in pedido.backup_em]
    exigir(not repetidas, f"Focal e backup ao mesmo tempo em: {', '.join(repetidas)}.", 400)
    exigir(nome, "Informe o nome.", 400)
    exigir(not (nome != original and nome in pessoas), f"{nome} já está no time. Escolha essa pessoa na lista.", 409)
    L.salvar_pessoa_time(tabela, nome, original, pedido.focal_em, pedido.backup_em)
    return {"ok": True, "mensagem": f"Funções de {nome} salvas."}


class _Arquivo(io.BytesIO):
    def __init__(self, conteudo, nome):
        super().__init__(conteudo)
        self.name = nome


@rotas.post("/time/importar")
async def importar_time(confirmar: bool = False, arquivo: UploadFile = File(...),
                        u: Usuario = Depends(usuario_atual)):
    conteudo = await arquivo.read()
    ativar(u)
    exigir(L.pode_configurar_time(), "Só o usuário engenharia altera as funções do time.")
    try:
        nova, erros = L.ler_planilha_time(_Arquivo(conteudo, arquivo.filename or "time.csv"))
    except Exception as erro:
        raise HTTPException(400, f"Não consegui ler a planilha: {erro}")
    resumo = f"{nova['frente'].nunique()} frentes, {nova['pessoa'].nunique()} pessoas, {len(nova)} linhas."
    if confirmar:
        exigir(not erros, " ".join(erros), 400)
        L.salvar_funcoes_time(nova)
        return {"ok": True, "mensagem": f"Funções importadas: {nova['frente'].nunique()} frentes."}
    return {"erros": erros, "resumo": resumo}


@rotas.get("/time/planilha")
def baixar_time(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    tabela = L.carregar_funcoes_time()
    conteudo = tabela.rename(columns=L.ROTULOS_TIME).to_csv(sep=";", index=False).encode("utf-8-sig")
    return Response(conteudo, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="funcoes_time.csv"'})


# --------------------------------------------------------------------------- #
# Projetos e atividades
def _tarefa_json(t):
    return {
        **t,
        "prazo": L.data_tarefa(t),
        "prazo_html": L.prazo_html(t),
        "prazo_html_curto": L.prazo_html(t, curto=True),
    }


@rotas.get("/atividades")
def atividades(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, *L.NIVEIS_ATIVIDADES)
    projetos = L.carregar_projetos_atividades()
    tarefas = L.carregar_tarefas_atividades()
    participantes = L.carregar_participantes_atividades()
    mapa_logins = {(p["projeto_id"], p["nome"]): p["usuario"] for p in participantes}
    hoje = L.hoje_brasilia()
    lista_projetos = []
    for projeto in projetos:
        do_projeto = [t for t in tarefas if t["projeto_id"] == projeto["id"]]
        situacao, cor, motivo = L.saude_projeto(projeto, do_projeto)
        pendentes = L.ordenar_por_prazo([t for t in do_projeto if t["status"] != "Concluída" and t["prazo"]])
        prazo_final = L.como_data(projeto.get("prazo"))
        lista_projetos.append({
            **projeto,
            "prazo": prazo_final,
            "etapa": L.etapa_projeto(projeto),
            "situacao": situacao, "cor": cor, "motivo": motivo,
            "feitas": sum(1 for t in do_projeto if t["status"] == "Concluída"),
            "total": len(do_projeto),
            "abertas": sum(1 for t in do_projeto if t["status"] != "Concluída"),
            "proxima": (
                {"data": L.data_curta(L.data_tarefa(pendentes[0])), "titulo": pendentes[0]["titulo"]}
                if pendentes else None
            ),
            "prazo_curto": L.data_curta(prazo_final) if prazo_final else None,
            "participantes": L.participantes_do_projeto(projeto["id"]),
            "pode_excluir": u.nivel == L.NIVEL_ADMIN
            or L.safe_str(projeto["criado_por"]).casefold() == u.usuario.casefold(),
        })
    concluidas_mes = [
        t for t in tarefas if t["status"] == "Concluída" and L.safe_str(t["concluido_em"])
        and datetime.datetime.fromisoformat(L.safe_str(t["concluido_em"])).astimezone(L.FUSO_BRASILIA).date()
        >= hoje - datetime.timedelta(days=30)
    ]
    return para_json({
        "hoje": hoje,
        "projetos": lista_projetos,
        "tarefas": [
            {**_tarefa_json(t), "minha": L.tarefa_e_minha(t, mapa_logins)} for t in tarefas
        ],
        "concluidas_30_dias": len(concluidas_mes),
        "pessoas": L.carregar_pessoas_atividades(),
        "meu_nome": L.usuario_logado_atividades()[1],
        "etapas": L.ETAPAS_PROJETO,
        "status": L.STATUS_ATIVIDADE,
    })


class Projeto(BaseModel):
    nome: str
    descricao: str = ""
    lider: str | None = None
    etapa: str = "Em andamento"
    prazo: str | None = None
    participantes: list[str] = []
    sem_login: str = ""


def _dados_projeto(pedido: Projeto, projeto=None):
    nome = pedido.nome.strip()
    exigir(nome, "Dê um nome ao projeto.", 400)
    exigir(not any(
        p["nome"].casefold() == nome.casefold() and (not projeto or p["id"] != projeto["id"])
        for p in L.carregar_projetos_atividades()
    ), "Já existe um projeto com esse nome.", 409)
    pessoas = L.carregar_pessoas_atividades()
    atuais = L.participantes_do_projeto(projeto["id"]) if projeto else {}
    participantes = {p: pessoas.get(p) for p in pedido.participantes if p in pessoas}
    participantes.update({n.strip(): None for n in pedido.sem_login.split(",") if n.strip()})
    lider = pedido.lider or None
    if lider and lider not in participantes:
        participantes[lider] = pessoas.get(lider) or atuais.get(lider)
    return dict(nome=nome, descricao=pedido.descricao.strip(), participantes=participantes,
                lider=lider, etapa=pedido.etapa or "Em andamento", prazo=_data(pedido.prazo))


def _projeto(projeto_id):
    projeto = next((p for p in L.carregar_projetos_atividades() if p["id"] == projeto_id), None)
    exigir(projeto, "Projeto não encontrado.", 404)
    return projeto


@rotas.post("/atividades/projetos")
def criar_projeto(pedido: Projeto, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    projeto_id = L.criar_projeto_atividades(**_dados_projeto(pedido))
    return {"ok": True, "id": projeto_id, "mensagem": "Projeto criado."}


@rotas.put("/atividades/projetos/{projeto_id}")
def editar_projeto(projeto_id: int, pedido: Projeto, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    projeto = _projeto(projeto_id)
    L.atualizar_projeto_atividades(projeto, **_dados_projeto(pedido, projeto))
    return {"ok": True, "mensagem": "Projeto salvo."}


@rotas.delete("/atividades/projetos/{projeto_id}")
def excluir_projeto(projeto_id: int, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    projeto = _projeto(projeto_id)
    exigir(u.nivel == L.NIVEL_ADMIN or L.safe_str(projeto["criado_por"]).casefold() == u.usuario.casefold(),
           "Só quem criou o projeto ou um administrador pode excluí-lo.")
    L.excluir_projeto_atividades(projeto_id)
    return {"ok": True, "mensagem": "Projeto excluído."}


class Tarefa(BaseModel):
    projeto_id: int
    titulo: str
    descricao: str = ""
    responsavel: str | None = None
    prazo: str | None = None
    status: str = "A fazer"


@rotas.post("/atividades/tarefas")
def criar_tarefa(pedido: Tarefa, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(pedido.titulo.strip(), "Escreva o que precisa ser feito.", 400)
    L.salvar_tarefa_atividades(pedido.projeto_id, None, pedido.titulo.strip(), pedido.descricao.strip(),
                               pedido.responsavel or None, _data(pedido.prazo), pedido.status or "A fazer")
    return {"ok": True, "mensagem": "Atividade criada."}


@rotas.put("/atividades/tarefas/{tarefa_id}")
def editar_tarefa(tarefa_id: int, pedido: Tarefa, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(pedido.titulo.strip(), "Escreva o que precisa ser feito.", 400)
    L.salvar_tarefa_atividades(pedido.projeto_id, tarefa_id, pedido.titulo.strip(), pedido.descricao.strip(),
                               pedido.responsavel or None, _data(pedido.prazo), pedido.status or "A fazer")
    return {"ok": True, "mensagem": "Atividade salva."}


class Status(BaseModel):
    status: str


@rotas.post("/atividades/tarefas/{tarefa_id}/status")
def status_tarefa(tarefa_id: int, pedido: Status, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    tarefa = next((t for t in L.carregar_tarefas_atividades() if t["id"] == tarefa_id), None)
    exigir(tarefa, "Atividade não encontrada.", 404)
    exigir(pedido.status in L.STATUS_ATIVIDADE, "Situação inválida.", 400)
    L.mudar_status_tarefa(tarefa, pedido.status)
    return {"ok": True}


@rotas.delete("/atividades/tarefas/{tarefa_id}")
def excluir_tarefa(tarefa_id: int, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    L.excluir_tarefa_atividades(tarefa_id)
    return {"ok": True, "mensagem": "Atividade excluída."}
