"""Pintura da frota: modelos, prefixos, livery, vistas, planejamento, atas e material.

As regras (quem edita, validações, gravação) são as do app.py; aqui só entram e
saem os dados. As imagens vão para o site como data URI (WEBP em base64).
"""
import datetime
import io
import re

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from . import shim_streamlit
from .auth import usuario_atual
from .base import L, Usuario, ativar, exigir, exigir_nivel, para_json

rotas = APIRouter(prefix="/api/pintura")


class _Arquivo(io.BytesIO):
    def __init__(self, conteudo, nome):
        super().__init__(conteudo)
        self.name = nome

    def getvalue(self):
        return super().getvalue()


def _data(texto):
    if texto in (None, ""):
        return None
    try:
        return datetime.date.fromisoformat(str(texto)[:10])
    except ValueError:
        raise HTTPException(400, f"Data inválida: {texto}")


def _entrar(u: Usuario):
    ativar(u)
    exigir_nivel(u, *L.NIVEIS_PINTURA)


def _editar():
    exigir(L.pode_editar_pintura(), "Seu perfil só pode consultar o controle de pintura.")


def _imagem(conteudo, lado):
    try:
        return L.preparar_imagem_pintura(_Arquivo(conteudo, "imagem"), lado)
    except Exception:
        raise HTTPException(400, "Não consegui abrir essa imagem. Envie um PNG, JPG ou WEBP.")


def _aeronave(aeronave_id):
    for a in L.carregar_aeronaves_pintura():
        if a["id"] == aeronave_id:
            return a
    raise HTTPException(404, "Prefixo não encontrado.")


def _modelo(modelo_id):
    for m in L.carregar_modelos_pintura():
        if m["id"] == modelo_id:
            return m
    raise HTTPException(404, "Modelo não encontrado.")


def _resumo_aeronave(a):
    status = L.status_pintura(a)
    return {
        **{k: v for k, v in a.items() if k != "livery_mini"},
        "livery_mini": L.imagem_data_uri(a["livery_mini"]),
        "status": status,
        "vencimento_html": L.html_vencimento_pintura(a["data_vencimento"]),
        "prazo_vencimento": L.texto_prazo_vencimento(a["data_vencimento"]),
        "avanco": round(100 * a["tarefas_feitas"] / a["tarefas"]) if a["tarefas"] else None,
        "atualizado_em_texto": L.formatar_data_hora_brasilia(a["atualizado_em"]) if a["atualizado_em"] else "",
    }


