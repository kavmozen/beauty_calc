import { calcTax, calcOnePctContrib } from "./tax.js";
import { clamp, num } from "./utils.js";

/**
 * Режимы:
 * - usn6, usn15, osn, patent
 * - patent_usn6: патент + УСН6 для "иных поступлений"
 */
export function computeBeforeAfter(input) {
  const regime = input.regime;

  const turnover = Math.max(0, num(input.turnover, 0));
  const acquiringRate = Math.max(0, num(input.acquiringRate, 0));

  const hasEmployees = !!input.hasEmployees;
  const empCount = hasEmployees ? Math.max(0, Math.round(num(input.empCount, 0))) : 0;
  const empSalary = hasEmployees ? Math.max(0, num(input.empSalary, 0)) : 0;

  const fixedContribVal = Math.max(0, num(input.fixedContrib, 0));
  const includeOnePct = !!input.includeOnePct;

  const splitMaster = clamp(num(input.splitMaster, 0), 0, 100);

  const patentFee = Math.max(0, num(input.patentFee, 0));
  const extraCommon = Math.max(0, num(input.extra, 0));
  const extraUsn15 = Math.max(0, num(input.extra15, 0));
  const extra = regime === "usn15" ? extraUsn15 : extraCommon;

  const includeVat = !!input.includeVat || regime === "osn";
  const osnRate = num(input.osnRate, 0.2);
  const osnType = input.osnType || "ooo20";

  const finalSplitMaster = clamp(splitMaster, 0, 100);
  const finalSplitSalon = clamp(100 - finalSplitMaster, 0, 100);

  const acqCost = turnover * (acquiringRate / 100);
  const payToMasterBefore = turnover * (finalSplitMaster / 100);

  // Взносы за сотрудников
  const contribEmployees =
    hasEmployees
      ? (regime === "usn15"
          ? Math.max(0, num(input.empContribSum, 0))
          : empCount * empSalary * 0.30)
      : 0;

  // mixed inputs
  const incomePatent = Math.max(0, num(input.incomePatent, 0));
  const incomeUsn = Math.max(0, num(input.incomeUsn, 0));
  const mixedAfterFromSalonIncome = !!input.mixedAfterFromSalonIncome;

  // ОСН для ИП тоже платит фиксированные взносы
  const isOsnIP = regime === "osn" && (osnType === "ip13" || osnType === "ip15");

  function needsFixedContrib() {
    return regime === "usn6" || regime === "usn15" || regime === "patent" || isOsnIP;
  }

  function onePctFor(rev) {
    if (!includeOnePct) return 0;
    // На ОСН для ООО — нет 1% взноса; для ИП на ОСН — есть (считается от дохода минус расходы)
    if (regime === "osn" && !isOsnIP) return 0;
    return calcOnePctContrib(rev);
  }

  /**
   * Расчёт налогов для режима patent_usn6
   */
  function calcMixedTax({ allowDeduction, incomeUsnForTax, revenueForOnePct }) {
    const onePct = onePctFor(revenueForOnePct);
    const contribSelf = fixedContribVal + onePct;
    const contribTotal = contribSelf + contribEmployees;

    const patentObj = calcTax({
      regime: "patent",
      revenue: 0,
      profit: 0,
      patentFee,
      includeVat: false,
      contribSelf,
      contribEmployees,
      hasEmployees,
      allowDeduction,
      osnRate: 0.2,
    });

    const usedForPatent = patentObj.deduction || 0;
    const remainingContrib = Math.max(0, contribTotal - usedForPatent);

    const usnObj = calcTax({
      regime: "usn6",
      revenue: incomeUsnForTax,
      profit: 0,
      patentFee: 0,
      includeVat: false,
      contribSelf: remainingContrib,
      contribEmployees: 0,
      hasEmployees,
      allowDeduction,
      osnRate: 0.2,
    });

    const tax = patentObj.tax + usnObj.tax;

    return {
      tax,
      contribSelf,
      contribTotal,
      load: tax + contribTotal,
      details: {
        patentTax: patentObj.tax,
        usnTax: usnObj.tax,
        usedForPatent,
        remainingContrib,
      },
    };
  }

  // ===== ДО ВНЕДРЕНИЯ =====
  let taxBefore = 0;
  let contribSelfBefore = 0;
  let contribTotalBefore = 0;
  let loadBefore = 0;

  if (regime === "patent_usn6") {
    const mixed = calcMixedTax({
      allowDeduction: true,
      incomeUsnForTax: incomeUsn,
      revenueForOnePct: turnover,
    });

    taxBefore = mixed.tax;
    contribSelfBefore = mixed.contribSelf;
    contribTotalBefore = mixed.contribTotal;
    loadBefore = mixed.load;
  } else {
    const onePctBefore = onePctFor(turnover);
    contribSelfBefore = needsFixedContrib() ? fixedContribVal + onePctBefore : 0;

    let profitBefore = 0;

    if (regime === "usn15") {
      // FIX: включаем мастеров и эквайринг в расходы
      const expenseForTaxBefore = extraUsn15 + contribSelfBefore + contribEmployees + payToMasterBefore + acqCost;
      profitBefore = turnover - expenseForTaxBefore;
    } else if (regime === "osn") {
      // FIX: считаем прибыль от выручки без НДС
      const revenueExVat = includeVat ? turnover * 100 / 120 : turnover;
      profitBefore = revenueExVat - payToMasterBefore - extraCommon - acqCost - (contribSelfBefore + contribEmployees);
    } else {
      profitBefore = turnover - payToMasterBefore - extra - acqCost;
    }

    const taxBeforeObj = calcTax({
      regime,
      revenue: turnover,
      profit: profitBefore,
      patentFee,
      includeVat,
      contribSelf: contribSelfBefore,
      contribEmployees,
      hasEmployees,
      allowDeduction: true,
      osnRate,
    });

    taxBefore = taxBeforeObj.tax;
    contribTotalBefore = contribSelfBefore + contribEmployees;
    loadBefore = taxBefore + contribTotalBefore;
  }

  const netBefore =
    turnover - taxBefore - payToMasterBefore - extra - acqCost - contribTotalBefore;

  // ===== ПОСЛЕ ВНЕДРЕНИЯ =====
  const rentIncome = turnover * (finalSplitSalon / 100);

  let taxAfter = 0;
  let contribSelfAfter = 0;
  let contribTotalAfter = 0;
  let loadAfter = 0;

  if (regime === "patent_usn6") {
    let incomeUsnAfter = incomeUsn;
    let revenueForOnePctAfter = turnover;

    if (mixedAfterFromSalonIncome) {
      const factor = turnover > 0 ? (rentIncome / turnover) : 0;
      incomeUsnAfter = incomeUsn * factor;
      revenueForOnePctAfter = rentIncome;
    }

    const mixed = calcMixedTax({
      allowDeduction: false,
      incomeUsnForTax: incomeUsnAfter,
      revenueForOnePct: revenueForOnePctAfter,
    });

    taxAfter = mixed.tax;
    contribSelfAfter = mixed.contribSelf;
    contribTotalAfter = mixed.contribTotal;
    loadAfter = mixed.load;
  } else {
    const onePctAfter = onePctFor(rentIncome);
    contribSelfAfter = needsFixedContrib() ? fixedContribVal + onePctAfter : 0;

    let profitAfter = 0;

    if (regime === "usn15") {
      // FIX: аналогично — включаем все расходы
      const expenseForTaxAfter = extraUsn15 + contribSelfAfter + contribEmployees;
      profitAfter = rentIncome - expenseForTaxAfter;
    } else if (regime === "osn") {
      const revenueExVat = includeVat ? rentIncome * 100 / 120 : rentIncome;
      profitAfter = revenueExVat - extraCommon - (contribSelfAfter + contribEmployees);
    } else {
      profitAfter = rentIncome;
    }

    const taxAfterObj = calcTax({
      regime,
      revenue: rentIncome,
      profit: profitAfter,
      patentFee,
      includeVat,
      contribSelf: contribSelfAfter,
      contribEmployees,
      hasEmployees,
      allowDeduction: false,
      osnRate,
    });

    taxAfter = taxAfterObj.tax;
    contribTotalAfter = contribSelfAfter + contribEmployees;
    loadAfter = taxAfter + contribTotalAfter;
  }

  const netAfter = rentIncome - taxAfter - contribTotalAfter;

  return {
    before: {
      revenue: turnover,
      payMaster: payToMasterBefore,
      acquiring: acqCost,
      tax: taxBefore,
      extra,
      contribSelf: contribSelfBefore,
      contribEmployees,
      contribTotal: contribTotalBefore,
      load: loadBefore,
      net: netBefore,
    },
    after: {
      revenue: rentIncome,
      tax: taxAfter,
      contribSelf: contribSelfAfter,
      contribEmployees,
      contribTotal: contribTotalAfter,
      load: loadAfter,
      net: netAfter,
    },
    diff: {
      tax: taxAfter - taxBefore,
      net: netAfter - netBefore,
    },
    meta: {
      finalSplitMaster,
      finalSplitSalon,
      mixed: regime === "patent_usn6"
        ? { incomePatent, incomeUsn, mixedAfterFromSalonIncome }
        : null,
    },
  };
}
