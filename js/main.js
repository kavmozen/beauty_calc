import { computeBeforeAfter } from "./model.js";
import { fmtRub, fmtSignedRub, num, int, clamp, setText, getEl } from "./utils.js";

let lastResult = null;
let lastRegime = "usn6";
let lastShowFixed = false;
let lastShowVat = false;

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
  osnVatWrap: getEl("osnVatWrap"),
  includeOnePct: getEl("includeOnePct"),
  platformFeeRate: getEl("platformFeeRate"),
  cashWithdrawal: getEl("cashWithdrawal"),
  showFormulas: getEl("showFormulas"),

  revBefore: getEl("revBefore"),
  payMasterBefore: getEl("payMasterBefore"),
  acqBefore: getEl("acqBefore"),
  cashBefore: getEl("cashBefore"),
  taxBefore: getEl("taxBefore"),
  taxLabelBefore: getEl("taxLabelBefore"),
  onePctBefore: getEl("onePctBefore"),
  empContribBefore: getEl("empContribBefore"),
  fixedContribBefore: getEl("fixedContribBefore"),
  expBefore: getEl("expBefore"),
  netBefore: getEl("netBefore"),

  rowVatOutputBefore: getEl("rowVatOutputBefore"),
  rowVatInputBefore: getEl("rowVatInputBefore"),
  rowVatPayableBefore: getEl("rowVatPayableBefore"),
  rowProfitTaxBefore: getEl("rowProfitTaxBefore"),
  vatOutputBefore: getEl("vatOutputBefore"),
  vatInputBefore: getEl("vatInputBefore"),
  vatPayableBefore: getEl("vatPayableBefore"),
  profitTaxBefore: getEl("profitTaxBefore"),

  rowFixedContribBefore: getEl("rowFixedContribBefore"),
  rowTaxBefore: getEl("rowTaxBefore"),
  rowEmpContribBefore: getEl("rowEmpContribBefore"),

  revAfter: getEl("revAfter"),
  platformFeeAfter: getEl("platformFeeAfter"),
  taxAfter: getEl("taxAfter"),
  taxLabelAfter: getEl("taxLabelAfter"),
  onePctAfter: getEl("onePctAfter"),
  fixedContribAfter: getEl("fixedContribAfter"),
  expAfter: getEl("expAfter"),
  netAfter: getEl("netAfter"),

  rowVatOutputAfter: getEl("rowVatOutputAfter"),
  rowVatInputAfter: getEl("rowVatInputAfter"),
  rowVatPayableAfter: getEl("rowVatPayableAfter"),
  rowProfitTaxAfter: getEl("rowProfitTaxAfter"),
  vatOutputAfter: getEl("vatOutputAfter"),
  vatInputAfter: getEl("vatInputAfter"),
  vatPayableAfter: getEl("vatPayableAfter"),
  profitTaxAfter: getEl("profitTaxAfter"),

  rowFixedContribAfter: getEl("rowFixedContribAfter"),
  rowExpAfter: getEl("rowExpAfter"),

  diffTax: getEl("diffTax"),
  diffNet: getEl("diffNet"),
  diffBox: getEl("diffBox"),

  mixedIncomeWrap: getEl("mixedIncomeWrap"),
  incomePatent: getEl("incomePatent"),
  incomeUsn: getEl("incomeUsn"),
  mixedAfterFromSalonIncome: getEl("mixedAfterFromSalonIncome"),
};

