export interface SummaryInsight {
  overview: string;
  keyChanges: string[];
  impactedAreas: string[];
}

export interface RiskInsight {
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  filePath?: string;
  line?: number;
}

export interface ReviewInsights {
  summary?: SummaryInsight;
  risks: RiskInsight[];
}
