// Config plugin: the Info.plist entries MusicKit playback needs.
const { withInfoPlist } = require("expo/config-plugins");

const DEFAULT_USAGE = "kwamz radio plays your radios through Apple Music.";

/** @type {import('expo/config-plugins').ConfigPlugin<{ usageDescription?: string } | void>} */
const withKwamzMusicKit = (config, props) =>
  withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;
    plist.NSAppleMusicUsageDescription = props?.usageDescription ?? DEFAULT_USAGE;
    // Keep playing with the screen locked or the app in the background.
    const modes = new Set(plist.UIBackgroundModes ?? []);
    modes.add("audio");
    plist.UIBackgroundModes = [...modes];
    return cfg;
  });

module.exports = withKwamzMusicKit;
