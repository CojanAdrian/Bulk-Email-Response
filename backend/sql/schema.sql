CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  load_number VARCHAR(50) NOT NULL UNIQUE,
  origin_city VARCHAR(100),
  origin_state VARCHAR(2),
  origin_zip VARCHAR(10),
  dest_city VARCHAR(100),
  dest_state VARCHAR(2),
  dest_zip VARCHAR(10),
  equipment VARCHAR(50),
  weight VARCHAR(50),
  target_pay DECIMAL(10,2),
  early_pu DATETIME NULL,
  late_pu DATETIME NULL,
  late_del DATETIME NULL,
  stops INT NULL,
  commodity VARCHAR(100),
  temperature VARCHAR(50),
  comment TEXT,
  status ENUM('active','booked','expired') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  gmail_address VARCHAR(255) NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_polled_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS email_inquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  email_account_id INT NOT NULL,
  gmail_message_id VARCHAR(255) NOT NULL,
  from_address VARCHAR(255),
  subject VARCHAR(500),
  body_snippet TEXT,
  received_at DATETIME,
  matched_load_id INT NULL,
  match_tier ENUM('load_number','city_state','city','state','none') NOT NULL DEFAULT 'none',
  status ENUM('matched','needs_review') NOT NULL DEFAULT 'needs_review',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_account_message (email_account_id, gmail_message_id),
  KEY idx_user_id (user_id)
);
