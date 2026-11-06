ALTER TABLE `session` ADD `created_ip` varchar(64);--> statement-breakpoint
ALTER TABLE `session` ADD `user_agent` varchar(512);--> statement-breakpoint
ALTER TABLE `session` ADD `last_seen_at` timestamp;--> statement-breakpoint
ALTER TABLE `session` ADD `last_seen_ip` varchar(64);