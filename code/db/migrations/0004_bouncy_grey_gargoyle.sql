ALTER TABLE `system_notification_recipient` MODIFY COLUMN `email` varchar(255);--> statement-breakpoint
ALTER TABLE `task_notification_recipient` MODIFY COLUMN `email` varchar(255);--> statement-breakpoint
ALTER TABLE `system_notification_recipient` ADD `channel` enum('email','ntfy','telegram','discord') DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_notification_recipient` ADD `encrypted_config` text;--> statement-breakpoint
ALTER TABLE `task_notification_recipient` ADD `channel` enum('email','ntfy','telegram','discord') DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE `task_notification_recipient` ADD `encrypted_config` text;