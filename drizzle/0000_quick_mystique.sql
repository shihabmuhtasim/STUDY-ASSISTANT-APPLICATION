CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`request_type` text NOT NULL,
	`input_characters` integer NOT NULL,
	`output_characters` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_usage_user_created` ON `ai_usage_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
