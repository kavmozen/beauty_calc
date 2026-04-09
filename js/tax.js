function n(x) {
  const v = typeof x === "number" ? x : parseFloat(x);
  return Number.isFinite(v) ? v : 0;
}

/**
 * 1% взнос с дохода сверх 300 000.
 * Cap = 277 571 (2024).
 */
export function calcOnePctContrib(revenue, threshold = 300000, cap = 277571) {
  const r = Math.max(0, n(revenue));
  const base = Math.max(0, r - threshold);
  return Math.min(base * 0.01, cap);
}

/**
 * УСН 6%: налог = выручка × 6%, с вычетом взносов.
 * hasEmployees → вычет до 50%, иначе до 100%.
 */
export function calcUsn6(revenue, contribAll, hasEmployees, allowDeduction) {
  const rev = Math.max(0, n(revenue));
  const baseTax = rev * 0.06;
  if (!allowDeduction) {
    return { tax: baseTax, deduction: 0 };
  }
  const cap = hasEmployees ? baseTax * 0.5 : baseTax;
  const deduction = Math.min(Math.max(0, n(contribAll)), cap);
  return { tax: Math.max(baseTax - deduction, 0), deduction };
}

/**
 * УСН 15%: налог = (доход - расходы) × 15%, минимум 1% от дохода.
 * Вычет взносов отсутствует — взносы входят в расходы.
 */
export function calcUsn15(revenue, expenses) {
  const rev = Math.max(0, n(revenue));
  const exp = Math.max(0, n(expenses));
  const taxBase = Math.max(rev - exp, 0);
  const mainTax = taxBase * 0.15;
  const minTax = rev * 0.01;
  return { tax: Math.max(mainTax, minTax), taxBase, mainTax, minTax };
}

/**
 * Патент: налог = стоимость патента, с вычетом взносов.
 */
export function calcPatent(patentFee, contribAll, hasEmployees, allowDeduction) {
  const pat = Math.max(0, n(patentFee));
  if (!allowDeduction) {
    return { tax: pat, deduction: 0 };
  }
  const cap = hasEmployees ? pat * 0.5 : pat;
  const deduction = Math.min(Math.max(0, n(contribAll)), cap);
  return { tax: Math.max(pat - deduction, 0), deduction };
}

/**
 * ОСН: налог на прибыль + опционально НДС.
 *
 * @param revenue       — выручка (включая НДС, если includeVat)
 * @param expenses      — все расходы (для расчёта прибыли)
 * @param osnRate       — ставка налога на прибыль (0.25 для ООО, 0.13/0.15 для ИП)
 * @param includeVat    — считать ли НДС
 * @param vatRate       — ставка НДС (0.22)
 * @param expensesWithVat — сумма расходов, в которых «сидит» НДС (для входящего НДС)
 */
export function calcOsn(revenue, expenses, osnRate, includeVat, vatRate = 0.22, expensesWithVat = 0) {
  const rev = Math.max(0, n(revenue));
  const exp = Math.max(0, n(expenses));
  const rate = Math.max(0, n(osnRate));

  let vatOutput = 0, vatInput = 0, vatPayable = 0;
  let revExVat = rev;

  if (includeVat) {
    vatOutput = rev * vatRate / (1 + vatRate);
    vatInput = Math.max(0, n(expensesWithVat)) * vatRate / (1 + vatRate);
    vatPayable = Math.max(0, vatOutput - vatInput);
    revExVat = rev - vatOutput;
  }

  // Расходы без НДС для базы налога на прибыль
  const expExVat = includeVat ? (exp - vatInput) : exp;
  const profitBase = Math.max(revExVat - expExVat, 0);
  const profitTax = profitBase * rate;

  return {
    tax: vatPayable + profitTax,
    profitTax,
    profitBase,
    vatOutput,
    vatInput,
    vatPayable,
    revExVat,
  };
}
