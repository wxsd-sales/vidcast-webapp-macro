export class PlayerController {
  /**
   * @param {MultiWebRTCDataConnection} connection - Either 'player' or 'controls'.
   */
  constructor( connection) {
  
    this.connection = connection;

    this.connection.on("message", ({ data }) => {
      // console.log("player controller received message:", data);
      const { control, player } = JSON.parse(data);

      if (control) return this._handleControlEvent(control);
    });
  }

  _handleControlEvent(event) {
     console.log("processing controller event:", event, this.player);

    if(!this.player) return
    switch (event.type) {
      case "play":
        console.log("Setting player to playing");
        this.player.play();
        break;
      case "pause":
        console.log("Setting player to pause");
        this.player.pause();
        break;
      case "seek":
        this.player.currentTime = parseInt(event.time);
        break;
      case "volume":
        this.player.volume = event.volume;
        break;
    }
  }

  controlPlayer(player){

    if(this.player){
      console.log('replacing video element')
      player.pause();
    player.removeAttribute('src'); // empty source
    player.load();
    this.player = null
  }
    console.log('subscribbing to player events', player)
    this.player = player;
    const events = ["onplay", "onpause", "onended", "onprogress"];

    events.forEach((eventType) => {
      this.player.addEventListener(eventType, (event) => {
        console.log('player event received', eventType, event)
        this.connection.sendMessageToAll({
          player: { type: eventType, event }
        });
      });
    });
  }
}
