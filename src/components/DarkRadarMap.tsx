import React, {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {ActiveTripStage, GeoPoint} from '../types/rideapp';

interface DarkRadarMapProps {
  pickup?: GeoPoint;
  pickupLabel?: string;
  stop1?: GeoPoint;
  stop1Label?: string;
  dropoff?: GeoPoint;
  dropoffLabel?: string;
  driverCoords?: GeoPoint;
  driverLabel?: string;
  userGps?: GeoPoint | null;
  activeTripStage?: ActiveTripStage;
  targetCoords?: GeoPoint | null;
  targetLabel?: string;
  focusCoords?: GeoPoint;
  focusRequest?: number;
  gpsWatchActive?: boolean;
  overlayContainerRef?: React.Ref<HTMLDivElement>;
  heightClass?: string;
  showRecenterButton?: boolean;
  fullScreen?: boolean;
}

type RouteCoordinate = [number, number];

interface RouteStep {
  distance: number;
  name: string;
  maneuver: {
    location: RouteCoordinate;
    type: string;
    modifier?: string;
  };
  geometry?: {coordinates: RouteCoordinate[]};
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {coordinates: RouteCoordinate[]};
    legs: Array<{steps: RouteStep[]}>;
  }>;
}

interface WatchedPosition {
  coords: GeoPoint;
  heading: number | null;
}

interface TripRouteCoordinates {
  approach: RouteCoordinate[];
  trip: RouteCoordinate[];
}

