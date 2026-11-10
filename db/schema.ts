import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  reviewerName: text("reviewer_name").notNull().default(""),
  reviewerEmail: text("reviewer_email").notNull().default(""),
  reviewerRole: text("reviewer_role").notNull().default(""),
  visitFrequency: text("visit_frequency").notNull().default(""),
  overall: integer("overall").notNull(),
  readability: integer("readability").notNull(),
  navigation: integer("navigation").notNull(),
  welcome: integer("welcome").notNull(),
  languageDefault: text("language_default").notNull(),
  topPriority: text("top_priority").notNull(),
  anythingElse: text("anything_else").notNull().default(""),
  annotationCount: integer("annotation_count").notNull().default(0),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_reviews_created_at").on(table.createdAt)]);

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  sectionId: text("section_id").notNull(),
  sectionLabel: text("section_label").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width").notNull().default(0),
  height: real("height").notNull().default(0),
  category: text("category").notNull(),
  tone: text("tone").notNull(),
  comment: text("comment").notNull(),
  suggestion: text("suggestion").notNull().default(""),
  viewport: text("viewport").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_annotations_review_id").on(table.reviewId)]);
