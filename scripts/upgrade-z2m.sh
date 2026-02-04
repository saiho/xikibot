#!/bin/bash -e

# Upgrade Zigbee2MQTT to the latest version in the Orange Pi
ssh zhome@zhome.local sudo systemctl stop zigbee2mqtt
ssh zhome@zhome.local sudo mount -o remount,rw /app
ssh zhome@zhome.local /app/zigbee2mqtt/update.sh
ssh zhome@zhome.local sudo mount -o remount,ro /app
if [[ "$1" != "--no-start" ]]; then
	echo Starting zigbee2mqtt service
	ssh zhome@zhome.local sudo systemctl start zigbee2mqtt
fi
