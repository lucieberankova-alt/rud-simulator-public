const DATA = window.RUD_DATA;

const SPECIAL_NAMES = {
  554782: "Praha",
  582786: "Brno",
  554791: "Plzeň",
  554821: "Ostrava",
};

const REGION_ABBREVIATIONS = {
  3018: "PHA",
  3026: "STČ",
  3034: "JČK",
  3042: "PLK",
  3051: "KVK",
  3069: "USK",
  3077: "LBK",
  3085: "HKK",
  3093: "PAK",
  3107: "VYS",
  3115: "JMK",
  3123: "OLK",
  3131: "ZLK",
  3140: "MSK",
};

const STANDARD_COMPONENTS = [
  { id: "population", label: "Počet obyvatel", metric: "population", input: "weight-population" },
  { id: "weightedPopulation", label: "Počet obyvatel přepočítaný", metric: "weightedPopulation", input: "weight-weighted" },
  { id: "landArea", label: "Výměra", metric: "landArea", input: "weight-area" },
  { id: "schoolChildren", label: "Žáci", metric: "schoolChildren", input: "weight-school" },
];

const PCT_BUCKETS = [
  { label: "> 5 %", min: 0.05, max: Infinity },
  { label: "3 až 5 %", min: 0.03, max: 0.05 },
  { label: "1 až 3 %", min: 0.01, max: 0.03 },
  { label: "> 0 až 1 %", min: 0, max: 0.01, includeMin: false },
  { label: "0 %", exact: 0 },
  { label: "-1 až < 0 %", min: -0.01, max: 0 },
  { label: "-3 až -1 %", min: -0.03, max: -0.01 },
  { label: "-5 až -3 %", min: -0.05, max: -0.03 },
  { label: "< -5 %", min: -Infinity, max: -0.05 },
];

const CZK_BUCKETS = [
  { label: "> 100 mil.", min: 100_000_000, max: Infinity },
  { label: "10 až 100 mil.", min: 10_000_000, max: 100_000_000 },
  { label: "1 až 10 mil.", min: 1_000_000, max: 10_000_000 },
  { label: "> 0 až 1 mil.", min: 0, max: 1_000_000, includeMin: false },
  { label: "0 Kč", exact: 0 },
  { label: "-1 mil. až < 0", min: -1_000_000, max: 0 },
  { label: "-10 až -1 mil.", min: -10_000_000, max: -1_000_000 },
  { label: "-100 až -10 mil.", min: -100_000_000, max: -10_000_000 },
  { label: "< -100 mil.", min: -Infinity, max: -100_000_000 },
];

const SIZE_CATEGORIES = [
  { label: "1-100", min: 0, max: 100 },
  { label: "101-200", min: 101, max: 200 },
  { label: "201-500", min: 201, max: 500 },
  { label: "501-800", min: 501, max: 800 },
  { label: "801-2 000", min: 801, max: 2_000 },
  { label: "2-5 tis.", min: 2_001, max: 5_000 },
  { label: "5-10 tis.", min: 5_001, max: 10_000 },
  { label: "10-20 tis.", min: 10_001, max: 20_000 },
  { label: "20-49 tis.", min: 20_001, max: 49_000 },
  { label: "49-150 tis.", note: "krajská města a regionální centra", min: 49_001, max: 150_000 },
  { label: "150-500 tis.", note: "Brno, Ostrava, Plzeň", min: 150_001, max: 500_000 },
  { label: "500 tis.+", note: "Praha", min: 500_001, max: Infinity },
];

const DIFF_EPSILON_CZK = 0.5;
const ZERO_TARGET_SURPLUS_CZK = 0.01;

const state = {
  behaviorUploads: {
    enterprise: null,
    association: null,
  },
  behaviors: [],
  tableSorts: {
    results: null,
    orpResults: null,
    regionResults: null,
  },
};

const el = (id) => document.getElementById(id);
const collator = new Intl.Collator("cs-CZ", { numeric: true, sensitivity: "base" });

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatCzk(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 2)} mld. Kč`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mil. Kč`;
  return `${formatNumber(value, 0)} Kč`;
}

function formatPct(value, digits = 2) {
  return `${formatNumber(value * 100, digits)}\u00a0%`;
}

function fixedPoolSourceLabel(year) {
  const numericYear = Number(year);
  if (numericYear === 2025) return "Realita dle Monitoru st. pokl.";
  if (numericYear === 2026) return "Předpoklad MF ČR";
  if (numericYear === 2027 || numericYear === 2028) return "Predikce MF ČR";
  return "";
}

function dpfoMetricLabel(metric) {
  if (metric.id === "employees") return "Zaměstnanci dle místa výk. práce";
  return metric.label;
}

function renderPoolExplainer(year) {
  const sharedAmount = year.standardPool ?? 0;
  const motivationAmount = year.currentDpfoMotivationAmount ?? Math.max(0, (year.fixedTotalPool ?? 0) - sharedAmount);
  const fixedTotal = year.fixedTotalPool ?? sharedAmount + motivationAmount;

  el("shared-pool-total").textContent = formatCzk(sharedAmount);
  el("shared-pool-share").textContent = fixedTotal ? formatPct(sharedAmount / fixedTotal) : "-";
  el("motivation-pool-total").textContent = formatCzk(motivationAmount);
  el("motivation-pool-share").textContent = fixedTotal ? formatPct(motivationAmount / fixedTotal) : "-";
}

function percentInputValue(value, digits = 2) {
  return Number((value * 100).toFixed(digits));
}

