# xikibot

Extension for Zigbee2MQTT to set automation rules.

This extension has been designed for my own home automation and is not meant to be reusable as-is. However, some parts of it could be taken and reused for building similar extensions.

## Preliminary notes

- When cloning the GIT repository, clone also the submodules.
- I am running Zigbee2MQTT in a [Orange Pi Zero 2W](http://www.orangepi.org/html/hardWare/computerAndMicrocontrollers/details/Orange-Pi-Zero-2W.html), so the extension has been designed considering a limited amount of memory.
- Before building and deploying, read fully the readme and [how to setup the Orange Pi and install Zigbee2MQTT](help/setup.md). The documentation and scripts assume that the hostname and username of the Orange Pi are the following:
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
