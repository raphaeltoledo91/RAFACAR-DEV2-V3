export function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date);
}

export function formatRelativeTime(value) {
  if (!value) return 'sem horário';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sem horário';
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const abs = Math.abs(diffMinutes);
  if (abs < 1) return 'agora';
  if (abs < 60) return `${abs} min ${diffMinutes < 0 ? 'atrás' : 'à frente'}`;
  const diffHours = Math.round(abs / 60);
  return `${diffHours} h ${diffMinutes < 0 ? 'atrás' : 'à frente'}`;
}

export function formatSpeed(value) {
  const speed = numberOrNull(value);
  return speed === null ? '0 km/h' : `${Math.round(speed)} km/h`;
}

export function formatCoordinate(value) {
  const num = numberOrNull(value);
  return num === null ? '—' : num.toFixed(5);
}

export function formatPercent(value) {
  const num = numberOrNull(value);
  return num === null ? '—' : `${Math.round(num)}%`;
}

export function yesNo(value) {
  if (value === null || value === undefined || value === '') return '—';
  return value === true || value === 'true' || value === 1 || value === '1' ? 'Sim' : 'Não';
}
