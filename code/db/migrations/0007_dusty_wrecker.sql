ALTER TABLE `backup_run` ADD `sha256` varchar(64);--> statement-breakpoint
ALTER TABLE `backup_run` ADD `key_check` varchar(32);--> statement-breakpoint
ALTER TABLE `backup_run` ADD `verify_status` enum('queued','running','passed','failed');--> statement-breakpoint
ALTER TABLE `backup_run` ADD `verify_level` enum('check','restore');--> statement-breakpoint
ALTER TABLE `backup_run` ADD `verify_message` varchar(2048);--> statement-breakpoint
ALTER TABLE `backup_run` ADD `verified_at` timestamp;--> statement-breakpoint
ALTER TABLE `backup_task` ADD `test_restore_after_backup` boolean DEFAULT false NOT NULL;