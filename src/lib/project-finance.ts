export type ProjectFinance = {
  budgetEur: number;
  budgetSource: "project" | "proposals" | "none";
  proposalApprovedEur: number;
  costRateEur: number;
  estimatedMinutes: number;
  spentMinutes: number;
  estimatedCostEur: number;
  spentCostEur: number;
  profitEur: number;
  marginPct: number | null;
  willExceedBudget: boolean;
  hoursOverEstimate: boolean;
};

export function computeProjectFinance(input: {
  budgetEur: number | null;
  costRateEur: number | null;
  proposalApprovedEur: number;
  estimatedMinutes: number;
  spentMinutes: number;
}): ProjectFinance {
  const proposalApprovedEur =
    Math.round(input.proposalApprovedEur * 100) / 100;
  const budgetSource: ProjectFinance["budgetSource"] =
    input.budgetEur != null && input.budgetEur > 0
      ? "project"
      : proposalApprovedEur > 0
        ? "proposals"
        : "none";
  const budgetEur =
    budgetSource === "project"
      ? Number(input.budgetEur)
      : proposalApprovedEur;
  const costRateEur = input.costRateEur != null ? Number(input.costRateEur) : 0;
  const estimatedMinutes = input.estimatedMinutes;
  const spentMinutes = input.spentMinutes;
  const estimatedCostEur =
    Math.round((estimatedMinutes / 60) * costRateEur * 100) / 100;
  const spentCostEur =
    Math.round((spentMinutes / 60) * costRateEur * 100) / 100;
  const profitEur = Math.round((budgetEur - spentCostEur) * 100) / 100;
  const marginPct =
    budgetEur > 0
      ? Math.round((profitEur / budgetEur) * 1000) / 10
      : null;
  const willExceedBudget =
    budgetEur > 0 &&
    (spentCostEur > budgetEur ||
      (estimatedCostEur > budgetEur && spentCostEur >= estimatedCostEur * 0.5));
  const hoursOverEstimate =
    estimatedMinutes > 0 && spentMinutes > estimatedMinutes;

  return {
    budgetEur,
    budgetSource,
    proposalApprovedEur,
    costRateEur,
    estimatedMinutes,
    spentMinutes,
    estimatedCostEur,
    spentCostEur,
    profitEur,
    marginPct,
    willExceedBudget,
    hoursOverEstimate,
  };
}
