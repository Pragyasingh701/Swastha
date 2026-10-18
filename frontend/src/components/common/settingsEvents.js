// The Settings window is mounted once, by the profile menu in the page header.
// Anything else that wants it open (the sidebar's Settings link) asks for it here.
export const OPEN_SETTINGS_EVENT = "swastha:open-settings";

export function openSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
