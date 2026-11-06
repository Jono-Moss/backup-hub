CREATE TABLE `login_attempt` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`email` varchar(255),
	`method` enum('password','totp','recovery_code','passkey') NOT NULL,
	`outcome` enum('success','bad_password','unknown_user','bad_2fa','passkey_failed') NOT NULL,
	`ip_address` varchar(64),
	`user_agent` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_attempt_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `login_attempt_user_created_idx` ON `login_attempt` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempt_created_idx` ON `login_attempt` (`created_at`);