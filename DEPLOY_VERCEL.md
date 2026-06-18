# Deploy na Vercel

## O que já está pronto no projeto
- `vercel.json` configurado
- frontend com build em `dist`
- API serverless em `api/index.js`
- Redis suportado para sessão, cache e persistência de estado

## Variáveis obrigatórias
Defina na Vercel:

- `TRACCAR_URL`
- `MEDIA_MTX_URL`
- `PUBLIC_APP_URL`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=lax`  
  Use `none` se frontend e API estiverem em domínios diferentes.
- `CORS_ORIGINS`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `REDIS_PREFIX=rafacar:v3`
- `POLLING_MS=30000`
- `SNAPSHOT_CACHE_TTL_MS=5000`
- `EVENT_LOOKBACK_HOURS=24`

## Variáveis opcionais
- `ALLOW_UNSAFE_GOOGLE_TILES=true`
- `SESSION_TTL_MS=28800000`
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-flash-latest`
- `TRACCAR_WEBHOOK_SECRET`

## Deploy via UI
1. Crie um novo projeto na Vercel.
2. Importe o repositório `RAFACAR-DEV2-V3`.
3. Framework preset: **Other**.
4. Root directory: `/`
5. Build command: `npm run build`
6. Output directory: `dist`
7. Install command: `npm ci`
8. Adicione as variáveis acima.
9. Faça o deploy.

## Deploy via CLI
```bash
npm i -g vercel
vercel link
vercel env add TRACCAR_URL
vercel env add MEDIA_MTX_URL
vercel env add PUBLIC_APP_URL
vercel env add COOKIE_SECURE
vercel env add COOKIE_SAMESITE
vercel env add CORS_ORIGINS
vercel env add REDIS_URL
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add REDIS_PREFIX
vercel env add POLLING_MS
vercel env add SNAPSHOT_CACHE_TTL_MS
vercel env add EVENT_LOOKBACK_HOURS
vercel --prod
```

## Checklist final de produção
- Redis configurado
- URL pública definida em `PUBLIC_APP_URL`
- `CORS_ORIGINS` apontando para o domínio final
- cookie com `sameSite` coerente com o domínio
- login funcionando
- `driverUniqueId` aparecendo corretamente no painel
- câmeras e evidências persistindo após novo deploy
