-- Save locations become reusable: credentials live in backup_destination,
-- and tasks use them through task_destination links. Every existing
-- destination is migrated as *task-only* for the task it was on, owned (and
-- created) by that task's owner, so nothing becomes reusable without the
-- owner choosing to — behaviour is exactly the same as before.
CREATE TABLE `task_destination` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`destination_id` varchar(36) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`subfolder` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_destination_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_destination_task_destination_idx` UNIQUE(`task_id`,`destination_id`)
);
--> statement-breakpoint
ALTER TABLE `backup_destination` MODIFY COLUMN `task_id` varchar(36);--> statement-breakpoint
ALTER TABLE `backup_destination` ADD `owner_id` varchar(36);--> statement-breakpoint
ALTER TABLE `backup_destination` ADD `created_by` varchar(36);--> statement-breakpoint
UPDATE `backup_destination` d JOIN `backup_task` t ON t.`id` = d.`task_id` SET d.`owner_id` = t.`owner_id`, d.`created_by` = t.`owner_id`;--> statement-breakpoint
-- Destinations whose task no longer exists can't be used by anything.
DELETE FROM `backup_destination` WHERE `owner_id` IS NULL;--> statement-breakpoint
INSERT INTO `task_destination` (`id`, `task_id`, `destination_id`, `enabled`, `created_at`)
	SELECT UUID(), `task_id`, `id`, `enabled`, `created_at` FROM `backup_destination`;--> statement-breakpoint
ALTER TABLE `backup_destination` MODIFY COLUMN `owner_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_destination` MODIFY COLUMN `created_by` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `backup_run_upload` ADD `destination_label` varchar(255);--> statement-breakpoint
UPDATE `backup_run_upload` u JOIN `backup_destination` d ON d.`id` = u.`destination_id` SET u.`destination_label` = d.`label`;--> statement-breakpoint
CREATE INDEX `task_destination_destination_idx` ON `task_destination` (`destination_id`);--> statement-breakpoint
CREATE INDEX `backup_destination_owner_idx` ON `backup_destination` (`owner_id`);--> statement-breakpoint
ALTER TABLE `backup_destination` DROP COLUMN `enabled`;
