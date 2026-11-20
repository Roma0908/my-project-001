import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Brain, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Cloud, CloudFog, CloudRain, CloudSnow, Compass, Cpu, Download, Eye, Filter, Flame,
  FlaskConical, Globe, HeartPulse, Info, Layers, MapPin, Navigation, Pause, Play, Plus,
  Radio, RefreshCw, RotateCcw, Route, Search, Settings, ShieldAlert, Siren, Sliders,
  Sparkles, StepForward, Sun, Truck, Users, Wrench, X, Zap, ZoomIn, ZoomOut, Maximize2,
  Check, AlertCircle, Terminal, ArrowRight, GitBranch, Network, ShieldCheck, Loader2
} from 'lucide-react';

// ============================================================================
// 0. DYNAMIC LEAFLET LOADER (CSS + JS FROM ESM/CDN)
// ============================================================================

declare global {
  interface Window {
    L: any;
  }
}

function useLeafletLoader() {
  const [loaded, setLoaded] = useState<boolean>(() => Boolean(typeof window !== 'undefined' && window.L));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.L) {
      setLoaded(true);
      return;
    }

    // Inject Leaflet CSS
    const cssId = 'leaflet-css-cdn';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    // Inject custom dark-cyberpunk styling for Leaflet tiles & popups
    const styleId = 'astana2040-leaflet-theme';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .astana-map-tiles {
          filter: invert(100%) hue-rotate(180deg) brightness(94%) contrast(92%) saturate(115%);
        }
        .leaflet-container {
          background: #040812 !important;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: rgba(15, 23, 42, 0.95) !important;
          color: #f1f5f9 !important;
          border: 1px solid rgba(56, 189, 248, 0.35);
          backdrop-filter: blur(8px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.7);
        }
        .leaflet-popup-close-button {
          color: #94a3b8 !important;
        }
        .leaflet-control-attribution {
          background: rgba(2, 6, 23, 0.85) !important;
          color: #94a3b8 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a {
          color: #38bdf8 !important;
        }
        .leaflet-control-zoom a {
          background: rgba(15, 23, 42, 0.9) !important;
          color: #38bdf8 !important;
          border-color: #1e293b !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(30, 41, 59, 0.95) !important;
        }
      `;
      document.head.appendChild(style);
    }

    const scriptId = 'leaflet-js-cdn';
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => setLoaded(true));
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.async = true;
    script.onload = () => setLoaded(true);
    script.onerror = () => setError('Failed to load Leaflet mapping library from CDN.');
    document.head.appendChild(script);
  }, []);

  return { loaded, error };
}

// ============================================================================
// 1. TYPES & INTERFACES (GEOGRAPHIC LAT/LNG)
// ============================================================================

type Language = 'EN' | 'KZ';

type LatLngTuple = [number, number]; // [latitude, longitude]

type DistrictType =
  | 'Central Admin'
  | 'Left Bank'
  | 'Right Bank'
  | 'Residential'
  | 'Industrial'
  | 'Commercial'
  | 'Educational'
  | 'Healthcare'
  | 'Airport'
  | 'Railway'
  | 'Park';

type WeatherType = 'Clear' | 'Rain' | 'Snow' | 'Heavy Snowstorm' | 'Fog';

type TrafficLightPhase = 'NS_GREEN' | 'NS_YELLOW' | 'EW_GREEN' | 'EW_YELLOW';

type VehicleType = 'car' | 'bus' | 'taxi' | 'delivery' | 'emergency' | 'municipal';

type IncidentCategory =
  | 'Traffic accident'
  | 'Vehicle breakdown'
  | 'Fire emergency'
  | 'Medical emergency'
  | 'Road obstruction'
  | 'Power outage'
  | 'Public safety incident';

type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

type TeamCategory =
  | 'Ambulance'
  | 'Fire Department'
  | 'Police'
  | 'Road Repair'
  | 'Electrical Repair'
  | 'Municipal Support';

interface AstanaLandmark {
  id: string;
  name: string;
  kzName: string;
  lat: number;
  lng: number;
  district: DistrictType;
  description: string;
}

interface Intersection {
  id: string;
  osmId?: number;
  name: string;
  lat: number;
  lng: number;
  district: DistrictType;
  hasTrafficLight: boolean;
  landmark?: string;
}

interface RoadSegment {
  id: string;
  osmWayId?: number;
  name: string;
  from: string;
  to: string;
  oneway: boolean;
  roadType: 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'residential' | 'bridge';
  geometry: LatLngTuple[]; // Real multi-point OSM street polyline [lat, lng][]
  cumulativeDistances: number[]; // Cumulative km along geometry points for smooth interpolation
  length: number; // km (real Haversine polyline length)
  maxSpeed: number; // km/h
  capacity: number; // max vehicles
  vehicleCount: number;
  density: number; // 0 to 1+
  travelTime: number; // minutes
  closed: boolean;
  closureReason?: string;
}

interface TrafficLightState {
  intersectionId: string;
  phase: TrafficLightPhase;
  timer: number;
  greenDuration: number;
  nsQueue: number;
  ewQueue: number;
  emergencyOverride: boolean;
  reasoning: string;
}

interface Vehicle {
  id: string;
  type: VehicleType;
  currentNode: string;
  nextNode: string | null;
  currentRoadId: string | null;
  progress: number; // 0 to 1 along currentRoad geometry
  lat: number;
  lng: number;
  destination: string;
  route: string[]; // sequence of intersection IDs
  speed: number; // km/h
  status: 'moving' | 'waiting_light' | 'congested' | 'arrived';
  waitingTime: number; // seconds
  travelTime: number; // seconds
  recalculations: number;
  lastDecision: string;
  assignedIncidentId?: string;
  assignedTeamId?: string;
}

interface Incident {
  id: string;
  category: IncidentCategory;
  severity: SeverityLevel;
  intersectionId: string;
  lat: number;
  lng: number;
  roadId?: string;
  createdAt: number; // sim minutes
  status: 'Pending' | 'Dispatched' | 'On Scene' | 'Resolved' | 'Cancelled';
  assignedTeamId: string | null;
  estimatedResponseTime: number | null; // minutes
  serviceRemaining: number; // seconds on scene
}

interface MunicipalTeam {
  id: string;
  name: string;
  category: TeamCategory;
  skills: IncidentCategory[];
  currentNode: string;
  homeNode: string;
  lat: number;
  lng: number;
  available: boolean;
  capacity: number;
  assignedIncidentId: string | null;
  eta: number | null;
  vehicleId: string | null;
}

interface AStarStep {
  current: string;
  g: number;
  h: number;
  f: number;
  frontier: string[];
  visited: string[];
}

interface AStarResult {
  path: string[];
  polyline: LatLngTuple[]; // Exact combined geographical geometry of the path
  totalTime: number; // minutes
  totalDistance: number; // km
  exploredNodes: string[];
  expandedCount: number;
  trace: AStarStep[];
  unreachable: boolean;
}

interface CSPRejection {
  incidentId: string;
  teamId: string;
  reason: string;
}

interface CSPAssignment {
  incidentId: string;
  teamId: string;
  travelTime: number;
  route: string[];
}

interface CSPResult {
  assignments: CSPAssignment[];
  unassigned: { incidentId: string; reason: string }[];
  rejections: CSPRejection[];
  trace: string[];
  backtracks: number;
}

interface BayesianEvidence {
  rushHour: boolean;
  badWeather: boolean;
  highDemand: boolean;
  roadClosures: boolean;
  highIncidentSeverity: boolean;
  lowTeamAvailability: boolean;
}

interface BayesianResult {
  congestionProb: number; // 0..1
  delayProb: number; // 0..1
  congestionRisk: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Critical Risk';
  delayRisk: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Critical Risk';
  explanation: string[];
  factors: { name: string; active: boolean; impact: string }[];
}

interface ActivityLog {
  id: string;
  simTime: string;
  category: 'Agents' | 'Pathfinding' | 'CSP' | 'Bayesian' | 'Incidents' | 'Traffic';
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
}

interface MetricsSnapshot {
  timeLabel: string;
  avgDensity: number;
  avgTravelTime: number;
  avgWaitTime: number;
  activeVehicles: number;
  congestionProb: number;
}

interface SimulationState {
  seed: number;
  simSeconds: number; // starts at 8 * 3600 = 28800 (08:00:00)
  status: 'running' | 'paused';
  speed: 1 | 2 | 4 | 8;
  aiEnabled: boolean;
  weather: WeatherType;
  trafficDemand: number; // 0 to 100
  intersections: Intersection[];
  roads: RoadSegment[];
  trafficLights: Record<string, TrafficLightState>;
  vehicles: Vehicle[];
  incidents: Incident[];
  teams: MunicipalTeam[];
  logs: ActivityLog[];
  completedJourneys: number;
  totalCompletedTravelTime: number;
  totalVehicleWaitTime: number;
  totalReroutes: number;
  resolvedIncidentsCount: number;
  totalResponseTime: number;
  assignedIncidentsCount: number;
  history: MetricsSnapshot[];
  scenarioName: string;
}

interface ComparisonResult {
  scenarioName: string;
  seed: number;
  durationMinutes: number;
  conventional: {
    avgTravelTime: number;
    avgWaitTime: number;
    totalDelay: number;
    completedJourneys: number;
    avgCongestion: number;
    avgResponseTime: number;
    assignedIncidents: number;
    reroutes: number;
  };
  ai: {
    avgTravelTime: number;
    avgWaitTime: number;
    totalDelay: number;
    completedJourneys: number;
    avgCongestion: number;
    avgResponseTime: number;
    assignedIncidents: number;
    reroutes: number;
  };
}

interface TestCaseResult {
  id: string;
  system: 'Intelligent Agents' | 'A* Search' | 'CSP Solver' | 'Bayesian Network';
  name: string;
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
}

interface MapLayerVisibility {
  traffic: boolean;
  vehicles: boolean;
  trafficLights: boolean;
  incidents: boolean;
  teams: boolean;
  astarRoute: boolean;
  bayesianHeatmap: boolean;
  landmarks: boolean;
}

// ============================================================================
// 2. GEOGRAPHIC HAVERSINE MATH, POLYLINE INTERPOLATION & DETERMINISTIC PRNG
// ============================================================================

const ASTANA_CENTER: LatLngTuple = [51.1283, 71.4306]; // Baiterek Tower, Astana

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildCumulativeDistances(coords: LatLngTuple[]): { cumulative: number[]; totalKm: number } {
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    total += seg;
    cumulative.push(total);
  }
  return { cumulative, totalKm: Math.max(0.05, total) };
}

function interpolateAlongRoad(road: RoadSegment, progress: number, reverse = false): LatLngTuple {
  const pts = reverse ? [...road.geometry].reverse() : road.geometry;
  if (pts.length === 0) return ASTANA_CENTER;
  if (pts.length === 1 || progress <= 0) return pts[0];
  if (progress >= 1) return pts[pts.length - 1];

  const { cumulative, totalKm } = reverse ? buildCumulativeDistances(pts) : { cumulative: road.cumulativeDistances, totalKm: road.length };
  const targetDist = progress * totalKm;

  for (let i = 1; i < pts.length; i++) {
    if (cumulative[i] >= targetDist) {
      const segStart = cumulative[i - 1];
      const segLen = Math.max(0.00001, cumulative[i] - segStart);
      const localT = (targetDist - segStart) / segLen;
      const lat = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * localT;
      const lng = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * localT;
      return [lat, lng];
    }
  }
  return pts[pts.length - 1];
}

function classifyAstanaDistrict(lat: number, lng: number): DistrictType {
  if (lat < 51.055 && lng > 71.43) return 'Airport';
  if (lat > 51.185 && lng < 71.425) return 'Railway';
  if (lat > 51.175 && lng > 71.47) return 'Industrial';
  if (lat >= 51.115 && lat <= 51.142 && lng >= 71.415 && lng <= 71.46) return 'Central Admin';
  if (lat >= 51.08 && lat <= 51.105 && lng >= 71.39 && lng <= 71.43) return 'Educational';
  if (lat >= 51.11 && lat <= 51.135 && lng >= 71.375 && lng <= 71.405) return 'Healthcare';
  if (lat > 51.152) return 'Right Bank';
  if (lat <= 51.152) return 'Left Bank';
  return 'Commercial';
}

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

function formatSimTime(totalSeconds: number): string {
  const daySeconds = Math.floor(totalSeconds) % 86400;
  const hrs = Math.floor(daySeconds / 3600);
  const mins = Math.floor((daySeconds % 3600) / 60);
  const secs = daySeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSimShortTime(totalSeconds: number): string {
  const daySeconds = Math.floor(totalSeconds) % 86400;
  const hrs = Math.floor(daySeconds / 3600);
  const mins = Math.floor((daySeconds % 3600) / 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getWeatherSpeedMultiplier(weather: WeatherType): number {
  switch (weather) {
    case 'Clear': return 1.0;
    case 'Rain': return 0.82;
    case 'Fog': return 0.75;
    case 'Snow': return 0.65;
    case 'Heavy Snowstorm': return 0.45;
  }
}

function getWeatherPenaltyMultiplier(weather: WeatherType): number {
  switch (weather) {
    case 'Clear': return 1.0;
    case 'Rain': return 1.25;
    case 'Fog': return 1.35;
    case 'Snow': return 1.6;
    case 'Heavy Snowstorm': return 2.2;
  }
}

// ============================================================================
// 3. REAL ASTANA LANDMARKS & OPENSTREETMAP OVERPASS ROAD NETWORK LOADER
// ============================================================================

const ASTANA_LANDMARKS: AstanaLandmark[] = [
  {
    id: 'LM-BAITEREK',
    name: 'Baiterek Tower',
    kzName: 'Бәйтерек монументі',
    lat: 51.1283,
    lng: 71.4306,
    district: 'Central Admin',
    description: 'Central symbolic monument on Nurzhol Boulevard (51.1283°N, 71.4306°E).',
  },
  {
    id: 'LM-KHANSHATYR',
    name: 'Khan Shatyr Entertainment Center',
    kzName: 'Хан Шатыр',
    lat: 51.1325,
    lng: 71.4037,
    district: 'Commercial',
    description: 'Western terminus of Nurzhol Boulevard along Turan Avenue.',
  },
  {
    id: 'LM-AKORDA',
    name: 'Ak Orda Presidential Palace',
    kzName: 'Ақорда резиденциясы',
    lat: 51.1258,
    lng: 71.4464,
    district: 'Central Admin',
    description: 'Official workplace of the President of Kazakhstan near the Ishim River.',
  },
  {
    id: 'LM-EXPO',
    name: 'EXPO 2017 / Nur Alem Sphere',
    kzName: 'Нұр Әлем (EXPO)',
    lat: 51.0892,
    lng: 71.4148,
    district: 'Commercial',
    description: 'Future Energy Museum & Astana IT Innovation Hub on Mangilik El.',
  },
  {
    id: 'LM-AIRPORT',
    name: 'Nursultan Nazarbayev Intl Airport',
    kzName: 'Халықаралық әуежай',
    lat: 51.0222,
    lng: 71.4669,
    district: 'Airport',
    description: 'Primary international aviation hub south of Kabanbay Batyr Avenue.',
  },
  {
    id: 'LM-RAILWAY',
    name: 'Astana-1 Railway Station',
    kzName: 'Астана-1 теміржол вокзалы',
    lat: 51.1965,
    lng: 71.4112,
    district: 'Railway',
    description: 'Historic Right Bank railway terminal at Goethe & Zhenis Avenue.',
  },
  {
    id: 'LM-NURZHOL',
    name: 'Nurzhol Boulevard',
    kzName: 'Нұржол бульвары',
    lat: 51.1297,
    lng: 71.4215,
    district: 'Central Admin',
    description: 'Pedestrian and ceremonial axis connecting Khan Shatyr, Baiterek, and Ak Orda.',
  },
  {
    id: 'LM-OPERA',
    name: 'Astana Opera House',
    kzName: 'Астана Опера',
    lat: 51.1353,
    lng: 71.4113,
    district: 'Left Bank',
    description: 'Major cultural landmark at the intersection of Dinmukhamed Kunaev & Turan.',
  },
  {
    id: 'LM-MOSQUE',
    name: 'Hazrat Sultan Mosque',
    kzName: 'Әзірет Сұлтан мешіті',
    lat: 51.1255,
    lng: 71.4722,
    district: 'Left Bank',
    description: 'Landmark architectural complex near Tauelsizdik & Karaotkel Bridge.',
  },
];

const OVERPASS_CACHE_KEY = 'astana2040_osm_road_network_v2';

interface OSMGraphData {
  intersections: Intersection[];
  roads: RoadSegment[];
  source: 'overpass-live' | 'overpass-cache';
}

// Parse Overpass JSON into a true connected topological road graph with multi-point street geometries
function parseOverpassResponse(data: any): { intersections: Intersection[]; roads: RoadSegment[] } {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const nodeCoords = new Map<number, LatLngTuple>();
  const ways: any[] = [];

  for (const el of elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeCoords.set(el.id, [el.lat, el.lon]);
    } else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
      ways.push(el);
    }
  }

  // Count how many ways reference each OSM node to identify true intersections & endpoints
  const nodeDegree = new Map<number, number>();
  for (const w of ways) {
    const nodes: number[] = w.nodes;
    nodes.forEach((nid, idx) => {
      const increment = idx === 0 || idx === nodes.length - 1 ? 1 : 1;
      nodeDegree.set(nid, (nodeDegree.get(nid) || 0) + increment);
    });
  }

  // Create Intersection nodes for endpoints and junctions (degree >= 2)
  const intersectionByOsmId = new Map<number, Intersection>();
  const intersections: Intersection[] = [];
  let interCounter = 1;

  const ensureIntersection = (osmNodeId: number, streetHint?: string): Intersection | null => {
    if (intersectionByOsmId.has(osmNodeId)) return intersectionByOsmId.get(osmNodeId)!;
    const coord = nodeCoords.get(osmNodeId);
    if (!coord) return null;

    // Check proximity to known Astana landmarks
    let matchedLandmark: string | undefined;
    for (const lm of ASTANA_LANDMARKS) {
      if (haversineKm(coord[0], coord[1], lm.lat, lm.lng) < 0.45) {
        matchedLandmark = lm.name;
        break;
      }
    }

    const district = classifyAstanaDistrict(coord[0], coord[1]);
    const id = `N${String(interCounter++).padStart(3, '0')}`;
    const inter: Intersection = {
      id,
      osmId: osmNodeId,
      name: matchedLandmark
        ? `${matchedLandmark} Junction`
        : streetHint
        ? `${streetHint} Intersection`
        : `Astana Junction ${id}`,
      lat: coord[0],
      lng: coord[1],
      district,
      hasTrafficLight: (nodeDegree.get(osmNodeId) || 0) >= 3,
      landmark: matchedLandmark,
    };
    intersectionByOsmId.set(osmNodeId, inter);
    intersections.push(inter);
    return inter;
  };

  // Split each OSM way at every intersection node so edges represent real road segments between intersections
  const roads: RoadSegment[] = [];
  let roadCounter = 1;

  const speedByHighway: Record<string, { type: RoadSegment['roadType']; speed: number; cap: number }> = {
    motorway: { type: 'motorway', speed: 90, cap: 26 },
    trunk: { type: 'trunk', speed: 80, cap: 24 },
    primary: { type: 'primary', speed: 60, cap: 20 },
    secondary: { type: 'secondary', speed: 60, cap: 16 },
    tertiary: { type: 'tertiary', speed: 50, cap: 14 },
    residential: { type: 'residential', speed: 40, cap: 10 },
    unclassified: { type: 'tertiary', speed: 50, cap: 12 },
  };

  for (const w of ways) {
    const hw: string = w.tags?.highway || 'secondary';
    const meta = speedByHighway[hw] || speedByHighway.secondary;
    const isBridge = w.tags?.bridge === 'yes' || w.tags?.bridge === 'viaduct';
    const streetName: string =
      w.tags?.['name:en'] || w.tags?.name || w.tags?.['name:kk'] || w.tags?.['name:ru'] || `Astana ${hw} Road`;
    const oneway = w.tags?.oneway === 'yes' || w.tags?.oneway === '1';

    const nodes: number[] = w.nodes;
    let segStartOsm = nodes[0];
    let currentGeom: LatLngTuple[] = [];
    const firstCoord = nodeCoords.get(segStartOsm);
    if (!firstCoord) continue;
    currentGeom.push(firstCoord);

    for (let i = 1; i < nodes.length; i++) {
      const nid = nodes[i];
      const pt = nodeCoords.get(nid);
      if (!pt) continue;
      currentGeom.push(pt);

      const isEnd = i === nodes.length - 1;
      const isJunction = (nodeDegree.get(nid) || 0) >= 2;

      if (isEnd || isJunction) {
        const fromInter = ensureIntersection(segStartOsm, streetName);
        const toInter = ensureIntersection(nid, streetName);

        if (fromInter && toInter && fromInter.id !== toInter.id && currentGeom.length >= 2) {
          const { cumulative, totalKm } = buildCumulativeDistances(currentGeom);
          if (totalKm >= 0.04) {
            const roadId = `E${String(roadCounter++).padStart(3, '0')}`;
            roads.push({
              id: roadId,
              osmWayId: w.id,
              name: streetName,
              from: fromInter.id,
              to: toInter.id,
              oneway,
              roadType: isBridge ? 'bridge' : meta.type,
              geometry: [...currentGeom],
              cumulativeDistances: cumulative,
              length: Number(totalKm.toFixed(3)),
              maxSpeed: meta.speed,
              capacity: meta.cap,
              vehicleCount: 0,
              density: 0.1,
              travelTime: Number(((totalKm / meta.speed) * 60).toFixed(2)),
              closed: false,
            });
          }
        }

        segStartOsm = nid;
        currentGeom = [pt];
      }
    }
  }

  // Extract largest connected component so A* and vehicles never get stranded on tiny disconnected stubs
  const adj = new Map<string, string[]>();
  intersections.forEach(i => adj.set(i.id, []));
  roads.forEach(r => {
    adj.get(r.from)?.push(r.to);
    adj.get(r.to)?.push(r.from);
  });

  const visited = new Set<string>();
  let largestComp = new Set<string>();

  for (const inter of intersections) {
    if (visited.has(inter.id)) continue;
    const comp = new Set<string>();
    const queue = [inter.id];
    visited.add(inter.id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      comp.add(curr);
      for (const nxt of adj.get(curr) || []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }
    if (comp.size > largestComp.size) {
      largestComp = comp;
    }
  }

  const filteredIntersections = intersections.filter(i => largestComp.has(i.id));
  const filteredRoads = roads.filter(r => largestComp.has(r.from) && largestComp.has(r.to));

  return { intersections: filteredIntersections, roads: filteredRoads };
}

async function fetchAstanaOSMGraph(forceRefresh = false): Promise<OSMGraphData> {
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(OVERPASS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed?.intersections) && parsed.intersections.length > 20 && Array.isArray(parsed?.roads) && parsed.roads.length > 30) {
          return {
            intersections: parsed.intersections,
            roads: parsed.roads,
            source: 'overpass-cache',
          };
        }
      }
    } catch {
      // Ignore cache read error
    }
  }

  // Overpass QL query for Astana's primary urban road network (Left Bank, Right Bank, Ishim bridges, EXPO & Airport corridor)
  const overpassQuery = `
    [out:json][timeout:25];
    (
      way["highway"~"^(motorway|trunk|primary|secondary)$"](51.020,71.365,51.202,71.505);
      way["highway"="tertiary"](51.085,71.385,51.175,71.485);
    );
    (._;>;);
    out body;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const graph = parseOverpassResponse(json);

  if (graph.intersections.length < 15 || graph.roads.length < 20) {
    throw new Error('Overpass API returned insufficient road segments for Astana bounding box.');
  }

  try {
    localStorage.setItem(OVERPASS_CACHE_KEY, JSON.stringify(graph));
  } catch {
    // Ignore storage quota warning
  }

  return { ...graph, source: 'overpass-live' };
}

