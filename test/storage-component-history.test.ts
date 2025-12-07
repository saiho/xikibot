import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getComponentHistory, getCurrentComponent, updateComponentHistory } from '../src/storage';
import { Component, ComponentPresence, SwitchComponent, TemperatureHumiditySensorComponent } from '../src/component.common';
import { XikibotExtensionMock } from './common/xikibot.mock';
import { prepareTestDb } from './common/global.mock';

describe('Storage of component history', () => {
  beforeEach(() => {
    prepareTestDb();
  });

  it('Update history', async () => {
    XikibotExtensionMock.setDevicesCreateAuto(false);

    XikibotExtensionMock.addDevice('Temperature Sensor 1', { ieeeAddr: '0x0000a71c' });
    XikibotExtensionMock.addDevice('Temperature Sensor 2', { ieeeAddr: '0x0000a72c' });

    new TemperatureHumiditySensorComponent({ name: 'Temperature Sensor 1', persistentId: 501 });
    new TemperatureHumiditySensorComponent({ name: 'Temperature Sensor 2', persistentId: 502 });

    vi.useFakeTimers();
    const time1 = Date.now();
    await updateComponentHistory();
    const history = [
      {
        persistentId: 501,
        z2mDeviceId: '0x0000a71c',
        name: 'Temperature Sensor 1',
        sinceDate: time1,
        presence: ComponentPresence.active,
      },
      {
        persistentId: 502,
        z2mDeviceId: '0x0000a72c',
        name: 'Temperature Sensor 2',
        sinceDate: time1,
        presence: ComponentPresence.active,
      },
    ];
    expect(getComponentHistory()).toEqual(history);

    // Add a new device and component
    XikibotExtensionMock.addDevice('Fan 1', { ieeeAddr: '0x0000b001' });
    new SwitchComponent({ name: 'Fan 1', persistentId: 503 });
    vi.advanceTimersByTime(10000);
    const time2 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 503,
      z2mDeviceId: '0x0000b001',
      name: 'Fan 1',
      sinceDate: time2,
      presence: ComponentPresence.active,
    });
    expect(getComponentHistory()).toEqual(history);

    // Rename a device and component
    XikibotExtensionMock.removeDevice('Temperature Sensor 1');
    XikibotExtensionMock.addDevice('Temperature Sensor 1 renamed', { ieeeAddr: '0x0000a71c' });
    removeComponent('Temperature Sensor 1');
    new TemperatureHumiditySensorComponent({ name: 'Temperature Sensor 1 renamed', persistentId: 501 });
    vi.advanceTimersByTime(10000);
    const time3 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 501,
      z2mDeviceId: '0x0000a71c',
      name: 'Temperature Sensor 1 renamed',
      sinceDate: time3,
      presence: ComponentPresence.active,
    });
    expect(getComponentHistory()).toEqual(history);

    // Disable a device
    XikibotExtensionMock.disableDevice('Fan 1');
    vi.advanceTimersByTime(10000);
    const time4 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 503,
      z2mDeviceId: '0x0000b001',
      name: 'Fan 1',
      sinceDate: time4,
      presence: ComponentPresence.disabled,
    });
    expect(getComponentHistory()).toEqual(history);

    // Enable a device
    XikibotExtensionMock.enableDevice('Fan 1');
    vi.advanceTimersByTime(10000);
    const time5 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 503,
      z2mDeviceId: '0x0000b001',
      name: 'Fan 1',
      sinceDate: time5,
      presence: ComponentPresence.active,
    });
    expect(getComponentHistory()).toEqual(history);

    // Change a physical device
    XikibotExtensionMock.removeDevice('Temperature Sensor 2');
    XikibotExtensionMock.addDevice('Temperature Sensor 2', { ieeeAddr: '0x0000a72d' });
    vi.advanceTimersByTime(10000);
    const time6 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 502,
      z2mDeviceId: '0x0000a72d',
      name: 'Temperature Sensor 2',
      sinceDate: time6,
      presence: ComponentPresence.active,
    });
    expect(getComponentHistory()).toEqual(history);

    // Remove a device
    XikibotExtensionMock.removeDevice('Temperature Sensor 2');
    vi.advanceTimersByTime(10000);
    const time7 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 502,
      z2mDeviceId: '0x0000a72d',
      name: 'Temperature Sensor 2',
      sinceDate: time7,
      presence: ComponentPresence.notFound,
    });
    expect(getComponentHistory()).toEqual(history);

    // Restore a device
    XikibotExtensionMock.addDevice('Temperature Sensor 2', { ieeeAddr: '0x0000a72d' });
    vi.advanceTimersByTime(10000);
    const time8 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 502,
      z2mDeviceId: '0x0000a72d',
      name: 'Temperature Sensor 2',
      sinceDate: time8,
      presence: ComponentPresence.active,
    });
    expect(getComponentHistory()).toEqual(history);

    // Remove a component
    removeComponent('Temperature Sensor 2');
    vi.advanceTimersByTime(10000);
    const time9 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 502,
      z2mDeviceId: '0x0000a72d',
      name: 'Temperature Sensor 2',
      sinceDate: time9,
      presence: ComponentPresence.removed,
    });
    expect(getComponentHistory()).toEqual(history);

    // Remove the device of a component that was already removed
    XikibotExtensionMock.removeDevice('Temperature Sensor 2');
    vi.advanceTimersByTime(10000);
    await updateComponentHistory();
    // No history changes
    expect(getComponentHistory()).toEqual(history);

    // Multiple changes
    XikibotExtensionMock.removeDevice('Fan 1');
    XikibotExtensionMock.addDevice('Fan 2', { ieeeAddr: '0x0000b002' });
    XikibotExtensionMock.addDevice('Fan 3', { ieeeAddr: '0x0000b003' });
    new SwitchComponent({ name: 'Fan 2', persistentId: 504 });
    new SwitchComponent({ name: 'Fan 3', persistentId: 505 });
    vi.advanceTimersByTime(10000);
    const time10 = Date.now();
    await updateComponentHistory();
    history.push({
      persistentId: 503,
      z2mDeviceId: '0x0000b001',
      name: 'Fan 1',
      sinceDate: time10,
      presence: ComponentPresence.notFound,
    }, {
      persistentId: 504,
      z2mDeviceId: '0x0000b002',
      name: 'Fan 2',
      sinceDate: time10,
      presence: ComponentPresence.active,
    }, {
      persistentId: 505,
      z2mDeviceId: '0x0000b003',
      name: 'Fan 3',
      sinceDate: time10,
      presence: ComponentPresence.active,
    });
    expect(getComponentHistory()).toEqual(history);

    expect(getCurrentComponent()).toEqual([history[3], history[9], history[10], history[11], history[12]]);
  });
});

function removeComponent(name: string) {
  Component.ALL_COMPONENTS.splice(Component.ALL_COMPONENTS.findIndex(component => component.name === name), 1);
}
