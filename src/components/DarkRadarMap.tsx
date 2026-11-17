import React, {useEffect, useRef, useState} from 'react';
import * as maplibregl from 'maplibre-gl';
import type {GeoJSONSource, Map, Marker} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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

interface RouteStep {
  distance: number;
  name: string;
  maneuver: {
    location: [number, number];
    type: string;
    modifier?: string;
  };
  geometry?: {coordinates: [number, number][]};
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

interface WatchedPosition {
  coords: GeoPoint;
  heading: number | null;
}

const OKC_CENTER: [number, number] = [-97.5164, 35.4676];
const ROUTE_SOURCE_ID = 'driver-route';
const TRIP_ROUTE_SOURCE_ID = 'driver-trip-routes';
const ROUTE_LAYER_IDS = [
  'driver-route-glow',
  'driver-route-casing',
  'driver-route-line',
];
const TRIP_ROUTE_LAYER_IDS = ['driver-trip-route-glow', 'driver-trip-route-line'];
const OPENSTREETMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

interface TripRouteCoordinates {
  approach: [number, number][];
  trip: [number, number][];
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

function coordinatesForLegs(legs: Array<{steps: RouteStep[]}>): [number, number][] {
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

function createCarElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.className =
    'flex h-11 w-11 items-center justify-center rounded-full text-[19px] font-black text-[#0b0b0d]';
  element.style.cssText =
    'background:linear-gradient(145deg,#fff1ad 0%,#d4af37 42%,#805d13 100%);border:2px solid #fff0ab;box-shadow:0 0 0 5px rgba(212,175,55,.24),0 5px 18px rgba(0,0,0,.85);';
  element.setAttribute('aria-label', 'Live driver GPS location');
  element.textContent = '▲';
  return element;
}

function createPlaceElement(glyph: string, label: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className =
    'flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f5df9a] bg-[#b8860b] text-xs font-black text-[#0b0b0d] shadow-lg';
  element.textContent = glyph;
  element.title = label;
  return element;
}

function upsertMarker(
  map: Map,
  markerRef: React.MutableRefObject<Marker | null>,
  point: GeoPoint | null | undefined,
  element: HTMLElement
): void {
  if (!point) {
    markerRef.current?.remove();
    markerRef.current = null;
    return;
  }
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({
      element,
      anchor: 'center',
      rotationAlignment: 'map',
      pitchAlignment: 'map',
    })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
    return;
  }
  markerRef.current.setLngLat([point.lng, point.lat]);
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
  const mapRef = useRef<Map | null>(null);
  const carMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const stop1MarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const routeRequestRef = useRef<AbortController | null>(null);
  const routeOriginRef = useRef<(GeoPoint & {targetKey: string}) | null>(null);
  const tripRouteRequestRef = useRef<AbortController | null>(null);
  const tripRouteOriginRef = useRef<(GeoPoint & {targetKey: string}) | null>(null);
  const spokenStepRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [watchedPosition, setWatchedPosition] = useState<WatchedPosition | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const [tripRouteCoordinates, setTripRouteCoordinates] =
    useState<TripRouteCoordinates | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(1);
  const [routeError, setRouteError] = useState<string | null>(null);
  const currentCoords = watchedPosition?.coords || driverCoords || null;
  const heading = watchedPosition?.heading ?? null;
  const isNavigating = Boolean(
    targetCoords &&
      (activeTripStage === 'en_route_pickup' ||
        activeTripStage === 'en_route_stop1' ||
        activeTripStage === 'in_progress')
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENSTREETMAP_STYLE,
      center: OKC_CENTER,
      zoom: 14,
      pitch: 0,
      bearing: 0,
    });
    mapRef.current = map;