function findNearestIntersection(intersections: Intersection[], lat: number, lng: number): Intersection | null {
  let best: Intersection | null = null;
  let bestDist = Infinity;
  for (const inter of intersections) {
    const d = haversineKm(lat, lng, inter.lat, inter.lng);
    if (d < bestDist) {
      bestDist = d;
      best = inter;
    }
  }
  return best;
}

function buildTeamsOnRealGraph(intersections: Intersection[]): MunicipalTeam[] {
  const findNode = (lat: number, lng: number) => findNearestIntersection(intersections, lat, lng)?.id || intersections[0]?.id || 'N001';
  const nodePos = (id: string): LatLngTuple => {
    const found = intersections.find(i => i.id === id);
    return found ? [found.lat, found.lng] : ASTANA_CENTER;
  };

  const specs: {
    id: string;
    name: string;
    category: TeamCategory;
    skills: IncidentCategory[];
    lat: number;
    lng: number;
  }[] = [
    { id: 'AMB-01', name: 'MedEvac Left Bank (Turan)', category: 'Ambulance', skills: ['Medical emergency', 'Traffic accident'], lat: 51.1245, lng: 71.3945 },
    { id: 'AMB-02', name: 'MedEvac Right Bank (Saryarka)', category: 'Ambulance', skills: ['Medical emergency', 'Traffic accident'], lat: 51.1685, lng: 71.4255 },
    { id: 'FIRE-01', name: 'Astana Rescue Squad 1 (Baiterek)', category: 'Fire Department', skills: ['Fire emergency', 'Traffic accident', 'Road obstruction'], lat: 51.1292, lng: 71.4325 },
    { id: 'FIRE-02', name: 'Industrial Fire Unit 2 (North)', category: 'Fire Department', skills: ['Fire emergency', 'Road obstruction'], lat: 51.1815, lng: 71.4720 },
    { id: 'POL-01', name: 'CyberPatrol Central (Ak Orda)', category: 'Police', skills: ['Traffic accident', 'Public safety incident', 'Road obstruction'], lat: 51.1268, lng: 71.4450 },
    { id: 'POL-02', name: 'CyberPatrol Right Bank (Respublika)', category: 'Police', skills: ['Traffic accident', 'Public safety incident'], lat: 51.1630, lng: 71.4330 },
    { id: 'ROAD-01', name: 'SmartRoad Bridge Rapid Unit', category: 'Road Repair', skills: ['Road obstruction', 'Vehicle breakdown'], lat: 51.1480, lng: 71.4285 },
    { id: 'ELEC-01', name: 'AstanaGrid Autonomous Unit', category: 'Electrical Repair', skills: ['Power outage'], lat: 51.1140, lng: 71.4240 },
    { id: 'SUP-01', name: 'EXPO Drone & Tow Support', category: 'Municipal Support', skills: ['Vehicle breakdown', 'Road obstruction', 'Public safety incident'], lat: 51.0910, lng: 71.4160 },
  ];

  return specs.map(s => {
    const nodeId = findNode(s.lat, s.lng);
    const [lat, lng] = nodePos(nodeId);
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      skills: s.skills,
      currentNode: nodeId,
      homeNode: nodeId,
      lat,
      lng,
      available: true,
      capacity: 1,
      assignedIncidentId: null,
      eta: null,
      vehicleId: null,
    };
  });
}

// ============================================================================
// 4. AI SYSTEM 2: A* SEARCH ON REAL GEOGRAPHICAL ROAD NETWORK (Week 2)
// ============================================================================

function computeRoadCost(
  road: RoadSegment,
  weather: WeatherType,
  incidents: Incident[],
  useDynamicCosts: boolean
): number {
  if (road.closed) return Infinity;
  const weatherSpeedMult = useDynamicCosts ? getWeatherSpeedMultiplier(weather) : 1.0;
  const effectiveSpeed = Math.max(10, road.maxSpeed * weatherSpeedMult);
  const baseMinutes = (road.length / effectiveSpeed) * 60;

  if (!useDynamicCosts) {
    // Conventional mode: static shortest distance ignoring real-time congestion
    return road.length;
  }

  // Dynamic cost: congestion BPR penalty + weather penalty + incident proximity penalty
  const congestionFactor = 1 + 2.8 * Math.pow(Math.min(1.5, road.density), 2);
  const weatherPenalty = getWeatherPenaltyMultiplier(weather);
  const incidentOnRoad = incidents.some(
    inc =>
      inc.status !== 'Resolved' &&
      inc.status !== 'Cancelled' &&
      (inc.roadId === road.id || inc.intersectionId === road.to || inc.intersectionId === road.from)
  );
  const incidentPenalty = incidentOnRoad ? 4.5 : 0;

  return Math.max(0.05, baseMinutes * congestionFactor * weatherPenalty + incidentPenalty);
}

function runAStarSearch(
  startId: string,
  goalId: string,
  intersections: Intersection[],
  roads: RoadSegment[],
  weather: WeatherType,
  incidents: Incident[],
  useDynamicCosts: boolean = true
): AStarResult {
  const nodeMap = new Map<string, Intersection>();
  intersections.forEach(i => nodeMap.set(i.id, i));

  const startNode = nodeMap.get(startId);
  const goalNode = nodeMap.get(goalId);
  if (!startNode || !goalNode) {
    return { path: [], polyline: [], totalTime: 0, totalDistance: 0, exploredNodes: [], expandedCount: 0, trace: [], unreachable: true };
  }
  if (startId === goalId) {
    return {
      path: [startId],
      polyline: [[startNode.lat, startNode.lng]],
      totalTime: 0,
      totalDistance: 0,
      exploredNodes: [startId],
      expandedCount: 1,
      trace: [],
      unreachable: false,
    };
  }

  // Admissible Haversine heuristic divided by max urban highway speed (90 km/h)
  const MAX_CITY_SPEED = 90;
  const heuristic = (nodeId: string): number => {
    const n = nodeMap.get(nodeId);
    if (!n) return 0;
    const distKm = haversineKm(n.lat, n.lng, goalNode.lat, goalNode.lng);
    return useDynamicCosts ? (distKm / MAX_CITY_SPEED) * 60 : distKm;
  };

  // Build directed adjacency list respecting OSM one-way restrictions
  const adj = new Map<string, { neighbor: string; road: RoadSegment; cost: number; reverse: boolean }[]>();
  intersections.forEach(i => adj.set(i.id, []));
  roads.forEach(r => {
    if (!r.closed) {
      const cost = computeRoadCost(r, weather, incidents, useDynamicCosts);
      if (isFinite(cost)) {
        adj.get(r.from)?.push({ neighbor: r.to, road: r, cost, reverse: false });
        if (!r.oneway) {
          adj.get(r.to)?.push({ neighbor: r.from, road: r, cost, reverse: true });
        }
      }
    }
  });

  const openSet = new Set<string>([startId]);
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, { prev: string; road: RoadSegment; reverse: boolean }>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  intersections.forEach(i => {
    gScore.set(i.id, Infinity);
    fScore.set(i.id, Infinity);
  });
  gScore.set(startId, 0);
  fScore.set(startId, heuristic(startId));

  const trace: AStarStep[] = [];
  let expandedCount = 0;

  while (openSet.size > 0) {
    let current = '';
    let lowestF = Infinity;
    openSet.forEach(id => {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = id;
      }
    });

    if (!current) break;

    if (trace.length < 60) {
      trace.push({
        current,
        g: Number((gScore.get(current) ?? 0).toFixed(2)),
        h: Number(heuristic(current).toFixed(2)),
        f: Number(lowestF.toFixed(2)),
        frontier: Array.from(openSet).slice(0, 8),
        visited: Array.from(closedSet).slice(-8),
      });
    }

    if (current === goalId) {
      const path: string[] = [current];
      const edgesUsed: { road: RoadSegment; reverse: boolean }[] = [];
      let curr = current;
      while (cameFrom.has(curr)) {
        const step = cameFrom.get(curr)!;
        edgesUsed.unshift({ road: step.road, reverse: step.reverse });
        curr = step.prev;
        path.unshift(curr);
      }

      // Stitch exact OSM street geometry polyline
      const polyline: LatLngTuple[] = [];
      let totalDistance = 0;
      let totalTime = 0;
      for (const { road, reverse } of edgesUsed) {
        totalDistance += road.length;
        totalTime += computeRoadCost(road, weather, incidents, true);
        const pts = reverse ? [...road.geometry].reverse() : road.geometry;
        if (polyline.length === 0) {
          polyline.push(...pts);
        } else {
          polyline.push(...pts.slice(1));
        }
      }

      return {
        path,
        polyline,
        totalTime: Number(totalTime.toFixed(2)),
        totalDistance: Number(totalDistance.toFixed(2)),
        exploredNodes: Array.from(closedSet).concat(current),
        expandedCount,
        trace,
        unreachable: false,
      };
    }

    openSet.delete(current);
    closedSet.add(current);
    expandedCount++;

    const neighbors = adj.get(current) || [];
    for (const { neighbor, road, cost, reverse } of neighbors) {
      if (closedSet.has(neighbor)) continue;
      const tentativeG = (gScore.get(current) ?? Infinity) + cost;
      if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, { prev: current, road, reverse });
        gScore.set(neighbor, tentativeG);
        fScore.set(neighbor, tentativeG + heuristic(neighbor));
        openSet.add(neighbor);
      }
    }
  }

  return {
    path: [],
    polyline: [],
    totalTime: 0,
    totalDistance: 0,
    exploredNodes: Array.from(closedSet),
    expandedCount,
    trace,
    unreachable: true,
  };
}

// ============================================================================
// 5. AI SYSTEM 3: CONSTRAINT SATISFACTION PROBLEM (CSP) DISPATCHER (Week 3)
// ============================================================================

function solveCSPDispatch(
  incidents: Incident[],
  teams: MunicipalTeam[],
  intersections: Intersection[],
  roads: RoadSegment[],
  weather: WeatherType,
  useAStarRouting: boolean = true
): CSPResult {
  const activeIncidents = incidents.filter(i => i.status === 'Pending');
  const trace: string[] = [];
  const rejections: CSPRejection[] = [];

  if (activeIncidents.length === 0) {
    return { assignments: [], unassigned: [], rejections: [], trace: ['No pending incidents requiring dispatch.'], backtracks: 0 };
  }

  const severityRank: Record<SeverityLevel, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  interface Candidate {
    team: MunicipalTeam;
    travelTime: number;
    route: string[];
  }

  const domains = new Map<string, Candidate[]>();

  for (const inc of activeIncidents) {
    const validCandidates: Candidate[] = [];
    for (const team of teams) {
      if (!team.available || team.capacity <= 0) {
        rejections.push({ incidentId: inc.id, teamId: team.id, reason: `Team ${team.id} is currently unavailable/busy.` });
        continue;
      }
      if (!team.skills.includes(inc.category)) {
        rejections.push({
          incidentId: inc.id,
          teamId: team.id,
          reason: `${team.id} (${team.category}) lacks required skill for ${inc.category}.`,
        });
        continue;
      }
      const routeRes = runAStarSearch(team.currentNode, inc.intersectionId, intersections, roads, weather, incidents, useAStarRouting);
      if (routeRes.unreachable) {
        rejections.push({
          incidentId: inc.id,
          teamId: team.id,
          reason: `No valid OSM street route from ${team.currentNode} to ${inc.intersectionId} due to road closures.`,
        });
        continue;
      }
      if (routeRes.totalTime > 60) {
        rejections.push({
          incidentId: inc.id,
          teamId: team.id,
          reason: `Estimated travel time (${routeRes.totalTime.toFixed(1)}m) exceeds 60m operational limit.`,
        });
        continue;
      }
      validCandidates.push({ team, travelTime: routeRes.totalTime, route: routeRes.path });
    }
    validCandidates.sort((a, b) => a.travelTime - b.travelTime);
    domains.set(inc.id, validCandidates);
    trace.push(`Domain[${inc.id} (${inc.category}, ${inc.severity})]: ${validCandidates.length} eligible team(s) [${validCandidates.map(c => c.team.id).join(', ') || 'NONE'}]`);
  }

  const orderedVars = [...activeIncidents].sort((a, b) => {
    const domA = domains.get(a.id)?.length ?? 0;
    const domB = domains.get(b.id)?.length ?? 0;
    if (severityRank[b.severity] !== severityRank[a.severity]) {
      return severityRank[b.severity] - severityRank[a.severity];
    }
    return domA - domB;
  });

  let bestSolution: Map<string, Candidate> = new Map();
  let bestScore = -Infinity;
  let backtracks = 0;

  function backtrack(index: number, currentAssign: Map<string, Candidate>, usedTeams: Set<string>) {
    if (index === orderedVars.length) {
      let score = 0;
      currentAssign.forEach((cand, incId) => {
        const inc = orderedVars.find(v => v.id === incId)!;
        score += severityRank[inc.severity] * 1000 - cand.travelTime;
      });
      if (score > bestScore) {
        bestScore = score;
        bestSolution = new Map(currentAssign);
      }
      return;
    }

    const variable = orderedVars[index];
    const candidates = (domains.get(variable.id) || []).filter(c => !usedTeams.has(c.team.id));

    if (candidates.length === 0) {
      trace.push(`Variable ${variable.id}: No available unallocated team in domain; backtracking.`);
      backtracks++;
      backtrack(index + 1, currentAssign, usedTeams);
      return;
    }

    for (const candidate of candidates) {
      trace.push(`Trying ${candidate.team.id} -> ${variable.id} (ETA: ${candidate.travelTime.toFixed(1)}m)...`);
      currentAssign.set(variable.id, candidate);
      usedTeams.add(candidate.team.id);

      let forwardCheckOk = true;
      for (let nextIdx = index + 1; nextIdx < orderedVars.length; nextIdx++) {
        const futureVar = orderedVars[nextIdx];
        const futureOrigDom = domains.get(futureVar.id) || [];
        if (futureOrigDom.length > 0) {
          const remaining = futureOrigDom.filter(c => !usedTeams.has(c.team.id));
          if (remaining.length === 0) {
            forwardCheckOk = false;
            trace.push(`Forward Check warning: assigning ${candidate.team.id} empties domain of ${futureVar.id}.`);
            break;
          }
        }
      }

      if (!forwardCheckOk) backtracks++;
      backtrack(index + 1, currentAssign, usedTeams);

      currentAssign.delete(variable.id);
      usedTeams.delete(candidate.team.id);
      if (bestSolution.size === orderedVars.length && index === 0) break;
    }
  }

  backtrack(0, new Map(), new Set());

  const assignments: CSPAssignment[] = [];
  const unassigned: { incidentId: string; reason: string }[] = [];

  for (const inc of orderedVars) {
    const chosen = bestSolution.get(inc.id);
    if (chosen) {
      assignments.push({
        incidentId: inc.id,
        teamId: chosen.team.id,
        travelTime: chosen.travelTime,
        route: chosen.route,
      });
      trace.push(`CONFIRMED: ${chosen.team.id} assigned to ${inc.id} (Constraint Validation: PASSED).`);
    } else {
      const domLen = domains.get(inc.id)?.length ?? 0;
      const reason =
        domLen === 0
          ? `No available team has required skill (${inc.category}) or reachable route.`
          : `All compatible teams were allocated to higher-priority incidents.`;
      unassigned.push({ incidentId: inc.id, reason });
      trace.push(`UNASSIGNED: ${inc.id} remains Pending — ${reason}`);
    }
  }

  return { assignments, unassigned, rejections, trace, backtracks };
}

// ============================================================================
// 6. AI SYSTEM 4: BAYESIAN NETWORK PROBABILISTIC INFERENCE (Week 6)
// ============================================================================

const BAYESIAN_PARAMS = {
  priors: {
    rushHour: 0.35,
    badWeather: 0.25,
    highDemand: 0.40,
    roadClosures: 0.15,
    highIncidentSeverity: 0.20,
    lowTeamAvailability: 0.25,
  },
  congestionNoisyOR: {
    leak: 0.06,
    pRushHour: 0.48,
    pBadWeather: 0.42,
    pHighDemand: 0.58,
    pRoadClosures: 0.52,
  },
  delayCPT: {
    '0,0,0': 0.05,
    '0,0,1': 0.34,
    '0,1,0': 0.28,
    '0,1,1': 0.68,
    '1,0,0': 0.44,
    '1,0,1': 0.78,
    '1,1,0': 0.72,
    '1,1,1': 0.94,
  } as Record<string, number>,
};

