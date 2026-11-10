import { getD1 } from "../../db";
import type { BreakdownItem, InsightAnnotation, InsightReview, InsightsData } from "./types";

type SummaryRow = {
  total_reviews: number | string | null;
  total_notes: number | string | null;
  avg_overall: number | string | null;
  avg_readability: number | string | null;
  avg_navigation: number | string | null;
  avg_welcome: number | string | null;
};

type BreakdownRow = {
  key: string | null;
  label?: string | null;
  item_count: number | string | null;
};

type FlatReviewRow = {
  review_id: string;
  review_created_at: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewer_role: string;
  visit_frequency: string;
  overall: number;
  readability: number;
  navigation: number;
  welcome: number;
  language_default: string;
  top_priority: string;
  anything_else: string;
  annotation_id: string | null;
  kind: "pin" | "highlight" | null;
  section_id: string | null;
  section_label: string | null;
  category: string | null;
  tone: string | null;
  comment: string | null;
  suggestion: string | null;
  viewport: string | null;
  x: number | string | null;
  y: number | string | null;
  width: number | string | null;
  height: number | string | null;
};

const categoryLabels: Record<string, string> = {
  copy: "Copy or details",
  readability: "Text size",
  language: "Language",
  image: "Photo or video",
  navigation: "Navigation",
  mobile: "Mobile or desktop",
  other: "Other",
};

const sectionLabels: Record<string, string> = {
  announcement: "Sunday announcement",
  navigation: "Header and navigation",
  hero: "Welcome hero",
  purpose: "Find your place",
  marquee: "Faith message",
  "first-visit": "First visit",
  experience: "Sunday experience",
  ministries: "Ministries",
  "church-life": "Church life gallery",
  leadership: "Program team",
  visit: "Visit and contact details",
  footer: "Footer",
};

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function averageValue(value: number | string | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function mapBreakdown(rows: BreakdownRow[], labels?: Record<string, string>): BreakdownItem[] {
  return rows.map((row) => {
    const key = row.key ?? "unknown";
    return {
      key,
      label: row.label ?? labels?.[key] ?? key,
      count: numberValue(row.item_count),
    };
  });
}

export async function loadInsights(): Promise<InsightsData> {
  const db = getD1();

  const [summary, categoryResult, sectionResult, surfaceResult, allReviewsResult] = await Promise.all([
    db.prepare(`SELECT
      COUNT(*) AS total_reviews,
      COALESCE(SUM(annotation_count), 0) AS total_notes,
      ROUND(AVG(overall), 2) AS avg_overall,
      ROUND(AVG(readability), 2) AS avg_readability,
      ROUND(AVG(navigation), 2) AS avg_navigation,
      ROUND(AVG(welcome), 2) AS avg_welcome
    FROM reviews`).first<SummaryRow>(),
    db.prepare(`SELECT category AS key, COUNT(*) AS item_count
      FROM annotations
      GROUP BY category
      ORDER BY item_count DESC, category`).all<BreakdownRow>(),
    db.prepare(`SELECT section_id AS key, COUNT(*) AS item_count
      FROM annotations
      GROUP BY section_id
      ORDER BY item_count DESC, section_id`).all<BreakdownRow>(),
    db.prepare(`SELECT
        CASE WHEN viewport LIKE 'desktop:%' THEN 'desktop' ELSE 'mobile' END AS key,
        COUNT(*) AS item_count
      FROM annotations
      GROUP BY key
      ORDER BY item_count DESC`).all<BreakdownRow>(),
    db.prepare(`SELECT
        r.id AS review_id,
        r.created_at AS review_created_at,
        r.reviewer_name,
        r.reviewer_email,
        r.reviewer_role,
        r.visit_frequency,
        r.overall,
        r.readability,
        r.navigation,
        r.welcome,
        r.language_default,
        r.top_priority,
        r.anything_else,
        a.id AS annotation_id,
        a.kind,
        a.section_id,
        a.section_label,
        a.category,
        a.tone,
        a.comment,
        a.suggestion,
        a.viewport,
        a.x,
        a.y,
        a.width,
        a.height
      FROM reviews r
      LEFT JOIN annotations a ON a.review_id = r.id
      ORDER BY r.created_at DESC, r.rowid DESC, a.rowid`).all<FlatReviewRow>(),
  ]);

  const reviewMap = new Map<string, InsightReview>();
  for (const row of allReviewsResult.results) {
    let review = reviewMap.get(row.review_id);
    if (!review) {
      review = {
        id: row.review_id,
        createdAt: row.review_created_at,
        reviewer: {
          name: row.reviewer_name ?? "",
          email: row.reviewer_email ?? "",
          role: row.reviewer_role ?? "",
          visitFrequency: row.visit_frequency ?? "",
        },
        scores: {
          overall: numberValue(row.overall),
          readability: numberValue(row.readability),
          navigation: numberValue(row.navigation),
          welcome: numberValue(row.welcome),
        },
        languageDefault: row.language_default ?? "",
        topPriority: row.top_priority ?? "",
        anythingElse: row.anything_else ?? "",
        annotations: [],
      };
      reviewMap.set(row.review_id, review);
    }

    if (row.annotation_id && row.kind) {
      const viewport = row.viewport ?? "";
      const annotation: InsightAnnotation = {
        id: row.annotation_id,
        kind: row.kind,
        sectionId: row.section_id ?? "",
        sectionLabel: row.section_label ?? "Website",
        category: row.category ?? "other",
        tone: row.tone ?? "concern",
        comment: row.comment ?? "",
        suggestion: row.suggestion ?? "",
        viewport,
        x: numberValue(row.x),
        y: numberValue(row.y),
        width: numberValue(row.width),
        height: numberValue(row.height),
        surface: viewport.startsWith("desktop:") ? "desktop" : "mobile",
      };
      review.annotations.push(annotation);
    }
  }

  const safeSummary = summary ?? {
    total_reviews: 0,
    total_notes: 0,
    avg_overall: null,
    avg_readability: null,
    avg_navigation: null,
    avg_welcome: null,
  };

  const websiteReviews = Array.from(reviewMap.values());

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalReviews: numberValue(safeSummary.total_reviews),
      totalNotes: numberValue(safeSummary.total_notes),
      averages: {
        overall: averageValue(safeSummary.avg_overall),
        readability: averageValue(safeSummary.avg_readability),
        navigation: averageValue(safeSummary.avg_navigation),
        welcome: averageValue(safeSummary.avg_welcome),
      },
    },
    breakdowns: {
      categories: mapBreakdown(categoryResult.results, categoryLabels),
      sections: mapBreakdown(sectionResult.results, sectionLabels),
      surfaces: mapBreakdown(surfaceResult.results, { mobile: "Mobile", desktop: "Desktop" }),
    },
    reviews: websiteReviews.slice(0, 100),
    websiteReviews,
  };
}
