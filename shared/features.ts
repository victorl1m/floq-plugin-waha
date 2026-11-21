// What each WAHA engine can do (docs/waha-api.md section 11). An unknown engine shows everything: a 501 from WAHA then surfaces as a toast.
export type Engine = "WEBJS" | "NOWEB" | "GOWS" | "";
export interface Features {
  media: boolean; voice: boolean; poll: boolean; pollVote: boolean; location: boolean; contact: boolean;
  react: boolean; edit: boolean; deleteForEveryone: boolean; forward: boolean; star: boolean; pinMessage: boolean;
  archive: boolean; deleteChat: boolean; clearChat: boolean; markUnread: boolean;
  block: boolean; about: boolean; labels: boolean; status: boolean; channels: boolean; channelFollow: boolean; presence: boolean; calls: boolean; groups: boolean;
  pairingCode: boolean; screenshot: boolean;
}
export function featuresOf(engine: Engine): Features {
  const not = (...engines: Engine[]) => !engines.includes(engine) || engine === "";
  const only = (...engines: Engine[]) => engine === "" || engines.includes(engine);
  return {
    media: true, voice: true, poll: true, pollVote: only("WEBJS", "GOWS"), location: true, contact: true,
    react: true, edit: true, deleteForEveryone: true, forward: not("GOWS"), star: not("GOWS"), pinMessage: only("WEBJS", "NOWEB"),
    archive: not("GOWS"), deleteChat: only("WEBJS"), clearChat: only("WEBJS"), markUnread: true,
    block: only("WEBJS"), about: only("WEBJS"), labels: true, status: true, channels: true, channelFollow: only("GOWS"), presence: true, calls: true, groups: true,
    pairingCode: true, screenshot: only("WEBJS"),
  };
}