function runBayesianInference(evidence: BayesianEvidence): BayesianResult {
  const { leak, pRushHour, pBadWeather, pHighDemand, pRoadClosures } = BAYESIAN_PARAMS.congestionNoisyOR;
  let probNoCongestion = 1 - leak;
  if (evidence.rushHour) probNoCongestion *= 1 - pRushHour;
  if (evidence.badWeather) probNoCongestion *= 1 - pBadWeather;
  if (evidence.highDemand) probNoCongestion *= 1 - pHighDemand;
  if (evidence.roadClosures) probNoCongestion *= 1 - pRoadClosures;

  const pCongestionTrue = Math.min(0.99, Math.max(0.01, 1 - probNoCongestion));
  const pCongestionFalse = 1 - pCongestionTrue;

  const sevBit = evidence.highIncidentSeverity ? '1' : '0';
  const teamBit = evidence.lowTeamAvailability ? '1' : '0';

  const pDelayGivenC1 = BAYESIAN_PARAMS.delayCPT[`1,${sevBit},${teamBit}`];
  const pDelayGivenC0 = BAYESIAN_PARAMS.delayCPT[`0,${sevBit},${teamBit}`];

  const pDelayTrue = pDelayGivenC1 * pCongestionTrue + pDelayGivenC0 * pCongestionFalse;

  const classify = (p: number): 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Critical Risk' => {
    const pct = p * 100;
    if (pct <= 25) return 'Low Risk';
    if (pct <= 50) return 'Moderate Risk';
    if (pct <= 75) return 'High Risk';
    return 'Critical Risk';
  };

  const explanation: string[] = [];
  if (evidence.highDemand) explanation.push('High traffic demand (>60%) increases congestion causal weight (+0.58).');
  if (evidence.rushHour) explanation.push('Peak rush-hour window active (08:00–10:00 or 17:00–19:30, weight +0.48).');
  if (evidence.badWeather) explanation.push('Adverse weather reduces road friction and visibility (weight +0.42).');
  if (evidence.roadClosures) explanation.push('Active road/bridge closures funnel vehicles onto Ishim River bottlenecks (+0.52).');
  if (evidence.highIncidentSeverity) explanation.push('High/Critical incidents elevate emergency response delay CPT.');
  if (evidence.lowTeamAvailability) explanation.push('Low municipal team availability (<4 units free) increases dispatch delay risk.');
  if (explanation.length === 0) {
    explanation.push('Baseline leak probabilities active; nominal urban flow expected across Astana.');
  }

  return {
    congestionProb: pCongestionTrue,
    delayProb: pDelayTrue,
    congestionRisk: classify(pCongestionTrue),
    delayRisk: classify(pDelayTrue),
    explanation,
    factors: [
      { name: 'Rush Hour', active: evidence.rushHour, impact: 'P(C|RH)=0.48' },
      { name: 'Bad Weather', active: evidence.badWeather, impact: 'P(C|BW)=0.42' },
      { name: 'High Traffic Demand', active: evidence.highDemand, impact: 'P(C|HD)=0.58' },
      { name: 'Road Closures', active: evidence.roadClosures, impact: 'P(C|RC)=0.52' },
      { name: 'High Incident Severity', active: evidence.highIncidentSeverity, impact: 'CPT Sev=1' },
      { name: 'Low Team Availability', active: evidence.lowTeamAvailability, impact: 'CPT Team=1' },
    ],
  };
}

// ============================================================================
// 7. SIMULATION ENGINE ON REAL ASTANA OSM ROAD GRAPH
// ============================================================================

function createInitialTrafficLights(intersections: Intersection[]): Record<string, TrafficLightState> {
  const lights: Record<string, TrafficLightState> = {};
  intersections.forEach((inter, idx) => {
    if (inter.hasTrafficLight) {
      lights[inter.id] = {
        intersectionId: inter.id,
        phase: idx % 2 === 0 ? 'NS_GREEN' : 'EW_GREEN',
        timer: (idx * 3) % 12,
        greenDuration: 12,
        nsQueue: 0,
        ewQueue: 0,
        emergencyOverride: false,
        reasoning: 'Monitoring directional queues on real Astana intersection approaches.',
      };
    }
  });
  return lights;
}

function findEdgeBetween(roads: RoadSegment[], fromId: string, toId: string): { road: RoadSegment; reverse: boolean } | null {
  for (const r of roads) {
    if (r.closed) continue;
    if (r.from === fromId && r.to === toId) return { road: r, reverse: false };
    if (!r.oneway && r.to === fromId && r.from === toId) return { road: r, reverse: true };
  }
  return null;
}

function spawnVehicle(
  rng: SeededRandom,
  idNum: number,
  intersections: Intersection[],
  roads: RoadSegment[],
  weather: WeatherType,
  incidents: Incident[],
  aiEnabled: boolean,
  forcedType?: VehicleType,
  forcedOrigin?: string,
  forcedDest?: string
): Vehicle | null {
  if (intersections.length < 2) return null;
  const originInter = forcedOrigin ? intersections.find(i => i.id === forcedOrigin) : rng.pick(intersections);
  let destInter = forcedDest ? intersections.find(i => i.id === forcedDest) : rng.pick(intersections);
  let attempts = 0;
  while ((!destInter || destInter.id === originInter?.id) && attempts < 12) {
    destInter = rng.pick(intersections);
    attempts++;
  }
  if (!originInter || !destInter || originInter.id === destInter.id) return null;

  const routeRes = runAStarSearch(originInter.id, destInter.id, intersections, roads, weather, incidents, aiEnabled);
  if (routeRes.unreachable || routeRes.path.length < 2) return null;

  const nextNode = routeRes.path[1];
  const edgeInfo = findEdgeBetween(roads, originInter.id, nextNode);
  if (!edgeInfo) return null;

  const types: VehicleType[] = ['car', 'car', 'car', 'taxi', 'bus', 'delivery'];
  const vType = forcedType || rng.pick(types);

  return {
    id: `V-${String(idNum).padStart(3, '0')}`,
    type: vType,
    currentNode: originInter.id,
    nextNode,
    currentRoadId: edgeInfo.road.id,
    progress: 0,
    lat: originInter.lat,
    lng: originInter.lng,
    destination: destInter.id,
    route: routeRes.path,
    speed: Math.round(edgeInfo.road.maxSpeed * getWeatherSpeedMultiplier(weather)),
    status: 'moving',
    waitingTime: 0,
    travelTime: 0,
    recalculations: 0,
    lastDecision: `PERCEIVE->DECIDE: Initial OSM street route planned (${routeRes.path.length} nodes, ${routeRes.totalDistance}km).`,
  };
}

function createInitialSimulationState(
  intersections: Intersection[],
  roads: RoadSegment[],
  scenarioName = 'Scenario 01 — Normal Morning',
  seed = 2040
): SimulationState {
  const rng = new SeededRandom(seed);
  const clonedIntersections = intersections.map(i => ({ ...i }));
  const clonedRoads = roads.map(r => ({ ...r }));
  const trafficLights = createInitialTrafficLights(clonedIntersections);
  const teams = buildTeamsOnRealGraph(clonedIntersections);
  let weather: WeatherType = 'Clear';
  let trafficDemand = 45;
  let simSeconds = 8 * 3600; // 08:00:00
  const incidents: Incident[] = [];

  if (clonedIntersections.length > 0 && clonedRoads.length > 0) {
    if (scenarioName.includes('Rush Hour')) {
      trafficDemand = 82;
      simSeconds = 8 * 3600 + 45 * 60;
    } else if (scenarioName.includes('Winter Storm')) {
      weather = 'Heavy Snowstorm';
      trafficDemand = 60;
    } else if (scenarioName.includes('Bridge Closure')) {
      // Find a real Ishim River bridge road segment near central Astana (lat ~ 51.148)
      const bridge =
        clonedRoads.find(r => r.roadType === 'bridge' && r.geometry[0][0] > 51.125 && r.geometry[0][0] < 51.165) ||
        clonedRoads.find(r => r.roadType === 'bridge') ||
        clonedRoads[Math.floor(clonedRoads.length / 2)];
      if (bridge) {
        bridge.closed = true;
        bridge.closureReason = 'Ishim Bridge Structural Inspection';
      }
      trafficDemand = 65;
    } else if (scenarioName.includes('Multiple Accidents')) {
      trafficDemand = 68;
      const nBaiterek = findNearestIntersection(clonedIntersections, 51.1283, 71.4306) || clonedIntersections[0];
      const nRightBank = findNearestIntersection(clonedIntersections, 51.1645, 71.4280) || clonedIntersections[1];
      const nExpo = findNearestIntersection(clonedIntersections, 51.0905, 71.4155) || clonedIntersections[2];
      incidents.push(
        {
          id: 'INC-101',
          category: 'Traffic accident',
          severity: 'High',
          intersectionId: nBaiterek.id,
          lat: nBaiterek.lat,
          lng: nBaiterek.lng,
          createdAt: 480,
          status: 'Pending',
          assignedTeamId: null,
          estimatedResponseTime: null,
          serviceRemaining: 25,
        },
        {
          id: 'INC-102',
          category: 'Fire emergency',
          severity: 'Critical',
          intersectionId: nRightBank.id,
          lat: nRightBank.lat,
          lng: nRightBank.lng,
          createdAt: 480,
          status: 'Pending',
          assignedTeamId: null,
          estimatedResponseTime: null,
          serviceRemaining: 30,
        },
        {
          id: 'INC-103',
          category: 'Medical emergency',
          severity: 'High',
          intersectionId: nExpo.id,
          lat: nExpo.lat,
          lng: nExpo.lng,
          createdAt: 480,
          status: 'Pending',
          assignedTeamId: null,
          estimatedResponseTime: null,
          serviceRemaining: 20,
        }
      );
    } else if (scenarioName.includes('Major City Event')) {
      trafficDemand = 85;
      simSeconds = 17 * 3600 + 30 * 60;
    }
  }

  const vehicles: Vehicle[] = [];
  if (clonedIntersections.length >= 2 && clonedRoads.length >= 2) {
    const initialVehicleCount = Math.max(18, Math.round(trafficDemand * 0.55));
    const expoNode = findNearestIntersection(clonedIntersections, 51.0892, 71.4148)?.id;
    for (let i = 1; i <= initialVehicleCount; i++) {
      const dest = scenarioName.includes('Major City Event') ? expoNode : undefined;
      const v = spawnVehicle(rng, i, clonedIntersections, clonedRoads, weather, incidents, true, undefined, undefined, dest);
      if (v) {
        const edge = findEdgeBetween(clonedRoads, v.currentNode, v.nextNode || '');
        if (edge) {
          v.progress = Number(rng.range(0.05, 0.75).toFixed(2));
          const [lat, lng] = interpolateAlongRoad(edge.road, v.progress, edge.reverse);
          v.lat = lat;
          v.lng = lng;
        }
        vehicles.push(v);
      }
    }

    clonedRoads.forEach(r => {
      const count = vehicles.filter(v => v.currentRoadId === r.id).length;
      r.vehicleCount = count;
      r.density = Number((count / r.capacity).toFixed(2));
      r.travelTime = Number(computeRoadCost(r, weather, incidents, true).toFixed(1));
    });
  }

  const logs: ActivityLog[] = [
    {
      id: 'log-init-1',
      simTime: formatSimTime(simSeconds),
      category: 'Agents',
      message: `ASTANA 2040 OSM Graph online (${clonedIntersections.length} real intersections, ${clonedRoads.length} street segments).`,
      severity: 'info',
    },
    {
      id: 'log-init-2',
      simTime: formatSimTime(simSeconds),
      category: 'Bayesian',
      message: `Weather: ${weather}, Traffic Demand: ${trafficDemand}%. ${vehicles.length} autonomous agents active on Astana streets.`,
      severity: 'info',
    },
  ];

  return {
    seed,
    simSeconds,
    status: 'paused',
    speed: 1,
    aiEnabled: true,
    weather,
    trafficDemand,
    intersections: clonedIntersections,
    roads: clonedRoads,
    trafficLights,
    vehicles,
    incidents,
    teams,
    logs,
    completedJourneys: 0,
    totalCompletedTravelTime: 0,
    totalVehicleWaitTime: 0,
    totalReroutes: 0,
    resolvedIncidentsCount: 0,
    totalResponseTime: 0,
    assignedIncidentsCount: 0,
    history: [
      {
        timeLabel: formatSimShortTime(simSeconds),
        avgDensity: clonedRoads.length ? Number(((clonedRoads.reduce((a, b) => a + b.density, 0) / clonedRoads.length) * 100).toFixed(1)) : 0,
        avgTravelTime: 4.5,
        avgWaitTime: 0,
        activeVehicles: vehicles.length,
        congestionProb: 25,
      },
    ],
    scenarioName,
  };
}