    let styleLoaded = false;
    let usedFallback = false;
    const handleStyleLoad = () => {
      styleLoaded = true;
      map.resize();
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: {type: 'FeatureCollection', features: []},
        });
        map.addLayer({
          id: ROUTE_LAYER_IDS[0],
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {
            'line-color': '#D4AF37',
            'line-width': 17,
            'line-blur': 7,
            'line-opacity': 0.38,
          },
        });
        map.addLayer({
          id: ROUTE_LAYER_IDS[1],
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {
            'line-color': '#D4AF37',
            'line-width': 11,
            'line-opacity': 1,
          },
        });
        map.addLayer({
          id: ROUTE_LAYER_IDS[2],
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {
            'line-color': '#2563EB',
            'line-width': 7,
            'line-opacity': 1,
          },
        });
        map.addSource(TRIP_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: {type: 'FeatureCollection', features: []},
        });
        map.addLayer({
          id: TRIP_ROUTE_LAYER_IDS[0],
          type: 'line',
          source: TRIP_ROUTE_SOURCE_ID,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {
            'line-color': [
              'match',
              ['get', 'routeType'],
              'approach',
              '#D4AF37',
              '#2563EB',
            ],
            'line-width': 12,
            'line-blur': 5,
            'line-opacity': 0.3,
          },
        });
        map.addLayer({
          id: TRIP_ROUTE_LAYER_IDS[1],
          type: 'line',
          source: TRIP_ROUTE_SOURCE_ID,
          layout: {'line-cap': 'round', 'line-join': 'round'},
          paint: {
            'line-color': [
              'match',
              ['get', 'routeType'],
              'approach',
              '#D4AF37',
              '#2563EB',
            ],
            'line-width': 5,
            'line-opacity': 0.95,
          },
        });
      }
      setMapReady(true);
    };
    const handleMapError = (event: maplibregl.ErrorEvent) => {
      if (!styleLoaded && !usedFallback) {
        usedFallback = true;
        console.error('OpenStreetMap style failed; falling back to Carto Voyager:', event.error);
        map.setStyle(FALLBACK_STYLE);
        return;
      }
      console.error('Map rendering error:', event.error);
    };

    map.on('style.load', handleStyleLoad);
    map.on('error', handleMapError);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.off('style.load', handleStyleLoad);
      map.off('error', handleMapError);
      carMarkerRef.current?.remove();
      pickupMarkerRef.current?.remove();
      stop1MarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      routeRequestRef.current?.abort();
      tripRouteRequestRef.current?.abort();
    };
  }, []);

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
    const pickupElement = createPlaceElement('P', pickupLabel);
    const stop1Element = createPlaceElement('1', stop1Label);
    const dropoffElement = createPlaceElement('D', dropoffLabel);
    upsertMarker(map, pickupMarkerRef, pickup, pickupElement);
    upsertMarker(map, stop1MarkerRef, stop1, stop1Element);
    upsertMarker(map, dropoffMarkerRef, dropoff, dropoffElement);
  }, [mapReady, pickup, pickupLabel, stop1, stop1Label, dropoff, dropoffLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !currentCoords) return;
    const carElement = createCarElement();
    upsertMarker(map, carMarkerRef, currentCoords, carElement);
    carMarkerRef.current?.setRotation(heading ?? 0);

    if (isNavigating) {
      map.easeTo({
        center: [currentCoords.lng, currentCoords.lat],
        zoom: 17.5,
        pitch: 62,
        bearing: heading ?? map.getBearing(),
        duration: 700,
      });
    } else {
      map.easeTo({
        center: [currentCoords.lng, currentCoords.lat],
        zoom: Math.max(map.getZoom(), 14),
        pitch: 0,
        bearing: 0,
        duration: 500,
      });
    }
  }, [mapReady, currentCoords, heading, isNavigating]);

  useEffect(() => {
    if (!mapReady || focusRequest === 0) return;
    const map = mapRef.current;
    if (!map) return;
    if (currentCoords && focusCoords) {
      map.fitBounds(
        [
          [currentCoords.lng, currentCoords.lat],
          [focusCoords.lng, focusCoords.lat],
        ],
        {padding: 72, maxZoom: 16, duration: 500}
      );
    } else if (focusCoords) {
      map.easeTo({
        center: [focusCoords.lng, focusCoords.lat],
        zoom: 16,
        pitch: 0,
        bearing: 0,
        duration: 500,
      });
    }
  }, [mapReady, focusRequest]);

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

    const origin = currentCoords;
    routeRequestRef.current?.abort();
    routeOriginRef.current = {...origin, targetKey};
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
    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      routeCoordinates
        ? {
            type: 'Feature',
            properties: {},
            geometry: {type: 'LineString', coordinates: routeCoordinates},
          }
        : {type: 'FeatureCollection', features: []}
    );
    ROUTE_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', routeCoordinates ? 'visible' : 'none');
    });
  }, [mapReady, routeCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(TRIP_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      tripRouteCoordinates
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {routeType: 'approach'},
                geometry: {type: 'LineString', coordinates: tripRouteCoordinates.approach},
              },
              {
                type: 'Feature',
                properties: {routeType: 'trip'},
                geometry: {type: 'LineString', coordinates: tripRouteCoordinates.trip},
              },
            ],
          }
        : {type: 'FeatureCollection', features: []}
    );
    TRIP_ROUTE_LAYER_IDS.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', tripRouteCoordinates ? 'visible' : 'none');
      }
    });
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
    const utterance = new SpeechSynthesisUtterance(describeTurn(step));
    window.speechSynthesis.speak(utterance);
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
    <div className={`relative w-full overflow-hidden bg-[#e8eaed] ${heightClass}`}>
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
              ? [currentCoords.lng, currentCoords.lat] as [number, number]
              : OKC_CENTER;
            map.easeTo({
              center,
              zoom: isNavigating ? 17.5 : 14,
              pitch: isNavigating ? 62 : 0,
              bearing: isNavigating ? heading ?? map.getBearing() : 0,
              duration: 500,
            });
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
