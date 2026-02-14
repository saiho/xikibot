/// <reference types='../packages/zigbee2mqtt/lib/types/types.d.ts' />

import type * as Settings from 'zigbee2mqtt/util/settings';
import type Logger from 'zigbee2mqtt/util/logger';

import utils from 'zigbee2mqtt/util/utils';
import { Component } from './component.common';
import { initComponents } from './component';
import { clearTriggers, runTriggers } from './trigger';
import { startAPIServer, stopAPIServer } from './api-server';
import { closeDb, initDb } from './storage';
import { setXikibotInstance } from './global';

export class XikibotExtension {
  private readonly mqttBaseTopic: string;
  private readonly listenComponentChanges: Map<string, Component>;
  private started = false;

  constructor(
    protected readonly zigbee: Zigbee,
    mqtt: Mqtt,
    protected readonly state: State,
    publishEntityState: PublishEntityState,
    protected readonly eventBus: EventBus,
    enableDisableExtension: (enable: boolean, name: string) => Promise<void>,
    restartCallback: () => Promise<void>,
    addExtension: (extension: Extension) => Promise<void>,
    settings: typeof Settings,
    public readonly logger: typeof Logger,
  ) {
    setXikibotInstance(this);
    this.mqttBaseTopic = settings.get().mqtt.base_topic;
    this.listenComponentChanges = new Map(initComponents()
      .filter(component => component.onChange)
      .map(component => [component.name, component]));
  }

  public async start(): Promise<void> {
    if (this.started) {
      // Since version 2.2.1 the extension is started twice when booting Zigbee2MQTT. Ignore the second attempt.
      this.logger.debug('XIKIBOT already started');
      return;
    }
    this.logger.info('Start XIKIBOT');
    await initDb();
    startAPIServer();
    this.started = true;

    this.eventBus.onMQTTMessagePublished(this, (data: eventdata.MQTTMessagePublished) => {
      const componentName = data.topic.replace(this.mqttBaseTopic + '/', '');
      const component = this.listenComponentChanges.get(componentName);
      if (component) {
        component.onChange!(new component.stateParser(data.payload));
      }
      runTriggers();
    });
  }

  public async stop(): Promise<void> {
    clearTriggers();
    await stopAPIServer();
    await closeDb();
    this.eventBus.removeListeners(this);
    this.started = false;
    this.logger.info('Stop XIKIBOT');
  }

  public emitMessage(payload: KeyValue, ...topicParts: string[]) {
    this.eventBus.emitMQTTMessage({
      topic: [this.mqttBaseTopic, ...topicParts].join('/'),
      message: JSON.stringify(payload),
    });
  }

  public getState(name: string): KeyValue | null {
    const device = this.getDevice(name);
    return device ? this.state.get(device) : null;
  }

  public getDevice(name: string): Device | null {
    for (const device of this.zigbee.devicesIterator(utils.deviceNotCoordinator)) {
      if (device.name === name) {
        return device;
      }
    }
    return null;
  }
}
