-- Notification channels become reusable, same model as save locations
-- (0005): settings live in notification_channel, and task_notification_recipient
-- becomes the link (which channel + on success/failure). Every existing
-- recipient is migrated as a *task-only* channel for its task, owned and
-- created by the task's owner, reusing the recipient's id — behaviour is
-- unchanged until the owner makes one reusable.
CREATE TABLE `notification_channel` (
	`id` varchar(36) NOT NULL,
	`owner_id` varchar(36) NOT NULL,
	`task_id` varchar(36),
	`created_by` varchar(36) NOT NULL,
	`channel` enum('email','ntfy','telegram','discord') NOT NULL,
	`label` varchar(255) NOT NULL,
	`email` varchar(255),
	`encrypted_config` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_channel_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- Recipients whose task no longer exists can't notify anyone.
DELETE r FROM `task_notification_recipient` r LEFT JOIN `backup_task` t ON t.`id` = r.`task_id` WHERE t.`id` IS NULL;--> statement-breakpoint
INSERT INTO `notification_channel` (`id`, `owner_id`, `task_id`, `created_by`, `channel`, `label`, `email`, `encrypted_config`, `created_at`)
	SELECT r.`id`, t.`owner_id`, r.`task_id`, t.`owner_id`, r.`channel`,
		CASE r.`channel` WHEN 'email' THEN COALESCE(r.`email`, 'Email') WHEN 'ntfy' THEN 'ntfy' WHEN 'telegram' THEN 'Telegram' ELSE 'Discord' END,
		r.`email`, r.`encrypted_config`, r.`created_at`
	FROM `task_notification_recipient` r JOIN `backup_task` t ON t.`id` = r.`task_id`;--> statement-breakpoint
ALTER TABLE `task_notification_recipient` ADD `channel_id` varchar(36);--> statement-breakpoint
UPDATE `task_notification_recipient` SET `channel_id` = `id`;--> statement-breakpoint
ALTER TABLE `task_notification_recipient` MODIFY COLUMN `channel_id` varchar(36) NOT NULL;--> statement-breakpoint
CREATE INDEX `notification_channel_owner_idx` ON `notification_channel` (`owner_id`);--> statement-breakpoint
CREATE INDEX `notification_channel_task_idx` ON `notification_channel` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_notification_recipient_channel_idx` ON `task_notification_recipient` (`channel_id`);--> statement-breakpoint
ALTER TABLE `task_notification_recipient` DROP COLUMN `channel`;--> statement-breakpoint
ALTER TABLE `task_notification_recipient` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `task_notification_recipient` DROP COLUMN `encrypted_config`;
