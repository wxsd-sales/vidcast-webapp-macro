export class MultiWebRTCDataConnection {
  /**
   * @param {object} xapi - An instance of the xAPI codec connection (jsxapi).
   * @param {string} mode - Either 'player' or 'controls'.
   */
  constructor(xapi, mode) {
    this.xapi = xapi;
    this.mode = mode;
    this.peerConnections = {};
    this.dataChannels = {};
    this.eventHandlers = {
      open: [],
      message: [],
      error: [],
    };


    if (this.mode == "controls") {
      this._createPeerConnection();
    }


    // Listen for incoming signaling messages from codec
    this.xapi.Event.Message.Send.on((event) => {
      this._handleSignalingMessage(event);
    });

    if(this.mode == 'player'){
        this.xapi.Command.Message.Send({
      Text: JSON.stringify({
        type: "playerReady"
      }),
    });
    }
  }

  // Internal method to create a peer connection and data channel
  _createPeerConnection(uuid) {
    const pc_config = {
      iceServers: [],
    };

    const index = uuid ?? self.crypto.randomUUID();

    this.peerConnections?.[index]?.close();
    this.dataChannels?.[index]?.close();

    const pc = new RTCPeerConnection(null);

    // Create data channel for sending/receiving messages
    const dc = pc.createDataChannel(`dataChannel${index}`);

    if (this.mode == "controller") {
      this._subscribeDataChannel(dc, index);
    } else {
      pc.ondatachannel = (event) => {
        console.log("New Data Channel Added");
        this._subscribeDataChannel(event.channel, index);
      };
    }

    // Handle ICE candidates and send them via codec xAPI Message Send
    pc.onicecandidate = (event) => {
      if (this.mode == "player") return;
      if (event.candidate) {
        //console.log("onice:", event.candidate);
        //console.log("Broadcasting ICE candidate from:", this.mode);
        this.xapi.Command.Message.Send({
          Text: JSON.stringify({
            mode: this.mode,
            type: "ice-candidate",
            candidate: event.candidate,
            connectionIndex: index,
          }),
        });
      }
    };

    this.peerConnections[index] = pc;
    this.dataChannels[index] = dc;

    console.log(this.peerConnections);

    if (uuid != undefined) return pc;
    // Create and send offer for this connection
    this._createAndSendOffer(index);
  }

  // Internal method to create and send offer SDP via codec
  async _createAndSendOffer(index) {
    const pc = this.peerConnections[index];
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    //console.log("Sending Offer for index", index, "This Mode:", this.mode);

    this.xapi.Command.Message.Send({
      Text: JSON.stringify({
        mode: this.mode,
        type: "offer",
        sdp: offer.sdp,
        connectionIndex: index,
      }),
    });
  }

  _subscribeDataChannel(dc, index) {
    dc.onopen = () => {
      this._emitEvent("open", { connectionIndex: index });
      console.log(`Data channel ${index} open`);
    };

    dc.onmessage = (event) => {
      console.log(`Data channel ${index} received message:`, event.data);
      this._emitEvent("message", { connectionIndex: index, data: event.data });
    };

    dc.onerror = (error) => {
      this._emitEvent("error", { connectionIndex: index, error });
      console.error(`Data channel ${index} error:`, error);
    };
    dc.onclose = (event) => { console.log('connection closed',event)
        this._emitEvent("close", { connectionIndex: index, event });
        console.log(`Data channel ${index} closed`);
        this.dataChannels[index] = null;
        this.peerConnections[index] = null;
        delete this.dataChannels[index];
        delete this.peerConnections[index];
    }
  }

  // Internal method to handle incoming signaling messages from codec
  async _handleSignalingMessage(event) {
    let message;
    try {
      message = JSON.parse(event.Text);
    } catch (e) {
      console.warn("Invalid signaling message JSON:", event.Text);
      return;
    }

    if (message.mode == this.mode) {
      return;
    }

    if(message.type == 'playerReady' && this.mode == 'controls'){
        this._createPeerConnection();
        return
    }

    const index = message.connectionIndex;

    const pc =
      this.peerConnections?.[index] ?? this._createPeerConnection(index);

    
    if (message.type === "offer") {
      //console.log(pc);

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp: message.sdp })
      );

      const answer = await pc.createAnswer();

      await pc.setLocalDescription(answer);

      //console.log("Sending Answer", pc.localDescription.sdp);

      this.xapi.Command.Message.Send({
        Text: JSON.stringify({
          mode: this.mode,
          type: "answer",
          sdp: pc.localDescription.sdp,
          connectionIndex: index,
        }),
      });
    } else if (message.type === "answer") {
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: message.sdp })
      );
    } else if (message.type === "ice-candidate") {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (err) {
        console.warn("Error adding received ICE candidate:", err);
      }
    }
  }

  /**
   * Send a message to all connected webviews via all WebRTC data channels.
   * @param {string} message - The message to send.
   */
  sendMessageToAll(message) {
    for (const [index, dc] of Object.entries(this.dataChannels)) {
      console.log("sending to index:", index, "message", message);
      if (dc.readyState === "open") {
        dc.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Register event handlers for 'open', 'message', or 'error' events.
   * @param {string} event - Event name ('open', 'message', 'error').
   * @param {function} handler - Callback function to handle the event.
   */
  on(event, handler) {
    console.log("adding event listner");
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    }
  }

  // Internal method to emit events to registered handlers
  _emitEvent(event, data) {
    if (this.eventHandlers[event]) {
      console.log(
        "emitting event:",
        event,
        data,
        "handlers:",
        this.eventHandlers[event]
      );
      this.eventHandlers[event].forEach((handler) => handler(data));
    }
  }
}
