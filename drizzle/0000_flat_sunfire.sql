CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`kind` text NOT NULL,
	`section_id` text NOT NULL,
	`section_label` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real DEFAULT 0 NOT NULL,
	`height` real DEFAULT 0 NOT NULL,
	`category` text NOT NULL,
	`tone` text NOT NULL,
	`comment` text NOT NULL,
	`suggestion` text DEFAULT '' NOT NULL,
	`viewport` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_review_id` ON `annotations` (`review_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`reviewer_name` text DEFAULT '' NOT NULL,
	`reviewer_email` text DEFAULT '' NOT NULL,
	`reviewer_role` text DEFAULT '' NOT NULL,
	`visit_frequency` text DEFAULT '' NOT NULL,
	`overall` integer NOT NULL,
	`readability` integer NOT NULL,
	`navigation` integer NOT NULL,
	`welcome` integer NOT NULL,
	`language_default` text NOT NULL,
	`top_priority` text NOT NULL,
	`anything_else` text DEFAULT '' NOT NULL,
	`annotation_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reviews_created_at` ON `reviews` (`created_at`);
--> statement-breakpoint
PRAGMA optimize;
