import React, {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {ActiveTripStage, GeoPoint} from '../types/rideapp';

interface DarkRadarMapProps {
  driverCoords: GeoPoint;
  targetCoords?: GeoPoint | null;
  targetLabel?: string;
  activeTripStage?: ActiveTripStage;
  gpsWatchActive: boolean;
  onPositionChange: (position: GeoPoint) => void;
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
    distance: number;
    duration: number;
    geometry: {coordinates: [number, number][]};
    legs: Array<{steps: RouteStep[]}>;
  }>;
}

const OKC_CENTER: L.LatLngTuple = [35.4676, -97.5164];
const CARTO_VOYAGER_TILES =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const OPENSTREETMAP_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION =
  `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

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

function describeTurn(step?: RouteStep): string {
  if (!step) return 'Loading route guidance';
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

function turnArrow(step?: RouteStep): string {
  const {type, modifier} = step?.maneuver ?? {type: 'continue'};
  if (type === 'arrive') return '●';
  if (type === 'roundabout' || type === 'rotary') return '↻';
  if (modifier?.includes('left')) return modifier.includes('sharp') ? '↶' : '↰';
  if (modifier?.includes('right')) return modifier.includes('sharp') ? '↷' : '↱';
  return '↑';
}

function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 528) return `In ${Math.max(0, Math.round(feet / 10) * 10)} ft`;
  return `In ${(meters / 1609.344).toFixed(1)} mi`;
}

function createDriverIcon(heading: number | null): L.DivIcon {
  const arrow = document.createElement('span');
  arrow.textContent = '▲';
  arrow.style.transform = `rotate(${heading ?? 0}deg)`;
  const icon = document.createElement('div');
  icon.style.cssText =
    'display:flex;width:52px;height:52px;align-items:center;justify-content:center;border:3px solid #d4af37;border-radius:9999px;background:#0b0b0d;color:#dfc07d;font-size:20px;font-weight:900;box-shadow:0 0 0 5px rgba(212,175,55,.24),0 5px 18px rgba(0,0,0,.65);';
  icon.setAttribute('aria-label', 'Live driver GPS location');
  icon.appendChild(arrow);
  return L.divIcon({html: icon, className: '', iconSize: [52, 52], iconAnchor: [26, 26]});
}

export const DarkRadarMap: React.FC<DarkRadarMapProps> = ({
  driverCoords,
  targetCoords,
  targetLabel = 'Destination',
  activeTripStage,
  gpsWatchActive,
  onPositionChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const positionCallbackRef = useRef(onPositionChange);
  const routeRequestRef = useRef<AbortController | null>(null);
  const routeOriginRef = useRef<(GeoPoint & {targetKey: string}) | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GeoPoint>(driverCoords);
  const [heading, setHeading] = useState<number | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [stepIndex, setStepIndex] = useState(1);
  const [nextTurnDistance, setNextTurnDistance] = useState<number | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  positionCallbackRef.current = onPositionChange;
  const isNavigating = Boolean(
    targetCoords &&
      (activeTripStage === 'en_route_pickup' ||
        activeTripStage === 'en_route_stop1' ||
        activeTripStage === 'in_progress')
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = L.map(container, {
      attributionControl: true,
      zoomControl: false,
      preferCanvas: true,
    }).setView(OKC_CENTER, 15);
    mapRef.current = map;

    let usingOsmFallback = false;
    let osmErrorReported = false;
    const cartoTiles = L.tileLayer(CARTO_VOYAGER_TILES, {
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
      subdomains: 'abcd',
    });
    const fallbackToOsm = () => {
      if (usingOsmFallback) return;
      usingOsmFallback = true;
      console.error('Carto Voyager tiles failed; switching to OpenStreetMap tiles.');
      map.removeLayer(cartoTiles);
      const osmTiles = L.tileLayer(OPENSTREETMAP_TILES, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
        subdomains: 'abc',
      });
      osmTiles.on('tileerror', () => {
        if (osmErrorReported) return;
        osmErrorReported = true;
        console.error('OpenStreetMap tile loading failed.');
      });
      osmTiles.addTo(map);
    };
    cartoTiles.once('tileerror', fallbackToOsm);
    cartoTiles.addTo(map);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);
    map.invalidateSize();

    return () => {
      resizeObserver.disconnect();
      cartoTiles.off('tileerror', fallbackToOsm);
      driverMarkerRef.current = null;
      routeLayersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      routeRequestRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!gpsWatchActive || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      ({coords}) => {
        const position = {
          lat: Number(coords.latitude.toFixed(6)),
          lng: Number(coords.longitude.toFixed(6)),
        };
        const nextHeading =
          coords.heading !== null && Number.isFinite(coords.heading)
            ? coords.heading
            : null;
        setGpsPosition(position);
        setHeading(nextHeading);
        positionCallbackRef.current(position);
      },
      (error) => console.error('Driver GPS update failed:', error.message),
      {enableHighAccuracy: true, maximumAge: 3000, timeout: 10000}
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsWatchActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker([gpsPosition.lat, gpsPosition.lng], {
        icon: createDriverIcon(heading),
        keyboard: false,
      }).addTo(map);
    } else {
      driverMarkerRef.current.setLatLng([gpsPosition.lat, gpsPosition.lng]);
      driverMarkerRef.current.setIcon(createDriverIcon(heading));
    }

    if (isNavigating) {
      map.setView([gpsPosition.lat, gpsPosition.lng], 17, {animate: false});
    } else {
      map.panTo([gpsPosition.lat, gpsPosition.lng], {animate: false});
    }
  }, [gpsPosition, heading, isNavigating]);

  useEffect(() => {
    if (!isNavigating || !targetCoords) {
      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
      routeOriginRef.current = null;
      setRouteSteps([]);
      setStepIndex(1);
      setNextTurnDistance(null);
      setRouteError(null);
      const map = mapRef.current;
      if (map) {
        routeLayersRef.current.forEach((layer) => map.removeLayer(layer));
        routeLayersRef.current = [];
      }
      return;
    }

    const targetKey = `${targetCoords.lat},${targetCoords.lng}`;
    const previousOrigin = routeOriginRef.current;
    if (
      previousOrigin?.targetKey === targetKey &&
      distanceMeters(previousOrigin, gpsPosition) < 300
    ) {
      return;
    }

    const controller = new AbortController();
    routeRequestRef.current?.abort();
    routeRequestRef.current = controller;
    routeOriginRef.current = {...gpsPosition, targetKey};
    setRouteSteps([]);
    setStepIndex(1);
    setNextTurnDistance(null);
    setRouteError(null);
    const map = mapRef.current;
    if (map) {
      routeLayersRef.current.forEach((layer) => map.removeLayer(layer));
      routeLayersRef.current = [];
    }
    const routeUrl =
      `${OSRM_ROUTE_URL}/${gpsPosition.lng},${gpsPosition.lat};` +
      `${targetCoords.lng},${targetCoords.lat}?steps=true&overview=full&geometries=geojson`;

    const loadRoute = async () => {
      try {
        const response = await fetch(routeUrl, {signal: controller.signal});
        if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}`);
        const data = (await response.json()) as OsrmRouteResponse;
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route || !route.legs[0]?.steps.length) {
          throw new Error(`OSRM could not find a route (${data.code})`);
        }

        setRouteSteps(route.legs[0].steps);
        const firstTurnIndex = Math.min(1, route.legs[0].steps.length - 1);
        setStepIndex(firstTurnIndex);
        setNextTurnDistance(route.legs[0].steps[firstTurnIndex]?.distance ?? route.distance);
        setRouteError(null);

        const map = mapRef.current;
        if (map) {
          routeLayersRef.current.forEach((layer) => map.removeLayer(layer));
          const routePoints = route.geometry.coordinates.map(
            ([lng, lat]): L.LatLngTuple => [lat, lng]
          );
          routeLayersRef.current = [
            L.polyline(routePoints, {
              color: '#2563EB',
              weight: 13,
              opacity: 0.3,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map),
            L.polyline(routePoints, {
              color: '#2563EB',
              weight: 7,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(map),
          ];
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setRouteError(error instanceof Error ? error.message : 'Route unavailable');
        console.error('Driver route request failed:', error);
      } finally {
        if (routeRequestRef.current === controller) routeRequestRef.current = null;
      }
    };

    void loadRoute();
  }, [isNavigating, gpsPosition, targetCoords]);

  useEffect(() => {
    if (!isNavigating || !gpsPosition || !routeSteps.length) return;
    const nextStep = routeSteps[stepIndex];
    if (!nextStep) return;
    const [lng, lat] = nextStep.maneuver.location;
    const distance = distanceMeters(gpsPosition, {lat, lng});
    setNextTurnDistance(distance);
    if (distance < 45 && stepIndex < routeSteps.length - 1) {
      setStepIndex((current) => current + 1);
    }
  }, [gpsPosition, isNavigating, routeSteps, stepIndex]);

  const currentStep = routeSteps[stepIndex];

  return (
    <div className="absolute inset-0 z-0 h-full w-full bg-transparent">
      <div
        ref={mapContainerRef}
        className="h-full w-full bg-[#e8eaed]"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          background: '#e8eaed',
          left: '50%',
          right: 'auto',
          transform: 'translateX(-50%)',
        }}
      />
      {isNavigating && (
        <div className="absolute left-3 right-3 top-3 z-10 flex min-h-16 items-center gap-3 rounded-xl border border-[#D4AF37]/70 bg-[#0B0B0D]/95 px-3 py-2 text-[#DFC07D] shadow-xl backdrop-blur-md">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#d4af37] text-3xl font-bold leading-none text-[#0b0b0d]">
            {turnArrow(currentStep)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#f5df9a]">
              {routeError
                ? 'Route guidance unavailable'
                : nextTurnDistance === null
                ? 'Loading route...'
                : formatDistance(nextTurnDistance)}
            </div>
            <div className="truncate text-sm font-bold">
              {currentStep ? describeTurn(currentStep) : `Drive to ${targetLabel}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
