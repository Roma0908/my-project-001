import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  AStarResult,
  AstanaLandmark,
  BayesianInferenceResult,
  IncidentRecord,
  LatLngTuple,
  MunicipalTeam,
  RoadEdge,
  RoadNode,
  TrafficLightAgentState,
  VehicleAgentState,
} from './types';
import {
  ASTANA_CENTER,
  getEdgeName,
  getLocalizedLandmark,
  getNodeName,
  getTeamName,
} from './astanaData';
import { Language, TRANSLATIONS } from './i18n';

export interface MapOverlayVisibility {
  traffic: boolean;
  vehicles: boolean;
  trafficLights: boolean;
  incidents: boolean;
  teams: boolean;
  astarRoute: boolean;
  bayesianHeatmap: boolean;
  landmarks: boolean;
}

interface RealAstanaMapProps {
  lang: Language;
  nodes: RoadNode[];
  edges: RoadEdge[];
  vehicles: VehicleAgentState[];
  trafficLights: TrafficLightAgentState[];
  incidents: IncidentRecord[];
  teams: MunicipalTeam[];
  landmarks: AstanaLandmark[];
  astarResult: AStarResult | null;
  bayesian: BayesianInferenceResult;
  overlays: MapOverlayVisibility;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  clickMode: 'inspect' | 'createIncident' | 'setStart' | 'setGoal';
  onSelectEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onMapClickCoords: (coords: LatLngTuple) => void;
  focusCoords: LatLngTuple | null;
}

function getCongestionColor(edge: RoadEdge): string {
  if (edge.isClosed) return '#64748b';
  if (edge.density >= 0.78) return '#ef4444';
  if (edge.density >= 0.55) return '#f97316';
  if (edge.density >= 0.35) return '#eab308';
  return '#22c55e';
}

