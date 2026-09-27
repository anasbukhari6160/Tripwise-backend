CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) UNIQUE NOT NULL,

    password_hash VARCHAR(255),

    google_id VARCHAR(255) UNIQUE,

    auth_provider VARCHAR(20) NOT NULL DEFAULT 'local',

    plan VARCHAR(20) NOT NULL DEFAULT 'free',

    is_verified BOOLEAN NOT NULL DEFAULT FALSE,

    verification_code_hash VARCHAR(255),

    verification_expires_at TIMESTAMP,

    password_reset_code_hash VARCHAR(255),

    password_reset_expires_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS saved_destinations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, city, country)
);
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) NOT NULL DEFAULT 'inactive';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
ON users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_subscription_id
ON users(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL;