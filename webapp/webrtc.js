export class MultiWebRTCDataConnection {
  /**
   * @param {object} xapi - An instance of the xAPI codec connection (jsxapi).
   * @param {string} mode - Either 'player' or 'controls'.
   */
  constructor(xapi, mode, app) {
    this.xapi = xapi;
    this.mode = mode;
    this.role = normalizeMode(mode);
    this.app = app;
    this.peerConnections = {};
    this.dataChannels = {};
    this.eventHandlers = {
      open: [],
      message: [],
      error: [],
    };

    if (typeof this.xapi == "undefined") {
      window.addEventListener("message", (event) => {
        console.log(this.mode, " received message:\n", event);
        this._handleSignalingMessage(event.data);
      });
    } else {
      this.xapi.Event.Message.Send.on((event) => {
        this._handleSignalingMessage(event.Text);
      });
    }
    // Listen for incoming signaling messages from codec

    if (this.role == "player") {
      this._sendSignalingMessage({ type: "playerReady" });
    }

    if (this.role == "controls") {
      this._createPeerConnection();
    }
  }

  _sendSignalingMessage(message) {
    const payload = this.app?.panelId ? { ...message, app: this.app } : message;
    console.log(this.mode, "sending message:", payload);
    if (typeof this.xapi == "undefined") {
      console.log("Number for Frames:", window.top.frames.length);
      for (let i = 0; i < window.top.frames.length; i++) {
        window.top.frames[i].postMessage(JSON.stringify(payload));
      }
    } else {
      this.xapi.Command.Message.Send({ Text: JSON.stringify(payload) });
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

    if (this.role == "controls") {
      this._subscribeDataChannel(dc, index);
    } else {
      pc.ondatachannel = (event) => {
        console.log("New Data Channel Added");
        this._subscribeDataChannel(event.channel, index);
      };
    }

    // Handle ICE candidates and send them via codec xAPI Message Send
    pc.onicecandidate = (event) => {
      if (this.role == "player") return;
      if (event.candidate) {
        //console.log("onice:", event.candidate);
        //console.log("Broadcasting ICE candidate from:", this.mode);
        this._sendSignalingMessage({
          mode: this.mode,
          type: "ice-candidate",
          candidate: event.candidate,
          connectionIndex: index,
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

    this._sendSignalingMessage({
      mode: this.mode,
      type: "offer",
      sdp: offer.sdp,
      connectionIndex: index,
    });
  }

  _subscribeDataChannel(dc, index) {
    this.dataChannels[index] = dc;

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
    dc.onclose = (event) => {
      console.log("connection closed", event);
      this._emitEvent("close", { connectionIndex: index, event });
      console.log(`Data channel ${index} closed`);
      this.dataChannels[index] = null;
      this.peerConnections[index] = null;
      delete this.dataChannels[index];
      delete this.peerConnections[index];
    };
  }

  // Internal method to handle incoming signaling messages from codec
  async _handleSignalingMessage(messageText) {
    console.log(this.mode, "- handling signaling message:", messageText);
    let message;

    try {
      message = JSON.parse(messageText);
    } catch (e) {
      console.warn("Invalid signaling message JSON:", messageText);
      return;
    }

    if (!isSignalingMessage(message)) return;
    if (!isSameApp(message.app, this.app)) return;

    if (message.mode == this.mode || normalizeMode(message.mode) == this.role) {
      return;
    }

    if (message.type == "playerReady" && this.role == "controls") {
      this._createPeerConnection();
      return;
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

      this._sendSignalingMessage({
        mode: this.mode,
        type: "answer",
        sdp: pc.localDescription.sdp,
        connectionIndex: index,
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
   * @param {string} filter - The message to send.
   */
  sendMessageToAll(message, filter = []) {
    filter = Array.isArray(filter) ? filter : [filter];
    for (const [index, dc] of Object.entries(this.dataChannels)) {
      if (dc.readyState === "open" && !filter.includes(index)) {
        console.log(
          this.mode,
          "sending to index:",
          index,
          "message",
          message,
          "filter",
          filter,
        );
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
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    }
  }

  // Internal method to emit events to registered handlers
  _emitEvent(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach((handler) => handler(data));
    }
  }
}

function normalizeMode(mode) {
  if (mode == "osd" || mode == "player") return "player";
  if (mode == "controller" || mode == "controls") return "controls";
  return mode;
}

function isSignalingMessage(message) {
  return ["playerReady", "offer", "answer", "ice-candidate"].includes(
    message?.type,
  );
}

function isSameApp(messageApp, app) {
  if (!app?.panelId) return true;
  return messageApp?.panelId == app.panelId;
}
