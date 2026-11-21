import { AstanaLandmark, RoadEdge, RoadNode, MunicipalTeam, LatLngTuple } from './types';
import { Language } from './i18n';

export const ASTANA_CENTER: LatLngTuple = [51.1283, 71.4306];

export const ASTANA_LANDMARKS: AstanaLandmark[] = [
  {
    id: 'lm-baiterek',
    name: 'Baiterek Tower',
    kazakhName: 'Бәйтерек монументі',
    category: 'Monument',
    coords: [51.1283, 71.4306],
    district: 'Left Bank (Nurzhol)',
    description: 'Central symbol of Astana (105m) on Nurzhol Boulevard.',
  },
  {
    id: 'lm-khanshatyr',
    name: 'Khan Shatyr Entertainment Center',
    kazakhName: 'Хан Шатыр ойын-сауық орталығы',
    category: 'Commercial',
    coords: [51.1325, 71.4037],
    district: 'Left Bank (Turan)',
    description: 'Iconic tensile structure at the western end of Nurzhol Boulevard.',
  },
  {
    id: 'lm-akorda',
    name: 'Ak Orda Presidential Palace',
    kazakhName: 'Ақорда резиденциясы',
    category: 'Government',
    coords: [51.1258, 71.4464],
    district: 'Administrative Center',
    description: 'Official workplace of the President of Kazakhstan near the Ishim River.',
  },
  {
    id: 'lm-expo',
    name: 'EXPO 2017 / Nur Alem Sphere',
    kazakhName: 'Нұр Әлем (EXPO 2017)',
    category: 'EXPO',
    coords: [51.0901, 71.4182],
    district: 'EXPO Innovation District',
    description: 'Future Energy Museum & Astana IT Hub smart district.',
  },
  {
    id: 'lm-airport',
    name: 'Nursultan Nazarbayev International Airport',
    kazakhName: 'Халықаралық әуежай',
    category: 'Transport',
    coords: [51.0222, 71.4669],
    district: 'Airport Zone',
    description: 'Primary international aviation gateway south of the city.',
  },
  {
    id: 'lm-railway',
    name: 'Astana-1 Railway Station',
    kazakhName: 'Астана-1 теміржол вокзалы',
    category: 'Transport',
    coords: [51.1965, 71.4095],
    district: 'Right Bank (Saryarka)',
    description: 'Historic northern rail hub serving trans-Kazakhstan routes.',
  },
  {
    id: 'lm-nurzhol',
    name: 'Nurzhol Boulevard',
    kazakhName: 'Нұржол бульвары',
    category: 'Culture',
    coords: [51.1292, 71.4215],
    district: 'Left Bank Core',
    description: 'Pedestrian and ceremonial axis connecting Khan Shatyr to Ak Orda.',
  },
  {
    id: 'lm-opera',
    name: 'Astana Opera',
    kazakhName: 'Астана Опера',
    category: 'Culture',
    coords: [51.1355, 71.4112],
    district: 'Left Bank (Turan)',
    description: 'National opera and ballet theater at Turan & Saraishyq.',
  },
  {
    id: 'lm-mosque',
    name: 'Hazrat Sultan Mosque',
    kazakhName: 'Әзірет Сұлтан мешіті',
    category: 'Culture',
    coords: [51.1254, 71.4721],
    district: 'Right Bank (Tauelsizdik)',
    description: 'Landmark architectural complex along Tauelsizdik Avenue.',
  },
];

const LANDMARK_KK_INFO: Record<string, { district: string; description: string }> = {
  'lm-baiterek': {
    district: 'Сол жағалау (Нұржол)',
    description: 'Нұржол бульварындағы Астананың басты символы (биіктігі 105 м).',
  },
  'lm-khanshatyr': {
    district: 'Сол жағалау (Тұран)',
    description: 'Нұржол бульварының батыс бөлігіндегі бірегей шатырлы кешен.',
  },
  'lm-akorda': {
    district: 'Әкімшілік орталық',
    description: 'Есіл өзенінің жағасындағы Қазақстан Республикасы Президентінің резиденциясы.',
  },
  'lm-expo': {
    district: 'EXPO инновациялық ауданы',
    description: 'Болашақ энергиясы музейі және Astana IT Hub ақылды ауданы.',
  },
  'lm-airport': {
    district: 'Әуежай аймағы',
    description: 'Қаланың оңтүстігіндегі басты халықаралық әуе қақпасы.',
  },
  'lm-railway': {
    district: 'Оң жағалау (Сарыарқа)',
    description: 'Трансқазақстандық бағыттарға қызмет көрсететін солтүстік теміржол торабы.',
  },
  'lm-nurzhol': {
    district: 'Сол жағалау орталығы',
    description: 'Хан Шатыр мен Ақорданы байланыстыратын жаяу жүргіншілер бульвары.',
  },
  'lm-opera': {
    district: 'Сол жағалау (Тұран)',
    description: 'Тұран мен Сарайшық қиылысындағы ұлттық опера және балет театры.',
  },
  'lm-mosque': {
    district: 'Оң жағалау (Тәуелсіздік)',
    description: 'Тәуелсіздік даңғылы бойындағы сәулеттік кешен.',
  },
};

