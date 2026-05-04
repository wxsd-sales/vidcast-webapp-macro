export class PlayerController {
  /**
   * @param {MultiWebRTCDataConnection} connection - Either 'player' or 'controls'.
   */
  constructor(connection) {
    this.connection = connection;
    this.player = null;
    this.unsubscribePlayerEvents = null;

    this.connection.on("message", ({ data }) => {
      // console.log("player controller received message:", data);
      let message;
      try {
        message = JSON.parse(data);
      } catch (error) {
        console.warn("Invalid player controller message JSON:", data);
        return;
      }

      const { control, player } = message;

      if (control) return this._handleControlEvent(control);
      if (player) return;
    });
  }

  _handleControlEvent(event) {
    if (!this.player) return;
    switch (event.type) {
      case "play":
        console.log("Setting player to playing");
        Promise.resolve(this.player.play()).catch((error) => {
          console.warn("Unable to play video:", error);
          this.sendCurrentState("play-error");
        });
        break;
      case "pause":
        console.log("Setting player to pause");
        this.player.pause();
        break;
      case "seek":
        this.player.currentTime = toFiniteNumber(
          event.time,
          this.player.currentTime,
        );
        break;
      case "volume":
        this.player.volume = event.volume;
        break;
    }

    this.sendCurrentState(event.type);
  }

  controlPlayer(player) {
    if (this.player === player) {
      this.sendCurrentState("attached");
      return;
    }

    if (this.unsubscribePlayerEvents) this.unsubscribePlayerEvents();

    this.player = player;
    const events = [
      "loadedmetadata",
      "durationchange",
      "play",
      "pause",
      "timeupdate",
      "seeked",
      "ended",
      "volumechange",
      "ratechange",
    ];
    const handlePlayerEvent = (event) => {
      this.sendCurrentState(event.type);
    };

    events.forEach((eventType) => {
      this.player.addEventListener(eventType, handlePlayerEvent);
    });

    this.unsubscribePlayerEvents = () => {
      events.forEach((eventType) => {
        player.removeEventListener(eventType, handlePlayerEvent);
      });
    };

    this.sendCurrentState("attached");
  }

  sendCurrentState(type = "state") {
    if (!this.player) return;

    this.connection.sendMessageToAll({
      player: this.getCurrentState(type),
    });
  }

  getCurrentState(type = "state") {
    if (!this.player) return null;

    return {
      type,
      currentTime: toFiniteNumber(this.player.currentTime, 0),
      duration: Number.isFinite(this.player.duration)
        ? this.player.duration
        : 0,
      paused: Boolean(this.player.paused),
      playing: !this.player.paused && !this.player.ended,
      ended: Boolean(this.player.ended),
      volume: toFiniteNumber(this.player.volume, 1),
      muted: Boolean(this.player.muted),
      playbackRate: toFiniteNumber(this.player.playbackRate, 1),
      readyState: toFiniteNumber(this.player.readyState, 0),
    };
  }
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
