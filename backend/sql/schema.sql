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
