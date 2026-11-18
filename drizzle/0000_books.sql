CREATE TABLE `accounts` (
	`number` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`system` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`org_number` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`bank_account` text DEFAULT '' NOT NULL,
	`due_days` integer DEFAULT 14 NOT NULL,
	`vat_registered` integer DEFAULT true NOT NULL,
	`lock_date` text,
	`app_origin` text
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`org_number` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`is_customer` integer NOT NULL,
	`is_supplier` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_name` ON `contacts` (`name`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`voucher_id` text NOT NULL,
	`account_number` text NOT NULL,
	`debit_ore` integer DEFAULT 0 NOT NULL,
	`credit_ore` integer DEFAULT 0 NOT NULL,
	`vat_code` text,
	`description` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_voucher` ON `entries` (`voucher_id`);--> statement-breakpoint
CREATE INDEX `entries_account` ON `entries` (`account_number`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`position` integer NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit_price_ore` integer NOT NULL,
	`vat_code` text NOT NULL,
	`account_number` text NOT NULL,
	`net_ore` integer NOT NULL,
	`vat_ore` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoice_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`kind` text NOT NULL,
	`recipient` text NOT NULL,
	`sent` integer NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoice_messages_invoice` ON `invoice_messages` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'invoice' NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`number` integer,
	`customer_id` text NOT NULL,
	`created_by` text NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`net_ore` integer DEFAULT 0 NOT NULL,
	`vat_ore` integer DEFAULT 0 NOT NULL,
	`gross_ore` integer DEFAULT 0 NOT NULL,
	`paid_ore` integer DEFAULT 0 NOT NULL,
	`public_token` text,
	`related_id` text,
	`template_id` text,
	`template_date` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "invoices_not_overpaid" CHECK(paid_ore <= gross_ore)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number` ON `invoices` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_token` ON `invoices` (`public_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_template_run` ON `invoices` (`template_id`,`template_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_one_credit` ON `invoices` (`related_id`) WHERE kind = 'credit_note';--> statement-breakpoint
CREATE INDEX `invoices_customer` ON `invoices` (`customer_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_ore` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_invoice` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`account_number` text NOT NULL,
	`vat_code` text NOT NULL,
	`gross_ore` integer NOT NULL,
	`net_ore` integer NOT NULL,
	`vat_ore` integer NOT NULL,
	`due_date` text NOT NULL,
	`paid_date` text,
	`receipt_key` text,
	`receipt_name` text,
	`receipt_type` text,
	`deleted` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchases_supplier` ON `purchases` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `recurring_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`created_by` text NOT NULL,
	`interval` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`next_date` text NOT NULL,
	`auto_email` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`lines` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vouchers` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vouchers_number` ON `vouchers` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `vouchers_source` ON `vouchers` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `vouchers_date` ON `vouchers` (`date`);