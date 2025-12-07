import { CH1, CH2, xikibotInstance } from './global';
import { updateComponentHistory } from './storage';
import { addDelayedTrigger, clearTriggers, Delay } from './trigger';

export type StateType = SwitchState | SwitchExclusive2ChannelState | ButtonState | ShutterState | TemperatureHumiditySensorSate;

export type Channels2Type = typeof CH1 | typeof CH2;

export interface ComponentInfo {
  /**
   * The friendly name configured in Z2M.
   */
  name: string;

  /**
   * Xikibot's internal id meant to be unique over the time and to be used when storing measures or data of the device.
   *
   * The problem of the deviceId of Z2M is that it could change if the physical device is replaced. Instead, the
   * `persistentId` is used when storing measures, keeping a reference to the real device id in the table
   * `ComponentHistory`. If the physical device is replaced at some point a new entry will be added automatically in
   * `ComponentHistory` causing no disruptions.
   */
  persistentId?: number;

  /**
   * Location, for information purposes.
   */
  location?: string | string[];
}

export enum ComponentPresence {
  removed = 0,
  active = 1,
  notFound = 2,
  disabled = 3,
}

export abstract class Component<T extends StateType = StateType> implements ComponentInfo {
  public static readonly ALL_COMPONENTS: Component[] = [];

  public readonly name: string;
  public readonly persistentId?: number;
  public readonly location?: string | string[];

  public onChange?(state: T): void;

  private previousPresence: ComponentPresence | null = null;

  constructor(
    info: ComponentInfo,
    public readonly stateParser: new (payload: string | KeyValue | null) => T,
  ) {
    this.name = info.name;
    this.persistentId = info.persistentId;
    this.location = info.location;

    Component.ALL_COMPONENTS.push(this);
  }

  public get deviceId(): string | undefined {
    return xikibotInstance!.getDevice(this.name)?.ID;
  }

  public get active(): boolean {
    return this.getPresence() === ComponentPresence.active;
  }

  public getPresence(): ComponentPresence {
    const device = xikibotInstance!.getDevice(this.name);
    const presence = device
      ? device.options.disabled === true
        ? ComponentPresence.disabled
        : ComponentPresence.active
      : ComponentPresence.notFound;

    if (this.previousPresence !== presence) {
      if (this.previousPresence != null) {
        updateComponentHistory(); // Do not await
      }
      this.previousPresence = presence;
    }

    return presence;
  }

  protected getState(): T {
    return new this.stateParser(xikibotInstance!.getState(this.name));
  }
}

export class SwitchState {
  private readonly state: string;

  public get on(): boolean {
    return this.state === 'ON';
  }

  public get off(): boolean {
    return this.state === 'OFF';
  }

  constructor(payload: string | KeyValue | null) {
    this.state = parseIfString(payload)?.state?.toUpperCase();
  }
}

export class SwitchComponent extends Component<SwitchState> {
  constructor(info: ComponentInfo) {
    super(info, SwitchState);
  }

  public switchOn(onTime?: Delay): void {
    xikibotInstance!.emitMessage({ state: 'ON' }, this.name, 'set');
    if (onTime) {
      addDelayedTrigger(
        this.name,
        () => this.switchOff(),
        onTime,
        { keepLatest: true },
      );
    }
    else {
      clearTriggers(this.name);
    }
  }

  public switchOff(): void {
    xikibotInstance!.emitMessage({ state: 'OFF' }, this.name, 'set');
    clearTriggers(this.name);
  }

  public delayedSwitchOff(delay: Delay): void {
    if (this.isSwitchedOff()) {
      return;
    }
    addDelayedTrigger(
      this.name,
      () => this.switchOff(),
      delay,
      { keepLatest: true },
    );
  }

  public switchToggle(): void {
    xikibotInstance!.emitMessage({ state: 'TOGGLE' }, this.name, 'set');
  }

  public isSwitchedOn(): boolean {
    return this.getState().on;
  }

  public isSwitchedOff(): boolean {
    return this.getState().off;
  }
}

export class SwitchExclusive2ChannelState {
  private readonly [CH1]: string;
  private readonly [CH2]: string;

  public get on(): boolean {
    return this[CH1] === 'ON' || this[CH2] === 'ON';
  }

  public get off(): boolean {
    return this[CH1] === 'OFF' && this[CH2] === 'OFF';
  }

  public isOn(channel: Channels2Type): boolean {
    return this[channel] === 'ON';
  }

  public isOff(channel: Channels2Type): boolean {
    return this[channel] === 'OFF';
  }

  constructor(payload: string | KeyValue | null) {
    const payloadObj = parseIfString(payload);
    this[CH1] = payloadObj?.[CH1]?.toUpperCase();
    this[CH2] = payloadObj?.[CH2]?.toUpperCase();
  }
}

export class SwitchExclusive2ChannelComponent extends Component<SwitchExclusive2ChannelState> {
  private static readonly PAYLOAD_OFF = { [CH1]: 'OFF', [CH2]: 'OFF' };
  private readonly levelChannel: Map<number, Channels2Type>;

  constructor(info: ComponentInfo & { channelLevel: Record<Channels2Type, number> }) {
    super(info, SwitchExclusive2ChannelState);
    this.levelChannel = new Map(Object.entries(info.channelLevel)
      .sort(([, levelA], [, levelB]) => levelB - levelA) // Reverse order
      .map(([channel, level]) => [level, channel as Channels2Type]),
    );
  }

