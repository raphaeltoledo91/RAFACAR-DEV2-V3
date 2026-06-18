import { Activity, AlertTriangle, Car, UserRound } from 'lucide-react';

function KpiCard({ icon: Icon, label, value, tone = 'default' }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <div className="kpi-icon"><Icon size={18} /></div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
      </div>
    </div>
  );
}

export default function SnapshotSummary({ fleet = [] }) {
  const online = fleet.filter((item) => ['online', 'moving', 'idle'].includes(item.status)).length;
  const moving = fleet.filter((item) => item.status === 'moving').length;
  const alerts = fleet.filter((item) => item.event && item.status !== 'online').length;
  const withDriver = fleet.filter((item) => item.driverLabel && item.driverLabel !== 'Sem motorista').length;

  return (
    <div className="kpi-grid">
      <KpiCard icon={Car} label="Veículos" value={fleet.length} />
      <KpiCard icon={Activity} label="Online" value={online} tone="good" />
      <KpiCard icon={AlertTriangle} label="Em alerta" value={alerts} tone="warn" />
      <KpiCard icon={UserRound} label="Com motorista" value={withDriver} />
      <KpiCard icon={Car} label="Em movimento" value={moving} tone="accent" />
    </div>
  );
}