function stepSimulation(prev: SimulationState, dtSeconds = 2): SimulationState {
  if (prev.intersections.length < 2 || prev.roads.length < 2) return prev;

  const nextSimSeconds = prev.simSeconds + dtSeconds;
  const simTimeStr = formatSimTime(nextSimSeconds);
  const rng = new SeededRandom(prev.seed + Math.floor(nextSimSeconds));

  const roads = prev.roads.map(r => ({ ...r }));
  const roadMap = new Map<string, RoadSegment>();
  roads.forEach(r => roadMap.set(r.id, r));

  const interMap = new Map<string, Intersection>();
  prev.intersections.forEach(i => interMap.set(i.id, i));

  const incidents = prev.incidents.map(i => ({ ...i }));
  const teams = prev.teams.map(t => ({ ...t }));
  const trafficLights: Record<string, TrafficLightState> = {};
  Object.keys(prev.trafficLights).forEach(k => {
    trafficLights[k] = { ...prev.trafficLights[k] };
  });

  const newLogs: ActivityLog[] = [];
  const pushLog = (category: ActivityLog['category'], message: string, severity: ActivityLog['severity'] = 'info') => {
    if (newLogs.length < 6) {
      newLogs.push({
        id: `log-${nextSimSeconds}-${rng.next().toFixed(6)}`,
        simTime: simTimeStr,
        category,
        message,
        severity,
      });
    }
  };

  let completedJourneys = prev.completedJourneys;
  let totalCompletedTravelTime = prev.totalCompletedTravelTime;
  let totalVehicleWaitTime = prev.totalVehicleWaitTime;
  let totalReroutes = prev.totalReroutes;
  let resolvedIncidentsCount = prev.resolvedIncidentsCount;
  let totalResponseTime = prev.totalResponseTime;
  let assignedIncidentsCount = prev.assignedIncidentsCount;

  // 1. DISPATCH AGENT & CSP / BASELINE ALLOCATION
  const pendingIncidents = incidents.filter(i => i.status === 'Pending');
  let updatedVehicles = prev.vehicles.map(v => ({ ...v }));

  if (pendingIncidents.length > 0) {
    if (prev.aiEnabled) {
      const cspRes = solveCSPDispatch(incidents, teams, prev.intersections, roads, prev.weather, true);
      for (const assign of cspRes.assignments) {
        const inc = incidents.find(i => i.id === assign.incidentId);
        const team = teams.find(t => t.id === assign.teamId);
        if (inc && team && inc.status === 'Pending' && team.available) {
          inc.status = 'Dispatched';
          inc.assignedTeamId = team.id;
          inc.estimatedResponseTime = Number(assign.travelTime.toFixed(1));
          team.available = false;
          team.assignedIncidentId = inc.id;
          team.eta = Number(assign.travelTime.toFixed(1));
          assignedIncidentsCount++;
          totalResponseTime += assign.travelTime;

          const respVeh = spawnVehicle(
            rng,
            900 + Math.floor(rng.range(1, 99)),
            prev.intersections,
            roads,
            prev.weather,
            incidents,
            true,
            team.category === 'Ambulance' || team.category === 'Fire Department' || team.category === 'Police'
              ? 'emergency'
              : 'municipal',
            team.currentNode,
            inc.intersectionId
          );
          if (respVeh) {
            respVeh.id = team.id;
            respVeh.assignedIncidentId = inc.id;
            respVeh.assignedTeamId = team.id;
            team.vehicleId = respVeh.id;
            updatedVehicles.push(respVeh);
          }

          pushLog(
            'CSP',
            `CSP Solver assigned ${team.id} to ${inc.id} (${inc.category}) — ETA ${assign.travelTime.toFixed(1)}m via OSM streets.`,
            'success'
          );
        }
      }
    } else {
      for (const inc of pendingIncidents) {
        const eligible = teams.filter(t => t.available && t.skills.includes(inc.category));
        if (eligible.length > 0) {
          const team = eligible[0];
          const routeRes = runAStarSearch(team.currentNode, inc.intersectionId, prev.intersections, roads, prev.weather, incidents, false);
          if (!routeRes.unreachable) {
            inc.status = 'Dispatched';
            inc.assignedTeamId = team.id;
            inc.estimatedResponseTime = Number(routeRes.totalTime.toFixed(1));
            team.available = false;
            team.assignedIncidentId = inc.id;
            team.eta = Number(routeRes.totalTime.toFixed(1));
            assignedIncidentsCount++;
            totalResponseTime += routeRes.totalTime;

            const respVeh = spawnVehicle(
              rng,
              900 + Math.floor(rng.range(1, 99)),
              prev.intersections,
              roads,
              prev.weather,
              incidents,
              false,
              'emergency',
              team.currentNode,
              inc.intersectionId
            );
            if (respVeh) {
              respVeh.id = team.id;
              respVeh.assignedIncidentId = inc.id;
              respVeh.assignedTeamId = team.id;
              team.vehicleId = respVeh.id;
              updatedVehicles.push(respVeh);
            }
          }
        }
      }
    }
  }

  // 2. INTELLIGENT TRAFFIC LIGHT AGENTS AT REAL INTERSECTIONS
  Object.values(trafficLights).forEach(tl => {
    const inter = interMap.get(tl.intersectionId);
    if (!inter) return;

    let nsQueue = 0;
    let ewQueue = 0;
    let emergencyDir: 'NS' | 'EW' | null = null;

    for (const v of updatedVehicles) {
      if (v.nextNode === tl.intersectionId && v.progress > 0.65) {
        const fromInter = interMap.get(v.currentNode);
        if (fromInter) {
          const isNS = Math.abs(inter.lat - fromInter.lat) >= Math.abs(inter.lng - fromInter.lng);
          if (isNS) nsQueue++;
          else ewQueue++;
          if (v.type === 'emergency') emergencyDir = isNS ? 'NS' : 'EW';
        }
      }
    }

    tl.nsQueue = nsQueue;
    tl.ewQueue = ewQueue;
    tl.timer += dtSeconds;

    if (prev.aiEnabled) {
      if (emergencyDir) {
        tl.emergencyOverride = true;
        if (emergencyDir === 'NS' && tl.phase === 'EW_GREEN') {
          tl.phase = 'EW_YELLOW';
          tl.timer = 0;
          tl.reasoning = `EMERGENCY PREEMPTION: Transitioning EW->Yellow to clear North-South corridor.`;
          pushLog('Agents', `Traffic Light ${tl.intersectionId} initiated emergency preemption for NS corridor.`, 'warning');
        } else if (emergencyDir === 'EW' && tl.phase === 'NS_GREEN') {
          tl.phase = 'NS_YELLOW';
          tl.timer = 0;
          tl.reasoning = `EMERGENCY PREEMPTION: Transitioning NS->Yellow to clear East-West corridor.`;
          pushLog('Agents', `Traffic Light ${tl.intersectionId} initiated emergency preemption for EW corridor.`, 'warning');
        } else if (tl.phase === 'EW_YELLOW' && tl.timer >= 2) {
          tl.phase = 'NS_GREEN';
          tl.timer = 0;
        } else if (tl.phase === 'NS_YELLOW' && tl.timer >= 2) {
          tl.phase = 'EW_GREEN';
          tl.timer = 0;
        }
      } else {
        tl.emergencyOverride = false;
        if (tl.phase === 'NS_YELLOW' && tl.timer >= 2) {
          tl.phase = 'EW_GREEN';
          tl.timer = 0;
        } else if (tl.phase === 'EW_YELLOW' && tl.timer >= 2) {
          tl.phase = 'NS_GREEN';
          tl.timer = 0;
        } else if (tl.phase === 'NS_GREEN') {
          const desiredGreen = nsQueue > ewQueue + 2 ? 18 : nsQueue === 0 && ewQueue > 0 ? 6 : 10;
          tl.greenDuration = desiredGreen;
          if (tl.timer >= desiredGreen) {
            tl.phase = 'NS_YELLOW';
            tl.timer = 0;
            tl.reasoning = `NS Queue: ${nsQueue}, EW Queue: ${ewQueue}. Switching to EW phase after ${desiredGreen}s.`;
          } else if (nsQueue > ewQueue + 2) {
            tl.reasoning = `Adaptive extension: NS queue (${nsQueue}) > EW queue (${ewQueue}). Extending NS green to ${desiredGreen}s.`;
          } else {
            tl.reasoning = `Balanced flow (NS: ${nsQueue}, EW: ${ewQueue}). Maintaining NS green.`;
          }
        } else if (tl.phase === 'EW_GREEN') {
          const desiredGreen = ewQueue > nsQueue + 2 ? 18 : ewQueue === 0 && nsQueue > 0 ? 6 : 10;
          tl.greenDuration = desiredGreen;
          if (tl.timer >= desiredGreen) {
            tl.phase = 'EW_YELLOW';
            tl.timer = 0;
            tl.reasoning = `EW Queue: ${ewQueue}, NS Queue: ${nsQueue}. Switching to NS phase after ${desiredGreen}s.`;
          } else if (ewQueue > nsQueue + 2) {
            tl.reasoning = `Adaptive extension: EW queue (${ewQueue}) > NS queue (${nsQueue}). Extending EW green to ${desiredGreen}s.`;
          } else {
            tl.reasoning = `Balanced flow (EW: ${ewQueue}, NS: ${nsQueue}). Maintaining EW green.`;
          }
        }
      }
    } else {
      tl.emergencyOverride = false;
      tl.greenDuration = 12;
      tl.reasoning = 'Conventional fixed-cycle timer (12s green / 2s yellow).';
      if (tl.phase === 'NS_GREEN' && tl.timer >= 12) {
        tl.phase = 'NS_YELLOW';
        tl.timer = 0;
      } else if (tl.phase === 'NS_YELLOW' && tl.timer >= 2) {
        tl.phase = 'EW_GREEN';
        tl.timer = 0;
      } else if (tl.phase === 'EW_GREEN' && tl.timer >= 12) {
        tl.phase = 'EW_YELLOW';
        tl.timer = 0;
      } else if (tl.phase === 'EW_YELLOW' && tl.timer >= 2) {
        tl.phase = 'NS_GREEN';
        tl.timer = 0;
      }
    }
  });

  // 3. AUTONOMOUS VEHICLE AGENTS MOVING ALONG REAL OSM POLYLINE GEOMETRIES
  const weatherMult = getWeatherSpeedMultiplier(prev.weather);
  const survivingVehicles: Vehicle[] = [];

  for (const v of updatedVehicles) {
    v.travelTime += dtSeconds;

    if (!v.nextNode || !v.currentRoadId) {
      v.status = 'arrived';
      continue;
    }

    const road = roadMap.get(v.currentRoadId);
    if (!road || road.closed) {
      const reroute = runAStarSearch(v.currentNode, v.destination, prev.intersections, roads, prev.weather, incidents, prev.aiEnabled);
      if (!reroute.unreachable && reroute.path.length >= 2) {
        v.route = reroute.path;
        v.nextNode = reroute.path[1];
        const edge = findEdgeBetween(roads, v.currentNode, v.nextNode);
        v.currentRoadId = edge ? edge.road.id : null;
        v.progress = 0;
        const startInter = interMap.get(v.currentNode);
        if (startInter) {
          v.lat = startInter.lat;
          v.lng = startInter.lng;
        }
        v.recalculations++;
        totalReroutes++;
        v.lastDecision = `Road closed ahead! A* recalculated OSM street route (${reroute.totalDistance}km).`;
        pushLog('Pathfinding', `Vehicle ${v.id} rerouted around closed street via ${reroute.path.slice(0, 4).join('→')}.`, 'warning');
      } else {
        v.status = 'waiting_light';
        v.waitingTime += dtSeconds;
        totalVehicleWaitTime += dtSeconds;
        survivingVehicles.push(v);
        continue;
      }
    }

    const activeRoad = v.currentRoadId ? roadMap.get(v.currentRoadId) : undefined;
    if (!activeRoad) continue;
    const isReverse = activeRoad.to === v.currentNode && activeRoad.from === v.nextNode;

    // Check traffic light at approaching intersection
    const targetInter = interMap.get(v.nextNode);
    const fromInter = interMap.get(v.currentNode);
    const tl = trafficLights[v.nextNode];
    let blockedByRedLight = false;

    if (tl && targetInter && fromInter && v.progress >= 0.85 && v.type !== 'emergency') {
      const isNS = Math.abs(targetInter.lat - fromInter.lat) >= Math.abs(targetInter.lng - fromInter.lng);
      const canGo = isNS ? tl.phase === 'NS_GREEN' : tl.phase === 'EW_GREEN';
      if (!canGo) blockedByRedLight = true;
    }

    if (blockedByRedLight) {
      v.status = 'waiting_light';
      v.speed = 0;
      v.waitingTime += dtSeconds;
      totalVehicleWaitTime += dtSeconds;
      v.lastDecision = `PERCEIVE->ACT: Waiting at red signal (${v.nextNode}).`;
      survivingVehicles.push(v);
      continue;
    }

    const congestionSlowdown = Math.max(0.25, 1 - activeRoad.density * 0.6);
    const emergencyBoost = v.type === 'emergency' ? 1.25 : 1.0;
    const effectiveSpeed = activeRoad.maxSpeed * weatherMult * congestionSlowdown * emergencyBoost;
    v.speed = Math.round(effectiveSpeed);
    v.status = activeRoad.density > 0.7 ? 'congested' : 'moving';

    // Advance progress along actual Haversine road length
    const kmMoved = (effectiveSpeed / 3600) * dtSeconds * 6.5;
    v.progress += kmMoved / Math.max(0.08, activeRoad.length);

    if (v.progress < 1.0) {
      const [newLat, newLng] = interpolateAlongRoad(activeRoad, v.progress, isReverse);
      v.lat = newLat;
      v.lng = newLng;
      if (v.assignedTeamId) {
        const tm = teams.find(t => t.id === v.assignedTeamId);
        if (tm) {
          tm.lat = newLat;
          tm.lng = newLng;
        }
      }
    } else {
      // Arrived at nextNode
      v.currentNode = v.nextNode;
      v.progress = 0;
      if (targetInter) {
        v.lat = targetInter.lat;
        v.lng = targetInter.lng;
      }

      if (v.assignedTeamId) {
        const tm = teams.find(t => t.id === v.assignedTeamId);
        if (tm && targetInter) {
          tm.currentNode = v.currentNode;
          tm.lat = targetInter.lat;
          tm.lng = targetInter.lng;
        }
      }

      if (v.currentNode === v.destination) {
        v.status = 'arrived';
        if (v.assignedIncidentId) {
          const inc = incidents.find(i => i.id === v.assignedIncidentId);
          if (inc && inc.status === 'Dispatched') {
            inc.status = 'On Scene';
            pushLog('Incidents', `Team ${v.assignedTeamId} arrived at ${inc.id} (${inc.category}).`, 'success');
          }
        } else {
          completedJourneys++;
          totalCompletedTravelTime += v.travelTime / 60;
        }
        continue;
      }

      const routeIdx = v.route.indexOf(v.currentNode);
      let nextStepNode = routeIdx >= 0 && routeIdx + 1 < v.route.length ? v.route[routeIdx + 1] : null;

      if (prev.aiEnabled && nextStepNode) {
        const upcomingEdge = findEdgeBetween(roads, v.currentNode, nextStepNode);
        if (!upcomingEdge || upcomingEdge.road.closed || upcomingEdge.road.density > 0.68) {
          const alt = runAStarSearch(v.currentNode, v.destination, prev.intersections, roads, prev.weather, incidents, true);
          if (!alt.unreachable && alt.path.length >= 2 && alt.path[1] !== nextStepNode) {
            v.route = alt.path;
            nextStepNode = alt.path[1];
            v.recalculations++;
            totalReroutes++;
            v.lastDecision = `ANALYZE->DECIDE: Congestion ahead; A* selected faster street via ${nextStepNode}.`;
            pushLog('Agents', `Vehicle ${v.id} detected street congestion and switched route via ${nextStepNode}.`, 'info');
          }
        }
      }

      if (nextStepNode) {
        const nextEdge = findEdgeBetween(roads, v.currentNode, nextStepNode);
        if (nextEdge) {
          v.nextNode = nextStepNode;
          v.currentRoadId = nextEdge.road.id;
        } else {
          const fallback = runAStarSearch(v.currentNode, v.destination, prev.intersections, roads, prev.weather, incidents, prev.aiEnabled);
          if (!fallback.unreachable && fallback.path.length >= 2) {
            v.route = fallback.path;
            v.nextNode = fallback.path[1];
            const fbEdge = findEdgeBetween(roads, v.currentNode, v.nextNode);
            v.currentRoadId = fbEdge ? fbEdge.road.id : null;
            v.recalculations++;
            totalReroutes++;
          } else {
            v.nextNode = null;
            v.currentRoadId = null;
          }
        }
      }
    }

    survivingVehicles.push(v);
  }

  // 4. UPDATE ON-SCENE INCIDENTS & TEAM RELEASE
  for (const inc of incidents) {
    if (inc.status === 'On Scene') {
      inc.serviceRemaining -= dtSeconds;
      if (inc.serviceRemaining <= 0) {
        inc.status = 'Resolved';
        resolvedIncidentsCount++;
        if (inc.assignedTeamId) {
          const tm = teams.find(t => t.id === inc.assignedTeamId);
          if (tm) {
            tm.available = true;
            tm.assignedIncidentId = null;
            tm.eta = null;
            tm.vehicleId = null;
          }
        }
        pushLog('Incidents', `Incident ${inc.id} (${inc.category}) resolved. Team ${inc.assignedTeamId} available.`, 'success');
      }
    }
  }

  // 5. SPAWN NEW VEHICLES BASED ON TRAFFIC DEMAND
  const hour = Math.floor((nextSimSeconds % 86400) / 3600);
  const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19);
  const rushMultiplier = isRushHour ? 1.25 : 1.0;
  const targetVehicles = Math.min(85, Math.max(10, Math.round(prev.trafficDemand * 0.65 * rushMultiplier)));

  if (survivingVehicles.length < targetVehicles && rng.next() < (prev.trafficDemand / 100) * 0.75) {
    const newId = Math.floor(nextSimSeconds) + survivingVehicles.length;
    const spawned = spawnVehicle(rng, newId, prev.intersections, roads, prev.weather, incidents, prev.aiEnabled);
    if (spawned) survivingVehicles.push(spawned);
  }

  // 6. RECALCULATE DYNAMIC ROAD DENSITY & TRAVEL TIMES
  for (const r of roads) {
    const count = survivingVehicles.filter(v => v.currentRoadId === r.id).length;
    r.vehicleCount = count;
    r.density = Number((count / Math.max(1, r.capacity)).toFixed(2));
    r.travelTime = r.closed ? Infinity : Number(computeRoadCost(r, prev.weather, incidents, true).toFixed(1));
  }

  // 7. RECORD PERIODIC METRICS SNAPSHOT
  const history = [...prev.history];
  if (Math.floor(nextSimSeconds) % 20 === 0) {
    const openRoads = roads.filter(r => !r.closed);
    const avgDensity = openRoads.length > 0 ? openRoads.reduce((s, r) => s + r.density, 0) / openRoads.length : 0;
    const avgTravel = completedJourneys > 0 ? totalCompletedTravelTime / completedJourneys : 4.5 + avgDensity * 6;
    const avgWait = survivingVehicles.length > 0 ? survivingVehicles.reduce((s, v) => s + v.waitingTime, 0) / survivingVehicles.length : 0;

    const availTeams = teams.filter(t => t.available).length;
    const bayes = runBayesianInference({
      rushHour: isRushHour,
      badWeather: prev.weather !== 'Clear',
      highDemand: prev.trafficDemand > 60,
      roadClosures: roads.some(r => r.closed),
      highIncidentSeverity: incidents.some(i => i.status !== 'Resolved' && (i.severity === 'High' || i.severity === 'Critical')),
      lowTeamAvailability: availTeams <= 3,
    });

    history.push({
      timeLabel: formatSimShortTime(nextSimSeconds),
      avgDensity: Number((avgDensity * 100).toFixed(1)),
      avgTravelTime: Number(avgTravel.toFixed(1)),
      avgWaitTime: Number(avgWait.toFixed(1)),
      activeVehicles: survivingVehicles.length,
      congestionProb: Number((bayes.congestionProb * 100).toFixed(1)),
    });
    if (history.length > 30) history.shift();
  }

  return {
    ...prev,
    simSeconds: nextSimSeconds,
    roads,
    trafficLights,
    vehicles: survivingVehicles,
    incidents,
    teams,
    logs: [...newLogs, ...prev.logs].slice(0, 80),
    completedJourneys,
    totalCompletedTravelTime,
    totalVehicleWaitTime,
    totalReroutes,
    resolvedIncidentsCount,
    totalResponseTime,
    assignedIncidentsCount,
    history,
  };
}

// ============================================================================
// 8. DETERMINISTIC BASELINE VS AI COMPARISON RUNNER
// ============================================================================

function runDeterministicComparison(baseState: SimulationState, steps = 85): ComparisonResult {
  const cloneState = (aiMode: boolean): SimulationState => ({
    ...baseState,
    aiEnabled: aiMode,
    status: 'running',
    intersections: baseState.intersections.map(i => ({ ...i })),
    roads: baseState.roads.map(r => ({ ...r })),
    trafficLights: createInitialTrafficLights(baseState.intersections),
    vehicles: baseState.vehicles.map(v => ({ ...v, route: [...v.route] })),
    incidents: baseState.incidents.map(i => ({ ...i })),
    teams: baseState.teams.map(t => ({ ...t })),
    logs: [],
    history: [],
  });

  let convState = cloneState(false);
  let aiState = cloneState(true);

  let convDensitySum = 0;
  let aiDensitySum = 0;

  for (let s = 0; s < steps; s++) {
    convState = stepSimulation(convState, 2);
    aiState = stepSimulation(aiState, 2);

    const cOpen = convState.roads.filter(r => !r.closed);
    const aOpen = aiState.roads.filter(r => !r.closed);
    convDensitySum += cOpen.reduce((acc, r) => acc + r.density, 0) / Math.max(1, cOpen.length);
    aiDensitySum += aOpen.reduce((acc, r) => acc + r.density, 0) / Math.max(1, aOpen.length);
  }

  const extractMetrics = (st: SimulationState, densitySum: number) => {
    const avgTravel =
      st.completedJourneys > 0
        ? st.totalCompletedTravelTime / st.completedJourneys
        : st.vehicles.reduce((s, v) => s + v.travelTime / 60, 0) / Math.max(1, st.vehicles.length);
    const avgWait =
      st.vehicles.length > 0
        ? st.vehicles.reduce((s, v) => s + v.waitingTime, 0) / st.vehicles.length
        : st.totalVehicleWaitTime / Math.max(1, st.completedJourneys);
    const avgResp = st.assignedIncidentsCount > 0 ? st.totalResponseTime / st.assignedIncidentsCount : 0;

    return {
      avgTravelTime: Number(avgTravel.toFixed(2)),
      avgWaitTime: Number(avgWait.toFixed(1)),
      totalDelay: Number((st.totalVehicleWaitTime / 60).toFixed(1)),
      completedJourneys: st.completedJourneys,
      avgCongestion: Number(((densitySum / steps) * 100).toFixed(1)),
      avgResponseTime: Number(avgResp.toFixed(2)),
      assignedIncidents: st.assignedIncidentsCount,
      reroutes: st.totalReroutes,
    };
  };

  return {
    scenarioName: baseState.scenarioName,
    seed: baseState.seed,
    durationMinutes: Math.round((steps * 2) / 60),
    conventional: extractMetrics(convState, convDensitySum),
    ai: extractMetrics(aiState, aiDensitySum),
  };
}

// ============================================================================
// 9. AUTOMATED VERIFICATION SUITE (4 AI SYSTEMS ON REAL GRAPH)
// ============================================================================

