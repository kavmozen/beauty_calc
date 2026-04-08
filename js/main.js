import { computeBeforeAfter } from "./model.js";
import { fmtRub, fmtSignedRub, num, int, clamp, setText, getEl } from "./utils.js";

const els = {
  regime: getEl("regime"),
  turnover: getEl("turnover"),
  acquiring: getEl("acquiring"),

  hasEmployees: getEl("hasEmployees"),
  empCount: getEl("empCount"),
  empSalary: getEl("empSalary"),
  empContribSum: getEl("empContribSum"),
  fixedContrib: getEl("fixedContrib"),

  splitMaster: getEl("splitMaster"),
  splitSalon: getEl("splitSalon"),

  patentFee: getEl("patentFee"),
  extra: getEl("extra"),
  extra15: getEl("extra15"),

  empContribWrap: getEl("empContribWrap"),
  extra15Wrap: getEl("extra15Wrap"),
  extraLabel: getEl("extraLabel"),

  osnVat: getEl("osnVat"),
  osnTypeWrap: getEl("osnTypeWrap"),
  osnType: getEl("osnType"),

  includeOnePct: getEl("includeOnePct"),

  // Новые поля
  platformFeeRate: getEl("platformFeeRate"),
  cashWithdrawal: getEl("cashWithdrawal"),

  // До
  revBefore: getEl("revBefore"),
  payMasterBefore: getEl("payMasterBefore"),
  acqBefore: getEl("acqBefore"),
  cashBefore: getEl("cashBefore"),
  taxBefore: getEl("taxBefore"),
  onePctBefore: getEl("onePctBefore"),
  empContribBefore: getEl("empContribBefore"),
  expBefore: getEl("expBefore"),
  netBefore: getEl("netBefore"),

  // После
  revAfter: getEl("revAfter"),
  platformFeeAfter: getEl("platformFeeAfter"),
  taxAfter: getEl("taxAfter"),
  onePctAfter: getEl("onePctAfter"),
  netAfter: getEl("netAfter"),

  diffTax: getEl("diffTax"),
  diffNet: getEl("diffNet"),
  diffBox: getEl("diffBox"),

  // mixed
  mixedIncomeWrap: getEl("mixedIncomeWrap"),
  incomePatent: getEl("incomePatent"),
  incomeUsn: getEl("incomeUsn"),
  mixedAfterFromSalonIncome: getEl("mixedAfterFromSalonIncome"),
};

function getOsnRate(osnType) {
  if (osnType === "ip13") return 0.13;
  if (osnType === "ip15") return 0.15;
  return 0.2;
}

function togglePatent() {
  if (!els.patentFee) return;
  const r = els.regime?.value;
  const need = (r === "patent" || r === "patent_usn6");
  els.patentFee.disabled = !need;
  if (!need) els.patentFee.value = 0;
}

function toggleModeUI() {
  const regime = els.regime?.value || "usn6";
  const isUsn15 = regime === "usn15";
  const isOsn = regime === "osn";
  const isMixed = regime === "patent_usn6";

  if (els.empContribWrap) els.empContribWrap.classList.toggle("hidden", !isUsn15);
  if (els.extra15Wrap) els.extra15Wrap.classList.toggle("hidden", !isUsn15);
  if (els.extraLabel) els.extraLabel.classList.toggle("hidden", !!isUsn15);
  if (els.osnTypeWrap) els.osnTypeWrap.classList.toggle("hidden", !isOsn);
  if (els.mixedIncomeWrap) els.mixedIncomeWrap.classList.toggle("hidden", !isMixed);

  if (els.turnover) els.turnover.readOnly = isMixed;
}

function syncSplits() {
  if (!els.splitMaster || !els.splitSalon) return;
  const masterRaw = clamp(num(els.splitMaster.value, 0), 0, 100);
  const salonRaw = clamp(num(els.splitSalon.value, 0), 0, 100);

  if (document.activeElement === els.splitMaster) {
    els.splitSalon.value = clamp(100 - masterRaw, 0, 100);
  } else if (document.activeElement === els.splitSalon) {
    els.splitMaster.value = clamp(100 - salonRaw, 0, 100);
  }
  const finalMaster = clamp(num(els.splitMaster.value, 0), 0, 100);
  els.splitSalon.value = clamp(100 - finalMaster, 0, 100);
}