// --- Формулы: маппинг id формулы → ключ в formulas ---
const formulaMap = {
  // before
  fPayMasterB: { side: "before", key: "payMaster" },
  fAcqB: { side: "before", key: "acquiring" },
  fCashB: { side: "before", key: "cashWithdrawal" },
  fTaxB: { side: "before", key: "tax" },
  fOnePctB: { side: "before", key: "onePct" },
  fEmpContribB: { side: "before", key: "empContrib" },
  fFixedContribB: { side: "before", key: "fixedContrib" },
  fNetB: { side: "before", key: "net" },
  fVatOutputB: { side: "before", key: "vatOutput" },
  fVatInputB: { side: "before", key: "vatInput" },
  fVatPayableB: { side: "before", key: "vatPayable" },
  fProfitTaxB: { side: "before", key: "profitTax" },
  // after
  fRevA: { side: "after", key: "revenue" },
  fPlatformA: { side: "after", key: "platformFee" },
  fTaxA: { side: "after", key: "tax" },
  fOnePctA: { side: "after", key: "onePct" },
  fFixedContribA: { side: "after", key: "fixedContrib" },
  fNetA: { side: "after", key: "net" },
  fVatOutputA: { side: "after", key: "vatOutput" },
  fVatInputA: { side: "after", key: "vatInput" },
  fVatPayableA: { side: "after", key: "vatPayable" },
  fProfitTaxA: { side: "after", key: "profitTax" },
};

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
  if (els.osnVatWrap) els.osnVatWrap.classList.toggle("hidden", !isOsn);
  if (els.mixedIncomeWrap) els.mixedIncomeWrap.classList.toggle("hidden", !isMixed);
  if (els.turnover) els.turnover.readOnly = isMixed;
}

function syncSplits() {
  if (!els.splitMaster || !els.splitSalon) return;
  if (document.activeElement === els.splitMaster) {
    els.splitSalon.value = clamp(100 - clamp(num(els.splitMaster.value, 0), 0, 100), 0, 100);
  } else if (document.activeElement === els.splitSalon) {
    els.splitMaster.value = clamp(100 - clamp(num(els.splitSalon.value, 0), 0, 100), 0, 100);
  }
  els.splitSalon.value = clamp(100 - clamp(num(els.splitMaster.value, 0), 0, 100), 0, 100);
}

function getTurnover(regime) {
  if (regime !== "patent_usn6") return Math.max(0, num(els.turnover?.value, 0));
  const sum = Math.max(0, num(els.incomePatent?.value, 0)) + Math.max(0, num(els.incomeUsn?.value, 0));
  if (els.turnover) els.turnover.value = String(sum);
  return sum;
}

function setFormula(id, text) {
  const el = getEl(id);
  if (el) el.textContent = text || "";
}