function executeAllAITests(intersections: Intersection[], roads: RoadSegment[]): TestCaseResult[] {
  const results: TestCaseResult[] = [];
  const base = createInitialSimulationState(intersections, roads, 'Test Suite', 2040);

  if (intersections.length < 5 || roads.length < 5) {
    return [
      {
        id: 'SYS-00',
        system: 'A* Search',
        name: 'OSM Graph Availability Check',
        description: 'Requires loaded Astana OpenStreetMap graph.',
        expected: 'Graph contains real intersections and roads.',
        actual: 'Graph still loading or unavailable.',
        passed: false,
      },
    ];
  }

  // Pick a real road segment and its endpoints
  const sampleRoad = roads.find(r => r.length > 0.2) || roads[0];
  const fromNode = intersections.find(i => i.id === sampleRoad.from)!;
  const toNode = intersections.find(i => i.id === sampleRoad.to)!;

  // --- AGENT TESTS ---
  const t1State = createInitialSimulationState(intersections, roads, 'Agent Test 1', 2040);
  const isNS = Math.abs(toNode.lat - fromNode.lat) >= Math.abs(toNode.lng - fromNode.lng);
  t1State.trafficLights[toNode.id] = {
    intersectionId: toNode.id,
    phase: isNS ? 'EW_GREEN' : 'NS_GREEN', // Red for approaching direction
    timer: 1,
    greenDuration: 12,
    nsQueue: 0,
    ewQueue: 0,
    emergencyOverride: false,
    reasoning: 'Test red signal',
  };
  t1State.vehicles = [
    {
      id: 'V-TEST-1',
      type: 'car',
      currentNode: fromNode.id,
      nextNode: toNode.id,
      currentRoadId: sampleRoad.id,
      progress: 0.9,
      lat: fromNode.lat,
      lng: fromNode.lng,
      destination: toNode.id,
      route: [fromNode.id, toNode.id],
      speed: 50,
      status: 'moving',
      waitingTime: 0,
      travelTime: 0,
      recalculations: 0,
      lastDecision: '',
    },
  ];
  const afterT1 = stepSimulation(t1State, 2);
  const vAfter1 = afterT1.vehicles.find(v => v.id === 'V-TEST-1');
  results.push({
    id: 'AGT-01',
    system: 'Intelligent Agents',
    name: 'Red Light Compliance Test (Real OSM Intersection)',
    description: `Vehicle V-TEST-1 approaches ${toNode.id} (${toNode.lat.toFixed(4)}, ${toNode.lng.toFixed(4)}) on Red signal.`,
    expected: 'Vehicle status becomes waiting_light and waitingTime increases.',
    actual: vAfter1 ? `Status: ${vAfter1.status}, WaitTime: ${vAfter1.waitingTime}s` : 'Vehicle missing',
    passed: Boolean(vAfter1 && vAfter1.status === 'waiting_light' && vAfter1.waitingTime > 0),
  });

  // Test 2: Adaptive Traffic Light extends green
  const t2State = createInitialSimulationState(intersections, roads, 'Agent Test 2', 2040);
  t2State.trafficLights[toNode.id] = {
    intersectionId: toNode.id,
    phase: isNS ? 'NS_GREEN' : 'EW_GREEN',
    timer: 2,
    greenDuration: 10,
    nsQueue: 0,
    ewQueue: 0,
    emergencyOverride: false,
    reasoning: '',
  };
  t2State.vehicles = [1, 2, 3, 4].map(n => ({
    id: `V-Q-${n}`,
    type: 'car',
    currentNode: fromNode.id,
    nextNode: toNode.id,
    currentRoadId: sampleRoad.id,
    progress: 0.8,
    lat: fromNode.lat,
    lng: fromNode.lng,
    destination: toNode.id,
    route: [fromNode.id, toNode.id],
    speed: 30,
    status: 'moving',
    waitingTime: 0,
    travelTime: 0,
    recalculations: 0,
    lastDecision: '',
  }));
  const afterT2 = stepSimulation(t2State, 2);
  const tl2 = afterT2.trafficLights[toNode.id];
  results.push({
    id: 'AGT-02',
    system: 'Intelligent Agents',
    name: 'Adaptive Queue Green Extension',
    description: `4 vehicles queue on ${sampleRoad.name} approaching ${toNode.id}.`,
    expected: 'Traffic Light extends green duration to 18s.',
    actual: `NS Queue: ${tl2.nsQueue}, EW Queue: ${tl2.ewQueue}, GreenDuration: ${tl2.greenDuration}s`,
    passed: tl2.greenDuration === 18,
  });

  // Test 3: Emergency vehicle triggers preemption
  const t3State = createInitialSimulationState(intersections, roads, 'Agent Test 3', 2040);
  t3State.trafficLights[toNode.id] = {
    intersectionId: toNode.id,
    phase: isNS ? 'EW_GREEN' : 'NS_GREEN',
    timer: 2,
    greenDuration: 12,
    nsQueue: 0,
    ewQueue: 0,
    emergencyOverride: false,
    reasoning: '',
  };
  t3State.vehicles = [
    {
      id: 'AMB-TEST',
      type: 'emergency',
      currentNode: fromNode.id,
      nextNode: toNode.id,
      currentRoadId: sampleRoad.id,
      progress: 0.75,
      lat: fromNode.lat,
      lng: fromNode.lng,
      destination: toNode.id,
      route: [fromNode.id, toNode.id],
      speed: 70,
      status: 'moving',
      waitingTime: 0,
      travelTime: 0,
      recalculations: 0,
      lastDecision: '',
    },
  ];
  const afterT3 = stepSimulation(t3State, 2);
  const tl3 = afterT3.trafficLights[toNode.id];
  results.push({
    id: 'AGT-03',
    system: 'Intelligent Agents',
    name: 'Emergency Vehicle Signal Preemption',
    description: `Emergency ambulance approaches ${toNode.id} against conflicting green phase.`,
    expected: 'Emergency override activates and triggers safe yellow transition.',
    actual: `EmergencyOverride: ${tl3.emergencyOverride}, Phase: ${tl3.phase}`,
    passed: tl3.emergencyOverride === true && tl3.phase.includes('YELLOW'),
  });

  // --- A* SEARCH TESTS ---
  const nBaiterek = findNearestIntersection(intersections, 51.1283, 71.4306) || intersections[0];
  const nKhanShatyr = findNearestIntersection(intersections, 51.1325, 71.4037) || intersections[intersections.length - 1];
  const initialRoute = runAStarSearch(nBaiterek.id, nKhanShatyr.id, intersections, roads, 'Clear', [], true);

  // Test 4: Close a road on the initial route -> A* finds detour or handles gracefully
  const closedEdgeRoad =
    initialRoute.path.length >= 2
      ? roads.find(
          r =>
            (r.from === initialRoute.path[0] && r.to === initialRoute.path[1]) ||
            (r.to === initialRoute.path[0] && r.from === initialRoute.path[1])
        )
      : sampleRoad;
  const roadsClosed = roads.map(r => (r.id === closedEdgeRoad?.id ? { ...r, closed: true } : { ...r }));
  const astar1 = runAStarSearch(nBaiterek.id, nKhanShatyr.id, intersections, roadsClosed, 'Clear', [], true);
  results.push({
    id: 'AST-01',
    system: 'A* Search',
    name: 'Closed Real Street Detour Pathfinding',
    description: `Closed ${closedEdgeRoad?.name} (${closedEdgeRoad?.id}) between Baiterek and Khan Shatyr.`,
    expected: 'A* avoids closed segment and computes valid street polyline.',
    actual: astar1.unreachable
      ? 'No detour exists on subgraph'
      : `Detour: ${astar1.path.length} nodes, ${astar1.totalDistance} km, ${astar1.polyline.length} GPS pts`,
    passed: !astar1.unreachable && astar1.polyline.length >= 2,
  });

  // Test 5: Dynamic congestion penalty
  const roadsCongested = roads.map(r => (r.id === closedEdgeRoad?.id ? { ...r, density: 1.45 } : { ...r }));
  const astar2 = runAStarSearch(nBaiterek.id, nKhanShatyr.id, intersections, roadsCongested, 'Clear', [], true);
  results.push({
    id: 'AST-02',
    system: 'A* Search',
    name: 'Congestion-Aware Dynamic Travel-Time Cost',
    description: `Simulated 145% congestion on ${closedEdgeRoad?.name}.`,
    expected: 'A* evaluates dynamic travel-time cost and computes valid route.',
    actual: `EstTime: ${astar2.totalTime}m, Distance: ${astar2.totalDistance}km`,
    passed: !astar2.unreachable && astar2.totalTime > 0,
  });

  // Test 6: Unreachable destination
  const isolatedRoads = roads.map(r => (r.from === nKhanShatyr.id || r.to === nKhanShatyr.id ? { ...r, closed: true } : { ...r }));
  const astar3 = runAStarSearch(nBaiterek.id, nKhanShatyr.id, intersections, isolatedRoads, 'Clear', [], true);
  results.push({
    id: 'AST-03',
    system: 'A* Search',
    name: 'Unreachable Destination Safety Check',
    description: `All streets connected to ${nKhanShatyr.id} closed.`,
    expected: 'A* returns unreachable=true cleanly without crashing.',
    actual: `Unreachable: ${astar3.unreachable}, Explored: ${astar3.exploredNodes.length} nodes`,
    passed: astar3.unreachable === true && astar3.path.length === 0,
  });

  // --- CSP SOLVER TESTS ---
  const incMed: Incident = {
    id: 'INC-T1',
    category: 'Medical emergency',
    severity: 'High',
    intersectionId: nBaiterek.id,
    lat: nBaiterek.lat,
    lng: nBaiterek.lng,
    createdAt: 480,
    status: 'Pending',
    assignedTeamId: null,
    estimatedResponseTime: null,
    serviceRemaining: 20,
  };
  const csp1 = solveCSPDispatch([incMed], base.teams, intersections, roads, 'Clear', true);
  results.push({
    id: 'CSP-01',
    system: 'CSP Solver',
    name: 'Skill-Matched Emergency Assignment',
    description: `Medical emergency reported at Baiterek (${nBaiterek.lat.toFixed(4)}, ${nBaiterek.lng.toFixed(4)}).`,
    expected: 'CSP solver assigns an eligible Ambulance team (AMB-01 or AMB-02).',
    actual: `Assigned: ${csp1.assignments[0]?.teamId || 'None'} (ETA: ${csp1.assignments[0]?.travelTime}m)`,
    passed: csp1.assignments.length === 1 && csp1.assignments[0].teamId.startsWith('AMB'),
  });

  const incP1: Incident = { ...incMed, id: 'INC-P1', category: 'Power outage', intersectionId: nBaiterek.id, severity: 'Critical' };
  const incP2: Incident = { ...incMed, id: 'INC-P2', category: 'Power outage', intersectionId: nKhanShatyr.id, severity: 'Low' };
  const csp2 = solveCSPDispatch([incP1, incP2], base.teams, intersections, roads, 'Clear', true);
  results.push({
    id: 'CSP-02',
    system: 'CSP Solver',
    name: 'No Double-Assignment Hard Constraint',
    description: 'Two simultaneous Power Outages compete for single Electrical team ELEC-01.',
    expected: 'Critical incident INC-P1 receives ELEC-01; INC-P2 remains unassigned.',
    actual: `Assigned: ${csp2.assignments[0]?.incidentId}->${csp2.assignments[0]?.teamId}; Unassigned: ${csp2.unassigned[0]?.incidentId}`,
    passed:
      csp2.assignments.length === 1 &&
      csp2.assignments[0].incidentId === 'INC-P1' &&
      csp2.unassigned.length === 1 &&
      csp2.unassigned[0].incidentId === 'INC-P2',
  });

  const busyTeams = base.teams.map(t => (t.id === 'ELEC-01' ? { ...t, available: false } : { ...t }));
  const csp3 = solveCSPDispatch([incP1], busyTeams, intersections, roads, 'Clear', true);
  results.push({
    id: 'CSP-03',
    system: 'CSP Solver',
    name: 'Infeasible Domain Explanation',
    description: 'Power outage occurs while ELEC-01 is unavailable.',
    expected: 'Solver leaves incident pending and returns clear explanation.',
    actual: `Unassigned reason: "${csp3.unassigned[0]?.reason}"`,
    passed: csp3.assignments.length === 0 && csp3.unassigned.length === 1 && csp3.unassigned[0].reason.length > 10,
  });

  // --- BAYESIAN NETWORK TESTS ---
  const bBase = runBayesianInference({
    rushHour: false,
    badWeather: false,
    highDemand: false,
    roadClosures: false,
    highIncidentSeverity: false,
    lowTeamAvailability: false,
  });
  const bHighDemand = runBayesianInference({
    rushHour: false,
    badWeather: false,
    highDemand: true,
    roadClosures: false,
    highIncidentSeverity: false,
    lowTeamAvailability: false,
  });
  results.push({
    id: 'BAY-01',
    system: 'Bayesian Network',
    name: 'Traffic Demand Monotonicity',
    description: 'Evidence High Traffic Demand changes from False to True.',
    expected: 'Posterior P(Traffic Congestion) strictly increases.',
    actual: `Base P(C): ${(bBase.congestionProb * 100).toFixed(1)}% -> HighDemand P(C): ${(bHighDemand.congestionProb * 100).toFixed(1)}%`,
    passed: bHighDemand.congestionProb > bBase.congestionProb,
  });

  const bBadWeather = runBayesianInference({
    rushHour: false,
    badWeather: true,
    highDemand: false,
    roadClosures: false,
    highIncidentSeverity: false,
    lowTeamAvailability: false,
  });
  results.push({
    id: 'BAY-02',
    system: 'Bayesian Network',
    name: 'Weather Evidence Sensitivity',
    description: 'Weather changes from Clear to Heavy Snowstorm (BadWeather=True).',
    expected: 'Posterior congestion and response delay probabilities increase.',
    actual: `Clear P(C): ${(bBase.congestionProb * 100).toFixed(1)}% -> Snow P(C): ${(bBadWeather.congestionProb * 100).toFixed(1)}%`,
    passed: bBadWeather.congestionProb > bBase.congestionProb && bBadWeather.delayProb > bBase.delayProb,
  });

  const bLowTeams = runBayesianInference({
    rushHour: false,
    badWeather: false,
    highDemand: false,
    roadClosures: false,
    highIncidentSeverity: true,
    lowTeamAvailability: true,
  });
  results.push({
    id: 'BAY-03',
    system: 'Bayesian Network',
    name: 'Emergency Delay CPT Propagation',
    description: 'Team availability drops (LowTeamAvailability=True) with High Severity incident.',
    expected: 'Posterior P(Emergency Response Delay) increases significantly.',
    actual: `Base P(Delay): ${(bBase.delayProb * 100).toFixed(1)}% -> LowTeams P(Delay): ${(bLowTeams.delayProb * 100).toFixed(1)}%`,
    passed: bLowTeams.delayProb > bBase.delayProb && bLowTeams.delayProb > 0.65,
  });

  return results;
}

// ============================================================================
// 10. TRANSLATIONS (EN / KZ)
// ============================================================================

const UI_TEXT = {
  EN: {
    subtitle: 'The Future of Intelligent Urban Management',
    nav: {
      overview: 'Overview',
      live: 'Live City Simulation',
      aiCenter: 'AI Intelligence Center',
      incidents: 'Incidents & Emergencies',
      teams: 'Municipal Teams',
      analytics: 'Analytics & Reports',
      experiments: 'Experiments Lab',
      about: 'About the Project',
    },
    startSim: 'START CITY SIMULATION',
    pauseSim: 'PAUSE SIMULATION',
    exploreAI: 'EXPLORE AI SYSTEMS',
    runDemo: 'RUN DEMO SCENARIO',
    statusActive: 'AI CITY BRAIN: ONLINE',
    running: 'RUNNING',
    paused: 'PAUSED',
  },
  KZ: {
    subtitle: 'Интеллектуалды қаланы басқарудың болашағы',
    nav: {
      overview: 'Шолу тақтасы',
      live: 'Тікелей қала симуляциясы',
      aiCenter: 'ЖИ Интеллект Орталығы',
      incidents: 'Оқиғалар мен ТЖ',
      teams: 'Қалалық қызмет топтары',
      analytics: 'Аналитика және Есептер',
      experiments: 'Эксперименттер Зертханасы',
      about: 'Жоба туралы (ЖИ негіздері)',
    },
    startSim: 'СИМУЛЯЦИЯНЫ БАСТАУ',
    pauseSim: 'ТОҚТАТА ТҰРУ',
    exploreAI: 'ЖИ ЖҮЙЕЛЕРІН ЗЕРТТЕУ',
    runDemo: 'ДЕМО СЦЕНАРИЙДІ ІСКЕ ҚОСУ',
    statusActive: 'AI CITY BRAIN: БЕЛСЕНДІ',
    running: 'ЖҰМЫС ІСТЕУДЕ',
    paused: 'КІДІРТІЛГЕН',
  },
};

// ============================================================================
// 11. REAL ASTANA OPENSTREETMAP COMPONENT (LEAFLET + OSM OVERPASS GRAPH)
// ============================================================================

interface RealAstanaMapProps {
  sim: SimulationState;
  osmStatus: 'loading' | 'ready' | 'error';
  osmError: string | null;
  onRetryOsm: () => void;
  selectedIntersection: string | null;
  selectedRoad: string | null;
  routeStart: string;
  routeEnd: string;
  astarHighlight: AStarResult | null;
  bayesianResult: BayesianResult;
  onSelectIntersection: (id: string) => void;
  onSelectRoad: (id: string) => void;
  onMapClickCreateIncident: (lat: number, lng: number, nearestNodeId: string) => void;
}

