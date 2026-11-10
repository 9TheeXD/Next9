#!/bin/bash
# Script to migrate data from breatheeasy-db to nextbreath-db

echo "1. Dumping data from old database (breatheeasy-db)..."
sudo docker exec breatheeasy-db pg_dump -U breatheeasy breatheeasy -F c -f /tmp/breatheeasy.dump
sudo docker cp breatheeasy-db:/tmp/breatheeasy.dump ./breatheeasy.dump

echo "2. Starting new database (nextbreath-db)..."
cd /home/cmp/sdh-council/cigarette/admin-web
sudo docker-compose up -d

echo "Waiting for new database to initialize..."
sleep 10

echo "3. Restoring data to new database (nextbreath-db)..."
sudo docker cp ../breatheeasy.dump nextbreath-db:/tmp/breatheeasy.dump
sudo docker exec nextbreath-db pg_restore -U nextbreath -d nextbreath -1 /tmp/breatheeasy.dump

echo "4. Stopping and removing old database (breatheeasy-db)..."
sudo docker stop breatheeasy-db
sudo docker rm breatheeasy-db

echo "Migration completed successfully!"
