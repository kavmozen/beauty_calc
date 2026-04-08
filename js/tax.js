function n(x) {
  const v = typeof x === "number" ? x : parseFloat(x);
  return Number.isFinite(v) ? v : 0;
}

/**
 * 1% взнос с дохода сверх 300 000.
 * Cap = 277 571 (2024). Обновить при необходимости.
 */
export function calcOnePctContrib(revenue, threshold = 300000, cap = 277571) {
  const r = Math.max(0, n(revenue));
  const base = Math.max(0, r - threshold);
  return Math.min(base * 0.01, cap);
}

/**
 * Расчёт налога.
 *
 * contribAll — ВСЕ взносы (фикс + 1% + сотрудники), используются для вычета.
 * allowDeduction — разрешён ли вычет (true = «до», false = «после»).
 * hasEmployees — если true, вычет ограничен 50% налога; иначе 100%.
 */
export function calcTax({
  regime,
  revenue,
  profit,
  patentFee,
  includeVat,
  contribAll = 0,
  hasEmployees = false,
  allowDeduction = true,
  osnRate = 0.2,
}) {
  const rev = Math.max(0, n(revenue));
  const prof = n(profit);
  const pat = Math.max(0, n(patentFee));
  const contrib = Math.max(0, n(contribAll));

  function applyDeduction(baseTax) {
    if (!allowDeduction) {
      return { tax: baseTax, baseTax, deduction: 0, deductionCap: 0 };
    }
    const cap = hasEmployees ? baseTax * 0.5 : baseTax;
    const deduction = Math.min(contrib, cap);
    const tax = Math.max(baseTax - deduction, 0);
    return { tax, baseTax, deduction, deductionCap: cap };
  }

  if (regime === "usn6") {
    return applyDeduction(rev * 0.06);
  }

  if (regime === "usn15") {
    const mainTax = Math.max(prof, 0) * 0.15;
    const minimalTax = rev * 0.01;
    const tax = Math.max(mainTax, minimalTax);
    return { tax, baseTax: tax, deduction: 0, deductionCap: 0 };
  }

  if (regime === "patent") {
    return applyDeduction(pat);
  }

  if (regime === "osn") {
    const vat = includeVat ? rev * 20 / 120 : 0;
    const profitTax = Math.max(prof, 0) * Math.max(0, n(osnRate));
    const tax = vat + profitTax;
    return { tax, baseTax: tax, deduction: 0, deductionCap: 0 };
  }

  return { tax: 0, baseTax: 0, deduction: 0, deductionCap: 0 };
}
