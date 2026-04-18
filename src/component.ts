import debounce from 'debounce';
import {
  ButtonComponent,
  ButtonState,
  Component,
  ShutterComponent,
  SwitchComponent,
  SwitchExclusive2ChannelComponent,
  SwitchState,
  TemperatureHumiditySensorComponent,
} from './component.common';
import { addDelayedTrigger, addScheduledTrigger } from './trigger';
import { storeFanState, storeTemperatureHumidity } from './storage';
import {
  FAN_TOILET_CHANNEL_LEVEL,
  FAN_TOILET_DOWNSTAIRS_FULL_SPEED,
  FAN_TOILET_DOWNSTAIRS_LOW_SPEED,
  ON_CHANGE_NORMAL_DEBOUNCE_TIME,
  QUIET_SINCE,
  QUIET_UNTIL,
} from './global';

export function initComponents(): Component[] {
  Component.ALL_COMPONENTS.length = 0;

  const fanToiletDownstairs = new SwitchExclusive2ChannelComponent(
    { name: 'Ventilador aseo y garaje', location: ['Aseo', 'Garaje'], persistentId: 101, channelLevel: FAN_TOILET_CHANNEL_LEVEL });
  const lightToiletDownstairs = new SwitchComponent(
    { name: 'Luz aseo', location: 'Aseo' });
  const buttonFanToiletDownstairs = new ButtonComponent(
    { name: 'Botón ventilador aseo', location: 'Aseo' });
  const buttonFanToiletDownstairs2 = new ButtonComponent(
    { name: 'Botón ventilador garaje', location: 'Garaje' });
  const fanBathroomUpstairs = new SwitchComponent(
    { name: 'Ventilador baño arriba', location: 'Baño arriba', persistentId: 102 });
  const lightBathroomUpstairs = new SwitchComponent(
    { name: 'Luz baño arriba', location: 'Baño arriba' });
  const buttonFanBathroomUpstairs = new ButtonComponent(
    { name: 'Botón ventilador baño arriba', location: 'Baño arriba' });
  const shutterBedroom = new ShutterComponent(
    { name: 'Persiana habitación roja', location: 'Habitación 🔴' });
  const shutterGarage = new ShutterComponent(
    { name: 'Persiana garaje', location: 'Garaje' });
  const sensorTemperatureGarage = new TemperatureHumiditySensorComponent(
    { name: 'Sensor temperatura garaje', location: 'Garaje', persistentId: 103 });
  const sensorTemperaturePenthouse = new TemperatureHumiditySensorComponent(
    { name: 'Sensor temperatura ático', location: 'Ático', persistentId: 104 });
  const sensorTemperatureOutside = new TemperatureHumiditySensorComponent(
    { name: 'Sensor temperatura exterior', location: 'Exterior', persistentId: 105 });
  const sensorTemperatureBathroomUpstairs = new TemperatureHumiditySensorComponent(
    { name: 'Sensor temperatura baño arriba', location: 'Baño arriba', persistentId: 106 });
  const sensorTemperatureOrangeRoom = new TemperatureHumiditySensorComponent(
    { name: 'Sensor temperatura habitación roja', location: 'Habitación 🔴', persistentId: 107 });
  const sensorTemperatureLivingRoom = new TemperatureHumiditySensorComponent(
    { name: 'Sensor temperatura salón', location: 'Salón', persistentId: 108 });
  // const socket2 = new SocketComponent(
  //   { name: 'Enchufe 2' });
  // const socket4 = new SocketComponent(
  //   { name: 'Enchufe 4' });

  lightToiletDownstairs.onChange = debounce((state: SwitchState) => {
    if (state.on && !isQuietTime()) {
      fanToiletDownstairs.switchOn(fanToiletDownstairs.switchedOnChannel() ?? FAN_TOILET_DOWNSTAIRS_LOW_SPEED);
    }
    else if (state.off) {
      fanToiletDownstairs.delayedSwitchOff({ minutes: 30 });
    }
  }, ON_CHANGE_NORMAL_DEBOUNCE_TIME);

  buttonFanToiletDownstairs.onChange = buttonFanToiletDownstairs2.onChange = (state: ButtonState) => {
    if (state.singlePress) {
      fanToiletDownstairs.switchOn(FAN_TOILET_DOWNSTAIRS_FULL_SPEED, { minutes: 30 });
    }
    else if (state.longPress) {
      fanToiletDownstairs.switchOff();
    }
  };

  fanToiletDownstairs.onChange = debounce(() => {
    storeFanState(fanToiletDownstairs);
  }, ON_CHANGE_NORMAL_DEBOUNCE_TIME);

  addScheduledTrigger(
    'fanToiletDownstairs [daily]',
    () => fanToiletDownstairs.switchOn(FAN_TOILET_DOWNSTAIRS_LOW_SPEED, { hours: 8 }),
    { scheduled: 'atFixedTime', hour: 7, minute: 30 });

  lightBathroomUpstairs.onChange = debounce((state: SwitchState) => {
    if (state.on && !isQuietTime()) {
      fanBathroomUpstairs.switchOn();
    }
    else if (state.off) {
      fanBathroomUpstairs.delayedSwitchOff({ minutes: 5 });
    }
  }, ON_CHANGE_NORMAL_DEBOUNCE_TIME);

  buttonFanBathroomUpstairs.onChange = (state: ButtonState) => {
    if (state.singlePress) {
      fanBathroomUpstairs.switchOn({ minutes: 30 });
    }
    else if (state.longPress) {
      fanBathroomUpstairs.switchOff();
    }
  };

  fanBathroomUpstairs.onChange = debounce(() => {
    storeFanState(fanBathroomUpstairs);
  }, ON_CHANGE_NORMAL_DEBOUNCE_TIME);

  // socket2.onChange = debounce((state: SocketState) => {
  //   if (state.on && !socket4.isSwitchedOn()) {
  //     socket4.switchOn();
  //   }
  //   else if (state.off && !socket4.isSwitchedOff()) {
  //     socket4.switchOff();
  //   }
  // }, ON_CHANGE_QUICK_DEBOUNCE_TIME);

  // socket4.onChange = debounce((state: SocketState) => {
  //   if (state.on && !socket2.isSwitchedOn()) {
  //     socket2.switchOn();
  //   }
  //   else if (state.off && !socket2.isSwitchedOff()) {
  //     socket2.switchOff();
  //   }
  // }, ON_CHANGE_QUICK_DEBOUNCE_TIME);

  // addScheduledTrigger(
  //   'socket2 [off]',
  //   () => socket2.switchOff(),
  //   { scheduled: 'atFixedTime', hour: 0, minute: 0 });

  addScheduledTrigger(
    'shutterBedroom [sunrise]',
    () => shutterBedroom.open(),
    { scheduled: 'beforeSunrise', minutes: 30 });

  addScheduledTrigger(
    'shutterGarage [sunset]',
    () => shutterGarage.close(),
    { scheduled: 'afterSunset', minutes: 30 });

  addScheduledTrigger(
    'shutterGarage [sunrise]',
    () => shutterGarage.open(),
    { scheduled: 'beforeSunrise', minutes: 30 });

  addScheduledTrigger(
    'storeTemperatureHumidity',
    async () => {
      await storeTemperatureHumidity(
        sensorTemperatureGarage,
        sensorTemperaturePenthouse,
        sensorTemperatureOutside,
        sensorTemperatureBathroomUpstairs,
        sensorTemperatureOrangeRoom,
        sensorTemperatureLivingRoom,
      );
      await storeFanState(fanToiletDownstairs, fanBathroomUpstairs);
    },
    {
      scheduled: 'every',
      hours: 3,
    },
  );

  addDelayedTrigger(
    'storeFanState [initial]',
    () => storeFanState(fanToiletDownstairs, fanBathroomUpstairs),
    {
      seconds: 5,
    });

  return Component.ALL_COMPONENTS;
}

function isQuietTime(): boolean {
  const now = new Date();
  return (now.getHours() > QUIET_SINCE.hour || (now.getHours() === QUIET_SINCE.hour && now.getMinutes() >= QUIET_SINCE.minute))
    || (now.getHours() < QUIET_UNTIL.hour || (now.getHours() === QUIET_UNTIL.hour && now.getMinutes() <= QUIET_UNTIL.minute));
}
