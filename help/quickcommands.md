# Quick commands

## Host

- `ssh zhome@zhome.local`

## Orange Pi

- `sudo mount -o remount,rw /app`
- `sudo mount -o remount,ro /app`
- `sudo systemctl start zigbee2mqtt`
- `sudo systemctl stop zigbee2mqtt`
- `systemctl status zigbee2mqtt -n100`
- `journalctl -u zigbee2mqtt` # all logs of the service
- `sudo du -hs /media/root-rw/overlay/*`
