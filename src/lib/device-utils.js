import { normalizeText, numberOrNull } from './format.js';

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function positionTime(position = {}) {
  return position.fixTime || position.deviceTime || position.serverTime || null;
}

export function eventTime(event = {}) {
  return event.eventTime || event.serverTime || event.deviceTime || event.fixTime || event.time || null;
}

export function getAttr(source = {}, keys = [], fallback = '') {
  const attrs = source?.attributes && typeof source.attributes === 'object' ? source.attributes : {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== '') return attrs[key];
  }
  return fallback;
}

export function isValidPosition(position = {}) {
  const lat = numberOrNull(position.latitude);
  const lon = numberOrNull(position.longitude);
  return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function getLatLng(position = {}) {
  return isValidPosition(position) ? [Number(position.latitude), Number(position.longitude)] : null;
}

export function buildIndexes(positions = [], events = []) {
  const positionsById = new Map();
  const positionsByDeviceId = new Map();
  const latestEventByDeviceId = new Map();

  for (const position of normalizeArray(positions)) {
    const id = numberOrNull(position.id);
    const deviceId = numberOrNull(position.deviceId);

    if (id !== null) positionsById.set(id, position);
    if (deviceId !== null && !positionsByDeviceId.has(deviceId)) positionsByDeviceId.set(deviceId, position);
  }

  for (const event of normalizeArray(events)) {
    const deviceId = numberOrNull(event.deviceId || event.deviceID);
    if (deviceId === null) continue;

    const current = latestEventByDeviceId.get(deviceId);
    const currentTime = current ? new Date(eventTime(current) || 0).getTime() : 0;
    const nextTime = new Date(eventTime(event) || 0).getTime();

    if (!current || nextTime > currentTime) {
      latestEventByDeviceId.set(deviceId, event);
    }
  }

  return { positionsById, positionsByDeviceId, latestEventByDeviceId };
}

export function getDevicePosition(device = {}, indexes) {
  const positionId = numberOrNull(device.positionId);
  if (positionId !== null && indexes.positionsById.has(positionId)) {
    return indexes.positionsById.get(positionId);
  }
  const deviceId = numberOrNull(device.id);
  return deviceId !== null ? indexes.positionsByDeviceId.get(deviceId) || null : null;
}

export function latestAlertForDevice(device = {}, indexes) {
  const did = numberOrNull(device.id);
  return did !== null ? indexes.latestEventByDeviceId.get(did) || null : null;
}

export function statusFromDevice(device = {}, position = {}) {
  const status = normalizeText(device.status || getAttr(position, ['status']));
  if (status.includes('offline')) return 'offline';
  if (status.includes('unknown')) return 'unknown';
  if (status.includes('stopped')) return 'stopped';
  if (status.includes('online')) return 'online';
  const speed = numberOrNull(position.speed);
  if (speed && speed > 0) return 'moving';
  const ignition = getAttr(position, ['ignition', 'acc', 'engine'], false);
  if (ignition === true || ignition === 1 || ignition === 'true') return 'idle';
  return 'stopped';
}

export function vehicleCategory(device = {}, position = {}) {
  const text = normalizeText([
    device.category,
    device.name,
    device.uniqueId,
    getAttr(position, ['vehicleType', 'category', 'type'], '')
  ].join(' '));

  if (/moto|motorcycle/.test(text)) return 'motorcycle';
  if (/caminhao|truck/.test(text)) return 'truck';
  if (/onibus|bus/.test(text)) return 'bus';
  if (/van|furgao/.test(text)) return 'van';
  return 'car';
}

export function ignitionOn(position = {}) {
  const value = getAttr(position, ['ignition', 'acc', 'engine', 'io239'], false);
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function blocked(position = {}) {
  const value = getAttr(position, ['blocked', 'engineBlocked', 'relay', 'io240'], false);
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function resolveDriverUniqueId(device = {}, position = {}) {
  const attrsSources = [position, device];

  for (const source of attrsSources) {
    const unique = getAttr(source, ['driverUniqueId']);
    if (unique) return String(unique);
  }

  for (const source of attrsSources) {
    const value = getAttr(source, ['driverName', 'driver', 'driverId', 'rfid', 'ibutton']);
    if (value) return String(value);
  }

  return 'Sem motorista';
}

export function eventText(event = {}, position = {}) {
  const attrs = event?.attributes && typeof event.attributes === 'object' ? event.attributes : {};
  const type = String(event?.type || getAttr(position, ['alarm', 'event'], '') || '').trim();
  const alarm = attrs.alarm || getAttr(position, ['alarm'], '');

  const map = {
    deviceOnline: 'Online',
    deviceOffline: 'Offline',
    alarm: alarm || 'Alarme',
    overspeed: 'Excesso de velocidade',
    geofenceEnter: 'Entrou na cerca',
    geofenceExit: 'Saiu da cerca',
    ignitionOn: 'Ignição ligada',
    ignitionOff: 'Ignição desligada',
    motion: 'Em movimento',
    stop: 'Parado'
  };

  return map[type] || (type ? type : 'Sem alerta');
}

export function alertSeverity(event = {}) {
  const text = normalizeText(eventText(event));
  if (/offline|alarme|overspeed|velocidade|sos|panic|falha|violacao|violacao/.test(text)) return 'bad';
  if (/unknown|manutencao|manutencao/.test(text)) return 'warn';
  return 'good';
}

export function enrichDevices(devices, positions, events) {
  const indexes = buildIndexes(positions, events);
  return normalizeArray(devices).map((device) => {
    const position = getDevicePosition(device, indexes);
    const event = latestAlertForDevice(device, indexes);
    return {
      device,
      position,
      event,
      category: vehicleCategory(device, position || {}),
      status: statusFromDevice(device, position || {}),
      driverLabel: resolveDriverUniqueId(device, position || {})
    };
  });
}
