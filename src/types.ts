export type LatLngTuple = [number, number];

export type WeatherCondition = 'Clear' | 'Rain' | 'Snow' | 'Heavy Snowstorm' | 'Fog';

export type VehicleType = 'Car' | 'Bus' | 'Taxi' | 'Delivery' | 'Emergency' | 'Municipal';

export type IncidentType =
  | 'Traffic Accident'
  | 'Vehicle Breakdown'
  | 'Fire Emergency'
  | 'Medical Emergency'
  | 'Road Obstruction'
  | 'Power Outage'
  | 'Public Safety';

export type IncidentSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export type TeamCategory =
  | 'Ambulance'
  | 'Fire Department'
  | 'Police'
  | 'Road Repair'
  | 'Electrical Repair'
  | 'Municipal Support';

export interface AstanaLandmark {
  id: string;
  name: string;
  kazakhName: string;
  category: 'Monument' | 'Government' | 'Transport' | 'Culture' | 'Commercial' | 'EXPO';
  coords: LatLngTuple;
  district: string;
  description: string;
}

export interface RoadNode {
  id: string;
  name: string;
  coords: LatLngTuple;
  district: string;
  hasTrafficLight: boolean;
}

export interface RoadEdge {
  id: string;
  name: string;
  from: string;
  to: string;
  highwayType: 'primary' | 'secondary' | 'tertiary' | 'bridge';
  geometry: LatLngTuple[];
  lengthKm: number;
  maxSpeedKmh: number;
  capacity: number;
  density: number; // 0.0 to 1.0
  isClosed: boolean;
  isBridge?: boolean;
  oneWay?: boolean;
}

export interface TrafficLightAgentState {
  nodeId: string;
  nodeName: string;
  coords: LatLngTuple;
  phase: 'NS_GREEN' | 'NS_YELLOW' | 'EW_GREEN' | 'EW_YELLOW';
  timer: number;
  greenDuration: number;
  nsQueue: number;
  ewQueue: number;
  emergencyPriority: boolean;
  reasoning: string;
}

export interface VehicleAgentState {
  id: string;
  type: VehicleType;
  coords: LatLngTuple;
  originNodeId: string;
  destinationNodeId: string;
  routeNodeIds: string[];
  currentEdgeIndex: number;
  edgeProgress: number; // 0 to 1
  speedKmh: number;
  status: 'Moving' | 'Waiting at Light' | 'Slowed by Congestion' | 'Rerouting' | 'Arrived';
  waitingSeconds: number;
  travelSeconds: number;
  rerouteCount: number;
  lastDecision: string;
}

export interface IncidentRecord {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  coords: LatLngTuple;
  nearestNodeId: string;
  locationName: string;
  createdAtSimSeconds: number;
  status: 'Pending' | 'Dispatched' | 'Resolved' | 'Cancelled';
  assignedTeamId: string | null;
  etaMinutes: number | null;
  requiredSkills: TeamCategory[];
}

export interface MunicipalTeam {
  id: string;
  name: string;
  category: TeamCategory;
  skills: TeamCategory[];
  coords: LatLngTuple;
  homeCoords: LatLngTuple;
  nearestNodeId: string;
  available: boolean;
  assignedIncidentId: string | null;
  routeNodeIds: string[];
  routeProgressIndex: number;
  edgeProgress: number;
  etaMinutes: number | null;
}

export interface ActivityLog {
  id: string;
  simTime: string;
  module: 'Agents' | 'A*' | 'CSP' | 'Bayesian' | 'Incidents' | 'Traffic';
  message: string;
  level: 'info' | 'warning' | 'critical' | 'success';
}

export interface AStarTraceStep {
  step: number;
  currentNode: string;
  g: number;
  h: number;
  f: number;
  frontierSize: number;
}

export interface AStarResult {
  pathNodeIds: string[];
  pathCoords: LatLngTuple[];
  exploredNodeIds: string[];
  frontierNodeIds: string[];
  totalDistanceKm: number;
  estimatedMinutes: number;
  expandedCount: number;
  trace: AStarTraceStep[];
  found: boolean;
  reason?: string;
}

export interface CSPAssignmentResult {
  incidentId: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  assignedTeamId: string | null;
  etaMinutes: number | null;
  passed: boolean;
  rejectedReasons: string[];
  trace: string[];
}

export interface BayesianInferenceResult {
  evidence: {
    rushHour: boolean;
    badWeather: boolean;
    highDemand: boolean;
    roadClosures: boolean;
    highIncidentSeverity: boolean;
    lowTeamAvailability: boolean;
  };
  priors: Record<string, number>;
  congestionProb: number;
  delayProb: number;
  riskCategory: 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'Critical Risk';
  explanation: string;
  districtRisks: { district: string; coords: LatLngTuple; radius: number; prob: number }[];
}

export interface MetricSnapshot {
  timeLabel: string;
  avgCongestion: number;
  avgTravelMinutes: number;
  activeVehicles: number;
  completedJourneys: number;
}

export interface ComparisonMetrics {
  modeName: string;
  avgTravelTimeMin: number;
  avgWaitTimeSec: number;
  totalDelayMin: number;
  completedJourneys: number;
  avgCongestionPct: number;
  avgResponseTimeMin: number;
  incidentsAssigned: number;
  rerouteCount: number;
}