function parseDecimalInput(value) {
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const compact = raw.replace(/\s|\u00a0/g, "");
  const decimal = compact.includes(",") && compact.lastIndexOf(",") > compact.lastIndexOf(".")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(/,/g, "");
  const cleaned = decimal.replace(/[^0-9eE.+-]/g, "");
  if (!/[0-9]/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanValue(value) {
  if (typeof value === "boolean") return value;
  const numeric = parseNumberValue(value);
  if (numeric !== null) return numeric !== 0;
  const normalized = normalizeKey(value);
  if (["ano", "a", "yes", "y", "true", "pravda", "x"].includes(normalized)) return true;
  if (["ne", "no", "n", "false", "nepravda", ""].includes(normalized)) return false;
  return false;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedRecord(row) {
  const record = {};
  for (const [key, value] of Object.entries(row)) {
    record[normalizeKey(key)] = value;
  }
  return record;
}

function firstField(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function parseDelimitedText(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const delimiters = [";", "\t", ","];
  const delimiter = delimiters
    .map((item) => ({ item, count: firstLine.split(item).length }))
    .sort((a, b) => b.count - a.count)[0].item;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => String(value).trim())) rows.push(row);

  const headers = rows.shift() ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function readTableFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (["csv", "tsv", "txt"].includes(extension)) {
    return parseDelimitedText(await file.text());
  }
  if (!window.XLSX) {
    throw new Error("XLSX parser není načtený. Uložte soubor jako CSV nebo zkuste appku otevřít s připojením k internetu.");
  }
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

function setPercentInput(id, value, digits = 2) {
  const input = el(id);
  input.value = percentInputValue(value, digits);
  input.dataset.rawValue = String(value);
  input.dataset.pristine = "true";
}

function readPercentInput(id) {
  const input = el(id);
  if (input.dataset.pristine === "true" && input.dataset.rawValue) {
    return Number(input.dataset.rawValue);
  }
  return parseDecimalInput(input.value) / 100;
}

function transitionMass(population) {
  if (population <= 50) return population;
  if (population <= 2000) return 50 + 1.07 * (population - 50);
  if (population <= 30000) return 2136.5 + 1.1523 * (population - 2000);
  return 34400.9 + 1.3663 * (population - 30000);
}

function sumBy(rows, getter) {
  return rows.reduce((sum, row) => sum + getter(row), 0);
}

const CODE_KEYS = ["kodobec", "kod", "code", "munid", "obecid", "idobce"];
const EMPLOYEE_KEYS = ["zamestnanci", "pocetzamestnancu", "novypocetzamestnancu", "nemployees", "employees", "zamestnancidlemf2026"];
const WAGE_KEYS = ["sumamezdhypoteticka2026", "sumamezd", "objemmezd", "mzdy", "wages", "totalwages", "totalscaledgrossannualwagesczk"];
const WAGE_LIMIT150_KEYS = ["sumamezdhypoteticka2026limit150", "objemmezdlimit150", "objemmezdlimit150k", "mzdylimit150", "wageslimit150", "wageslimited150", "wagescap150"];
const WAGE_LIMIT100_KEYS = ["sumamezdhypoteticka2026limit100", "objemmezdlimit100", "objemmezdlimit100k", "mzdylimit100", "wageslimit100", "wageslimited100", "wagescap100"];
const SO_MEMBER_KEYS = ["clenstvivso", "clenstvso", "somember", "issomember", "anone", "so", "clenstvi", "member"];

function buildEnterpriseOverrides(rows) {
  const overrides = new Map();
  for (const row of rows) {
    const record = normalizedRecord(row);
    const code = parseNumberValue(firstField(record, CODE_KEYS));
    if (!code) continue;
    const employees = parseNumberValue(firstField(record, EMPLOYEE_KEYS));
    const wages = parseNumberValue(firstField(record, WAGE_KEYS));
    const wagesLimit150 = parseNumberValue(firstField(record, WAGE_LIMIT150_KEYS));
    const wagesLimit100 = parseNumberValue(firstField(record, WAGE_LIMIT100_KEYS));
    const override = {};
    if (employees !== null) override.employees = employees;
    if (wages !== null) override.wages = wages;
    if (wagesLimit150 !== null) override.wagesLimit150 = wagesLimit150;
    if (wagesLimit100 !== null) override.wagesLimit100 = wagesLimit100;
    if (Object.keys(override).length) overrides.set(Math.trunc(code), override);
  }
  return overrides;
}

function buildAssociationOverrides(rows) {
  const overrides = new Map();
  for (const row of rows) {
    const record = normalizedRecord(row);
    const code = parseNumberValue(firstField(record, CODE_KEYS));
    const membershipValue = firstField(record, SO_MEMBER_KEYS);
    if (!code || membershipValue === null) continue;
    overrides.set(Math.trunc(code), { isSoMember: parseBooleanValue(membershipValue) });
  }
  return overrides;
}

function mergeOverrides(...maps) {
  const merged = new Map();
  for (const map of maps) {
    if (!map) continue;
    for (const [code, override] of map.entries()) {
      merged.set(code, { ...(merged.get(code) ?? {}), ...override });
    }
  }
  return merged;
}

function rebuildBehaviors() {
  const behaviors = [{ id: "asis", label: "As-is chování", overrides: new Map() }];
  const { enterprise, association } = state.behaviorUploads;
  if (enterprise) behaviors.push({ id: "enterprise", label: "Více podnikavé", overrides: enterprise });
  if (association) behaviors.push({ id: "association", label: "Více sdružené", overrides: association });
  if (enterprise && association) {
    behaviors.push({
      id: "enterprise-association",
      label: "Podnikavé + sdružené",
      overrides: mergeOverrides(enterprise, association),
    });
  }
  state.behaviors = behaviors;
}

function behaviorById(id) {
  return state.behaviors.find((behavior) => behavior.id === id) ?? state.behaviors[0];
}

function rowsForBehavior(behaviorId) {
  const behavior = behaviorById(behaviorId);
  if (!behavior?.overrides?.size) return DATA.municipalities;
  return DATA.municipalities.map((row) => (
    behavior.overrides.has(row.code)
      ? { ...row, ...behavior.overrides.get(row.code) }
      : row
  ));
}

function valueForMetric(row, metric, weightedShares) {
  if (metric === "weightedPopulation") return weightedShares.get(row.code) ?? 0;
  return Number(row[metric] ?? 0);
}

function sharesForMetric(rows, metric, weightedShares, eligible = null) {
  const values = new Map();
  let total = 0;
  for (const row of rows) {
    if (eligible && !eligible(row)) {
      values.set(row.code, 0);
      continue;
    }
    const value = Math.max(0, valueForMetric(row, metric, weightedShares));
    values.set(row.code, value);
    total += value;
  }
  const shares = new Map();
  for (const row of rows) {
    shares.set(row.code, total > 0 ? values.get(row.code) / total : 0);
  }
  return { shares, total };
}

function computeWeightedPopulationShares(rows, coefficients) {
  const specialCodes = new Set(Object.keys(SPECIAL_NAMES).map(Number));
  let denominator = 0;
  let transitionTotal = 0;
  const transitionValues = new Map();

  for (const row of rows) {
    if (specialCodes.has(row.code)) {
      const coefficient = Number(coefficients[String(row.code)] ?? row.currentCoefficient ?? 1);
      denominator += row.population * coefficient;
    } else {
      denominator += row.population;
      const mass = transitionMass(row.population);
      transitionValues.set(row.code, mass);
      transitionTotal += mass;
    }
  }

  const otherPoolShare = denominator > 0
    ? sumBy(rows.filter((row) => !specialCodes.has(row.code)), (row) => row.population) / denominator
    : 0;

  const shares = new Map();
  for (const row of rows) {
    if (specialCodes.has(row.code)) {
      const coefficient = Number(coefficients[String(row.code)] ?? row.currentCoefficient ?? 1);
      shares.set(row.code, denominator > 0 ? (row.population * coefficient) / denominator : 0);
    } else {
      const mass = transitionValues.get(row.code) ?? 0;
      shares.set(row.code, transitionTotal > 0 ? (mass / transitionTotal) * otherPoolShare : 0);
    }
  }
  return shares;
}

function readScenarioFromControls() {
  const specialCoefficients = {};
  for (const code of Object.keys(SPECIAL_NAMES)) {
    specialCoefficients[code] = Number(el(`coef-${code}`).value);
  }
  return {
    year: el("year").value,
    standardWeights: {
      population: readPercentInput("weight-population"),
      weightedPopulation: readPercentInput("weight-weighted"),
      landArea: readPercentInput("weight-area"),
      schoolChildren: readPercentInput("weight-school"),
    },
    dpfoMotivationPercent: readPercentInput("dpfo-percent"),
    dpfoMetric: el("dpfo-metric").value,
    soMetric: el("so-metric").value,
    soEligibility: el("so-eligibility").value,
    specialCoefficients,
  };
}

function baselineScenario(year) {
  return {
    ...DATA.defaultScenario,
    year,
    soEligibility: "mapping",
  };
}

function computeScenario(scenario, rows = DATA.municipalities) {
  const year = DATA.taxVolumes[scenario.year];
  const weightedShares = computeWeightedPopulationShares(rows, scenario.specialCoefficients);
  const metricShares = {
    population: sharesForMetric(rows, "population", weightedShares).shares,
    weightedPopulation: weightedShares,
    landArea: sharesForMetric(rows, "landArea", weightedShares).shares,
    schoolChildren: sharesForMetric(rows, "schoolChildren", weightedShares).shares,
    employees: sharesForMetric(rows, "employees", weightedShares).shares,
    wages: sharesForMetric(rows, "wages", weightedShares).shares,
    wagesLimit150: sharesForMetric(rows, "wagesLimit150", weightedShares).shares,
    wagesLimit100: sharesForMetric(rows, "wagesLimit100", weightedShares).shares,
  };

  const componentAmounts = STANDARD_COMPONENTS.map((component) => {
    const weight = scenario.standardWeights[component.id] ?? 0;
    return {
      ...component,
      weight,
      amount: year.standardPool * weight,
      metricShares: metricShares[component.metric],
    };
  });

  const dpfoAmount = year.dpfoDependentTaxBase * scenario.dpfoMotivationPercent;
  const dpfoMetric = scenario.dpfoMetric ?? "employees";
  const dpfoShares = metricShares[dpfoMetric] ?? metricShares.employees;
  const standardUsed = sumBy(componentAmounts, (component) => component.amount);
  const soAmount = year.fixedTotalPool - standardUsed - dpfoAmount;
  const soValid = soAmount >= -0.5;
  const eligible = scenario.soEligibility === "all"
    ? () => true
    : (row) => Boolean(row.isSoMember);
  const soShareResult = sharesForMetric(rows, scenario.soMetric, weightedShares, eligible);
  const canAllocateSo = soShareResult.total > 0;

  const resultRows = rows.map((row) => {
    const componentValues = {};
    let standardAmount = 0;
    for (const component of componentAmounts) {
      const value = component.amount * (component.metricShares.get(row.code) ?? 0);
      componentValues[component.id] = value;
      standardAmount += value;
    }
    const dpfoValue = dpfoAmount * (dpfoShares.get(row.code) ?? 0);
    const soValue = soValid && canAllocateSo ? soAmount * (soShareResult.shares.get(row.code) ?? 0) : 0;
    const totalAmount = standardAmount + dpfoValue + soValue;
    return {
      ...row,
      components: componentValues,
      standardAmount,
      dpfoMotivationAmount: dpfoValue,
      soAmount: soValue,
      totalAmount,
      shareOfFixedTotal: year.fixedTotalPool ? totalAmount / year.fixedTotalPool : 0,
    };
  });

  const summaries = componentAmounts.map((component) => ({
    id: component.id,
    label: component.label,
    input: formatPct(component.weight),
    amount: component.amount,
    pctStandard: year.standardPool ? component.amount / year.standardPool : 0,
    pctTotal: year.fixedTotalPool ? component.amount / year.fixedTotalPool : 0,
  }));
  summaries.push({
    id: "dpfo",
    label: "Motivace k podnikání",
    input: formatPct(scenario.dpfoMotivationPercent),
    amount: dpfoAmount,
    pctStandard: null,
    pctTotal: year.fixedTotalPool ? dpfoAmount / year.fixedTotalPool : 0,
  });
  summaries.push({
    id: "so",
    label: "Motivace k mikroregionální spolupráci",
    input: "dopočet",
    amount: soAmount,
    pctStandard: year.standardPool ? soAmount / year.standardPool : 0,
    pctTotal: year.fixedTotalPool ? soAmount / year.fixedTotalPool : 0,
  });

  return {
    year,
    rows: resultRows,
    summaries,
    soAmount,
    soValid,
    canAllocateSo,
    standardUsed,
    dpfoAmount,
    scenario,
  };
}

function compareRows(base, scenario) {
  const baseByCode = new Map(base.rows.map((row) => [row.code, row]));
  return scenario.rows.map((row) => {
    const baseRow = baseByCode.get(row.code);
    const baseline = baseRow?.totalAmount ?? 0;
    const rawDiff = row.totalAmount - baseline;
    const diff = Math.abs(rawDiff) < DIFF_EPSILON_CZK ? 0 : rawDiff;
    return {
      ...row,
      baselineAmount: baseline,
      scenarioAmount: row.totalAmount,
      diff,
      diffPct: baseline ? diff / baseline : 0,
    };
  });
}

function aggregateRows(rows, mode) {
  if (mode === "municipality") return rows;
  const groups = new Map();
  for (const row of rows) {
    const groupInfo = groupingForRow(row, mode);
    const key = groupInfo.key;
    if (!groups.has(key)) {
      groups.set(key, {
        code: groupInfo.code,
        name: groupInfo.name,
        population: 0,
        baselineAmount: 0,
        scenarioAmount: 0,
        diff: 0,
        diffPct: 0,
      });
    }
    const group = groups.get(key);
    group.population += row.population;
    group.baselineAmount += row.baselineAmount;
    group.scenarioAmount += row.scenarioAmount;
    group.diff += row.diff;
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    diffPct: group.baselineAmount ? group.diff / group.baselineAmount : 0,
  }));
}

function groupingForRow(row, mode) {
  if (mode === "orp") {
    const key = row.orpCode ?? row.orpName ?? "missing-orp";
    return {
      key,
      code: row.orpCode ?? key,
      name: row.orpName || "Bez ORP",
      regionCode: row.regionCode,
      region: row.region,
      regionAbbreviation: row.regionAbbreviation,
    };
  }
  if (mode === "region") {
    const key = row.regionCode ?? row.region ?? "missing-region";
    return {
      key,
      code: row.regionCode ?? key,
      name: row.region || "Bez kraje",
    };
  }
  if (mode === "so") {
    const key = row.soName || "Bez SO / mapping chybí";
    return { key, code: key, name: key };
  }
  const key = row.district || "Bez okresu";
  return { key, code: key, name: key };
}

function bucketize(rows, buckets, getter) {
  return buckets.map((bucket) => {
    const members = rows.filter((row) => {
      const value = getter(row);
      if ("exact" in bucket) return value === bucket.exact;
      const aboveMin = bucket.includeMin === false ? value > bucket.min : value >= bucket.min;
      return aboveMin && value < bucket.max;
    });
    return {
      ...bucket,
      count: members.length,
      population: sumBy(members, (row) => row.population),
    };
  });
}

function bucketTone(bucket) {
  if (bucket.exact === 0) return "neutral";
  return bucket.max <= 0 ? "loss" : "gain";
}

function sizeCategoryForPopulation(population) {
  return SIZE_CATEGORIES.find((category) => population >= category.min && population <= category.max)
    ?? SIZE_CATEGORIES[SIZE_CATEGORIES.length - 1];
}

function buildSizeImpactRows(rows) {
  const groups = SIZE_CATEGORIES.map((category) => ({
    ...category,
    count: 0,
    population: 0,
    baselineAmount: 0,
    scenarioAmount: 0,
    diff: 0,
    winners: 0,
    losers: 0,
    neutral: 0,
    winnerPopulation: 0,
    loserPopulation: 0,
  }));
  const groupsByLabel = new Map(groups.map((group) => [group.label, group]));

  for (const row of rows) {
    const group = groupsByLabel.get(sizeCategoryForPopulation(row.population).label);
    group.count += 1;
    group.population += row.population;
    group.baselineAmount += row.baselineAmount;
    group.scenarioAmount += row.scenarioAmount;
    group.diff += row.diff;
    if (row.diff > DIFF_EPSILON_CZK) {
      group.winners += 1;
      group.winnerPopulation += row.population;
    } else if (row.diff < -DIFF_EPSILON_CZK) {
      group.losers += 1;
      group.loserPopulation += row.population;
    } else {
      group.neutral += 1;
    }
  }

  return groups.map((group) => ({
    ...group,
    diffPct: group.baselineAmount ? group.diff / group.baselineAmount : 0,
    diffPerCapita: group.population ? group.diff / group.population : 0,
    diffPerMunicipality: group.count ? group.diff / group.count : 0,
    baselinePerCapita: group.population ? group.baselineAmount / group.population : 0,
  }));
}

function formatCzkPerCapita(value) {
  return `${formatCzk(value)} / ob.`;
}

function formatCzkPerMunicipality(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 2)} mldKč/o.`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} mKč/o.`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 0)} tisKč/o.`;
  return `${formatCzk(value)} / o.`;
}

function sizeCategoryLabel(row) {
  return `
    <span class="size-category-main">${row.label}</span>
    <span class="size-category-note">${row.note ?? ""}</span>
  `;
}

function zeroHintText(componentId, selectedWeight, requiredWeight, soAmount) {
  const component = STANDARD_COMPONENTS.find((item) => item.id === componentId);
  const label = component?.label ?? "vybranou složku";
  if (Math.abs(soAmount) < DIFF_EPSILON_CZK) {
    return `Částka motivace k mikroregionální spolupráci už je 0 Kč. Parametr ${label} může zůstat ${formatPct(selectedWeight, 4)}.`;
  }

  const delta = requiredWeight - selectedWeight;
  const direction = delta > 0 ? "zvýšit" : "snížit";
  return `Pro vynulování částky zbývající na motivaci k mikroregionální spolupráci nastavte ${label} na ${formatPct(requiredWeight, 4)} (${direction} o ${formatPct(Math.abs(delta), 4)}).`;
}

function zeroAdjustmentTarget(scenario, result) {
  const componentId = el("zero-component").value;
  const component = STANDARD_COMPONENTS.find((item) => item.id === componentId);
  const selectedWeight = scenario.standardWeights[componentId] ?? 0;
  const requiredWeight = result.year.standardPool
    ? selectedWeight + (result.soAmount - ZERO_TARGET_SURPLUS_CZK) / result.year.standardPool
    : NaN;
  return {
    component,
    componentId,
    selectedWeight,
    requiredWeight,
    canApply: Boolean(component) && Number.isFinite(requiredWeight),
  };
}

function dpfoFixedShareClass(value) {
  if (value < 0.05) return "dpfo-fixed-share dpfo-share-low";
  if (value < 0.10) return "dpfo-fixed-share dpfo-share-mid-low";
  if (value < 0.20) return "dpfo-fixed-share dpfo-share-mid";
  if (value < 0.30) return "dpfo-fixed-share dpfo-share-high";
  return "dpfo-fixed-share dpfo-share-very-high";
}

function renderBudget(result) {
  const body = el("budget-body");
  body.innerHTML = "";
  for (const row of result.summaries) {
    const tr = document.createElement("tr");
    const displayAmount = Math.abs(row.amount) < DIFF_EPSILON_CZK ? 0 : row.amount;
    const displayPctStandard = row.pctStandard === null ? null : (displayAmount === 0 ? 0 : row.pctStandard);
    const displayPctTotal = displayAmount === 0 ? 0 : row.pctTotal;
    if (row.id === "so") tr.className = displayAmount < 0 ? "invalid-row" : "motivation-row";
    if (row.id === "dpfo") tr.className = "motivation-row";
    const fixedShareClass = row.id === "dpfo" ? dpfoFixedShareClass(displayPctTotal) : "";
    const inputCell = row.id === "dpfo"
      ? `${row.input}<span class="cell-note">z DPFO zč</span>`
      : row.input;
    tr.innerHTML = `
      <td>${row.label}</td>
      <td>${inputCell}</td>
      <td>${formatCzk(displayAmount)}</td>
      <td>${displayPctStandard === null ? "" : formatPct(displayPctStandard)}</td>
      <td class="${fixedShareClass}">${formatPct(displayPctTotal)}</td>
    `;
    body.appendChild(tr);
  }
}

function renderBuckets(id, buckets, rows, options = {}) {
  const entityLabel = options.entityLabel ?? "obcí";
  const scaleBy = options.scaleBy ?? "count";
  const container = el(id);
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const maxPopulation = Math.max(1, ...buckets.map((bucket) => bucket.population));
  const totalPopulation = Math.max(1, sumBy(rows, (row) => row.population));
  container.innerHTML = "";
  for (const bucket of buckets) {
    const populationShare = bucket.population / totalPopulation;
    const width = scaleBy === "populationShare"
      ? (bucket.population / maxPopulation) * 100
      : (bucket.count / maxCount) * 100;
    const detail = scaleBy === "populationShare"
      ? `${formatPct(populationShare, 1)} obyv.`
      : `${formatNumber(bucket.count)} ${entityLabel}`;
    const item = document.createElement("div");
    item.className = "bucket";
    item.innerHTML = `
      <div class="bucket-label">
        <strong>${bucket.label}</strong>
        <span>${detail}</span>
      </div>
      <div class="bar-track">
        <div class="bar ${bucketTone(bucket)}" style="width:${width}%"></div>
      </div>
    `;
    container.appendChild(item);
  }
}

function renderSizeImpactChart(id, rows, getter, formatter) {
  const container = el(id);
  const maxAbs = Math.max(...rows.map((row) => Math.abs(getter(row))));
  const scale = maxAbs || 1;
  const gridTemplate = `var(--size-row-label-width) repeat(${rows.length}, minmax(62px, 1fr))`;
  container.innerHTML = "";

  const columns = rows.map((row) => {
    const value = getter(row);
    const height = value === 0 ? 0 : Math.max(3, (Math.abs(value) / scale) * 44);
    const tone = value < 0 ? "loss" : value > 0 ? "gain" : "neutral";
    const barStyle = value < 0
      ? `top:50%;height:${height}%`
      : `bottom:50%;height:${height}%`;
    return `
      <div class="size-column">
        <div class="size-column-value ${sortClassForDiff(value)}">${formatter(value)}</div>
        <div class="size-column-area">
          <div class="size-column-bar ${tone}" style="${barStyle}"></div>
        </div>
      </div>
    `;
  }).join("");

  const categoryCells = rows.map((row) => `
    <div class="size-matrix-category">${sizeCategoryLabel(row)}</div>
  `).join("");

  const matrixRows = [
    {
      label: "Obcí",
      values: rows.map((row) => formatNumber(row.count)),
    },
    {
      label: "Obyvatelé",
      values: rows.map((row) => formatNumber(row.population)),
    },
    {
      label: "A Kč/obyv.",
      values: rows.map((row) => formatCzk(row.baselinePerCapita)),
    },
    {
      label: "Plus",
      className: "positive",
      values: rows.map((row) => `
        <span>${formatNumber(row.winners)}</span>
        <span class="size-matrix-subvalue">${formatNumber(row.winnerPopulation)} obyv.</span>
      `),
    },
    {
      label: "Minus",
      className: "negative",
      values: rows.map((row) => `
        <span>${formatNumber(row.losers)}</span>
        <span class="size-matrix-subvalue">${formatNumber(row.loserPopulation)} obyv.</span>
      `),
    },
  ].map((row) => `
    <div class="size-matrix-row" style="grid-template-columns:${gridTemplate}">
      <div class="size-matrix-label">${row.label}</div>
      ${row.values.map((value) => `<div class="size-matrix-cell ${row.className ?? ""}">${value}</div>`).join("")}
    </div>
  `).join("");

  container.innerHTML = `
    <div class="size-aligned-wrap">
      <div class="size-aligned-inner">
        <div class="size-column-plot" style="grid-template-columns:${gridTemplate}">
          <div class="size-plot-spacer" aria-hidden="true"></div>
          ${columns}
        </div>
        <div class="size-category-matrix">
          <div class="size-matrix-row size-matrix-header" style="grid-template-columns:${gridTemplate}">
            <div class="size-matrix-label" aria-hidden="true"></div>
            ${categoryCells}
          </div>
          ${matrixRows}
        </div>
      </div>
    </div>
  `;
}

function scenarioForLegislation(type, currentScenario, year) {
  return type === "baseline" ? baselineScenario(year) : { ...currentScenario, year };
}

function legislationLabel(type) {
  return type === "baseline" ? "Baseline" : "Scénář";
}

function slotLetter(index) {
  return String.fromCharCode(65 + index);
}

function readComparisonSlots(currentScenario) {
  return [0, 1, 2]
    .filter((index) => index === 0 || el(`comparison-visible-${index}`).checked)
    .map((index) => {
      const legislation = el(`comparison-legislation-${index}`).value;
      const year = el(`comparison-year-${index}`).value || currentScenario.year;
      const behaviorId = el(`comparison-behavior-${index}`).value || "asis";
      const behavior = behaviorById(behaviorId);
      return {
        id: `slot-${index}`,
        index,
        legislation,
        year,
        behaviorId: behavior.id,
        label: `${legislationLabel(legislation)} ${year} / ${behavior.label}`,
        scenario: scenarioForLegislation(legislation, currentScenario, year),
      };
    });
}

function buildComparison(currentScenario) {
  const scenarios = readComparisonSlots(currentScenario).map((slot) => ({
    ...slot,
    result: computeScenario(slot.scenario, rowsForBehavior(slot.behaviorId)),
  }));
  const resultMaps = scenarios.map((slot) => ({
    ...slot,
    rowsByCode: new Map(slot.result.rows.map((row) => [row.code, row])),
  }));
  const rows = DATA.municipalities.map((row) => {
    const totals = {};
    for (const slot of resultMaps) {
      totals[slot.id] = slot.rowsByCode.get(row.code)?.totalAmount ?? 0;
    }
    return {
      code: row.code,
      name: row.name,
      regionCode: row.regionCode,
      region: row.region,
      regionAbbreviation: REGION_ABBREVIATIONS[row.regionCode] ?? "",
      district: row.district,
      orpCode: row.orpCode,
      orpName: row.orpName,
      soName: row.soName,
      population: row.population,
      totals,
    };
  });
  return { scenarios, rows };
}

function normalizedDiff(value) {
  return Math.abs(value) < DIFF_EPSILON_CZK ? 0 : value;
}

function diffForScenario(row, reference, scenario) {
  return normalizedDiff((row.totals[scenario.id] ?? 0) - (row.totals[reference.id] ?? 0));
}

function diffPctForScenario(row, reference, scenario) {
  const referenceAmount = row.totals[reference.id] ?? 0;
  const diff = diffForScenario(row, reference, scenario);
  return referenceAmount ? diff / referenceAmount : 0;
}

function amountForDisplay(row, scenario, valueMode) {
  const amount = row.totals[scenario.id] ?? 0;
  return valueMode === "perCapita" && row.population ? amount / row.population : amount;
}

function diffForDisplay(row, reference, scenario, valueMode) {
  const diff = diffForScenario(row, reference, scenario);
  return valueMode === "perCapita" && row.population ? diff / row.population : diff;
}

function formatDisplayedAmount(value, valueMode) {
  return valueMode === "perCapita" ? `${formatNumber(value, 0)} Kč` : formatCzk(value);
}

function sortClassForDiff(value) {
  if (value < 0) return "negative";
  if (value > 0) return "positive";
  return "";
}

function primaryComparisonRows(comparison) {
  const reference = comparison.scenarios[0];
  const target = comparison.scenarios[1] ?? reference;
  return comparison.rows.map((row) => {
    const baseline = row.totals[reference.id] ?? 0;
    const scenario = row.totals[target.id] ?? 0;
    const diff = normalizedDiff(scenario - baseline);
    return {
      ...row,
      baselineAmount: baseline,
      scenarioAmount: scenario,
      diff,
      diffPct: baseline ? diff / baseline : 0,
    };
  });
}

function aggregateComparisonRows(rows, mode, scenarios) {
  if (mode === "municipality") return rows;
  const groups = new Map();
  for (const row of rows) {
    const groupInfo = groupingForRow(row, mode);
    const key = groupInfo.key;
    if (!groups.has(key)) {
      groups.set(key, {
        code: groupInfo.code,
        name: groupInfo.name,
        regionCode: groupInfo.regionCode,
        region: groupInfo.region,
        regionAbbreviation: groupInfo.regionAbbreviation,
        population: 0,
        totals: Object.fromEntries(scenarios.map((scenario) => [scenario.id, 0])),
      });
    }
    const group = groups.get(key);
    group.population += row.population;
    for (const scenario of scenarios) {
      group.totals[scenario.id] += row.totals[scenario.id] ?? 0;
    }
  }
  return Array.from(groups.values());
}

function resultColumns(scenarios, valueMode = "total", mode = "municipality") {
  const reference = scenarios[0];
  const perCapita = valueMode === "perCapita";
  const showRegionAbbreviation = mode === "municipality" || mode === "orp";
  const amountColumns = scenarios.map((scenario) => ({
    key: `amount:${scenario.id}`,
    label: perCapita ? `${scenario.label} Kč/obyv.` : scenario.label,
    type: "number",
    defaultDirection: "desc",
    get: (row) => amountForDisplay(row, scenario, valueMode),
    render: (row) => formatDisplayedAmount(amountForDisplay(row, scenario, valueMode), valueMode),
  }));
  const diffColumns = scenarios.slice(1).flatMap((scenario) => {
    const slotLabel = `${slotLetter(scenario.index)} - A`;
    return [
      {
        key: `diff:${scenario.id}:czk`,
        label: perCapita ? `Rozdíl ${slotLabel} Kč/obyv.` : `Rozdíl ${slotLabel} Kč`,
        type: "number",
        defaultDirection: "desc",
        get: (row) => diffForDisplay(row, reference, scenario, valueMode),
        render: (row) => formatDisplayedAmount(diffForDisplay(row, reference, scenario, valueMode), valueMode),
        className: (row) => sortClassForDiff(diffForScenario(row, reference, scenario)),
      },
      {
        key: `diff:${scenario.id}:pct`,
        label: `Rozdíl ${slotLabel} %`,
        type: "number",
        defaultDirection: "desc",
        get: (row) => diffPctForScenario(row, reference, scenario),
        render: (row) => formatPct(diffPctForScenario(row, reference, scenario)),
        className: (row) => sortClassForDiff(diffForScenario(row, reference, scenario)),
      },
    ];
  });

  return [
    {
      key: "name",
      label: "Název",
      type: "text",
      defaultDirection: "asc",
      get: (row) => row.name,
      render: (row) => row.name,
    },
    ...(showRegionAbbreviation ? [{
      key: "regionAbbreviation",
      label: "Kraj",
      type: "text",
      defaultDirection: "asc",
      get: (row) => row.regionAbbreviation ?? "",
      render: (row) => row.regionAbbreviation ?? "",
      className: () => "region-abbreviation",
    }] : []),
    {
      key: "code",
      label: "Kód",
      type: "number",
      defaultDirection: "asc",
      get: (row) => row.code,
      render: (row) => formatNumber(row.code),
    },
    {
      key: "population",
      label: "Obyvatelé",
      type: "number",
      defaultDirection: "desc",
      get: (row) => row.population,
      render: (row) => formatNumber(row.population),
    },
    ...amountColumns,
    ...diffColumns,
  ];
}

function compareByColumn(a, b, column) {
  if (column.type === "text") {
    return collator.compare(String(column.get(a) ?? ""), String(column.get(b) ?? ""));
  }
  const aValue = Number(column.get(a));
  const bValue = Number(column.get(b));
  const safeA = Number.isFinite(aValue) ? aValue : Number.NEGATIVE_INFINITY;
  const safeB = Number.isFinite(bValue) ? bValue : Number.NEGATIVE_INFINITY;
  return safeA - safeB;
}

function sortedResultRows(rows, columns, sortState, reference, primaryTarget, valueMode = "total") {
  const activeColumn = columns.find((column) => column.key === sortState?.key);
  return rows.sort((a, b) => {
    if (!activeColumn) {
      const aDiff = Math.abs(diffForDisplay(a, reference, primaryTarget, valueMode));
      const bDiff = Math.abs(diffForDisplay(b, reference, primaryTarget, valueMode));
      const fallback = bDiff - aDiff;
      return fallback || collator.compare(String(a.name ?? ""), String(b.name ?? ""));
    }
    const valueCompare = compareByColumn(a, b, activeColumn);
    const directedCompare = sortState.direction === "desc" ? -valueCompare : valueCompare;
    return directedCompare || collator.compare(String(a.name ?? ""), String(b.name ?? ""));
  });
}

function headerCell(column, sortState) {
  const active = sortState?.key === column.key;
  const direction = active ? sortState.direction : "";
  const indicator = active ? (direction === "desc" ? "↓" : "↑") : "";
  return `
    <th>
      <button type="button" class="sort-button ${active ? "active" : ""}" data-sort-key="${column.key}" aria-label="Seřadit podle ${column.label}">
        <span>${column.label}</span>
        <span class="sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>
  `;
}

function attachSortHandlers(head, columns, tableKey) {
  for (const button of head.querySelectorAll("[data-sort-key]")) {
    button.addEventListener("click", () => {
      const column = columns.find((item) => item.key === button.dataset.sortKey);
      if (!column) return;
      const current = state.tableSorts[tableKey];
      const direction = current?.key === column.key
        ? (current.direction === "desc" ? "asc" : "desc")
        : column.defaultDirection;
      state.tableSorts[tableKey] = { key: column.key, direction };
      render();
    });
  }
}

function renderResults(comparison, options = {}) {
  const headId = options.headId ?? "result-head";
  const bodyId = options.bodyId ?? "result-body";
  const mode = options.mode ?? el("aggregation").value;
  const searchId = options.searchId ?? "search";
  const regionFilterId = options.regionFilterId ?? null;
  const orpFilterId = options.orpFilterId ?? null;
  const maxRows = options.maxRows ?? 250;
  const tableKey = options.tableKey ?? "results";
  const valueMode = options.valueMode ?? (tableKey === "results" ? (el("result-value-mode")?.value ?? "total") : "total");
  const scenarios = comparison.scenarios;
  const reference = scenarios[0];
  const primaryTarget = scenarios[1] ?? reference;
  const columns = resultColumns(scenarios, valueMode, mode);
  const sortState = state.tableSorts[tableKey];
  const searchInput = searchId ? el(searchId) : null;
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const regionFilter = regionFilterId ? el(regionFilterId).value : "";
  const orpFilter = orpFilterId ? el(orpFilterId).value : "";
  const sourceRows = comparison.rows
    .filter((row) => !regionFilter || String(row.regionCode ?? "") === regionFilter)
    .filter((row) => !orpFilter || String(row.orpCode ?? "") === orpFilter);
  const filteredRows = aggregateComparisonRows(sourceRows, mode, scenarios)
    .filter((row) => !query || String(row.name).toLowerCase().includes(query));
  const aggregated = sortedResultRows(filteredRows, columns, sortState, reference, primaryTarget, valueMode)
    .slice(0, maxRows);

  const head = el(headId);
  head.innerHTML = `
    <tr>
      ${columns.map((column) => headerCell(column, sortState)).join("")}
    </tr>
  `;
  attachSortHandlers(head, columns, tableKey);

  const body = el(bodyId);
  body.innerHTML = "";
  for (const row of aggregated) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      ${columns.map((column) => `<td class="${column.className ? column.className(row) : ""}">${column.render(row)}</td>`).join("")}
    `;
    body.appendChild(tr);
  }
}

