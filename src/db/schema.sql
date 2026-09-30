CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,

  name VARCHAR(100) NOT NULL,

  email VARCHAR(255) UNIQUE NOT NULL,

  password_hash VARCHAR(255),

  google_id VARCHAR(255) UNIQUE,

  auth_provider VARCHAR(20)
    NOT NULL
    DEFAULT 'local',

  plan VARCHAR(20)
    NOT NULL
    DEFAULT 'free',

  is_verified BOOLEAN
    NOT NULL
    DEFAULT FALSE,

  verification_code_hash VARCHAR(255),

  verification_expires_at TIMESTAMP,

  password_reset_code_hash VARCHAR(255),

  password_reset_expires_at TIMESTAMP,

  created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS saved_destinations (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  city VARCHAR(100) NOT NULL,

  country VARCHAR(100) NOT NULL,

  latitude DECIMAL(10, 7),

  longitude DECIMAL(10, 7),

  created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, city, country)
);


ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan VARCHAR(20)
NOT NULL DEFAULT 'free';


ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);


ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);


ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50)
NOT NULL DEFAULT 'inactive';


ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;


ALTER TABLE users
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN
NOT NULL DEFAULT FALSE;


CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
ON users(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;


CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_subscription_id
ON users(stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  title VARCHAR(120) NOT NULL,

  start_date DATE NOT NULL,

  end_date DATE NOT NULL,

  notes TEXT,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT trips_valid_dates
    CHECK (
      end_date >= start_date
    )
);


CREATE INDEX IF NOT EXISTS idx_trips_user_id
ON trips(user_id);


CREATE INDEX IF NOT EXISTS idx_trips_user_dates
ON trips(
  user_id,
  start_date,
  end_date
);


CREATE TABLE IF NOT EXISTS trip_stops (
  id SERIAL PRIMARY KEY,

  trip_id INTEGER NOT NULL
    REFERENCES trips(id)
    ON DELETE CASCADE,

  location_name VARCHAR(255) NOT NULL,

  city VARCHAR(120) NOT NULL,

  country VARCHAR(120) NOT NULL,

  country_code VARCHAR(2),

  latitude NUMERIC(9, 6) NOT NULL,

  longitude NUMERIC(9, 6) NOT NULL,

  timezone VARCHAR(100),

  arrival_date DATE,

  departure_date DATE,

  position INTEGER NOT NULL,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT trip_stops_valid_position
    CHECK (
      position >= 0
    ),

  CONSTRAINT trip_stops_valid_latitude
    CHECK (
      latitude >= -90
      AND latitude <= 90
    ),

  CONSTRAINT trip_stops_valid_longitude
    CHECK (
      longitude >= -180
      AND longitude <= 180
    ),

  CONSTRAINT trip_stops_valid_dates
    CHECK (
      departure_date IS NULL
      OR arrival_date IS NULL
      OR departure_date >= arrival_date
    ),

  CONSTRAINT trip_stops_unique_position
    UNIQUE (
      trip_id,
      position
    )
);


CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_id
ON trip_stops(trip_id);


CREATE INDEX IF NOT EXISTS idx_trip_stops_coordinates
ON trip_stops(
  latitude,
  longitude
);


CREATE INDEX IF NOT EXISTS idx_trip_stops_trip_position
ON trip_stops(
  trip_id,
  position
);