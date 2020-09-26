import { Service, PlatformAccessory, Characteristic } from 'homebridge';
import { YamahaRXV585Platform } from './platform';
import { YamahaAction, YamahaActionValue } from './yamahaAVRAPI';

/**
 * Platform Accessory:
 * A Yamaha RX-V585 TV Speaker.
 */
export class YamahaTVSpeaker {
  private service: Service;
  private readonly platform: YamahaRXV585Platform;
  private readonly accessory: PlatformAccessory;
  private readonly isZoneB: boolean;
  
  constructor(platform, accessory, isZoneB) {
    this.platform = platform;
    this.accessory = accessory;
    this.isZoneB = isZoneB;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Yamaha')
      .setCharacteristic(this.platform.Characteristic.Model, 'RX-V585')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial');
    
    // get the TelevisionSpeaker service if it exists, otherwise create a new TelevisionSpeaker service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.TelevisionSpeaker) || 
                    this.accessory.addService(this.platform.Service.TelevisionSpeaker);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // Create handlers for required characteristics.
    this.service.getCharacteristic(this.platform.Characteristic.Mute)
      .on('get', this.handleMuteGet.bind(this))
      .on('set', this.handleMuteSet.bind(this));

    // Create handlers for optional characteristics.
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.handleActiveGet.bind(this))
      .on('set', this.handleActiveSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Volume)
      .on('get', this.handleVolumeGet.bind(this))
      .on('set', this.handleVolumeSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .on('set', this.handleVolumeSelectorSet.bind(this));
  }

  /**
   * Handle requests to get the current value of the "Mute" characteristic.
   */
  handleMuteGet(callback) {
    this.platform.log.debug('Triggered GET Mute');

    this.platform.yamahaAVRAPI.postReceiverGetAction(YamahaAction.MUTE, this.isZoneB).then((answer: string) => {
      callback(null, answer === YamahaActionValue.ON);
    });
  }

  /**
   * Handle requests to set the "Mute" characteristic.
   */
  handleMuteSet(value, callback) {
    this.platform.log.debug(`Triggered SET Mute: ${value}`);

    const actionValue = value ? YamahaActionValue.ON : YamahaActionValue.OFF;
    this.platform.yamahaAVRAPI.postReceiverSetAction(YamahaAction.MUTE, actionValue, this.isZoneB).then(() => {
      callback(null);
    });
  }

  /**
   * Handle requests to get the current value of the "Active" characteristic.
   */
  handleActiveGet(callback) {
    this.platform.log.debug('Triggered GET Active');

    this.platform.yamahaAVRAPI.postReceiverGetAction(YamahaAction.POWER, this.isZoneB).then((answer: string) => {
      callback(null, answer === YamahaActionValue.ON ? 1 : 0);
    });
  }

  /**
   * Handle requests to set the "Active" characteristic.
   */
  handleActiveSet(value, callback) {
    this.platform.log.debug(`Triggered SET Active: ${value}`);

    const actionValue = value === this.platform.Characteristic.Active.ACTIVE ? YamahaActionValue.ON : YamahaActionValue.STANDBY;
    this.platform.yamahaAVRAPI.postReceiverSetAction(YamahaAction.POWER, actionValue, this.isZoneB).then(() => {
      callback(null);
    });
  }

  /**
   * Handle requests to get the current value of the "Volume" characteristic.
   */
  handleVolumeGet(callback) {
    this.platform.log.debug('Triggered GET Volume');

    this.platform.yamahaAVRAPI.postReceiverGetAction(YamahaAction.VOLUME_GET, this.isZoneB).then((answer: string) => {
      const currentVolume = parseInt(answer);

      // To calculate a percentage (0 - 100) of volume we do ((current - minimum) / (maximum - minimum)).
      let volume = ((currentVolume - this.platform.minVolume) / (this.platform.maxVolume - this.platform.minVolume)) * 100;
      volume = Math.round(volume);

      callback(null, volume);
    });
  }

  /**
   * Handle requests to set the "Volume" characteristic.
   */
  handleVolumeSet(value, callback) {
    this.platform.log.debug(`Triggered SET Volume: ${value}`);

    // We need to translate from 0 - 100 to our receiver's scale.
    // We do this by: minimum + ((maximum - minimum) * (value / 100))
    // Then we devide by 10, round and multiply by 10 again. This is done since -301 is not a valid number (should be -300 or -305).
    let volume = this.platform.minVolume + ((this.platform.maxVolume - this.platform.minVolume) * (value / 100));
    volume = Math.round(volume / 10) * 10;    
    
    this.platform.yamahaAVRAPI.postReceiverSetAction(YamahaAction.VOLUME_SET_VALUE, volume, this.isZoneB).then(() => {
      callback(null);
    });
  }

  /**
   * Handle requests to set the "VolumeSelector" characteristic.
   */
  handleVolumeSelectorSet(value, callback) {
    this.platform.log.debug(`Triggered SET VolumeSelector: ${value}`);

    const actionValue = value === this.platform.Characteristic.VolumeSelector.INCREMENT ? YamahaActionValue.UP : YamahaActionValue.DOWN;  
    this.platform.yamahaAVRAPI.postReceiverSetAction(YamahaAction.VOLUME_SET_UP_DOWN, actionValue, this.isZoneB).then(() => {
      callback(null);
    });
  }
}