const RealAstanaMap: React.FC<RealAstanaMapProps> = ({
  sim,
  osmStatus,
  osmError,
  onRetryOsm,
  selectedIntersection,
  selectedRoad,
  routeStart,
  routeEnd,
  astarHighlight,
  bayesianResult,
  onSelectIntersection,
  onSelectRoad,
  onMapClickCreateIncident,
}) => {
  const { loaded: leafletReady, error: leafletError } = useLeafletLoader();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  const layersRef = useRef<{
    traffic: any;
    vehicles: any;
    trafficLights: any;
    incidents: any;
    teams: any;
    astarRoute: any;
    bayesianHeatmap: any;
    landmarks: any;
  } | null>(null);

  const [layerVis, setLayerVis] = useState<MapLayerVisibility>({
    traffic: true,
    vehicles: true,
    trafficLights: true,
    incidents: true,
    teams: true,
    astarRoute: true,
    bayesianHeatmap: true,
    landmarks: true,
  });

  const [clickedCoord, setClickedCoord] = useState<{ lat: number; lng: number; nearestId: string } | null>(null);
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  // Keep latest callbacks in refs so Leaflet event bindings stay fresh without re-initializing map
  const callbacksRef = useRef({
    onSelectIntersection,
    onSelectRoad,
    intersections: sim.intersections,
  });
  callbacksRef.current = {
    onSelectIntersection,
    onSelectRoad,
    intersections: sim.intersections,
  };

  // Initialize Leaflet Map at Astana (51.1283, 71.4306)
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapInstanceRef.current) return;
    const L = window.L;

    const map = L.map(mapContainerRef.current, {
      center: ASTANA_CENTER,
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 10,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | ASTANA 2040 AI CITY BRAIN',
      className: 'astana-map-tiles',
    }).addTo(map);

    const layers = {
      bayesianHeatmap: L.layerGroup().addTo(map),
      traffic: L.layerGroup().addTo(map),
      astarRoute: L.layerGroup().addTo(map),
      trafficLights: L.layerGroup().addTo(map),
      landmarks: L.layerGroup().addTo(map),
      teams: L.layerGroup().addTo(map),
      incidents: L.layerGroup().addTo(map),
      vehicles: L.layerGroup().addTo(map),
    };

    layersRef.current = layers;
    mapInstanceRef.current = map;

    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      const nearest = findNearestIntersection(callbacksRef.current.intersections, lat, lng);
      if (nearest) {
        setClickedCoord({ lat, lng, nearestId: nearest.id });
        callbacksRef.current.onSelectIntersection(nearest.id);
      } else {
        setClickedCoord({ lat, lng, nearestId: '' });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      layersRef.current = null;
    };
  }, [leafletReady]);

  // Toggle Layer Groups visibility
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    (Object.keys(layerVis) as (keyof MapLayerVisibility)[]).forEach(key => {
      const grp = layers[key];
      if (!grp) return;
      if (layerVis[key]) {
        if (!map.hasLayer(grp)) map.addLayer(grp);
      } else {
        if (map.hasLayer(grp)) map.removeLayer(grp);
      }
    });
  }, [layerVis]);

  // Render Landmarks Layer (Static real coordinates)
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const grp = layersRef.current.landmarks;
    grp.clearLayers();

    ASTANA_LANDMARKS.forEach(lm => {
      const icon = L.divIcon({
        className: 'astana-landmark-icon',
        html: `<div style="display:flex;align-items:center;gap:4px;background:rgba(15,23,42,0.92);border:1px solid rgba(56,189,248,0.65);color:#7dd3fc;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.6);">
          <span>★</span><span>${lm.name}</span>
        </div>`,
        iconSize: [140, 22],
        iconAnchor: [12, 11],
      });

      const marker = L.marker([lm.lat, lm.lng], { icon });
      marker.bindPopup(`
        <div style="min-width:200px;font-size:12px;">
          <div style="font-weight:700;color:#38bdf8;font-size:13px;">${lm.name}</div>
          <div style="color:#94a3b8;font-size:11px;margin-bottom:4px;">${lm.kzName} • ${lm.district}</div>
          <div style="color:#e2e8f0;font-size:11px;line-height:1.4;">${lm.description}</div>
          <div style="margin-top:6px;font-family:monospace;font-size:10px;color:#34d399;">
            GPS: ${lm.lat.toFixed(4)}° N, ${lm.lng.toFixed(4)}° E
          </div>
        </div>
      `);
      grp.addLayer(marker);
    });
  }, [leafletReady]);

  // Render Real OSM Road Network Layer (Traffic Density + Closures)
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const grp = layersRef.current.traffic;
    grp.clearLayers();

    const getRoadColor = (road: RoadSegment) => {
      if (road.closed) return '#64748b'; // Gray
      if (road.density < 0.3) return '#10b981'; // Green
      if (road.density < 0.55) return '#eab308'; // Yellow
      if (road.density < 0.8) return '#f97316'; // Orange
      return '#ef4444'; // Red
    };

    sim.roads.forEach(road => {
      const isSelected = selectedRoad === road.id;
      const color = getRoadColor(road);
      const weight =
        road.roadType === 'motorway' || road.roadType === 'trunk'
          ? 5.5
          : road.roadType === 'primary' || road.roadType === 'bridge'
          ? 4.5
          : 3.2;

      const poly = L.polyline(road.geometry, {
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? weight + 3 : weight,
        opacity: road.closed ? 0.75 : 0.85,
        dashArray: road.closed ? '8, 8' : undefined,
      });

      poly.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e);
        callbacksRef.current.onSelectRoad(road.id);
      });

      poly.bindTooltip(
        `<div style="font-size:11px;">
          <strong>${road.name}</strong> (${road.id})<br/>
          Status: ${road.closed ? '<span style="color:#f87171">CLOSED</span>' : `${Math.round(road.density * 100)}% density`}<br/>
          Length: ${road.length} km | Est: ${road.closed ? '∞' : road.travelTime + 'm'}
        </div>`,
        { sticky: true }
      );

      grp.addLayer(poly);
    });
  }, [leafletReady, sim.roads, selectedRoad]);

  // Render A* Calculated Route Polyline Overlay (Cyan)
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const grp = layersRef.current.astarRoute;
    grp.clearLayers();

    if (astarHighlight && !astarHighlight.unreachable && astarHighlight.polyline.length >= 2) {
      // Outer cyan glow
      L.polyline(astarHighlight.polyline, {
        color: '#06b6d4',
        weight: 10,
        opacity: 0.32,
      }).addTo(grp);

      // Core bright cyan street path
      L.polyline(astarHighlight.polyline, {
        color: '#22d3ee',
        weight: 4.5,
        opacity: 0.98,
      }).addTo(grp);
    }

    const startInter = sim.intersections.find(i => i.id === routeStart);
    const endInter = sim.intersections.find(i => i.id === routeEnd);

    if (startInter) {
      L.circleMarker([startInter.lat, startInter.lng], {
        radius: 7,
        color: '#10b981',
        fillColor: '#022c22',
        fillOpacity: 1,
        weight: 2.5,
      })
        .bindTooltip(`A* Start: ${startInter.name}`)
        .addTo(grp);
    }
    if (endInter) {
      L.circleMarker([endInter.lat, endInter.lng], {
        radius: 7,
        color: '#f43f5e',
        fillColor: '#4c0519',
        fillOpacity: 1,
        weight: 2.5,
      })
        .bindTooltip(`A* Goal: ${endInter.name}`)
        .addTo(grp);
    }
  }, [leafletReady, astarHighlight, routeStart, routeEnd, sim.intersections]);

  // Render Intelligent Traffic Lights Overlay
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const grp = layersRef.current.trafficLights;
    grp.clearLayers();

    const interMap = new Map<string, Intersection>();
    sim.intersections.forEach(i => interMap.set(i.id, i));

    Object.values(sim.trafficLights).forEach(tl => {
      const inter = interMap.get(tl.intersectionId);
      if (!inter) return;

      const color = tl.phase.includes('YELLOW')
        ? '#facc15'
        : tl.phase === 'NS_GREEN'
        ? '#22c55e'
        : '#38bdf8';

      const marker = L.circleMarker([inter.lat, inter.lng], {
        radius: tl.emergencyOverride ? 6 : 4,
        color: tl.emergencyOverride ? '#ef4444' : '#020617',
        fillColor: color,
        fillOpacity: 0.95,
        weight: tl.emergencyOverride ? 2 : 1,
      });

      marker.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e);
        callbacksRef.current.onSelectIntersection(inter.id);
      });

      marker.bindTooltip(
        `<div style="font-size:11px;">
          <strong>TL-${inter.id}</strong> (${tl.phase})<br/>
          NS Queue: ${tl.nsQueue} | EW Queue: ${tl.ewQueue}<br/>
          <em>${tl.reasoning}</em>
        </div>`
      );

      grp.addLayer(marker);
    });
  }, [leafletReady, sim.trafficLights, sim.intersections]);

  // Render Bayesian Congestion Risk Heatmap Zones (Purple)
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const grp = layersRef.current.bayesianHeatmap;
    grp.clearLayers();

    const prob = bayesianResult.congestionProb;
    const zones = [
      { name: 'Nurzhol / Baiterek Core', lat: 51.1283, lng: 71.4306, mult: 1.15 },
      { name: 'Kenesary & Saryarka Bridges', lat: 51.1510, lng: 71.4250, mult: 1.2 },
      { name: 'Respublika & Abai Corridor', lat: 51.1645, lng: 71.4295, mult: 1.05 },
      { name: 'EXPO / Mangilik El South', lat: 51.0915, lng: 71.4165, mult: 0.95 },
      { name: 'Turan & Saraishyq Junction', lat: 51.1360, lng: 71.4040, mult: 1.1 },
    ];

    zones.forEach(z => {
      const localRisk = Math.min(0.98, prob * z.mult);
      L.circle([z.lat, z.lng], {
        radius: 650 + localRisk * 550,
        color: '#a855f7',
        weight: 1,
        opacity: 0.35,
        fillColor: '#9333ea',
        fillOpacity: 0.08 + localRisk * 0.22,
      })
        .bindTooltip(`Bayesian Risk Zone (${z.name}): ${Math.round(localRisk * 100)}% Congestion Probability`)
        .addTo(grp);
    });
  }, [leafletReady, bayesianResult.congestionProb]);

  // Render Moving Vehicles Along Actual Street Geometries
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const grp = layersRef.current.vehicles;
    grp.clearLayers();

    const getVehicleColor = (type: VehicleType) => {
      switch (type) {
        case 'car': return '#38bdf8';
        case 'taxi': return '#facc15';
        case 'bus': return '#c084fc';
        case 'delivery': return '#fb923c';
        case 'emergency': return '#ef4444';
        case 'municipal': return '#2dd4bf';
      }
    };

    sim.vehicles.forEach(v => {
      const isEmergency = v.type === 'emergency' || v.type === 'municipal';
      const marker = L.circleMarker([v.lat, v.lng], {
        radius: isEmergency ? 6 : v.type === 'bus' ? 5 : 4,
        color: isEmergency ? '#ffffff' : '#020617',
        fillColor: getVehicleColor(v.type),
        fillOpacity: 1,
        weight: isEmergency ? 1.5 : 1,
      });

      marker.bindTooltip(
        `<div style="font-size:11px;">
          <strong>${v.id}</strong> [${v.type.toUpperCase()}]<br/>
          Speed: ${v.speed} km/h | Dest: ${v.destination}<br/>
          Reroutes: ${v.recalculations}<br/>
          <span style="color:#7dd3fc">${v.lastDecision}</span>
        </div>`
      );

      grp.addLayer(marker);
    });
  }, [leafletReady, sim.vehicles]);

  // Render Incidents & Municipal Teams
  useEffect(() => {
    if (!leafletReady || !layersRef.current) return;
    const L = window.L;
    const incGrp = layersRef.current.incidents;
    const teamGrp = layersRef.current.teams;
    incGrp.clearLayers();
    teamGrp.clearLayers();

    sim.incidents
      .filter(i => i.status !== 'Resolved' && i.status !== 'Cancelled')
      .forEach(inc => {
        const icon = L.divIcon({
          className: 'astana-incident-icon',
          html: `<div style="width:24px;height:24px;border-radius:9999px;background:#dc2626;border:2px solid #ffffff;color:#ffffff;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(239,68,68,0.9);">!</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([inc.lat, inc.lng], { icon })
          .bindPopup(
            `<div style="font-size:12px;">
              <strong style="color:#f87171;">${inc.id}: ${inc.category}</strong><br/>
              Severity: <strong>${inc.severity}</strong> | Status: ${inc.status}<br/>
              Team: ${inc.assignedTeamId || 'Pending CSP'} ${inc.estimatedResponseTime ? `(ETA ${inc.estimatedResponseTime}m)` : ''}<br/>
              GPS: ${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}
            </div>`
          )
          .addTo(incGrp);
      });

    sim.teams.forEach(team => {
      const icon = L.divIcon({
        className: 'astana-team-icon',
        html: `<div style="background:${team.available ? '#0d9488' : '#d97706'};border:1px solid #ffffff;color:#ffffff;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;">${team.id}</div>`,
        iconSize: [48, 16],
        iconAnchor: [24, 8],
      });
      L.marker([team.lat, team.lng], { icon })
        .bindTooltip(`${team.id} — ${team.name} (${team.available ? 'Available' : 'Dispatched'})`)
        .addTo(teamGrp);
    });
  }, [leafletReady, sim.incidents, sim.teams]);

  return (
    <div className="relative w-full h-full min-h-[520px] bg-[#040812] rounded-xl border border-cyan-500/25 overflow-hidden shadow-2xl">
      {/* Top Status & Layer Controls Bar */}
      <div className="absolute top-3 left-12 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-lg text-xs shadow-lg">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-bold text-cyan-300 tracking-wide">ASTANA REAL OSM MAP</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300 font-mono">{sim.intersections.length} Nodes / {sim.roads.length} Roads</span>
        </div>

        <div className="pointer-events-auto relative">
          <button
            onClick={() => setShowLayerMenu(s => !s)}
            className="flex items-center gap-1.5 bg-slate-950/90 hover:bg-slate-900 backdrop-blur-md border border-cyan-500/35 text-cyan-300 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg transition"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Map Overlays (8)</span>
          </button>

          {showLayerMenu && (
            <div className="absolute right-0 mt-1.5 w-60 bg-slate-950/95 backdrop-blur-xl border border-slate-700 rounded-xl p-2.5 shadow-2xl space-y-1 text-xs z-[1001]">
              {(
                [
                  ['traffic', 'Traffic Density Roads'],
                  ['vehicles', 'Moving Vehicles'],
                  ['trafficLights', 'Intelligent Traffic Lights'],
                  ['incidents', 'Incidents & Emergencies'],
                  ['teams', 'Municipal Response Teams'],
                  ['astarRoute', 'A* Calculated Route (Cyan)'],
                  ['bayesianHeatmap', 'Bayesian Risk Heatmap (Purple)'],
                  ['landmarks', 'Astana Real Landmarks'],
                ] as [keyof MapLayerVisibility, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-slate-200"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={layerVis[key]}
                    onChange={() => setLayerVis(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="accent-cyan-400"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overpass Loading / Error Banner */}
      {osmStatus === 'loading' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-slate-950/95 border border-cyan-500/40 text-cyan-200 px-4 py-2 rounded-xl text-xs shadow-xl">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Fetching real Astana road geometry from OpenStreetMap Overpass API...</span>
        </div>
      )}

      {osmStatus === 'error' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 bg-red-950/95 border border-red-500/50 text-red-200 px-4 py-2.5 rounded-xl text-xs shadow-xl max-w-md">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">Simulation Road Data Unavailable</div>
            <div className="text-[11px] text-red-300">{osmError || 'Could not reach Overpass API.'}</div>
          </div>
          <button
            onClick={onRetryOsm}
            className="px-2.5 py-1 rounded bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 font-semibold text-white shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Clicked Location Quick Incident Action Bar */}
      {clickedCoord && clickedCoord.nearestId && (
        <div className="absolute bottom-11 left-3 z-[1000] flex items-center gap-2 bg-slate-950/95 border border-cyan-500/40 px-3 py-2 rounded-xl text-xs shadow-xl">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-mono text-slate-200">
            {clickedCoord.lat.toFixed(4)}°N, {clickedCoord.lng.toFixed(4)}°E ({clickedCoord.nearestId})
          </span>
          <button
            onClick={() => {
              onMapClickCreateIncident(clickedCoord.lat, clickedCoord.lng, clickedCoord.nearestId);
              setClickedCoord(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition"
          >
            + Create Incident Here
          </button>
          <button onClick={() => setClickedCoord(null)} className="text-slate-400 hover:text-white p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Leaflet Map Mount Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[520px] z-10" />

      {leafletError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-red-400 text-xs p-4">
          {leafletError}
        </div>
      )}

      {/* Bottom Legend */}
      <div className="absolute bottom-2 left-3 right-3 z-[999] flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-3 py-1 rounded-lg text-[10px] text-slate-300 pointer-events-none">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-semibold text-slate-400">OSM Roads:</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-emerald-500 inline-block" /> Free</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-yellow-500 inline-block" /> Moderate</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-orange-500 inline-block" /> Heavy</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-red-500 inline-block" /> Critical</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-slate-500 inline-block" /> Closed</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded bg-cyan-400 inline-block" /> A* Route</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> Car</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Taxi</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Bus</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Emergency</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> Municipal</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 12. MAIN APPLICATION COMPONENT
// ============================================================================

type NavSection =
  | 'overview'
  | 'live'
  | 'aiCenter'
  | 'incidents'
  | 'teams'
  | 'analytics'
  | 'experiments'
  | 'about';

export default function App() {
  const [lang, setLang] = useState<Language>('EN');
  const [activeNav, setActiveNav] = useState<NavSection>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Real Astana OpenStreetMap Overpass Graph State
  const [osmStatus, setOsmStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [osmError, setOsmError] = useState<string | null>(null);
  const [osmGraphCache, setOsmGraphCache] = useState<{ intersections: Intersection[]; roads: RoadSegment[] }>({
    intersections: [],
    roads: [],
  });

  const [sim, setSim] = useState<SimulationState>(() => {
    const initial = createInitialSimulationState([], [], 'Scenario 01 — Normal Morning', 2040);
    try {
      const saved = localStorage.getItem('astana2040_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.trafficDemand === 'number') initial.trafficDemand = parsed.trafficDemand;
        if (parsed.weather) initial.weather = parsed.weather;
      }
    } catch {
      // Ignore storage errors
    }
    return initial;
  });

  // Map & Planner Interactive States
  const [selectedIntersection, setSelectedIntersection] = useState<string | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<string | null>(null);
  const [routeStart, setRouteStart] = useState<string>('');
  const [routeEnd, setRouteEnd] = useState<string>('');
  const [astarResult, setAstarResult] = useState<AStarResult | null>(null);
  const [astarStepIndex, setAstarStepIndex] = useState<number>(0);

  // Incident Creation Form State
  const [newIncCategory, setNewIncCategory] = useState<IncidentCategory>('Traffic accident');
  const [newIncSeverity, setNewIncSeverity] = useState<SeverityLevel>('High');
  const [newIncLocation, setNewIncLocation] = useState<string>('');

  // Bayesian Interactive Evidence State
  const [bayesEvidence, setBayesEvidence] = useState<BayesianEvidence>({
    rushHour: true,
    badWeather: false,
    highDemand: false,
    roadClosures: false,
    highIncidentSeverity: false,
    lowTeamAvailability: false,
  });

  const [logFilter, setLogFilter] = useState<string>('ALL');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [testResults, setTestResults] = useState<TestCaseResult[]>([]);
  const [lastCSPResult, setLastCSPResult] = useState<CSPResult | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Load Real Astana OSM Road Network on Startup
  const loadRealAstanaRoads = useCallback(
    async (forceRefresh = false) => {
      setOsmStatus('loading');
      setOsmError(null);
      try {
        const data = await fetchAstanaOSMGraph(forceRefresh);
        setOsmGraphCache({ intersections: data.intersections, roads: data.roads });
        setOsmStatus('ready');

        const freshSim = createInitialSimulationState(data.intersections, data.roads, 'Scenario 01 — Normal Morning', 2040);
        try {
          const saved = localStorage.getItem('astana2040_settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed.trafficDemand === 'number') freshSim.trafficDemand = parsed.trafficDemand;
            if (parsed.weather) freshSim.weather = parsed.weather;
          }
        } catch {
          // ignore
        }

        setSim(freshSim);

        // Set default A* route from Astana-1 Railway Station to EXPO 2017 Sphere
        const startNode = findNearestIntersection(data.intersections, 51.1965, 71.4112) || data.intersections[0];
        const endNode = findNearestIntersection(data.intersections, 51.0892, 71.4148) || data.intersections[data.intersections.length - 1];
        const baiterekNode = findNearestIntersection(data.intersections, 51.1283, 71.4306) || data.intersections[0];

        if (startNode) setRouteStart(startNode.id);
        if (endNode) setRouteEnd(endNode.id);
        if (baiterekNode) {
          setSelectedIntersection(baiterekNode.id);
          setNewIncLocation(baiterekNode.id);
        }
        if (data.roads[0]) setSelectedRoad(data.roads[0].id);

        showToast(
          `Loaded real Astana OSM road graph (${data.intersections.length} intersections, ${data.roads.length} streets) [${data.source}].`
        );
      } catch (err: any) {
        setOsmStatus('error');
        setOsmError(err?.message || 'Overpass API request failed.');
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadRealAstanaRoads(false);
  }, [loadRealAstanaRoads]);

  // Persist user settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        'astana2040_settings',
        JSON.stringify({ trafficDemand: sim.trafficDemand, weather: sim.weather })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [sim.trafficDemand, sim.weather]);

  // Main Simulation Timer Loop
  useEffect(() => {
    if (sim.status !== 'running') return;
    const intervalMs = Math.max(120, Math.round(1000 / sim.speed));
    const timer = setInterval(() => {
      setSim(prev => stepSimulation(prev, 2));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [sim.status, sim.speed]);

  // Synchronize Bayesian Evidence with Live Simulation State
  useEffect(() => {
    const hour = Math.floor((sim.simSeconds % 86400) / 3600);
    const isRush = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19);
    const availTeams = sim.teams.filter(t => t.available).length;
    setBayesEvidence({
      rushHour: isRush,
      badWeather: sim.weather !== 'Clear',
      highDemand: sim.trafficDemand > 60,
      roadClosures: sim.roads.some(r => r.closed),
      highIncidentSeverity: sim.incidents.some(
        i => i.status !== 'Resolved' && i.status !== 'Cancelled' && (i.severity === 'High' || i.severity === 'Critical')
      ),
      lowTeamAvailability: availTeams <= 3,
    });
  }, [sim.simSeconds, sim.weather, sim.trafficDemand, sim.roads, sim.incidents, sim.teams]);

  // Compute A* Route dynamically on real OSM graph
  useEffect(() => {
    if (!routeStart || !routeEnd || sim.intersections.length === 0) return;
    const res = runAStarSearch(routeStart, routeEnd, sim.intersections, sim.roads, sim.weather, sim.incidents, true);
    setAstarResult(res);
    setAstarStepIndex(Math.max(0, res.trace.length - 1));
  }, [routeStart, routeEnd, sim.roads, sim.weather, sim.incidents, sim.intersections]);

  const bayesianOutput = useMemo(() => runBayesianInference(bayesEvidence), [bayesEvidence]);

  // Action Handlers
  const handleToggleRoadClosure = (roadId: string) => {
    setSim(prev => {
      const roads = prev.roads.map(r =>
        r.id === roadId
          ? { ...r, closed: !r.closed, closureReason: !r.closed ? 'Manual Controller Closure' : undefined }
          : r
      );
      const target = roads.find(r => r.id === roadId);
      const log: ActivityLog = {
        id: `log-road-${Date.now()}`,
        simTime: formatSimTime(prev.simSeconds),
        category: 'Traffic',
        message: `OSM Street ${target?.name} (${roadId}) ${target?.closed ? 'CLOSED' : 'REOPENED'} by Chief Controller.`,
        severity: target?.closed ? 'warning' : 'success',
      };
      return { ...prev, roads, logs: [log, ...prev.logs] };
    });
  };

  const handleCreateIncident = (e?: React.FormEvent, customInter?: string, customLatLng?: LatLngTuple) => {
    if (e) e.preventDefault();
    const locId = customInter || newIncLocation || sim.intersections[0]?.id;
    const inter = sim.intersections.find(i => i.id === locId);
    if (!inter) return;

    const newInc: Incident = {
      id: `INC-${Math.floor(100 + Math.random() * 899)}`,
      category: newIncCategory,
      severity: newIncSeverity,
      intersectionId: inter.id,
      lat: customLatLng ? customLatLng[0] : inter.lat,
      lng: customLatLng ? customLatLng[1] : inter.lng,
      createdAt: Math.floor(sim.simSeconds / 60),
      status: 'Pending',
      assignedTeamId: null,
      estimatedResponseTime: null,
      serviceRemaining: 24,
    };

    setSim(prev => {
      const log: ActivityLog = {
        id: `log-inc-${Date.now()}`,
        simTime: formatSimTime(prev.simSeconds),
        category: 'Incidents',
        message: `New ${newInc.severity} ${newInc.category} reported at ${inter.name} (${newInc.lat.toFixed(4)}, ${newInc.lng.toFixed(4)}).`,
        severity: 'critical',
      };
      return {
        ...prev,
        incidents: [newInc, ...prev.incidents],
        logs: [log, ...prev.logs],
      };
    });
    showToast(`Incident ${newInc.id} created at ${inter.name}`);
  };

  const handleRunCSPNow = () => {
    const res = solveCSPDispatch(sim.incidents, sim.teams, sim.intersections, sim.roads, sim.weather, true);
    setLastCSPResult(res);
    setSim(prev => stepSimulation(prev, 1));
    showToast(`CSP Solver executed: ${res.assignments.length} assignment(s) produced.`);
  };

  const handleResolveIncident = (incId: string) => {
    setSim(prev => {
      const incidents = prev.incidents.map(inc => {
        if (inc.id === incId) {
          return { ...inc, status: 'Resolved' as const, serviceRemaining: 0 };
        }
        return inc;
      });
      const target = prev.incidents.find(i => i.id === incId);
      const teams = prev.teams.map(t =>
        t.id === target?.assignedTeamId ? { ...t, available: true, assignedIncidentId: null, eta: null, vehicleId: null } : t
      );
      return {
        ...prev,
        incidents,
        teams,
        resolvedIncidentsCount: prev.resolvedIncidentsCount + 1,
      };
    });
  };

  const handleLoadScenario = (name: string) => {
    const fresh = createInitialSimulationState(osmGraphCache.intersections, osmGraphCache.roads, name, 2040);
    setSim(fresh);
    setComparisonResult(null);
    showToast(`Loaded ${name} on real Astana OSM map`);
  };

  const handleRunComparison = () => {
    setIsComparing(true);
    setTimeout(() => {
      const res = runDeterministicComparison(sim, 85);
      setComparisonResult(res);
      setIsComparing(false);
      showToast('Baseline vs AI City Brain deterministic benchmark completed.');
    }, 80);
  };

  const handleExportReport = (format: 'json' | 'csv') => {
    const avgCongestion =
      (sim.roads.filter(r => !r.closed).reduce((a, b) => a + b.density, 0) / Math.max(1, sim.roads.length)) * 100;
    const payload = {
      project: 'ASTANA 2040 — AI CITY BRAIN (REAL OSM GRAPH)',
      scenario: sim.scenarioName,
      simulationClock: formatSimTime(sim.simSeconds),
      weather: sim.weather,
      trafficDemandPercent: sim.trafficDemand,
      osmGraphStats: {
        intersections: sim.intersections.length,
        roads: sim.roads.length,
      },
      metrics: {
        activeVehicles: sim.vehicles.length,
        completedJourneys: sim.completedJourneys,
        averageCongestionPercent: Number(avgCongestion.toFixed(1)),
        totalReroutes: sim.totalReroutes,
        resolvedIncidents: sim.resolvedIncidentsCount,
      },
      comparison: comparisonResult,
    };

    let content = '';
    let mime = 'application/json';
    let ext = 'json';

    if (format === 'json') {
      content = JSON.stringify(payload, null, 2);
    } else {
      mime = 'text/csv';
      ext = 'csv';
      content = [
        'Metric,Value',
        `Scenario,"${payload.scenario}"`,
        `Clock,${payload.simulationClock}`,
        `Weather,${payload.weather}`,
        `TrafficDemand,${payload.trafficDemandPercent}%`,
        `OSMNodes,${payload.osmGraphStats.intersections}`,
        `OSMRoads,${payload.osmGraphStats.roads}`,
        `ActiveVehicles,${payload.metrics.activeVehicles}`,
        `CompletedJourneys,${payload.metrics.completedJourneys}`,
        `AvgCongestion,${payload.metrics.averageCongestionPercent}%`,
        `AIReroutes,${payload.metrics.totalReroutes}`,
        `ResolvedIncidents,${payload.metrics.resolvedIncidents}`,
      ].join('\n');
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astana-2040-osm-report.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derived KPI Metrics
  const openRoads = sim.roads.filter(r => !r.closed);
  const avgCongestionPct = Math.round(
    (openRoads.reduce((sum, r) => sum + r.density, 0) / Math.max(1, openRoads.length)) * 100
  );
  const activeIncidentsCount = sim.incidents.filter(i => i.status !== 'Resolved' && i.status !== 'Cancelled').length;
  const availableTeamsCount = sim.teams.filter(t => t.available).length;
  const avgTravelMinutes =
    sim.completedJourneys > 0
      ? (sim.totalCompletedTravelTime / sim.completedJourneys).toFixed(1)
      : (4.4 + (avgCongestionPct / 100) * 5.2).toFixed(1);

  const selectedInterObj = sim.intersections.find(i => i.id === selectedIntersection) || null;
  const selectedRoadObj = sim.roads.find(r => r.id === selectedRoad) || null;
  const selectedTLObj = selectedIntersection ? sim.trafficLights[selectedIntersection] : null;

  const t = UI_TEXT[lang];

  const navItems: { id: NavSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: t.nav.overview, icon: <Compass className="w-4 h-4" /> },
    { id: 'live', label: t.nav.live, icon: <Globe className="w-4 h-4" /> },
    { id: 'aiCenter', label: t.nav.aiCenter, icon: <Brain className="w-4 h-4" /> },
    { id: 'incidents', label: t.nav.incidents, icon: <Siren className="w-4 h-4" />, badge: activeIncidentsCount || undefined },
    { id: 'teams', label: t.nav.teams, icon: <Truck className="w-4 h-4" /> },
    { id: 'analytics', label: t.nav.analytics, icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'experiments', label: t.nav.experiments, icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'about', label: t.nav.about, icon: <BookOpen className="w-4 h-4" /> },
  ];

  const renderWeatherIcon = (w: WeatherType) => {
    switch (w) {
      case 'Clear': return <Sun className="w-4 h-4 text-amber-400" />;
      case 'Rain': return <CloudRain className="w-4 h-4 text-sky-400" />;
      case 'Fog': return <CloudFog className="w-4 h-4 text-slate-400" />;
      case 'Snow': return <CloudSnow className="w-4 h-4 text-cyan-200" />;
      case 'Heavy Snowstorm': return <CloudSnow className="w-4 h-4 text-indigo-300" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#040812] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[2000] flex items-center gap-2.5 bg-slate-900/95 border border-cyan-500/50 text-cyan-200 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP COMMAND HEADER */}
      <header className="h-16 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80 px-4 flex items-center justify-between sticky top-0 z-[1100]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
            title="Toggle Sidebar"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-sm sm:text-base bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                  ASTANA 2040
                </span>
                <span className="hidden md:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                  {t.statusActive}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">{t.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Center/Right Simulation Clock & Status Telemetry */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <div className="text-xs font-mono">
              <span className="text-slate-400 hidden lg:inline mr-1.5">2040-11-20</span>
              <span className="text-cyan-300 font-bold">{formatSimTime(sim.simSeconds)}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs">
            {renderWeatherIcon(sim.weather)}
            <span className="text-slate-200">{sim.weather}</span>
          </div>

          <button
            onClick={() => setSim(prev => ({ ...prev, status: prev.status === 'running' ? 'paused' : 'running' }))}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              sim.status === 'running'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${sim.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{sim.status === 'running' ? t.running : t.paused}</span>
          </button>

          <button
            onClick={() => setLang(l => (l === 'EN' ? 'KZ' : 'EN'))}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300 transition"
            title="Switch Language (English / Қазақша)"
          >
            {lang}
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT NAVIGATION SIDEBAR */}
        <aside
          className={`${
            sidebarCollapsed ? 'w-16' : 'w-60'
          } bg-slate-950/80 border-r border-slate-800/80 flex flex-col justify-between transition-all duration-200 shrink-0`}
        >
          <nav className="p-2.5 space-y-1">
            {navItems.map(item => {
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className={active ? 'text-cyan-400' : 'text-slate-400'}>{item.icon}</span>
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {!sidebarCollapsed && (
            <div className="p-3 m-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-[11px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">AI Core Mode</span>
                <span className={`font-mono font-semibold ${sim.aiEnabled ? 'text-cyan-400' : 'text-amber-400'}`}>
                  {sim.aiEnabled ? 'AUTONOMOUS' : 'CONVENTIONAL'}
                </span>
              </div>
              <button
                onClick={() => setSim(prev => ({ ...prev, aiEnabled: !prev.aiEnabled }))}
                className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition text-center"
              >
                Switch to {sim.aiEnabled ? 'Conventional' : 'AI City Brain'}
              </button>
            </div>
          )}
        </aside>

        {/* MAIN CONTENT VIEWPORT */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-[#040812] to-[#040812]">
          {/* ================================================================
              PAGE 1: OVERVIEW DASHBOARD
          ================================================================ */}
          {activeNav === 'overview' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Hero Command Banner */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-[#0b162c] to-slate-900 border border-cyan-500/25 p-6 sm:p-8 shadow-2xl">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>ASTANA OPENSTREETMAP DIGITAL TWIN • 51.1283°N, 71.4306°E • SEED #{sim.seed}</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    ASTANA 2040 — <span className="text-cyan-400">AI CITY BRAIN</span>
                  </h1>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Welcome, Chief City Operations Controller. Monitor Astana’s real geographical OpenStreetMap road network where four cooperating Artificial Intelligence architectures—Autonomous Agents, A* Dynamic Pathfinding, CSP Emergency Dispatching, and Bayesian Risk Networks—orchestrate urban mobility and public safety.
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setSim(prev => ({ ...prev, status: prev.status === 'running' ? 'paused' : 'running' }));
                        setActiveNav('live');
                      }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 transition"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{sim.status === 'running' ? 'OPEN LIVE SIMULATION' : t.startSim}</span>
                    </button>
                    <button
                      onClick={() => setActiveNav('aiCenter')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 font-semibold text-xs transition"
                    >
                      <Brain className="w-4 h-4" />
                      <span>{t.exploreAI}</span>
                    </button>
                    <button
                      onClick={() => {
                        handleLoadScenario('Scenario 05 — Multiple Accidents');
                        setSim(prev => ({ ...prev, status: 'running' }));
                        setActiveNav('live');
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 font-semibold text-xs transition"
                    >
                      <Zap className="w-4 h-4" />
                      <span>{t.runDemo}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary Urban Telemetry KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Active Autonomous Vehicles</span>
                    <Navigation className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{sim.vehicles.length}</div>
                  <div className="text-[11px] text-emerald-400">
                    {sim.completedJourneys} journeys completed • {sim.totalReroutes} AI reroutes
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Network Congestion Index</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{avgCongestionPct}%</div>
                  <div className="text-[11px] text-slate-400">
                    Avg Trip: <span className="text-cyan-300 font-mono">{avgTravelMinutes} min</span> • Demand: {sim.trafficDemand}%
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Emergency & Municipal Units</span>
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {availableTeamsCount} <span className="text-sm font-normal text-slate-400">/ {sim.teams.length} Free</span>
                  </div>
                  <div className="text-[11px] text-amber-300">
                    {activeIncidentsCount} active incident(s) • {sim.resolvedIncidentsCount} resolved
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Bayesian Delay Risk</span>
                    <Network className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {Math.round(bayesianOutput.delayProb * 100)}%
                  </div>
                  <div className="text-[11px] text-violet-300">
                    {bayesianOutput.delayRisk} • Congestion P: {Math.round(bayesianOutput.congestionProb * 100)}%
                  </div>
                </div>
              </div>

              {/* Four Cooperating AI Systems Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 transition space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-cyan-400">AI MODULE 01 • WEEK 1</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">ACTIVE</span>
                  </div>
                  <h3 className="font-bold text-white text-base">Intelligent Autonomous Agents</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Every vehicle and traffic signal executes a continuous PERCEIVE → ANALYZE → DECIDE → ACT cycle along real Astana avenues—adapting green light phases to directional queues and granting emergency preemption.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 transition space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-cyan-400">AI MODULE 02 • WEEK 2</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">ACTIVE</span>
                  </div>
                  <h3 className="font-bold text-white text-base">A* Dynamic Pathfinding Engine</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Computes optimal routes using f(n) = g(n) + h(n) with an admissible Haversine GPS heuristic over OpenStreetMap road polylines, respecting one-way streets, weather penalties, and bridge closures.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 transition space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-violet-400">AI MODULE 03 • WEEK 3</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">ACTIVE</span>
                  </div>
                  <h3 className="font-bold text-white text-base">CSP Municipal Team Dispatcher</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Solves emergency team allocation as a Constraint Satisfaction Problem using Backtracking, Minimum Remaining Values (MRV), and Forward Checking across skill, availability, and capacity constraints.
                  </p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 transition space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-violet-400">AI MODULE 04 • WEEK 6</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">ACTIVE</span>
                  </div>
                  <h3 className="font-bold text-white text-base">Bayesian Probabilistic Risk Network</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Performs exact Noisy-OR and CPT enumeration over Rush Hour, Weather, Demand, and Road Closures to forecast traffic congestion and emergency response delay probabilities over real Astana zones.
                  </p>
                </div>
              </div>

              {/* Live Real Astana Map Preview + Recent AI Events */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 h-[540px]">
                  <RealAstanaMap
                    sim={sim}
                    osmStatus={osmStatus}
                    osmError={osmError}
                    onRetryOsm={() => loadRealAstanaRoads(true)}
                    selectedIntersection={selectedIntersection}
                    selectedRoad={selectedRoad}
                    routeStart={routeStart}
                    routeEnd={routeEnd}
                    astarHighlight={astarResult}
                    bayesianResult={bayesianOutput}
                    onSelectIntersection={setSelectedIntersection}
                    onSelectRoad={setSelectedRoad}
                    onMapClickCreateIncident={(lat, lng, nodeId) => handleCreateIncident(undefined, nodeId, [lat, lng])}
                  />
                </div>

                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <Terminal className="w-4 h-4" /> Real-Time AI Decision Stream
                      </h3>
                      <button
                        onClick={() => setActiveNav('aiCenter')}
                        className="text-[11px] text-cyan-400 hover:underline"
                      >
                        Inspect All →
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
                      {sim.logs.slice(0, 12).map(log => (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-slate-400">[{log.simTime}]</span>
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300">{log.category}</span>
                          </div>
                          <p className="text-slate-200 leading-snug">{log.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 2: LIVE CITY SIMULATION
          ================================================================ */}
          {activeNav === 'live' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 max-w-[1600px] mx-auto">
              <div className="xl:col-span-8 flex flex-col gap-4">
                {/* Simulation Playback Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSim(prev => ({ ...prev, status: prev.status === 'running' ? 'paused' : 'running' }))}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                        sim.status === 'running'
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      }`}
                    >
                      {sim.status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{sim.status === 'running' ? 'Pause' : 'Start / Resume'}</span>
                    </button>

                    <button
                      onClick={() => setSim(prev => stepSimulation({ ...prev, status: 'paused' }, 2))}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                      title="Execute Single Simulation Step"
                    >
                      <StepForward className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Step</span>
                    </button>

                    <button
                      onClick={() => handleLoadScenario(sim.scenarioName)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                      title="Reset Simulation"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Speed Multipliers */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    {([1, 2, 4, 8] as const).map(spd => (
                      <button
                        key={spd}
                        onClick={() => setSim(prev => ({ ...prev, speed: spd }))}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition ${
                          sim.speed === spd
                            ? 'bg-cyan-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        x{spd}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[600px]">
                  <RealAstanaMap
                    sim={sim}
                    osmStatus={osmStatus}
                    osmError={osmError}
                    onRetryOsm={() => loadRealAstanaRoads(true)}
                    selectedIntersection={selectedIntersection}
                    selectedRoad={selectedRoad}
                    routeStart={routeStart}
                    routeEnd={routeEnd}
                    astarHighlight={astarResult}
                    bayesianResult={bayesianOutput}
                    onSelectIntersection={setSelectedIntersection}
                    onSelectRoad={setSelectedRoad}
                    onMapClickCreateIncident={(lat, lng, nodeId) => handleCreateIncident(undefined, nodeId, [lat, lng])}
                  />
                </div>
              </div>

              {/* Right 4 Columns: Environment Controls, Inspector & A* Route Planner */}
              <div className="xl:col-span-4 space-y-4">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                    <Sliders className="w-4 h-4" /> City Environment Controls
                  </h3>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Traffic Demand</span>
                      <span className="font-mono font-bold text-cyan-300">
                        {sim.trafficDemand}% (
                        {sim.trafficDemand <= 20
                          ? 'Very Low'
                          : sim.trafficDemand <= 40
                          ? 'Light'
                          : sim.trafficDemand <= 60
                          ? 'Moderate'
                          : sim.trafficDemand <= 80
                          ? 'Heavy'
                          : 'Extreme'}
                        )
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={sim.trafficDemand}
                      onChange={e => setSim(prev => ({ ...prev, trafficDemand: Number(e.target.value) }))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300 block">Weather Conditions</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Clear', 'Rain', 'Snow', 'Heavy Snowstorm', 'Fog'] as WeatherType[]).map(w => (
                        <button
                          key={w}
                          onClick={() => setSim(prev => ({ ...prev, weather: w }))}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition text-center ${
                            sim.weather === w
                              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setSim(prev => {
                          const rng = new SeededRandom(Date.now());
                          const v = spawnVehicle(rng, prev.vehicles.length + 500, prev.intersections, prev.roads, prev.weather, prev.incidents, prev.aiEnabled);
                          if (!v) return prev;
                          return { ...prev, vehicles: [...prev.vehicles, v] };
                        });
                        showToast('Additional autonomous vehicle spawned on Astana road network.');
                      }}
                      className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-300 border border-slate-700 transition"
                    >
                      + Spawn Vehicle
                    </button>
                    <button
                      onClick={() => handleCreateIncident(undefined, selectedIntersection || sim.intersections[0]?.id)}
                      className="flex-1 py-2 px-3 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-xs font-medium text-red-300 border border-red-500/30 transition"
                    >
                      + Incident at {selectedIntersection || 'Node'}
                    </button>
                  </div>
                </div>

                {/* Selected OSM Road / Intersection Inspector */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Real OSM Infrastructure Inspector
                  </h3>

                  {selectedRoadObj && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white truncate">{selectedRoadObj.name} ({selectedRoadObj.id})</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${selectedRoadObj.closed ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {selectedRoadObj.closed ? 'CLOSED' : 'OPEN'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-slate-400">
                        <div>Length: <span className="text-slate-200 font-mono">{selectedRoadObj.length} km</span></div>
                        <div>Type: <span className="text-slate-200 font-mono">{selectedRoadObj.roadType}</span></div>
                        <div>Density: <span className="text-amber-300 font-mono">{Math.round(selectedRoadObj.density * 100)}%</span> ({selectedRoadObj.vehicleCount}/{selectedRoadObj.capacity})</div>
                        <div>Est. Time: <span className="text-cyan-300 font-mono">{selectedRoadObj.closed ? '∞' : `${selectedRoadObj.travelTime}m`}</span></div>
                      </div>
                      <button
                        onClick={() => handleToggleRoadClosure(selectedRoadObj.id)}
                        className={`w-full py-1.5 rounded-lg font-semibold text-xs transition ${
                          selectedRoadObj.closed
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40'
                        }`}
                      >
                        {selectedRoadObj.closed ? 'Reopen Street Segment' : 'Close Street Segment (Test A* Reroute)'}
                      </button>
                    </div>
                  )}

                  {selectedInterObj && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white truncate">{selectedInterObj.name} ({selectedInterObj.id})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">{selectedInterObj.district}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        GPS: {selectedInterObj.lat.toFixed(5)}°N, {selectedInterObj.lng.toFixed(5)}°E
                      </div>
                      {selectedTLObj ? (
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Signal Phase:</span>
                            <span className="font-mono font-bold text-emerald-400">{selectedTLObj.phase}</span>
                          </div>
                          <div className="text-slate-400">
                            Queues: NS <span className="text-white font-mono">{selectedTLObj.nsQueue}</span> | EW <span className="text-white font-mono">{selectedTLObj.ewQueue}</span>
                          </div>
                          <p className="text-cyan-300/90 italic bg-cyan-950/30 p-2 rounded border border-cyan-500/20">
                            "{selectedTLObj.reasoning}"
                          </p>
                        </div>
                      ) : (
                        <div className="text-slate-500 text-[11px]">Unsignalized OSM Node</div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setRouteStart(selectedInterObj.id)}
                          className="flex-1 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px]"
                        >
                          Set A* Start
                        </button>
                        <button
                          onClick={() => setRouteEnd(selectedInterObj.id)}
                          className="flex-1 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px]"
                        >
                          Set A* Goal
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* A* Dynamic Route Planner */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                    <Route className="w-4 h-4" /> A* Real Street Pathfinding Planner
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[11px] text-slate-400">Origin Intersection</label>
                      <select
                        value={routeStart}
                        onChange={e => setRouteStart(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200"
                      >
                        {sim.intersections.slice(0, 120).map(i => (
                          <option key={i.id} value={i.id}>{i.id} — {i.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Destination Intersection</label>
                      <select
                        value={routeEnd}
                        onChange={e => setRouteEnd(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-slate-200"
                      >
                        {sim.intersections.slice(0, 120).map(i => (
                          <option key={i.id} value={i.id}>{i.id} — {i.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {astarResult && (
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                      {astarResult.unreachable ? (
                        <div className="text-red-400 font-semibold">No valid street route available (network partitioned by closures).</div>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Est. Travel Time:</span>
                            <span className="font-mono font-bold text-cyan-300">{astarResult.totalTime} min</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Haversine Distance / Nodes:</span>
                            <span className="font-mono text-slate-200">{astarResult.totalDistance} km ({astarResult.expandedCount} expanded)</span>
                          </div>
                          <div className="text-[11px] font-mono text-emerald-300 break-words pt-1 border-t border-slate-800 max-h-16 overflow-y-auto">
                            {astarResult.path.join(' → ')}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 3: AI INTELLIGENCE CENTER (ALL 4 ALGORITHMS)
          ================================================================ */}
          {activeNav === 'aiCenter' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">AI Intelligence & Explainability Center</h2>
                  <p className="text-xs text-slate-400">Inspect live reasoning, OSM A* search traces, CSP constraints, and Bayesian probability tables.</p>
                </div>
                <button
                  onClick={() => setSim(prev => stepSimulation(prev, 2))}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                >
                  Execute AI Reasoning Step
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* MODULE 01: INTELLIGENT AGENTS */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-cyan-400 font-bold">MODULE 01 — INTELLIGENT AGENTS</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      PERCEIVE → ANALYZE → DECIDE → ACT
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-mono">
                    {['1. PERCEIVE', '2. ANALYZE', '3. DECIDE', '4. ACT', '5. OBSERVE'].map(step => (
                      <div key={step} className="p-2 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-200">
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <div className="text-xs font-semibold text-slate-300">Live Adaptive Traffic Light Agents:</div>
                    {Object.values(sim.trafficLights)
                      .slice(0, 6)
                      .map(tl => (
                        <div key={tl.intersectionId} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                          <div className="flex justify-between font-mono text-[11px]">
                            <span className="text-cyan-300 font-bold">TL-{tl.intersectionId}</span>
                            <span className="text-emerald-400">{tl.phase} ({tl.greenDuration}s)</span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-1">{tl.reasoning}</p>
                        </div>
                      ))}
                  </div>
                </div>

                {/* MODULE 02: A* PATHFINDING EXECUTION TRACE */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-cyan-400 font-bold">MODULE 02 — A* PATHFINDING TRACE</span>
                    <span className="text-xs font-mono text-slate-300">f(n) = g(n) + h(n)</span>
                  </div>
                  {astarResult && (
                    <>
                      <div className="flex items-center justify-between text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <span>Route: <strong className="text-cyan-300">{routeStart} → {routeEnd}</strong></span>
                        <span>Cost: <strong className="text-emerald-400">{astarResult.totalTime}m</strong> ({astarResult.totalDistance}km)</span>
                      </div>

                      {astarResult.trace.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Step-by-Step Expansion ({astarStepIndex + 1}/{astarResult.trace.length}):</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setAstarStepIndex(i => Math.max(0, i - 1))}
                                className="px-2 py-0.5 rounded bg-slate-800 text-xs"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() => setAstarStepIndex(i => Math.min(astarResult.trace.length - 1, i + 1))}
                                className="px-2 py-0.5 rounded bg-slate-800 text-xs"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1">
                            <div>Expanding Node: <span className="text-cyan-400 font-bold">{astarResult.trace[astarStepIndex]?.current}</span></div>
                            <div>
                              g(n) = <span className="text-amber-300">{astarResult.trace[astarStepIndex]?.g}</span> | h(n) ={' '}
                              <span className="text-violet-300">{astarResult.trace[astarStepIndex]?.h}</span> | f(n) ={' '}
                              <span className="text-emerald-400 font-bold">{astarResult.trace[astarStepIndex]?.f}</span>
                            </div>
                            <div className="text-slate-400 truncate">
                              Open Frontier: [{astarResult.trace[astarStepIndex]?.frontier.join(', ')}]
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* MODULE 03: CSP MUNICIPAL DISPATCHER */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-violet-400 font-bold">MODULE 03 — CSP DISPATCHER (MRV + FORWARD CHECK)</span>
                    <button
                      onClick={handleRunCSPNow}
                      className="px-3 py-1 rounded-lg bg-violet-500 hover:bg-violet-400 text-slate-950 font-bold text-xs transition"
                    >
                      RUN CSP ALLOCATION
                    </button>
                  </div>
                  <div className="text-xs text-slate-400">
                    Variables: Pending Incidents ({sim.incidents.filter(i => i.status === 'Pending').length}) • Domains: Available Teams ({availableTeamsCount}/{sim.teams.length})
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1.5 max-h-52 overflow-y-auto">
                    {(lastCSPResult?.trace || ['Click "RUN CSP ALLOCATION" or create an incident on the Astana map to inspect solver trace.']).map(
                      (line, idx) => (
                        <div key={idx} className="text-slate-300">
                          &gt; {line}
                        </div>
                      )
                    )}
                    {lastCSPResult?.rejections.slice(0, 4).map((rej, idx) => (
                      <div key={`rej-${idx}`} className="text-rose-400/90">
                        ✕ {rej.reason}
                      </div>
                    ))}
                  </div>
                </div>

                {/* MODULE 04: BAYESIAN RISK PREDICTION NETWORK */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-violet-400 font-bold">MODULE 04 — BAYESIAN NETWORK INFERENCE</span>
                    <span className="text-xs font-mono text-slate-400">Noisy-OR + Exact CPT</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {(
                      [
                        ['rushHour', 'Rush Hour'],
                        ['badWeather', 'Bad Weather'],
                        ['highDemand', 'High Demand'],
                        ['roadClosures', 'Road Closures'],
                        ['highIncidentSeverity', 'High Severity Inc.'],
                        ['lowTeamAvailability', 'Low Team Avail.'],
                      ] as [keyof BayesianEvidence, string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setBayesEvidence(prev => ({ ...prev, [key]: !prev[key] }))}
                        className={`p-2 rounded-lg border text-left transition flex items-center justify-between ${
                          bayesEvidence[key]
                            ? 'bg-violet-500/20 border-violet-500 text-violet-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        <span className="font-mono text-[10px] font-bold">{bayesEvidence[key] ? 'T' : 'F'}</span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>P(Traffic Congestion | Evidence)</span>
                        <span className="font-mono font-bold text-amber-300">
                          {(bayesianOutput.congestionProb * 100).toFixed(1)}% — {bayesianOutput.congestionRisk}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all duration-300"
                          style={{ width: `${bayesianOutput.congestionProb * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <span>P(Emergency Response Delay | Evidence)</span>
                        <span className="font-mono font-bold text-rose-300">
                          {(bayesianOutput.delayProb * 100).toFixed(1)}% — {bayesianOutput.delayRisk}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 via-violet-500 to-rose-500 transition-all duration-300"
                          style={{ width: `${bayesianOutput.delayProb * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                    {bayesianOutput.explanation.map((ex, i) => (
                      <div key={i}>• {ex}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chronological Filterable AI Activity Feed */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" /> Chronological AI System Event Feed
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {['ALL', 'Agents', 'Pathfinding', 'CSP', 'Bayesian', 'Incidents', 'Traffic'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setLogFilter(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                          logFilter === cat
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto font-mono text-xs">
                  {sim.logs
                    .filter(l => logFilter === 'ALL' || l.category === logFilter)
                    .map(log => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 p-2 rounded-lg bg-slate-950/90 border border-slate-800/70"
                      >
                        <span className="text-slate-500 shrink-0">[{log.simTime}]</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 text-[10px] shrink-0">
                          {log.category}
                        </span>
                        <span className="text-slate-200">{log.message}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 4: INCIDENTS & EMERGENCIES
          ================================================================ */}
          {activeNav === 'incidents' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
              <form
                onSubmit={handleCreateIncident}
                className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4 h-fit"
              >
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" /> Report City Incident
                </h2>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Incident Category</label>
                  <select
                    value={newIncCategory}
                    onChange={e => setNewIncCategory(e.target.value as IncidentCategory)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    {(
                      [
                        'Traffic accident',
                        'Vehicle breakdown',
                        'Fire emergency',
                        'Medical emergency',
                        'Road obstruction',
                        'Power outage',
                        'Public safety incident',
                      ] as IncidentCategory[]
                    ).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Severity Level</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['Low', 'Medium', 'High', 'Critical'] as SeverityLevel[]).map(sev => (
                      <button
                        type="button"
                        key={sev}
                        onClick={() => setNewIncSeverity(sev)}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition ${
                          newIncSeverity === sev
                            ? 'bg-red-500/20 border-red-500 text-red-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Astana OSM Intersection</label>
                  <select
                    value={newIncLocation}
                    onChange={e => setNewIncLocation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    {sim.intersections.slice(0, 120).map(i => (
                      <option key={i.id} value={i.id}>{i.id} — {i.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-lg shadow-red-600/20"
                >
                  Create Emergency Incident
                </button>
                <button
                  type="button"
                  onClick={handleRunCSPNow}
                  className="w-full py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 font-semibold text-xs transition"
                >
                  Run CSP Team Dispatcher Now
                </button>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">City Incident Command Queue ({sim.incidents.length})</h2>
                </div>
                {sim.incidents.length === 0 ? (
                  <div className="p-8 rounded-xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                    No active or historical incidents recorded. Click any location on the Astana map or use the form to simulate an urban emergency.
                  </div>
                ) : (
                  sim.incidents.map(inc => (
                    <div
                      key={inc.id}
                      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">{inc.id}</span>
                          <span className="text-xs font-semibold text-cyan-300">{inc.category}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inc.severity === 'Critical' || inc.severity === 'High'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {inc.severity}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          GPS: <span className="font-mono text-slate-200">{inc.lat.toFixed(4)}°N, {inc.lng.toFixed(4)}°E</span> ({inc.intersectionId}) • Team:{' '}
                          <span className="text-emerald-300 font-mono">{inc.assignedTeamId || 'Awaiting CSP'}</span>
                          {inc.estimatedResponseTime !== null && ` (ETA ${inc.estimatedResponseTime}m)`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            inc.status === 'Resolved'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : inc.status === 'Pending'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-cyan-500/15 text-cyan-300'
                          }`}
                        >
                          {inc.status}
                        </span>
                        {inc.status !== 'Resolved' && inc.status !== 'Cancelled' && (
                          <button
                            onClick={() => handleResolveIncident(inc.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 5: MUNICIPAL TEAMS
          ================================================================ */}
          {activeNav === 'teams' && (
            <div className="space-y-5 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Municipal & Emergency Response Fleet</h2>
                  <p className="text-xs text-slate-400">Real-time team GPS positions, skill matrices, and A* street dispatch routing.</p>
                </div>
                <button
                  onClick={handleRunCSPNow}
                  className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-bold text-xs transition"
                >
                  Optimize Fleet Allocation (CSP)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sim.teams.map(team => (
                  <div
                    key={team.id}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-cyan-300 text-sm">{team.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            team.available
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {team.available ? 'AVAILABLE' : `ASSIGNED (${team.assignedIncidentId})`}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-white">{team.name}</div>
                      <div className="text-xs text-slate-400">
                        Category: <span className="text-slate-200">{team.category}</span> • GPS:{' '}
                        <span className="font-mono text-cyan-300">{team.lat.toFixed(4)}°N, {team.lng.toFixed(4)}°E</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1">
                      {team.skills.map(sk => (
                        <span key={sk} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 6: ANALYTICS & AI VS CONVENTIONAL COMPARISON
          ================================================================ */}
          {activeNav === 'analytics' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">Analytics & Baseline vs. AI Benchmark</h2>
                  <p className="text-xs text-slate-400">
                    Compare Mode A (Conventional Fixed-Time) vs. Mode B (AI City Brain) on the real Astana OSM road graph (Seed #{sim.seed}).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunComparison}
                    disabled={isComparing || osmStatus !== 'ready'}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition shadow-lg shadow-cyan-500/20"
                  >
                    {isComparing ? 'RUNNING SIMULATION...' : 'RUN COMPARISON'}
                  </button>
                  <button
                    onClick={() => handleExportReport('csv')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    onClick={() => handleExportReport('json')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5" /> JSON
                  </button>
                </div>
              </div>

              {comparisonResult && (
                <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-cyan-300">
                      Deterministic Benchmark Results — {comparisonResult.scenarioName} (Seed #{comparisonResult.seed})
                    </h3>
                    <span className="text-xs text-slate-400">Simulated Horizon: {comparisonResult.durationMinutes} min</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 px-3">Performance Metric</th>
                          <th className="py-2.5 px-3">Mode A: Conventional</th>
                          <th className="py-2.5 px-3 text-cyan-300">Mode B: AI City Brain</th>
                          <th className="py-2.5 px-3">Measured Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono">
                        {[
                          {
                            label: 'Average Vehicle Travel Time (min)',
                            conv: comparisonResult.conventional.avgTravelTime,
                            ai: comparisonResult.ai.avgTravelTime,
                            lowerIsBetter: true,
                          },
                          {
                            label: 'Average Intersection Wait Time (sec)',
                            conv: comparisonResult.conventional.avgWaitTime,
                            ai: comparisonResult.ai.avgWaitTime,
                            lowerIsBetter: true,
                          },
                          {
                            label: 'Average Road Congestion (%)',
                            conv: comparisonResult.conventional.avgCongestion,
                            ai: comparisonResult.ai.avgCongestion,
                            lowerIsBetter: true,
                          },
                          {
                            label: 'Completed Vehicle Journeys',
                            conv: comparisonResult.conventional.completedJourneys,
                            ai: comparisonResult.ai.completedJourneys,
                            lowerIsBetter: false,
                          },
                          {
                            label: 'Dynamic A* Route Recalculations',
                            conv: comparisonResult.conventional.reroutes,
                            ai: comparisonResult.ai.reroutes,
                            lowerIsBetter: false,
                          },
                        ].map(row => {
                          const diffPct =
                            row.conv > 0
                              ? (((row.lowerIsBetter ? row.conv - row.ai : row.ai - row.conv) / row.conv) * 100).toFixed(1)
                              : '0.0';
                          const improved = Number(diffPct) > 0;
                          return (
                            <tr key={row.label}>
                              <td className="py-2.5 px-3 font-sans text-slate-200">{row.label}</td>
                              <td className="py-2.5 px-3 text-slate-400">{row.conv}</td>
                              <td className="py-2.5 px-3 text-cyan-300 font-bold">{row.ai}</td>
                              <td className={`py-2.5 px-3 font-bold ${improved ? 'text-emerald-400' : 'text-amber-300'}`}>
                                {improved ? `+${diffPct}% Improvement` : `${diffPct}% Delta`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Recorded Network Congestion Over Simulation Time (%)
                  </h3>
                  <div className="h-48 flex items-end gap-1.5 pt-4 px-2 bg-slate-950 rounded-lg border border-slate-800">
                    {sim.history.map((pt, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div
                          className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t transition-all"
                          style={{ height: `${Math.min(100, Math.max(8, pt.avgDensity * 1.4))}%` }}
                          title={`${pt.timeLabel}: ${pt.avgDensity}% density`}
                        />
                        <span className="text-[9px] font-mono text-slate-500 hidden sm:block">
                          {pt.timeLabel.slice(3)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-violet-300">
                    Bayesian Congestion Risk Trajectory (%)
                  </h3>
                  <div className="h-48 flex items-end gap-1.5 pt-4 px-2 bg-slate-950 rounded-lg border border-slate-800">
                    {sim.history.map((pt, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div
                          className="w-full bg-gradient-to-t from-violet-600 to-fuchsia-400 rounded-t transition-all"
                          style={{ height: `${Math.min(100, Math.max(8, pt.congestionProb))}%` }}
                          title={`${pt.timeLabel}: ${pt.congestionProb}% risk`}
                        />
                        <span className="text-[9px] font-mono text-slate-500 hidden sm:block">
                          {pt.timeLabel.slice(3)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 7: EXPERIMENTS LAB & AUTOMATED VERIFICATION SUITE
          ================================================================ */}
          {activeNav === 'experiments' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div>
                <h2 className="text-xl font-bold text-white">Experiments Lab & AI Verification Suite</h2>
                <p className="text-xs text-slate-400">
                  Launch deterministic city stress-test scenarios on real Astana OpenStreetMap streets or execute automated unit tests across all four AI engines.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    title: 'Scenario 01 — Normal Morning',
                    desc: 'Clear weather, 45% moderate demand, baseline urban operations across Astana.',
                  },
                  {
                    title: 'Scenario 02 — Rush Hour',
                    desc: '82% high commuter traffic across Left & Right Bank Ishim River bridges during peak morning window.',
                  },
                  {
                    title: 'Scenario 03 — Winter Storm',
                    desc: 'Heavy snowstorm reduces vehicle speeds by 55% and elevates Bayesian delay probabilities.',
                  },
                  {
                    title: 'Scenario 04 — Bridge Closure',
                    desc: 'Closes an Ishim River bridge segment; A* dynamically reroutes traffic across neighboring bridges.',
                  },
                  {
                    title: 'Scenario 05 — Multiple Accidents',
                    desc: 'Simultaneous Fire, Medical, and Traffic incidents at Baiterek, Right Bank & EXPO test CSP allocation.',
                  },
                  {
                    title: 'Scenario 06 — Major City Event',
                    desc: '85% traffic demand converging toward EXPO 2017 / Nur Alem Sphere with adaptive signal priority.',
                  },
                ].map(sc => (
                  <div
                    key={sc.title}
                    className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-1.5">
                      <h3 className="font-bold text-sm text-cyan-300">{sc.title}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{sc.desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        handleLoadScenario(sc.title);
                        setSim(prev => ({ ...prev, status: 'running' }));
                        setActiveNav('live');
                      }}
                      className="w-full py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-semibold text-xs transition"
                    >
                      RUN EXPERIMENT
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" /> AI Algorithms Testing & Validation Center
                    </h3>
                    <p className="text-xs text-slate-400">
                      Deterministic assertions validating Intelligent Agents, A* Search, CSP Solver, and Bayesian Network on real Astana OSM data.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const res = executeAllAITests(sim.intersections, sim.roads);
                      setTestResults(res);
                      const passed = res.filter(r => r.passed).length;
                      showToast(`Verification complete: ${passed}/${res.length} tests PASSED.`);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
                  >
                    RUN ALL TESTS (12 ASSERTIONS)
                  </button>
                </div>

                {testResults.length > 0 && (
                  <div className="space-y-2">
                    {testResults.map(tc => (
                      <div
                        key={tc.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-start justify-between gap-4 text-xs"
                      >
                        <div className="space-y-1 max-w-3xl">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-cyan-300">{tc.id}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">{tc.system}</span>
                            <span className="font-bold text-white">{tc.name}</span>
                          </div>
                          <p className="text-slate-400">{tc.description}</p>
                          <div className="text-[11px] font-mono">
                            <span className="text-slate-500">Expected:</span> <span className="text-slate-300">{tc.expected}</span>
                          </div>
                          <div className="text-[11px] font-mono">
                            <span className="text-slate-500">Actual:</span> <span className="text-cyan-200">{tc.actual}</span>
                          </div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-lg font-mono font-bold text-xs ${
                            tc.passed
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border border-red-500/40'
                          }`}
                        >
                          {tc.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              PAGE 8: ABOUT THE PROJECT / ACADEMIC AI DOCUMENTATION
          ================================================================ */}
          {activeNav === 'about' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3">
                <span className="text-xs font-mono text-cyan-400">AI FUNDAMENTALS CAPSTONE ARCHITECTURE</span>
                <h2 className="text-2xl font-bold text-white">Academic Mapping: Four AI Paradigms in ASTANA 2040</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  ASTANA 2040 — AI CITY BRAIN demonstrates how classical and probabilistic Artificial Intelligence methodologies cooperate within a real geographical OpenStreetMap digital twin of Astana, Kazakhstan (51.1283°N, 71.4306°E). All algorithms are implemented natively in TypeScript.
                </p>
              </div>

              <div className="overflow-x-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-cyan-300">
                      <th className="py-3 px-3">AI Topic</th>
                      <th className="py-3 px-3">Percepts / Input</th>
                      <th className="py-3 px-3">Implemented Algorithm</th>
                      <th className="py-3 px-3">Output / Action</th>
                      <th className="py-3 px-3">Verification Test</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr>
                      <td className="py-3 px-3 font-bold text-white">Week 1: Intelligent Agents</td>
                      <td className="py-3 px-3">Signal state, directional vehicle queues, OSM road closures, emergency sirens</td>
                      <td className="py-3 px-3 font-mono text-cyan-200">PERCEIVE → ANALYZE → DECIDE → ACT Reflex & Utility Agents</td>
                      <td className="py-3 px-3">Vehicle braking/rerouting along street polylines; adaptive green extension</td>
                      <td className="py-3 px-3 font-mono">AGT-01, AGT-02, AGT-03</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-bold text-white">Week 2: A* Search</td>
                      <td className="py-3 px-3">Real Astana OSM topological graph, live density, weather speed factor</td>
                      <td className="py-3 px-3 font-mono text-cyan-200">f(n) = g(n) + h(n) with admissible Haversine GPS heuristic</td>
                      <td className="py-3 px-3">Minimum travel-time street polyline avoiding closed & congested roads</td>
                      <td className="py-3 px-3 font-mono">AST-01, AST-02, AST-03</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-bold text-white">Week 3: Constraint Satisfaction (CSP)</td>
                      <td className="py-3 px-3">Active GPS incidents, team skills, availability, capacity, A* ETAs</td>
                      <td className="py-3 px-3 font-mono text-violet-200">Backtracking Search + MRV + Forward Checking</td>
                      <td className="py-3 px-3">Conflict-free optimal municipal response team assignments</td>
                      <td className="py-3 px-3 font-mono">CSP-01, CSP-02, CSP-03</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-bold text-white">Week 6: Bayesian Networks</td>
                      <td className="py-3 px-3">Rush hour, weather, traffic demand, road closures, team availability</td>
                      <td className="py-3 px-3 font-mono text-violet-200">Noisy-OR Causal Model + Exact Marginal Enumeration</td>
                      <td className="py-3 px-3">Posterior P(Congestion) & P(Emergency Delay) geospatial risk zones</td>
                      <td className="py-3 px-3 font-mono">BAY-01, BAY-02, BAY-03</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}