import React, {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import {ActiveTripStage, GeoPoint} from '../types/rideapp';

interface DarkRadarMapProps {
  pickup?: GeoPoint;
  pickupLabel?: string;
  dropoff?: GeoPoint;
  dropoffLabel?: string;
  driverCoords?: GeoPoint;
  driverLabel?: string;
  userGps?: GeoPoint | null;
  activeTripStage?: ActiveTripStage;
  targetCoords?: GeoPoint | null;
  targetLabel?: string;
  gpsWatchActive?: boolean;
  overlayContainerRef?: React.Ref<HTMLDivElement>;
  heightClass?: string;
}

interface RouteStep {
  distance: number;
  name: string;
  maneuver: {
    location: [number, number];
    type: string;
    modifier?: string;
  };
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry: {coordinates: [number, number][]};
    legs: Array<{steps: RouteStep[]}>;
  }>;
}

function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(lngDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function describeTurn(step: RouteStep): string {
  const {type, modifier} = step.maneuver;
  if (type === 'arrive') return 'You have arrived';
  if (type === 'depart') return step.name ? `Head toward ${step.name}` : 'Start driving';
  const action =
    type === 'turn' || type === 'end of road'
      ? `Turn ${modifier || ''}`.trim()
      : type === 'roundabout' || type === 'rotary'
      ? 'Enter the roundabout'
      : type === 'merge'
      ? `Merge ${modifier || ''}`.trim()
      : type === 'fork'
      ? `Keep ${modifier || 'straight'}`
      : 'Continue';
  return step.name ? `${action} onto ${step.name}` : action;
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
  activeTripStage,
  targetCoords,
  targetLabel = 'Trip destination',
  gpsWatchActive = false,
  overlayContainerRef,
  heightClass = 'h-full',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const routeRequestRef = useRef<AbortController | null>(null);
  const lastFitKeyRef = useRef<string>('');
  const routeOriginRef = useRef<(GeoPoint & {targetKey: string}) | null>(null);
  const [watchedCoords, setWatchedCoords] = useState<GeoPoint | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [stepIndex, setStepIndex] = useState(1);
  const [routeError, setRouteError] = useState<string | null>(null);
  const currentCoords = watchedCoords || driverCoords || null;

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
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => routeRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!gpsWatchActive || !('geolocation' in navigator)) {
      setWatchedCoords(null);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({coords}) =>
        setWatchedCoords({
          lat: Number(coords.latitude.toFixed(6)),
          lng: Number(coords.longitude.toFixed(6)),
        }),
      (error) => {
        console.error('Dark radar GPS watch failed:', error.message);
      },
      {enableHighAccuracy: true, maximumAge: 5000}
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsWatchActive]);

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

    if (currentCoords) {
      const carMarker = L.marker([currentCoords.lat, currentCoords.lng], {
        icon: createDriverCarIcon(),
        zIndexOffset: 500,
      }).bindPopup(`<strong>${driverLabel}</strong><br/>Live Phone GPS Telemetry`);
      carMarker.addTo(group);
      boundsPoints.push([currentCoords.lat, currentCoords.lng]);
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

    const fitKey = `${pickup?.lat ?? ''},${pickup?.lng ?? ''}-${dropoff?.lat ?? ''},${dropoff?.lng ?? ''}-${Boolean(currentCoords)}`;
    if (boundsPoints.length >= 2 && lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      map.fitBounds(L.latLngBounds(boundsPoints), {padding: [38, 38], maxZoom: 14});
    } else if (boundsPoints.length === 1 && lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      map.setView(boundsPoints[0], 13);
    }
  }, [pickup, pickupLabel, dropoff, dropoffLabel, currentCoords, driverLabel, userGps]);

  useEffect(() => {
    if (!targetCoords || !currentCoords) {
      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
      routeOriginRef.current = null;
      setRouteSteps([]);
      setRouteCoordinates(null);
      setStepIndex(1);
      setRouteError(null);
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      return;
    }

    const previousOrigin = routeOriginRef.current;
    const targetKey = `${targetCoords.lat},${targetCoords.lng}`;
    const sameTarget = previousOrigin && previousOrigin.targetKey === targetKey;
    if (
      sameTarget &&
      distanceMeters(previousOrigin, currentCoords) < 300
    ) {
      return;
    }

    const origin = currentCoords;
    routeRequestRef.current?.abort();
    routeOriginRef.current = {
      ...origin,
      targetKey,
    };
    const controller = new AbortController();
    routeRequestRef.current = controller;
    const routeUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.lng},${origin.lat};${targetCoords.lng},${targetCoords.lat}` +
      '?steps=true&overview=full&geometries=geojson';

    const fetchRoute = async () => {
      try {
        const response = await fetch(routeUrl, {signal: controller.signal});
        if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}`);
        const data = (await response.json()) as OsrmRouteResponse;
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route || !route.legs[0]?.steps.length) {
          throw new Error(`OSRM could not find a route (${data.code})`);
        }
        setRouteSteps(route.legs[0].steps);
        setRouteCoordinates(route.geometry.coordinates);
        setStepIndex(Math.min(1, route.legs[0].steps.length - 1));
        setRouteError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRouteError(error instanceof Error ? error.message : 'Unable to load route');
        console.error('Dark radar route request failed:', error);
      } finally {
        if (routeRequestRef.current === controller) routeRequestRef.current = null;
      }
    };

    void fetchRoute();
  }, [targetCoords, currentCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeCoordinates) return;
    routeLayerRef.current?.remove();
    routeLayerRef.current = L.polyline(
      routeCoordinates.map(([lng, lat]): L.LatLngExpression => [lat, lng]),
      {color: '#D4AF37', weight: 5, opacity: 0.9}
    ).addTo(map);
  }, [routeCoordinates]);

  useEffect(() => {
    if (!currentCoords || stepIndex >= routeSteps.length - 1) return;
    const nextStep = routeSteps[stepIndex];
    if (!nextStep) return;
    const [lng, lat] = nextStep.maneuver.location;
    if (distanceMeters(currentCoords, {lat, lng}) < 45) {
      setStepIndex((current) => Math.min(current + 1, routeSteps.length - 1));
    }
  }, [currentCoords, routeSteps, stepIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !currentCoords) return;
    map.setView([currentCoords.lat, currentCoords.lng], Math.max(map.getZoom(), 15), {
      animate: true,
    });
  }, [currentCoords]);

  useEffect(() => {
    if (!routeSteps.length || !window.speechSynthesis) return;
    const step = routeSteps[stepIndex];
    if (!step) return;
    const utterance = new SpeechSynthesisUtterance(describeTurn(step));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [routeSteps, stepIndex]);

  const nextStep = routeSteps[stepIndex];
  const nextTurnDistance = nextStep && currentCoords
    ? Math.max(0, Math.round(distanceMeters(currentCoords, {
        lat: nextStep.maneuver.location[1],
        lng: nextStep.maneuver.location[0],
      })))
    : null;

  return (
    <div className="relative h-[300px] w-full overflow-hidden rounded-2xl border border-[#D4AF37] bg-[#0B0B0D]">
      <div ref={containerRef} className={`w-full ${heightClass} z-0`} />
      <div
        ref={overlayContainerRef}
        className="pointer-events-none absolute inset-0 z-20"
      />
      {activeTripStage && targetCoords && (
        <div className="absolute top-3 left-3 right-3 z-10 rounded-lg border border-[#D4AF37]/70 bg-[#0B0B0D]/95 px-3 py-2 text-[#DFC07D] shadow-lg">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#D4AF37]">
            Next turn · {activeTripStage.replaceAll('_', ' ')} · {targetLabel}
          </div>
          <div className="text-sm font-bold">
            {routeError
              ? 'Route guidance unavailable'
              : nextStep
              ? `${describeTurn(nextStep)}${nextTurnDistance === null ? '' : ` · ${nextTurnDistance} m`}`
              : 'Loading route guidance...'}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg bg-[#0B0B0D]/90 backdrop-blur-md border border-[#C5A059]/30 px-2.5 py-1 text-[11px] font-mono tabular-nums text-[#C5A059]">
        OKC Dark Radar · $0 Native GPS
      </div>
    </div>
  );
};
