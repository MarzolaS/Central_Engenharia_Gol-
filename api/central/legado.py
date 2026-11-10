"""Carrega as funções do app.py (Streamlit) para a API usar sem reescrevê-las.

Só a parte final do app.py, que desenha o login e o menu, fica de fora.
Enquanto o Streamlit e o site novo convivem, os dois usam exatamente o mesmo
SQL e os mesmos cálculos: uma correção no app.py vale para os dois.
"""
import os
import sys
import types

from . import shim_streamlit

RAIZ = os.environ.get(
    "CENTRAL_RAIZ",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
)
MARCADOR_FIM = "if st.session_state['usuario_logado'] and st.session_state.get('boas_vindas'):"


def carregar():
    shim_streamlit.instalar()
    caminho = os.path.join(RAIZ, "app.py")
    with open(caminho, encoding="utf-8") as arquivo:
        fonte = arquivo.read()
    posicao = fonte.find(MARCADOR_FIM)
    if posicao < 0:
        raise RuntimeError("Não achei o início da parte de telas no app.py.")
    fonte = fonte[:posicao]
    modulo = types.ModuleType("legado")
    modulo.__file__ = caminho
    sys.modules["legado"] = modulo
    # Os caminhos do app.py (template, ícones, planilha de aeronaves) são relativos à raiz.
    os.chdir(RAIZ)
    shim_streamlit.iniciar_requisicao()
    exec(compile(fonte, caminho, "exec"), modulo.__dict__)
    return modulo
