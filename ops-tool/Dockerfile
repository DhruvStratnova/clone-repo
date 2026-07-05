FROM python:3.12-slim

WORKDIR /app

# Install deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway sets $PORT — bind to it
ENV PORT=8000
CMD uvicorn shopify_webhook:app --host 0.0.0.0 --port ${PORT}