function render() {
  const scenario = readScenarioFromControls();
  const custom = computeScenario(scenario);
  const comparison = buildComparison(scenario);
  const primaryCompared = primaryComparisonRows(comparison);
  const primaryTarget = comparison.scenarios[1] ?? comparison.scenarios[0];
  const primaryComparedByOrp = aggregateRows(primaryCompared, "orp");
  const primaryComparedByRegion = aggregateRows(primaryCompared, "region");
  const sizeImpactRows = buildSizeImpactRows(primaryCompared);

  const winners = primaryCompared.filter((row) => row.diff > 0.5);
  const losers = primaryCompared.filter((row) => row.diff < -0.5);
  const winnerPopulation = sumBy(winners, (row) => row.population);
  const loserPopulation = sumBy(losers, (row) => row.population);
  const orpWinners = primaryComparedByOrp.filter((row) => row.diff > 0.5);
  const orpLosers = primaryComparedByOrp.filter((row) => row.diff < -0.5);
  const orpWinnerPopulation = sumBy(orpWinners, (row) => row.population);
  const orpLoserPopulation = sumBy(orpLosers, (row) => row.population);
  const regionWinners = primaryComparedByRegion.filter((row) => row.diff > 0.5);
  const regionLosers = primaryComparedByRegion.filter((row) => row.diff < -0.5);
  const regionWinnerPopulation = sumBy(regionWinners, (row) => row.population);
  const regionLoserPopulation = sumBy(regionLosers, (row) => row.population);

  el("fixed-total").textContent = formatCzk(custom.year.fixedTotalPool);
  el("fixed-total-source").textContent = fixedPoolSourceLabel(scenario.year);
  renderPoolExplainer(custom.year);
  el("winner-count").textContent = formatNumber(winners.length);
  el("winner-population").textContent = formatNumber(winnerPopulation);
  el("loser-count").textContent = formatNumber(losers.length);
  el("loser-population").textContent = formatNumber(loserPopulation);
  el("orp-winner-count").textContent = formatNumber(orpWinners.length);
  el("orp-winner-population").textContent = formatNumber(orpWinnerPopulation);
  el("orp-loser-count").textContent = formatNumber(orpLosers.length);
  el("orp-loser-population").textContent = formatNumber(orpLoserPopulation);
  el("region-winner-count").textContent = formatNumber(regionWinners.length);
  el("region-winner-population").textContent = formatNumber(regionWinnerPopulation);
  el("region-loser-count").textContent = formatNumber(regionLosers.length);
  el("region-loser-population").textContent = formatNumber(regionLoserPopulation);
  el("size-impact-comparison").textContent = `${slotLetter(primaryTarget.index)} - A`;

  const validity = el("scenario-validity");
  if (!custom.soValid) {
    validity.textContent = "Nevalidní";
    validity.className = "pill bad";
  } else if (!custom.canAllocateSo && custom.soAmount > 0) {
    validity.textContent = "Chybí SO";
    validity.className = "pill warn";
  } else {
    validity.textContent = custom.soAmount === 0 ? "SO = 0" : "Validní";
    validity.className = "pill good";
  }

  const zeroTarget = zeroAdjustmentTarget(scenario, custom);
  el("zero-hint").textContent = zeroHintText(
    zeroTarget.componentId,
    zeroTarget.selectedWeight,
    zeroTarget.requiredWeight,
    custom.soAmount,
  );
  const zeroApply = el("zero-apply");
  const hasResidualToApply = Math.abs(custom.soAmount) >= DIFF_EPSILON_CZK || custom.soAmount < 0;
  zeroApply.disabled = !zeroTarget.canApply || !hasResidualToApply;
  zeroApply.title = zeroTarget.canApply
    ? "Jednorázově nastaví vybraný parametr tak, aby motivace k mikroregionální spolupráci vyšla 0 Kč."
    : "Dopočet není pro aktuální nastavení dostupný.";

  renderBudget(custom);
  const pctBuckets = bucketize(primaryCompared, PCT_BUCKETS, (row) => row.diffPct);
  const czkBuckets = bucketize(primaryCompared, CZK_BUCKETS, (row) => row.diff);
  renderBuckets("pct-buckets", pctBuckets, primaryCompared);
  renderBuckets("pct-population-buckets", pctBuckets, primaryCompared, { scaleBy: "populationShare" });
  renderBuckets("czk-buckets", czkBuckets, primaryCompared);
  renderBuckets("czk-population-buckets", czkBuckets, primaryCompared, { scaleBy: "populationShare" });
  renderSizeImpactChart("size-impact-pct", sizeImpactRows, (row) => row.diffPct, (value) => formatPct(value));
  renderSizeImpactChart("size-impact-czk", sizeImpactRows, (row) => row.diff, (value) => formatCzk(value));
  renderSizeImpactChart("size-impact-per-capita", sizeImpactRows, (row) => row.diffPerCapita, formatCzkPerCapita);
  renderSizeImpactChart("size-impact-per-municipality", sizeImpactRows, (row) => row.diffPerMunicipality, formatCzkPerMunicipality);
  renderResults(comparison, {
    regionFilterId: "region-filter",
    orpFilterId: "orp-filter",
  });
  renderBuckets(
    "orp-pct-buckets",
    bucketize(primaryComparedByOrp, PCT_BUCKETS, (row) => row.diffPct),
    primaryComparedByOrp,
    { entityLabel: "ORP" },
  );
  renderBuckets(
    "orp-pct-population-buckets",
    bucketize(primaryComparedByOrp, PCT_BUCKETS, (row) => row.diffPct),
    primaryComparedByOrp,
    { entityLabel: "ORP", scaleBy: "populationShare" },
  );
  renderBuckets(
    "orp-czk-buckets",
    bucketize(primaryComparedByOrp, CZK_BUCKETS, (row) => row.diff),
    primaryComparedByOrp,
    { entityLabel: "ORP" },
  );
  renderBuckets(
    "orp-czk-population-buckets",
    bucketize(primaryComparedByOrp, CZK_BUCKETS, (row) => row.diff),
    primaryComparedByOrp,
    { entityLabel: "ORP", scaleBy: "populationShare" },
  );
  renderResults(comparison, {
    headId: "orp-result-head",
    bodyId: "orp-result-body",
    mode: "orp",
    searchId: "orp-search",
    regionFilterId: "orp-region-filter",
    tableKey: "orpResults",
    valueMode: el("orp-result-value-mode")?.value ?? "total",
  });
  renderBuckets(
    "region-pct-buckets",
    bucketize(primaryComparedByRegion, PCT_BUCKETS, (row) => row.diffPct),
    primaryComparedByRegion,
    { entityLabel: "krajů" },
  );
  renderBuckets(
    "region-pct-population-buckets",
    bucketize(primaryComparedByRegion, PCT_BUCKETS, (row) => row.diffPct),
    primaryComparedByRegion,
    { entityLabel: "krajů", scaleBy: "populationShare" },
  );
  renderBuckets(
    "region-czk-buckets",
    bucketize(primaryComparedByRegion, CZK_BUCKETS, (row) => row.diff),
    primaryComparedByRegion,
    { entityLabel: "krajů" },
  );
  renderBuckets(
    "region-czk-population-buckets",
    bucketize(primaryComparedByRegion, CZK_BUCKETS, (row) => row.diff),
    primaryComparedByRegion,
    { entityLabel: "krajů", scaleBy: "populationShare" },
  );
  renderResults(comparison, {
    headId: "region-result-head",
    bodyId: "region-result-body",
    mode: "region",
    searchId: "region-search",
    tableKey: "regionResults",
    maxRows: 50,
    valueMode: el("region-result-value-mode")?.value ?? "total",
  });
}

