#!/bin/bash -e

[ "$DEBUG" == 'true' ] && set -x

nostate=0
online=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-state)
      nostate=1
      shift
      ;;
    --online)
      online=1
      shift
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

if [ ! -d "/media/root-ro/home/zhome/zigbee2mqtt-rw/data/" ]; then
  echo "OverlayFS is not active. Nothing to do."
  exit 0
fi

rsync_opts="-rlptu --delete --modify-window=1 /home/zhome/zigbee2mqtt-rw/data/ /media/root-ro/home/zhome/zigbee2mqtt-rw/data/"
rsync_check_exclusions="--exclude=log/ --exclude=configuration.example.yaml"
if [ $nostate == 1 ]; then
    rsync_check_exclusions="$rsync_check_exclusions --exclude=state.json"
fi
changes=$(rsync --dry-run --itemize-changes $rsync_opts $rsync_check_exclusions | egrep -v "^\.")
if [ -n "$changes" ]; then
    if [ $online == 0 ] || systemctl is-active --quiet zigbee2mqtt; then
        sudo mount -o remount,rw /media/root-ro
        rsync $rsync_opts
        sudo mount -o remount,ro /media/root-ro
    fi
fi
