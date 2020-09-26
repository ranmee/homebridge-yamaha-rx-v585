import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from 'homebridge';
import { parse as js2xmlParse } from 'js2xmlparser';
import { Parser as Xml2JsParser } from 'xml2js';

const zoneIdentifier = '$ZONE$';

export enum YamahaAction {
  POWER = 'POWER',
  VOLUME_SET_UP_DOWN = 'VOLUME_SET_UP_DOWN',
  VOLUME_SET_VALUE = 'VOLUME_SET_VALUE',
  VOLUME_GET = 'VOLUME_GET',
  MUTE = 'MUTE'
}

const YamahaActionStructures = {
  POWER: ['Power_Control', 'Power'], // On or Standby
  VOLUME_SET_UP_DOWN: ['Volume', zoneIdentifier, 'Val.Exp.Unit'], // Up or Down
  VOLUME_SET_VALUE: ['Volume', zoneIdentifier, 'Lvl', 'Val.Exp=1.Unit=dB'], // Number value
  VOLUME_GET: ['Volume', zoneIdentifier, 'Lvl'], // GetParam
  MUTE: ['Volume', zoneIdentifier, 'Mute'], // On or Off
};

export enum YamahaActionValue {
  ON = 'On',
  STANDBY = 'Standby',
  OFF = 'Off',
  UP = 'Up',
  DOWN = 'Down',
  GET = 'GetParam',
}

enum YamahaCommand {
  SET = 'PUT',
  GET = 'GET'
}

/**
 * A Yamaha AV Receiver API class.
 */
export class YamahaAVRAPI {
  private readonly api: AxiosInstance;
  private readonly logger: Logger;

  private readonly baseUrl: string;
  private readonly zoneBName: string;
  
  constructor(receiverIP: string, logger: Logger, zoneBName?: string) {
    this.baseUrl = 'http://' + receiverIP + '/YamahaRemoteControl/ctrl';
    this.zoneBName = zoneBName || 'Zone_B';

    this.logger = logger;

    this.api = axios.create({
      baseURL: this.baseUrl,
    });
  }

  private getRequestConfig(): AxiosRequestConfig {
    return {
      responseType: 'document',
      headers: {'Content-Type': 'text/xml'},
    };
  }

  private buildRequestData(command: YamahaCommand, action: YamahaAction, actionValue: YamahaActionValue | number, isZoneB = false) {
    // Create a basic json data object that we will turn to XML after adding the action data.
    const data = {
      '@': {
        cmd: command,
      },
      Main_Zone: {},
    };

    // Now we go over node names to add according to the given action and known action structure.
    let lastNode = data.Main_Zone;
    for (let i = 0; i < YamahaActionStructures[action].length; i++) {
      const nodeString = YamahaActionStructures[action][i];
      let nodeStringValue = nodeString;
      
      // Check if this node is a zone space-saver.
      if (nodeString === zoneIdentifier) {
        if (!isZoneB) {
          // If we're not action on a zone, the special zone identifier node should be skipped.
          continue;
        } else {
          // We are in a zone! Replace the identifier with the zone name
          nodeStringValue = this.zoneBName;
        }
      }

      // Power is a special case with zones...
      if (isZoneB && nodeString === 'Power') {
        nodeStringValue = this.zoneBName + '_' + nodeString;
      }

      // The node string can represent multiple neighboring nodes. We unpack and add them all.
      const nodeNames = nodeStringValue.split('.');

      for (const nodeName of nodeNames) {
        if (nodeName.includes('=')) {
          // The node name also contains a value to set. Set the node to the value.
          const nodeNameParts = nodeName.split('=');
          lastNode[nodeNameParts[0]] = nodeNameParts[1];
        } else {
          // The node name doesn't contain a value to set, just a name. Set as an empty object.
          lastNode[nodeName] = {};
        }

      }
      if (i + 1 === YamahaActionStructures[action].length) {
        // We're done. Set the action value to the last node.
        lastNode[nodeNames[0]] = actionValue;
      }

      // The first node name is the one we will keep adding into.
      lastNode = lastNode[nodeNames[0]];
    }
    
    // Transform the created json to XML.
    const xmlOptions = {
      declaration: {
        include: true,
        encoding: 'utf-8',
      },
      format: {
        doubleQuotes: true,
        pretty: false,
      },
    };
    const xmlData = js2xmlParse('YAMAHA_AV', data, xmlOptions);

    this.logger.debug(`Sending: ${xmlData}`);

    return xmlData;
  }

  private retrieveResponseData(innerData, action: YamahaAction, isZoneB = false) {
    // Now we go over node names to find according to the given action and known action structure.
    let lastNode = innerData;
    for (const nodeString of YamahaActionStructures[action]) {
      let nodeStringValue = nodeString;
      
      // Check if this node is a zone space-saver.
      if (nodeString === zoneIdentifier) {
        if (!isZoneB) {
          // If we're not action on a zone, the special zone identifier node should be skipped.
          continue;
        } else {
          // We are in a zone! Replace the identifier with the zone name
          nodeStringValue = this.zoneBName;
        }
      }

      // Power is a special case with zones...
      if (isZoneB && nodeString === 'POWER') {
        nodeStringValue = this.zoneBName + '_' + nodeString;
      }

      // The node string can represent multiple neighboring nodes. We unpack and take the first one.
      const nodeNames = nodeStringValue.split('.');
      // The node name can also contain a value seperated with '='. Ignore it and only take the name.
      const nodeName = nodeNames[0].split('=')[0];

      lastNode = lastNode[nodeName];
    }

    // We finished traversing the inner data object. The value should be the last node still standing.
    return lastNode;
  }

  private async parseXmlResponse(xml: string, action: YamahaAction, isZoneB = false) {
    const parser = new Xml2JsParser({ ignoreAttrs: true, explicitArray: false });
    return await parser.parseStringPromise(xml).then((result) => {
      // Return the part in the json that we care about.
      return this.retrieveResponseData(result.YAMAHA_AV.Main_Zone, action, isZoneB);
    });
  }

  public async postReceiverSetAction(action: YamahaAction, actionValue: YamahaActionValue | number, isZoneB = false) {
    const data = this.buildRequestData(YamahaCommand.SET, action, actionValue, isZoneB);

    this.logger.info(`Posting receiver set action. Action ${action}, value: ${actionValue}, isZoneB: ${isZoneB}`);
    try {
      const response = await this.api.post('', data, this.getRequestConfig());
      return await this.parseXmlResponse(response.data, action, isZoneB);

    } catch (e) {
      this.logger.error('Failed sending request to Yamaha Receiver.');
      this.logger.error(e);
      return null;
    }
  }

  public async postReceiverGetAction(action: YamahaAction, isZoneB = false) {
    const data = this.buildRequestData(YamahaCommand.GET, action, YamahaActionValue.GET, isZoneB);

    this.logger.info(`Getting receiver get action. Action ${action}, isZoneB: ${isZoneB}`);
    try {
      const response = await this.api.post('', data, this.getRequestConfig());
      this.logger.debug(`Got receiver get data: ${response.data}`);
      const value = await this.parseXmlResponse(response.data, action, isZoneB);
      this.logger.debug(`Got result for get action. Action ${action}, isZoneB: ${isZoneB}, value: ${JSON.stringify(value)}`);
      return value;

    } catch (e) {
      this.logger.error('Failed sending request to Yamaha Receiver.');
      this.logger.error(e);
      return null;
    }
  }
}