function renderBehaviorOptions() {
  for (const select of document.querySelectorAll(".comparison-behavior")) {
    const current = select.value || "asis";
    select.innerHTML = "";
    for (const behavior of state.behaviors) {
      const option = document.createElement("option");
      option.value = behavior.id;
      option.textContent = behavior.label;
      select.appendChild(option);
    }
    select.value = state.behaviors.some((behavior) => behavior.id === current) ? current : "asis";
  }
}

function populateYearSelect(select, years, selectedYear) {
  select.innerHTML = "";
  for (const year of years) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  }
  select.value = selectedYear;
}

function populateRegionFilter(selectId = "region-filter") {
  const select = el(selectId);
  const regionsByCode = new Map();
  for (const row of DATA.municipalities) {
    const code = String(row.regionCode ?? "");
    if (!code || regionsByCode.has(code)) continue;
    const abbreviation = REGION_ABBREVIATIONS[row.regionCode] ?? "";
    regionsByCode.set(code, {
      code,
      label: abbreviation ? `${abbreviation} - ${row.region}` : row.region,
    });
  }

  select.innerHTML = '<option value="">Filtr kraj: vše</option>';
  for (const region of Array.from(regionsByCode.values()).sort((a, b) => collator.compare(a.label, b.label))) {
    const option = document.createElement("option");
    option.value = region.code;
    option.textContent = region.label;
    select.appendChild(option);
  }
}

