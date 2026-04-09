import { calcUsn6, calcUsn15, calcPatent, calcOsn, calcOnePctContrib } from "./tax.js";
import { clamp, num } from "./utils.js";

/**
 * Главная модель: «до» и «после» внедрения.
 *
 * USN 6%:  налог = выручка × 6% минус вычет взносов. Фикс.взносы НЕ в net.
 * USN 15%: налог = (доход − расходы) × 15%. ВСЕ взносы = расходы, вычитаются из net.
 * ОСН:     налог на прибыль (доход − расходы) × ставка + опционально НДС.
 * Патент:  фикс.стоимость с вычетом взносов.
 *
 * «После»: сотрудников нет (мастера — самозанятые).
 */
export function computeBeforeAfter(input) {
  const regime = input.regime;

  // --- Парсинг входных данных ---
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

  // mixed inputs
  const incomePatent = Math.max(0, num(input.incomePatent, 0));
  const incomeUsn = Math.max(0, num(input.incomeUsn, 0));
  const mixedAfterFromSalonIncome = !!input.mixedAfterFromSalonIncome;

  // --- Общие суммы ---
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

  function needsFixedContrib() {
    return regime === "usn6" || regime === "usn15" || regime === "patent" || isOsnIP;
  }

  function onePctFor(rev) {
    if (!includeOnePct) return 0;
    if (regime === "osn" && !isOsnIP) return 0;
    return calcOnePctContrib(rev);
  }

  // =========================================================
  //  ДО ВНЕДРЕНИЯ
  // =========================================================
  const onePctBefore = onePctFor(turnover);
  let taxBefore = 0;
  let beforeExtra = {};  // дополнительные поля для отображения

  if (regime === "usn6") {
    // Взносы для вычета: фикс + 1% + сотрудники
    const contribAll = (needsFixedContrib() ? fixedContrib : 0) + onePctBefore + empContrib;
    const t = calcUsn6(turnover, contribAll, hasEmployees, true);
    taxBefore = t.tax;

  } else if (regime === "usn15") {
    // ВСЕ расходы уменьшают базу
    const allExp = payToMaster + acqCost + cashWithdrawal + empContrib
      + (needsFixedContrib() ? fixedContrib : 0) + onePctBefore + extraUsn15;
    const t = calcUsn15(turnover, allExp);
    taxBefore = t.tax;
    beforeExtra.taxBase = t.taxBase;

  } else if (regime === "osn") {
    const fc = needsFixedContrib() ? fixedContrib : 0;
    const allExp = payToMaster + acqCost + cashWithdrawal + empContrib + fc + onePctBefore + extraCommon;
    // Расходы, в которых «сидит» НДС (для входящего НДС)
    const expWithVat = acqCost + extraCommon;
    const t = calcOsn(turnover, allExp, osnRate, includeVat, 0.22, expWithVat);
    taxBefore = t.tax;
    beforeExtra.vatOutput = t.vatOutput;
    beforeExtra.vatInput = t.vatInput;
    beforeExtra.vatPayable = t.vatPayable;
    beforeExtra.profitTax = t.profitTax;
    beforeExtra.profitBase = t.profitBase;

  } else if (regime === "patent") {
    const contribAll = (needsFixedContrib() ? fixedContrib : 0) + onePctBefore + empContrib;
    const t = calcPatent(patentFee, contribAll, hasEmployees, true);
    taxBefore = t.tax;

  } else if (regime === "patent_usn6") {
    const res = calcMixed({
      fixedContrib, onePct: onePctBefore, empContrib,
      hasEmployees, patentFee, incomeUsn, allowDeduction: true,
    });
    taxBefore = res.tax;
  }

  // Чисто салона «до»
  const extra = regime === "usn15" ? extraUsn15 : extraCommon;
  let netBefore;
  if (regime === "usn6" || regime === "patent" || regime === "patent_usn6") {
    // Фикс.взносы НЕ вычитаются из net (вернулись через вычет)
    netBefore = turnover - payToMaster - acqCost - cashWithdrawal
      - taxBefore - onePctBefore - empContrib - extra;
  } else {
    // USN 15%, ОСН: фикс.взносы — реальный расход
    const fc = needsFixedContrib() ? fixedContrib : 0;
    netBefore = turnover - payToMaster - acqCost - cashWithdrawal
      - taxBefore - onePctBefore - empContrib - fc - extra;
  }

  // =========================================================
  //  ПОСЛЕ ВНЕДРЕНИЯ (сотрудников нет)
  // =========================================================
  const onePctAfter = onePctFor(rentIncome);
  let taxAfter = 0;
  let afterExtra = {};

  if (regime === "usn6") {
    const contribAll = (needsFixedContrib() ? fixedContrib : 0) + onePctAfter;
    const t = calcUsn6(rentIncome, contribAll, false, true);
    taxAfter = t.tax;

  } else if (regime === "usn15") {
    const fc = needsFixedContrib() ? fixedContrib : 0;
    const allExp = platformFee + fc + onePctAfter + extraUsn15;
    const t = calcUsn15(rentIncome, allExp);
    taxAfter = t.tax;
    afterExtra.taxBase = t.taxBase;

  } else if (regime === "osn") {
    const fc = needsFixedContrib() ? fixedContrib : 0;
    const allExp = platformFee + fc + onePctAfter + extraCommon;
    const expWithVat = platformFee + extraCommon;
    const t = calcOsn(rentIncome, allExp, osnRate, includeVat, 0.22, expWithVat);
    taxAfter = t.tax;
    afterExtra.vatOutput = t.vatOutput;
    afterExtra.vatInput = t.vatInput;
    afterExtra.vatPayable = t.vatPayable;
    afterExtra.profitTax = t.profitTax;
    afterExtra.profitBase = t.profitBase;

  } else if (regime === "patent") {
    const contribAll = (needsFixedContrib() ? fixedContrib : 0) + onePctAfter;
    const t = calcPatent(patentFee, contribAll, false, true);
    taxAfter = t.tax;

  } else if (regime === "patent_usn6") {
    let usnIncome = incomeUsn;
    let revFor1Pct = turnover;
    if (mixedAfterFromSalonIncome && turnover > 0) {
      const factor = rentIncome / turnover;
      usnIncome = incomeUsn * factor;
      revFor1Pct = rentIncome;
    }
    const onePctM = includeOnePct ? calcOnePctContrib(revFor1Pct) : 0;
    const res = calcMixed({
      fixedContrib, onePct: onePctM, empContrib: 0,
      hasEmployees: false, patentFee, incomeUsn: usnIncome, allowDeduction: true,
    });
    taxAfter = res.tax;
  }

  // Чисто салона «после»
  let netAfter;
  if (regime === "usn6" || regime === "patent" || regime === "patent_usn6") {
    netAfter = rentIncome - platformFee - taxAfter - onePctAfter;
  } else {
    const fc = needsFixedContrib() ? fixedContrib : 0;
    const ex = regime === "usn15" ? extraUsn15 : extraCommon;
    netAfter = rentIncome - platformFee - taxAfter - onePctAfter - fc - ex;
  }

  // =========================================================
  //  Показываем фикс.взносы как отдельную строку для USN15/OSN
  // =========================================================
  const showFixedContrib = (regime === "usn15" || regime === "osn") && needsFixedContrib();

  return {
    before: {
      revenue: turnover,
      payMaster: payToMaster,
      acquiring: acqCost,
      cashWithdrawal,
      tax: taxBefore,
      onePct: onePctBefore,
      empContrib,
      fixedContrib: showFixedContrib ? fixedContrib : 0,
      extra,
      net: netBefore,
      ...beforeExtra,
    },
    after: {
      revenue: rentIncome,
      platformFee,
      tax: taxAfter,
      onePct: onePctAfter,
      fixedContrib: showFixedContrib ? fixedContrib : 0,
      extra: (regime === "usn15" || regime === "osn") ? (regime === "usn15" ? extraUsn15 : extraCommon) : 0,
      net: netAfter,
      ...afterExtra,
    },
    diff: {
      tax: (taxAfter + onePctAfter) - (taxBefore + onePctBefore + empContrib),
      net: netAfter - netBefore,
    },
  };

  // --- Вспомогательная: смешанный режим patent_usn6 ---
  function calcMixed({ fixedContrib: fc, onePct, empContrib: ec, hasEmployees: he, patentFee: pf, incomeUsn: iu, allowDeduction: ad }) {
    const contribAll = fc + onePct + ec;

    const pat = calcPatent(pf, contribAll, he, ad);
    const usedForPatent = pat.deduction || 0;
    const remaining = Math.max(0, contribAll - usedForPatent);

    const usn = calcUsn6(iu, remaining, he, ad);

    return { tax: pat.tax + usn.tax };
  }
}

function getOsnRate(osnType) {
  if (osnType === "ip13") return 0.13;
  if (osnType === "ip15") return 0.15;
  return 0.25;
}
