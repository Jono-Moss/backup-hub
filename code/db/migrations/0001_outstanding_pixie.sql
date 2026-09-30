CREATE TABLE `backup_destination` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`type` enum('s3','google_drive','onedrive','email') NOT NULL,
	`label` varchar(255) NOT NULL,
	`encrypted_config` varchar(4096) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backup_destination_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backup_run_upload` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`destination_id` varchar(36) NOT NULL,
	`status` enum('uploading','completed','failed','skipped') NOT NULL DEFAULT 'uploading',
	`remote_path` varchar(1024),
	`error_message` varchar(2048),
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	CONSTRAINT `backup_run_upload_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `backup_destination_task_idx` ON `backup_destination` (`task_id`);--> statement-breakpoint
CREATE INDEX `backup_run_upload_run_idx` ON `backup_run_upload` (`run_id`);--> statement-breakpoint
CREATE INDEX `backup_run_upload_destination_idx` ON `backup_run_upload` (`destination_id`);