function populateOrpFilter() {
  const select = el("orp-filter");
  const current = select.value;
  const selectedRegion = el("region-filter").value;
  const orpsByCode = new Map();
  for (const row of DATA.municipalities) {
    if (selectedRegion && String(row.regionCode ?? "") !== selectedRegion) continue;
    const code = String(row.orpCode ?? "");
    if (!code || orpsByCode.has(code)) continue;
    orpsByCode.set(code, {
      code,
      label: `${code} - ${row.orpName || "Bez ORP"}`,
    });
  }

  select.innerHTML = '<option value="">Filtr ORP: vše</option>';
  for (const orp of Array.from(orpsByCode.values()).sort((a, b) => collator.compare(a.label, b.label))) {
    const option = document.createElement("option");
    option.value = orp.code;
    option.textContent = orp.label;
    select.appendChild(option);
  }
  select.value = orpsByCode.has(current) ? current : "";
}

function syncComparisonYearsToDefault() {
  const defaultYear = el("year").value;
  for (const select of document.querySelectorAll(".comparison-year")) {
    if (select.dataset.followDefault !== "false") {
      select.value = defaultYear;
      select.dataset.followDefault = "true";
    }
  }
}

function activateUploadedBehavior(behaviorId) {
  const slotVisible = el("comparison-visible-2");
  if (!slotVisible.checked) {
    slotVisible.checked = true;
    el("comparison-legislation-2").value = "custom";
    el("comparison-behavior-2").value = behaviorId;
  }
}

