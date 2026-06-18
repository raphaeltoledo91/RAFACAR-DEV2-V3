# Auditoria final - RAFACAR DEV2 V3

## Resumo executivo

Esta versão corrige os principais gargalos e riscos identificados no V2:

1. **Segurança**
   - removido override de API por `?api=` e `localStorage`
   - cookies de sessão mantidos apenas no backend
   - allowlist de rotas no proxy do Traccar
   - CSP com `helmet`
   - CORS restritivo
   - validação de URLs de mídia pelo `MEDIA_MTX_URL`
   - limite de payload e rate limit por rota

2. **Desempenho**
   - `main.jsx` monolítico substituído por frontend modular
   - mapa carregado de forma lazy
   - polling sem concorrência paralela
   - pausa de polling com aba oculta
   - abort de requisição pendente
   - snapshot cache no backend
   - índice em memória no frontend para posições e eventos
   - renderização do mapa simplificada com `CircleMarker`

3. **Fluidez**
   - redução de blur, glow e filtros pesados
   - menos repaints sobre o mapa
   - seleção de veículo e métricas derivadas por `useMemo`
   - atualização de snapshot menos agressiva no monitoramento

4. **Persistência**
   - Redis opcional aplicado para:
     - sessão
     - cache de snapshot
     - câmeras
     - evidências
     - binário de snapshot salvo
   - fallback local para desenvolvimento sem Redis

## Redis: decisão

**Foi aplicado.**

### Motivo
No V2, sessão e estado crítico ficavam em memória. Isso é frágil em produção e inadequado para Vercel/serverless. Redis reduz inconsistência, evita perda de sessão em cold start e distribui melhor a carga em múltiplas instâncias.

### Onde foi usado
- `server/lib/session-store.js`
- `server/lib/snapshot-cache.js`
- `server/lib/state-store.js`

## Correção solicitada de motorista

O frontend agora prioriza:
1. `driverUniqueId`
2. `driverName`
3. `driver`
4. `driverId`

O telefone **não é mais exibido como identificação principal do motorista**.

## Riscos residuais

- snapshots persistidos sem Redis usam disco local, o que não é adequado para serverless
- se o Traccar estiver lento, a UX depende do timeout e do cache curto
- o proxy genérico `/api/traccar/*` continua poderoso; a allowlist foi mantida para reduzir risco

## Arquivos-chave alterados

- `src/App.jsx`
- `src/lib/api.js`
- `src/lib/device-utils.js`
- `src/components/*`
- `server/app.js`
- `server/lib/session-store.js`
- `server/lib/state-store.js`
- `server/lib/snapshot-cache.js`
- `server/lib/traccar.js`
- `api/index.js`
- `vercel.json`

## Checklist de produção

- [ ] configurar `REDIS_URL`
- [ ] definir `PUBLIC_APP_URL`
- [ ] revisar `COOKIE_SAMESITE` conforme domínio final
- [ ] rodar `npm ci`
- [ ] rodar `npm run build`
- [ ] rodar `npm run check:server`
- [ ] validar login, snapshot, mapa, monitoramento e evidências