  public switchOn(channel: Channels2Type, onTime?: Delay): void {
    xikibotInstance!.emitMessage({ ...SwitchExclusive2ChannelComponent.PAYLOAD_OFF, [channel]: 'ON' }, this.name, 'set');
    if (onTime) {
      addDelayedTrigger(
        this.name,
        () => this.switchOff(),
        onTime,
        { keepLatest: true },
      );
    }
    else {
      clearTriggers(this.name);
    }
  }

  public switchOff(): void {
    xikibotInstance!.emitMessage(SwitchExclusive2ChannelComponent.PAYLOAD_OFF, this.name, 'set');
    clearTriggers(this.name);
  }

  public delayedSwitchOff(delay: Delay): void {
    if (this.isSwitchedOff()) {
      return;
    }
    addDelayedTrigger(
      this.name,
      () => this.switchOff(),
      delay,
      { keepLatest: true },
    );
  }

  public isSwitchedOn(channel?: Channels2Type): boolean {
    return channel ? this.getState().isOn(channel) : this.getState().on;
  }

  public isSwitchedOff(channel?: Channels2Type): boolean {
    return channel ? this.getState().isOff(channel) : this.getState().off;
  }

  public switchedOnChannel(): Channels2Type | null {
    const state = this.getState();
    for (const [, channel] of this.levelChannel) {
      if (state.isOn(channel)) {
        return channel;
      }
    }
    return null;
  }

  public switchedOnChannelLevel(): number {
    const state = this.getState();
    for (const [level, channel] of this.levelChannel) {
      if (state.isOn(channel)) {
        return level;
      }
    }
    return 0;
  }
}

export class ButtonState {
  private readonly action: string;

  public get singlePress(): boolean {
    return this.action === 'press_once' /* Legrand ZLGP17 (Green power) */
      || this.action === 'single';
  }

  public get doublePress(): boolean {
    return this.action === 'press_twice' /* Legrand ZLGP17 (Green power) */
      || this.action === 'double';
  }

  public get longPress(): boolean {
    return this.action === 'long' /* SONOFF SNZB-01P */
      || this.action === 'up_hold' /* Legrand ZLGP17 (Green power) */
      || this.action === 'down_hold' /* Legrand ZLGP17 (Green power) */
      || this.action === 'hold';
  }

  constructor(payload: string | KeyValue | null) {
    this.action = parseIfString(payload)?.action?.toLowerCase();
  }
}

export class ButtonComponent extends Component<ButtonState> {
  constructor(info: ComponentInfo) {
    super(info, ButtonState);
  }
}

export class ShutterState {
  private readonly state: string;
  private readonly _position: number; // Between 0 (closed) and 100 (open)

  public get open(): boolean {
    return this.state === 'OPEN';
  }

  public get closed(): boolean {
    return this.state === 'CLOSE';
  }

  public get position(): number | null {
    return Number.isNaN(this._position) ? null : this._position;
  }

  constructor(payload: string | KeyValue | null) {
    const payloadObj = parseIfString(payload);
    this.state = payloadObj?.state?.toUpperCase();
    this._position = payloadObj?.position;
  }
}

export class ShutterComponent extends Component<ShutterState> {
  constructor(info: ComponentInfo) {
    super(info, ShutterState);
  }

  public open(): void {
    xikibotInstance!.emitMessage({ state: 'OPEN' }, this.name, 'set');
  }

  public close(): void {
    xikibotInstance!.emitMessage({ state: 'CLOSE' }, this.name, 'set');
  }

  public isOpen(): boolean {
    return this.getState().open;
  }

  public isClosed(): boolean {
    return this.getState().closed;
  }
}

export class TemperatureHumiditySensorSate {
  private readonly _temperature: number | null;
  private readonly _humidity: number | null;

  public get temperature(): number | null {
    return this._temperature;
  }

  public get humidity(): number | null {
    return this._humidity;
  }

  constructor(payload: string | KeyValue | null) {
    const payloadObj = parseIfString(payload);
    this._temperature = payloadObj?.temperature ?? null;
    this._humidity = payloadObj?.humidity ?? null;
  }
}

export class TemperatureHumiditySensorComponent extends Component<TemperatureHumiditySensorSate> {
  constructor(info: ComponentInfo) {
    super(info, TemperatureHumiditySensorSate);
  }

  getTemperatureHumidity(): TemperatureHumiditySensorSate {
    return this.getState();
  }
}

export class SocketState extends SwitchState {
}

export class SocketComponent extends Component<SocketState> implements SwitchComponent {
  constructor(info: ComponentInfo) {
    super(info, SocketState);
  }

  public switchOn = SwitchComponent.prototype.switchOn;
  public switchOff = SwitchComponent.prototype.switchOff;
  public delayedSwitchOff = SwitchComponent.prototype.delayedSwitchOff;
  public switchToggle = SwitchComponent.prototype.switchToggle;
  public isSwitchedOn = SwitchComponent.prototype.isSwitchedOn;
  public isSwitchedOff = SwitchComponent.prototype.isSwitchedOff;
}

export function checkComponents(): Record<string, { presence: ComponentPresence }> {
  return Object.fromEntries(Component.ALL_COMPONENTS.map(
    component => [component.name, { presence: component.getPresence() }]));
}

function parseIfString(payload: string | KeyValue | null): KeyValue | null {
  if (typeof payload === 'string') {
    return JSON.parse(payload);
  }
  else {
    return payload;
  }
}
