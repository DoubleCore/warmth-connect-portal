CREATE TABLE `user_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
