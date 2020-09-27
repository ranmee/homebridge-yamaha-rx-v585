
# Homebridge Yamaha RX-V585 Receiver Plugin

Install this plugin to control your Yamaha RX-V585 receiver through Homebridge.
The plugin creates 2 fan accessories: one for the main zone and one for Zone B of your receiver.
This way you can control both zones and their volume (which is the fan speed).

### Install:

```npm install -g homebridge-yamaha-rxv```

### Configure

After the install is finished, open your Homebridge settings and configure the following parameters (you can go to plugins and click on settings to have a form like experience):

- receiverIP: The IP of the Yamaha RX-V585 receiver in your local network.
- zoneBConfiguredReceiverName: The name of Zone B as configured in your receiver. Defaults to Zone_B. This is the name the receiver calls your zone. Do not confuse with the display name of the zone. If the receiver isn't heavily configured, this can probably remain the default value.
- mainDisplayName: The name to set to the main zone. Defaults to Main. I called it "Speakers" then attached it to a room. Then you can tell Siri to: "Turn on living room speakers". This is also configurable in Apple's Home app.
- zoneBDisplayName: The name to set to zone B. Defaults to Zone B. Same concept as mainDisplayName, but for zone B.
- minVolume: The minimum volume of the receiver. For 0-100% volume calculations (since that's the bar you'll see in the Home app). Defaults to -70.
- maxVolume: The maximum volume of the receiver. For 0-100% calculations (since that's the bar you'll see in the Home app). Defaults to 10.


That's it. You will now see your 2 receiver zones in your Home app as lovely fans (don't forget to add your homebridge to you home app).


### Notice

This plugin was written (and tested) only for Yamaha RX-V585 Receiver. Should probably NOT work on other models.
