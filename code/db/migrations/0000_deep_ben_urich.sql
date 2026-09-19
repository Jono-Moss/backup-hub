CREATE TABLE `api_key` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`hashed_key` varchar(64) NOT NULL,
	`key_prefix` varchar(16) NOT NULL,
	`scopes` json NOT NULL,
	`task_id` varchar(36),
	`last_used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	CONSTRAINT `api_key_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_user` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`hashed_password` varchar(255) NOT NULL,
	`role` enum('admin','user') NOT NULL DEFAULT 'user',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_user_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `backup_run` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`filename` varchar(255),
	`size_bytes` bigint,
	`encrypted` boolean NOT NULL DEFAULT false,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`error_message` varchar(2048),
	`triggered_by` enum('cron','manual','api') NOT NULL DEFAULT 'cron',
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	CONSTRAINT `backup_run_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backup_task` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`engine` enum('mysql','postgres') NOT NULL,
	`encrypted_connection` varchar(4096) NOT NULL,
	`cron_expression` varchar(64) NOT NULL DEFAULT '0 3 * * *',
	`retention_count` int NOT NULL DEFAULT 7,
	`encryption_enabled` boolean NOT NULL DEFAULT false,
	`encrypted_backup_password` varchar(512),
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backup_task_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`hashed_token` varchar(64) NOT NULL,
	`two_factor_verified` boolean NOT NULL DEFAULT true,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_notification_recipient` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`events` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_notification_recipient_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_notification_recipient` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`notify_on_success` boolean NOT NULL DEFAULT false,
	`notify_on_failure` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_notification_recipient_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_passkey` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'Passkey',
	`credential_id` varchar(255) NOT NULL,
	`public_key` text NOT NULL,
	`counter` bigint NOT NULL DEFAULT 0,
	`device_type` varchar(32),
	`backed_up` boolean NOT NULL DEFAULT false,
	`transports` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp,
	CONSTRAINT `user_passkey_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_passkey_credential_id_unique` UNIQUE(`credential_id`)
);
--> statement-breakpoint
CREATE TABLE `user_recovery_code` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_recovery_code_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_totp` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`encrypted_secret` varchar(512) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`verified_at` timestamp,
	CONSTRAINT `user_totp_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_totp_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE INDEX `backup_run_task_idx` ON `backup_run` (`task_id`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_notification_recipient_task_idx` ON `task_notification_recipient` (`task_id`);--> statement-breakpoint
CREATE INDEX `user_passkey_user_idx` ON `user_passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_recovery_code_user_idx` ON `user_recovery_code` (`user_id`);