**Index**

- [Setting up the Orange Pi Zero 2W for the first time](#setting-up-the-orange-pi-zero-2w-for-the-first-time)
  - [Configure Wi-Fi](#configure-wi-fi)
  - [First boot](#first-boot)
  - [First upgrade and install the necessary system packages](#first-upgrade-and-install-the-necessary-system-packages)
  - [Extra configuration](#extra-configuration)
  - [Configure USB to connect ethernet adapter](#configure-usb-to-connect-ethernet-adapter)
  - [Install Node.js](#install-nodejs)
  - [Security](#security)
  - [Partitions and OverlayFS](#partitions-and-overlayfs)
    - [Add the app partition](#add-the-app-partition)
    - [Mount the new partition](#mount-the-new-partition)
    - [Set environment variables](#set-environment-variables)
  - [Install `pnpm`](#install-pnpm)
  - [Install extra files and dependencies](#install-extra-files-and-dependencies)
  - [Install Zigbee2MQTT](#install-zigbee2mqtt)
    - [Prepare directories](#prepare-directories)
    - [Build Zigbee2MQTT](#build-zigbee2mqtt)
    - [Restore old configuration](#restore-old-configuration)
    - [Create a system service](#create-a-system-service)
  - [Scheduled tasks](#scheduled-tasks)
    - [Schedule Zigbee2MQTT configuration backups](#schedule-zigbee2mqtt-configuration-backups)
    - [Automatic clean-up](#automatic-clean-up)
  - [Enable OverlayFS](#enable-overlayfs)
    - [How to disable OverlayFS](#how-to-disable-overlayfs)
  - [Cleaning](#cleaning)
- [Upgrading](#upgrading)
  - [Upgrade system packages and `pnpm`](#upgrade-system-packages-and-pnpm)
  - [Upgrade the Zigbee2MQTT](#upgrade-the-zigbee2mqtt)
  - [Upgrade the better-sqlite3](#upgrade-the-better-sqlite3)

# Setting up the Orange Pi Zero 2W for the first time

Use [Armbian Minimal/IOT image](https://www.armbian.com/orange-pi-zero-2w/) based on Debian 14 (Forky). Note that Debian 12 (Bookworm) was not working for me. The easiest way to flash the image in a SD card is using [`armbian-imager`](https://imager.armbian.com/).

Useful documentation:

- [Armbian Getting Started Guide](https://docs.armbian.com/User-Guide_Getting-Started/)
- [Automatic first boot configuration](https://docs.armbian.com/User-Guide_Autoconfig/)

## Configure Wi-Fi

This part can be skipped if using a USB ethernet adapter rather than the Wi-Fi.

Before placing the SD card in the Orange Pi, mount it in the main PC and create the file `/root/.not_logged_in_yet`. Place the following content with the appropiate values:

```ini
## WiFi
PRESET_NET_CHANGE_DEFAULTS="1"
PRESET_NET_WIFI_ENABLED="1"
PRESET_NET_WIFI_SSID="YOUR_WIFI_NETWORK"
PRESET_NET_WIFI_KEY="**********"
PRESET_NET_WIFI_COUNTRYCODE="BE"
PRESET_CONNECT_WIRELESS="n" # n means to actually use the Wi-Fi

# System
SET_LANG_BASED_ON_LOCATION="n"
PRESET_LOCALE="en_IE.UTF-8"
PRESET_TIMEZONE="Europe/Brussels"
PRESET_ROOT_PASSWORD="**********" # we will deactivate the root login afterwards

# User
PRESET_USER_NAME="zhome"
PRESET_USER_PASSWORD="**********"
PRESET_DEFAULT_REALNAME="zhome"
PRESET_USER_SHELL="bash"
```

## First boot

Boot the Orange Pi and wait some minutes.

Find the IP of the Orange Pi in your router. I recommend setting a fixed IP in the router's DHCP server and adding an alias in the `/etc/hosts` of the main PC. The hostname alias used from now is `zhome.local`.

From the PC connected to the same network run:

```sh
ssh root@zhome.local
```

And follow the asistant.

To avoid entering the password everytime you connect, you can authorize the main PC to access the Orange Pi running `ssh-copy-id zhome@zhome.local` from the PC.

## First upgrade and install the necessary system packages

Run in the Orange Pi as root:

```sh
## Upgrade all system packages
apt update
apt upgrade
reboot
```

After rebooting and reconnecting.

```sh
apt autoremove --purge
apt install git mosquitto-clients mosquitto watchdog
apt install make g++ # for building native npm dependencies like "unix-dgram", used by Zigbee2MQTT
apt install busybox-static # to fix an issue loading overlayfs
apt install mc # optional
```

## Extra configuration

- Run `select-editor` and pick your favorite editor.
- Using `armbian-config` configure:
  - Set Localization / hostname = `zhome.local`.
- Turn off Bluetooth and the the Wi-Fi (when using ethernet) radios:
  ```sh
  rfkill list
  rfkill block 0
  rfkill block 1
  rfkill block 2
  ```
- Reduce the size of the system logs to reduce the amount of data saved in disk.
  - Edit `/etc/systemd/journald.conf`, setting `SystemMaxUse=10M` and `RuntimeMaxUse=10M`.
  - Apply: `systemctl restart systemd-journald`.
  - Do extra cleaning: `journalctl --rotate && journalctl --vacuum-time=1d`.
- Disable root account:
  - Edit `/etc/ssh/sshd_config` and set `PermitRootLogin no`.
  - Run `passwd -l root`.
- Disable Armbian RAM log: `sed -i "s|ENABLED=true|ENABLED=false|g" /etc/default/armbian-ramlog`
- Disable Armbian ZRAM: `sed -i "s|ENABLED=true|ENABLED=false|g" /etc/default/armbian-zram-config`

## Configure USB to connect ethernet adapter

This part can be skipped if using the Wi-Fi.

The Orange Pi Zero 2W has two USB ports, but only one (the one further from the edge of the board) is configured by default in host mode. To be able to use the two USB ports at the same time, i.e. to connect a USB ethernet adapter, do the following.

Create a file called `usbhost0.dts`:

```
/dts-v1/;
/plugin/;

/ {
    compatible = "allwinner,sun50i-h618";

    fragment@0 {
        target-path = "/soc/usb@5100000";
        __overlay__ {
            status = "disabled";
            dr_mode = "host";
        };
    };

    fragment@1 {
        target-path = "/soc/usb@5101400";
        __overlay__ {
            status = "okay";
        };
    };

    fragment@2 {
        target-path = "/soc/usb@5101000";
        __overlay__ {
            status = "okay";
        };
    };
};
```

And then run as root:

```sh
dtc -@ -I dts -O dtb -o usbhost0.dtbo usbhost0.dts
mkdir /boot/overlay-user
cp usbhost0.dtbo /boot/overlay-user
rm usbhost0.dts usbhost0.dtbo
mcedit /boot/armbianEnv.txt
# add line: user_overlays=usbhost0
```

## Install Node.js

Do not use the version of Node.js shipped with Debian. Better, use the [official distribution](https://github.com/nodesource/distributions/blob/master/DEV_README.md#debian-and-ubuntu-based-distributions).

The Xikibot Extension requires Node 24.

Run in the Orange Pi as root:

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
apt install nodejs
npm uninstall -g corepack # Avoid using corepack because we want to control how pnpm is installed and upgraded
npm update -g npm # Update npm to the latest version globally
```

## Security

It is recommended to protect access to the root account with a password.

To do that, still allowing the user `zhome`  to do some actions as root without entering any password, create the file `/etc/sudoers.d/010_zhome-nopasswd` with content:

```
zhome ALL=(ALL) PASSWD: ALL
zhome ALL=(root) NOPASSWD: /usr/bin/systemctl start zigbee2mqtt
zhome ALL=(root) NOPASSWD: /usr/bin/systemctl stop zigbee2mqtt
zhome ALL=(root) NOPASSWD: /usr/bin/systemctl restart zigbee2mqtt
zhome ALL=(root) NOPASSWD: /usr/bin/mount -o remount\,rw /app
zhome ALL=(root) NOPASSWD: /usr/bin/mount -o remount\,ro /app
zhome ALL=(root) NOPASSWD: /usr/bin/mount -o remount\,rw /media/root-ro
zhome ALL=(root) NOPASSWD: /usr/bin/mount -o remount\,ro /media/root-ro
```

The file includes the commands required by the Xikibot extension, as well as others that are added just for convenience.

Set permissions `chmod 440 /etc/sudoers.d/010_zhome-nopasswd`.

Note, the characters `,`, `:`, `=` and `\` must be escaped with `\` when they are part of the command arguments.

Note 2, be extra careful when editing `010_zhome-nopasswd`. Any syntax error or wrong character will cause the file to be corrupted and it will not be possible to login as root.

## Partitions and OverlayFS

After finishing the setup, the idea is to lock the root partition, setting it as read-only and activate the [OverlayFS](#enable-overlayfs). The OverlayFS allows to write in the root partition, keeping the changes only in memory but never writing them back in the SD card. This means that if the Orange Pi is rebooted, all changes are lost. This prevents damaging the SD card due to frequent writes or corrupting the file system due to sudden loss of power.

To allow upgrading Zigbee2MQTT easily, we add an extra partition named `app` that will not be part of the OverlayFS. It will contain Zigbee2MQTT, the `pnpm` working directory and other files whose changes have to be persisted accross reboots.

By default the `app` partition will be mounted as read-only. Everytime that becomes necessary to do changes, it has to be remounted as read-write, then save the data, and finally remount it as read-only. The reason to do this way is to flush changes as soon as possible and reduce the risk of file system corruption if the system crashes or it is shutted down suddenly.

### Add the app partition

Extract the SD Card from the Orange Pi and open it in your main PC. Using Linux, shrink the `rootfs` partition, reducing it by 6 Gb. This can be done using several partition manager tools, or from the command line, using `resize2fs`. Note that the shrink should be done **after first boot**, otherwise the first boot could fail.

Then create a new EXT4 partition with the label `app`. Again, this can be done with a partition manager or the commands `parted` and `mkfs.ext4`.

### Mount the new partition

Put the SD Card back in the Orange Pi, boot and connect.

Get the PARTUUID of the new partition, running `blkid /dev/mmcblk1p2`.

Add to `/etc/fstab` the following line:

```
PARTUUID=5371e826-02  /app            ext4    ro,exec,nosuid,nodev,noatime,auto    0       2
```

That entry will mount the new partition by default as read-only. When necessary, it could be remounted as read-write.

After modifying `fstab`, run `systemctl daemon-reload` and restart.

### Set environment variables

To use the `app` partition some directories have to be adjusted. Do it by setting the following environment variables:

Add in  `/home/zhome/.profile`:

```sh
export ZIGBEE2MQTT_DATA=/home/zhome/zigbee2mqtt-rw/data
export PNPM_HOME=/app/pnpm
```

Create `/home/zhome/.ssh/environment` with rights `chmod 600 /home/zhome/.ssh/environment` and add:

```ini
ZIGBEE2MQTT_DATA=/home/zhome/zigbee2mqtt-rw/data
PNPM_HOME=/app/pnpm
```

To be able to use `~/.ssh/environment`, edit `/etc/ssh/sshd_config` setting `PermitUserEnvironment yes`.

Then reboot the Orange Pi, reconnect and check that the new variables are in the environment.

## Install `pnpm`

Run in the Orange Pi:

```sh
sudo npm install -g pnpm # Install pnpm globally

sudo mount -o remount,rw /app
cd /app

sudo mkdir pnpm
sudo chown zhome:zhome pnpm
cd pnpm
mkdir store cache state global bin node-gyp build-cache
export PATH=$PATH:/app/pnpm # this prevents pnpm from complaining that the bin directory (which is $PNPM_HOME when the variable exists) is not in the PATH, although we do not need it in the PATH because we are not going to install global packages
pnpm config set store-dir /app/pnpm/store --global
pnpm config set cache-dir /app/pnpm/cache --global
pnpm config set state-dir /app/pnpm/state --global
pnpm config set global-dir /app/pnpm/global --global
pnpm config set devdir /app/pnpm/node-gyp --global # cache location for node-gyp
pnpm config set cache /app/pnpm/build-cache --global  # cache location for prebuild-install
pnpm config set global-bin-dir /app/pnpm/bin --global

sudo mount -o remount,ro /app
```

## Install extra files and dependencies

Run in the Orange Pi:

```sh
sudo mount -o remount,rw /app
cd /app

# Copy helper scripts
sudo mkdir scripts
sudo chown zhome:zhome scripts
# Copy "config-backup.sh" to "/app/scripts" by running in the main PC
# scp scripts/install/config-backup.sh zhome@zhome.local:/app/scripts/
chmod +x /app/scripts/*.sh

# better-sqlite3 is an external dependency of the Xikibot extension
sudo mkdir sqlite3
sudo chown zhome:zhome sqlite3
cd sqlite3
pnpm install better-sqlite3
pnpm approve-builds
cd ..

# Prepare the directory for the DB of the Xikibot extension
sudo mkdir data
sudo chown zhome:zhome data
# copy existing database to /app/data

sudo mount -o remount,ro /app
```

## Install Zigbee2MQTT

We will not follow the [general guide](https://www.zigbee2mqtt.io/guide/installation/01_linux.html) because the Orange Pi Zero W has not enough power to perform the build and we will change some directories to work with `/app`.

### Prepare directories

Run in the Orange Pi:

```sh
sudo mount -o remount,rw /app
cd /app

sudo mkdir zigbee2mqtt
sudo chown zhome:zhome zigbee2mqtt
sudo mount -o remount,ro /app

mkdir -p /home/zhome/zigbee2mqtt-rw/data
cd /home/zhome/zigbee2mqtt-rw
ln -s /app/zigbee2mqtt/dist dist
ln -s /app/sqlite3/node_modules/better-sqlite3 better-sqlite3
```

### Build Zigbee2MQTT

See also, [General installation guide](https://www.zigbee2mqtt.io/guide/installation/01_linux.html).

Run in the Orange Pi:

```sh
sudo mount -o remount,rw /app
cd /app
git clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git
cd zigbee2mqtt
pnpm i --frozen-lockfile
pnpm run build
sudo mount -o remount,ro /app
```

### Restore old configuration

Restore a backup of the configuration in `/home/zhome/zigbee2mqtt-rw/data`.

### Create a system service

Run in the main PC: `scp scripts/install/zigbee2mqtt.service zhome@zhome.local:/tmp/zigbee2mqtt.service`

Run in the Orange Pi:

```sh
sudo cp /tmp/zigbee2mqtt.service /etc/systemd/system/zigbee2mqtt.service
rm /tmp/zigbee2mqtt.service
sudo systemctl daemon-reload
sudo systemctl enable zigbee2mqtt # Start the service automatically on boot
```

## Scheduled tasks

### Schedule Zigbee2MQTT configuration backups

Since the configuration and data of Zigbee2MQTT is in `/home/zhome/zigbee2mqtt-rw/data`, which is volatile, persist Zigbee2MQTT configuration changes to the SD card from time to time.

Run in the Orange Pi `crontab -e` and add the lines:

```
0 */8 * * * /app/scripts/config-backup.sh --online --no-state
35 03 * * * /app/scripts/config-backup.sh --online
```

### Automatic clean-up

Some system service write logs repeatedly. Since the main partition is [overlaid](#enable-overlayfs), the logs are kept in memory, wasting memory unnecessarily. From time to time clean such logs.

Run in the Orange Pi `sudo crontab -e` (note, that must be executed as root) and add the line:

```
31 03 * * * /usr/bin/rm -f /var/log/armbian-hardware-monitor.log
39 03 * * * /usr/bin/dmesg -C
55 03 * * * /usr/bin/apt clean
```

## Enable OverlayFS

As explained in [Partitions and OverlayFS](#partitions-and-overlayfs), it is recommended to enable OverlayFS to protect the SD Card and reduce the risk of file system corruption.

Do some [cleaning](#cleaning) before enabling the OverlayFS.

Create the following file in `/etc/overlayroot.local.conf`:

```ini
#overlayroot="disabled"
overlayroot="tmpfs:recurse=0"
```

Note, the option "recurse=0" is to avoid that `/app` is added to the overlay, since we want it to be writable.

Run `armbian-config` and activate System / Storage / Enable read only filesystem.

After rebooting, check with `mount` that the type of `/` is overlay but `/app` has not changed. If that is correct, the root partition will be "frozen" and the changes will be volatile.

If not, try this to fix the issue:
- Run `apt install busybox-static` (if not installed already).
- Edit `/etc/initramfs-tools/initramfs.conf` and set `BUSYBOX=y`.
- Run `update-initramfs -c -k all`.
- Reboot.

You can find how much memory takes the OverlayFS by running `sudo du -hs /media/root-rw/overlay/*`.

### How to disable OverlayFS

There are two ways of making permanent system changes when OverlayFS is active:

1. Execute `mount -o remount,rw /media/root-ro`, make the changes under `/media/root-ro/`, and then `mount -o remount,ro /media/root-ro/`. If the files updated in `/media/root-ro/` were also modified in `/` and stay in memory, you won't see the changes made in `/media/root-ro/` propagated to `/` immediately.
2. Execute `overlayroot-chroot` and make the changes. If after exiting, the changes are not visible, run `mount -o remount /` to synchronize.

To disable OverlayFS, using one of the two methods described, uncomment the first line of `/etc/overlayroot.local.conf` and comment (with `#`) the second line. Then reboot.

To re-enable just revert the line comments and reboot.

## Cleaning

Run in the Orange Pi:

```sh
sudo su
journalctl --rotate && journalctl --vacuum-time=1d
apt clean
# to avoid wasting memory space when rotating the logs
rm /var/log/dpkg.log*
rm /var/log/apt/history.log*
rm /var/log/apt/term.log*
rm /var/log/apt/eipp.log.xz # ??
rm /var/backups/*
rm /var/log/armbian-hardware-monitor.log

rm -rf /root/.npm # clean cached files
rm -rf /root/.local/share/mc
rm -rf /root/.cache/mc
rm /root/.lesshst
rm /root/.bash_history
exit
sudo su
rm /root/.bash_history # second time removes the commands stored by the previous "exit"
exit

rm -rf /home/zhome/.local/share/mc
rm /home/zhome/.lesshst
rm /home/zhome/.bash_history
exit
# connect again
rm /home/zhome/.bash_history # second time removes the commands stored by the previous "exit"
exit
```

# Upgrading

## Upgrade system packages and `pnpm`

First, [disable OverlayFS](#how-to-disable-overlayfs).

Run in the Orange Pi as root:

```sh
apt update
apt upgrade

reboot

apt autoremove --purge
sudo npm update -g
```

If NodeJs is upgraded, remove corepack and upgrade also `npm`.

Enable OverlayFS again, doing some [cleaning](#cleaning) before restarting.

## Upgrade the Zigbee2MQTT

Changes inside `/app` are permanent across reboots. So, we can upgrade Zigbee2MQTT without worrying about the [OverlayFS](#enable-overlayfs).

In the main PC:
- Run `zigbee2mqtt/update.sh`.
- Run `xikibot/scripts/upgrade-z2m.sh`.

## Upgrade the better-sqlite3

Run in the Orange Pi:

```sh
cd /app
rm -rf better-sqlite3 # it will fail removing the top directory but the content will be removed
```

Then follow the steps of [Install extra files and dependencies](#install-extra-files-and-dependencies) related only to `better-sqlite3`.
