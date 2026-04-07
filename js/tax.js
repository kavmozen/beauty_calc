function n(x) {
  const v = typeof x === "number" ? x : parseFloat(x);
  return Number.isFinite(v) ? v : 0;
}

/**
 * 1% взнос с дохода сверх порога.
 * Порог 300 000, ограничение 277 571 (8 × фикс.взносы 2024).
 * При необходимости обновить cap на актуальный год.
 */
export function calcOnePctContrib(revenue, threshold = 300000, cap = 277571) {
  const r = Math.max(0, n(revenue));
  const base = Math.max(0, r - threshold);
  const val = base * 0.01;
  return Math.min(val, cap);
}

export function calcTax({
  regime,
  revenue,
  profit,
  patentFee,
  includeVat,
  contribSelf = 0,
  contribEmployees = 0,
  hasEmployees = false,
  allowDeduction = true,
  osnRate = 0.2,
}) {
  const rev = Math.max(0, n(revenue));
  const prof = n(profit);
  const pat = Math.max(0, n(patentFee));

  const contribEmp = hasEmployees ? Math.max(0, n(contribEmployees)) : 0;
  const contribTotal = Math.max(0, n(contribSelf)) + contribEmp;

  function applyDeduction(baseTax) {
    if (!allowDeduction) {
      return { tax: baseTax, baseTax, deduction: 0, deductionCap: 0 };
    }
    const cap = hasEmployees ? baseTax * 0.5 : baseTax;
    const deduction = Math.min(contribTotal, cap);
    const tax = Math.max(baseTax - deduction, 0);
    return { tax, baseTax, deduction, deductionCap: cap };
  }

  if (regime === "usn6") {
    const baseTax = rev * 0.06;
    return applyDeduction(baseTax);
  }

  if (regime === "usn15") {
    const mainTax = Math.max(prof, 0) * 0.15;
    const minimalTax = rev * 0.01;
    const tax = Math.max(mainTax, minimalTax);
    return { tax, baseTax: tax, deduction: 0, deductionCap: 0 };
  }

  if (regime === "patent") {
    const baseTax = pat;
    return applyDeduction(baseTax);
  }

  if (regime === "osn") {
    // НДС "изнутри": выручка включает НДС → извлекаем как rev × 20 / 120
    const vat = includeVat ? rev * 20 / 120 : 0;
    // profit передаётся уже без НДС из model.js
    const profitTax = Math.max(prof, 0) * Math.max(0, n(osnRate));
    const tax = vat + profitTax;
    return { tax, baseTax: tax, deduction: 0, deductionCap: 0 };
  }

  return { tax: 0, baseTax: 0, deduction: 0, deductionCap: 0 };
}
