import React, {useEffect, useRef} from 'react';
import L from 'leaflet';
import {GeoPoint} from '../types/rideapp';

interface DarkRadarMapProps {
  pickup?: GeoPoint;
  pickupLabel?: string;
  dropoff?: GeoPoint;
  dropoffLabel?: string;
  driverCoords?: GeoPoint;
  driverLabel?: string;
  userGps?: GeoPoint | null;
  heightClass?: string;
}

function createPinIcon(bgHex: string, ringHex: string, glyph: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-rideapp-pin',
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:${bgHex};border:2px solid ${ringHex};box-shadow:0 4px 14px rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;color:#0B0B0D;font-weight:700;font-size:12px;">${glyph}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function createDriverCarIcon(): L.DivIcon {
  return L.divIcon({
    className: 'custom-rideapp-driver',
    html: `<div style="width:38px;height:38px;border-radius:9999px;background:linear-gradient(135deg,#DFC07D 0%,#B8860B 50%,#8B6508 100%);border:2px solid #0B0B0D;box-shadow:0 0 0 4px rgba(212,175,55,0.28),0 6px 16px rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0B0D" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/>
        <path d="M9 17h6"/>
        <circle cx="17" cy="17" r="2"/>
      </svg>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
  });
}

export const DarkRadarMap: React.FC<DarkRadarMapProps> = ({
  pickup,
  pickupLabel = 'Pickup Point',
  dropoff,
  dropoffLabel = 'Drop-off Destination',
  driverCoords,
  driverLabel = 'Co-op Driver Live GPS',
  userGps,
  heightClass = 'h-[280px] sm:h-[340px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFitKeyRef = useRef<string>('');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const defaultOkcCenter: [number, number] = [
      pickup?.lat ?? 35.4668,
      pickup?.lng ?? -97.5181,
    ];

    const map = L.map(containerRef.current, {
      center: defaultOkcCenter,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    if (pickup) {
      const pMarker = L.marker([pickup.lat, pickup.lng], {
        icon: createPinIcon('#C5A059', '#DFC07D', 'P'),
      }).bindPopup(`<strong>Pickup</strong><br/>${pickupLabel}`);
      pMarker.addTo(group);
      boundsPoints.push([pickup.lat, pickup.lng]);
    }

    if (dropoff) {
      const dMarker = L.marker([dropoff.lat, dropoff.lng], {
        icon: createPinIcon('#B8860B', '#C5A059', 'D'),
      }).bindPopup(`<strong>Drop-off</strong><br/>${dropoffLabel}`);
      dMarker.addTo(group);
      boundsPoints.push([dropoff.lat, dropoff.lng]);
    }

    if (pickup && dropoff) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        {
          color: '#C5A059',
          weight: 3,
          opacity: 0.78,
          dashArray: '7 7',
        }
      ).addTo(group);
    }

    if (driverCoords) {
      const carMarker = L.marker([driverCoords.lat, driverCoords.lng], {
        icon: createDriverCarIcon(),
        zIndexOffset: 500,
      }).bindPopup(`<strong>${driverLabel}</strong><br/>Live Phone GPS Telemetry`);
      carMarker.addTo(group);
      boundsPoints.push([driverCoords.lat, driverCoords.lng]);

      if (pickup) {
        L.polyline(
          [
            [driverCoords.lat, driverCoords.lng],
            [pickup.lat, pickup.lng],
          ],
          {
            color: '#DFC07D',
            weight: 3.5,
            opacity: 0.92,
          }
        ).addTo(group);
      }
    }

    if (userGps) {
      const gpsCircle = L.circleMarker([userGps.lat, userGps.lng], {
        radius: 7,
        color: '#DFC07D',
        weight: 2,
        fillColor: '#C5A059',
        fillOpacity: 0.95,
      }).bindPopup('<strong>Phone Native GPS</strong><br/>HTML5 Geolocation Active');
      gpsCircle.addTo(group);
      boundsPoints.push([userGps.lat, userGps.lng]);
    }

    const fitKey = `${pickup?.lat ?? ''},${pickup?.lng ?? ''}-${dropoff?.lat ?? ''},${dropoff?.lng ?? ''}-${Boolean(driverCoords)}`;
    if (boundsPoints.length >= 2 && lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      map.fitBounds(L.latLngBounds(boundsPoints), {padding: [38, 38], maxZoom: 14});
    } else if (boundsPoints.length === 1 && lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      map.setView(boundsPoints[0], 13);
    }
  }, [pickup, pickupLabel, dropoff, dropoffLabel, driverCoords, driverLabel, userGps]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-[#C5A059]/30 bg-[#0B0B0D]">
      <div ref={containerRef} className={`w-full ${heightClass} z-0`} />
      <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-lg bg-[#0B0B0D]/90 backdrop-blur-md border border-[#C5A059]/30 px-2.5 py-1 text-[11px] font-mono tabular-nums text-[#C5A059]">
        OKC Dark Radar · $0 Native GPS
      </div>
    </div>
  );
};
