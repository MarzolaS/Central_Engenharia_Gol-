"""Substituto mínimo do Streamlit para rodar as funções de dados do app.py na API.

A API carrega o app.py (sem a parte que desenha as telas) para reaproveitar,
sem reescrever, o SQL, os cálculos da ficha e a geração de Excel/PDF. As
funções de tela não são chamadas; o que elas usam do Streamlit vira "nada".

O que de fato funciona aqui:
- st.session_state: um dicionário por requisição (usuário logado, nível);
- st.cache_data / st.cache_resource: cache em memória com .clear();
- st.connection: sessões SQLAlchemy no banco de DATABASE_URL;
- st.secrets: lido das variáveis de ambiente.
Mensagens de st.error/st.warning/st.success/st.info/st.toast são guardadas
na requisição para a API devolver ao site.
"""
import contextvars
import functools
import os
import pickle
import sys
import threading
import time
import types

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# --------------------------------------------------------------------------- #
# session_state por requisição
_estado = contextvars.ContextVar("estado_sessao", default=None)
_mensagens = contextvars.ContextVar("mensagens_tela", default=None)


class EstadoSessao(dict):
    def __getattr__(self, nome):
        try:
            return self[nome]
        except KeyError:
            raise AttributeError(nome) from None

    def __setattr__(self, nome, valor):
        self[nome] = valor

    def __delattr__(self, nome):
        self.pop(nome, None)


class _ProxyEstado:
    """Encaminha tudo para o EstadoSessao da requisição atual."""

    def _atual(self):
        estado = _estado.get()
        if estado is None:
            estado = EstadoSessao()
            _estado.set(estado)
        return estado

    def __getattr__(self, nome):
        return getattr(self._atual(), nome)

    def __setattr__(self, nome, valor):
        setattr(self._atual(), nome, valor)

    def __getitem__(self, chave):
        return self._atual()[chave]

    def __setitem__(self, chave, valor):
        self._atual()[chave] = valor

    def __delitem__(self, chave):
        del self._atual()[chave]

    def __contains__(self, chave):
        return chave in self._atual()

    def __iter__(self):
        return iter(self._atual())

    def get(self, *args):
        return self._atual().get(*args)

    def pop(self, *args):
        return self._atual().pop(*args)

    def setdefault(self, *args):
        return self._atual().setdefault(*args)

    def keys(self):
        return self._atual().keys()

    def items(self):
        return self._atual().items()

    def update(self, *args, **kwargs):
        return self._atual().update(*args, **kwargs)


session_state = _ProxyEstado()


def iniciar_requisicao(dados_usuario=None):
    """Abre um estado novo para a requisição. Devolve o token do contextvar."""
    estado = EstadoSessao(
        usuario_logado=False, nivel_acesso=0, nome_usuario="", usuario_id="",
        pagina_atual="consulta", area=None,
    )
    if dados_usuario:
        estado.update(dados_usuario)
    _mensagens.set([])
    return _estado.set(estado)


def mensagens_da_requisicao():
    return list(_mensagens.get() or [])


def _guardar_mensagem(tipo):
    def registrar(corpo=None, *args, **kwargs):
        lista = _mensagens.get()
        if lista is not None and corpo is not None:
            lista.append({"tipo": tipo, "texto": str(corpo)})
        return _Nada()
    return registrar


error = _guardar_mensagem("error")
warning = _guardar_mensagem("warning")
success = _guardar_mensagem("success")
info = _guardar_mensagem("info")
toast = _guardar_mensagem("info")


# Gravação de telas só de leitura (ex.: curva S da pintura): o que a função do
# app.py "desenharia" vira uma lista de blocos que o site mostra igual.
_blocos = contextvars.ContextVar("blocos_tela", default=None)


class gravar:
    def __enter__(self):
        self._token = _blocos.set([])
        return self

    def __exit__(self, *_):
        self.blocos = _blocos.get()
        _blocos.reset(self._token)
        return False


def _bloco(tipo, **dados):
    lista = _blocos.get()
    if lista is not None:
        lista.append({"tipo": tipo, **dados})
    return _Nada()


def markdown(corpo="", unsafe_allow_html=False, **_):
    return _bloco("html" if unsafe_allow_html else "markdown", conteudo=str(corpo))


def caption(corpo="", unsafe_allow_html=False, **_):
    return _bloco("caption", conteudo=str(corpo))


def altair_chart(grafico, **_):
    try:
        spec = grafico.to_dict()
    except Exception:
        spec = None
    return _bloco("vega", spec=spec)


def metric(rotulo, valor, delta=None, **_):
    return _bloco("metric", rotulo=str(rotulo), valor=str(valor), delta=None if delta is None else str(delta))


class StopException(Exception):
    """Equivale ao st.stop(): a função parou de propósito."""


class RerunException(Exception):
    """Equivale ao st.rerun(). Na API não há o que redesenhar."""


def stop():
    raise StopException()


def rerun(*_args, **_kwargs):
    # Nas funções de gravação o rerun é o último passo; ignorar é seguro.
    return None


# --------------------------------------------------------------------------- #
# Cache
_TODOS_CACHES = []
_TTL_PADRAO = float(os.environ.get("CACHE_TTL_SEGUNDOS", "60"))


