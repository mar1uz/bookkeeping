INSERT INTO `company` (`id`) VALUES (1);
--> statement-breakpoint
INSERT INTO `counters` (`name`, `value`) VALUES ('invoice', 0), ('voucher', 0);
--> statement-breakpoint
INSERT INTO `accounts` (`number`, `name`, `type`, `system`) VALUES
('1200', 'Machinery and equipment', 'asset', 0),
('1500', 'Accounts receivable', 'asset', 1),
('1920', 'Bank account', 'asset', 1),
('2000', 'Share capital', 'equity', 0),
('2050', 'Other equity', 'equity', 0),
('2400', 'Accounts payable', 'liability', 1),
('2700', 'Output VAT 25%', 'liability', 1),
('2701', 'Output VAT 15%', 'liability', 1),
('2702', 'Output VAT 12%', 'liability', 1),
('2710', 'Input VAT 25%', 'liability', 1),
('2711', 'Input VAT 15%', 'liability', 1),
('2712', 'Input VAT 12%', 'liability', 1),
('2740', 'VAT settlement', 'liability', 0),
('3000', 'Sales, VAT liable', 'income', 0),
('3100', 'Sales, zero-rated', 'income', 0),
('3200', 'Sales, VAT exempt', 'income', 0),
('4000', 'Purchase of goods', 'expense', 0),
('5000', 'Salaries', 'expense', 0),
('6300', 'Rent', 'expense', 0),
('6540', 'Equipment and tools', 'expense', 0),
('6800', 'Office supplies', 'expense', 0),
('6900', 'Phone and internet', 'expense', 0),
('7100', 'Vehicle costs', 'expense', 0),
('7140', 'Travel', 'expense', 0),
('7320', 'Marketing', 'expense', 0),
('7770', 'Bank and card fees', 'expense', 0),
('7790', 'Other operating costs', 'expense', 0);
