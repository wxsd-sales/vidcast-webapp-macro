import { describe, expect, it, jest } from "@jest/globals";
import { PlayerController } from "./playerController.js";

function createConnection() {
  const messageHandlers = [];

  return {
    on: jest.fn((event, handler) => {
      if (event == "message") messageHandlers.push(handler);
    }),
    sendMessageToAll: jest.fn(),
    emitMessage(message) {
      messageHandlers.forEach((handler) => {
        handler({ data: JSON.stringify(message) });
      });
    },
  };
}

function createPlayer(overrides = {}) {
  const listeners = new Map();
  const player = {
    currentTime: 0,
    duration: 45,
    paused: true,
    ended: false,
    volume: 1,
    muted: false,
    playbackRate: 1,
    readyState: 1,
    play: jest.fn(function () {
      this.paused = false;
      return Promise.resolve();
    }),
    pause: jest.fn(function () {
      this.paused = true;
    }),
    addEventListener: jest.fn((event, handler) => {
      listeners.set(event, handler);
    }),
    removeEventListener: jest.fn(),
    dispatch(event) {
      listeners.get(event)?.({ type: event });
    },
    ...overrides,
  };

  return player;
}

describe("PlayerController", () => {
  it("broadcasts normalized player state on real media events", () => {
    const connection = createConnection();
    const controller = new PlayerController(connection);
    const player = createPlayer();

    controller.controlPlayer(player);
    connection.sendMessageToAll.mockClear();

    player.currentTime = 12.5;
    player.paused = false;
    player.dispatch("timeupdate");

    const eventNames = player.addEventListener.mock.calls.map(
      ([event]) => event,
    );
    expect(eventNames).toContain("play");
    expect(eventNames).toContain("timeupdate");
    expect(eventNames).not.toContain("onplay");
    expect(connection.sendMessageToAll).toHaveBeenCalledWith({
      player: expect.objectContaining({
        type: "timeupdate",
        currentTime: 12.5,
        duration: 45,
        playing: true,
        paused: false,
      }),
    });
  });

  it("applies seek controls to the player and broadcasts the resulting state", () => {
    const connection = createConnection();
    const controller = new PlayerController(connection);
    const player = createPlayer();
    controller.controlPlayer(player);
    connection.sendMessageToAll.mockClear();

    connection.emitMessage({ control: { type: "seek", time: 18 } });

    expect(player.currentTime).toBe(18);
    expect(connection.sendMessageToAll).toHaveBeenCalledWith({
      player: expect.objectContaining({
        type: "seek",
        currentTime: 18,
      }),
    });
  });
});
