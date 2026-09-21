#!/bin/sh

# ---------------------------------------------------------------------------
# Fail fast if required variables are missing.
#
# This matters: the MariaDB client treats an *empty* password (-p or -p"")
# as "prompt me for it". With no TTY in the container, musl's getpass()
# returns NULL and the client dereferences it -> "Segmentation fault".
# ---------------------------------------------------------------------------
for var in BH_DATABASE_HOST BH_DATABASE_NAME BH_DATABASE_USER \
           BH_DATABASE_PASSWORD BH_DATABASE_ROOT_PASSWORD; do
    eval "value=\${$var}"
    if [ -z "$value" ]; then
        echo "ERROR: required environment variable $var is not set."
        echo "       Check that docker-compose.yml passes it to the container"
        echo "       and that it is defined in your .env file."
        exit 1
    fi
done

echo "Waiting for MySQL to be ready..."

MAX_RETRIES=30
RETRY_COUNT=0

# Long options (--host=..., --password=...) so an empty value can never
# swallow the next argument or trigger an interactive password prompt.
until mariadb-admin ping \
    --host="$BH_DATABASE_HOST" \
    --user=root \
    --password="$BH_DATABASE_ROOT_PASSWORD" \
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
    --host="$BH_DATABASE_HOST" \
    --user=root \
    --password="$BH_DATABASE_ROOT_PASSWORD" \
    --skip-ssl <<EOSQL
CREATE DATABASE IF NOT EXISTS \`$BH_DATABASE_NAME\`;

CREATE USER IF NOT EXISTS '$BH_DATABASE_USER'@'%'
  IDENTIFIED WITH caching_sha2_password BY '$BH_DATABASE_PASSWORD';

ALTER USER '$BH_DATABASE_USER'@'%'
  IDENTIFIED WITH caching_sha2_password BY '$BH_DATABASE_PASSWORD';

GRANT ALL PRIVILEGES ON \`$BH_DATABASE_NAME\`.* TO '$BH_DATABASE_USER'@'%';

FLUSH PRIVILEGES;
EOSQL

echo "Running database migrations..."

for migration in /app/db/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Applying $(basename "$migration")..."
        # drizzle separates statements with "--> statement-breakpoint" markers
        # (sometimes on their own line, sometimes trailing a statement).
        # That is NOT a valid SQL comment (MySQL needs "-- " with a space), so
        # strip it before piping the file into the client.
        sed 's/--> statement-breakpoint//' "$migration" | mariadb \
            --host="$BH_DATABASE_HOST" \
            --user="$BH_DATABASE_USER" \
            --password="$BH_DATABASE_PASSWORD" \
            --skip-ssl \
            --force \
            "$BH_DATABASE_NAME"
    fi
done

echo "Starting Next.js app..."
HOSTNAME=0.0.0.0 exec node server.js