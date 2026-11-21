import {
  AStarResult,
  AStarTraceStep,
  BayesianInferenceResult,
  CSPAssignmentResult,
  IncidentRecord,
  IncidentSeverity,
  IncidentType,
  LatLngTuple,
  MunicipalTeam,
  RoadEdge,
  RoadNode,
  TeamCategory,
  WeatherCondition,
} from './types';
import { haversineKm } from './astanaData';

export function getWeatherSpeedFactor(weather: WeatherCondition): number {
  switch (weather) {
    case 'Clear':
      return 1.0;
    case 'Rain':
      return 0.82;
    case 'Fog':
      return 0.78;
    case 'Snow':
      return 0.65;
    case 'Heavy Snowstorm':
      return 0.45;
  }
}

export function computeEdgeTravelMinutes(
  edge: RoadEdge,
  weather: WeatherCondition,
  incidents: IncidentRecord[],
  ignoreTraffic = false
): number {
  if (edge.isClosed) return Infinity;
  const weatherFactor = getWeatherSpeedFactor(weather);
  const congestionFactor = ignoreTraffic ? 1.0 : Math.max(0.22, 1 - edge.density * 0.72);
  const hasIncidentNear = incidents.some(
    (inc) =>
      inc.status !== 'Resolved' &&
      inc.status !== 'Cancelled' &&
      (inc.nearestNodeId === edge.from || inc.nearestNodeId === edge.to)
  );
  const incidentPenaltyMin = !ignoreTraffic && hasIncidentNear ? 2.5 : 0;
  const effectiveSpeed = Math.max(8, edge.maxSpeedKmh * weatherFactor * congestionFactor);
  return (edge.lengthKm / effectiveSpeed) * 60 + incidentPenaltyMin;
}

export function runAStarSearch(
  startNodeId: string,
  goalNodeId: string,
  nodes: RoadNode[],
  edges: RoadEdge[],
  weather: WeatherCondition,
  incidents: IncidentRecord[],
  ignoreTraffic = false
): AStarResult {
  const nodeMap = new Map<string, RoadNode>(nodes.map((n) => [n.id, n]));
  const startNode = nodeMap.get(startNodeId);
  const goalNode = nodeMap.get(goalNodeId);

  if (!startNode || !goalNode) {
    return {
      pathNodeIds: [],
      pathCoords: [],
      exploredNodeIds: [],
      frontierNodeIds: [],
      totalDistanceKm: 0,
      estimatedMinutes: 0,
      expandedCount: 0,
      trace: [],
      found: false,
      reason: 'Invalid start or destination intersection selected.',
    };
  }

  if (startNodeId === goalNodeId) {
    return {
      pathNodeIds: [startNodeId],
      pathCoords: [startNode.coords],
      exploredNodeIds: [startNodeId],
      frontierNodeIds: [],
      totalDistanceKm: 0,
      estimatedMinutes: 0,
      expandedCount: 1,
      trace: [{ step: 1, currentNode: startNodeId, g: 0, h: 0, f: 0, frontierSize: 0 }],
      found: true,
    };
  }

  const maxNetworkSpeed = 90;
  const heuristic = (nodeId: string): number => {
    const n = nodeMap.get(nodeId);
    if (!n) return 0;
    const distKm = haversineKm(n.coords, goalNode.coords);
    return (distKm / maxNetworkSpeed) * 60;
  };

  const openSet = new Set<string>([startNodeId]);
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, { prevNode: string; edge: RoadEdge; reversed: boolean }>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  nodes.forEach((n) => {
    gScore.set(n.id, Infinity);
    fScore.set(n.id, Infinity);
  });

  gScore.set(startNodeId, 0);
  fScore.set(startNodeId, heuristic(startNodeId));

  const trace: AStarTraceStep[] = [];
  let stepCounter = 0;

  while (openSet.size > 0) {
    let current = '';
    let lowestF = Infinity;
    openSet.forEach((id) => {
      const f = fScore.get(id) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = id;
      }
    });

    if (!current) break;

    stepCounter++;
    trace.push({
      step: stepCounter,
      currentNode: current,
      g: Number((gScore.get(current) ?? 0).toFixed(2)),
      h: Number(heuristic(current).toFixed(2)),
      f: Number((fScore.get(current) ?? 0).toFixed(2)),
      frontierSize: openSet.size,
    });

    if (current === goalNodeId) {
      const pathNodeIds: string[] = [current];
      const pathCoords: LatLngTuple[] = [];
      const edgeChain: { edge: RoadEdge; reversed: boolean }[] = [];
      let curr = current;
      while (cameFrom.has(curr)) {
        const entry = cameFrom.get(curr)!;
        edgeChain.unshift({ edge: entry.edge, reversed: entry.reversed });
        curr = entry.prevNode;
        pathNodeIds.unshift(curr);
      }

      let totalDistanceKm = 0;
      edgeChain.forEach(({ edge, reversed }, idx) => {
        totalDistanceKm += edge.lengthKm;
        const pts = reversed ? [...edge.geometry].reverse() : edge.geometry;
        if (idx === 0) {
          pathCoords.push(...pts);
        } else {
          pathCoords.push(...pts.slice(1));
        }
      });

      return {
        pathNodeIds,
        pathCoords,
        exploredNodeIds: Array.from(closedSet),
        frontierNodeIds: Array.from(openSet),
        totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
        estimatedMinutes: Number((gScore.get(goalNodeId) ?? 0).toFixed(1)),
        expandedCount: closedSet.size + 1,
        trace,
        found: true,
      };
    }

    openSet.delete(current);
    closedSet.add(current);

    const connectedEdges = edges.filter(
      (e) => !e.isClosed && (e.from === current || (!e.oneWay && e.to === current))
    );

    for (const edge of connectedEdges) {
      const neighbor = edge.from === current ? edge.to : edge.from;
      const reversed = edge.to === current;
      if (closedSet.has(neighbor)) continue;

      const edgeCost = computeEdgeTravelMinutes(edge, weather, incidents, ignoreTraffic);
      if (!Number.isFinite(edgeCost)) continue;

      const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;
      if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, { prevNode: current, edge, reversed });
        gScore.set(neighbor, tentativeG);
        fScore.set(neighbor, tentativeG + heuristic(neighbor));
        openSet.add(neighbor);
      }
    }
  }

  return {
    pathNodeIds: [],
    pathCoords: [],
    exploredNodeIds: Array.from(closedSet),
    frontierNodeIds: [],
    totalDistanceKm: 0,
    estimatedMinutes: 0,
    expandedCount: closedSet.size,
    trace,
    found: false,
    reason: 'No valid path exists due to closed road segments isolating the destination.',
  };
}

