import { calcTax, calcOnePctContrib } from "./tax.js";
import { clamp, num } from "./utils.js";

/**
 * Главная модель расчёта «до» и «после» внедрения.
 *
 * КЛЮЧЕВАЯ ЛОГИКА (по таблице):
 * - Фикс.взносы ИП участвуют в вычете УСН, но НЕ вычитаются из чистой прибыли.
 * - «После»: сотрудников нет (мастера — самозанятые), вычет взносов 100%.
 * - «После»: вместо эквайринга — комиссия платформы (Мозен).
 * - 1% взнос и страх.взносы за сотрудников вычитаются из чистой прибыли.
 */
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
  const extra = regime === "usn15" ? extraUsn15 : extraCommon;

  const includeVat = !!input.includeVat || regime === "osn";
  const osnRate = num(input.osnRate, 0.2);
  const osnType = input.osnType || "ooo20";
  const isOsnIP = regime === "osn" && (osnType === "ip13" || osnType === "ip15");

  // Новые поля
  const platformFeeRate = Math.max(0, num(input.platformFeeRate, 0));
  const cashWithdrawal = Math.max(0, num(input.cashWithdrawal, 0));

  const acqCost = turnover * (acquiringRate / 100);
  const payToMaster = turnover * (splitMaster / 100);

  // Страх.взносы за сотрудников (только «до»)
  const empContrib = hasEmployees
    ? (regime === "usn15"
        ? Math.max(0, num(input.empContribSum, 0))
        : empCount * empSalary * 0.30)
    : 0;

  // Нужны ли фикс.взносы ИП для данного режима
  function needsFixedContrib() {
    return regime === "usn6" || regime === "usn15" || regime === "patent" || isOsnIP;
  }

  function onePctFor(rev) {
    if (!includeOnePct) return 0;
    if (regime === "osn" && !isOsnIP) return 0;
    return calcOnePctContrib(rev);
  }

  // mixed inputs
  const incomePatent = Math.max(0, num(input.incomePatent, 0));
  const incomeUsn = Math.max(0, num(input.incomeUsn, 0));
  const mixedAfterFromSalonIncome = !!input.mixedAfterFromSalonIncome;

  function calcMixedTax({ allowDeduction, hasEmp, incomeUsnForTax, revenueForOnePct, empContribLocal }) {
    const onePct = onePctFor(revenueForOnePct);
    const contribAll = fixedContrib + onePct + empContribLocal;

    const patentObj = calcTax({
      regime: "patent",
      revenue: 0,
      profit: 0,
      patentFee,
      includeVat: false,
      contribAll,
      hasEmployees: hasEmp,
      allowDeduction,
      osnRate: 0.2,
    });

    const usedForPatent = patentObj.deduction || 0;
    const remainingContrib = Math.max(0, contribAll - usedForPatent);

    const usnObj = calcTax({
      regime: "usn6",
      revenue: incomeUsnForTax,
      profit: 0,
      patentFee: 0,
      includeVat: false,
      contribAll: remainingContrib,
      hasEmployees: hasEmp,
      allowDeduction,
      osnRate: 0.2,
    });

    return {
      tax: patentObj.tax + usnObj.tax,
      onePct,
      empContrib: empContribLocal,
    };
  }

  // ===== ДО ВНЕДРЕНИЯ =====
  let taxBefore = 0;
  let onePctBefore = 0;
  let empContribBefore = empContrib;

  if (regime === "patent_usn6") {
    const m = calcMixedTax({
      allowDeduction: true,
      hasEmp: hasEmployees,
      incomeUsnForTax: incomeUsn,
      revenueForOnePct: turnover,
      empContribLocal: empContrib,
    });
    taxBefore = m.tax;
    onePctBefore = m.onePct;
  } else {
    onePctBefore = onePctFor(turnover);
    const contribAllBefore = (needsFixedContrib() ? fixedContrib : 0) + onePctBefore + empContrib;

    let profitBefore = 0;
    if (regime === "usn15") {
      profitBefore = turnover - (extraUsn15 + contribAllBefore + payToMaster + acqCost);
    } else if (regime === "osn") {
      const revExVat = includeVat ? turnover * 100 / 120 : turnover;
      profitBefore = revExVat - payToMaster - extraCommon - acqCost - contribAllBefore;
    } else {
      profitBefore = turnover - payToMaster - extra - acqCost;
    }

    const taxObj = calcTax({
      regime,
      revenue: turnover,
      profit: profitBefore,
      patentFee,
      includeVat,
      contribAll: contribAllBefore,
      hasEmployees,
      allowDeduction: true,
      osnRate,
    });
    taxBefore = taxObj.tax;
  }

  // Чисто салона «до»:
  // turnover - мастерам - эквайринг - наличка - УСН - 1%взнос - страх.сотр - доп.расходы
  // Фикс.взносы НЕ вычитаются (они «вернулись» через вычет)
  const netBefore = turnover - payToMaster - acqCost - cashWithdrawal - taxBefore - onePctBefore - empContribBefore - extra;

  // ===== ПОСЛЕ ВНЕДРЕНИЯ =====
  const rentIncome = turnover * (finalSplitSalon / 100);
  const platformFee = turnover * (platformFeeRate / 100);

  let taxAfter = 0;
  let onePctAfter = 0;

  // После внедрения: сотрудников НЕТ, мастера — самозанятые
  if (regime === "patent_usn6") {
    let incomeUsnAfter = incomeUsn;
    let revForOnePct = turnover;
    if (mixedAfterFromSalonIncome) {
      const factor = turnover > 0 ? (rentIncome / turnover) : 0;
      incomeUsnAfter = incomeUsn * factor;
      revForOnePct = rentIncome;
    }
    const m = calcMixedTax({
      allowDeduction: true,
      hasEmp: false,
      incomeUsnForTax: incomeUsnAfter,
      revenueForOnePct: revForOnePct,
      empContribLocal: 0,
    });
    taxAfter = m.tax;
    onePctAfter = m.onePct;
  } else {
    onePctAfter = onePctFor(rentIncome);
    const contribAllAfter = (needsFixedContrib() ? fixedContrib : 0) + onePctAfter;

    let profitAfter = 0;
    if (regime === "usn15") {
      profitAfter = rentIncome - (extraUsn15 + contribAllAfter);
    } else if (regime === "osn") {
      const revExVat = includeVat ? rentIncome * 100 / 120 : rentIncome;
      profitAfter = revExVat - extraCommon - contribAllAfter;
    } else {
      profitAfter = rentIncome;
    }

    const taxObj = calcTax({
      regime,
      revenue: rentIncome,
      profit: profitAfter,
      patentFee,
      includeVat,
      contribAll: contribAllAfter,
      hasEmployees: false, // после внедрения сотрудников нет
      allowDeduction: true,
      osnRate,
    });
    taxAfter = taxObj.tax;
  }

  // Чисто салона «после»:
  // доход салона - комиссия платформы - УСН - 1%взнос
  const netAfter = rentIncome - platformFee - taxAfter - onePctAfter;

  return {
    before: {
      revenue: turnover,
      payMaster: payToMaster,
      acquiring: acqCost,
      cashWithdrawal,
      tax: taxBefore,
      onePct: onePctBefore,
      empContrib: empContribBefore,
      extra,
      net: netBefore,
    },
    after: {
      revenue: rentIncome,
      platformFee,
      tax: taxAfter,
      onePct: onePctAfter,
      net: netAfter,
    },
    diff: {
      tax: (taxAfter + onePctAfter) - (taxBefore + onePctBefore + empContribBefore),
      net: netAfter - netBefore,
    },
  };
}
