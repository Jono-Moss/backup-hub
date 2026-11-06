ALTER TABLE `login_attempt` MODIFY COLUMN `outcome` enum('success','bad_password','unknown_user','bad_2fa','passkey_failed','locked_out','unlocked') NOT NULL;--> statement-breakpoint
CREATE INDEX `login_attempt_email_created_idx` ON `login_attempt` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `login_attempt_ip_created_idx` ON `login_attempt` (`ip_address`,`created_at`);