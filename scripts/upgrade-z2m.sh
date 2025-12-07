#!/bin/bash -e

# This script pushes the local build of Zigbee2MQTT to the Raspberry.
# Before you should update Zigbee2MQTT locally to the latest version running ../../zigbee2mqtt/update.sh

zigbee2mqtt_dir=$(dirname "$0")/../../zigbee2mqtt/

ssh zhome@zhome.local sudo systemctl stop zigbee2mqtt
ssh zhome@zhome.local sudo mount -o remount,rw /app

rsync -rlptzh --progress --delete $zigbee2mqtt_dir --exclude=/node_modules --exclude=/.git --exclude=/.github --exclude=/data --exclude=/docker --exclude=/test --exclude=/.dockerignore --exclude=/.gitignore --exclude=update.sh zhome@zhome.local:/app/zigbee2mqtt

ssh zhome@zhome.local 'cd /app/zigbee2mqtt/ && pnpm i --frozen-lockfile --prod'

ssh zhome@zhome.local sudo mount -o remount,ro /app
if [[ "$1" != "--no-start" ]]; then
	echo Starting zigbee2mqtt service
	ssh zhome@zhome.local sudo systemctl start zigbee2mqtt
fi