function getTurnover(regime) {
  if (regime !== "patent_usn6") {
    return Math.max(0, num(els.turnover?.value, 0));
  }
  const p = Math.max(0, num(els.incomePatent?.value, 0));
  const u = Math.max(0, num(els.incomeUsn?.value, 0));
  const sum = p + u;
  if (els.turnover) els.turnover.value = String(sum);
  return sum;
}

function run() {
  syncSplits();

  const regime = els.regime?.value || "usn6";
  const turnover = getTurnover(regime);
  const acquiringRate = Math.max(0, num(els.acquiring?.value, 0));

  const hasEmployees = !!els.hasEmployees?.checked;
  const empCount = hasEmployees ? Math.max(0, int(els.empCount?.value, 0)) : 0;
  const empSalary = hasEmployees ? Math.max(0, num(els.empSalary?.value, 0)) : 0;

  const fixedContrib = Math.max(0, num(els.fixedContrib?.value, 0));

  const splitMaster = clamp(num(els.splitMaster?.value, 0), 0, 100);
  const splitSalon = clamp(num(els.splitSalon?.value, 0), 0, 100);

  const patentFee = Math.max(0, num(els.patentFee?.value, 0));
  const extra = Math.max(0, num(els.extra?.value, 0));
  const extra15 = Math.max(0, num(els.extra15?.value, 0));
  const empContribSum = Math.max(0, num(els.empContribSum?.value, 0));

  const includeVat = !!els.osnVat?.checked || regime === "osn";
  const osnRate = getOsnRate(els.osnType?.value);
  const includeOnePct = !!els.includeOnePct?.checked;

  const platformFeeRate = Math.max(0, num(els.platformFeeRate?.value, 0));
  const cashWithdrawal = Math.max(0, num(els.cashWithdrawal?.value, 0));

  const incomePatent = Math.max(0, num(els.incomePatent?.value, 0));
  const incomeUsn = Math.max(0, num(els.incomeUsn?.value, 0));
  const mixedAfterFromSalonIncome = !!els.mixedAfterFromSalonIncome?.checked;

  const result = computeBeforeAfter({
    regime,
    turnover,
    acquiringRate,
    hasEmployees,
    empCount,
    empSalary,
    empContribSum,
    fixedContrib,
    splitMaster,
    splitSalon,
    patentFee,
    extra,
    extra15,
    includeVat,
    osnRate,
    osnType: els.osnType?.value || "ooo20",
    includeOnePct,
    platformFeeRate,
    cashWithdrawal,
    incomePatent,
    incomeUsn,
    mixedAfterFromSalonIncome,
  });

  // До
  setText(els.revBefore, fmtRub(result.before.revenue));
  setText(els.payMasterBefore, fmtRub(result.before.payMaster));
  setText(els.acqBefore, fmtRub(result.before.acquiring));
  setText(els.cashBefore, fmtRub(result.before.cashWithdrawal));
  setText(els.taxBefore, fmtRub(result.before.tax));
  setText(els.onePctBefore, fmtRub(result.before.onePct));
  setText(els.empContribBefore, fmtRub(result.before.empContrib));
  setText(els.expBefore, fmtRub(result.before.extra));
  setText(els.netBefore, fmtRub(result.before.net));

  // После
  setText(els.revAfter, fmtRub(result.after.revenue));
  setText(els.platformFeeAfter, fmtRub(result.after.platformFee));
  setText(els.taxAfter, fmtRub(result.after.tax));
  setText(els.onePctAfter, fmtRub(result.after.onePct));
  setText(els.netAfter, fmtRub(result.after.net));

  setText(els.diffTax, fmtSignedRub(result.diff.tax));
  setText(els.diffNet, fmtSignedRub(result.diff.net));

  if (els.diffBox) els.diffBox.classList.toggle("danger", result.diff.net < 0);
}

const ids = [
  "regime", "turnover", "acquiring", "fixedContrib", "empContribSum", "hasEmployees",
  "empCount", "empSalary", "patentFee", "extra", "extra15", "osnVat", "osnType",
  "splitMaster", "splitSalon", "includeOnePct",
  "platformFeeRate", "cashWithdrawal",
  "incomePatent", "incomeUsn", "mixedAfterFromSalonIncome"
];

ids.forEach((id) => {
  const el = getEl(id);
  if (!el) return;
  el.addEventListener("input", run);
  el.addEventListener("change", run);
});

if (els.regime) {
  els.regime.addEventListener("change", togglePatent);
  els.regime.addEventListener("change", toggleModeUI);
  els.regime.addEventListener("change", run);
}

togglePatent();
toggleModeUI();
run();
