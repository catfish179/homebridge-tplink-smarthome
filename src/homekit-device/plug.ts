import type { Plug } from 'tplink-smarthome-api';

import HomeKitDevice from '.';
import type TplinkSmarthomePlatform from '../platform';
import { isObjectLike } from '../utils';

export default class HomeKitDevicePlug extends HomeKitDevice {
  constructor(platform: TplinkSmarthomePlatform, readonly tplinkDevice: Plug) {
    super(platform, tplinkDevice);

    this.addBasicCharacteristics();

    if (tplinkDevice.supportsDimmer) {
      this.addBrightnessCharacteristics();
    }
    if (tplinkDevice.supportsEmeter) {
      this.addEnergyCharacteristics();
    }
  }

  private addBasicCharacteristics(): void {
    this.addCharacteristic(this.platform.Characteristic.On, {
      getValue: async () => {
        return this.tplinkDevice.getPowerState();
      },
      setValue: async (value) => {
        if (typeof value === 'boolean') {
          await this.tplinkDevice.setPowerState(value);
          return;
        }
        this.log.warn('setValue: Invalid On:', value);
      },
    });
    this.tplinkDevice.on('power-on', () => {
      this.fireCharacteristicUpdateCallback(
        this.platform.Characteristic.On,
        true
      );
    });
    this.tplinkDevice.on('power-off', () => {
      this.fireCharacteristicUpdateCallback(
        this.platform.Characteristic.On,
        false
      );
    });

    this.addCharacteristic(this.platform.Characteristic.OutletInUse, {
      getValue: async () => {
        return this.tplinkDevice.getInUse().then((value) => {
          return value;
        });
      },
    });
    this.tplinkDevice.on('in-use', () => {
      this.fireCharacteristicUpdateCallback(
        this.platform.Characteristic.OutletInUse,
        true
      );
    });
    this.tplinkDevice.on('not-in-use', () => {
      this.fireCharacteristicUpdateCallback(
        this.platform.Characteristic.OutletInUse,
        false
      );
    });
  }

  private addBrightnessCharacteristics(): void {
    this.addCharacteristic(this.platform.Characteristic.Brightness, {
      getValue: async () => {
        const sysinfo = await this.tplinkDevice.getSysInfo();
        return sysinfo.brightness;
      },
      setValue: async (value) => {
        if (typeof value === 'number') {
          await this.tplinkDevice.dimmer.setBrightness(value);
          return;
        }
        this.log.warn('setValue: Invalid Brightness:', value);
      },
    });
    // TODO: event for brightness change
    // this.tplinkDevice.on('power-on', () => { this.fireCharacteristicUpdateCallback(Characteristic.On, true); });
    // this.tplinkDevice.on('power-off', () => { this.fireCharacteristicUpdateCallback(Characteristic.On, false); });
  }

  private addEnergyCharacteristics(): void {
    const emeterGetValue = (
      characteristicName: string,
      emeterProperties: string[]
    ): (() => Promise<number | null>) => {
      return async (): Promise<number | null> => {
        const emeterRealtime = await this.tplinkDevice.emeter.getRealtime();
        if (!isObjectLike(emeterRealtime)) {
          this.log.warn(
            `getValue: Invalid ${characteristicName}:`,
            typeof emeterRealtime
          );
          return null;
        }

        let invalid = false;
        emeterProperties.forEach((prop) => {
          if (typeof emeterRealtime[prop] !== 'number') {
            invalid = true;
            this.log.warn(
              `Invalid ${characteristicName} value:`,
              `${prop}:`,
              emeterRealtime[prop]
            );
          }
        });
        if (invalid) return null;

        if (emeterProperties.length === 1) {
          // return value if one property
          return emeterRealtime[emeterProperties[0]] as number;
        }
        if (emeterProperties.length > 1) {
          // return product of values if multiple properties
          return (
            emeterProperties
              // @ts-ignore : safe
              .map((prop) => emeterProperties[prop] as number)
              .reduce((acc, val) => acc * val, 1)
          );
        }

        return null;
      };
    };

    this.addCharacteristic(this.platform.customCharacteristics.Amperes, {
      getValue: emeterGetValue('Amperes', ['current']),
    });

    this.addCharacteristic(this.platform.customCharacteristics.KilowattHours, {
      getValue: emeterGetValue('KilowattHours', ['total']),
    });

    this.addCharacteristic(this.platform.customCharacteristics.VoltAmperes, {
      getValue: emeterGetValue('VoltAmperes', ['voltage', 'current']),
    });

    this.addCharacteristic(this.platform.customCharacteristics.Volts, {
      getValue: emeterGetValue('Volts', ['voltage']),
    });

    this.addCharacteristic(this.platform.customCharacteristics.Watts, {
      getValue: emeterGetValue('Watts', ['power']),
    });

    this.tplinkDevice.on('emeter-realtime-update', (emeterRealtime) => {
      this.fireCharacteristicUpdateCallback(
        this.platform.customCharacteristics.Amperes,
        emeterRealtime.current
      );
      this.fireCharacteristicUpdateCallback(
        this.platform.customCharacteristics.KilowattHours,
        emeterRealtime.total
      );
      this.fireCharacteristicUpdateCallback(
        this.platform.customCharacteristics.VoltAmperes,
        emeterRealtime.voltage * emeterRealtime.current
      );
      this.fireCharacteristicUpdateCallback(
        this.platform.customCharacteristics.Volts,
        emeterRealtime.voltage
      );
      this.fireCharacteristicUpdateCallback(
        this.platform.customCharacteristics.Watts,
        emeterRealtime.power
      );
    });
  }

  identify(): void {
    this.log.info(`[${this.name}] identify`);
    this.tplinkDevice
      .blink(1, 500)
      .then(() => {
        return this.tplinkDevice.blink(2, 500);
      })
      .then(() => {
        this.log.debug(`[${this.name}] identify done`);
      })
      .catch((reason) => {
        this.log.error(`[${this.name}] identify error`);
        this.log.error(reason);
      });
  }
}
