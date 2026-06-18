import { useMemo, useState } from 'react';
import { Camera, RefreshCcw, Save } from 'lucide-react';
import { api, imageProxyUrl } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';

export default function MonitoringPanel({ selectedVehicle, cameras = [], evidence = [], onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedCamera = useMemo(() => {
    if (!selectedVehicle) return null;
    return cameras.find((camera) => Number(camera.deviceId) === Number(selectedVehicle.device.id) && camera.enabled !== false) || null;
  }, [cameras, selectedVehicle]);

  const snapshotUrl = useMemo(() => {
    if (!selectedCamera) return '';
    if (selectedCamera.snapshotPath) return imageProxyUrl({ path: selectedCamera.snapshotPath });
    if (selectedCamera.streamPath && selectedCamera.mode === 'image') return imageProxyUrl({ path: selectedCamera.streamPath });
    return '';
  }, [selectedCamera]);

  const selectedEvidence = useMemo(() => {
    if (!selectedVehicle) return [];
    return evidence.filter((item) => Number(item.deviceId) === Number(selectedVehicle.device.id)).slice(0, 5);
  }, [evidence, selectedVehicle]);

  async function handleCapture() {
    if (!selectedVehicle || !selectedCamera) return;
    setBusy(true);
    setMessage('');

    try {
      await api.captureSnapshot({
        deviceId: selectedVehicle.device.id,
        deviceName: selectedVehicle.device.name,
        title: `Snapshot ${selectedVehicle.device.name}`,
        snapshotPath: selectedCamera.snapshotPath || selectedCamera.streamPath,
        note: `Captura realizada em ${new Date().toISOString()}`
      });
      setMessage('Snapshot capturado com sucesso.');
      onRefresh?.();
    } catch (error) {
      setMessage(error.message || 'Falha ao capturar snapshot.');
    } finally {
      setBusy(false);
    }
  }

  if (!selectedVehicle) {
    return <div className="panel-empty">Selecione um veículo para acessar o monitoramento.</div>;
  }

  return (
    <div className="monitoring-card">
      <div className="monitoring-head">
        <div>
          <h3>Monitoramento</h3>
          <p>{selectedVehicle.device.name}</p>
        </div>
        <div className="monitoring-actions">
          <button type="button" className="secondary-button" onClick={onRefresh}>
            <RefreshCcw size={16} />
            Atualizar
          </button>
          <button type="button" className="primary-button" disabled={!selectedCamera || busy} onClick={handleCapture}>
            <Save size={16} />
            {busy ? 'Capturando...' : 'Salvar snapshot'}
          </button>
        </div>
      </div>

      {selectedCamera ? (
        <div className="camera-view">
          {snapshotUrl ? (
            <img src={snapshotUrl} alt={`Câmera ${selectedVehicle.device.name}`} loading="lazy" />
          ) : (
            <div className="panel-empty">Esta câmera não possui snapshot configurado.</div>
          )}
        </div>
      ) : (
        <div className="panel-empty">Nenhuma câmera vinculada ao veículo selecionado.</div>
      )}

      {message ? <div className="inline-message">{message}</div> : null}

      <div className="details-panel">
        <div className="details-panel-title"><Camera size={16} /> Evidências recentes</div>
        {selectedEvidence.length ? (
          <div className="evidence-list">
            {selectedEvidence.map((item) => (
              <a key={item.id} className="evidence-item" href={item.imageUrl} target="_blank" rel="noreferrer">
                <span>{item.title}</span>
                <strong>{formatDateTime(item.createdAt)}</strong>
              </a>
            ))}
          </div>
        ) : (
          <div className="details-copy">Nenhuma evidência para o veículo selecionado.</div>
        )}
      </div>
    </div>
  );
}