# --------------------------------------------------------------------------- #
# Modelos e prefixos
@rotas.get("")
def inicio(u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    modelos = L.carregar_modelos_pintura()
    aeronaves = L.carregar_aeronaves_pintura()
    return para_json({
        "modelos": [{"id": m["id"], "nome": m["nome"], "imagem": L.imagem_data_uri(m["imagem"])} for m in modelos],
        "aeronaves": [_resumo_aeronave(a) for a in aeronaves],
        "editar": L.pode_editar_pintura(),
        "excluir": L.pode_excluir_pintura(),
        "dias_aviso_vencimento": L.DIAS_AVISO_VENCIMENTO_PINTURA,
        "hoje": datetime.date.today(),
        "vistas": L.VISTAS_PINTURA,
    })


@rotas.post("/modelos")
async def salvar_modelo(nome: str = Form(...), modelo_id: int | None = Form(None),
                        imagem: UploadFile | None = File(None), u: Usuario = Depends(usuario_atual)):
    conteudo = await imagem.read() if imagem is not None else b""
    _entrar(u)
    _editar()
    nome = re.sub(r"\s+", " ", nome).strip()
    exigir(nome, "Dê um nome ao modelo.", 400)
    exigir(not any(m["nome"].casefold() == nome.casefold() and m["id"] != modelo_id
                   for m in L.carregar_modelos_pintura()), "Já existe um modelo com esse nome.", 400)
    if modelo_id is not None:
        _modelo(modelo_id)
    figura = _imagem(conteudo, 1200) if conteudo else None
    novo_id = L.salvar_modelo_pintura(nome, figura, modelo_id, trocar_imagem=figura is not None)
    return {"id": novo_id}


@rotas.delete("/modelos/{modelo_id}")
def excluir_modelo(modelo_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    exigir(L.pode_excluir_pintura(), "Só o Administrador exclui modelos.")
    L.excluir_modelo_pintura(modelo_id)
    return {"ok": True}


class NovoPrefixo(BaseModel):
    modelo_id: int
    prefixo: str
    data_inicio: str | None = None


@rotas.post("/aeronaves")
def criar_prefixo(p: NovoPrefixo, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    modelo = _modelo(p.modelo_id)
    prefixo = L.normalizar_prefixo_pintura(p.prefixo)
    exigir(prefixo, "Digite o prefixo.", 400)
    exigir(not any(a["prefixo"] == prefixo and a["modelo_id"] == modelo["id"]
                   for a in L.carregar_aeronaves_pintura()),
           f"O {prefixo} já está em {modelo['nome']}.", 400)
    return {"id": L.criar_aeronave_pintura(modelo["id"], prefixo, _data(p.data_inicio))}


@rotas.get("/aeronaves/{aeronave_id}")
def ver_prefixo(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    a = _aeronave(aeronave_id)
    livery = L.carregar_livery_pintura(a["id"], a["atualizado_em"]) if a["tem_livery"] else None
    return para_json({
        "aeronave": _resumo_aeronave(a),
        "modelo": {"id": a["modelo_id"], "nome": _modelo(a["modelo_id"])["nome"]},
        "livery": L.imagem_data_uri(livery),
    })


class Datas(BaseModel):
    data_inicio: str | None = None
    data_fim: str | None = None
    data_vencimento: str | None = None
    observacoes: str = ""


@rotas.put("/aeronaves/{aeronave_id}/datas")
def salvar_datas(aeronave_id: int, d: Datas, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    _aeronave(aeronave_id)
    inicio, fim, vencimento = _data(d.data_inicio), _data(d.data_fim), _data(d.data_vencimento)
    exigir(not (inicio and fim and fim < inicio), "O fim da pintura está antes do início.", 400)
    exigir(not (fim and vencimento and vencimento <= fim),
           "O vencimento precisa ser depois do fim da pintura.", 400)
    L.atualizar_aeronave_pintura(
        aeronave_id, data_inicio=inicio, data_fim=fim, data_vencimento=vencimento,
        observacoes=d.observacoes.strip() or None,
    )
    return {"ok": True}


class Prefixo(BaseModel):
    prefixo: str


@rotas.put("/aeronaves/{aeronave_id}/prefixo")
def corrigir_prefixo(aeronave_id: int, p: Prefixo, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    a = _aeronave(aeronave_id)
    novo = L.normalizar_prefixo_pintura(p.prefixo)
    exigir(novo, "Digite o prefixo.", 400)
    exigir(not any(o["prefixo"] == novo and o["modelo_id"] == a["modelo_id"] and o["id"] != a["id"]
                   for o in L.carregar_aeronaves_pintura()), f"O {novo} já existe neste modelo.", 400)
    L.atualizar_aeronave_pintura(aeronave_id, prefixo=novo)
    return {"ok": True}


@rotas.delete("/aeronaves/{aeronave_id}")
def excluir_prefixo(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    exigir(L.pode_excluir_pintura(), "Só o Administrador exclui prefixos.")
    L.excluir_aeronave_pintura(aeronave_id)
    return {"ok": True}


@rotas.put("/aeronaves/{aeronave_id}/livery")
async def salvar_livery(aeronave_id: int, imagem: UploadFile = File(...), u: Usuario = Depends(usuario_atual)):
    conteudo = await imagem.read()
    _entrar(u)
    _editar()
    _aeronave(aeronave_id)
    grande, mini = _imagem(conteudo, 1800), _imagem(conteudo, 640)
    L.atualizar_aeronave_pintura(aeronave_id, livery=grande, livery_mini=mini)
    return {"ok": True}


@rotas.delete("/aeronaves/{aeronave_id}/livery")
def remover_livery(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.atualizar_aeronave_pintura(aeronave_id, livery=None, livery_mini=None)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Vistas e legendas (o desenho é o mesmo componente do app.py)
@rotas.get("/aeronaves/{aeronave_id}/vistas")
def vistas(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    a = _aeronave(aeronave_id)
    todas = L.carregar_vistas_pintura(aeronave_id)
    with L.conectar_banco() as conn:
        com_vistas = {int(l["aeronave_id"]) for l in conn.execute(
            'SELECT DISTINCT aeronave_id FROM pintura_vistas').fetchall()}
    outros = [
        {"id": o["id"], "prefixo": o["prefixo"]} for o in L.carregar_aeronaves_pintura()
        if o["modelo_id"] == a["modelo_id"] and o["id"] != a["id"] and o["id"] in com_vistas
    ]
    legendas = L.carregar_legendas_pintura()
    return para_json({
        "vistas": {
            nome: {**{k: v for k, v in vista.items() if k != "imagem"},
                   "imagem": L.imagem_data_uri(vista["imagem"])}
            for nome, vista in todas.items()
        },
        "legendas": legendas,
        "uso_legendas": {str(k): v for k, v in L.uso_das_legendas_pintura().items()},
        "copiar_de": outros,
        "editar": L.pode_editar_pintura(),
        "nomes": L.VISTAS_PINTURA,
    })


def _vista(vista):
    exigir(vista in L.VISTAS_PINTURA, "Vista inválida.", 400)
    return vista


@rotas.put("/aeronaves/{aeronave_id}/vistas/{vista}/imagem")
async def imagem_vista(aeronave_id: int, vista: str, imagem: UploadFile = File(...),
                       u: Usuario = Depends(usuario_atual)):
    conteudo = await imagem.read()
    _entrar(u)
    _editar()
    _aeronave(aeronave_id)
    L.salvar_imagem_vista_pintura(aeronave_id, _vista(vista), _imagem(conteudo, 2000))
    return {"ok": True}


class Desenho(BaseModel):
    areas: list = []
    legendas_novas: list = []
    notas: list = []


@rotas.put("/aeronaves/{aeronave_id}/vistas/{vista}/areas")
def salvar_areas(aeronave_id: int, vista: str, d: Desenho, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    total, total_notas = L.salvar_areas_vista_pintura(
        aeronave_id, _vista(vista), d.areas, d.legendas_novas, d.notas)
    texto = (f"Vista {L.VISTAS_PINTURA[vista].lower()} salva ({total} área{'s' if total != 1 else ''}"
             + (f", {total_notas} nota{'s' if total_notas != 1 else ''}" if total_notas else "") + ").")
    return {"areas": total, "notas": total_notas, "mensagem": texto}


@rotas.delete("/aeronaves/{aeronave_id}/vistas/{vista}")
def apagar_vista(aeronave_id: int, vista: str, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.excluir_vista_pintura(aeronave_id, _vista(vista))
    return {"ok": True}


class Copia(BaseModel):
    origem_id: int


@rotas.post("/aeronaves/{aeronave_id}/vistas/copiar")
def copiar_vistas(aeronave_id: int, c: Copia, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    destino, origem = _aeronave(aeronave_id), _aeronave(c.origem_id)
    exigir(destino["modelo_id"] == origem["modelo_id"], "Só dá para copiar de um prefixo do mesmo modelo.", 400)
    L.copiar_vistas_pintura(c.origem_id, aeronave_id)
    return {"ok": True}


class Legenda(BaseModel):
    nome: str
    cor: str


def _conferir_legenda(nome, cor, legenda_id=None):
    nome = re.sub(r"\s+", " ", nome).strip()[:40]
    exigir(nome, "Dê um nome à legenda.", 400)
    exigir(re.fullmatch(r"#[0-9a-fA-F]{6}", cor or ""), "Cor inválida.", 400)
    exigir(not any(l["nome"].casefold() == nome.casefold() and l["id"] != legenda_id
                   for l in L.carregar_legendas_pintura()), "Já existe uma legenda com esse nome.", 400)
    return nome


@rotas.post("/legendas")
def nova_legenda(l: Legenda, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.criar_legenda_pintura(_conferir_legenda(l.nome, l.cor), l.cor)
    return {"ok": True}


@rotas.put("/legendas/{legenda_id}")
def editar_legenda(legenda_id: int, l: Legenda, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.salvar_legenda_pintura(legenda_id, _conferir_legenda(l.nome, l.cor, legenda_id), l.cor)
    return {"ok": True}


@rotas.delete("/legendas/{legenda_id}")
def excluir_legenda(legenda_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    usos = L.uso_das_legendas_pintura().get(legenda_id, 0)
    exigir(not usos, f"Usada em {usos} área{'s' if usos != 1 else ''}; apague as áreas antes.", 400)
    L.excluir_legenda_pintura(legenda_id)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Observações técnicas
@rotas.get("/aeronaves/{aeronave_id}/observacoes")
def observacoes(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    notas = L.carregar_observacoes_pintura(aeronave_id)
    for nota in notas:
        nota["quem"] = nota["atualizado_por"] or nota["criado_por"] or "—"
        nota["quando"] = L.formatar_data_hora_brasilia(nota["atualizado_em"] or nota["criado_em"])
        nota["editada"] = bool(nota["atualizado_em"])
    return {"observacoes": notas, "editar": L.pode_editar_pintura()}


class Texto(BaseModel):
    texto: str


@rotas.post("/aeronaves/{aeronave_id}/observacoes")
def nova_observacao(aeronave_id: int, t: Texto, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    exigir(t.texto.strip(), "Escreva a observação.", 400)
    L.salvar_observacao_pintura(aeronave_id, t.texto.strip())
    return {"ok": True}


@rotas.put("/aeronaves/{aeronave_id}/observacoes/{observacao_id}")
def editar_observacao(aeronave_id: int, observacao_id: int, t: Texto, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    exigir(t.texto.strip(), "A observação está vazia.", 400)
    L.salvar_observacao_pintura(aeronave_id, t.texto.strip(), observacao_id)
    return {"ok": True}


@rotas.delete("/aeronaves/{aeronave_id}/observacoes/{observacao_id}")
def excluir_observacao(aeronave_id: int, observacao_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.excluir_observacao_pintura(aeronave_id, observacao_id)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Planejamento: tarefas, Gantt e curva S
def _curva_s(aeronave, tarefas):
    with shim_streamlit.gravar() as g:
        L.curva_s_pintura(aeronave, tarefas)
    return g.blocos


@rotas.get("/aeronaves/{aeronave_id}/planejamento")
def planejamento(aeronave_id: int, mostrar_base: bool = False, escala: str = "Dias",
                 u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    a = _aeronave(aeronave_id)
    tabela = L.carregar_tarefas_pintura(aeronave_id)
    tarefas, _ = L.tarefas_pintura_em_lista(tabela)
    resposta = {
        "tabela": tabela, "tarefas": tarefas, "editar": L.pode_editar_pintura(),
        "tem_base": any(t["base_fim"] for t in tarefas),
        "curva": [], "gantt_html": "", "gantt_altura": 0,
    }
    if tarefas:
        resposta["curva"] = _curva_s(a, tarefas)
        fases = len({t["fase"] for t in tarefas})
        resposta["gantt_html"] = L.gantt_pintura_html(tarefas, mostrar_base, 34 if escala == "Dias" else 14)
        resposta["gantt_altura"] = 58 + fases * 38 + len(tarefas) * 34 + 62
    return para_json(resposta)


class Tarefas(BaseModel):
    linhas: list[dict]


def _tabela_tarefas(linhas):
    return pd.DataFrame(
        [{c: linha.get(c) for c in L.COLUNAS_TAREFAS_PINTURA} for linha in linhas],
        columns=L.COLUNAS_TAREFAS_PINTURA, dtype=object,
    )


def _erros(erros, titulo):
    if erros:
        raise HTTPException(400, titulo + "\n\n- " + "\n- ".join(erros[:8]))


@rotas.put("/aeronaves/{aeronave_id}/tarefas")
def salvar_tarefas(aeronave_id: int, t: Tarefas, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    novas, erros = L.tarefas_pintura_em_lista(_tabela_tarefas(t.linhas))
    _erros(erros, "Corrija antes de salvar:")
    L.salvar_tarefas_pintura(aeronave_id, novas)
    return {"tarefas": len(novas), "mensagem": f"Planejamento salvo ({len(novas)} tarefa{'s' if len(novas) != 1 else ''})."}


@rotas.post("/aeronaves/{aeronave_id}/linha-base")
def linha_base(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.salvar_linha_base_pintura(aeronave_id)
    return {"ok": True}


@rotas.post("/aeronaves/{aeronave_id}/tarefas/importar")
async def importar_tarefas(aeronave_id: int, confirmar: bool = False, arquivo: UploadFile = File(...),
                           u: Usuario = Depends(usuario_atual)):
    conteudo = await arquivo.read()
    _entrar(u)
    _editar()
    try:
        novas, erros = L.tarefas_pintura_em_lista(
            L.ler_planilha_tarefas_pintura(_Arquivo(conteudo, arquivo.filename or "planilha.csv")))
    except Exception as erro:
        raise HTTPException(400, f"Não consegui ler a planilha: {erro}")
    _erros(erros, "Corrija na planilha:")
    exigir(novas, "A planilha não tem tarefas.", 400)
    fases = len({t["fase"] for t in novas})
    feitas = sum(1 for t in novas if t["fim_real"])
    com_base = sum(1 for t in novas if t["base_fim"])
    resumo = (
        f"Encontrei **{len(novas)} tarefas** em **{fases} fase{'s' if fases != 1 else ''}**, "
        f"de {L.data_longa(min(t['inicio'] for t in novas))} a {L.data_longa(max(t['fim'] for t in novas))}. "
        f"{feitas} já concluída{'s' if feitas != 1 else ''}"
        + (f", {com_base} com linha de base." if com_base else ", sem linha de base.")
    )
    if confirmar:
        L.salvar_tarefas_pintura(aeronave_id, novas)
    return {"resumo": resumo, "tarefas": len(novas), "importado": confirmar}


@rotas.get("/modelo-planilha")
def modelo_planilha():
    modelo = "Fase;Tarefa;Início;Fim;Concluída em\n5. Selagem;Remoção dos selantes danificados;07/11/2026;08/11/2026;\n"
    return Response(modelo.encode("utf-8-sig"), media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="modelo_planejamento_pintura.csv"'})


# --------------------------------------------------------------------------- #
# Atas de reunião
@rotas.get("/aeronaves/{aeronave_id}/atas")
def atas(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    lista = L.carregar_atas_pintura(aeronave_id)
    for ata in lista:
        ata["discutido_html"] = L.texto_ata_html(ata["discutido"])
        ata["quem"] = ata["atualizado_por"] or ata["criado_por"] or "—"
        ata["quando"] = L.formatar_data_hora_brasilia(ata["atualizado_em"] or ata["criado_em"])
        ata["editada"] = bool(ata["atualizado_em"])
    return para_json({
        "atas": lista, "editar": L.pode_editar_pintura(),
        "pessoas": list(L.carregar_pessoas_atividades()),
    })


class Ata(BaseModel):
    titulo: str
    data: str
    participantes: list[str] = []
    outros: str = ""
    discutido: str


def _gravar_ata(aeronave_id, a: Ata, ata_id=None):
    titulo = re.sub(r"\s+", " ", a.titulo).strip()
    exigir(titulo, "Dê um nome à reunião.", 400)
    exigir(a.discutido.strip(), "Escreva o que foi discutido.", 400)
    participantes = list(dict.fromkeys(
        list(a.participantes) + [n.strip() for n in a.outros.split(",") if n.strip()]))
    L.salvar_ata_pintura(aeronave_id, titulo, _data(a.data) or datetime.date.today(), participantes,
                         a.discutido.strip(), ata_id)


@rotas.post("/aeronaves/{aeronave_id}/atas")
def nova_ata(aeronave_id: int, a: Ata, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    _gravar_ata(aeronave_id, a)
    return {"ok": True}


@rotas.put("/aeronaves/{aeronave_id}/atas/{ata_id}")
def editar_ata(aeronave_id: int, ata_id: int, a: Ata, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    _gravar_ata(aeronave_id, a, ata_id)
    return {"ok": True}


@rotas.delete("/aeronaves/{aeronave_id}/atas/{ata_id}")
def excluir_ata(aeronave_id: int, ata_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    L.excluir_ata_pintura(aeronave_id, ata_id)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Lista de material
@rotas.get("/aeronaves/{aeronave_id}/material")
def material(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    return para_json({
        "linhas": L.carregar_materiais_pintura(aeronave_id),
        "rotulos": L.ROTULOS_MATERIAL_PINTURA, "editar": L.pode_editar_pintura(),
    })


class Material(BaseModel):
    linhas: list[dict]


@rotas.put("/aeronaves/{aeronave_id}/material")
def salvar_material(aeronave_id: int, m: Material, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    _editar()
    tabela = pd.DataFrame(m.linhas, columns=L.COLUNAS_MATERIAL_PINTURA, dtype=object)
    total = L.salvar_materiais_pintura(aeronave_id, tabela)
    return {"total": total, "mensagem": f"Lista de material salva ({total} ite{'ns' if total != 1 else 'm'})."}


@rotas.get("/aeronaves/{aeronave_id}/material.csv")
def material_csv(aeronave_id: int, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    a = _aeronave(aeronave_id)
    tabela = L.carregar_materiais_pintura(aeronave_id)
    csv = tabela.rename(columns=L.ROTULOS_MATERIAL_PINTURA).to_csv(index=False, sep=";", decimal=",")
    return Response(csv.encode("utf-8-sig"), media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{a["prefixo"]}_material_pintura.csv"'})


