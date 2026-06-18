# RAFACAR DEV2 V3

Painel RAFACAR refeito com foco em segurança, desempenho e fluidez para operação com Traccar, monitoramento e evidências.

## O que mudou

- frontend modular, sem `main.jsx` monolítico
- polling com trava de concorrência, cancelamento e pausa quando a aba fica oculta
- remoção do override inseguro de API por `?api=`
- sessão local com suporte a Redis
- cache curto de snapshot para aliviar o backend
- estado de câmeras/evidências persistente com Redis quando configurado
- evidência em snapshot persistida no Redis quando disponível
- exibição de `driverUniqueId` no frontend, sem cair em telefone
- mapa simplificado com renderização mais leve

## Stack

- React + Vite
- Express
- Redis opcional via `REDIS_URL`
- Leaflet / React Leaflet

## Variáveis de ambiente

Copie `.env.example` e preencha os valores necessários.

Redis é recomendado para produção, principalmente em Vercel e ambientes serverless.

## Instalação

```bash
npm ci
npm run build
npm run check:server
npm start
```

## Desenvolvimento

```bash
npm ci
npm run dev
npm start
```

O Vite atende o frontend e o `server.js` atende a API local.

## Deploy

### Node/Railway/Render/VM
Use `npm ci && npm run build && npm start`.

### Vercel
Defina pelo menos:

- `TRACCAR_URL`
- `MEDIA_MTX_URL`
- `PUBLIC_APP_URL`
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none` se frontend e API ficarem em domínios diferentes
- `REDIS_URL` para sessão, cache e evidências persistentes

Sem `REDIS_URL`, o app ainda funciona, mas produção serverless perde persistência confiável.

## Rotas principais

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/config`
- `GET /api/bootstrap`
- `GET /api/snapshot`
- `GET /api/monitoring/cameras`
- `POST /api/monitoring/cameras`
- `DELETE /api/monitoring/cameras/:deviceId`
- `GET /api/monitoring/evidence`
- `POST /api/monitoring/evidence`
- `POST /api/monitoring/evidence/snapshot`
- `GET /api/monitoring/evidence/:id/image`
- `DELETE /api/monitoring/evidence/:id`
- `GET /api/command-types`
- `POST /api/send-command`
- `ALL /api/traccar/*`

## Observação

Não há mais suporte a selecionar endpoint da API pela query string. Em produção isso foi removido por segurança.


Veja também `DEPLOY_VERCEL.md` para publicação direta na Vercel.
