(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const panel = byId("investor-panel");
  // Mount after the main app initializes so its broad input handlers stay isolated.
  panel.appendChild(byId("investor-template").content.cloneNode(true));

  const profiles = window.RUD_INVESTOR_PROFILE_DATA.profiles;
  const engine = window.RUD_INVESTOR_EXPERIMENT;
  const core = { computeScenario, baselineScenario, transitionMass };
  const employeesInput = byId("investor-employees");
  const wageInput = byId("investor-monthly-wage");
  const status = byId("investor-status");
  const error = byId("investor-error");
  const results = byId("investor-results");
  const tabs = [byId("calculator-tab"), byId("investor-tab")];
  let lastResult = null;
  let lastSignature = null;

  function decimalValue(input) {
    const value = input.value.trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function readInvestor() {
    const employees = decimalValue(employeesInput);
    const monthlyWage = decimalValue(wageInput);
    if (employees === null || !Number.isSafeInteger(employees)) {
      return { invalidInput: employeesInput, message: "Počet zaměstnanců musí být celé nezáporné číslo." };
    }
    if (monthlyWage === null) {
      return { invalidInput: wageInput, message: "Hrubá měsíční mzda musí být nezáporné číslo." };
    }
    if (!Number.isFinite(employees * monthlyWage * 12)
      || monthlyWage > Number.MAX_SAFE_INTEGER || employees * monthlyWage * 12 > Number.MAX_SAFE_INTEGER) {
      return { invalidInput: wageInput, message: "Zadané hodnoty jsou příliš vysoké." };
    }
    return { investor: { employees, monthlyWage } };
  }

  function signature(scenario, investor) {
    return JSON.stringify({ scenario, employees: investor.employees, monthlyWage: investor.monthlyWage });
  }

  function clearError() {
    error.hidden = true;
    error.textContent = "";
    employeesInput.removeAttribute("aria-invalid");
    wageInput.removeAttribute("aria-invalid");
  }

  function showError(message, invalidInput) {
    error.textContent = message;
    error.hidden = false;
    if (invalidInput) {
      invalidInput.setAttribute("aria-invalid", "true");
      invalidInput.focus();
    }
  }

  function setYears(year) {
    byId("investor-current-year").textContent = year;
    byId("investor-scenario-year").textContent = year;
  }

  function updateStatus() {
    const { investor } = readInvestor();
    const scenario = readScenarioFromControls();
    if (!lastResult) {
      setYears(scenario.year);
      status.textContent = "Výsledky zatím nejsou spočítané.";
      status.className = "investor-status";
      results.dataset.state = "idle";
      return;
    }
    const current = investor && signature(scenario, investor) === lastSignature;
    status.textContent = current ? "Výsledky jsou aktuální." : "Výsledky nejsou aktuální.";
    status.className = current ? "investor-status" : "investor-status is-stale";
    results.dataset.state = current ? "current" : "stale";
  }

  function updateAnnualWages() {
    const { investor } = readInvestor();
    const value = investor ? investor.employees * investor.monthlyWage * 12 : null;
    byId("investor-annual-wages").textContent = value === null ? "-"
      : Math.abs(value) >= 1_000_000 ? `${formatNumber(value / 1_000_000, 1)} mil. Kč`
        : `${formatNumber(value)} Kč`;
  }

  function amountCell(value, field, options = {}) {
    const cell = document.createElement("td");
    cell.dataset.field = field;
    if (options.groupStart) cell.classList.add("investor-group-start");
    if (options.gain) cell.classList.add("investor-gain");
    if (value === undefined) {
      cell.textContent = "-";
      return cell;
    }
    cell.dataset.amount = String(value);
    if (options.gain) {
      const roundedValue = Math.round(value);
      const normalizedValue = roundedValue === 0 ? 0 : roundedValue;
      cell.textContent = `${normalizedValue > 0 ? "+" : ""}${formatNumber(normalizedValue)}`;
      if (normalizedValue !== 0) cell.classList.add(normalizedValue > 0 ? "positive" : "negative");
    } else {
      cell.textContent = formatNumber(value / 1_000_000, 3);
    }
    return cell;
  }

  function renderRows(result) {
    const resultById = new Map((result?.rows ?? []).map((row) => [row.profileId, row]));
    const body = document.createDocumentFragment();
    for (const profile of profiles) {
      const row = document.createElement("tr");
      row.dataset.profileId = profile.id;
      const heading = document.createElement("th");
      heading.scope = "row";
      heading.appendChild(document.createTextNode(profile.label));
      const details = document.createElement("span");
      details.className = "investor-profile-details";
      for (const text of [`${formatNumber(profile.population)} obyvatel`, `${formatNumber(profile.employees)} zaměstnanců`]) {
        const line = document.createElement("span");
        line.textContent = text;
        details.appendChild(line);
      }
      heading.appendChild(details);
      row.appendChild(heading);
      const values = resultById.get(profile.id);
      for (const system of ["baseline", "scenario"]) {
        row.appendChild(amountCell(values?.[system].before.totalAmount, `${system}-before`, { groupStart: system === "scenario" }));
        row.appendChild(amountCell(values?.[system].after.totalAmount, `${system}-after`));
        row.appendChild(amountCell(values?.[system].increaseAmount, `${system}-gain`, { gain: true }));
      }
      body.appendChild(row);
    }
    byId("investor-result-body").replaceChildren(body);
  }

  function calculate(event) {
    event.preventDefault();
    clearError();
    const input = readInvestor();
    if (!input.investor) {
      showError(input.message, input.invalidInput);
      updateStatus();
      return;
    }
    try {
      const scenario = readScenarioFromControls();
      const result = engine.buildExperiment({ data: window.RUD_DATA, profiles, scenario, investor: input.investor, core });
      renderRows(result);
      lastResult = result;
      lastSignature = signature(result.scenario, result.investor);
      setYears(result.scenario.year);
      updateAnnualWages();
      updateStatus();
    } catch (cause) {
      const message = cause.message === "Scenario has a negative SO residual"
        ? "Scénář má zápornou částku motivace k mikroregionální spolupráci."
        : cause.message === "No eligible SO recipients"
          ? "Pro motivaci k mikroregionální spolupráci chybí příjemci."
          : "Výpočet není pro toto nastavení dostupný. Zkontrolujte hodnoty parametrů scénáře.";
      showError(message);
      updateStatus();
    }
  }

  function selectTab(selectedTab) {
    const investorActive = selectedTab === tabs[1];
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    byId("calculator-panel").hidden = investorActive;
    panel.hidden = !investorActive;
    byId("behavior-controls").hidden = investorActive;
    if (investorActive) updateStatus();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = tabs.find((item) => item !== tab);
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[1];
      if (!next) return;
      event.preventDefault();
      selectTab(next);
      next.focus();
    });
  }

  byId("investor-form").addEventListener("submit", calculate);
  for (const input of [employeesInput, wageInput]) {
    input.addEventListener("input", () => {
      clearError();
      updateAnnualWages();
      updateStatus();
    });
  }
  for (const event of ["input", "change"]) {
    document.querySelector(".controls").addEventListener(event, () => {
      clearError();
      updateStatus();
    });
  }
  byId("zero-apply").addEventListener("click", () => {
    clearError();
    updateStatus();
  });

  renderRows();
  updateAnnualWages();
  updateStatus();
})();