async function handleBehaviorUpload(kind, file, statusId) {
  if (!file) return;
  const status = el(statusId);
  status.textContent = "Načítám...";
  try {
    const rows = await readTableFile(file);
    const overrides = kind === "enterprise"
      ? buildEnterpriseOverrides(rows)
      : buildAssociationOverrides(rows);
    if (!overrides.size) {
      throw new Error("Soubor neobsahuje použitelné řádky.");
    }
    state.behaviorUploads[kind] = overrides;
    rebuildBehaviors();
    renderBehaviorOptions();
    activateUploadedBehavior(kind);
    status.textContent = `${file.name}: ${formatNumber(overrides.size)} obcí`;
    render();
  } catch (error) {
    state.behaviorUploads[kind] = null;
    rebuildBehaviors();
    renderBehaviorOptions();
    status.textContent = error.message;
    render();
  }
}

function initControls() {
  rebuildBehaviors();
  const years = Object.keys(DATA.taxVolumes).sort();
  const yearSelect = el("year");
  populateYearSelect(yearSelect, years, DATA.defaultScenario.year);
  for (const select of document.querySelectorAll(".comparison-year")) {
    populateYearSelect(select, years, DATA.defaultScenario.year);
    select.dataset.followDefault = "true";
    select.addEventListener("change", () => {
      select.dataset.followDefault = select.value === yearSelect.value ? "true" : "false";
    });
  }
  yearSelect.addEventListener("change", syncComparisonYearsToDefault);

  setPercentInput("weight-population", DATA.defaultScenario.standardWeights.population);
  setPercentInput("weight-weighted", DATA.defaultScenario.standardWeights.weightedPopulation);
  setPercentInput("weight-area", DATA.defaultScenario.standardWeights.landArea);
  setPercentInput("weight-school", DATA.defaultScenario.standardWeights.schoolChildren);
  setPercentInput("dpfo-percent", DATA.defaultScenario.dpfoMotivationPercent);
  populateRegionFilter();
  populateRegionFilter("orp-region-filter");
  populateOrpFilter();

  for (const metric of DATA.dpfoMetrics ?? [{ id: "employees", label: "Zaměstnanci" }]) {
    const option = document.createElement("option");
    option.value = metric.id;
    option.textContent = dpfoMetricLabel(metric);
    el("dpfo-metric").appendChild(option);
  }
  el("dpfo-metric").value = DATA.defaultScenario.dpfoMetric ?? "employees";
  renderBehaviorOptions();

  for (const indicator of DATA.indicators.filter((item) => item.id !== "weightedPopulation")) {
    const option = document.createElement("option");
    option.value = indicator.id;
    option.textContent = indicator.label;
    el("so-metric").appendChild(option);
  }
  el("so-metric").value = DATA.defaultScenario.soMetric;
  el("so-eligibility").value = DATA.dataStatus.soMapping === "loaded" ? DATA.defaultScenario.soEligibility : "all";

  for (const code of Object.keys(SPECIAL_NAMES)) {
    el(`coef-${code}`).value = DATA.defaultScenario.specialCoefficients[code] ?? 1;
  }

  el("enterprise-upload").addEventListener("change", (event) => {
    handleBehaviorUpload("enterprise", event.target.files?.[0], "enterprise-status");
  });
  el("association-upload").addEventListener("change", (event) => {
    handleBehaviorUpload("association", event.target.files?.[0], "association-status");
  });
  el("region-filter").addEventListener("change", populateOrpFilter);
  el("zero-apply").addEventListener("click", () => {
    const scenario = readScenarioFromControls();
    const result = computeScenario(scenario);
    const zeroTarget = zeroAdjustmentTarget(scenario, result);
    if (!zeroTarget.canApply) return;
    setPercentInput(zeroTarget.component.input, zeroTarget.requiredWeight, 8);
    render();
  });

  document.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("input", () => {
      control.dataset.pristine = "false";
      render();
    });
    control.addEventListener("change", render);
  });
}

initControls();
render();
