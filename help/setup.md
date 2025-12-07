**Index**

- [Setting up the Raspberry for the first time](#setting-up-the-raspberry-for-the-first-time)
  - [First upgrade and install the necessary system packages](#first-upgrade-and-install-the-necessary-system-packages)
  - [Extra configuration](#extra-configuration)
  - [Install (or upgrade) Node.js](#install-or-upgrade-nodejs)
  - [Security](#security)
  - [Partitions and OverlayFS](#partitions-and-overlayfs)
    - [Add the app partition](#add-the-app-partition)
    - [Mount the new partition](#mount-the-new-partition)
    - [Set environment variables](#set-environment-variables)
  - [Install `pnpm`](#install-pnpm)
  - [Install extra files and dependencies](#install-extra-files-and-dependencies)
  - [Install Zigbee2MQTT](#install-zigbee2mqtt)
    - [Prepare directories](#prepare-directories)
    - [Create a system service](#create-a-system-service)
    - [Build Zigbee2MQTT](#build-zigbee2mqtt)
  - [Scheduled tasks](#scheduled-tasks)
    - [Schedule Zigbee2MQTT configuration backups](#schedule-zigbee2mqtt-configuration-backups)
    - [Automatic clean-up](#automatic-clean-up)
  - [Enable OverlayFS](#enable-overlayfs)
    - [How to disable OverlayFS](#how-to-disable-overlayfs)
  - [Cleaning](#cleaning)
- [Upgrading](#upgrading)
  - [Upgrade system packages, Node.js and `pnpm`](#upgrade-system-packages-nodejs-and-pnpm)
  - [Upgrade the Zigbee2MQTT](#upgrade-the-zigbee2mqtt)
  - [Upgrade the better-sqlite3](#upgrade-the-better-sqlite3)

# Setting up the Raspberry for the first time

Install Raspberry Pi OS Lite (the normal version with desktop is not recommended) in a SD card using `rpi-imager`. Be sure to setup the Wi-Fi properly and enable ssh access.

https://www.raspberrypi.com/documentation/computers/getting-started.html#raspberry-pi-imager

Additional instructions to access Raspberry for the first time without using a screen:

https://www.raspberrypi.com/documentation/computers/configuration.html#setting-up-a-headless-raspberry-pi

Boot the Raspberry and wait some minutes. From a PC connected to the same Wi-Fi run:

```sh
ssh zhome@zhome.local
```

Use the password configured with `rpi-imager`.

To avoid entering the password everytime you connect, you can authorize the main PC to access the Raspberry running `ssh-copy-id zhome@zhome.local` from the PC.

## First upgrade and install the necessary system packages

Run in the Raspberry:

```sh
sudo su
## Delete unused kernels meant for other models of Raspberry
dpkg --get-selections | grep 'linux-.*-v[7-8]' | awk '{print $1}' | xargs sudo apt -y --purge remove
## Upgrade all system packages
apt update
apt upgrade
reboot
```

After rebooting and reconnecting.

```sh
sudo su
apt autoremove --purge
apt install git mosquitto-clients mosquitto watchdog overlayroot
apt install mc lsof # optional
```

## Extra configuration

- Run `select-editor` and pick your favorite editor.
- With `raspi-config` configure:
  - Logs = volatile
  - Locale
  - Read-only boot partition
- Reduce the size of the system logs to reduce the amount of data saved in disk.
  - Edit `/etc/systemd/journald.conf`, setting `SystemMaxUse=50M` and `RuntimeMaxUse=50M`.
  - Apply: `systemctl restart systemd-journald`.
  - Do extra cleaning: `journalctl --rotate && journalctl --vacuum-time=1d`.

## Install (or upgrade) Node.js

Do not use the version of Node.js shipped with Raspberry Pi OS. Instead, download from https://unofficial-builds.nodejs.org/download/release/.

The architecture compatible with Raspberry Pi Zero W is `armv6l`. The latest major version compatible is Node.js 20. There are no builds for this architecture for Node.js 22 or higher.

Run in the Raspberry:

```sh
sudo su
cd /usr/local

# Uninstall previous version (when upgrading Node.js, otherwise ignore this section)
rm bin/corepack
rm bin/node
rm bin/npm
rm bin/npx
rm bin/yarn
rm bin/yarnpkg
rm bin/pnpm
rm bin/pnpx
rm -rf lib/node_modules
rm -rf share/doc/node
# In the man folders there should be only links of Node.js (pointing to the node_modules folder) because we have have not installed anything else manually
rm share/man/man1/*
rm share/man/man5/*
rm share/man/man7/*

version=20.19.6 # replace by the latest version

# Download and extract
curl https://unofficial-builds.nodejs.org/download/release/v$version/node-v$version-linux-armv6l.tar.gz -o node-v$version-linux-armv6l.tar.gz
tar -xvzf node-v$version-linux-armv6l.tar.gz --no-same-owner --strip-components=1 --anchored --no-wildcards-match-slash --wildcards "*/bin" "*/lib" "*/share" 
rm node-v$version-linux-armv6l.tar.gz

npm update -g npm # Update npm to the latest version globally
npm uninstall -g corepack # Avoid using corepack because we want to control how pnpm is installed and upgraded
mandb # Refresh man pages
```

## Security

It is recommended to protect access to the root account with a password. See https://www.raspberrypi.com/documentation/computers/configuration.html#secure-your-raspberry-pi

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

Set permissions `chmod 440 /etc/sudoers.d/010_zhome-nopasswd` and delete `/etc/sudoers.d/010_pi-nopasswd`.

Note, the characters `,`, `:`, `=` and `\` must be escaped with `\` when they are part of the command arguments.

Note 2, be extra careful when editing `010_zhome-nopasswd`. Any syntax error or wrong character will cause the file to be corrupted and it will not be possible to login as root.

## Partitions and OverlayFS

After finishing the setup, the idea is to lock the partitions `boot` and `rootfs`, setting them as readonly and activate the [OverlayFS](#enable-overlayfs). The OverlayFS allows to write in the root partition, keeping the changes only in memory but never writing them back in the SD card. This means that if the Raspberry is rebooted, all changes are lost. This prevents damaging the SD card due to frequent writes or corrupting the file system due to sudden loss of power.

To allow upgrading Zigbee2MQTT easily, an extra partition is added. This partition will not be overlaid and it will contain the Zigbee2MQTT application, `pnpm` working directory and other files whose changes have to be persisted accross reboots. The partition name will be `app`.

By default the `app` partition will be mounted as read-only. Everytime that becomes necessary to save changes, it has to be remounted as read-write, save the data, and finally remount it as read-only. The reason to do this way is to flush changes as soon as possible and reduce the risk of file system corruption if the system crashes or it is shutted down suddenly.

### Add the app partition

Extract the SD Card from the Raspberry and open it in your main PC. Using Linux, shrink the `rootfs` partition, reducing it by 6 Gb. This can be done using several partition manager tools, or from the command line, using `resize2fs`. Note that the shrink should be done **after first boot**, otherwise the first boot could fail.

Then create a new EXT4 partition with the label `app`. Again, this can be done with a partition manager or the commands `parted` and `mkfs.ext4`.

### Mount the new partition

Put the SD Card back in the Raspberry, boot and connect.

Get the PARTUUID of the new partition, running `blkid /dev/mmcblk0p3`.

Add to `/etc/fstab` the following line:

```
PARTUUID=6b189501-03  /app            ext4    ro,exec,nosuid,nodev,noatime,auto    0       2
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

Then reboot the Raspberry, reconnect and check that the new variables are in the environment.

## Install `pnpm`

Run in the Raspberry:

```sh
sudo npm install -g pnpm # Install pnpm globally

mount -o remount,rw /app
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
pnpm config set global-bin-dir /app/pnpm/bin --global
pnpm config set devdir /app/pnpm/node-gyp --global # cache location for node-gyp
pnpm config set cache /app/pnpm/build-cache --global  # cache location for prebuild-install

mount -o remount,ro /app
```

## Install extra files and dependencies

Run in the Raspberry:

```sh
mount -o remount,rw /app
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
pnpm approve-builds # it takes around 30 minutes
cd ..

# Prepare the directory for the DB of the Xikibot extension
sudo mkdir data
sudo chown zhome:zhome data

mount -o remount,ro /app
```

## Install Zigbee2MQTT

We will not follow the [general guide](https://www.zigbee2mqtt.io/guide/installation/01_linux.html) because the Raspberry Pi Zero W has not enough power to perform the build and we will change some directories to work with `/app`.

### Prepare directories

Run in the Raspberry:

```sh
mount -o remount,rw /app
cd /app

sudo mkdir zigbee2mqtt
sudo chown zhome:zhome zigbee2mqtt
mount -o remount,ro /app

mkdir -p /home/zhome/zigbee2mqtt-rw/data
cd /home/zhome/zigbee2mqtt-rw
ln -s /app/zigbee2mqtt/dist dist
ln -s /app/sqlite3/node_modules/better-sqlite3 better-sqlite3
```

### Create a system service

Do this before [Build Zigbee2MQTT](#build-zigbee2mqtt). Specially before running `upgrade-z2m.sh`, because the script expects the service to be present.

Run in the main PC: `scp scripts/install/zigbee2mqtt.service zhome@zhome.local:/tmp/zigbee2mqtt.service`

Run in the Raspberry:
```sh
sudo mv /tmp/zigbee2mqtt.service /etc/systemd/system/zigbee2mqtt.service
sudo systemctl daemon-reload
sudo systemctl enable zigbee2mqtt # Start the service automatically on boot
```

### Build Zigbee2MQTT

Build Zigbee2MQTT in the main PC, running:

```sh
# Go to the parent directory of xikibot
# cd /path/to/xikibot/..
git clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git
cd zigbee2mqtt
pnpm i --frozen-lockfile
pnpm run build
../xikibot/scripts/upgrade-z2m.sh # copy the files built locally to the Raspberry
```

## Scheduled tasks

### Schedule Zigbee2MQTT configuration backups

Since the configuration and data of Zigbee2MQTT is in `/home/zhome/zigbee2mqtt-rw/data`, which is volatile, persist Zigbee2MQTT configuration changes to the SD card from time to time.

Run in the Raspberry `crontab -e` and add the lines:

```
0 */8 * * * /app/scripts/config-backup.sh --online --no-state
35 03 * * * /app/scripts/config-backup.sh --online
```

### Automatic clean-up

Some system service write logs repeatedly. Since the main partition is [overlaid](#enable-overlayfs), the logs are kept in memory, wasting memory unnecessarily. From time to time clean such logs.

Run in the Raspberry `sudo crontab -e` (note, that must be executed as root) and add the line:

```
55 03 * * * /usr/bin/apt clean
```

## Enable OverlayFS

As explained in [Partitions and OverlayFS](#partitions-and-overlay-fs), it is recommended to enable OverlayFS to protect the SD Card and reduce the risk of file system corruption.

Run in the Raspberry `sudo raspi-config` and activate: Performance / Overlay FS. The first time it will install the necessary APT packages. Reboot.

The default configuration makes `/app` also overlaid, which we don't want, because we want it to be writable. This cannot be changed with `raspi-config`, so second step is to deactivate OverlayFS with `raspi-config` and reboot again.

Third step, run in the Raspberry `sudo echo overlayroot=tmpfs:recurse=0 > /etc/overlayroot.local.conf`. This activates OverlayFS only in the root partition (non recursively).

Do some [cleaning](#cleaning) before doing the final reboot. After rebooting the root partition will be "frozen", since OverlayFS will be active and changes in the root partition will be volatile.

Reboot. After rebooting check with `mount` that `/app` has normal mount options and it is not overlaid.

You can find how much memory takes the OverlayFS by running `sudo du -hs /media/root-rw/overlay/*`.

### How to disable OverlayFS

There are two ways of making permanent system changes when OverlayFS is active:

1. Execute `mount -o remount,rw /media/root-ro`, make the changes under `/media/root-ro/`, and then `mount -o remount,ro /media/root-ro/`. If the files updated in `/media/root-ro/` have been also modified in `/` and stay in memory, you won't see the changes made in `/media/root-ro/` propagated to `/` immediately.
2. Execute `overlayroot-chroot` and make the changes. If after exiting, the changes are not visible, run `mount -o remount /` to synchronize.

To disable OverlayFS, using one of the two methods described, comment with `#` the only line of `/etc/overlayroot.local.conf` and reboot.

To re-enable just remove the comment character `#` and reboot.

## Cleaning

Run in the Raspberry:

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

rm -rf /root/.npm # clean cached files

rm /root/.bash_history
exit
sudo su
rm /root/.bash_history # second time removes the commands stored by the previous "exit"
exit

rm /home/zhome/.bash_history
exit
# connect again
rm /home/zhome/.bash_history # second time removes the commands stored by the previous "exit"
exit
```

# Upgrading

## Upgrade system packages, Node.js and `pnpm`

First, [disable OverlayFS](#how-to-disable-overlayfs).

Run in the Raspberry:

```sh
sudo su
apt update
mount -o remount,rw /boot/firmware # some packages do changes in /boot when upgraded
apt upgrade

reboot

sudo su
apt autoremove --purge
```

For upgrading Node.js, see [Install (or upgrade) Node.js](#install-or-upgrade-nodejs).

Alternatively, if there is no new version of Node.js, just upgrade `pnpm`:

```sh
sudo npm update -g
```

Enable OverlayFS again, doing some [cleaning](#cleaning) before restarting.

## Upgrade the Zigbee2MQTT

Changes inside `/app` are permanent across reboots. So, we can upgrade Zigbee2MQTT without worrying about the [OverlayFS](#enable-overlayfs).

In the main PC:
- Run `zigbee2mqtt/update.sh`.
- Run `xikibot/scripts/upgrade-z2m.sh`.

## Upgrade the better-sqlite3

Run in the Raspberry:

```sh
cd /app
rm -rf better-sqlite3 # it will fail removing the top directory but the content will be removed
```

Then follow the steps of [Install extra files and dependencies](#install-extra-files-and-dependencies) related only to `better-sqlite3`.
