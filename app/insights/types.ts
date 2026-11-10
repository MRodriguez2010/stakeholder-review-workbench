export type ScoreKey = "overall" | "readability" | "navigation" | "welcome";

export type InsightAnnotation = {
  id: string;
  kind: "pin" | "highlight";
  sectionId: string;
  sectionLabel: string;
  category: string;
  tone: string;
  comment: string;
  suggestion: string;
  viewport: string;
  x: number;
  y: number;
  width: number;
  height: number;
  surface: "mobile" | "desktop";
};

export type InsightReview = {
  id: string;
  createdAt: string;
  reviewer: {
    name: string;
    email: string;
    role: string;
    visitFrequency: string;
  };
  scores: Record<ScoreKey, number>;
  languageDefault: string;
  topPriority: string;
  anythingElse: string;
  annotations: InsightAnnotation[];
};

export type BreakdownItem = {
  key: string;
  label: string;
  count: number;
};

export type InsightsData = {
  generatedAt: string;
  summary: {
    totalReviews: number;
    totalNotes: number;
    averages: Record<ScoreKey, number | null>;
  };
  breakdowns: {
    categories: BreakdownItem[];
    sections: BreakdownItem[];
    surfaces: BreakdownItem[];
  };
  reviews: InsightReview[];
  websiteReviews: InsightReview[];
};