def _chave_cache(args, kwargs):
    try:
        return pickle.dumps((args, sorted(kwargs.items())), protocol=4)
    except Exception:
        return None


def _fazer_cache(funcao, ttl, max_entries, copiar):
    guardado = {}
    trava = threading.RLock()

    @functools.wraps(funcao)
    def envolvida(*args, **kwargs):
        chave = _chave_cache(args, kwargs)
        if chave is None:
            return funcao(*args, **kwargs)
        agora = time.monotonic()
        with trava:
            if chave in guardado:
                momento, valor = guardado[chave]
                if ttl is None or agora - momento < ttl:
                    return _copia(valor) if copiar else valor
        valor = funcao(*args, **kwargs)
        with trava:
            guardado[chave] = (agora, valor)
            if max_entries and len(guardado) > max_entries:
                mais_antiga = min(guardado, key=lambda c: guardado[c][0])
                guardado.pop(mais_antiga, None)
        return _copia(valor) if copiar else valor

    def limpar(*_args, **_kwargs):
        with trava:
            guardado.clear()

    envolvida.clear = limpar
    _TODOS_CACHES.append(limpar)
    return envolvida


def _copia(valor):
    # st.cache_data devolve uma cópia: quem altera o resultado não estraga o cache.
    try:
        return pickle.loads(pickle.dumps(valor, protocol=4))
    except Exception:
        return valor


def _converter_ttl(ttl):
    if ttl is None:
        return _TTL_PADRAO
    if hasattr(ttl, "total_seconds"):
        return min(ttl.total_seconds(), _TTL_PADRAO)
    return min(float(ttl), _TTL_PADRAO)


class _DecoradorCache:
    def __init__(self, copiar, com_ttl):
        self._copiar = copiar
        self._com_ttl = com_ttl

    def __call__(self, funcao=None, *, ttl=None, max_entries=None, **_ignorados):
        def decorar(f):
            return _fazer_cache(
                f, _converter_ttl(ttl) if self._com_ttl else None, max_entries, self._copiar,
            )
        if callable(funcao):
            return decorar(funcao)
        return decorar

    def clear(self):
        for limpar in list(_TODOS_CACHES):
            limpar()


cache_data = _DecoradorCache(copiar=True, com_ttl=True)
cache_resource = _DecoradorCache(copiar=False, com_ttl=False)


def limpar_todos_os_caches():
    cache_data.clear()


# --------------------------------------------------------------------------- #
# Banco
def url_do_banco():
    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not url:
        raise RuntimeError("Defina DATABASE_URL com a URL do PostgreSQL.")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


class _ConexaoSQL:
    def __init__(self, **opcoes):
        connect_args = opcoes.pop("connect_args", {})
        opcoes.pop("type", None)
        self._engine = create_engine(
            url_do_banco(), pool_pre_ping=False, connect_args=connect_args,
            **{k: v for k, v in opcoes.items() if k in ("pool_recycle", "pool_size", "max_overflow")},
        )
        self._fabrica = sessionmaker(bind=self._engine)

    @property
    def session(self):
        return self._fabrica()

    @property
    def engine(self):
        return self._engine


def connection(_nome, **opcoes):
    return _ConexaoSQL(**opcoes)


class _Segredos(dict):
    def get(self, chave, padrao=None):
        if chave == "connections":
            return {"postgresql": {"url": os.environ.get("DATABASE_URL", "")}}
        return os.environ.get(chave, padrao)

    def __getitem__(self, chave):
        valor = self.get(chave)
        if valor is None:
            raise KeyError(chave)
        return valor

    def __contains__(self, chave):
        return self.get(chave) is not None


secrets = _Segredos()


# --------------------------------------------------------------------------- #
# Todo o resto da interface vira "nada"
class _Nada:
    """Objeto que aceita qualquer uso (chamada, with, atributo) e não faz nada."""

    def __call__(self, *args, **kwargs):
        if len(args) == 1 and callable(args[0]) and not kwargs:
            return args[0]  # usado como decorador (@st.dialog, @st.fragment)
        return _Nada()

    def __getattr__(self, _nome):
        return _Nada()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def __iter__(self):
        return iter(())

    def __bool__(self):
        return False

    def __getitem__(self, _chave):
        return _Nada()


def columns(spec, *args, **kwargs):
    quantidade = spec if isinstance(spec, int) else len(spec)
    return [_Nada() for _ in range(quantidade)]


def tabs(rotulos, *args, **kwargs):
    return [_Nada() for _ in rotulos]


def __getattr__(nome):
    if nome.startswith("__"):
        raise AttributeError(nome)
    return _Nada()


def instalar():
    """Registra este módulo como `streamlit` e `streamlit.components.v1`."""
    modulo = sys.modules[__name__]
    componentes = types.ModuleType("streamlit.components")
    v1 = types.ModuleType("streamlit.components.v1")
    v1.declare_component = lambda *a, **k: _Nada()
    v1.html = lambda *a, **k: None
    componentes.v1 = v1
    modulo.components = componentes
    sys.modules["streamlit"] = modulo
    sys.modules["streamlit.components"] = componentes
    sys.modules["streamlit.components.v1"] = v1
