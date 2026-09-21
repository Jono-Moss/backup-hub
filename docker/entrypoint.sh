#!/bin/sh

echo "Waiting for MySQL to be ready..."

MAX_RETRIES=30
RETRY_COUNT=0

until mariadb-admin \
    ping \
    -h"db" \
    -u"root" \
    -p"$BH_DATABASE_ROOT_PASSWORD" \
    --skip-ssl \
    --silent
do
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "Still waiting for MySQL... ($RETRY_COUNT/$MAX_RETRIES)"

    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        echo "MySQL not ready after $MAX_RETRIES attempts. Exiting."
        exit 1
    fi
done

echo "MySQL is ready."
echo "Ensuring database and user exist..."

mariadb \
    -h"db" \
    -u"root" \
    -p"$BH_DATABASE_ROOT_PASSWORD" \
    --skip-ssl <<EOF
CREATE DATABASE IF NOT EXISTS \`$BH_DATABASE_NAME\`;

CREATE USER IF NOT EXISTS '$BH_DATABASE_USER'@'%'
  IDENTIFIED WITH caching_sha2_password BY '$BH_DATABASE_PASSWORD';

ALTER USER '$BH_DATABASE_USER'@'%'
  IDENTIFIED WITH caching_sha2_password BY '$BH_DATABASE_PASSWORD';

GRANT ALL PRIVILEGES ON \`$BH_DATABASE_NAME\`.* TO '$BH_DATABASE_USER'@'%';

FLUSH PRIVILEGES;
EOF

echo "Running database migrations..."

for migration in /app/db/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Applying $(basename "$migration")..."
        mariadb \
            -h"db" \
            -u"$BH_DATABASE_USER" \
            -p"$BH_DATABASE_PASSWORD" \
            "$BH_DATABASE_NAME" \
            --skip-ssl \
            --force < "$migration"
    fi
done

echo "Starting Next.js app..."
HOSTNAME=0.0.0.0 node server.js