function run() {
  syncSplits();

  const regime = els.regime?.value || "usn6";
  const result = computeBeforeAfter({
    regime,
    turnover: getTurnover(regime),
    acquiringRate: num(els.acquiring?.value, 0),
    hasEmployees: !!els.hasEmployees?.checked,
    empCount: int(els.empCount?.value, 0),
    empSalary: num(els.empSalary?.value, 0),
    empContribSum: num(els.empContribSum?.value, 0),
    fixedContrib: num(els.fixedContrib?.value, 0),
    splitMaster: num(els.splitMaster?.value, 0),
    splitSalon: num(els.splitSalon?.value, 0),
    patentFee: num(els.patentFee?.value, 0),
    extra: num(els.extra?.value, 0),
    extra15: num(els.extra15?.value, 0),
    includeVat: !!els.osnVat?.checked,
    osnType: els.osnType?.value || "ooo25",
    includeOnePct: !!els.includeOnePct?.checked,
    platformFeeRate: num(els.platformFeeRate?.value, 0),
    cashWithdrawal: num(els.cashWithdrawal?.value, 0),
    incomePatent: num(els.incomePatent?.value, 0),
    incomeUsn: num(els.incomeUsn?.value, 0),
    mixedAfterFromSalonIncome: !!els.mixedAfterFromSalonIncome?.checked,
  });

  const b = result.before;
  const a = result.after;
  const isOsn = regime === "osn";
  const isUsn15 = regime === "usn15";
  const showFixed = (isUsn15 || isOsn) && b.fixedContrib > 0;
  const showVat = isOsn && !!els.osnVat?.checked;

  // Сохраняем для экспорта
  lastResult = result;
  lastRegime = regime;
  lastShowFixed = showFixed;
  lastShowVat = showVat;

  // --- До ---
  setText(els.revBefore, fmtRub(b.revenue));
  setText(els.payMasterBefore, fmtRub(b.payMaster));
  setText(els.acqBefore, fmtRub(b.acquiring));
  setText(els.cashBefore, fmtRub(b.cashWithdrawal));
  setText(els.onePctBefore, fmtRub(b.onePct));
  setText(els.empContribBefore, fmtRub(b.empContrib));
  setText(els.fixedContribBefore, fmtRub(b.fixedContrib));
  setText(els.expBefore, fmtRub(b.extra));
  setText(els.netBefore, fmtRub(b.net));

  if (isOsn && showVat) {
    hide(els.rowTaxBefore);
    show(els.rowVatOutputBefore); show(els.rowVatInputBefore);
    show(els.rowVatPayableBefore); show(els.rowProfitTaxBefore);
    setText(els.vatOutputBefore, fmtRub(b.vatOutput));
    setText(els.vatInputBefore, fmtRub(b.vatInput));
    setText(els.vatPayableBefore, fmtRub(b.vatPayable));
    setText(els.profitTaxBefore, fmtRub(b.profitTax));
  } else if (isOsn) {
    show(els.rowTaxBefore);
    hide(els.rowVatOutputBefore); hide(els.rowVatInputBefore);
    hide(els.rowVatPayableBefore); hide(els.rowProfitTaxBefore);
    setText(els.taxLabelBefore, "Налог на прибыль");
    setText(els.taxBefore, fmtRub(b.tax));
  } else {
    show(els.rowTaxBefore);
    hide(els.rowVatOutputBefore); hide(els.rowVatInputBefore);
    hide(els.rowVatPayableBefore); hide(els.rowProfitTaxBefore);
    setText(els.taxLabelBefore, isUsn15 ? "УСН 15%" : "УСН (после вычета)");
    setText(els.taxBefore, fmtRub(b.tax));
  }

  toggle(els.rowFixedContribBefore, showFixed);
  toggle(els.rowEmpContribBefore, b.empContrib > 0);

  // --- После ---
  setText(els.revAfter, fmtRub(a.revenue));
  setText(els.platformFeeAfter, fmtRub(a.platformFee));
  setText(els.onePctAfter, fmtRub(a.onePct));
  setText(els.fixedContribAfter, fmtRub(a.fixedContrib));
  setText(els.expAfter, fmtRub(a.extra));
  setText(els.netAfter, fmtRub(a.net));

  if (isOsn && showVat) {
    hide(getEl("rowTaxAfter"));
    show(els.rowVatOutputAfter); show(els.rowVatInputAfter);
    show(els.rowVatPayableAfter); show(els.rowProfitTaxAfter);
    setText(els.vatOutputAfter, fmtRub(a.vatOutput));
    setText(els.vatInputAfter, fmtRub(a.vatInput));
    setText(els.vatPayableAfter, fmtRub(a.vatPayable));
    setText(els.profitTaxAfter, fmtRub(a.profitTax));
  } else if (isOsn) {
    show(getEl("rowTaxAfter"));
    hide(els.rowVatOutputAfter); hide(els.rowVatInputAfter);
    hide(els.rowVatPayableAfter); hide(els.rowProfitTaxAfter);
    setText(els.taxLabelAfter, "Налог на прибыль");
    setText(els.taxAfter, fmtRub(a.tax));
  } else {
    show(getEl("rowTaxAfter"));
    hide(els.rowVatOutputAfter); hide(els.rowVatInputAfter);
    hide(els.rowVatPayableAfter); hide(els.rowProfitTaxAfter);
    setText(els.taxLabelAfter, isUsn15 ? "УСН 15%" : "УСН (после вычета)");
    setText(els.taxAfter, fmtRub(a.tax));
  }

  toggle(els.rowFixedContribAfter, showFixed);
  toggle(els.rowExpAfter, a.extra > 0);

  // --- Формулы ---
  const fm = result.formulas;
  for (const [id, { side, key }] of Object.entries(formulaMap)) {
    setFormula(id, fm[side]?.[key] || "");
  }

  // --- Разница ---
  setText(els.diffTax, fmtSignedRub(result.diff.tax));
  setText(els.diffNet, fmtSignedRub(result.diff.net));
  if (els.diffBox) els.diffBox.classList.toggle("danger", result.diff.net < 0);
}

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }
function toggle(el, visible) { if (el) el.classList.toggle("hidden", !visible); }

// --- Переключатель формул ---
if (els.showFormulas) {
  els.showFormulas.addEventListener("change", () => {
    document.body.classList.toggle("formulas-visible", els.showFormulas.checked);
  });
}

// --- Listeners ---
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

