import { Activity, Gauge, UserRound, AlertTriangle } from 'lucide-react';
import { eventText } from '../lib/device-utils.js';
import { formatDateTime, formatRelativeTime, formatSpeed } from '../lib/format.js';

function statusLabel(status) {
  const map = {
    online: 'Online',
    moving: 'Em movimento',
    idle: 'Ligado parado',
    stopped: 'Parado',
    offline: 'Offline',
    unknown: 'Desconhecido'
  };
  return map[status] || 'Sem status';
}

export default function FleetList({ fleet = [], selectedId, onSelect }) {
  if (!fleet.length) {
    return <div className="panel-empty">Nenhum veículo disponível.</div>;
  }

  return (
    <div className="fleet-list">
      {fleet.map((item) => {
        const active = Number(selectedId) === Number(item.device.id);
        const eventLabel = eventText(item.event, item.position);
        const lastSeen = item.position?.fixTime || item.position?.serverTime || item.device?.lastUpdate;

        return (
          <button
            key={item.device.id}
            type="button"
            className={`fleet-item ${active ? 'active' : ''}`}
            onClick={() => onSelect(item.device.id)}
          >
            <div className="fleet-item-row">
              <div>
                <div className="fleet-item-title">{item.device.name || item.device.uniqueId || `ID ${item.device.id}`}</div>
                <div className="fleet-item-subtitle">{item.device.uniqueId || 'Sem uniqueId'}</div>
              </div>
              <span className={`status-pill tone-${item.status}`}>{statusLabel(item.status)}</span>
            </div>

            <div className="fleet-item-meta">
              <span><Gauge size={14} /> {formatSpeed(item.position?.speed)}</span>
              <span><UserRound size={14} /> {item.driverLabel}</span>
            </div>

            <div className="fleet-item-meta">
              <span><AlertTriangle size={14} /> {eventLabel}</span>
              <span><Activity size={14} /> {formatRelativeTime(lastSeen)}</span>
            </div>

            <div className="fleet-item-foot">
              Última posição: {formatDateTime(lastSeen)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
