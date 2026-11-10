# API da Central Engenharia Gol (Hugging Face Spaces, Docker).
# A pasta do Space é montada pelo workflow deploy-api.yml com:
#   app.py, exemplo_ficha.xlsx, tipo_aeronave.txt, assets/, componentes/ e central/.
FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-calc fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# O Hugging Face Spaces roda o container com o usuário de id 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    CENTRAL_RAIZ=/home/user/app
WORKDIR /home/user/app

COPY --chown=user requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .

EXPOSE 7860
CMD ["sh", "-c", "uvicorn central.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
