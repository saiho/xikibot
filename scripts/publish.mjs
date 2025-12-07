#!/bin/node

import { readFileSync } from 'node:fs';
import { runSshCommandAsync } from './common/utils.mjs';

const ZIGBEE2MQTT_DATA = '/home/zhome/zigbee2mqtt-rw/data';
const EXTENSION_FILE_NAME = 'xikibot.mjs';

try {
    const content = readFileSync(`./dist/${EXTENSION_FILE_NAME}`, 'utf-8');

    console.log(`Deleting previous version of ${EXTENSION_FILE_NAME}…`);
    await Promise.all([
        runSshCommandAsync('mosquitto_sub -t zigbee2mqtt/bridge/response/extension/remove -C 1 -W 20'),
        runSshCommandAsync('mosquitto_pub -t zigbee2mqtt/bridge/request/extension/remove -s',
            JSON.stringify({ name: EXTENSION_FILE_NAME })),
    ]);

    console.log('Stopping Zigbee2MQTT…');
    await runSshCommandAsync('sudo systemctl stop zigbee2mqtt');

    console.log(`Deleting ${EXTENSION_FILE_NAME} from disk…`);
    await runSshCommandAsync(`rm -f ${ZIGBEE2MQTT_DATA}/external_extensions/${EXTENSION_FILE_NAME}`);

    console.log('Starting Zigbee2MQTT…');
    await runSshCommandAsync('sudo systemctl start zigbee2mqtt');

    console.log(`Publishing new version of ${EXTENSION_FILE_NAME}…`);
    await Promise.all([
        runSshCommandAsync('mosquitto_sub -t zigbee2mqtt/bridge/response/extension/save -C 1 -W 20'),
        runSshCommandAsync('mosquitto_pub -t zigbee2mqtt/bridge/request/extension/save -s',
            JSON.stringify({ name: EXTENSION_FILE_NAME, code: content })),
    ]);

    process.exit(0);
} catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
}