export function getRequiredSkillsForIncident(type: IncidentType): TeamCategory[] {
  switch (type) {
    case 'Medical Emergency':
      return ['Ambulance'];
    case 'Fire Emergency':
      return ['Fire Department'];
    case 'Traffic Accident':
      return ['Police'];
    case 'Road Obstruction':
      return ['Road Repair'];
    case 'Power Outage':
      return ['Electrical Repair'];
    case 'Public Safety':
      return ['Police'];
    case 'Vehicle Breakdown':
      return ['Municipal Support'];
  }
}

function severityWeight(sev: IncidentSeverity): number {
  switch (sev) {
    case 'Critical':
      return 4;
    case 'High':
      return 3;
    case 'Medium':
      return 2;
    case 'Low':
      return 1;
  }
}

export function solveCSPDispatch(
  incidents: IncidentRecord[],
  teams: MunicipalTeam[],
  nodes: RoadNode[],
  edges: RoadEdge[],
  weather: WeatherCondition
): CSPAssignmentResult[] {
  const pendingIncidents = incidents
    .filter((i) => i.status === 'Pending')
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

  if (pendingIncidents.length === 0) return [];

  // Build domains for each variable (incident)
  const domains = new Map<string, { team: MunicipalTeam; eta: number }[]>();
  const rejectedMap = new Map<string, string[]>();

  for (const inc of pendingIncidents) {
    const validTeams: { team: MunicipalTeam; eta: number }[] = [];
    const rejected: string[] = [];

    for (const team of teams) {
      if (!team.available) {
        rejected.push(`${team.id} rejected: currently busy on another assignment.`);
        continue;
      }
      const hasSkill = inc.requiredSkills.every((req) => team.skills.includes(req));
      if (!hasSkill) {
        rejected.push(
          `${team.id} rejected: missing required skill [${inc.requiredSkills.join(', ')}].`
        );
        continue;
      }
      const route = runAStarSearch(
        team.nearestNodeId,
        inc.nearestNodeId,
        nodes,
        edges,
        weather,
        incidents
      );
      if (!route.found) {
        rejected.push(`${team.id} rejected: no accessible road route due to closures.`);
        continue;
      }
      validTeams.push({ team, eta: Math.max(1.5, route.estimatedMinutes) });
    }

    validTeams.sort((a, b) => a.eta - b.eta);
    domains.set(inc.id, validTeams);
    rejectedMap.set(inc.id, rejected);
  }

  // MRV ordering (Minimum Remaining Values, tie-broken by severity)
  const orderedVars = [...pendingIncidents].sort((a, b) => {
    const domDiff = (domains.get(a.id)?.length ?? 0) - (domains.get(b.id)?.length ?? 0);
    if (domDiff !== 0) return domDiff;
    return severityWeight(b.severity) - severityWeight(a.severity);
  });

  const usedTeams = new Set<string>();
  const bestAssignments = new Map<string, { teamId: string; eta: number }>();

  function backtrack(idx: number): boolean {
    if (idx >= orderedVars.length) return true;
    const variable = orderedVars[idx];
    const candidates = (domains.get(variable.id) || []).filter(
      (c) => !usedTeams.has(c.team.id)
    );

    if (candidates.length === 0) {
      // Allow partial solution so other incidents still get dispatched
      return backtrack(idx + 1);
    }

    for (const candidate of candidates) {
      usedTeams.add(candidate.team.id);
      bestAssignments.set(variable.id, { teamId: candidate.team.id, eta: candidate.eta });

      // Forward checking: ensure remaining variables with non-empty initial domains still have options
      let forwardCheckOk = true;
      for (let j = idx + 1; j < orderedVars.length; j++) {
        const futureVar = orderedVars[j];
        const initialDom = domains.get(futureVar.id) || [];
        if (initialDom.length > 0) {
          const remaining = initialDom.filter((c) => !usedTeams.has(c.team.id));
          if (remaining.length === 0 && severityWeight(futureVar.severity) > severityWeight(variable.severity)) {
            forwardCheckOk = false;
            break;
          }
        }
      }

      if (forwardCheckOk && backtrack(idx + 1)) {
        return true;
      }

      usedTeams.delete(candidate.team.id);
      bestAssignments.delete(variable.id);
    }

    return backtrack(idx + 1);
  }

  backtrack(0);

  return orderedVars.map((inc) => {
    const assigned = bestAssignments.get(inc.id);
    const rejected = [...(rejectedMap.get(inc.id) || [])];
    const trace = [
      `MRV Selected Variable: ${inc.id} (${inc.type}, Severity: ${inc.severity})`,
      `Domain Size before assignment: ${(domains.get(inc.id) || []).length} eligible team(s)`,
    ];

    if (assigned) {
      trace.push(`Forward Check PASSED -> Assigned ${assigned.teamId} (ETA: ${assigned.eta.toFixed(1)} min)`);
      return {
        incidentId: inc.id,
        incidentType: inc.type,
        severity: inc.severity,
        assignedTeamId: assigned.teamId,
        etaMinutes: Number(assigned.eta.toFixed(1)),
        passed: true,
        rejectedReasons: rejected.slice(0, 3),
        trace,
      };
    } else {
      trace.push(`Constraint Validation: NO FEASIBLE TEAM AVAILABLE.`);
      return {
        incidentId: inc.id,
        incidentType: inc.type,
        severity: inc.severity,
        assignedTeamId: null,
        etaMinutes: null,
        passed: false,
        rejectedReasons:
          rejected.length > 0
            ? rejected.slice(0, 4)
            : ['All compatible teams were already allocated to higher-priority emergencies.'],
        trace,
      };
    }
  });
}

