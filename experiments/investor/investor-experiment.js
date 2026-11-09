(function (root) {
  "use strict";

  const METRICS = ["population", "landArea", "schoolChildren", "employees", "wages", "wagesLimit150", "wagesLimit100"];
  const DPFO_METRICS = ["employees", "wages", "wagesLimit150", "wagesLimit100"];
  const SO_METRICS = ["population", "landArea", "schoolChildren", "employees"];
  const SPECIAL_CODES = [554782, 554791, 554821, 582786];
  const STANDARD_IDS = ["population", "weightedPopulation", "landArea", "schoolChildren"];

  function nonnegative(value, name) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
    return value;
  }

  function metricTotals(rows) {
    const totals = Object.fromEntries(METRICS.map((metric) => [metric, 0]));
    for (const row of rows) {
      for (const metric of METRICS) totals[metric] += nonnegative(row[metric] ?? 0, metric);
    }
    return totals;
  }

  function profileMetrics(profile) {
    for (const metric of ["population", "employees", "landArea", "schoolChildren", "monthlyWage"]) {
      nonnegative(profile[metric], `profile.${metric}`);
    }
    if (profile.isSoMember !== false) throw new RangeError("Investor profiles must be nonmembers of SO");
    for (const key of ["code", "orpCode", "regionCode"]) {
      if (key in profile) throw new RangeError(`Analytical profiles must not have ${key}`);
    }
    const retention150 = nonnegative(profile.retention150Percent, "retention150Percent");
    const retention100 = nonnegative(profile.retention100Percent, "retention100Percent");
    if (retention150 > 100 || retention100 > retention150) throw new RangeError("Invalid wage retention percentages");
    const wages = nonnegative(profile.employees * profile.monthlyWage * 12, "profile.wages");
    const wagesLimit150 = wages * retention150 / 100;
    const wagesLimit100 = wages * retention100 / 100;
    if (wagesLimit150 > profile.employees * 150000 * 12
      || wagesLimit100 > profile.employees * 100000 * 12) throw new RangeError("Profile capped wages exceed the cap");
    return {
      population: profile.population,
      employees: profile.employees,
      landArea: profile.landArea,
      schoolChildren: profile.schoolChildren,
      wages,
      wagesLimit150,
      wagesLimit100,
    };
  }

  function investorAdditions(investor) {
    const employees = nonnegative(investor.employees, "investor.employees");
    if (!Number.isSafeInteger(employees)) throw new RangeError("Investor employees must be a safe integer");
    const monthlyWage = nonnegative(investor.monthlyWage, "investor.monthlyWage");
    return {
      population: 0,
      landArea: 0,
      schoolChildren: 0,
      employees,
      wages: nonnegative(employees * monthlyWage * 12, "investor.wages"),
      wagesLimit150: nonnegative(employees * Math.min(monthlyWage, 150000) * 12, "investor.wagesLimit150"),
      wagesLimit100: nonnegative(employees * Math.min(monthlyWage, 100000) * 12, "investor.wagesLimit100"),
    };
  }

  function prepareSystem(data, scenario, core) {
    if (!data.taxVolumes[scenario.year]) throw new RangeError("Unknown tax-volume year");
    for (const id of STANDARD_IDS) nonnegative(scenario.standardWeights[id], `weight.${id}`);
    nonnegative(scenario.dpfoMotivationPercent, "dpfoMotivationPercent");
    if (!DPFO_METRICS.includes(scenario.dpfoMetric)) throw new RangeError("Unknown DPFO metric");
    if (!SO_METRICS.includes(scenario.soMetric)) throw new RangeError("Unknown SO metric");
    if (!["mapping", "all"].includes(scenario.soEligibility)) throw new RangeError("Unknown SO eligibility");

    const coefficients = {};
    let weightedDenominator = 0;
    let ordinaryPopulation = 0;
    let transitionTotal = 0;
    for (const row of data.municipalities) {
      if (SPECIAL_CODES.includes(Number(row.code))) {
        const coefficient = Number(scenario.specialCoefficients[row.code] ?? row.currentCoefficient ?? 1);
        coefficients[row.code] = nonnegative(coefficient, `coefficient.${row.code}`);
        weightedDenominator += row.population * coefficient;
      } else {
        ordinaryPopulation += row.population;
        weightedDenominator += row.population;
        transitionTotal += core.transitionMass(row.population);
      }
    }

    // Reuse the production allocation engine for pools and residual validity.
    const result = core.computeScenario(scenario, data.municipalities);
    if (!result.soValid) throw new RangeError("Scenario has a negative SO residual");
    if (!result.canAllocateSo && result.soAmount > 0.5) throw new RangeError("No eligible SO recipients");
    return {
      scenario,
      fixedTotalPool: result.year.fixedTotalPool,
      dpfoAmount: result.dpfoAmount,
      soAmount: result.soAmount,
      componentAmounts: Object.fromEntries(result.summaries.filter((row) => STANDARD_IDS.includes(row.id))
        .map((row) => [row.id, row.amount])),
      coefficients,
      weightedDenominator,
      ordinaryPopulation,
      transitionTotal,
    };
  }

  function weightedShare(profile, system, core) {
    const codes = profile.coefficientCodes ?? [];
    if (codes.length) {
      if (!codes.every((code) => SPECIAL_CODES.includes(code))) throw new RangeError("Unknown coefficient source");
      const coefficient = codes.reduce((sum, code) => sum + system.coefficients[code], 0) / codes.length;
      return system.weightedDenominator ? profile.population * coefficient / system.weightedDenominator : 0;
    }
    return system.transitionTotal && system.weightedDenominator
      ? core.transitionMass(profile.population) / system.transitionTotal
        * system.ordinaryPopulation / system.weightedDenominator
      : 0;
  }

  function allocation(profile, metrics, totals, system, core) {
    const componentAmounts = {};
    for (const id of STANDARD_IDS) {
      const share = id === "weightedPopulation"
        ? weightedShare(profile, system, core)
        : totals[id] ? metrics[id] / totals[id] : 0;
      componentAmounts[id] = system.componentAmounts[id] * share;
    }
    const standardAmount = Object.values(componentAmounts).reduce((sum, value) => sum + value, 0);
    const metric = system.scenario.dpfoMetric;
    const dpfoAmount = totals[metric] ? system.dpfoAmount * metrics[metric] / totals[metric] : 0;
    // Nonmembers receive SO funds only in the existing "all municipalities" mode.
    const soMetric = system.scenario.soMetric;
    const soAmount = system.scenario.soEligibility === "all" && totals[soMetric]
      ? system.soAmount * metrics[soMetric] / totals[soMetric] : 0;
    return { componentAmounts, standardAmount, dpfoAmount, soAmount, totalAmount: standardAmount + dpfoAmount + soAmount };
  }

  function calculateSystem(profile, beforeMetrics, afterMetrics, beforeTotals, afterTotals, system, core) {
    const before = allocation(profile, beforeMetrics, beforeTotals, system, core);
    const after = allocation(profile, afterMetrics, afterTotals, system, core);
    const increaseAmount = after.totalAmount - before.totalAmount;
    return { before, after, increaseAmount, increasePct: before.totalAmount ? increaseAmount / before.totalAmount : null };
  }

  function snapshotScenario(scenario) {
    return {
      ...scenario,
      standardWeights: { ...scenario.standardWeights },
      specialCoefficients: { ...scenario.specialCoefficients },
    };
  }

  function buildExperiment({ data, profiles, scenario, investor, core }) {
    if (!profiles.length) throw new RangeError("At least one profile is required");
    if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) throw new RangeError("Duplicate profile IDs");
    const additions = investorAdditions(investor);
    const beforeTotals = metricTotals(data.municipalities);
    // One investor, independently for each profile. Never add profile metrics to these totals.
    const afterTotals = Object.fromEntries(METRICS.map((metric) => [metric, beforeTotals[metric] + additions[metric]]));
    const scenarioSnapshot = snapshotScenario(scenario);
    const baselineScenario = snapshotScenario(core.baselineScenario(scenario.year));
    const baselineSystem = prepareSystem(data, baselineScenario, core);
    const scenarioSystem = prepareSystem(data, scenarioSnapshot, core);
    const rows = profiles.map((profile) => {
      const beforeMetrics = profileMetrics(profile);
      const afterMetrics = Object.fromEntries(METRICS.map((metric) => [metric, beforeMetrics[metric] + additions[metric]]));
      return {
        profileId: profile.id,
        label: profile.label,
        metricsBefore: beforeMetrics,
        metricsAfter: afterMetrics,
        baseline: calculateSystem(profile, beforeMetrics, afterMetrics, beforeTotals, afterTotals, baselineSystem, core),
        scenario: calculateSystem(profile, beforeMetrics, afterMetrics, beforeTotals, afterTotals, scenarioSystem, core),
      };
    });
    return {
      schemaVersion: 1,
      investor: { employees: investor.employees, monthlyWage: investor.monthlyWage, annualWages: additions.wages },
      baselineScenario,
      scenario: scenarioSnapshot,
      reference: {
        municipalityCountBefore: data.municipalities.length,
        municipalityCountAfter: data.municipalities.length,
        totalsBefore: beforeTotals,
        totalsAfter: afterTotals,
        baselineFixedPool: baselineSystem.fixedTotalPool,
        scenarioFixedPool: scenarioSystem.fixedTotalPool,
        scenarioSoAmount: scenarioSystem.soAmount,
      },
      rows,
    };
  }

  root.RUD_INVESTOR_EXPERIMENT = Object.freeze({ buildExperiment, profileMetrics, investorAdditions });
})(typeof window === "undefined" ? globalThis : window);
