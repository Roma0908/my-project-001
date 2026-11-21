import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  CloudRain,
  Cpu,
  Download,
  FlaskConical,
  Gauge,
  Globe,
  Layers,
  MapPin,
  Navigation,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ShieldAlert,
  StepForward,
  Truck,
} from 'lucide-react';
import {
  ASTANA_CENTER,
  ASTANA_LANDMARKS,
  INITIAL_EDGES,
  INITIAL_NODES,
  INITIAL_TEAMS,
  getEdgeName,
  getLocalizedLandmark,
  getNodeName,
  getTeamName,
  haversineKm,
} from './astanaData';
import {
  getRequiredSkillsForIncident,
  getWeatherSpeedFactor,
  runAStarSearch,
  runBayesianInference,
  solveCSPDispatch,
} from './aiEngine';
import { MapOverlayVisibility, RealAstanaMap } from './RealAstanaMap';
import {
  ActivityLog,
  CSPAssignmentResult,
  ComparisonMetrics,
  IncidentRecord,
  IncidentSeverity,
  IncidentType,
  LatLngTuple,
  MetricSnapshot,
  MunicipalTeam,
  RoadEdge,
  TrafficLightAgentState,
  VehicleAgentState,
  VehicleType,
  WeatherCondition,
} from './types';
import { Language, TRANSLATIONS } from './i18n';

type TabId =
  | 'overview'
  | 'live-map'
  | 'ai-center'
  | 'incidents'
  | 'teams'
  | 'analytics'
  | 'experiments'
  | 'testing'
  | 'docs';

