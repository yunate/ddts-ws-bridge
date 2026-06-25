/**
 * 端到端示例：在 Node 中同时跑 server 与 client（1:1）。
 * 运行： npm run example
 *
 * 注意：BridgePeer 只负责字符串收发，分包/解包（消息名 + JSON 序列化）
 * 由调用者自行实现。这里约定负载是 JSON 字符串 { name, body }。
 */
import { WSServerBridgeListener } from '../wsServerPeer';
import { CreateWSClientPeer } from '../wsClientPeer';
import type { BridgePeer } from '../peer';

async function main() {
  const url = 'ws://localhost:8080';

  // ---- 服务端 ----
  const listener = new WSServerBridgeListener(url);

  // 每条 client 连接建立时拿到专属的 BridgePeer。
  let server: BridgePeer | undefined;
  listener.onConnection((conn) => {
    server = conn;
    console.log('[server] 客户端已连接');
    conn.onDisconnect(() => console.log('[server] 客户端断开'));

    // 调用者负责解包：自行根据 name 分发并序列化结果。
    conn.on_message((raw) => {
      const { name, body } = JSON.parse(raw);
      console.log('[server] 收到:', name, body);
      return JSON.stringify({ reply: `服务端已收到: ${body.text}` });
    });
  });

  // ---- 客户端 ----
  const client = CreateWSClientPeer(url);

  client.on_message((raw) => {
    const { name, body } = JSON.parse(raw);
    console.log('[client] 收到服务端推送:', name, body);
    return JSON.stringify({ pong: true });
  });

  await client.wait_for_connect();
  console.log('[client] 是否已连接:', client.isconnect());

  // const res = await client.send(data)
  const resRaw = await client.send(
    JSON.stringify({ name: 'xxmessage', body: { text: '你好 server' } }),
  );
  console.log('[client] send 得到回复:', JSON.parse(resRaw));

  // 服务端反向 send -> 客户端
  const pongRaw = await server!.send(
    JSON.stringify({ name: 'ping', body: { from: 'server' } }),
  );
  console.log('[server] ping 回复:', JSON.parse(pongRaw));

  client.close();
  await listener.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
