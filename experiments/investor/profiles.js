(function (root) {
  "use strict";

  // These are analytical profiles, not additional municipality records.
  const definitions = [
    ["size-1-100", "1-100", 0, 100, 70, 15, 400, 1, 32000, 99.99, 99.82],
    ["size-101-200", "101-200", 101, 200, 150, 30, 600, 1, 32000, 99.98, 99.77],
    ["size-201-500", "201-500", 201, 500, 350, 70, 900, 20, 35000, 99.91, 99.56],
    ["size-501-800", "501-800", 501, 800, 650, 150, 1200, 70, 35000, 99.77, 99.22],
    ["size-801-2000", "801-2 000", 801, 2000, 1200, 300, 1600, 180, 36000, 99.81, 99.21],
    ["size-2001-5000", "2-5 tis.", 2001, 5000, 3000, 1000, 2300, 500, 36000, 99.75, 98.96],
    ["size-5001-10000", "5-10 tis.", 5001, 10000, 7000, 3000, 3200, 1100, 37000, 99.77, 99.02],
    ["size-10001-20000", "10-20 tis.", 10001, 20000, 14000, 8000, 3400, 2100, 38000, 99.64, 98.67],
    ["size-20001-49000", "20-49 tis.", 20001, 49000, 30000, 17500, 4800, 4000, 38000, 99.64, 98.64],
    ["size-49001-150000", "49-150 tis.", 49001, 150000, 75000, 50000, 7500, 10000, 38000, 99.75, 98.81],
    ["size-150001-500000", "150-500 tis.", 150001, 500000, 300000, 240000, 19400, 33000, 39000, 99.85, 98.92],
    ["size-500001-plus", "500 tis.+", 500001, null, 1400000, 1150000, 50000, 150000, 49000, 98.35, 94.61],
  ];

  const profiles = definitions.map(([
    id, label, minPopulation, maxPopulation, population, employees,
    landArea, schoolChildren, monthlyWage, retention150Percent, retention100Percent,
  ]) => Object.freeze({
    id,
    label,
    minPopulation,
    maxPopulation,
    population,
    employees,
    landArea,
    schoolChildren,
    monthlyWage,
    retention150Percent,
    retention100Percent,
    isSoMember: false,
    coefficientCodes: Object.freeze(id === "size-150001-500000"
      ? [554791, 554821, 582786]
      : id === "size-500001-plus" ? [554782] : []),
  }));

  root.RUD_INVESTOR_PROFILE_DATA = Object.freeze({
    schemaVersion: 1,
    sourceGeneratedAt: "2026-08-28",
    sourceMunicipalityCount: 6254,
    sourceWorkbook: "Employees and wages by municipality.xlsx / Sheet1 / W:X",
    assumptions: Object.freeze({
      profilesAreAdditionalMunicipalities: false,
      exactSourceMeansUsedForCalculation: false,
      profileWages: "employees * rounded monthly wage * 12",
      cappedExistingWages: "rounded retention percentage of profile wages",
      cappedInvestorWages: "all new employees earn the entered monthly wage",
      largeCityCoefficient: "arithmetic mean of the three selected city coefficients",
      populationAndLandAndSchoolChildrenChange: false,
      fixedTaxPoolsChange: false,
      investorIsNewActivityNotRelocation: true,
      experimentsAreIndependent: true,
    }),
    profiles: Object.freeze(profiles),
  });
})(typeof window === "undefined" ? globalThis : window);
