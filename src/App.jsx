import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, LogOut, RefreshCcw, Search, Shield, Sparkles } from 'lucide-react';

import LoginView from './components/LoginView.jsx';
import SnapshotSummary from './components/SnapshotSummary.jsx';
import FleetList from './components/FleetList.jsx';
import DeviceDetails from './components/DeviceDetails.jsx';
import MonitoringPanel from './components/MonitoringPanel.jsx';
import { api } from './lib/api.js';
import { enrichDevices } from './lib/device-utils.js';
import { usePolling } from './hooks/usePolling.js';

const FleetMap = lazy(() => import('./components/FleetMap.jsx'));

function sortFleet(items = []) {
  const statusOrder = { moving: 0, online: 1, idle: 2, stopped: 3, unknown: 4, offline: 5 };
  return [...items].sort((a, b) => {
    const aOrder = statusOrder[a.status] ?? 9;
    const bOrder = statusOrder[b.status] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.device.name || '').localeCompare(String(b.device.name || ''));
  });
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [snapshot, setSnapshot] = useState({ devices: [], positions: [], events: [], config: { pollingMs: 30000 } });
  const [cameras, setCameras] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [panelError, setPanelError] = useState('');
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);

  const pollMs = snapshot?.config?.pollingMs || 30000;
  const fleet = useMemo(() => sortFleet(enrichDevices(snapshot.devices, snapshot.positions, snapshot.events)), [snapshot]);

  const filteredFleet = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return fleet;
    return fleet.filter((item) => {
      const blob = [
        item.device.name,
        item.device.uniqueId,
        item.driverLabel,
        item.position?.address
      ].join(' ').toLowerCase();
      return blob.includes(term);
    });
  }, [fleet, search]);

  const selectedVehicle = useMemo(() => {
    if (!selectedId) return filteredFleet[0] || fleet[0] || null;
    return fleet.find((item) => Number(item.device.id) === Number(selectedId)) || filteredFleet[0] || fleet[0] || null;
  }, [fleet, filteredFleet, selectedId]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    };
    window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);

  const loadMonitoring = useCallback(async () => {
    const [cameraPayload, evidencePayload] = await Promise.all([
      api.getCameras(),
      api.getEvidence()
    ]);
    setCameras(cameraPayload.cameras || []);
    setEvidence(evidencePayload.evidence || []);
  }, []);

  const loadBootstrap = useCallback(async () => {
    const payload = await api.bootstrap();
    setSnapshot(payload);
    setSelectedId((current) => current || payload.devices?.[0]?.id || null);
    await loadMonitoring();
  }, [loadMonitoring]);

  const refreshSnapshot = useCallback(async () => {
    const payload = await api.snapshot();
    setSnapshot(payload);
  }, []);

  useEffect(() => {
    let mounted = true;

    api.authMe()
      .then(async () => {
        if (!mounted) return;
        setAuthenticated(true);
        await loadBootstrap();
      })
      .catch(() => {
        if (!mounted) return;
        setAuthenticated(false);
      })
      .finally(() => {
        if (!mounted) return;
        setAuthReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [loadBootstrap]);

  usePolling(async () => {
    if (!authenticated) return;
    try {
      await refreshSnapshot();
    } catch (error) {
      setPanelError(error.message || 'Falha ao atualizar snapshot.');
    }
  }, pollMs, authenticated);

  async function handleLogin(email, password) {
    setLoadingLogin(true);
    setAuthError('');
    try {
      await api.login(email, password);
      setAuthenticated(true);
      await loadBootstrap();
    } catch (error) {
      setAuthError(error.message || 'Falha ao entrar.');
    } finally {
      setLoadingLogin(false);
      setAuthReady(true);
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setAuthenticated(false);
    setSnapshot({ devices: [], positions: [], events: [], config: { pollingMs: 30000 } });
    setCameras([]);
    setEvidence([]);
    setAssistantAnswer('');
  }

  async function handleAskAssistant() {
    if (!assistantQuestion.trim()) return;
    setAssistantBusy(true);
    setAssistantAnswer('');
    try {
      const payload = await api.askAssistant({
        question: assistantQuestion,
        vehicles: selectedVehicle ? [{
          id: selectedVehicle.device.id,
          name: selectedVehicle.device.name,
          uniqueId: selectedVehicle.device.uniqueId,
          status: selectedVehicle.status,
          speed: selectedVehicle.position?.speed || 0
        }] : [],
        events: selectedVehicle?.event ? [selectedVehicle.event] : []
      });
      setAssistantAnswer(payload.answer || '');
    } catch (error) {
      setAssistantAnswer(error.message || 'Falha ao consultar assistente.');
    } finally {
      setAssistantBusy(false);
    }
  }

  if (!authReady) {
    return <div className="app-loading">Carregando painel RAFACAR...</div>;
  }

  if (!authenticated) {
    return <LoginView onLogin={handleLogin} loading={loadingLogin} error={authError} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-icon"><Shield size={18} /></div>
          <div>
            <h1>RAFACAR Rastreadores</h1>
            <p>Frontend limpo, seguro e otimizado para produção</p>
          </div>
        </div>

        <div className="topbar-actions">
          <button type="button" className="secondary-button" onClick={() => loadBootstrap().catch((error) => setPanelError(error.message))}>
            <RefreshCcw size={16} />
            Recarregar
          </button>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </header>

      <main className="content-grid">
        <section className="content-main">
          <SnapshotSummary fleet={fleet} />

          <div className="toolbar">
            <label className="search-field">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por veículo, uniqueId, motorista ou endereço"
              />
            </label>
            <div className="toolbar-note">Polling: {pollMs / 1000}s com trava anti-concorrência</div>
          </div>

          {panelError ? <div className="inline-message error">{panelError}</div> : null}

          <div className="layout-columns">
            <aside className="panel-card panel-list">
              <div className="panel-card-head">
                <h2>Frota</h2>
                <span>{filteredFleet.length} itens</span>
              </div>
              <FleetList fleet={filteredFleet} selectedId={selectedVehicle?.device?.id} onSelect={setSelectedId} />
            </aside>

            <section className="panel-card panel-map">
              <div className="panel-card-head">
                <h2>Mapa em tempo real</h2>
                <span>{selectedVehicle?.device?.name || 'Sem seleção'}</span>
              </div>
              <Suspense fallback={<div className="panel-empty">Carregando mapa...</div>}>
                <FleetMap fleet={filteredFleet} selectedVehicle={selectedVehicle} />
              </Suspense>
            </section>
          </div>

          <div className="layout-columns">
            <section className="panel-card">
              <div className="panel-card-head">
                <h2>Detalhes do veículo</h2>
                <span>driverUniqueId exibido no frontend</span>
              </div>
              <DeviceDetails selectedVehicle={selectedVehicle} onRefresh={() => refreshSnapshot().catch(() => {})} />
            </section>

            <section className="panel-card">
              <div className="panel-card-head">
                <h2>Monitoramento e evidências</h2>
                <span>{cameras.length} câmeras</span>
              </div>
              <MonitoringPanel
                selectedVehicle={selectedVehicle}
                cameras={cameras}
                evidence={evidence}
                onRefresh={() => loadMonitoring().catch((error) => setPanelError(error.message))}
              />
            </section>
          </div>

          <section className="panel-card">
            <div className="panel-card-head">
              <h2>Assistente operacional</h2>
              <span>Local ou Gemini</span>
            </div>

            <div className="assistant-panel">
              <label className="assistant-input">
                <Sparkles size={16} />
                <input
                  value={assistantQuestion}
                  onChange={(event) => setAssistantQuestion(event.target.value)}
                  placeholder="Ex.: há veículo offline ou em alerta agora?"
                />
              </label>
              <button type="button" className="primary-button" disabled={assistantBusy} onClick={handleAskAssistant}>
                <Bot size={16} />
                {assistantBusy ? 'Consultando...' : 'Perguntar'}
              </button>
            </div>

            {assistantAnswer ? <div className="assistant-answer">{assistantAnswer}</div> : null}
          </section>
        </section>
      </main>
    </div>
  );
}