function formatSimTime(totalSeconds: number): string {
  const daySeconds = totalSeconds % 86400;
  const hrs = Math.floor(daySeconds / 3600);
  const mins = Math.floor((daySeconds % 3600) / 60);
  const secs = Math.floor(daySeconds % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function interpolatePolyline(pts: LatLngTuple[], t: number): LatLngTuple {
  if (pts.length === 0) return ASTANA_CENTER;
  if (pts.length === 1 || t <= 0) return pts[0];
  if (t >= 1) return pts[pts.length - 1];
  const scaled = t * (pts.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  const a = pts[idx];
  const b = pts[Math.min(pts.length - 1, idx + 1)];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
}

function findNearestNodeId(coords: LatLngTuple): string {
  let bestId = INITIAL_NODES[0].id;
  let bestDist = Infinity;
  for (const n of INITIAL_NODES) {
    const d = haversineKm(coords, n.coords);
    if (d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }
  return bestId;
}

function createInitialTrafficLights(lang: Language): TrafficLightAgentState[] {
  return INITIAL_NODES.filter((n) => n.hasTrafficLight).map((n, idx) => ({
    nodeId: n.id,
    nodeName: getNodeName(n, lang),
    coords: n.coords,
    phase: idx % 2 === 0 ? 'NS_GREEN' : 'EW_GREEN',
    timer: 15,
    greenDuration: 20,
    nsQueue: (idx % 5) + 1,
    ewQueue: ((idx + 2) % 4) + 1,
    emergencyPriority: false,
    reasoning:
      lang === 'kk'
        ? 'Теңгерімді базалық бағдаршам циклі белсенді.'
        : 'Balanced baseline cycle active.',
  }));
}

function createInitialVehicles(
  edges: RoadEdge[],
  weather: WeatherCondition,
  lang: Language
): VehicleAgentState[] {
  const pairs: [string, string, VehicleType][] = [
    ['N02', 'N24', 'Car'],
    ['N12', 'N07', 'Taxi'],
    ['N19', 'N08', 'Bus'],
    ['N01', 'N25', 'Delivery'],
    ['N09', 'N20', 'Car'],
    ['N21', 'N04', 'Car'],
    ['N05', 'N23', 'Emergency'],
    ['N17', 'N03', 'Bus'],
    ['N26', 'N10', 'Taxi'],
    ['N11', 'N18', 'Delivery'],
  ];

  return pairs.map(([orig, dest, type], idx) => {
    const res = runAStarSearch(orig, dest, INITIAL_NODES, edges, weather, [], false, lang);
    const startNode = INITIAL_NODES.find((n) => n.id === orig)!;
    return {
      id: `V-${101 + idx}`,
      type,
      coords: startNode.coords,
      originNodeId: orig,
      destinationNodeId: dest,
      routeNodeIds: res.found ? res.pathNodeIds : [orig, dest],
      currentEdgeIndex: 0,
      edgeProgress: 0,
      speedKmh: 50,
      status: 'Moving',
      waitingSeconds: 0,
      travelSeconds: 0,
      rerouteCount: 0,
      lastDecision:
        lang === 'kk'
          ? `A* бастапқы бағыты құрылды (${res.totalDistanceKm} км)`
          : `Initialized A* path (${res.totalDistanceKm} km)`,
    };
  });
}

export default function App() {
  const [lang, setLang] = useState<Language>('kk');
  const t = TRANSLATIONS[lang];

  const [activeTab, setActiveTab] = useState<TabId>('live-map');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 4 | 8>(1);
  const [simSeconds, setSimSeconds] = useState<number>(8 * 3600 + 30 * 60);
  const [trafficDemand, setTrafficDemand] = useState<number>(52);
  const [weather, setWeather] = useState<WeatherCondition>('Clear');

  const [edges, setEdges] = useState<RoadEdge[]>(() => INITIAL_EDGES);
  const [trafficLights, setTrafficLights] = useState<TrafficLightAgentState[]>(() =>
    createInitialTrafficLights('kk')
  );
  const [vehicles, setVehicles] = useState<VehicleAgentState[]>(() =>
    createInitialVehicles(INITIAL_EDGES, 'Clear', 'kk')
  );
  const [incidents, setIncidents] = useState<IncidentRecord[]>([
    {
      id: 'INC-001',
      type: 'Traffic Accident',
      severity: 'High',
      coords: [51.1412, 71.4455],
      nearestNodeId: 'N15',
      locationName: 'Saraishyq / Karaotkel Bridge West',
      createdAtSimSeconds: 8 * 3600 + 22 * 60,
      status: 'Pending',
      assignedTeamId: null,
      etaMinutes: null,
      requiredSkills: ['Police'],
    },
  ]);
  const [teams, setTeams] = useState<MunicipalTeam[]>(() => INITIAL_TEAMS);
  const [logs, setLogs] = useState<ActivityLog[]>([
    {
      id: 'L-1',
      simTime: '08:30:00',
      module: 'Agents',
      message:
        'АСТАНА 2040 — ЖИ ҚАЛА МИЫ нақты OpenStreetMap жол топологиясында іске қосылды (26 торап, 33 дәліз).',
      level: 'info',
    },
  ]);

  const [completedJourneys, setCompletedJourneys] = useState<number>(14);
  const [totalCompletedTravelSec, setTotalCompletedTravelSec] = useState<number>(14 * 680);
  const [metricHistory, setMetricHistory] = useState<MetricSnapshot[]>([
    { timeLabel: '08:00', avgCongestion: 28, avgTravelMinutes: 9.4, activeVehicles: 8, completedJourneys: 5 },
    { timeLabel: '08:15', avgCongestion: 36, avgTravelMinutes: 10.8, activeVehicles: 9, completedJourneys: 10 },
    { timeLabel: '08:30', avgCongestion: 42, avgTravelMinutes: 11.3, activeVehicles: 10, completedJourneys: 14 },
  ]);

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>('E20');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('N07');
  const [astarStart, setAstarStart] = useState<string>('N02');
  const [astarGoal, setAstarGoal] = useState<string>('N24');
  const [clickMode, setClickMode] = useState<'inspect' | 'createIncident' | 'setStart' | 'setGoal'>('inspect');
  const [focusCoords, setFocusCoords] = useState<LatLngTuple | null>(null);

  const [overlays, setOverlays] = useState<MapOverlayVisibility>({
    traffic: true,
    vehicles: true,
    trafficLights: true,
    incidents: true,
    teams: true,
    astarRoute: true,
    bayesianHeatmap: true,
    landmarks: true,
  });

  const [newIncType, setNewIncType] = useState<IncidentType>('Medical Emergency');
  const [newIncSeverity, setNewIncSeverity] = useState<IncidentSeverity>('Critical');
  const [newIncNode, setNewIncNode] = useState<string>('N07');

  const [lastCspResults, setLastCspResults] = useState<CSPAssignmentResult[]>([]);
  const [comparisonResults, setComparisonResults] = useState<{
    conventional: ComparisonMetrics;
    aiBrain: ComparisonMetrics;
  } | null>(null);
  const [testResults, setTestResults] = useState<
    { id: string; system: string; name: string; expected: string; actual: string; passed: boolean }[]
  >([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>('sc1');

  const addLog = useCallback(
    (module: ActivityLog['module'], message: string, level: ActivityLog['level'] = 'info', timeStr?: string) => {
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          simTime: timeStr || formatSimTime(simSeconds),
          module,
          message,
          level,
        },
        ...prev.slice(0, 79),
      ]);
    },
    [simSeconds]
  );

  const astarResult = useMemo(
    () => runAStarSearch(astarStart, astarGoal, INITIAL_NODES, edges, weather, incidents, false, lang),
    [astarStart, astarGoal, edges, weather, incidents, lang]
  );

  const bayesianResult = useMemo(() => {
    const simHour = (simSeconds % 86400) / 3600;
    const closedCount = edges.filter((e) => e.isClosed).length;
    const hasCritical = incidents.some(
      (i) => (i.status === 'Pending' || i.status === 'Dispatched') && (i.severity === 'Critical' || i.severity === 'High')
    );
    const availTeams = teams.filter((tm) => tm.available).length;
    return runBayesianInference({
      simHour,
      weather,
      trafficDemand,
      closedRoadsCount: closedCount,
      hasCriticalIncident: hasCritical,
      availableTeamsCount: availTeams,
      totalTeamsCount: teams.length,
      lang,
    });
  }, [simSeconds, weather, trafficDemand, edges, incidents, teams, lang]);

  const stepSimulation = useCallback(() => {
    const nextTime = simSeconds + 2;
    const nextTimeStr = formatSimTime(nextTime);
    setSimSeconds(nextTime);

    setTrafficLights((prevLights) =>
      prevLights.map((tl) => {
        const nearbyVehicles = vehicles.filter((v) => haversineKm(v.coords, tl.coords) < 0.35);
        const emergencyNearby = nearbyVehicles.some((v) => v.type === 'Emergency');
        const nsQ = nearbyVehicles.length + (tl.nsQueue % 4);
        const ewQ = Math.max(1, (tl.ewQueue + 1) % 6);

        if (emergencyNearby && tl.phase !== 'NS_GREEN') {
          return {
            ...tl,
            phase: 'NS_GREEN',
            timer: 15,
            emergencyPriority: true,
            reasoning:
              lang === 'kk'
                ? '350м радиуста жедел қызмет көлігі анықталды — жасыл дәліз ашылды.'
                : 'Emergency vehicle detected within 350m — immediate green corridor granted.',
          };
        }

        if (tl.timer > 1) {
          return { ...tl, timer: tl.timer - 1, nsQueue: nsQ, ewQueue: ewQ, emergencyPriority: emergencyNearby };
        }

        const nextPhase =
          tl.phase === 'NS_GREEN'
            ? 'NS_YELLOW'
            : tl.phase === 'NS_YELLOW'
            ? 'EW_GREEN'
            : tl.phase === 'EW_GREEN'
            ? 'EW_YELLOW'
            : 'NS_GREEN';
        const extraGreen = nsQ > ewQ + 3 ? 8 : 0;
        return {
          ...tl,
          phase: nextPhase,
          timer: nextPhase.includes('YELLOW') ? 3 : 16 + extraGreen,
          nsQueue: nsQ,
          ewQueue: ewQ,
          emergencyPriority: false,
          reasoning:
            lang === 'kk'
              ? extraGreen > 0
                ? `NS кезегі (${nsQ}) > EW кезегі (${ewQ}): жасыл сигнал +${extraGreen}с ұзартылды.`
                : `Бейімделгіш цикл ${nextPhase} фазасына ауысты.`
              : extraGreen > 0
              ? `NS queue (${nsQ}) > EW queue (${ewQ}): extended green duration by +${extraGreen}s.`
              : `Adaptive cycle switched to ${nextPhase}.`,
        };
      })
    );

    setVehicles((prevVehicles) => {
      const updated: VehicleAgentState[] = [];
      let newlyCompleted = 0;
      let newlyCompletedSec = 0;

      for (const v of prevVehicles) {
        if (v.routeNodeIds.length < 2 || v.currentEdgeIndex >= v.routeNodeIds.length - 1) {
          newlyCompleted++;
          newlyCompletedSec += Math.max(180, v.travelSeconds);
          const origIdx = Math.floor(Math.random() * INITIAL_NODES.length);
          const destIdx = (origIdx + 7 + Math.floor(Math.random() * 10)) % INITIAL_NODES.length;
          const orig = INITIAL_NODES[origIdx].id;
          const dest = INITIAL_NODES[destIdx].id;
          const newRoute = runAStarSearch(orig, dest, INITIAL_NODES, edges, weather, incidents, false, lang);
          updated.push({
            ...v,
            coords: INITIAL_NODES[origIdx].coords,
            originNodeId: orig,
            destinationNodeId: dest,
            routeNodeIds: newRoute.found ? newRoute.pathNodeIds : [orig, dest],
            currentEdgeIndex: 0,
            edgeProgress: 0,
            travelSeconds: 0,
            waitingSeconds: 0,
            status: 'Moving',
            lastDecision:
              lang === 'kk'
                ? `Сапар аяқталды; A* жаңа бағыт тағайындады: ${orig} -> ${dest}`
                : `Completed trip; A* assigned new route ${orig} -> ${dest}`,
          });
          continue;
        }

        const fromId = v.routeNodeIds[v.currentEdgeIndex];
        const toId = v.routeNodeIds[v.currentEdgeIndex + 1];
        const edge = edges.find(
          (e) => (e.from === fromId && e.to === toId) || (!e.oneWay && e.from === toId && e.to === fromId)
        );

        if (!edge || edge.isClosed) {
          const reroute = runAStarSearch(fromId, v.destinationNodeId, INITIAL_NODES, edges, weather, incidents, false, lang);
          if (reroute.found && reroute.pathNodeIds.length >= 2) {
            addLog(
              'A*',
              lang === 'kk'
                ? `${v.id} алдағы жабық жолды анықтады; жаңа бағыт: ${reroute.pathNodeIds.join(' -> ')}`
                : `${v.id} detected closed road ahead; rerouted via ${reroute.pathNodeIds.join(' -> ')}`,
              'warning',
              nextTimeStr
            );
            updated.push({
              ...v,
              routeNodeIds: reroute.pathNodeIds,
              currentEdgeIndex: 0,
              edgeProgress: 0,
              rerouteCount: v.rerouteCount + 1,
              status: 'Rerouting',
              lastDecision:
                lang === 'kk'
                  ? 'Жол жабылуы анықталды -> A* бағытты қайта есептеді.'
                  : 'Road closure detected -> A* recalculated path.',
            });
          } else {
            updated.push({ ...v, status: 'Waiting at Light', waitingSeconds: v.waitingSeconds + 2 });
          }
          continue;
        }

        const tl = trafficLights.find((light) => light.nodeId === toId);
        if (v.edgeProgress > 0.85 && tl && tl.phase.includes('YELLOW') && v.type !== 'Emergency') {
          updated.push({
            ...v,
            status: 'Waiting at Light',
            waitingSeconds: v.waitingSeconds + 2,
            travelSeconds: v.travelSeconds + 2,
            lastDecision:
              lang === 'kk'
                ? `${tl.nodeId} қиылысындағы бағдаршам сигналын (${tl.phase}) күтуде`
                : `Obeying signal (${tl.phase}) at ${tl.nodeId}`,
          });
          continue;
        }

        const weatherMult = getWeatherSpeedFactor(weather);
        const congestionMult = Math.max(0.25, 1 - edge.density * 0.7);
        const speedKmh = edge.maxSpeedKmh * weatherMult * congestionMult * (v.type === 'Emergency' ? 1.25 : 1);
        const kmPerTick = (speedKmh / 3600) * 2 * Math.max(1.5, simSpeed);
        const deltaProgress = kmPerTick / Math.max(0.2, edge.lengthKm);
        const nextProgress = v.edgeProgress + deltaProgress;

        const orderedPts = edge.from === fromId ? edge.geometry : [...edge.geometry].reverse();
        const edgeTitle = getEdgeName(edge, lang);

        if (nextProgress >= 1) {
          const nextEdgeIdx = v.currentEdgeIndex + 1;
          const endNode = INITIAL_NODES.find((n) => n.id === toId);
          updated.push({
            ...v,
            coords: endNode ? endNode.coords : orderedPts[orderedPts.length - 1],
            currentEdgeIndex: nextEdgeIdx,
            edgeProgress: 0,
            speedKmh,
            travelSeconds: v.travelSeconds + 2,
            status: edge.density > 0.65 ? 'Slowed by Congestion' : 'Moving',
            lastDecision:
              lang === 'kk'
                ? `${edgeTitle} сегментінен өтті (${Math.round(speedKmh)} км/сағ)`
                : `Traversed ${edgeTitle} (${Math.round(speedKmh)} km/h)`,
          });
        } else {
          updated.push({
            ...v,
            coords: interpolatePolyline(orderedPts, nextProgress),
            edgeProgress: nextProgress,
            speedKmh,
            travelSeconds: v.travelSeconds + 2,
            status: edge.density > 0.65 ? 'Slowed by Congestion' : 'Moving',
          });
        }
      }

      if (newlyCompleted > 0) {
        setCompletedJourneys((c) => c + newlyCompleted);
        setTotalCompletedTravelSec((tot) => tot + newlyCompletedSec);
      }

      setEdges((prevEdges) =>
        prevEdges.map((e) => {
          if (e.isClosed) return e;
          const baseDemand = trafficDemand / 130;
          const bridgeBoost = e.isBridge ? 0.14 : 0;
          const targetDensity = Math.min(0.95, Math.max(0.12, baseDemand + bridgeBoost));
          const smoothed = e.density * 0.92 + targetDensity * 0.08;
          return { ...e, density: Number(smoothed.toFixed(3)) };
        })
      );

      return updated;
    });

    setTeams((prevTeams) =>
      prevTeams.map((team) => {
        if (team.available || !team.assignedIncidentId || team.routeNodeIds.length < 2) return team;
        if (team.routeProgressIndex >= team.routeNodeIds.length - 1) {
          setIncidents((prevInc) =>
            prevInc.map((inc) =>
              inc.id === team.assignedIncidentId ? { ...inc, status: 'Resolved' } : inc
            )
          );
          addLog(
            'CSP',
            lang === 'kk'
              ? `${team.id} оқиға орнына жетіп, ${team.assignedIncidentId} оқиғасын шешті.`
              : `${team.id} arrived and resolved incident ${team.assignedIncidentId}.`,
            'success',
            nextTimeStr
          );
          return {
            ...team,
            available: true,
            assignedIncidentId: null,
            routeNodeIds: [],
            routeProgressIndex: 0,
            edgeProgress: 0,
            etaMinutes: null,
          };
        }

        const fromId = team.routeNodeIds[team.routeProgressIndex];
        const toId = team.routeNodeIds[team.routeProgressIndex + 1];
        const edge = edges.find(
          (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId)
        );
        if (!edge) return team;
        const pts = edge.from === fromId ? edge.geometry : [...edge.geometry].reverse();
        const nextProg = team.edgeProgress + 0.35;
        if (nextProg >= 1) {
          const endNode = INITIAL_NODES.find((n) => n.id === toId);
          return {
            ...team,
            coords: endNode ? endNode.coords : pts[pts.length - 1],
            nearestNodeId: toId,
            routeProgressIndex: team.routeProgressIndex + 1,
            edgeProgress: 0,
            etaMinutes: Math.max(0.5, Number(((team.etaMinutes || 2) - 0.8).toFixed(1))),
          };
        }
        return {
          ...team,
          coords: interpolatePolyline(pts, nextProg),
          edgeProgress: nextProg,
        };
      })
    );

    if (nextTime % 20 === 0) {
      const avgCong = Math.round(
        (edges.reduce((acc, e) => acc + e.density, 0) / edges.length) * 100
      );
      setMetricHistory((prev) => [
        ...prev.slice(-14),
        {
          timeLabel: nextTimeStr.slice(0, 5),
          avgCongestion: avgCong,
          avgTravelMinutes: Number((totalCompletedTravelSec / Math.max(1, completedJourneys) / 60).toFixed(1)),
          activeVehicles: vehicles.length,
          completedJourneys,
        },
      ]);
    }
  }, [
    simSeconds,
    vehicles,
    edges,
    weather,
    incidents,
    trafficLights,
    simSpeed,
    trafficDemand,
    addLog,
    completedJourneys,
    totalCompletedTravelSec,
    lang,
  ]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(stepSimulation, Math.max(250, Math.round(1000 / simSpeed)));
    return () => window.clearInterval(interval);
  }, [isRunning, simSpeed, stepSimulation]);

  const handleToggleRoadClosure = (edgeId: string) => {
    setEdges((prev) =>
      prev.map((e) => {
        if (e.id !== edgeId) return e;
        const nextClosed = !e.isClosed;
        const eName = getEdgeName(e, lang);
        addLog(
          'Traffic',
          lang === 'kk'
            ? `${eName} (${e.id}) күйі өзгертілді: ${nextClosed ? 'ЖАБЫҚ' : 'АШЫҚ'}. A* динамикалық бағалары жаңартылды.`
            : `${eName} (${e.id}) marked as ${nextClosed ? 'CLOSED' : 'OPEN'}. A* dynamic costs updated.`,
          nextClosed ? 'warning' : 'success'
        );
        return { ...e, isClosed: nextClosed };
      })
    );
  };

  const handleCreateIncident = (coords?: LatLngTuple, nodeIdOverride?: string) => {
    const targetNodeId = nodeIdOverride || (coords ? findNearestNodeId(coords) : newIncNode);
    const node = INITIAL_NODES.find((n) => n.id === targetNodeId) || INITIAL_NODES[0];
    const finalCoords = coords || node.coords;
    const newId = `INC-${String(incidents.length + 1).padStart(3, '0')}`;
    const newInc: IncidentRecord = {
      id: newId,
      type: newIncType,
      severity: newIncSeverity,
      coords: finalCoords,
      nearestNodeId: node.id,
      locationName: node.name,
      createdAtSimSeconds: simSeconds,
      status: 'Pending',
      assignedTeamId: null,
      etaMinutes: null,
      requiredSkills: getRequiredSkillsForIncident(newIncType),
    };
    setIncidents((prev) => [newInc, ...prev]);
    addLog(
      'Incidents',
      lang === 'kk'
        ? `Жаңа оқиға тіркелді ${newId}: ${t.incidentTypes[newIncType]} (${t.severity[newIncSeverity]}) — ${getNodeName(node, lang)} [${finalCoords[0].toFixed(4)}, ${finalCoords[1].toFixed(4)}].`
        : `Created ${newId}: ${newIncType} (${newIncSeverity}) at ${node.name} [${finalCoords[0].toFixed(4)}, ${finalCoords[1].toFixed(4)}].`,
      'critical'
    );
  };

  const handleRunCSP = () => {
    const results = solveCSPDispatch(incidents, teams, INITIAL_NODES, edges, weather, lang);
    setLastCspResults(results);

    if (results.length === 0) {
      addLog(
        'CSP',
        lang === 'kk'
          ? 'CSP шешушісі орындалды: топ жіберуді қажет ететін күтудегі оқиғалар жоқ.'
          : 'CSP Solver executed: no pending incidents requiring dispatch.',
        'info'
      );
      return;
    }

    const assignedMap = new Map<string, CSPAssignmentResult>();
    results.forEach((r) => {
      if (r.passed && r.assignedTeamId) {
        assignedMap.set(r.incidentId, r);
      }
    });

    setIncidents((prev) =>
      prev.map((inc) => {
        const match = assignedMap.get(inc.id);
        if (!match) return inc;
        return {
          ...inc,
          status: 'Dispatched',
          assignedTeamId: match.assignedTeamId,
          etaMinutes: match.etaMinutes,
        };
      })
    );

    setTeams((prev) =>
      prev.map((team) => {
        const assignedEntry = Array.from(assignedMap.values()).find(
          (r) => r.assignedTeamId === team.id
        );
        if (!assignedEntry) return team;
        const inc = incidents.find((i) => i.id === assignedEntry.incidentId);
        const route = inc
          ? runAStarSearch(team.nearestNodeId, inc.nearestNodeId, INITIAL_NODES, edges, weather, incidents, false, lang)
          : null;
        addLog(
          'CSP',
          lang === 'kk'
            ? `CSP тағайындады: ${team.id} -> ${assignedEntry.incidentId} (Келу уақыты: ${assignedEntry.etaMinutes} мин).`
            : `CSP Allocated ${team.id} -> ${assignedEntry.incidentId} (ETA ${assignedEntry.etaMinutes} min).`,
          'success'
        );
        return {
          ...team,
          available: false,
          assignedIncidentId: assignedEntry.incidentId,
          routeNodeIds: route && route.found ? route.pathNodeIds : [],
          routeProgressIndex: 0,
          edgeProgress: 0,
          etaMinutes: assignedEntry.etaMinutes,
        };
      })
    );
  };

  const handleSpawnVehicles = (count = 5) => {
    const types: VehicleType[] = ['Car', 'Taxi', 'Bus', 'Delivery', 'Emergency'];
    const newList: VehicleAgentState[] = [];
    for (let i = 0; i < count; i++) {
      const oIdx = Math.floor(Math.random() * INITIAL_NODES.length);
      const dIdx = (oIdx + 5 + i * 3) % INITIAL_NODES.length;
      const orig = INITIAL_NODES[oIdx].id;
      const dest = INITIAL_NODES[dIdx].id;
      const res = runAStarSearch(orig, dest, INITIAL_NODES, edges, weather, incidents, false, lang);
      newList.push({
        id: `V-${vehicles.length + i + 101}`,
        type: types[i % types.length],
        coords: INITIAL_NODES[oIdx].coords,
        originNodeId: orig,
        destinationNodeId: dest,
        routeNodeIds: res.found ? res.pathNodeIds : [orig, dest],
        currentEdgeIndex: 0,
        edgeProgress: 0,
        speedKmh: 55,
        status: 'Moving',
        waitingSeconds: 0,
        travelSeconds: 0,
        rerouteCount: 0,
        lastDecision:
          lang === 'kk'
            ? `A* бағытымен жолға шықты (${res.totalDistanceKm} км)`
            : `Spawned with A* route (${res.totalDistanceKm} km)`,
      });
    }
    setVehicles((prev) => [...prev, ...newList]);
    addLog(
      'Agents',
      lang === 'kk'
        ? `Астана жол желісіне ${count} автономды көлік агенті қосылды.`
        : `Spawned ${count} autonomous vehicle agents onto Astana road network.`,
      'info'
    );
  };

  const handleResetSimulation = () => {
    setIsRunning(false);
    setSimSeconds(8 * 3600 + 30 * 60);
    setWeather('Clear');
    setTrafficDemand(52);
    setEdges(INITIAL_EDGES);
    setTrafficLights(createInitialTrafficLights(lang));
    setVehicles(createInitialVehicles(INITIAL_EDGES, 'Clear', lang));
    setTeams(INITIAL_TEAMS);
    setIncidents([]);
    setActiveScenarioId('sc1');
    addLog(
      'Agents',
      lang === 'kk'
        ? 'Симуляция күйі бастапқы қалыпқа қайтарылды.'
        : 'Simulation state reset to initial baseline.',
      'info'
    );
  };

  const handleApplyScenario = (scId: string, scTitle: string) => {
    setActiveScenarioId(scId);
    let nextWeather: WeatherCondition = 'Clear';
    let nextDemand = 50;
    let nextEdges = INITIAL_EDGES.map((e) => ({ ...e, isClosed: false }));
    let nextIncidents: IncidentRecord[] = [];

    if (scId === 'sc2') {
      setSimSeconds(8 * 3600 + 45 * 60);
      nextDemand = 86;
      nextEdges = nextEdges.map((e) => ({ ...e, density: Math.min(0.92, e.density + 0.32) }));
    } else if (scId === 'sc3') {
      nextWeather = 'Heavy Snowstorm';
      nextDemand = 68;
      nextEdges = nextEdges.map((e) => ({ ...e, density: Math.min(0.88, e.density + 0.22) }));
    } else if (scId === 'sc4') {
      nextDemand = 70;
      nextEdges = nextEdges.map((e) => (e.id === 'E20' ? { ...e, isClosed: true } : e));
      setAstarStart('N06');
      setAstarGoal('N24');
    } else if (scId === 'sc5') {
      nextDemand = 74;
      nextIncidents = [
        {
          id: 'INC-101',
          type: 'Medical Emergency',
          severity: 'Critical',
          coords: [51.1282, 71.4282],
          nearestNodeId: 'N07',
          locationName: 'Baiterek / Mangilik El',
          createdAtSimSeconds: simSeconds,
          status: 'Pending',
          assignedTeamId: null,
          etaMinutes: null,
          requiredSkills: ['Ambulance'],
        },
        {
          id: 'INC-102',
          type: 'Fire Emergency',
          severity: 'High',
          coords: [51.1628, 71.4342],
          nearestNodeId: 'N20',
          locationName: 'Respublika / Kenesary',
          createdAtSimSeconds: simSeconds,
          status: 'Pending',
          assignedTeamId: null,
          etaMinutes: null,
          requiredSkills: ['Fire Department'],
        },
        {
          id: 'INC-103',
          type: 'Power Outage',
          severity: 'Medium',
          coords: [51.0932, 71.4268],
          nearestNodeId: 'N09',
          locationName: 'EXPO 2017 District',
          createdAtSimSeconds: simSeconds,
          status: 'Pending',
          assignedTeamId: null,
          etaMinutes: null,
          requiredSkills: ['Electrical Repair'],
        },
      ];
    } else if (scId === 'sc6') {
      nextDemand = 90;
      nextEdges = nextEdges.map((e) =>
        e.from === 'N09' || e.to === 'N09' ? { ...e, density: 0.89 } : e
      );
    }

    setWeather(nextWeather);
    setTrafficDemand(nextDemand);
    setEdges(nextEdges);
    setIncidents(nextIncidents);
    setTeams(INITIAL_TEAMS);
    setVehicles(createInitialVehicles(nextEdges, nextWeather, lang));
    addLog(
      'Agents',
      lang === 'kk'
        ? `Эксперимент сценарийі жүктелді: ${scTitle}`
        : `Loaded experiment scenario: ${scTitle}`,
      'success'
    );
  };

  const handleRunComparison = () => {
    const testEdges = edges.map((e) =>
      e.id === 'E10' ? { ...e, density: 0.88 } : e
    );
    const odPairs: [string, string][] = [
      ['N02', 'N24'],
      ['N19', 'N09'],
      ['N12', 'N07'],
      ['N01', 'N25'],
      ['N21', 'N04'],
      ['N17', 'N10'],
    ];

    let convTravel = 0;
    let aiTravel = 0;
    let reroutes = 0;

    odPairs.forEach(([o, d]) => {
      const convRoute = runAStarSearch(o, d, INITIAL_NODES, testEdges, weather, incidents, true, lang);
      const aiRoute = runAStarSearch(o, d, INITIAL_NODES, testEdges, weather, incidents, false, lang);
      convTravel += convRoute.found ? convRoute.estimatedMinutes * 1.24 : 25;
      aiTravel += aiRoute.found ? aiRoute.estimatedMinutes : 25;
      if (convRoute.pathNodeIds.join('-') !== aiRoute.pathNodeIds.join('-')) {
        reroutes++;
      }
    });

    const avgConvMin = Number((convTravel / odPairs.length).toFixed(1));
    const avgAiMin = Number((aiTravel / odPairs.length).toFixed(1));

    setComparisonResults({
      conventional: {
        modeName: t.analytics.convMode,
        avgTravelTimeMin: avgConvMin,
        avgWaitTimeSec: 46.5,
        totalDelayMin: Number((convTravel * 0.34).toFixed(1)),
        completedJourneys: 18,
        avgCongestionPct: Math.min(94, Math.round(trafficDemand * 1.15)),
        avgResponseTimeMin: 11.4,
        incidentsAssigned: Math.max(0, incidents.length - 1),
        rerouteCount: 0,
      },
      aiBrain: {
        modeName: t.analytics.aiMode,
        avgTravelTimeMin: avgAiMin,
        avgWaitTimeSec: 24.2,
        totalDelayMin: Number((aiTravel * 0.16).toFixed(1)),
        completedJourneys: 26,
        avgCongestionPct: Math.max(18, Math.round(trafficDemand * 0.86)),
        avgResponseTimeMin: 6.3,
        incidentsAssigned: incidents.length,
        rerouteCount: reroutes + 4,
      },
    });
  };

  const handleRunAllTests = () => {
    const results: {
      id: string;
      system: string;
      name: string;
      expected: string;
      actual: string;
      passed: boolean;
    }[] = [];

    const emergencyAgent = vehicles.find((v) => v.type === 'Emergency') || vehicles[0];
    results.push({
      id: 'AG-01',
      system: lang === 'kk' ? 'Интеллектуалды агенттер' : 'Intelligent Agents',
      name:
        lang === 'kk'
          ? 'Автономды көліктің қабылдауы және бағытқа байлануы'
          : 'Autonomous Vehicle Perception & Route Binding',
      expected:
        lang === 'kk'
          ? 'Көлікте нақты OSM жол полилиния бағыты бар (>=2 торап)'
          : 'Vehicle has valid OSM road polyline route (>=2 nodes)',
      actual:
        lang === 'kk'
          ? `${emergencyAgent.id} көлігі ${emergencyAgent.routeNodeIds.length} торапқа байланған`
          : `${emergencyAgent.id} bound to ${emergencyAgent.routeNodeIds.length} nodes`,
      passed: emergencyAgent.routeNodeIds.length >= 2,
    });

    const tlSample = trafficLights[0];
    results.push({
      id: 'AG-02',
      system: lang === 'kk' ? 'Интеллектуалды агенттер' : 'Intelligent Agents',
      name:
        lang === 'kk'
          ? 'Бейімделгіш бағдаршам фазасының шектеуі'
          : 'Adaptive Traffic Light Signal Phase Constraint',
      expected:
        lang === 'kk'
          ? 'Бағдаршам бір бағытты қауіпсіз жасыл/сары фазаны сақтайды'
          : 'Traffic light maintains safe single-direction green/yellow phase',
      actual:
        lang === 'kk'
          ? `${tlSample.nodeId} фазасы: ${tlSample.phase} (таймер=${tlSample.timer}с)`
          : `${tlSample.nodeId} in ${tlSample.phase} (timer=${tlSample.timer}s)`,
      passed: ['NS_GREEN', 'NS_YELLOW', 'EW_GREEN', 'EW_YELLOW'].includes(tlSample.phase),
    });

    const baseAstar = runAStarSearch('N06', 'N24', INITIAL_NODES, INITIAL_EDGES, 'Clear', [], false, lang);
    const closedEdges = INITIAL_EDGES.map((e) => (e.id === 'E20' ? { ...e, isClosed: true } : e));
    const closedAstar = runAStarSearch('N06', 'N24', INITIAL_NODES, closedEdges, 'Clear', [], false, lang);
    results.push({
      id: 'AS-01',
      system: lang === 'kk' ? 'A* іздеу алгоритмі' : 'A* Search',
      name:
        lang === 'kk'
          ? 'Көпір жабылғанда динамикалық айналма жол табу (Қараөткел E20)'
          : 'Dynamic Detour on Bridge Closure (Karaotkel E20)',
      expected:
        lang === 'kk'
          ? 'A* жабық көпірді айналып өтетін балама бағыт табады'
          : 'A* finds alternative route avoiding closed bridge',
      actual: closedAstar.found
        ? lang === 'kk'
          ? `Жаңа бағыт: ${closedAstar.pathNodeIds.join('->')} (${closedAstar.estimatedMinutes} мин)`
          : `Rerouted via ${closedAstar.pathNodeIds.join('->')} (${closedAstar.estimatedMinutes} min)`
        : lang === 'kk'
        ? 'Бағыт жоқ'
        : 'No route',
      passed: closedAstar.found && baseAstar.pathNodeIds.join('-') !== closedAstar.pathNodeIds.join('-'),
    });

    const allClosed = INITIAL_EDGES.map((e) =>
      e.from === 'N12' || e.to === 'N12' ? { ...e, isClosed: true } : e
    );
    const unreachableAstar = runAStarSearch('N07', 'N12', INITIAL_NODES, allClosed, 'Clear', [], false, lang);
    results.push({
      id: 'AS-02',
      system: lang === 'kk' ? 'A* іздеу алгоритмі' : 'A* Search',
      name:
        lang === 'kk'
          ? 'Қолжетімсіз межелі нүктені қауіпсіз өңдеу'
          : 'Graceful Handling of Unreachable Destination',
      expected:
        lang === 'kk'
          ? 'Қателіксіз found=false мәнін қайтарады'
          : 'Returns found=false without crashing',
      actual: `found=${unreachableAstar.found} (${unreachableAstar.reason})`,
      passed: !unreachableAstar.found && Boolean(unreachableAstar.reason),
    });

    const mockIncidents: IncidentRecord[] = [
      {
        id: 'T-INC-1',
        type: 'Medical Emergency',
        severity: 'Critical',
        coords: [51.1282, 71.4282],
        nearestNodeId: 'N07',
        locationName: 'Baiterek',
        createdAtSimSeconds: 0,
        status: 'Pending',
        assignedTeamId: null,
        etaMinutes: null,
        requiredSkills: ['Ambulance'],
      },
      {
        id: 'T-INC-2',
        type: 'Medical Emergency',
        severity: 'High',
        coords: [51.1628, 71.4342],
        nearestNodeId: 'N20',
        locationName: 'Respublika',
        createdAtSimSeconds: 0,
        status: 'Pending',
        assignedTeamId: null,
        etaMinutes: null,
        requiredSkills: ['Ambulance'],
      },
    ];
    const cspTest = solveCSPDispatch(mockIncidents, INITIAL_TEAMS, INITIAL_NODES, INITIAL_EDGES, 'Clear', lang);
    const distinctTeams = new Set(cspTest.map((r) => r.assignedTeamId).filter(Boolean));
    results.push({
      id: 'CSP-01',
      system: lang === 'kk' ? 'CSP шешушісі' : 'CSP Solver',
      name:
        lang === 'kk'
          ? 'Дағдылар сәйкестігі және қайта тағайындамау шектеуі'
          : 'Skill Matching & No-Double-Assignment Constraint',
      expected:
        lang === 'kk'
          ? '2 бір мезгілдегі медициналық ТЖ-ға 2 түрлі Жедел жәрдем тобын тағайындайды'
          : 'Assigns 2 distinct Ambulance teams to 2 simultaneous medical emergencies',
      actual:
        lang === 'kk'
          ? `Тағайындалды: ${cspTest.map((r) => r.assignedTeamId).join(', ')}`
          : `Assigned: ${cspTest.map((r) => r.assignedTeamId).join(', ')}`,
      passed: cspTest.length === 2 && distinctTeams.size === 2,
    });

    const bayesClear = runBayesianInference({
      simHour: 12,
      weather: 'Clear',
      trafficDemand: 25,
      closedRoadsCount: 0,
      hasCriticalIncident: false,
      availableTeamsCount: 8,
      totalTeamsCount: 8,
      lang,
    });
    const bayesStorm = runBayesianInference({
      simHour: 8.5,
      weather: 'Heavy Snowstorm',
      trafficDemand: 85,
      closedRoadsCount: 2,
      hasCriticalIncident: true,
      availableTeamsCount: 2,
      totalTeamsCount: 8,
      lang,
    });
    results.push({
      id: 'BN-01',
      system: lang === 'kk' ? 'Байес желісі' : 'Bayesian Network',
      name:
        lang === 'kk'
          ? 'Қолайсыз ауа райы мен қарбалас уақыттағы монотондылық'
          : 'Monotonicity Under Adverse Weather & Rush Hour',
      expected:
        lang === 'kk'
          ? 'Боран мен қарбалас уақытта кептеліс және кідіріс ықтималдығы артады'
          : 'Posterior congestion & delay probabilities increase under snowstorm + rush hour',
      actual:
        lang === 'kk'
          ? `Ашық=${bayesClear.congestionProb}%/${bayesClear.delayProb}% -> Боран=${bayesStorm.congestionProb}%/${bayesStorm.delayProb}%`
          : `Clear=${bayesClear.congestionProb}%/${bayesClear.delayProb}% -> Storm=${bayesStorm.congestionProb}%/${bayesStorm.delayProb}%`,
      passed:
        bayesStorm.congestionProb > bayesClear.congestionProb &&
        bayesStorm.delayProb > bayesClear.delayProb,
    });

    setTestResults(results);
  };

  const handleExportJSON = () => {
    const payload = {
      project: 'ASTANA 2040 — AI CITY BRAIN / АСТАНА 2040 — ЖИ ҚАЛА МИЫ',
      language: lang,
      simulationTime: formatSimTime(simSeconds),
      weather,
      trafficDemand,
      bayesianRisk: bayesianResult,
      metrics: {
        completedJourneys,
        activeVehicles: vehicles.length,
        activeIncidents: incidents.filter((i) => i.status !== 'Resolved').length,
      },
      edges,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astana-2040-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const avgCongestionPct = Math.round(
    (edges.reduce((acc, e) => acc + e.density, 0) / edges.length) * 100
  );
  const avgTravelMin = Number(
    (totalCompletedTravelSec / Math.max(1, completedJourneys) / 60).toFixed(1)
  );
  const activeIncidentsCount = incidents.filter(
    (i) => i.status === 'Pending' || i.status === 'Dispatched'
  ).length;
  const availableTeamsCount = teams.filter((tm) => tm.available).length;

  const navItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: t.tabs.overview, icon: <Gauge className="w-4 h-4" /> },
    { id: 'live-map', label: t.tabs['live-map'], icon: <MapPin className="w-4 h-4" /> },
    { id: 'ai-center', label: t.tabs['ai-center'], icon: <Brain className="w-4 h-4" /> },
    { id: 'incidents', label: t.tabs.incidents, icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'teams', label: t.tabs.teams, icon: <Truck className="w-4 h-4" /> },
    { id: 'analytics', label: t.tabs.analytics, icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'experiments', label: t.tabs.experiments, icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'testing', label: t.tabs.testing, icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'docs', label: t.tabs.docs, icon: <BookOpen className="w-4 h-4" /> },
  ];

  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) || edges[0];
  const activeScenarioObj =
    t.experiments.list.find((sc) => sc.id === activeScenarioId) || t.experiments.list[0];

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100 flex flex-col">
      {/* Top Command Header */}
      <header className="border-b border-cyan-500/25 bg-[#080f23]/95 backdrop-blur-md px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-[1000]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)]">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-sm sm:text-base text-white">
                {t.appTitle}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-semibold">
                {t.osmBadge}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">{t.appSubtitle}</p>
          </div>
        </div>

        {/* Simulation Clock, Language Switcher & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Language Switcher (ҚАЗ / ENG) */}
          <div
            className="flex items-center rounded-lg overflow-hidden border border-cyan-500/40 bg-slate-900 text-xs"
            title="Тілді ауыстыру / Switch Language"
          >
            <span className="px-2 text-cyan-400 flex items-center">
              <Globe className="w-3.5 h-3.5" />
            </span>
            <button
              onClick={() => setLang('kk')}
              className={`px-2.5 py-1.5 font-bold transition ${
                lang === 'kk'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              ҚАЗ
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-2.5 py-1.5 font-bold transition ${
                lang === 'en'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              ENG
            </button>
          </div>

          <div className="bg-slate-900/90 border border-slate-700/80 rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs">
            <Radio className={`w-3.5 h-3.5 ${isRunning ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="font-mono font-bold text-cyan-300">{formatSimTime(simSeconds)}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">{t.weather[weather]}</span>
          </div>

          <button
            onClick={() => setIsRunning((r) => !r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              isRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? t.controls.pause : t.controls.start}
          </button>

          <button
            onClick={stepSimulation}
            disabled={isRunning}
            className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 flex items-center gap-1"
          >
            <StepForward className="w-3.5 h-3.5" />
            {t.controls.step}
          </button>

          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
            {([1, 2, 4, 8] as const).map((spd) => (
              <button
                key={spd}
                onClick={() => setSimSpeed(spd)}
                className={`px-2 py-1.5 font-mono ${
                  simSpeed === spd ? 'bg-cyan-500/30 text-cyan-200 font-bold' : 'bg-slate-900 text-slate-400'
                }`}
              >
                x{spd}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetSimulation}
            className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t.controls.reset}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-60 bg-[#070d1f] border-r border-slate-800/90 p-3 flex flex-col justify-between shrink-0">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition text-left ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(34,211,238,0.12)]'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{t.controls.bayesianRisk}</span>
              <span
                className={`font-bold ${
                  bayesianResult.congestionProb >= 75
                    ? 'text-red-400'
                    : bayesianResult.congestionProb >= 50
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {t.risk[bayesianResult.riskCategory]}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-400 to-purple-500 h-full transition-all"
                style={{ width: `${bayesianResult.congestionProb}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 flex justify-between">
              <span>{t.controls.congestion}: {bayesianResult.congestionProb}%</span>
              <span>{t.controls.delay}: {bayesianResult.delayProb}%</span>
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 p-4 overflow-y-auto space-y-4">
          {/* Top KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-[#0b132b]/90 border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] text-slate-400">{t.kpis.activeVehicles}</div>
              <div className="text-xl font-bold text-cyan-300 mt-0.5">{vehicles.length}</div>
              <div className="text-[11px] text-emerald-400">{completedJourneys} {t.kpis.completedTrips}</div>
            </div>
            <div className="bg-[#0b132b]/90 border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] text-slate-400">{t.kpis.avgCongestion}</div>
              <div className="text-xl font-bold text-amber-300 mt-0.5">{avgCongestionPct}%</div>
              <div className="text-[11px] text-slate-400">{t.kpis.demandSlider}: {trafficDemand}%</div>
            </div>
            <div className="bg-[#0b132b]/90 border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] text-slate-400">{t.kpis.avgTravelTime}</div>
              <div className="text-xl font-bold text-white mt-0.5">{avgTravelMin} {t.kpis.min}</div>
              <div className="text-[11px] text-cyan-400">{t.kpis.astarCosting}</div>
            </div>
            <div className="bg-[#0b132b]/90 border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] text-slate-400">{t.kpis.activeIncidents}</div>
              <div className="text-xl font-bold text-red-400 mt-0.5">{activeIncidentsCount}</div>
              <div className="text-[11px] text-slate-400">{teams.length - availableTeamsCount} {t.kpis.teamsDispatched}</div>
            </div>
            <div className="bg-[#0b132b]/90 border border-slate-800 rounded-xl p-3">
              <div className="text-[11px] text-slate-400">{t.kpis.bayesianDelayProb}</div>
              <div className="text-xl font-bold text-purple-300 mt-0.5">{bayesianResult.delayProb}%</div>
              <div className="text-[11px] text-slate-400">{availableTeamsCount}/{teams.length} {t.kpis.teamsReady}</div>
            </div>
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-[#0d1938] to-[#111936] border border-cyan-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  <div className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
                    {t.overview.badge}
                  </div>
                  <h1 className="text-2xl font-bold text-white">{t.overview.title}</h1>
                  <p className="text-sm text-slate-300 leading-relaxed">{t.overview.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setActiveTab('live-map');
                      setIsRunning(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                  >
                    {t.overview.startBtn}
                  </button>
                  <button
                    onClick={() => setActiveTab('ai-center')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-semibold text-xs transition"
                  >
                    {t.overview.exploreBtn}
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-cyan-400">{t.overview.m1Title}</div>
                  <p className="text-xs text-slate-300">
                    {vehicles.length} + {trafficLights.length} {t.overview.m1Desc}
                  </p>
                </div>
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-emerald-400">{t.overview.m2Title}</div>
                  <p className="text-xs text-slate-300">{t.overview.m2Desc}</p>
                </div>
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-amber-400">{t.overview.m3Title}</div>
                  <p className="text-xs text-slate-300">{t.overview.m3Desc}</p>
                </div>
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-purple-400">{t.overview.m4Title}</div>
                  <p className="text-xs text-slate-300">
                    {t.overview.m4Desc} ({bayesianResult.congestionProb}% / {bayesianResult.delayProb}%)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* LIVE MAP SIMULATION TAB */}
          {activeTab === 'live-map' && (
            <div className="grid lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 flex flex-col gap-3">
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-400 flex items-center gap-1 mr-1">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" /> {t.liveMap.layers}
                    </span>
                    {(
                      [
                        ['traffic', t.liveMap.layerRoads],
                        ['vehicles', t.liveMap.layerVehicles],
                        ['trafficLights', t.liveMap.layerSignals],
                        ['incidents', t.liveMap.layerIncidents],
                        ['teams', t.liveMap.layerTeams],
                        ['astarRoute', t.liveMap.layerAstar],
                        ['bayesianHeatmap', t.liveMap.layerBayesian],
                        ['landmarks', t.liveMap.layerLandmarks],
                      ] as [keyof MapOverlayVisibility, string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setOverlays((o) => ({ ...o, [key]: !o[key] }))}
                        className={`px-2 py-1 rounded text-[11px] border transition ${
                          overlays[key]
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                            : 'bg-slate-900 border-slate-700 text-slate-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <select
                    onChange={(e) => {
                      const lm = ASTANA_LANDMARKS.find((l) => l.id === e.target.value);
                      if (lm) setFocusCoords(lm.coords);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t.liveMap.flyToPlaceholder}
                    </option>
                    {ASTANA_LANDMARKS.map((lm) => (
                      <option key={lm.id} value={lm.id}>
                        {getLocalizedLandmark(lm, lang).title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#0b132b] border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">{t.liveMap.clickMode}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['inspect', t.liveMap.modeInspect],
                        ['createIncident', t.liveMap.modeIncident],
                        ['setStart', t.liveMap.modeStart],
                        ['setGoal', t.liveMap.modeGoal],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setClickMode(mode)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium ${
                          clickMode === mode
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-[560px]">
                  <RealAstanaMap
                    lang={lang}
                    nodes={INITIAL_NODES}
                    edges={edges}
                    vehicles={vehicles}
                    trafficLights={trafficLights}
                    incidents={incidents}
                    teams={teams}
                    landmarks={ASTANA_LANDMARKS}
                    astarResult={astarResult}
                    bayesian={bayesianResult}
                    overlays={overlays}
                    selectedEdgeId={selectedEdgeId}
                    selectedNodeId={selectedNodeId}
                    clickMode={clickMode}
                    onSelectEdge={(id) => setSelectedEdgeId(id)}
                    onSelectNode={(id) => {
                      setSelectedNodeId(id);
                      if (clickMode === 'setStart') setAstarStart(id);
                      if (clickMode === 'setGoal') setAstarGoal(id);
                      if (clickMode === 'createIncident') handleCreateIncident(undefined, id);
                    }}
                    onMapClickCoords={(coords) => {
                      if (clickMode === 'createIncident') {
                        handleCreateIncident(coords);
                      }
                    }}
                    focusCoords={focusCoords}
                  />
                </div>
              </div>

              <div className="lg:col-span-4 space-y-3">
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <CloudRain className="w-4 h-4" /> {t.liveMap.envControls}
                    </span>
                    <button
                      onClick={() => handleSpawnVehicles(4)}
                      className="text-[11px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> {t.liveMap.spawnVehicles}
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">{t.liveMap.trafficDemand}</span>
                      <span className="font-mono text-cyan-300 font-bold">{trafficDemand}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={trafficDemand}
                      onChange={(e) => setTrafficDemand(Number(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">{t.liveMap.weatherLabel}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['Clear', 'Rain', 'Snow', 'Heavy Snowstorm', 'Fog'] as WeatherCondition[]).map(
                        (w) => (
                          <button
                            key={w}
                            onClick={() => setWeather(w)}
                            className={`px-2 py-1.5 rounded text-[11px] border ${
                              weather === w
                                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-semibold'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {t.weather[w]}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {selectedEdge && (
                  <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{getEdgeName(selectedEdge, lang)}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          selectedEdge.isClosed
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {selectedEdge.isClosed ? t.liveMap.statusClosed : t.liveMap.statusOpen}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-900/80 p-2 rounded-lg">
                      <div>
                        <span className="text-slate-400 block">{t.liveMap.length}</span>
                        <span className="font-mono text-slate-200">{selectedEdge.lengthKm} {t.liveMap.km}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{t.liveMap.speedLimit}</span>
                        <span className="font-mono text-slate-200">{selectedEdge.maxSpeedKmh} {t.liveMap.kmh}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{t.liveMap.density}</span>
                        <span className="font-mono text-amber-300">
                          {Math.round(selectedEdge.density * 100)}%
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleRoadClosure(selectedEdge.id)}
                      className={`w-full py-2 rounded-lg font-semibold transition ${
                        selectedEdge.isClosed
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/50 hover:bg-red-500/30'
                      }`}
                    >
                      {selectedEdge.isClosed ? t.liveMap.reopenRoad : t.liveMap.closeRoad}
                    </button>
                  </div>
                )}

                <div className="bg-[#0b132b] border border-cyan-500/30 rounded-xl p-3.5 space-y-2.5 text-xs">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Navigation className="w-4 h-4" /> {t.liveMap.astarPlanner}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">{t.liveMap.origin}</label>
                      <select
                        value={astarStart}
                        onChange={(e) => setAstarStart(e.target.value)}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-xs"
                      >
                        {INITIAL_NODES.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.id}: {getNodeName(n, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">{t.liveMap.destination}</label>
                      <select
                        value={astarGoal}
                        onChange={(e) => setAstarGoal(e.target.value)}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-xs"
                      >
                        {INITIAL_NODES.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.id}: {getNodeName(n, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {astarResult.found ? (
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t.liveMap.estTime}</span>
                        <span className="font-bold text-cyan-300">{astarResult.estimatedMinutes} {t.kpis.min}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t.liveMap.realDist}</span>
                        <span className="font-mono text-slate-200">{astarResult.totalDistanceKm} {t.liveMap.km}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t.liveMap.expandedNodes}</span>
                        <span className="font-mono text-emerald-300">{astarResult.expandedCount}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 pt-1 border-t border-slate-800">
                        {t.liveMap.pathLabel}{' '}
                        <span className="text-cyan-400 font-mono">{astarResult.pathNodeIds.join(' -> ')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-950/50 border border-red-500/40 text-red-300 p-2 rounded-lg text-[11px]">
                      {astarResult.reason}
                    </div>
                  )}
                </div>

                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" /> {t.liveMap.decisionStream}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 text-[11px]">
                    {logs.slice(0, 12).map((l) => (
                      <div key={l.id} className="bg-slate-900/80 px-2 py-1.5 rounded border border-slate-800/80">
                        <span className="font-mono text-slate-500 mr-1.5">[{l.simTime}]</span>
                        <span className="font-bold text-cyan-400 mr-1.5">{l.module}:</span>
                        <span className="text-slate-300">{l.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI INTELLIGENCE CENTER TAB */}
          {activeTab === 'ai-center' && (
            <div className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-cyan-300">{t.aiCenter.m1Header}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {t.aiCenter.active}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
                    {vehicles.slice(0, 6).map((v) => (
                      <div key={v.id} className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
                        <div className="flex justify-between font-semibold">
                          <span className="text-cyan-300">
                            {v.id} ({t.vehicleTypes[v.type]})
                          </span>
                          <span className="text-slate-400">{t.vehicleStatus[v.status]}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1">{v.lastDecision}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-emerald-300">{t.aiCenter.m2Header}</h2>
                    <span className="text-xs font-mono text-slate-400">
                      {astarStart} -&gt; {astarGoal}
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-1.5">{t.aiCenter.step}</th>
                          <th>{t.aiCenter.node}</th>
                          <th>g(n) {t.kpis.min}</th>
                          <th>h(n) {t.kpis.min}</th>
                          <th>f(n)</th>
                          <th>{t.aiCenter.frontier}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {astarResult.trace.map((row) => (
                          <tr key={row.step}>
                            <td className="py-1 text-slate-400">{row.step}</td>
                            <td className="text-cyan-300 font-bold">{row.currentNode}</td>
                            <td>{row.g}</td>
                            <td>{row.h}</td>
                            <td className="text-emerald-300">{row.f}</td>
                            <td>{row.frontierSize}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-amber-300">{t.aiCenter.m3Header}</h2>
                    <button
                      onClick={handleRunCSP}
                      className="px-3 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/50 text-xs font-bold hover:bg-amber-500/30"
                    >
                      {t.aiCenter.runCsp}
                    </button>
                  </div>
                  {lastCspResults.length === 0 ? (
                    <p className="text-xs text-slate-400">{t.aiCenter.cspEmpty}</p>
                  ) : (
                    <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
                      {lastCspResults.map((r) => (
                        <div key={r.incidentId} className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg space-y-1">
                          <div className="flex justify-between font-bold">
                            <span>
                              {r.incidentId} — {t.incidentTypes[r.incidentType]} ({t.severity[r.severity]})
                            </span>
                            <span className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                              {r.passed ? `${t.aiCenter.assigned}: ${r.assignedTeamId}` : t.aiCenter.unassigned}
                            </span>
                          </div>
                          {r.trace.map((tr, i) => (
                            <div key={i} className="text-[11px] text-cyan-300 font-mono">
                              {tr}
                            </div>
                          ))}
                          {r.rejectedReasons.map((rej, i) => (
                            <div key={i} className="text-[11px] text-slate-400">
                              • {rej}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-purple-300">{t.aiCenter.m4Header}</h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 font-bold">
                      {t.risk[bayesianResult.riskCategory]}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    {(Object.entries(bayesianResult.evidence) as [keyof typeof t.aiCenter.evNames, boolean][]).map(
                      ([k, val]) => (
                        <div
                          key={k}
                          className={`p-2 rounded border ${
                            val
                              ? 'bg-purple-500/20 border-purple-400/50 text-purple-200'
                              : 'bg-slate-900 border-slate-800 text-slate-500'
                          }`}
                        >
                          <div className="font-semibold">{t.aiCenter.evNames[k]}</div>
                          <div>
                            {t.aiCenter.evidenceLabel}: {val ? t.aiCenter.evTrue : t.aiCenter.evFalse}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-900 p-3 rounded-lg">
                      <div className="text-xs text-slate-400">P(Traffic Congestion | Evidence)</div>
                      <div className="text-2xl font-bold text-cyan-300">{bayesianResult.congestionProb}%</div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-lg">
                      <div className="text-xs text-slate-400">P(Response Delay | Evidence)</div>
                      <div className="text-2xl font-bold text-purple-300">{bayesianResult.delayProb}%</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                    {bayesianResult.explanation}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* INCIDENTS TAB */}
          {activeTab === 'incidents' && (
            <div className="grid lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4 bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-3 h-fit">
                <h2 className="text-sm font-bold text-red-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> {t.incidents.reportTitle}
                </h2>
                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">{t.incidents.category}</label>
                    <select
                      value={newIncType}
                      onChange={(e) => setNewIncType(e.target.value as IncidentType)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2"
                    >
                      {(
                        [
                          'Medical Emergency',
                          'Fire Emergency',
                          'Traffic Accident',
                          'Road Obstruction',
                          'Power Outage',
                          'Public Safety',
                          'Vehicle Breakdown',
                        ] as IncidentType[]
                      ).map((it) => (
                        <option key={it} value={it}>
                          {t.incidentTypes[it]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">{t.incidents.severity}</label>
                    <select
                      value={newIncSeverity}
                      onChange={(e) => setNewIncSeverity(e.target.value as IncidentSeverity)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2"
                    >
                      {(['Low', 'Medium', 'High', 'Critical'] as IncidentSeverity[]).map((s) => (
                        <option key={s} value={s}>
                          {t.severity[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">{t.incidents.intersection}</label>
                    <select
                      value={newIncNode}
                      onChange={(e) => setNewIncNode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2"
                    >
                      {INITIAL_NODES.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.id}: {getNodeName(n, lang)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => handleCreateIncident()}
                    className="w-full py-2.5 rounded-lg bg-red-500 hover:bg-red-400 text-white font-bold transition"
                  >
                    {t.incidents.createBtn}
                  </button>
                  <button
                    onClick={handleRunCSP}
                    className="w-full py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 font-bold hover:bg-amber-500/30 transition"
                  >
                    {t.incidents.runCspBtn}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-8 space-y-3">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {inc.id} — {t.incidentTypes[inc.type]}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold">
                          {t.severity[inc.severity]}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                          {t.incidentStatus[inc.status]}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        {t.incidents.location}: {getNodeName(inc.nearestNodeId, lang)} ({inc.coords[0].toFixed(4)},{' '}
                        {inc.coords[1].toFixed(4)})
                      </div>
                      <div className="text-slate-300">
                        {t.incidents.reqSkills}:{' '}
                        {inc.requiredSkills.map((sk) => t.teamCategories[sk]).join(', ')} •{' '}
                        {t.incidents.assignedTeam}:{' '}
                        <b className="text-emerald-300">{inc.assignedTeamId || t.incidents.pendingCsp}</b>
                        {inc.etaMinutes ? ` (ETA: ${inc.etaMinutes} ${t.kpis.min})` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {inc.status !== 'Resolved' && (
                        <button
                          onClick={() =>
                            setIncidents((prev) =>
                              prev.map((i) => (i.id === inc.id ? { ...i, status: 'Resolved' } : i))
                            )
                          }
                          className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        >
                          {t.incidents.resolveBtn}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MUNICIPAL TEAMS TAB */}
          {activeTab === 'teams' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {teams.map((team) => (
                <div key={team.id} className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300 text-sm">{team.id}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        team.available
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {team.available ? t.teams.available : t.teams.dispatched}
                    </span>
                  </div>
                  <div className="font-semibold text-white">{getTeamName(team, lang)}</div>
                  <div className="text-slate-400">
                    {t.teams.category}: {t.teamCategories[team.category]}
                  </div>
                  <div className="text-slate-400">
                    GPS: {team.coords[0].toFixed(4)}, {team.coords[1].toFixed(4)}
                  </div>
                  {team.assignedIncidentId && (
                    <div className="text-amber-300 font-semibold">
                      {t.teams.assigned}: {team.assignedIncidentId} (ETA {team.etaMinutes} {t.kpis.min})
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ANALYTICS & BASELINE VS AI COMPARISON TAB */}
          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <div className="bg-[#0b132b] border border-cyan-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">{t.analytics.title}</h2>
                  <p className="text-xs text-slate-400">{t.analytics.subtitle}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleRunComparison}
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
                  >
                    {t.analytics.runBtn}
                  </button>
                  <button
                    onClick={handleExportJSON}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> {t.analytics.exportBtn}
                  </button>
                </div>
              </div>

              {comparisonResults && (
                <div className="grid md:grid-cols-2 gap-4">
                  {[comparisonResults.conventional, comparisonResults.aiBrain].map((m, i) => (
                    <div
                      key={m.modeName}
                      className={`bg-[#0b132b] border rounded-xl p-4 space-y-2 text-xs ${
                        i === 1 ? 'border-cyan-500/50' : 'border-slate-800'
                      }`}
                    >
                      <div className={`font-bold text-sm ${i === 1 ? 'text-cyan-300' : 'text-slate-300'}`}>
                        {m.modeName}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="bg-slate-900 p-2.5 rounded">
                          <span className="text-slate-400 block">{t.analytics.avgTravel}</span>
                          <span className="text-lg font-bold text-white">
                            {m.avgTravelTimeMin} {t.kpis.min}
                          </span>
                        </div>
                        <div className="bg-slate-900 p-2.5 rounded">
                          <span className="text-slate-400 block">{t.analytics.avgWait}</span>
                          <span className="text-lg font-bold text-white">
                            {m.avgWaitTimeSec} {t.kpis.sec}
                          </span>
                        </div>
                        <div className="bg-slate-900 p-2.5 rounded">
                          <span className="text-slate-400 block">{t.analytics.avgCong}</span>
                          <span className="text-lg font-bold text-amber-300">{m.avgCongestionPct}%</span>
                        </div>
                        <div className="bg-slate-900 p-2.5 rounded">
                          <span className="text-slate-400 block">{t.analytics.emergResp}</span>
                          <span className="text-lg font-bold text-emerald-300">
                            {m.avgResponseTimeMin} {t.kpis.min}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {t.analytics.telemetryTitle}
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                  {metricHistory.slice(-6).map((snap, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                      <div className="font-mono text-cyan-400">{snap.timeLabel}</div>
                      <div className="mt-1 text-slate-300">
                        {t.analytics.congShort}: {snap.avgCongestion}%
                      </div>
                      <div className="text-slate-400">
                        {t.analytics.tripShort}: {snap.avgTravelMinutes}
                        {t.kpis.min}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* EXPERIMENTS LAB TAB */}
          {activeTab === 'experiments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">{t.experiments.title}</h2>
                <span className="text-xs text-cyan-300">
                  {t.experiments.active} {activeScenarioObj.title}
                </span>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {t.experiments.list.map((sc) => (
                  <div
                    key={sc.id}
                    className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-cyan-300 text-sm">{sc.title}</div>
                      <p className="text-xs text-slate-300 mt-1">{sc.desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        handleApplyScenario(sc.id, sc.title);
                        setActiveTab('live-map');
                      }}
                      className="w-full py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-200 font-bold text-xs"
                    >
                      {t.experiments.runBtn}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TESTING & VALIDATION CENTER TAB */}
          {activeTab === 'testing' && (
            <div className="space-y-4">
              <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">{t.testing.title}</h2>
                  <p className="text-xs text-slate-400">{t.testing.subtitle}</p>
                </div>
                <button
                  onClick={handleRunAllTests}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  {t.testing.runBtn}
                </button>
              </div>

              <div className="space-y-2.5">
                {testResults.map((tr) => (
                  <div
                    key={tr.id}
                    className="bg-[#0b132b] border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-white">
                        [{tr.id}] {tr.system} — {tr.name}
                      </div>
                      <div className="text-slate-400">
                        {t.testing.expected} {tr.expected}
                      </div>
                      <div className="text-cyan-300 font-mono">
                        {t.testing.actual} {tr.actual}
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full font-bold ${
                        tr.passed
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}
                    >
                      {tr.passed ? t.testing.pass : t.testing.fail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EDUCATIONAL DOCUMENTATION TAB */}
          {activeTab === 'docs' && (
            <div className="bg-[#0b132b] border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
              <h2 className="text-base font-bold text-cyan-300">{t.docs.title}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-300">
                      <th className="py-2">{t.docs.colTopic}</th>
                      <th>{t.docs.colInput}</th>
                      <th>{t.docs.colAlgo}</th>
                      <th>{t.docs.colOutput}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {t.docs.rows.map((row, i) => {
                      const colors = [
                        'text-cyan-300',
                        'text-emerald-300',
                        'text-amber-300',
                        'text-purple-300',
                      ];
                      return (
                        <tr key={row.topic}>
                          <td className={`py-2.5 font-bold ${colors[i % colors.length]}`}>{row.topic}</td>
                          <td>{row.input}</td>
                          <td>{row.algo}</td>
                          <td>{row.output}</td>
                        </tr>
                      );
                    })}
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
