const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const flush = () => new Promise(setImmediate);

for (const modulePath of ["../src", "../demo/common/ws_bridge"]) {
  const { BridgePeer } = require(`${modulePath}/peer`);
  const { BridgeRouter } = require(`${modulePath}/rpc`);
  const router = BridgeRouter.getRouter();

  function createPair(initializeLeft = true) {
    const messages = [];
    function createSocket() {
      return {
        connected: true,
        messageHandler: () => {},
        closeHandler: () => {},
        send(raw) {
          if (!this.connected) throw new Error("Connection closed");
          messages.push(JSON.parse(raw));
          queueMicrotask(() => this.remote.messageHandler(raw));
        },
        close() {
          this.connected = false;
          this.remote.connected = false;
          this.closeHandler();
          this.remote.closeHandler();
        },
        onMessage(handler) { this.messageHandler = handler; },
        onClose(handler) { this.closeHandler = handler; },
        onConnected() {},
        onError() {},
        isConnected() { return this.connected; },
      };
    }
    const leftSocket = createSocket();
    const rightSocket = createSocket();
    leftSocket.remote = rightSocket;
    rightSocket.remote = leftSocket;
    const left = new BridgePeer({ timeout: 50 });
    const right = new BridgePeer({ timeout: 50 });
    left.setSocket(leftSocket, "test");
    right.setSocket(rightSocket, "test");
    if (initializeLeft) router.startDispatchMessage(left);
    router.startDispatchMessage(right);
    return { left, right, leftSocket, rightSocket, messages };
  }

  describe(modulePath, () => {
    it("runs returned callbacks after sending and supports sync and async results without callbacks", async () => {
      const { left, right, rightSocket } = createPair();
      const events = [];
      const send = rightSocket.send.bind(rightSocket);
      rightSocket.send = (raw) => { send(raw); events.push("sent"); };
      try {
        for (const asynchronous of [false, true]) {
          events.length = 0;
          const handle = (data) => {
            events.push("handler");
            return {
              data,
              callback: async () => {
                events.push("callback");
                await Promise.resolve();
                events.push("completed");
              },
            };
          };
          right.onMessage(asynchronous ? async (...args) => handle(...args) : handle);
          await right._onMessage(JSON.stringify({ id: "callback", kind: "request", data: "reply" }));
          assert.deepEqual(events, ["handler", "sent", "callback", "completed"]);
        }
        right.onMessage((data) => ({ data }));
        assert.equal(await left.send("no callback"), "no callback");
        right.onMessage(async (data) => ({ data }));
        assert.equal(await left.send("async response"), "async response");
      } finally { await left.close(); }
    });

    it("skips returned callbacks on handler or send failure and isolates callback failures", async () => {
      for (const mode of ["handler", "send", "callback", "asyncCallback"]) {
        const { left, right, rightSocket, messages } = createPair();
        const reports = [];
        const originalError = console.error;
        let completed = 0;
        console.error = (...args) => reports.push(args);
        if (mode === "send") rightSocket.send = () => { throw new Error("send failed"); };
        right.onMessage(() => {
          if (mode === "handler") throw new Error("handler failed");
          return {
            data: "reply",
            callback: () => {
              completed++;
              if (mode === "callback") throw new Error("callback failed");
              if (mode === "asyncCallback") return Promise.reject(new Error("callback failed"));
            },
          };
        });
        try {
          rightSocket.messageHandler(JSON.stringify({ id: "failure", kind: "request", data: "input" }));
          await flush();
          assert.equal(completed, mode === "handler" || mode === "send" ? 0 : 1);
          if (mode === "send") {
            assert.equal(messages.length, 0);
          } else {
            assert.equal(messages.length, 1);
            if (mode === "handler") {
              assert.equal(messages[0].error, "handler failed");
              assert.equal(reports.length, 0);
            } else {
              assert.equal(messages[0].data, "reply");
            }
          }
          if (mode !== "handler") {
            assert.equal(reports.length, 1);
            assert.equal(reports[0][0], "[bridge] message processing failed:");
            assert.equal(reports[0][1].message, mode === "send" ? "send failed" : "callback failed");
          }
        } finally {
          console.error = originalError;
          await left.close();
        }
      }
    });

    it("ACKs before executing and waits beyond the transport timeout for data", async () => {
      const { left, messages } = createPair();
      router.registerMessageHandler("test.slow", async () => {
        assert.ok(messages.some((message) => message.kind === "response" &&
          JSON.parse(message.data).data.type === "ack"));
        await delay(150);
        return "done";
      });
      try {
        assert.equal(await BridgeRouter.send(left, "test.slow"), "done");
        await flush();
        assert.deepEqual(messages.map((message) => message.kind), ["request", "response", "request", "response"]);
        const request = JSON.parse(messages[0].data).data;
        assert.deepEqual(JSON.parse(messages[0].data), {
          type: "request", data: { id: request.id, method: "test.slow", params: [] },
        });
        assert.deepEqual(JSON.parse(messages[1].data), {
          type: "response", data: { id: request.id, type: "ack" },
        });
        assert.deepEqual(JSON.parse(messages[2].data), {
          type: "response", data: { id: request.id, type: "data", data: "done" },
        });
        assert.deepEqual(JSON.parse(messages[3].data), {
          type: "response", data: { id: request.id, type: "ack" },
        });
      } finally { await left.close(); }
    });

    it("dispatches by type and parses each incoming message once", async () => {
      const { left, right } = createPair();
      const dispatch = (raw) => router._dispatch(right, raw);
      const request = { id: "typed", method: "test.unregisteredType", params: [] };
      const parse = JSON.parse;
      let parseCount = 0;
      JSON.parse = (...args) => {
        parseCount++;
        return parse(...args);
      };
      try {
        const ack = dispatch(JSON.stringify({ type: "request", data: request }));
        assert.equal(ack.response.type, "ack");
        assert.equal(typeof ack.response.error, "string");
        assert.equal(parseCount, 1);
        assert.equal(ack.callback, undefined);
        parseCount = 0;
        const result = dispatch(JSON.stringify({
          type: "response", data: { ...request, type: "data" },
        }));
        assert.deepEqual(result.response, { id: request.id, type: "ack" });
        assert.equal(parseCount, 1);
        assert.equal(typeof result.callback, "function");
        result.callback();
        for (const invalid of [
          request,
          null,
          { type: "invalid", data: request },
          { type: "request" },
          { type: "request", data: null },
          { type: "request", data: { id: "typed", type: "data" } },
          { type: "response", data: request },
          { type: "response", data: { id: "typed", type: "ack" } },
          { type: "response", data: { id: "typed", type: "data", error: 1 } },
          { type: "request", data: { ...request, params: null } },
          { type: "request", data: { ...request, id: "" } },
        ]) {
          assert.throws(() => dispatch(JSON.stringify(invalid)));
        }
        assert.throws(() => dispatch("{"));
      } finally {
        JSON.parse = parse;
        await left.close();
      }
    });

    it("ACKs results before resolving or rejecting and settles duplicates only once", async () => {
      const { left, right, messages } = createPair();
      try {
        for (const mode of ["resolve", "reject"]) {
          const id = `deferred-${mode}`;
          const settlements = [];
          let markSettled;
          const settled = new Promise((resolve) => { markSettled = resolve; });
          const calls = router._pendingCalls.get(left);
          const assertAckSent = () => {
            assert.ok(messages.some((message) => message.kind === "response" &&
              JSON.parse(message.data).data.id === id && JSON.parse(message.data).data.type === "ack"));
          };
          calls.set(id, {
            resolve(value) { assertAckSent(); settlements.push(["resolve", value]); markSettled(); },
            reject(error) { assertAckSent(); settlements.push(["reject", error.message]); markSettled(); },
          });
          const raw = JSON.stringify({
            type: "response",
            data: { id, type: "data", ...(mode === "resolve" ? { data: 7 } : { error: "failure" }) },
          });
          const acknowledgments = await Promise.all([right.send(raw), right.send(raw)]);
          for (const ack of acknowledgments) {
            assert.deepEqual(JSON.parse(ack), { type: "response", data: { id, type: "ack" } });
          }
          await settled;
          assert.deepEqual(settlements, [[mode, mode === "resolve" ? 7 : "failure"]]);
          assert.equal(calls.has(id), false);
        }
      } finally { await left.close(); }
    });

    it("matches concurrent calls by ID when results arrive out of order", async () => {
      const { left } = createPair();
      const completed = [];
      router.registerMessageHandler("test.concurrent", async (_peer, value, duration) => {
        await delay(duration);
        completed.push(value);
        return value;
      });
      try {
        assert.deepEqual(await Promise.all([
          BridgeRouter.send(left, "test.concurrent", "slow", 120),
          BridgeRouter.send(left, "test.concurrent", "fast", 0),
        ]), ["slow", "fast"]);
        assert.deepEqual(completed, ["fast", "slow"]);
      } finally { await left.close(); }
    });

    it("propagates handler and serialization errors and handles void", async () => {
      const { left } = createPair();
      router.registerMessageHandler("test.error", () => { throw new Error("business error"); });
      router.registerMessageHandler("test.serialization", () => 1n);
      router.registerMessageHandler("test.void", () => undefined);
      try {
        await assert.rejects(BridgeRouter.send(left, "test.error"), /business error/);
        await assert.rejects(BridgeRouter.send(left, "test.serialization"), /BigInt/);
        await assert.rejects(BridgeRouter.send(left, "test.missing"));
        assert.equal(await BridgeRouter.send(left, "test.void"), undefined);
      } finally { await left.close(); }
    });

    it("rejects all accepted pending calls on disconnect", async () => {
      const { left } = createPair();
      let markStarted;
      const started = new Promise((resolve) => { markStarted = resolve; });
      router.registerMessageHandler("test.disconnect", () => {
        markStarted();
        return new Promise(() => {});
      });
      const rejected = assert.rejects(BridgeRouter.send(left, "test.disconnect"), /Connection closed/);
      await started;
      await left.close();
      await rejected;
    });

    it("rejects missing ACKs and invalid ACK IDs or types", async () => {
      const { left, right } = createPair();
      try {
        right.onMessage(() => new Promise(() => {}));
        await assert.rejects(BridgeRouter.send(left, "test.noAck"), /timed out/);
        right.onMessage(() => ({ data: JSON.stringify({ type: "response", data: { id: "wrong", type: "ack" } }) }));
        await assert.rejects(BridgeRouter.send(left, "test.badId"));
        right.onMessage((raw) => ({ data: JSON.stringify({
          type: "response", data: { id: JSON.parse(raw).data.id, type: "data" },
        }) }));
        await assert.rejects(BridgeRouter.send(left, "test.badType"));
        right.onMessage((raw) => ({ data: JSON.stringify({
          type: "request", data: { id: JSON.parse(raw).data.id, method: "test.badAck", params: [] },
        }) }));
        await assert.rejects(BridgeRouter.send(left, "test.badAckEnvelope"));
      } finally { await left.close(); }
    });

    it("accepts data before the request ACK and ACKs duplicate results", async () => {
      const { left, right, rightSocket, messages } = createPair();
      const send = rightSocket.send.bind(rightSocket);
      let releaseAck;
      rightSocket.send = (raw) => {
        const envelope = JSON.parse(raw);
        if (envelope.kind === "response") releaseAck = () => send(raw);
        else send(raw);
      };
      router.registerMessageHandler("test.earlyData", () => "early");
      try {
        assert.equal(await BridgeRouter.send(left, "test.earlyData"), "early");
        const result = messages.find((message) => message.kind === "request" &&
          JSON.parse(message.data).data.type === "data");
        assert.ok(result);
        const response = JSON.parse(await right.send(result.data));
        assert.deepEqual(response, {
          type: "response", data: { id: JSON.parse(result.data).data.id, type: "ack" },
        });
        releaseAck();
      } finally { await left.close(); }
    });

    it("reports missing or invalid result ACKs without undoing a delivered result", { timeout: 3000 }, async () => {
      router.registerMessageHandler("test.resultAck", () => 5);
      for (const mode of ["missing", "invalid"]) {
        const { left, leftSocket } = createPair();
        const send = leftSocket.send.bind(leftSocket);
        leftSocket.send = (raw) => {
          const envelope = JSON.parse(raw);
          if (envelope.kind === "response") {
            if (mode === "missing") return;
            const response = JSON.parse(envelope.data);
            envelope.data = JSON.stringify({ ...response, data: { ...response.data, type: "data" } });
            raw = JSON.stringify(envelope);
          }
          send(raw);
        };
        let report;
        const reported = new Promise((resolve) => { report = resolve; });
        const originalError = console.error;
        console.error = (...args) => report(args);
        try {
          assert.equal(await BridgeRouter.send(left, "test.resultAck"), 5);
          const [message, error] = await reported;
          assert.match(message, /RPC result delivery failed/);
          assert.ok(error instanceof Error);
          assert.ok(error.message.length > 0);
        } finally {
          console.error = originalError;
          await left.close();
        }
      }
    });

    it("isolates pending calls between connections", async () => {
      const first = createPair();
      const second = createPair();
      let finish;
      let markStarted;
      const started = new Promise((resolve) => { markStarted = resolve; });
      router.registerMessageHandler("test.isolated", () => {
        markStarted();
        return new Promise((resolve) => { finish = resolve; });
      });
      let settled = false;
      const result = BridgeRouter.send(first.left, "test.isolated").then((value) => {
        settled = true;
        return value;
      });
      try {
        await started;
        const request = JSON.parse(first.messages[0].data).data;
        await second.right.send(JSON.stringify({
          type: "response", data: { id: request.id, type: "data", data: "forged" },
        }));
        assert.equal(settled, false);
        finish("real");
        assert.equal(await result, "real");
      } finally {
        await first.left.close();
        await second.left.close();
      }
    });

    it("supports remote objects and reverse callbacks during long calls", async () => {
      const { left } = createPair();
      router.registerRemoteObj("test.object", () => ({
        async run(callback) {
          await delay(120);
          return callback.value();
        },
      }));
      try {
        const remote = await BridgeRouter.createRemoteObj(left, "test.object");
        const callback = BridgeRouter.returnRemoteObj({ value: () => 7 });
        assert.equal(await remote.run(callback), 7);
        assert.equal(await BridgeRouter.destroyRemoteObj(remote), true);
        await assert.rejects(remote.run(callback));
      } finally { await left.close(); }
    });

    it("serializes requests once without parsing them before sending", async () => {
      const { left } = createPair();
      router.registerMessageHandler("test.encoding", (_peer, value) => value);
      const send = left.send.bind(left);
      const parse = JSON.parse;
      const parsed = [];
      let serialized = 0;
      JSON.parse = (...args) => {
        parsed.push(args[0]);
        return parse(...args);
      };
      left.send = (raw) => {
        assert.equal(parsed.includes(raw), false);
        return send(raw);
      };
      try {
        const value = { toJSON() { serialized++; return { value: 3 }; } };
        assert.deepEqual(await BridgeRouter.send(left, "test.encoding", value), { value: 3 });
        assert.equal(serialized, 1);
        const cyclic = {};
        cyclic.self = cyclic;
        await assert.rejects(BridgeRouter.send(left, "test.encoding", cyclic), /circular/i);
        assert.equal(await BridgeRouter.send(left, "test.encoding", 7), 7);
      } finally {
        JSON.parse = parse;
        await left.close();
      }
    });

    it("requires explicit dispatcher initialization before sending", async () => {
      const { left, messages } = createPair(false);
      router.registerMessageHandler("test.initialization", () => "ready");
      try {
        await assert.rejects(BridgeRouter.send(left, "test.initialization"));
        assert.equal(messages.length, 0);
        router.startDispatchMessage(left);
        assert.equal(await BridgeRouter.send(left, "test.initialization"), "ready");
      } finally { await left.close(); }
    });
  });
}