import { calcUsn6, calcUsn15, calcPatent, calcOsn, calcOnePctContrib } from "./tax.js";
import { clamp, num } from "./utils.js";

/** Форматирование числа для формул: 6500000 → "6 500 000" */
function f(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function getOsnRate(osnType) {
  if (osnType === "ip13") return 0.13;
  if (osnType === "ip15") return 0.15;
  return 0.25;
}

export function computeBeforeAfter(input) {
  const regime = input.regime;

  const turnover = Math.max(0, num(input.turnover, 0));
  const acquiringRate = Math.max(0, num(input.acquiringRate, 0));

  const hasEmployees = !!input.hasEmployees;
  const empCount = hasEmployees ? Math.max(0, Math.round(num(input.empCount, 0))) : 0;
  const empSalary = hasEmployees ? Math.max(0, num(input.empSalary, 0)) : 0;

  const fixedContrib = Math.max(0, num(input.fixedContrib, 0));
  const includeOnePct = !!input.includeOnePct;

  const splitMaster = clamp(num(input.splitMaster, 0), 0, 100);
  const finalSplitSalon = clamp(100 - splitMaster, 0, 100);

  const patentFee = Math.max(0, num(input.patentFee, 0));
  const extraCommon = Math.max(0, num(input.extra, 0));
  const extraUsn15 = Math.max(0, num(input.extra15, 0));

  const includeVat = !!input.includeVat;
  const osnType = input.osnType || "ooo25";
  const osnRate = getOsnRate(osnType);

  const platformFeeRate = Math.max(0, num(input.platformFeeRate, 0));
  const cashWithdrawal = Math.max(0, num(input.cashWithdrawal, 0));

  const incomePatent = Math.max(0, num(input.incomePatent, 0));
  const incomeUsn = Math.max(0, num(input.incomeUsn, 0));
  const mixedAfterFromSalonIncome = !!input.mixedAfterFromSalonIncome;

  // --- Общие ---
  const acqCost = turnover * (acquiringRate / 100);
  const payToMaster = turnover * (splitMaster / 100);
  const rentIncome = turnover * (finalSplitSalon / 100);
  const platformFee = turnover * (platformFeeRate / 100);

  const empContrib = hasEmployees
    ? (regime === "usn15"
        ? Math.max(0, num(input.empContribSum, 0))
        : empCount * empSalary * 0.30)
    : 0;

  const isOsnIP = regime === "osn" && (osnType === "ip13" || osnType === "ip15");
  const needsFC = regime === "usn6" || regime === "usn15" || regime === "patent" || isOsnIP;

  function onePctFor(rev) {
    if (!includeOnePct) return 0;
    if (regime === "osn" && !isOsnIP) return 0;
    return calcOnePctContrib(rev);
  }

  const extra = regime === "usn15" ? extraUsn15 : extraCommon;
  const onePctBefore = onePctFor(turnover);
  const onePctAfter = onePctFor(rentIncome);

  // Формулы
  const fb = {};  // formulas before
  const fa = {};  // formulas after

  // --- Общие формулы ---
  fb.payMaster = `Оборот × Доля мастера\n${f(turnover)} × ${splitMaster}% = ${f(payToMaster)}`;
  fb.acquiring = `Оборот × Ставка эквайринга\n${f(turnover)} × ${acquiringRate}% = ${f(acqCost)}`;
  fb.cashWithdrawal = `${f(cashWithdrawal)} (ввод)`;

  if (includeOnePct) {
    fb.onePct = `(Доход − 300 000) × 1%\n(${f(turnover)} − 300 000) × 1% = ${f(onePctBefore)}`;
    fa.onePct = `(Доход − 300 000) × 1%\n(${f(rentIncome)} − 300 000) × 1% = ${f(onePctAfter)}`;
  } else {
    fb.onePct = "Выключен";
    fa.onePct = "Выключен";
  }

  if (hasEmployees && regime !== "usn15") {
    fb.empContrib = `Кол-во × Зарплата × 30%\n${empCount} × ${f(empSalary)} × 30% = ${f(empContrib)}`;
  } else if (hasEmployees && regime === "usn15") {
    fb.empContrib = `${f(empContrib)} (ввод)`;
  } else {
    fb.empContrib = "Нет сотрудников";
  }

  fa.revenue = `Оборот × Сплит салону\n${f(turnover)} × ${finalSplitSalon}% = ${f(rentIncome)}`;
  fa.platformFee = `Оборот × Ставка платформы\n${f(turnover)} × ${platformFeeRate}% = ${f(platformFee)}`;

  // =========================================================
  //  ДО ВНЕДРЕНИЯ
  // =========================================================
  let taxBefore = 0;
  let beforeExtra = {};

  if (regime === "usn6") {
    const contribAll = (needsFC ? fixedContrib : 0) + onePctBefore + empContrib;
    const t = calcUsn6(turnover, contribAll, hasEmployees, true);
    taxBefore = t.tax;

    const base = turnover * 0.06;
    const pct = hasEmployees ? "50%" : "100%";
    const cap = hasEmployees ? base * 0.5 : base;
    fb.tax = [
      `База УСН = Оборот × 6%`,
      `${f(turnover)} × 6% = ${f(base)}`,
      ``,
      `Взносы для вычета:`,
      `  Фикс ${f(needsFC ? fixedContrib : 0)} + 1% ${f(onePctBefore)} + Сотр ${f(empContrib)} = ${f(contribAll)}`,
      ``,
      `Лимит вычета = ${pct} от базы = ${f(cap)}`,
      `Вычет = min(${f(contribAll)}, ${f(cap)}) = ${f(t.deduction)}`,
      ``,
      `УСН = ${f(base)} − ${f(t.deduction)} = ${f(t.tax)}`,
    ].join("\n");

  } else if (regime === "usn15") {
    const fc = needsFC ? fixedContrib : 0;
    const allExp = payToMaster + acqCost + cashWithdrawal + empContrib + fc + onePctBefore + extraUsn15;
    const t = calcUsn15(turnover, allExp);
    taxBefore = t.tax;
    beforeExtra.taxBase = t.taxBase;

    fb.tax = [
      `Расходы = Мастерам + Эквайринг + Наличка + Страх.сотр + Фикс + 1% + Доп`,
      `${f(payToMaster)} + ${f(acqCost)} + ${f(cashWithdrawal)} + ${f(empContrib)} + ${f(fc)} + ${f(onePctBefore)} + ${f(extraUsn15)} = ${f(allExp)}`,
      ``,
      `База = Оборот − Расходы`,
      `${f(turnover)} − ${f(allExp)} = ${f(t.taxBase)}`,
      ``,
      `Налог 15% = ${f(t.taxBase)} × 15% = ${f(t.mainTax)}`,
      `Мин.налог 1% = ${f(turnover)} × 1% = ${f(t.minTax)}`,
      ``,
      `УСН = max(${f(t.mainTax)}, ${f(t.minTax)}) = ${f(t.tax)}`,
    ].join("\n");

    fb.fixedContrib = `${f(fc)} (входит в расходы для базы)`;

  } else if (regime === "osn") {
    const fc = needsFC ? fixedContrib : 0;
    const allExp = payToMaster + acqCost + cashWithdrawal + empContrib + fc + onePctBefore + extraCommon;
    const expWithVat = acqCost + extraCommon;
    const t = calcOsn(turnover, allExp, osnRate, includeVat, 0.22, expWithVat);
    taxBefore = t.tax;
    beforeExtra.vatOutput = t.vatOutput;
    beforeExtra.vatInput = t.vatInput;
    beforeExtra.vatPayable = t.vatPayable;
    beforeExtra.profitTax = t.profitTax;
    beforeExtra.profitBase = t.profitBase;

    if (includeVat) {
      fb.vatOutput = `Оборот × 22 / 122\n${f(turnover)} × 22 / 122 = ${f(t.vatOutput)}`;
      fb.vatInput = `Расходы с НДС × 22 / 122\n(Экв ${f(acqCost)} + Доп ${f(extraCommon)}) × 22/122 = ${f(t.vatInput)}`;
      fb.vatPayable = `Исходящий − Входящий\n${f(t.vatOutput)} − ${f(t.vatInput)} = ${f(t.vatPayable)}`;
      fb.profitTax = [
        `Выручка без НДС = ${f(t.revExVat)}`,
        `Расходы без НДС = ${f(allExp - t.vatInput)}`,
        `Прибыль = ${f(t.profitBase)}`,
        `Налог = ${f(t.profitBase)} × ${osnRate * 100}% = ${f(t.profitTax)}`,
      ].join("\n");
    } else {
      fb.tax = [
        `Расходы = ${f(payToMaster)} + ${f(acqCost)} + ${f(cashWithdrawal)} + ${f(empContrib)} + ${f(fc)} + ${f(onePctBefore)} + ${f(extraCommon)} = ${f(allExp)}`,
        `Прибыль = ${f(turnover)} − ${f(allExp)} = ${f(t.profitBase)}`,
        `Налог = ${f(t.profitBase)} × ${osnRate * 100}% = ${f(t.profitTax)}`,
      ].join("\n");
    }

    fb.fixedContrib = `${f(fc)} (входит в расходы)`;

  } else if (regime === "patent") {
    const contribAll = (needsFC ? fixedContrib : 0) + onePctBefore + empContrib;
    const t = calcPatent(patentFee, contribAll, hasEmployees, true);
    taxBefore = t.tax;

    fb.tax = [
      `Стоимость патента = ${f(patentFee)}`,
      `Взносы для вычета = ${f(contribAll)}`,
      `Вычет = min(${f(contribAll)}, ${hasEmployees ? "50%" : "100%"} × ${f(patentFee)}) = ${f(t.deduction)}`,
      `Патент = ${f(patentFee)} − ${f(t.deduction)} = ${f(t.tax)}`,
    ].join("\n");

  } else if (regime === "patent_usn6") {
    const res = calcMixed({
      fixedContrib, onePct: onePctBefore, empContrib,
      hasEmployees, patentFee, incomeUsn, allowDeduction: true,
    });
    taxBefore = res.tax;
    fb.tax = `Патент + УСН 6% (смешанный режим)\nИтого налог = ${f(res.tax)}`;
  }

  // Чисто «до»
  let netBefore;
  if (regime === "usn6" || regime === "patent" || regime === "patent_usn6") {
    netBefore = turnover - payToMaster - acqCost - cashWithdrawal
      - taxBefore - onePctBefore - empContrib - extra;

    const parts = [f(turnover), f(payToMaster), f(acqCost), f(cashWithdrawal), f(taxBefore), f(onePctBefore), f(empContrib), f(extra)];
    const labels = ["Оборот", "Мастерам", "Экв", "Наличка", "Налог", "1%", "Страх.сотр", "Доп.расх"];
    fb.net = labels.map((l, i) => `${l}: ${parts[i]}`).join("\n")
      + `\n\n${parts[0]} − ${parts.slice(1).join(" − ")} = ${f(netBefore)}`;
  } else {
    const fc = needsFC ? fixedContrib : 0;
    netBefore = turnover - payToMaster - acqCost - cashWithdrawal
      - taxBefore - onePctBefore - empContrib - fc - extra;

    const parts = [f(turnover), f(payToMaster), f(acqCost), f(cashWithdrawal), f(taxBefore), f(onePctBefore), f(empContrib), f(fc), f(extra)];
    const labels = ["Оборот", "Мастерам", "Экв", "Наличка", "Налог", "1%", "Страх.сотр", "Фикс.взн", "Доп.расх"];
    fb.net = labels.map((l, i) => `${l}: ${parts[i]}`).join("\n")
      + `\n\n${parts[0]} − ${parts.slice(1).join(" − ")} = ${f(netBefore)}`;
  }

  // =========================================================
  //  ПОСЛЕ ВНЕДРЕНИЯ
  // =========================================================
  let taxAfter = 0;
  let afterExtra = {};

  if (regime === "usn6") {
    const contribAll = (needsFC ? fixedContrib : 0) + onePctAfter;
    const t = calcUsn6(rentIncome, contribAll, false, true);
    taxAfter = t.tax;

    const base = rentIncome * 0.06;
    fa.tax = [
      `База УСН = Доход × 6%`,
      `${f(rentIncome)} × 6% = ${f(base)}`,
      ``,
      `Взносы для вычета:`,
      `  Фикс ${f(needsFC ? fixedContrib : 0)} + 1% ${f(onePctAfter)} = ${f(contribAll)}`,
      ``,
      `Лимит вычета = 100% (нет сотрудников) = ${f(base)}`,
      `Вычет = min(${f(contribAll)}, ${f(base)}) = ${f(t.deduction)}`,
      ``,
      `УСН = ${f(base)} − ${f(t.deduction)} = ${f(t.tax)}`,
    ].join("\n");

  } else if (regime === "usn15") {
    const fc = needsFC ? fixedContrib : 0;
    const allExp = platformFee + fc + onePctAfter + extraUsn15;
    const t = calcUsn15(rentIncome, allExp);
    taxAfter = t.tax;
    afterExtra.taxBase = t.taxBase;

    fa.tax = [
      `Расходы = Мозен + Фикс + 1% + Доп`,
      `${f(platformFee)} + ${f(fc)} + ${f(onePctAfter)} + ${f(extraUsn15)} = ${f(allExp)}`,
      ``,
      `База = Доход − Расходы`,
      `${f(rentIncome)} − ${f(allExp)} = ${f(t.taxBase)}`,
      ``,
      `Налог 15% = ${f(t.taxBase)} × 15% = ${f(t.mainTax)}`,
      `Мин.налог 1% = ${f(rentIncome)} × 1% = ${f(t.minTax)}`,
      ``,
      `УСН = max(${f(t.mainTax)}, ${f(t.minTax)}) = ${f(t.tax)}`,
    ].join("\n");

    fa.fixedContrib = `${f(fc)} (входит в расходы для базы)`;

  } else if (regime === "osn") {
    const fc = needsFC ? fixedContrib : 0;
    const allExp = platformFee + fc + onePctAfter + extraCommon;
    const expWithVat = platformFee + extraCommon;
    const t = calcOsn(rentIncome, allExp, osnRate, includeVat, 0.22, expWithVat);
    taxAfter = t.tax;
    afterExtra.vatOutput = t.vatOutput;
    afterExtra.vatInput = t.vatInput;
    afterExtra.vatPayable = t.vatPayable;
    afterExtra.profitTax = t.profitTax;
    afterExtra.profitBase = t.profitBase;

    if (includeVat) {
      fa.vatOutput = `Доход × 22 / 122\n${f(rentIncome)} × 22 / 122 = ${f(t.vatOutput)}`;
      fa.vatInput = `Расходы с НДС × 22 / 122\n(Мозен ${f(platformFee)} + Доп ${f(extraCommon)}) × 22/122 = ${f(t.vatInput)}`;
      fa.vatPayable = `Исходящий − Входящий\n${f(t.vatOutput)} − ${f(t.vatInput)} = ${f(t.vatPayable)}`;
      fa.profitTax = [
        `Выручка без НДС = ${f(t.revExVat)}`,
        `Расходы без НДС = ${f(allExp - t.vatInput)}`,
        `Прибыль = ${f(t.profitBase)}`,
        `Налог = ${f(t.profitBase)} × ${osnRate * 100}% = ${f(t.profitTax)}`,
      ].join("\n");
    } else {
      fa.tax = [
        `Расходы = ${f(platformFee)} + ${f(fc)} + ${f(onePctAfter)} + ${f(extraCommon)} = ${f(allExp)}`,
        `Прибыль = ${f(rentIncome)} − ${f(allExp)} = ${f(t.profitBase)}`,
        `Налог = ${f(t.profitBase)} × ${osnRate * 100}% = ${f(t.profitTax)}`,
      ].join("\n");
    }

    fa.fixedContrib = `${f(fc)} (входит в расходы)`;

  } else if (regime === "patent") {
    const contribAll = (needsFC ? fixedContrib : 0) + onePctAfter;
    const t = calcPatent(patentFee, contribAll, false, true);
    taxAfter = t.tax;

    fa.tax = [
      `Патент = ${f(patentFee)}`,
      `Вычет = min(${f(contribAll)}, 100% × ${f(patentFee)}) = ${f(t.deduction)}`,
      `Итого = ${f(patentFee)} − ${f(t.deduction)} = ${f(t.tax)}`,
    ].join("\n");

  } else if (regime === "patent_usn6") {
    let usnIncome = incomeUsn, revFor1Pct = turnover;
    if (mixedAfterFromSalonIncome && turnover > 0) {
      usnIncome = incomeUsn * (rentIncome / turnover);
      revFor1Pct = rentIncome;
    }
    const onePctM = includeOnePct ? calcOnePctContrib(revFor1Pct) : 0;
    const res = calcMixed({
      fixedContrib, onePct: onePctM, empContrib: 0,
      hasEmployees: false, patentFee, incomeUsn: usnIncome, allowDeduction: true,
    });
    taxAfter = res.tax;
    fa.tax = `Патент + УСН 6% (смешанный)\nИтого = ${f(res.tax)}`;
  }

  // Чисто «после»
  let netAfter;
  if (regime === "usn6" || regime === "patent" || regime === "patent_usn6") {
    netAfter = rentIncome - platformFee - taxAfter - onePctAfter;

    fa.net = [
      `Доход: ${f(rentIncome)}`,
      `Мозен: ${f(platformFee)}`,
      `Налог: ${f(taxAfter)}`,
      `1%: ${f(onePctAfter)}`,
      ``,
      `${f(rentIncome)} − ${f(platformFee)} − ${f(taxAfter)} − ${f(onePctAfter)} = ${f(netAfter)}`,
    ].join("\n");
  } else {
    const fc = needsFC ? fixedContrib : 0;
    const ex = regime === "usn15" ? extraUsn15 : extraCommon;
    netAfter = rentIncome - platformFee - taxAfter - onePctAfter - fc - ex;

    fa.net = [
      `Доход: ${f(rentIncome)}`,
      `Мозен: ${f(platformFee)}`,
      `Налог: ${f(taxAfter)}`,
      `1%: ${f(onePctAfter)}`,
      `Фикс.взн: ${f(fc)}`,
      `Доп.расх: ${f(ex)}`,
      ``,
      `${f(rentIncome)} − ${f(platformFee)} − ${f(taxAfter)} − ${f(onePctAfter)} − ${f(fc)} − ${f(ex)} = ${f(netAfter)}`,
    ].join("\n");
  }

  const showFixedContrib = (regime === "usn15" || regime === "osn") && needsFC;

  return {
    before: {
      revenue: turnover, payMaster: payToMaster, acquiring: acqCost, cashWithdrawal,
      tax: taxBefore, onePct: onePctBefore, empContrib,
      fixedContrib: showFixedContrib ? fixedContrib : 0,
      extra, net: netBefore,
      ...beforeExtra,
    },
    after: {
      revenue: rentIncome, platformFee,
      tax: taxAfter, onePct: onePctAfter,
      fixedContrib: showFixedContrib ? fixedContrib : 0,
      extra: (regime === "usn15" || regime === "osn") ? (regime === "usn15" ? extraUsn15 : extraCommon) : 0,
      net: netAfter,
      ...afterExtra,
    },
    diff: {
      tax: (taxAfter + onePctAfter) - (taxBefore + onePctBefore + empContrib),
      net: netAfter - netBefore,
    },
    formulas: { before: fb, after: fa },
  };

  function calcMixed({ fixedContrib: fc, onePct, empContrib: ec, hasEmployees: he, patentFee: pf, incomeUsn: iu, allowDeduction: ad }) {
    const contribAll = fc + onePct + ec;
    const pat = calcPatent(pf, contribAll, he, ad);
    const remaining = Math.max(0, contribAll - (pat.deduction || 0));
    const usn = calcUsn6(iu, remaining, he, ad);
    return { tax: pat.tax + usn.tax };
  }
}