// =========================================================
//  ЭКСПОРТ В EXCEL
// =========================================================
function exportToXlsx() {
  if (!lastResult || typeof XLSX === "undefined") return;

  const b = lastResult.before;
  const a = lastResult.after;
  const d = lastResult.diff;
  const fm = lastResult.formulas;

  const regimeNames = {
    usn6: "УСН 6%", usn15: "УСН 15%", osn: "ОСН",
    patent: "Патент", patent_usn6: "Патент + УСН 6%",
  };
  const regimeName = regimeNames[lastRegime] || lastRegime;

  const r = (n) => Math.round(n);

  // Собираем строки
  const rows = [];
  const push = (label, valBefore, valAfter, formula) => {
    rows.push([label, valBefore, valAfter, formula || ""]);
  };
  const blank = () => rows.push(["", "", "", ""]);
  const header = (text) => rows.push([text, "", "", ""]);

  header("КАЛЬКУЛЯТОР НАЛОГОВОЙ НАГРУЗКИ");
  rows.push(["Режим:", regimeName, "", ""]);
  blank();

  rows.push(["Показатель", "До внедрения", "После внедрения", "Формула расчёта"]);

  push("Оборот / Доход салона", r(b.revenue), r(a.revenue), fm.after?.revenue || "");
  push("Выплаты мастерам", r(b.payMaster), "—", fm.before?.payMaster || "");
  push("Эквайринг", r(b.acquiring), "—", fm.before?.acquiring || "");
  push("Вывод наличных", r(b.cashWithdrawal), "—", fm.before?.cashWithdrawal || "");
  push("Комиссия платформы", "—", r(a.platformFee), fm.after?.platformFee || "");

  if (lastShowVat) {
    push("НДС исходящий", r(b.vatOutput || 0), r(a.vatOutput || 0), fm.before?.vatOutput || "");
    push("НДС входящий", r(b.vatInput || 0), r(a.vatInput || 0), fm.before?.vatInput || "");
    push("НДС к уплате", r(b.vatPayable || 0), r(a.vatPayable || 0), fm.before?.vatPayable || "");
    push("Налог на прибыль", r(b.profitTax || 0), r(a.profitTax || 0), fm.before?.profitTax || "");
  } else {
    const taxLabel = lastRegime === "usn15" ? "УСН 15%" : lastRegime === "osn" ? "Налог на прибыль" : "УСН (после вычета)";
    push(taxLabel, r(b.tax), r(a.tax), fm.before?.tax || "");
  }

  push("1% взнос", r(b.onePct), r(a.onePct), fm.before?.onePct || "");

  if (b.empContrib > 0) {
    push("Страх. взносы сотр.", r(b.empContrib), 0, fm.before?.empContrib || "");
  }

  if (lastShowFixed) {
    push("Фикс. взносы ИП", r(b.fixedContrib), r(a.fixedContrib), fm.before?.fixedContrib || "");
  }

  push("Доп. расходы", r(b.extra), r(a.extra || 0), "");

  blank();
  push("ЧИСТО САЛОНА", r(b.net), r(a.net), "");

  blank();
  header("РАЗНИЦА");
  rows.push(["По нагрузке", r(d.tax), "", ""]);
  rows.push(["По чистой прибыли", r(d.net), "", ""]);

  // Формулы расчёта (отдельный блок)
  blank();
  blank();
  header("ФОРМУЛЫ РАСЧЁТА — ДО ВНЕДРЕНИЯ");
  blank();
  for (const [key, val] of Object.entries(fm.before || {})) {
    if (!val) continue;
    rows.push([key, val.replace(/\n/g, " | "), "", ""]);
  }

  blank();
  header("ФОРМУЛЫ РАСЧЁТА — ПОСЛЕ ВНЕДРЕНИЯ");
  blank();
  for (const [key, val] of Object.entries(fm.after || {})) {
    if (!val) continue;
    rows.push([key, val.replace(/\n/g, " | "), "", ""]);
  }

  // Создаём книгу
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ширины колонок
  ws["!cols"] = [
    { wch: 28 },  // A: Показатель
    { wch: 20 },  // B: До
    { wch: 20 },  // C: После
    { wch: 80 },  // D: Формула
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Расчёт");
  XLSX.writeFile(wb, `Налоговый_расчёт_${regimeName.replace(/\s/g, "_")}.xlsx`);
}

const exportBtn = getEl("exportXlsx");
if (exportBtn) exportBtn.addEventListener("click", exportToXlsx);
