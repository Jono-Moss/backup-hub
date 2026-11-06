CREATE TABLE `password_reset_token` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`requested_ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_token_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_token_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `login_attempt` MODIFY COLUMN `outcome` enum('success','bad_password','unknown_user','bad_2fa','passkey_failed','locked_out','unlocked','password_reset') NOT NULL;--> statement-breakpoint
CREATE INDEX `password_reset_token_user_idx` ON `password_reset_token` (`user_id`);