const OKC_CENTER: L.LatLngTuple = [35.4676, -97.5164];
const CARTO_VOYAGER_TILES =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const OPENSTREETMAP_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION =
  `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

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

function coordinatesForLegs(legs: Array<{steps: RouteStep[]}>): RouteCoordinate[] {
  const coordinates = legs.flatMap((leg) =>
    leg.steps.flatMap((step) => step.geometry?.coordinates ?? [])
  );
  return coordinates.filter(
    (coordinate, index) =>
      index === 0 ||
      coordinate[0] !== coordinates[index - 1][0] ||
      coordinate[1] !== coordinates[index - 1][1]
  );
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
  const element = document.createElement('div');
  element.style.cssText =
    'display:flex;width:52px;height:52px;align-items:center;justify-content:center;border:3px solid #d4af37;border-radius:9999px;background:#0b0b0d;color:#dfc07d;font-size:20px;font-weight:900;box-shadow:0 0 0 5px rgba(212,175,55,.24),0 5px 18px rgba(0,0,0,.65);';
  element.setAttribute('aria-label', 'Live driver GPS location');
  const arrow = document.createElement('span');
  arrow.textContent = '▲';
  arrow.style.transform = `rotate(${heading ?? 0}deg)`;
  element.appendChild(arrow);

  return L.divIcon({
    html: element,
    className: '',
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

function createPlaceIcon(glyph: string, label: string): L.DivIcon {
  const element = document.createElement('div');
  element.style.cssText =
    'display:flex;width:36px;height:36px;align-items:center;justify-content:center;border:2px solid #f5df9a;border-radius:9999px;background:#b8860b;color:#0b0b0d;font-size:12px;font-weight:900;box-shadow:0 2px 8px rgba(0,0,0,.5);';
  element.textContent = glyph;
  element.title = label;
  element.setAttribute('aria-label', label);

  return L.divIcon({
    html: element,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function upsertMarker(
  map: L.Map,
  markerRef: React.MutableRefObject<L.Marker | null>,
  point: GeoPoint | null | undefined,
  icon: L.DivIcon,
  label: string
): void {
  if (!point) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }

  if (!markerRef.current) {
    markerRef.current = L.marker([point.lat, point.lng], {
      icon,
      title: label,
      keyboard: false,
    }).addTo(map);
    return;
  }

  markerRef.current.setLatLng([point.lat, point.lng]);
  markerRef.current.setIcon(icon);
  markerRef.current.options.title = label;
  const element = markerRef.current.getElement();
  if (element) element.title = label;
}

function clearPolylines(map: L.Map, layers: React.MutableRefObject<L.Polyline[]>): void {
  layers.current.forEach((layer) => map.removeLayer(layer));
  layers.current = [];
}

function routeLatLngs(coordinates: RouteCoordinate[]): L.LatLngTuple[] {
  return coordinates.map(([lng, lat]) => [lat, lng]);
}

export const DarkRadarMap: React.FC<DarkRadarMapProps> = ({
  pickup,
  pickupLabel = 'Pickup Point',
  stop1,
  stop1Label = 'Stop 1',
  dropoff,
  dropoffLabel = 'Drop-off Destination',
  driverCoords,
  driverLabel = 'Co-op Driver Live GPS',
  userGps,
  activeTripStage,
  targetCoords,
  targetLabel = 'Trip destination',
  focusCoords,
  focusRequest = 0,
  gpsWatchActive = false,
  overlayContainerRef,
  heightClass = 'h-full',
  showRecenterButton = true,
  fullScreen = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const stop1MarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const tripRouteLayersRef = useRef<L.Polyline[]>([]);
  const routeRequestRef = useRef<AbortController | null>(null);
  const routeOriginRef = useRef<(GeoPoint & {targetKey: string}) | null>(null);
  const tripRouteRequestRef = useRef<AbortController | null>(null);
  const tripRouteOriginRef = useRef<(GeoPoint & {targetKey: string}) | null>(null);
  const spokenStepRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [watchedPosition, setWatchedPosition] = useState<WatchedPosition | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[] | null>(null);
  const [tripRouteCoordinates, setTripRouteCoordinates] =
    useState<TripRouteCoordinates | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(1);
  const [routeError, setRouteError] = useState<string | null>(null);
  const currentCoords = watchedPosition?.coords || userGps || driverCoords || null;
  const heading = watchedPosition?.heading ?? null;
  const isNavigating = Boolean(
    targetCoords &&
      (activeTripStage === 'en_route_pickup' ||
        activeTripStage === 'en_route_stop1' ||
        activeTripStage === 'in_progress')
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      attributionControl: true,
      zoomControl: false,
      preferCanvas: true,
    }).setView(OKC_CENTER, 15);
    mapRef.current = map;

    let usingFallback = false;
    let osmTileErrorReported = false;
    const cartoTiles = L.tileLayer(CARTO_VOYAGER_TILES, {
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
      subdomains: 'abcd',
    });
    const fallbackToOpenStreetMap = () => {
      if (usingFallback) return;
      usingFallback = true;
      console.error('Carto Voyager tiles failed; falling back to OpenStreetMap tiles.');
      map.removeLayer(cartoTiles);
      const osmTiles = L.tileLayer(OPENSTREETMAP_TILES, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
        subdomains: 'abc',
      });
      osmTiles.on('tileerror', () => {
        if (osmTileErrorReported) return;
        osmTileErrorReported = true;
        console.error('OpenStreetMap tile loading failed.');
      });
      osmTiles.addTo(map);
    };
    cartoTiles.once('tileerror', fallbackToOpenStreetMap);
    cartoTiles.addTo(map);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize({pan: false}));
    resizeObserver.observe(container);
    map.invalidateSize({pan: false});
    setMapReady(true);

    return () => {
      resizeObserver.disconnect();
      cartoTiles.off('tileerror', fallbackToOpenStreetMap);
      driverMarkerRef.current = null;
      pickupMarkerRef.current = null;
      stop1MarkerRef.current = null;
      dropoffMarkerRef.current = null;
      routeLayersRef.current = [];
      tripRouteLayersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      routeRequestRef.current?.abort();
      tripRouteRequestRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!gpsWatchActive || !('geolocation' in navigator)) {
      setWatchedPosition(null);
      return;
    }

    const updatePosition = ({coords}: GeolocationPosition) =>
      setWatchedPosition({
        coords: {
          lat: Number(coords.latitude.toFixed(6)),
          lng: Number(coords.longitude.toFixed(6)),
        },
        heading:
          coords.heading !== null && Number.isFinite(coords.heading)
            ? coords.heading
            : null,
      });
    const reportPositionError = (error: GeolocationPositionError) => {
      console.error('Dark radar GPS update failed:', error.message);
    };
    const options: PositionOptions = {enableHighAccuracy: true, maximumAge: 5000};
    const watchId = navigator.geolocation.watchPosition(
      updatePosition,
      reportPositionError,
      options
    );
    let refreshPending = false;
    const refreshId = window.setInterval(() => {
      if (refreshPending) return;
      refreshPending = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          refreshPending = false;
          updatePosition(position);
        },
        (error) => {
          refreshPending = false;
          reportPositionError(error);
        },
        {...options, maximumAge: 0, timeout: 8000}
      );
    }, 5000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(refreshId);
    };
  }, [gpsWatchActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    upsertMarker(
      map,
      pickupMarkerRef,
      pickup,
      createPlaceIcon('P', pickupLabel),
      pickupLabel
    );
    upsertMarker(
      map,
      stop1MarkerRef,
      stop1,
      createPlaceIcon('1', stop1Label),
      stop1Label
    );
    upsertMarker(
      map,
      dropoffMarkerRef,
      dropoff,
      createPlaceIcon('D', dropoffLabel),
      dropoffLabel
    );
  }, [mapReady, pickup, pickupLabel, stop1, stop1Label, dropoff, dropoffLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !currentCoords) return;
    upsertMarker(
      map,
      driverMarkerRef,
      currentCoords,
      createDriverIcon(heading),
      driverLabel
    );
    const zoom = isNavigating ? 17 : Math.max(map.getZoom(), 15);
    map.setView([currentCoords.lat, currentCoords.lng], zoom, {
      animate: true,
      duration: 0.7,
    });
  }, [mapReady, currentCoords, heading, isNavigating, driverLabel]);

  useEffect(() => {
    if (!mapReady || focusRequest === 0 || !focusCoords) return;
    const map = mapRef.current;
    if (!map) return;
    if (currentCoords) {
      map.fitBounds(
        [
          [currentCoords.lat, currentCoords.lng],
          [focusCoords.lat, focusCoords.lng],
        ],
        {padding: [72, 72], maxZoom: 16, animate: true, duration: 0.5}
      );
    } else {
      map.setView([focusCoords.lat, focusCoords.lng], 16, {
        animate: true,
        duration: 0.5,
      });
    }
  }, [mapReady, focusRequest, focusCoords, currentCoords]);

  useEffect(() => {
    if (!activeTripStage || !currentCoords || !pickup || !dropoff) {
      tripRouteRequestRef.current?.abort();
      tripRouteRequestRef.current = null;
      tripRouteOriginRef.current = null;
      setTripRouteCoordinates(null);
      return;
    }

    const waypoints = [currentCoords, pickup, ...(stop1 ? [stop1] : []), dropoff];
    const targetKey = waypoints
      .slice(1)
      .map((point) => `${point.lat},${point.lng}`)
      .join(';');
    const previousOrigin = tripRouteOriginRef.current;
    if (
      previousOrigin &&
      previousOrigin.targetKey === targetKey &&
      distanceMeters(previousOrigin, currentCoords) < 300
    ) {
      return;
    }

    tripRouteRequestRef.current?.abort();
    const controller = new AbortController();
    tripRouteRequestRef.current = controller;
    tripRouteOriginRef.current = {...currentCoords, targetKey};
    const coordinates = waypoints.map((point) => `${point.lng},${point.lat}`).join(';');
    const routeUrl =
      `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
      '?steps=true&overview=false&geometries=geojson';

    const fetchTripRoutes = async () => {
      try {
        const response = await fetch(routeUrl, {signal: controller.signal});
        if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}`);
        const data = (await response.json()) as OsrmRouteResponse;
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route || route.legs.length < 2) {
          throw new Error(`OSRM could not find trip routes (${data.code})`);
        }
        const approach = coordinatesForLegs([route.legs[0]]);
        const trip = coordinatesForLegs(route.legs.slice(1));
        if (approach.length < 2 || trip.length < 2) {
          throw new Error('OSRM returned incomplete trip route geometry');
        }
        setTripRouteCoordinates({approach, trip});
      } catch (error) {
        if (controller.signal.aborted) return;
        setTripRouteCoordinates(null);
        console.error('Trip route request failed:', error);
      } finally {
        if (tripRouteRequestRef.current === controller) {
          tripRouteRequestRef.current = null;
        }
      }
    };

    void fetchTripRoutes();
  }, [activeTripStage, currentCoords, pickup, stop1, dropoff]);

  useEffect(() => {
    if (!targetCoords || !currentCoords || !activeTripStage) {
      routeRequestRef.current?.abort();
      routeRequestRef.current = null;
      routeOriginRef.current = null;
      setRouteSteps([]);
      setRouteCoordinates(null);
      setRouteDistance(null);
      setRouteDuration(null);
      setStepIndex(1);
      setRouteError(null);
      spokenStepRef.current = null;
      return;
    }

    const previousOrigin = routeOriginRef.current;
    const targetKey = `${targetCoords.lat},${targetCoords.lng}`;
    const sameTarget = previousOrigin && previousOrigin.targetKey === targetKey;
    if (sameTarget && distanceMeters(previousOrigin, currentCoords) < 300) return;

    routeRequestRef.current?.abort();
    const controller = new AbortController();
    routeOriginRef.current = {...currentCoords, targetKey};
    routeRequestRef.current = controller;
    const routeUrl =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${currentCoords.lng},${currentCoords.lat};${targetCoords.lng},${targetCoords.lat}` +
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
        setRouteDistance(route.distance);
        setRouteDuration(route.duration);
        setStepIndex((current) => Math.min(current, route.legs[0].steps.length - 1));
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
  }, [targetCoords, currentCoords, activeTripStage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    clearPolylines(map, routeLayersRef);
    if (!routeCoordinates || routeCoordinates.length < 2) return;
    const latlngs = routeLatLngs(routeCoordinates);
    routeLayersRef.current = [
      L.polyline(latlngs, {
        color: '#2563EB',
        weight: 18,
        opacity: 0.24,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
      L.polyline(latlngs, {
        color: '#FFFFFF',
        weight: 12,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
      L.polyline(latlngs, {
        color: '#2563EB',
        weight: 8,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
    ];
  }, [mapReady, routeCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    clearPolylines(map, tripRouteLayersRef);
    if (!tripRouteCoordinates) return;

    const approach = routeLatLngs(tripRouteCoordinates.approach);
    const trip = routeLatLngs(tripRouteCoordinates.trip);
    tripRouteLayersRef.current = [
      L.polyline(approach, {
        color: '#D4AF37',
        weight: 12,
        opacity: 0.3,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
      L.polyline(approach, {
        color: '#D4AF37',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
      L.polyline(trip, {
        color: '#2563EB',
        weight: 12,
        opacity: 0.3,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
      L.polyline(trip, {
        color: '#2563EB',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map),
    ];
  }, [mapReady, tripRouteCoordinates]);

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
    if (!('speechSynthesis' in window)) return;
    if (!isNavigating) {
      if (spokenStepRef.current) {
        window.speechSynthesis.cancel();
        spokenStepRef.current = null;
      }
      return;
    }
    if (!routeSteps.length) return;
    const step = routeSteps[stepIndex];
    if (!step) return;
    const key = `${step.maneuver.type}:${step.maneuver.modifier || ''}:${step.name}:${step.maneuver.location.join(',')}`;
    if (spokenStepRef.current === key) return;
    if (spokenStepRef.current) window.speechSynthesis.cancel();
    spokenStepRef.current = key;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(describeTurn(step)));
  }, [isNavigating, routeSteps, stepIndex]);

  const nextStep = routeSteps[stepIndex];
  const nextTurnDistance =
    nextStep && currentCoords
      ? distanceMeters(currentCoords, {
          lat: nextStep.maneuver.location[1],
          lng: nextStep.maneuver.location[0],
        })
      : null;
  const remainingMiles = routeDistance === null ? null : routeDistance / 1609.344;
  const etaMinutes = routeDuration === null ? null : Math.max(1, Math.round(routeDuration / 60));
  const arrivalTime =
    etaMinutes === null
      ? null
      : new Date(Date.now() + etaMinutes * 60_000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        });
  const bottomOverlayPosition = fullScreen
    ? 'bottom-[calc(60%+0.75rem)]'
    : 'bottom-3';

  return (
    <div className={`relative w-full overflow-hidden bg-transparent ${heightClass}`}>
      <div
        ref={containerRef}
        className={
          fullScreen
            ? 'fixed inset-0 z-0 h-screen w-screen bg-[#e8eaed]'
            : 'absolute inset-0 z-0 bg-[#e8eaed]'
        }
        style={
          fullScreen
            ? {
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 0,
                background: '#e8eaed',
              }
            : undefined
        }
      />
      <div
        ref={overlayContainerRef}
        className="pointer-events-none absolute inset-0 z-40"
      />
      {showRecenterButton && (
        <button
          type="button"
          aria-label="Re-center map"
          title="Re-center"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            const center = currentCoords
              ? [currentCoords.lat, currentCoords.lng] as L.LatLngTuple
              : OKC_CENTER;
            map.setView(center, isNavigating ? 17 : 15, {animate: true, duration: 0.5});
          }}
          className="absolute bottom-[calc(60%+0.75rem)] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-[#DFC07D] bg-[#0B0B0D]/95 text-[#DFC07D] shadow-[0_0_16px_rgba(212,175,55,0.3)] backdrop-blur-md"
        >
          <span className="text-xl" aria-hidden="true">◎</span>
        </button>
      )}
      {isNavigating && (
        <>
          <div
            className={`absolute left-3 right-3 z-10 flex min-h-16 items-center gap-3 rounded-xl border border-[#D4AF37]/70 bg-[#0B0B0D]/95 px-3 py-2 text-[#DFC07D] shadow-xl backdrop-blur-md ${
              fullScreen ? 'top-20' : 'top-3'
            }`}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#d4af37] text-3xl font-bold leading-none text-[#0b0b0d]">
              {turnArrow(nextStep)}
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
                {nextStep ? describeTurn(nextStep) : targetLabel}
              </div>
            </div>
          </div>
          <div
            className={`absolute ${bottomOverlayPosition} left-3 right-20 z-10 grid grid-cols-3 divide-x divide-[#d4af37]/30 rounded-xl border border-[#D4AF37]/60 bg-[#0B0B0D]/95 px-2 py-2 text-center text-[#DFC07D] shadow-xl backdrop-blur-md`}
          >
            <div>
              <div className="text-base font-extrabold tabular-nums">
                {etaMinutes === null ? '--' : `${etaMinutes} min`}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#c5a059]">
                ETA
              </div>
            </div>
            <div>
              <div className="text-base font-extrabold tabular-nums">
                {remainingMiles === null ? '--' : `${remainingMiles.toFixed(1)} mi`}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#c5a059]">
                Miles
              </div>
            </div>
            <div>
              <div className="text-base font-extrabold tabular-nums">
                {arrivalTime ?? '--'}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#c5a059]">
                Arrival
              </div>
            </div>
          </div>
        </>
      )}
      {!isNavigating && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-lg border border-[#C5A059]/30 bg-[#0B0B0D]/90 px-2.5 py-1 text-[11px] font-mono tabular-nums text-[#C5A059] backdrop-blur-md">
          OKC · Live GPS
        </div>
      )}
    </div>
  );
};
