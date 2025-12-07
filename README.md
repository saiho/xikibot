# xikibot

Extension for Zigbee2MQTT to set automation rules.

This extension has been designed for my own home automation and is not meant to be reusable as-is. However, some parts of it could be taken and reused for building similar extensions.

## Preliminary notes

- Create a clone of https://github.com/Koenkk/zigbee2mqtt at the same level of `xikibot` (not inside `xikibot` folder). This is a dependency for building.
- `pnpm` should be installed.
- I am running Zigbee2MQTT in a Raspberry Pi Zero W, so the extension has been designed considering a very limited amount of memory.
- NodeJS 20 is the maximum version that can run in Raspberry Pi Zero W.
- Before building and deploying, read fully the readme and [how to setup the Raspberry and install Zigbee2MQTT](help/setup.md). The documentation and scripts assume that the hostname and username of the Raspberry are the following:
  - Username: `zhome`.
  - Hostname: `zhome.local`.
- The coordinator hardware tested is SONOFF CC2652P, altough it should work with any coordinator supported by Zigbee2MQTT.

## How build and deploy the extension in Zigbee2MQTT

Automatic way. This will do the build and install in one go.

```sh
pnpm i
pnpm run publish
```

Manual way.

```sh
pnpm i
pnpm run build
```

Then, open the [frontend of Zigbee2MQTT](http://zhome.local:8080), go to "Settings / Settings / Dev console / External Extensions" and add a new extension copying the code from `dist/xikibot.mjs`. Be sure to put `.mjs` in the extension name.
