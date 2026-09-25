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