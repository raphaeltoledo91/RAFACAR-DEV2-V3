import { useEffect, useMemo, useState } from 'react';
import { BatteryCharging, LocateFixed, Lock, Send, UserRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { blocked, ignitionOn, eventText, getAttr } from '../lib/device-utils.js';
import { formatCoordinate, formatDateTime, formatPercent, formatSpeed, yesNo } from '../lib/format.js';

export default function DeviceDetails({ selectedVehicle, onRefresh }) {
  const [commandTypes, setCommandTypes] = useState([]);
  const [commandType, setCommandType] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const deviceId = selectedVehicle?.device?.id;

  useEffect(() => {
    let mounted = true;
    setCommandTypes([]);
    setCommandType('');

    if (!deviceId) return undefined;

    api.getCommandTypes(deviceId)
      .then((payload) => {
        if (!mounted) return;
        setCommandTypes(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (!mounted) return;
        setCommandTypes([]);
      });

    return () => {
      mounted = false;
    };
  }, [deviceId]);

  const metrics = useMemo(() => {
    if (!selectedVehicle) return [];
    const position = selectedVehicle.position || {};

    return [
      ['Motorista', selectedVehicle.driverLabel],
      ['Ignição', yesNo(ignitionOn(position))],
      ['Bloqueio', yesNo(blocked(position))],
      ['Velocidade', formatSpeed(position.speed)],
      ['Bateria', formatPercent(getAttr(position, ['batteryLevel', 'batteryPercent', 'battery']))],
      ['Latitude', formatCoordinate(position.latitude)],
      ['Longitude', formatCoordinate(position.longitude)],
      ['Último evento', eventText(selectedVehicle.event, position)],
      ['Última atualização', formatDateTime(position.fixTime || position.serverTime || selectedVehicle.device.lastUpdate)]
    ];
  }, [selectedVehicle]);

  async function handleSendCommand() {
    if (!deviceId || !commandType) return;
    setSending(true);
    setMessage('');

    try {
      await api.sendCommand({ deviceId, type: commandType, attributes: {} });
      setMessage('Comando enviado com sucesso.');
      onRefresh?.();
    } catch (error) {
      setMessage(error.message || 'Falha ao enviar comando.');
    } finally {
      setSending(false);
    }
  }

  if (!selectedVehicle) {
    return <div className="panel-empty">Selecione um veículo para ver detalhes.</div>;
  }

  return (
    <div className="details-card">
      <div className="details-head">
        <div>
          <h3>{selectedVehicle.device.name}</h3>
          <p>{selectedVehicle.device.uniqueId || 'Sem uniqueId'}</p>
        </div>
      </div>

      <div className="details-grid">
        {metrics.map(([label, value]) => (
          <div key={label} className="details-item">
            <span>{label}</span>
            <strong>{value || '—'}</strong>
          </div>
        ))}
      </div>

      <div className="details-stack">
        <div className="details-panel">
          <div className="details-panel-title"><UserRound size={16} /> Identificação</div>
          <div className="details-copy">
            O identificador do motorista agora prioriza <code>driverUniqueId</code> vindo do backend. Telefone não é mais usado como identificação principal.
          </div>
        </div>

        <div className="details-panel">
          <div className="details-panel-title"><Send size={16} /> Comandos</div>
          <div className="command-row">
            <select value={commandType} onChange={(event) => setCommandType(event.target.value)}>
              <option value="">Selecione um comando</option>
              {commandTypes.map((item) => (
                <option key={item.type || item.name} value={item.type || item.name}>
                  {item.type || item.name}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-button" disabled={!commandType || sending} onClick={handleSendCommand}>
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
          {message ? <div className="inline-message">{message}</div> : null}
        </div>

        <div className="details-panel">
          <div className="details-panel-title"><LocateFixed size={16} /> Posição</div>
          <div className="details-copy">
            {selectedVehicle.position?.address || 'Endereço indisponível no snapshot atual.'}
          </div>
        </div>

        <div className="details-panel">
          <div className="details-panel-title"><BatteryCharging size={16} /> Energia</div>
          <div className="details-copy">
            Tensão: {getAttr(selectedVehicle.position, ['power', 'externalPower', 'voltage', 'batteryVoltage']) || '—'}
          </div>
        </div>

        <div className="details-panel">
          <div className="details-panel-title"><Lock size={16} /> Estado</div>
          <div className="details-copy">
            Status operacional consolidado: {selectedVehicle.status}
          </div>
        </div>
      </div>
    </div>
  );
}
