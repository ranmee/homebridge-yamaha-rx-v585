import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { YamahaTVSpeaker } from './platformAccessory';
import { YamahaAVRAPI, YamahaAction } from './yamahaAVRAPI';

type YamahaDeviceInfo = {
  uuid: string
  displayName: string,
  isZoneB: boolean,
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class YamahaRXV585Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  private readonly receiverIP: string;
  private readonly zoneBConfiguredName: string;
  private readonly mainDisplayName: string;
  private readonly zoneBDisplayName: string;
  
  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public readonly yamahaAVRAPI: YamahaAVRAPI;

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // Get the receiver's IP  and Zone B name as the user configured.
    this.receiverIP = config['receiverIP'] as string;
    this.zoneBConfiguredName = config['zoneBConfiguredReceiverName'] as string;
    this.mainDisplayName = config['mainDisplayName'] as string;
    this.zoneBDisplayName = config['zoneBDisplayName'] as string;
    this.yamahaAVRAPI = new YamahaAVRAPI(this.receiverIP, this.log, this.zoneBConfiguredName);
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    // Send a basic power response, to see if we get a response which will indicate we discovered the receiver.
    this.yamahaAVRAPI.postReceiverGetAction(YamahaAction.POWER).then(data => {
      if (data?.Power_Control?.Power) {
        // We found the receiver. Let's register it as two devices: main and zone b.
        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address.
        const mainUuid = this.api.hap.uuid.generate(this.receiverIP);
        const zonebUuid = this.api.hap.uuid.generate(this.receiverIP + this.zoneBConfiguredName);

        const devices: YamahaDeviceInfo[] = [
          {uuid: mainUuid, displayName: this.mainDisplayName, isZoneB: false}, // The main zone device.
          {uuid: zonebUuid, displayName: this.zoneBDisplayName, isZoneB: true}, // The zone B device.
        ];
        
        // loop over the discovered devices and register each one if it has not already been registered
        for (const device of devices) {
          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === device.uuid);

          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            // existingAccessory.context.device = device;
            // this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            new YamahaTVSpeaker(this, existingAccessory, device.isZoneB);

          } else {
            // the accessory does not yet exist, so we need to create it
            this.log.info('Adding new accessory:', device.displayName);

            // create a new accessory
            const accessory = new this.api.platformAccessory(device.displayName, device.uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new YamahaTVSpeaker(this, accessory, device.isZoneB);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }

          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

      } else {
        // No receiver found. Log an error and finish.
        this.log.error('Couldn\'t find receiver. Please check the receiverIP is configured correctly.');
      }
    });
  }
}
