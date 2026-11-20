import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

export default function LiveKitConference({
  credentials,
  onDisconnected,
}: {
  credentials: { serverUrl: string; token: string };
  onDisconnected: () => void;
}) {
  return (
    <LiveKitRoom
      serverUrl={credentials.serverUrl}
      token={credentials.token}
      connect
      audio
      video
      onDisconnected={onDisconnected}
      className="h-full overflow-hidden rounded-xl"
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
