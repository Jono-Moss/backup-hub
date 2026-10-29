-- The app now talks to the database in UTC (db/index.ts sets each
-- connection's time_zone to +00:00). Before that, on a database server
-- running in local time, timestamps the app wrote itself were interpreted
-- in the server's timezone and stored shifted by its UTC offset. This moves
-- those stored values to the right moment.
--
-- It runs in the migration connection's default timezone (the server's),
-- which is the zone those values were wrongly interpreted in. On a server
-- already running in UTC — such as the bundled Docker MySQL — the
-- conversion is a no-op. Columns filled by DEFAULT NOW() were stored
-- correctly and only displayed wrong, so they're left alone.
UPDATE `backup_run` SET `finished_at` = CONVERT_TZ(`finished_at`, '+00:00', @@session.time_zone) WHERE `finished_at` IS NOT NULL;--> statement-breakpoint
UPDATE `backup_run` SET `verified_at` = CONVERT_TZ(`verified_at`, '+00:00', @@session.time_zone) WHERE `verified_at` IS NOT NULL;--> statement-breakpoint
UPDATE `backup_run_upload` SET `finished_at` = CONVERT_TZ(`finished_at`, '+00:00', @@session.time_zone) WHERE `finished_at` IS NOT NULL;--> statement-breakpoint
UPDATE `api_key` SET `last_used_at` = CONVERT_TZ(`last_used_at`, '+00:00', @@session.time_zone) WHERE `last_used_at` IS NOT NULL;--> statement-breakpoint
UPDATE `api_key` SET `revoked_at` = CONVERT_TZ(`revoked_at`, '+00:00', @@session.time_zone) WHERE `revoked_at` IS NOT NULL;--> statement-breakpoint
UPDATE `session` SET `expires_at` = CONVERT_TZ(`expires_at`, '+00:00', @@session.time_zone);--> statement-breakpoint
UPDATE `user_totp` SET `verified_at` = CONVERT_TZ(`verified_at`, '+00:00', @@session.time_zone) WHERE `verified_at` IS NOT NULL;--> statement-breakpoint
UPDATE `user_recovery_code` SET `used_at` = CONVERT_TZ(`used_at`, '+00:00', @@session.time_zone) WHERE `used_at` IS NOT NULL;--> statement-breakpoint
UPDATE `user_passkey` SET `last_used_at` = CONVERT_TZ(`last_used_at`, '+00:00', @@session.time_zone) WHERE `last_used_at` IS NOT NULL;
