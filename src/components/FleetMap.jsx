import { useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { getLatLng, eventText } from '../lib/device-utils.js';
import { formatDateTime, formatSpeed } from '../lib/format.js';

const DEFAULT_CENTER = [-22.35, -48.78];
const DEFAULT_ZOOM = 6;

function createSelectedMarker() {
  return L.divIcon({
    className: 'selected-marker',
    html: '<div class="selected-marker__dot"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

export default function FleetMap({ fleet = [], selectedVehicle }) {
  const points = useMemo(() => fleet.map((item) => ({
    ...item,
    latLng: getLatLng(item.position)
  })).filter((item) => item.latLng), [fleet]);

  const selectedPoint = points.find((item) => Number(item.device.id) === Number(selectedVehicle?.device?.id)) || null;
  const center = selectedPoint?.latLng || points[0]?.latLng || DEFAULT_CENTER;

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={selectedPoint ? 14 : DEFAULT_ZOOM} scrollWheelZoom className="map-element">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {points.map((item) => {
          const isSelected = Number(item.device.id) === Number(selectedVehicle?.device?.id);
          const color = item.status === 'offline'
            ? '#ef4444'
            : item.status === 'moving'
              ? '#22c55e'
              : '#38bdf8';

          if (isSelected) {
            return (
              <Marker key={item.device.id} position={item.latLng} icon={createSelectedMarker()}>
                <Popup>
                  <strong>{item.device.name}</strong><br />
                  {item.driverLabel}<br />
                  {formatSpeed(item.position?.speed)}<br />
                  {eventText(item.event, item.position)}
                </Popup>
              </Marker>
            );
          }

          return (
            <CircleMarker
              key={item.device.id}
              center={item.latLng}
              radius={7}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2 }}
            >
              <Popup>
                <strong>{item.device.name}</strong><br />
                {item.driverLabel}<br />
                Velocidade: {formatSpeed(item.position?.speed)}<br />
                Último sinal: {formatDateTime(item.position?.fixTime || item.position?.serverTime)}<br />
                Evento: {eventText(item.event, item.position)}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
