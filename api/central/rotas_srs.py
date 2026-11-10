"""Consulta de SRs Boeing: a página fica no banco (dado proprietário) e abre num iframe."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .auth import usuario_atual
from .base import L, Usuario, ativar, exigir, exigir_nivel, para_json

rotas = APIRouter(prefix="/api/srs")

# A página entra no site por um iframe; o script do app.py avisava o Streamlit que
# terminou de carregar. Aqui ele avisa o site por postMessage.
AVISO_PRONTO = (
    "<script>(function(){function p(){try{window.parent.postMessage({tipo:'srs-pronto'},'*')}catch(e){}}"
    "if(document.readyState==='complete'){setTimeout(p,50)}else{window.addEventListener('load',"
    "function(){setTimeout(p,50)})}})();</script>"
)


def _entrar(u: Usuario):
    ativar(u)
    exigir_nivel(u, *L.NIVEIS_CONSULTA_SRS)


def _conteudo(info):
    return L.carregar_html_consulta_srs(info.get("atualizado_em")) if info.get("tem_html") else ""


@rotas.get("")
def info(u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    dados = L.carregar_info_consulta_srs()
    configurar = L.pode_atualizar_consulta_srs()
    exemplo = None
    if configurar and dados.get("base_anexos") and dados.get("tem_html"):
        exemplo = L.exemplo_link_anexo_srs(_conteudo(dados), dados["base_anexos"])
    return para_json({
        "tem_html": bool(dados.get("tem_html")),
        "nome_arquivo": dados.get("nome_arquivo"),
        "tamanho": dados.get("tamanho"),
        "base_anexos": dados.get("base_anexos") or "",
        "atualizado_em": dados.get("atualizado_em"),
        "atualizado_em_texto": L.formatar_data_hora_brasilia(dados["atualizado_em"]) if dados.get("atualizado_em") else "",
        "atualizado_por": dados.get("atualizado_por"),
        "configurar": configurar,
        "exemplo_anexo": list(exemplo) if exemplo else None,
    })


@rotas.get("/pagina", response_class=HTMLResponse)
def pagina(u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    dados = L.carregar_info_consulta_srs()
    conteudo = _conteudo(dados)
    if not conteudo:
        raise HTTPException(404, "A consulta de SRs ainda não foi carregada.")
    pagina = L.html_srs_com_anexos(conteudo, dados.get("base_anexos"))
    fim = pagina.rfind("</body>")
    fim = len(pagina) if fim < 0 else fim
    return HTMLResponse(pagina[:fim] + AVISO_PRONTO + pagina[fim:], headers={"Cache-Control": "private, no-store"})


@rotas.post("/pagina")
async def enviar(arquivo: UploadFile = File(...), u: Usuario = Depends(usuario_atual)):
    dados = await arquivo.read()
    _entrar(u)
    exigir(L.pode_atualizar_consulta_srs(), "Só o usuário engenharia atualiza a consulta de SRs.")
    exigir(len(dados) <= L.LIMITE_HTML_SRS,
           "O arquivo passa de 150 MB. Confira se é mesmo a Consulta_SRs.html.", 400)
    exigir(b"const DATA=" in dados and b"const ANEX=" in dados,
           "Esse arquivo não parece ser a página gerada pelo banco_srs.py (Consulta_SRs.html). "
           "Nada foi alterado.", 400)
    L.salvar_html_consulta_srs(dados, arquivo.filename or "Consulta_SRs.html", u.nome)
    return {"mensagem": "Consulta de SRs atualizada."}


class Base(BaseModel):
    endereco: str


@rotas.put("/anexos")
def base_anexos(b: Base, u: Usuario = Depends(usuario_atual)):
    _entrar(u)
    exigir(L.pode_atualizar_consulta_srs(), "Só o usuário engenharia muda o endereço dos anexos.")
    base, erro = L.normalizar_endereco_sharepoint(b.endereco)
    exigir(not erro, erro, 400)
    L.salvar_base_anexos_srs(base)
    return {"base_anexos": base, "mensagem": "Endereço dos anexos salvo."}
