function n(x) {
  const v = typeof x === "number" ? x : parseFloat(x);
  return Number.isFinite(v) ? v : 0;
}

export function calcOnePctContrib(revenue, threshold = 300000, cap = 277571) {
  const r = Math.max(0, n(revenue));
  const base = Math.max(0, r - threshold);
  return Math.min(base * 0.01, cap);
}

export function calcUsn6(revenue, contribAll, hasEmployees, allowDeduction) {
  const rev = Math.max(0, n(revenue));
  const baseTax = rev * 0.06;
  if (!allowDeduction) return { tax: baseTax, deduction: 0 };
  const cap = hasEmployees ? baseTax * 0.5 : baseTax;
  const deduction = Math.min(Math.max(0, n(contribAll)), cap);
  return { tax: Math.max(baseTax - deduction, 0), deduction };
}

export function calcUsn15(revenue, expenses) {
  const rev = Math.max(0, n(revenue));
  const exp = Math.max(0, n(expenses));
  const taxBase = Math.max(rev - exp, 0);
  const mainTax = taxBase * 0.15;
  const minTax = rev * 0.01;
  return { tax: Math.max(mainTax, minTax), taxBase, mainTax, minTax };
}

export function calcPatent(patentFee, contribAll, hasEmployees, allowDeduction) {
  const pat = Math.max(0, n(patentFee));
  if (!allowDeduction) return { tax: pat, deduction: 0 };
  const cap = hasEmployees ? pat * 0.5 : pat;
  const deduction = Math.min(Math.max(0, n(contribAll)), cap);
  return { tax: Math.max(pat - deduction, 0), deduction };
}

export function calcOsn(revenue, expenses, osnRate, includeVat, vatRate = 0.22, expensesWithVat = 0) {
  const rev = Math.max(0, n(revenue));
  const exp = Math.max(0, n(expenses));
  const rate = Math.max(0, n(osnRate));

  let vatOutput = 0, vatInput = 0, vatPayable = 0, revExVat = rev;
  if (includeVat) {
    vatOutput = rev * vatRate / (1 + vatRate);
    vatInput = Math.max(0, n(expensesWithVat)) * vatRate / (1 + vatRate);
    vatPayable = Math.max(0, vatOutput - vatInput);
    revExVat = rev - vatOutput;
  }

  const expExVat = includeVat ? (exp - vatInput) : exp;
  const profitBase = Math.max(revExVat - expExVat, 0);
  const profitTax = profitBase * rate;

  return { tax: vatPayable + profitTax, profitTax, profitBase, vatOutput, vatInput, vatPayable, revExVat };
}