export function runBayesianInference(params: {
  simHour: number;
  weather: WeatherCondition;
  trafficDemand: number;
  closedRoadsCount: number;
  hasCriticalIncident: boolean;
  availableTeamsCount: number;
  totalTeamsCount: number;
}): BayesianInferenceResult {
  const rushHour = (params.simHour >= 7.5 && params.simHour <= 9.5) || (params.simHour >= 17 && params.simHour <= 19.5);
  const badWeather = params.weather !== 'Clear';
  const highDemand = params.trafficDemand >= 60;
  const roadClosures = params.closedRoadsCount > 0;
  const highIncidentSeverity = params.hasCriticalIncident;
  const lowTeamAvailability = params.availableTeamsCount <= Math.ceil(params.totalTeamsCount * 0.4);

  const priors = {
    rushHour: 0.25,
    badWeather: 0.2,
    highDemand: 0.35,
    roadClosures: 0.15,
    highIncidentSeverity: 0.18,
    lowTeamAvailability: 0.22,
  };

  // Noisy-OR Leak & Causal Inhibition Parameters for Traffic Congestion
  const leakCongestion = 0.08;
  let qCongestion = 1 - leakCongestion;
  if (rushHour) qCongestion *= 1 - 0.42;
  if (badWeather) qCongestion *= 1 - (params.weather === 'Heavy Snowstorm' ? 0.58 : 0.32);
  if (highDemand) qCongestion *= 1 - Math.min(0.65, (params.trafficDemand / 100) * 0.65);
  if (roadClosures) qCongestion *= 1 - Math.min(0.55, params.closedRoadsCount * 0.22);

  const pCongestion = Number((1 - qCongestion).toFixed(3));

  // Marginalization over intermediate node Traffic Congestion (True / False) for Emergency Response Delay
  const calcDelayGivenCongestion = (congestionTrue: boolean): number => {
    const leakDelay = 0.05;
    let qDelay = 1 - leakDelay;
    if (congestionTrue) qDelay *= 1 - 0.48;
    if (highIncidentSeverity) qDelay *= 1 - 0.38;
    if (lowTeamAvailability) qDelay *= 1 - 0.52;
    return 1 - qDelay;
  };

  const pDelayGivenCongTrue = calcDelayGivenCongestion(true);
  const pDelayGivenCongFalse = calcDelayGivenCongestion(false);
  const pDelay = Number(
    (pCongestion * pDelayGivenCongTrue + (1 - pCongestion) * pDelayGivenCongFalse).toFixed(3)
  );

  const congestionPct = Math.round(pCongestion * 100);
  const delayPct = Math.round(pDelay * 100);

  let riskCategory: BayesianInferenceResult['riskCategory'] = 'Low Risk';
  if (congestionPct >= 76 || delayPct >= 76) riskCategory = 'Critical Risk';
  else if (congestionPct >= 51 || delayPct >= 51) riskCategory = 'High Risk';
  else if (congestionPct >= 26 || delayPct >= 26) riskCategory = 'Moderate Risk';

  const activeFactors: string[] = [];
  if (rushHour) activeFactors.push('peak rush hour window');
  if (badWeather) activeFactors.push(`${params.weather.toLowerCase()} reducing road traction`);
  if (highDemand) activeFactors.push(`high traffic demand (${params.trafficDemand}%)`);
  if (roadClosures) activeFactors.push(`${params.closedRoadsCount} closed road segment(s)`);
  if (highIncidentSeverity) activeFactors.push('active high/critical incidents');
  if (lowTeamAvailability) activeFactors.push('low municipal team availability');

  const explanation =
    activeFactors.length > 0
      ? `Posterior congestion risk is ${congestionPct}% and response delay risk is ${delayPct}% driven by ${activeFactors.join(', ')}.`
      : `Baseline Noisy-OR leak probabilities active (${congestionPct}% congestion, ${delayPct}% delay) under normal Astana operating conditions.`;

  const districtRisks = [
    {
      district: 'Left Bank (Baiterek / Mangilik El)',
      coords: [51.1282, 71.4282] as LatLngTuple,
      radius: 1200,
      prob: Math.min(98, Math.round(congestionPct * 1.08)),
    },
    {
      district: 'Ishim River Bridges Corridor',
      coords: [51.1392, 71.4385] as LatLngTuple,
      radius: 1100,
      prob: Math.min(99, Math.round(congestionPct * 1.15)),
    },
    {
      district: 'Right Bank (Saryarka / Respublika)',
      coords: [51.1628, 71.4270] as LatLngTuple,
      radius: 1300,
      prob: Math.min(95, Math.round(congestionPct * 0.96)),
    },
    {
      district: 'EXPO 2017 / Kabanbay South',
      coords: [51.0932, 71.4220] as LatLngTuple,
      radius: 1100,
      prob: Math.min(90, Math.round(congestionPct * 0.82)),
    },
  ];

  return {
    evidence: {
      rushHour,
      badWeather,
      highDemand,
      roadClosures,
      highIncidentSeverity,
      lowTeamAvailability,
    },
    priors,
    congestionProb: congestionPct,
    delayProb: delayPct,
    riskCategory,
    explanation,
    districtRisks,
  };
}