export function getLocalizedLandmark(lm: AstanaLandmark, lang: Language) {
  if (lang === 'en') {
    return { title: lm.name, secondaryTitle: lm.kazakhName, district: lm.district, description: lm.description };
  }
  const kk = LANDMARK_KK_INFO[lm.id];
  return {
    title: lm.kazakhName,
    secondaryTitle: lm.name,
    district: kk?.district || lm.district,
    description: kk?.description || lm.description,
  };
}

export const INITIAL_NODES: RoadNode[] = [
  { id: 'N01', name: 'Turan / Saraishyq (Astana Opera)', coords: [51.1354, 71.4106], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N02', name: 'Khan Shatyr Roundabout', coords: [51.1324, 71.4046], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N03', name: 'Turan / Dostyk', coords: [51.1268, 71.4098], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N04', name: 'Turan / Syganak', coords: [51.1195, 71.4105], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N05', name: 'Turan / Uly Dala', coords: [51.1045, 71.4112], district: 'EXPO District', hasTrafficLight: true },
  { id: 'N06', name: 'Kabanbay Batyr / Saraishyq', coords: [51.1362, 71.4235], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N07', name: 'Baiterek / Dostyk-Mangilik', coords: [51.1282, 71.4282], district: 'Administrative Center', hasTrafficLight: true },
  { id: 'N08', name: 'Mangilik El / Syganak', coords: [51.1198, 71.4302], district: 'Administrative Center', hasTrafficLight: true },
  { id: 'N09', name: 'Mangilik El / Uly Dala (EXPO)', coords: [51.0932, 71.4268], district: 'EXPO District', hasTrafficLight: true },
  { id: 'N10', name: 'Kabanbay Batyr / Uly Dala', coords: [51.0915, 71.4178], district: 'EXPO District', hasTrafficLight: true },
  { id: 'N11', name: 'Kabanbay Batyr Airport Highway', coords: [51.0550, 71.4420], district: 'Airport Zone', hasTrafficLight: false },
  { id: 'N12', name: 'Astana International Airport Terminal', coords: [51.0245, 71.4655], district: 'Airport Zone', hasTrafficLight: true },
  { id: 'N13', name: 'Ak Orda / Mangilik El Bridge West', coords: [51.1256, 71.4442], district: 'Administrative Center', hasTrafficLight: true },
  { id: 'N14', name: 'Syganak Bridge West', coords: [51.1172, 71.4495], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N15', name: 'Saraishyq Bridge West', coords: [51.1392, 71.4385], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N16', name: 'Saryarka Bridge South', coords: [51.1485, 71.4172], district: 'Left Bank', hasTrafficLight: true },
  { id: 'N17', name: 'Saryarka / Kenesary', coords: [51.1618, 71.4192], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N18', name: 'Saryarka / Seifullin', coords: [51.1745, 71.4202], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N19', name: 'Astana-1 Railway Plaza', coords: [51.1948, 71.4105], district: 'Railway District', hasTrafficLight: true },
  { id: 'N20', name: 'Respublika / Kenesary', coords: [51.1628, 71.4342], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N21', name: 'Respublika / Bogenbay Batyr', coords: [51.1762, 71.4348], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N22', name: 'Bogenbay Batyr / Zhenis', coords: [51.1765, 71.4135], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N23', name: 'Tauelsizdik / Saraishyq Bridge East', coords: [51.1432, 71.4525], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N24', name: 'Tauelsizdik / Hazrat Sultan', coords: [51.1262, 71.4695], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N25', name: 'Koshkarbayev / Syganak Bridge East', coords: [51.1155, 71.4662], district: 'Right Bank', hasTrafficLight: true },
  { id: 'N26', name: 'Abylai Khan / Tauelsizdik', coords: [51.1488, 71.4745], district: 'Right Bank', hasTrafficLight: true },
];

const NODE_KK_NAMES: Record<string, string> = {
  N01: 'Тұран / Сарайшық (Астана Опера)',
  N02: 'Хан Шатыр айналма жолы',
  N03: 'Тұран / Достық',
  N04: 'Тұран / Сығанақ',
  N05: 'Тұран / Ұлы Дала',
  N06: 'Қабанбай батыр / Сарайшық',
  N07: 'Бәйтерек / Достық-Мәңгілік Ел',
  N08: 'Мәңгілік Ел / Сығанақ',
  N09: 'Мәңгілік Ел / Ұлы Дала (EXPO)',
  N10: 'Қабанбай батыр / Ұлы Дала',
  N11: 'Қабанбай батыр әуежай тас жолы',
  N12: 'Астана халықаралық әуежай терминалы',
  N13: 'Ақорда / Мәңгілік Ел көпірі (Батыс)',
  N14: 'Сығанақ көпірі (Батыс)',
  N15: 'Сарайшық көпірі (Батыс)',
  N16: 'Сарыарқа көпірі (Оңтүстік)',
  N17: 'Сарыарқа / Кенесары',
  N18: 'Сарыарқа / Сейфуллин',
  N19: 'Астана-1 теміржол вокзалы алаңы',
  N20: 'Республика / Кенесары',
  N21: 'Республика / Бөгенбай батыр',
  N22: 'Бөгенбай батыр / Жеңіс',
  N23: 'Тәуелсіздік / Сарайшық көпірі (Шығыс)',
  N24: 'Тәуелсіздік / Әзірет Сұлтан',
  N25: 'Қошқарбаев / Сығанақ көпірі (Шығыс)',
  N26: 'Абылай хан / Тәуелсіздік',
};

export function getNodeName(nodeOrId: RoadNode | string, lang: Language): string {
  const id = typeof nodeOrId === 'string' ? nodeOrId : nodeOrId.id;
  if (lang === 'kk' && NODE_KK_NAMES[id]) return NODE_KK_NAMES[id];
  if (typeof nodeOrId !== 'string') return nodeOrId.name;
  return INITIAL_NODES.find((n) => n.id === id)?.name || id;
}

const EDGE_KK_NAMES: Record<string, string> = {
  E01: 'Тұран даңғылы (Солтүстік)',
  E02: 'Тұран даңғылы (Хан Шатыр - Достық)',
  E03: 'Тұран даңғылы (Достық - Сығанақ)',
  E04: 'Тұран даңғылы (Оңтүстік — Ұлы Далаға)',
  E05: 'Сарайшық көшесі (Батыс)',
  E06: 'Сарайшық көшесі (Көпірге кіреберіс)',
  E07: 'Достық көшесі (Нұржол осі)',
  E08: 'Достық көшесі (Бәйтерек - Ақорда)',
  E09: 'Мәңгілік Ел даңғылы (Солтүстік)',
  E10: 'Мәңгілік Ел даңғылы (Орталық)',
  E11: 'Мәңгілік Ел даңғылы (Мәңгілік Ел қақпасы - EXPO)',
  E12: 'Сығанақ көшесі (Батыс)',
  E13: 'Сығанақ көшесі (Көпірге кіреберіс)',
  E14: 'Ұлы Дала даңғылы (EXPO байланысы)',
  E15: 'Ұлы Дала даңғылы (Шығыс)',
  E16: 'Қабанбай батыр әуежай тас жолы (Солтүстік)',
  E17: 'Қабанбай батыр әуежай тас жолы (Оңтүстік)',
  E18: 'Тұран - Сарыарқа жалғаушы жолы',
  E19: 'Сарыарқа көпірі (Есіл өткелі)',
  E20: 'Сарайшық / Қараөткел көпірі (Есіл өткелі)',
  E21: 'Арқар / Мәңгілік Ел көпірі (Есіл өткелі)',
  E22: 'Сығанақ көпірі (Есіл өткелі)',
  E23: 'Сарыарқа даңғылы (Орталық)',
  E24: 'Жеңіс даңғылы (Солтүстік — Вокзалға)',
  E25: 'Сейфуллин / Жеңіс байланысы',
  E26: 'Кенесары көшесі (Сарыарқа - Республика)',
  E27: 'Республика даңғылы (Орталық)',
  E28: 'Бөгенбай батыр даңғылы (Орталық)',
  E29: 'Республика - Тәуелсіздік жалғаушы жолы',
  E30: 'Тәуелсіздік даңғылы (Солтүстік)',
  E31: 'Тәуелсіздік даңғылы (Оңтүстік)',
  E32: 'Абылай хан даңғылы',
  E33: 'Момышұлы - Әзірет Сұлтан байланысы',
};

export function getEdgeName(edge: RoadEdge, lang: Language): string {
  if (lang === 'kk' && EDGE_KK_NAMES[edge.id]) return EDGE_KK_NAMES[edge.id];
  return edge.name;
}

const TEAM_KK_NAMES: Record<string, string> = {
  'AMB-01': 'Сол жағалау жедел медициналық бригадасы 01',
  'AMB-02': 'Оң жағалау жедел медициналық бригадасы 02',
  'FIRE-01': 'Астана өрт сөндіру және құтқару жасағы 01',
  'FIRE-02': 'EXPO және Әуежай өрт сөндіру бригадасы 02',
  'POL-01': 'Ақылды патрульдік экипаж 01',
  'POL-02': 'Сарыарқа жол полициясы жасағы 02',
  'ROAD-01': 'Астана жол жөндеу бригадасы 01',
  'ELEC-01': 'Астана-РЭК ақылды электр желісі тобы 01',
};

export function getTeamName(team: MunicipalTeam, lang: Language): string {
  if (lang === 'kk' && TEAM_KK_NAMES[team.id]) return TEAM_KK_NAMES[team.id];
  return team.name;
}

export function haversineKm(a: LatLngTuple, b: LatLngTuple): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function polylineLengthKm(pts: LatLngTuple[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineKm(pts[i], pts[i + 1]);
  }
  return Math.max(0.2, Number(total.toFixed(2)));
}

function makeEdge(
  id: string,
  name: string,
  from: string,
  to: string,
  highwayType: 'primary' | 'secondary' | 'tertiary' | 'bridge',
  geometry: LatLngTuple[],
  maxSpeedKmh: number,
  capacity: number,
  density: number,
  isBridge = false
): RoadEdge {
  return {
    id,
    name,
    from,
    to,
    highwayType,
    geometry,
    lengthKm: polylineLengthKm(geometry),
    maxSpeedKmh,
    capacity,
    density,
    isClosed: false,
    isBridge,
  };
}

export const INITIAL_EDGES: RoadEdge[] = [
  makeEdge('E01', 'Turan Avenue (North)', 'N01', 'N02', 'primary', [[51.1354, 71.4106], [51.1341, 71.4074], [51.1324, 71.4046]], 70, 50, 0.32),
  makeEdge('E02', 'Turan Avenue (Khan Shatyr - Dostyk)', 'N02', 'N03', 'primary', [[51.1324, 71.4046], [51.1296, 71.4071], [51.1268, 71.4098]], 70, 55, 0.44),
  makeEdge('E03', 'Turan Avenue (Dostyk - Syganak)', 'N03', 'N04', 'primary', [[51.1268, 71.4098], [51.1231, 71.4102], [51.1195, 71.4105]], 70, 55, 0.38),
  makeEdge('E04', 'Turan Avenue (South to Uly Dala)', 'N04', 'N05', 'primary', [[51.1195, 71.4105], [51.1120, 71.4109], [51.1045, 71.4112]], 80, 60, 0.28),
  makeEdge('E05', 'Saraishyq Street (West)', 'N01', 'N06', 'primary', [[51.1354, 71.4106], [51.1358, 71.4170], [51.1362, 71.4235]], 60, 45, 0.35),
  makeEdge('E06', 'Saraishyq Street (Bridge Approach)', 'N06', 'N15', 'primary', [[51.1362, 71.4235], [51.1377, 71.4310], [51.1392, 71.4385]], 60, 45, 0.42),
  makeEdge('E07', 'Dostyk Street (Nurzhol Axis)', 'N03', 'N07', 'secondary', [[51.1268, 71.4098], [51.1275, 71.4190], [51.1282, 71.4282]], 50, 35, 0.48),
  makeEdge('E08', 'Dostyk Street (Baiterek - Ak Orda)', 'N07', 'N13', 'secondary', [[51.1282, 71.4282], [51.1269, 71.4362], [51.1256, 71.4442]], 50, 35, 0.40),
  makeEdge('E09', 'Mangilik El Avenue (North)', 'N06', 'N07', 'primary', [[51.1362, 71.4235], [51.1322, 71.4258], [51.1282, 71.4282]], 60, 55, 0.52),
  makeEdge('E10', 'Mangilik El Avenue (Central)', 'N07', 'N08', 'primary', [[51.1282, 71.4282], [51.1240, 71.4292], [51.1198, 71.4302]], 60, 55, 0.56),
  makeEdge('E11', 'Mangilik El Avenue (Triumphal Arch - EXPO)', 'N08', 'N09', 'primary', [[51.1198, 71.4302], [51.1065, 71.4285], [51.0932, 71.4268]], 70, 60, 0.34),
  makeEdge('E12', 'Syganak Street (West)', 'N04', 'N08', 'primary', [[51.1195, 71.4105], [51.1196, 71.4203], [51.1198, 71.4302]], 60, 50, 0.45),
  makeEdge('E13', 'Syganak Street (Bridge Approach)', 'N08', 'N14', 'primary', [[51.1198, 71.4302], [51.1185, 71.4398], [51.1172, 71.4495]], 60, 50, 0.41),
  makeEdge('E14', 'Uly Dala Avenue (EXPO Link)', 'N05', 'N10', 'primary', [[51.1045, 71.4112], [51.0975, 71.4145], [51.0915, 71.4178]], 70, 50, 0.26),
  makeEdge('E15', 'Uly Dala Avenue (East)', 'N10', 'N09', 'primary', [[51.0915, 71.4178], [51.0923, 71.4223], [51.0932, 71.4268]], 70, 50, 0.29),
  makeEdge('E16', 'Kabanbay Batyr Airport Highway (North)', 'N10', 'N11', 'primary', [[51.0915, 71.4178], [51.0732, 71.4299], [51.0550, 71.4420]], 90, 65, 0.22),
  makeEdge('E17', 'Kabanbay Batyr Airport Highway (South)', 'N11', 'N12', 'primary', [[51.0550, 71.4420], [51.0398, 71.4538], [51.0245, 71.4655]], 90, 65, 0.19),
  makeEdge('E18', 'Turan - Saryarka Connector', 'N01', 'N16', 'primary', [[51.1354, 71.4106], [51.1420, 71.4139], [51.1485, 71.4172]], 60, 50, 0.47),
  makeEdge('E19', 'Saryarka Bridge (Ishim Crossing)', 'N16', 'N17', 'bridge', [[51.1485, 71.4172], [51.1552, 71.4182], [51.1618, 71.4192]], 60, 50, 0.62, true),
  makeEdge('E20', 'Saraishyq / Karaotkel Bridge (Ishim Crossing)', 'N15', 'N23', 'bridge', [[51.1392, 71.4385], [51.1412, 71.4455], [51.1432, 71.4525]], 60, 50, 0.58, true),
  makeEdge('E21', 'Arkar / Mangilik El Bridge (Ishim Crossing)', 'N13', 'N24', 'bridge', [[51.1256, 71.4442], [51.1259, 71.4568], [51.1262, 71.4695]], 60, 50, 0.54, true),
  makeEdge('E22', 'Syganak Bridge (Ishim Crossing)', 'N14', 'N25', 'bridge', [[51.1172, 71.4495], [51.1163, 71.4578], [51.1155, 71.4662]], 60, 50, 0.49, true),
  makeEdge('E23', 'Saryarka Avenue (Central)', 'N17', 'N18', 'primary', [[51.1618, 71.4192], [51.1681, 71.4197], [51.1745, 71.4202]], 60, 45, 0.44),
  makeEdge('E24', 'Zhenis Avenue (North to Railway)', 'N22', 'N19', 'secondary', [[51.1765, 71.4135], [51.1856, 71.4120], [51.1948, 71.4105]], 50, 40, 0.36),
  makeEdge('E25', 'Seifullin / Zhenis Link', 'N18', 'N22', 'secondary', [[51.1745, 71.4202], [51.1755, 71.4168], [51.1765, 71.4135]], 50, 35, 0.33),
  makeEdge('E26', 'Kenesary Street (Saryarka - Respublika)', 'N17', 'N20', 'secondary', [[51.1618, 71.4192], [51.1623, 71.4267], [51.1628, 71.4342]], 50, 40, 0.51),
  makeEdge('E27', 'Respublika Avenue (Central)', 'N20', 'N21', 'primary', [[51.1628, 71.4342], [51.1695, 71.4345], [51.1762, 71.4348]], 60, 50, 0.55),
  makeEdge('E28', 'Bogenbay Batyr Avenue (Central)', 'N22', 'N21', 'primary', [[51.1765, 71.4135], [51.1763, 71.4241], [51.1762, 71.4348]], 60, 50, 0.46),
  makeEdge('E29', 'Respublika - Tauelsizdik Connector', 'N20', 'N23', 'primary', [[51.1628, 71.4342], [51.1530, 71.4433], [51.1432, 71.4525]], 60, 48, 0.49),
  makeEdge('E30', 'Tauelsizdik Avenue (North)', 'N23', 'N24', 'primary', [[51.1432, 71.4525], [51.1347, 71.4610], [51.1262, 71.4695]], 60, 50, 0.37),
  makeEdge('E31', 'Tauelsizdik Avenue (South)', 'N24', 'N25', 'primary', [[51.1262, 71.4695], [51.1208, 71.4678], [51.1155, 71.4662]], 60, 45, 0.31),
  makeEdge('E32', 'Abylai Khan Avenue', 'N23', 'N26', 'secondary', [[51.1432, 71.4525], [51.1460, 71.4635], [51.1488, 71.4745]], 60, 45, 0.35),
  makeEdge('E33', 'Momushuly - Hazrat Sultan Link', 'N26', 'N24', 'secondary', [[51.1488, 71.4745], [51.1375, 71.4720], [51.1262, 71.4695]], 60, 45, 0.30),
];

export const INITIAL_TEAMS: MunicipalTeam[] = [
  {
    id: 'AMB-01',
    name: 'Left Bank Emergency Medical Unit 01',
    category: 'Ambulance',
    skills: ['Ambulance'],
    coords: [51.1282, 71.4282],
    homeCoords: [51.1282, 71.4282],
    nearestNodeId: 'N07',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'AMB-02',
    name: 'Right Bank Emergency Medical Unit 02',
    category: 'Ambulance',
    skills: ['Ambulance'],
    coords: [51.1628, 71.4342],
    homeCoords: [51.1628, 71.4342],
    nearestNodeId: 'N20',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'FIRE-01',
    name: 'Astana Fire & Rescue Squad 01',
    category: 'Fire Department',
    skills: ['Fire Department', 'Municipal Support'],
    coords: [51.1354, 71.4106],
    homeCoords: [51.1354, 71.4106],
    nearestNodeId: 'N01',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'FIRE-02',
    name: 'EXPO & Airport Fire Brigade 02',
    category: 'Fire Department',
    skills: ['Fire Department'],
    coords: [51.0932, 71.4268],
    homeCoords: [51.0932, 71.4268],
    nearestNodeId: 'N09',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'POL-01',
    name: 'Smart Patrol Interceptor 01',
    category: 'Police',
    skills: ['Police'],
    coords: [51.1198, 71.4302],
    homeCoords: [51.1198, 71.4302],
    nearestNodeId: 'N08',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'POL-02',
    name: 'Saryarka Traffic Police Unit 02',
    category: 'Police',
    skills: ['Police'],
    coords: [51.1745, 71.4202],
    homeCoords: [51.1745, 71.4202],
    nearestNodeId: 'N18',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'ROAD-01',
    name: 'Astana Road Maintenance Crew 01',
    category: 'Road Repair',
    skills: ['Road Repair', 'Municipal Support'],
    coords: [51.1432, 71.4525],
    homeCoords: [51.1432, 71.4525],
    nearestNodeId: 'N23',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
  {
    id: 'ELEC-01',
    name: 'Astana-REC Smart Grid Crew 01',
    category: 'Electrical Repair',
    skills: ['Electrical Repair', 'Municipal Support'],
    coords: [51.1262, 71.4695],
    homeCoords: [51.1262, 71.4695],
    nearestNodeId: 'N24',
    available: true,
    assignedIncidentId: null,
    routeNodeIds: [],
    routeProgressIndex: 0,
    edgeProgress: 0,
    etaMinutes: null,
  },
];
