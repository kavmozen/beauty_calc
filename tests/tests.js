import { calcTax } from "../js/tax.js";
import { computeBeforeAfter } from "../js/model.js";

const out = document.getElementById("out");
function log(line) { out.textContent += line + "\n"; }
function assertClose(name, got, expected, eps = 1e-6) {
  if (Math.abs(got - expected) > eps) throw new Error(`${name}: got ${got}, expected ${expected}`);
}

function run() {
  out.textContent = "";

  // Контрольныи кейс (должен совпадать с твоим исходником)
  const res = computeBeforeAfter({
    regime: "usn6",
    turnover: 1200000,
    acquiringRate: 2.7,
    hasEmployees: false,
    empCount: 0,
    empSalary: 0,
    empContribSum: 0,
    fixedContrib: 50000,
    splitMaster: 30,
    splitSalon: 70,
    patentFee: 0,
    extra: 50000,
    extra15: 0,
    includeVat: false,
    osnRate: 0.20,
    includeOnePct: false,
  });

  assertClose("taxBefore", res.before.tax, 22000);
  assertClose("taxAfter", res.after.tax, 50400);
  assertClose("diffNet", res.diff.net, 54000);

  // УСН 6 с сотрудниками: уменьшение максимум на 50%
  {
    const t = calcTax({
      regime: "usn6",
      revenue: 100000,
      profit: 0,
      patentFee: 0,
      includeVat: false,
      contribSelf: 10000,
      contribEmployees: 0,
      hasEmployees: true,
      allowDeduction: true,
      osnRate: 0.2,
    });
    // baseTax=6000, cap=3000, налог=3000
    assertClose("usn6 cap 50%", t.tax, 3000);
  }

  log("OK: all tests passed");
}

try { run(); }
catch (e) { out.textContent = "FAILED:\n" + (e && e.stack ? e.stack : String(e)); }
