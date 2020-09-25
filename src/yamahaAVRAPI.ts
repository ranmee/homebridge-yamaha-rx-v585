import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from 'homebridge';
import { parse as js2xmlParse } from 'js2xmlparser';
import { Parser as Xml2JsParser } from 'xml2js';

const zoneIdentifier = '$ZONE$';

export enum YamahaAction {
  POWER = 'POWER',
  VOLUME_SET = 'VOLUME_SET',
  VOLUME_GET = 'VOLUME_GET',
  MUTE = 'MUTE'
}

const YamahaActionStructures = {
  POWER: ['Power_Control', 'Power'], // On or Standby
  VOLUME_SET: ['Volume', zoneIdentifier, 'Val.Exp.Unit'], // Up or Down
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
    this.baseUrl = 'http://' + receiverIP + '/YamahaRemoteControl/ctrl/';
    this.zoneBName = zoneBName || 'ZONE_B';

    this.logger = logger;

    this.api = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
    });
  }

  private getRequestConfig(): AxiosRequestConfig {
    return {
      responseType: 'document',
      headers: {'Content-Type': 'text/xml'},
    };
  }

  private buildRequestData(command: YamahaCommand, action: YamahaAction, actionValue: YamahaActionValue, isZoneB = false) {
    // Create a basic json data object that we will turn to XML after adding the action data.
    const data = {
      '@': {
        cmd: command,
      },
      Main_Zone: {},
    };

    // Now we go over node names to add according to the given action and known action structure.
    let lastNode = data.Main_Zone;
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

      // The node string can represent multiple neighboring nodes. We unpack and add them all.
      const nodeNames = nodeStringValue.split('.');

      for (const nodeName of nodeNames) {
        lastNode[nodeName] = {};
      }
      // The first node name is the one we will keep adding into.
      lastNode = lastNode[nodeNames[0]];
    }

    // Now add the action value to the last node we visited.
    lastNode = actionValue;
    
    // Transform the created json to XML.
    const xmlData = js2xmlParse('YAMAHA_AV', data);

    this.logger.info(`Sending: ${xmlData}`);

    return xmlData;
  }

  private async parseXmlResponse(xml: string) {
    const parser = new Xml2JsParser({ ignoreAttrs: true, explicitArray: false });
    return await parser.parseStringPromise(xml).then((result) => {
      return JSON.stringify(result);
    });
  }

  public async postReceiverSetAction(action: YamahaAction, actionValue: YamahaActionValue, isZoneB = false) {
    const data = this.buildRequestData(YamahaCommand.SET, action, actionValue, isZoneB);

    this.logger.info(`Posting receiver set action. Action ${action}, value: ${actionValue}, isZoneB: ${isZoneB}`);
    const response = await this.api.post('', data, this.getRequestConfig());

    return await this.parseXmlResponse(response.data);
  }

  public async postReceiverGetAction(action: YamahaAction, isZoneB = false) {
    const data = this.buildRequestData(YamahaCommand.GET, action, YamahaActionValue.GET, isZoneB);

    this.logger.info(`Getting receiver get action. Action ${action}, isZoneB: ${isZoneB}`);
    const response = await this.api.post('', data, this.getRequestConfig());
    this.logger.info(`Got receiver get data: ${response.data}`);

    return await this.parseXmlResponse(response.data);
  }
}