export const RealAstanaMap: React.FC<RealAstanaMapProps> = ({
  lang,
  nodes,
  edges,
  vehicles,
  trafficLights,
  incidents,
  teams,
  landmarks,
  astarResult,
  bayesian,
  overlays,
  selectedEdgeId,
  selectedNodeId,
  clickMode,
  onSelectEdge,
  onSelectNode,
  onMapClickCoords,
  focusCoords,
}) => {
  const t = TRANSLATIONS[lang];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    roads: L.LayerGroup;
    bayesian: L.LayerGroup;
    astar: L.LayerGroup;
    trafficLights: L.LayerGroup;
    vehicles: L.LayerGroup;
    incidents: L.LayerGroup;
    teams: L.LayerGroup;
    landmarks: L.LayerGroup;
  } | null>(null);

  const clickModeRef = useRef(clickMode);
  clickModeRef.current = clickMode;
  const onMapClickRef = useRef(onMapClickCoords);
  onMapClickRef.current = onMapClickCoords;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: ASTANA_CENTER,
      zoom: 12,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap | ASTANA 2040 AI CITY BRAIN',
      className: 'astana-dark-tiles',
      maxZoom: 18,
    }).addTo(map);

    const layers = {
      bayesian: L.layerGroup().addTo(map),
      roads: L.layerGroup().addTo(map),
      astar: L.layerGroup().addTo(map),
      trafficLights: L.layerGroup().addTo(map),
      incidents: L.layerGroup().addTo(map),
      teams: L.layerGroup().addTo(map),
      vehicles: L.layerGroup().addTo(map),
      landmarks: L.layerGroup().addTo(map),
    };

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current([Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))]);
    });

    mapRef.current = map;
    layersRef.current = layers;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (focusCoords && mapRef.current) {
      mapRef.current.flyTo(focusCoords, 14, { duration: 0.9 });
    }
  }, [focusCoords]);

  // Render Roads & Nodes
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.roads.clearLayers();

    if (overlays.traffic) {
      edges.forEach((edge) => {
        const isSelected = edge.id === selectedEdgeId;
        const color = getCongestionColor(edge);
        const line = L.polyline(edge.geometry, {
          color: isSelected ? '#38bdf8' : color,
          weight: isSelected ? 7 : edge.isBridge ? 6 : 4.5,
          opacity: edge.isClosed ? 0.65 : 0.88,
          dashArray: edge.isClosed ? '8, 8' : undefined,
        });

        const edgeTitle = getEdgeName(edge, lang);
        line.bindTooltip(
          `<strong>${edgeTitle}</strong><br/>${t.liveMap.statusLabel}: ${
            edge.isClosed
              ? t.liveMap.statusClosed
              : `${Math.round(edge.density * 100)}% ${t.liveMap.congestionSuffix}`
          } | ${edge.lengthKm} ${t.liveMap.km}`,
          { sticky: true }
        );

        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectEdge(edge.id);
        });

        line.addTo(layers.roads);
      });
    }

    nodes.forEach((node) => {
      const isSelected = node.id === selectedNodeId;
      const marker = L.circleMarker(node.coords, {
        radius: isSelected ? 7 : 4.5,
        color: isSelected ? '#38bdf8' : '#0f172a',
        weight: 2,
        fillColor: isSelected ? '#38bdf8' : '#94a3b8',
        fillOpacity: 0.9,
      });
      marker.bindTooltip(`${node.id}: ${getNodeName(node, lang)}`);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectNode(node.id);
      });
      marker.addTo(layers.roads);
    });
  }, [nodes, edges, overlays.traffic, selectedEdgeId, selectedNodeId, onSelectEdge, onSelectNode, lang, t]);

  // Render Bayesian Risk Heatmap Zones
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.bayesian.clearLayers();
    if (!overlays.bayesianHeatmap) return;

    bayesian.districtRisks.forEach((zone) => {
      const circle = L.circle(zone.coords, {
        radius: zone.radius,
        color: '#a855f7',
        weight: 1.5,
        fillColor: zone.prob >= 65 ? '#9333ea' : '#7e22ce',
        fillOpacity: Math.min(0.32, Math.max(0.08, (zone.prob / 100) * 0.3)),
      });
      circle.bindTooltip(`${t.liveMap.bayesianZone}: ${zone.district}<br/>${t.liveMap.congestionRisk}: ${zone.prob}%`);
      circle.addTo(layers.bayesian);
    });
  }, [bayesian, overlays.bayesianHeatmap, t]);

  // Render A* Path Overlay
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.astar.clearLayers();
    if (!overlays.astarRoute || !astarResult || !astarResult.found || astarResult.pathCoords.length === 0) return;

    const glowLine = L.polyline(astarResult.pathCoords, {
      color: '#06b6d4',
      weight: 11,
      opacity: 0.28,
    });
    const coreLine = L.polyline(astarResult.pathCoords, {
      color: '#22d3ee',
      weight: 5,
      opacity: 0.95,
    });
    coreLine.bindTooltip(
      `${t.liveMap.optimalRoute}: ${astarResult.totalDistanceKm} ${t.liveMap.km} (~${astarResult.estimatedMinutes} ${t.kpis.min})`
    );
    glowLine.addTo(layers.astar);
    coreLine.addTo(layers.astar);
  }, [astarResult, overlays.astarRoute, t]);

  // Render Traffic Lights
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.trafficLights.clearLayers();
    if (!overlays.trafficLights) return;

    trafficLights.forEach((tl) => {
      const color =
        tl.phase === 'NS_GREEN'
          ? '#22c55e'
          : tl.phase === 'EW_GREEN'
          ? '#38bdf8'
          : '#facc15';
      const marker = L.circleMarker(tl.coords, {
        radius: 5.5,
        color: '#020617',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      });
      marker.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-bold text-cyan-400">${t.liveMap.tlAgentTitle}: ${tl.nodeId}</div>
          <div>${getNodeName(tl.nodeId, lang)}</div>
          <div>${t.liveMap.phaseLabel}: <b>${tl.phase}</b> (${tl.timer}${t.kpis.sec})</div>
          <div>${t.liveMap.queuesLabel} — NS: ${tl.nsQueue} | EW: ${tl.ewQueue}</div>
          <div class="text-slate-300 italic">${tl.reasoning}</div>
        </div>`
      );
      marker.addTo(layers.trafficLights);
    });
  }, [trafficLights, overlays.trafficLights, lang, t]);

  // Render Vehicles
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.vehicles.clearLayers();
    if (!overlays.vehicles) return;

    vehicles.forEach((v) => {
      const fill =
        v.type === 'Emergency'
          ? '#ef4444'
          : v.type === 'Bus'
          ? '#f59e0b'
          : v.type === 'Taxi'
          ? '#eab308'
          : v.type === 'Municipal'
          ? '#a855f7'
          : '#38bdf8';

      const marker = L.circleMarker(v.coords, {
        radius: v.type === 'Emergency' || v.type === 'Bus' ? 5.5 : 4,
        color: '#ffffff',
        weight: 1,
        fillColor: fill,
        fillOpacity: 0.95,
      });
      marker.bindTooltip(
        `${v.id} (${t.vehicleTypes[v.type]}) — ${t.vehicleStatus[v.status]} (${Math.round(v.speedKmh)} ${t.liveMap.kmh})`
      );
      marker.addTo(layers.vehicles);
    });
  }, [vehicles, overlays.vehicles, t]);

// Render Incidents
useEffect(() => {
  const layers = layersRef.current;
  if (!layers) return;
  layers.incidents.clearLayers();
  if (!overlays.incidents) return;

  incidents
    .filter((i) => i.status !== 'Resolved' && i.status !== 'Cancelled')
    .forEach((inc) => {
      const icon = L.divIcon({
        className: 'custom-incident-icon',
        html: `<div style="background:#ef4444;border:2px solid #fff;color:#fff;font-weight:700;font-size:10px;width:22px;height:22px;border-radius:9999px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px #ef4444;">!</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker(inc.coords, { icon });
      marker.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-bold text-red-400">${inc.id}: ${t.incidentTypes[inc.type]}</div>
          <div>${t.liveMap.severityLabel}: <b>${t.severity[inc.severity]}</b></div>
          <div>${t.liveMap.locationLabel}: ${getNodeName(inc.nearestNodeId, lang)}</div>
          <div>${t.liveMap.statusLabel}: ${t.incidentStatus[inc.status]} ${inc.assignedTeamId ? `(${inc.assignedTeamId})` : ''}</div>
        </div>`
      );
      marker.addTo(layers.incidents);
    });
}, [incidents, overlays.incidents, lang, t]);

// Render Municipal Teams
useEffect(() => {
  const layers = layersRef.current;
  if (!layers) return;
  layers.teams.clearLayers();
  if (!overlays.teams) return;

  teams.forEach((team) => {
    const icon = L.divIcon({
      className: 'custom-team-icon',
      html: `<div style="background:${
        team.available ? '#10b981' : '#f59e0b'
      };border:2px solid #0f172a;color:#020617;font-weight:800;font-size:9px;padding:1px 4px;border-radius:4px;white-space:nowrap;">${team.id}</div>`,
      iconSize: [44, 18],
      iconAnchor: [22, 9],
    });
    const marker = L.marker(team.coords, { icon });
    marker.bindPopup(
      `<div class="text-xs space-y-1">
        <div class="font-bold text-emerald-400">${team.id} — ${t.teamCategories[team.category]}</div>
        <div>${getTeamName(team, lang)}</div>
        <div>${t.liveMap.statusLabel}: <b>${team.available ? t.liveMap.available : `${t.liveMap.enRoute} (${team.assignedIncidentId})`}</b></div>
      </div>`
    );
    marker.addTo(layers.teams);
  });
}, [teams, overlays.teams, lang, t]);
  // Render Municipal Teams
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.teams.clearLayers();
    if (!overlays.teams) return;

    teams.forEach((team) => {
      const icon = L.divIcon({
        className: 'custom-team-icon',
        html: `<div style="background:${
          team.available ? '#10b981' : '#f59e0b'
        };border:2px solid #0f172a;color:#020617;font-weight:800;font-size:9px;padding:1px 4px;border-radius:4px;white-space:nowrap;">${team.id}</div>`,
        iconSize: [44, 18],
        iconAnchor: [22, 9],
      });
      const marker = L.marker(team.coords, { icon });
      marker.bindPopup(
        `<div class="text-xs space-y-1">
          <div class="font-bold text-emerald-400">${team.id} — ${t.teamCategories[team.category]}</div>
          <div>${getTeamName(team, lang)}</div>
          <div>${t.liveMap.statusLabel}: <b>${team.available ? t.liveMap.available : `${t.liveMap.enRoute} (${team.assignedIncidentId})`}</b></div>
        </div>`
      );
      marker.addTo(layers.teams);
    });
  }, [teams, overlays.teams, lang, t]);

  // Render Astana Landmarks
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.landmarks.clearLayers();
    if (!overlays.landmarks) return;

    landmarks.forEach((lm) => {
      const loc = getLocalizedLandmark(lm, lang);
      const icon = L.divIcon({
        className: 'custom-landmark-icon',
        html: `<div style="background:rgba(15,23,42,0.92);border:1px solid #38bdf8;color:#7dd3fc;font-size:10px;font-weight:600;padding:2px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.6);">${loc.title}</div>`,
        iconSize: [140, 22],
        iconAnchor: [70, 11],
      });
      const marker = L.marker(lm.coords, { icon });
      marker.bindPopup(
        `<div class="text-xs space-y-1 max-w-[230px]">
          <div class="font-bold text-cyan-300">${loc.title}</div>
          <div class="text-slate-400">${loc.secondaryTitle} • ${loc.district}</div>
          <div>${loc.description}</div>
          <div class="text-[10px] text-slate-400">GPS: ${lm.coords[0].toFixed(4)}, ${lm.coords[1].toFixed(4)}</div>
        </div>`
      );
      marker.addTo(layers.landmarks);
    });
  }, [landmarks, overlays.landmarks, lang]);

  return (
    <div className="relative w-full h-full min-h-[520px] rounded-xl overflow-hidden border border-cyan-500/30 shadow-2xl">
      <div ref={containerRef} className="w-full h-full min-h-[520px]" />
      <div className="absolute bottom-3 left-3 z-[500] bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-3 py-2 text-[11px] text-slate-200 space-y-1 pointer-events-none">
        <div className="font-semibold text-cyan-400 uppercase tracking-wider">{t.liveMap.legendTitle}</div>
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> {t.liveMap.legendFree}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> {t.liveMap.legendModerate}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> {t.liveMap.legendHeavy}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> {t.liveMap.legendCritical}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> {t.liveMap.legendClosed}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> {t.liveMap.legendAstar}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> {t.liveMap.legendBayesian}</span>
        </div>
      </div>
    </div>
  );
};
