import type { InsightAnnotation, InsightReview } from "./types";

const categoryLabels: Record<string, string> = {
  copy: "Copy or details",
  readability: "Text size",
  language: "Language",
  image: "Photo or video",
  navigation: "Navigation",
  mobile: "Mobile or desktop",
  other: "Other",
};

const toneLabels: Record<string, string> = {
  correction: "Correction",
  concern: "Concern",
  idea: "Idea",
  positive: "Works well",
};

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function makeCsv(reviews: InsightReview[]) {
  const headers = [
    "review_id", "submitted_at", "overall", "reading_comfort", "visit_information",
    "welcoming_and_trust", "final_comment", "note_count", "note_number", "surface",
    "section", "category", "tone", "comment", "suggestion", "viewport",
    "x", "y", "width", "height",
  ];
  const rows = reviews.flatMap((review) => {
    const notes: Array<InsightAnnotation | null> = review.annotations.length ? review.annotations : [null];
    return notes.map((note, index) => [
      review.id,
      review.createdAt,
      review.scores.overall,
      review.scores.readability,
      review.scores.navigation,
      review.scores.welcome,
      review.anythingElse,
      review.annotations.length,
      note ? index + 1 : "",
      note?.surface ?? "",
      note?.sectionLabel ?? "",
      note ? categoryLabels[note.category] ?? note.category : "",
      note ? toneLabels[note.tone] ?? note.tone : "",
      note?.comment ?? "",
      note?.suggestion ?? "",
      note?.viewport ?? "",
      note?.x ?? "",
      note?.y ?? "",
      note?.width ?? "",
      note?.height ?? "",
    ]);
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
