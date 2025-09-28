// Import with type annotation to avoid module issues
// @ts-ignore - require is available in Cloudflare Workers context
const RealtimeKitService = require("../services/realtimekit.js");

export interface Env {
  AUTH_CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  AUTH_DB: D1Database;
  AI: any;
  REALTIME_API_KEY: string;
  REALTIME_API_SECRET: string;
}

interface WebSocketData {
  userId: string;
  roomId: string;
  token: string;
  chittyId: string;
}

const realtimeService = new RealtimeKitService({
  apiKey: "",
  apiSecret: "",
  sfuUrl: "wss://sfu.realtimekit.io",
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    realtimeService.apiKey = env.REALTIME_API_KEY || "";
    realtimeService.apiSecret = env.REALTIME_API_SECRET || "";

    if (url.pathname === "/api/realtime/health") {
      return new Response(JSON.stringify({ status: "healthy" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/realtime/rooms") {
      const body = (await request.json()) as {
        chittyId: string;
        options?: any;
      };
      const { chittyId, options } = body;

      const validation = await validateChittyId(chittyId, env);
      if (!validation.valid) {
        return new Response(JSON.stringify({ error: "Invalid ChittyID" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const roomId = `chitty-${chittyId}-${Date.now()}`;
      const room = await realtimeService.createRoom(roomId, options);

      await env.SESSIONS.put(
        `room:${roomId}`,
        JSON.stringify({
          ...room,
          chittyId,
          creatorId: chittyId,
        }),
        {
          expirationTtl: 3600,
        },
      );

      return new Response(JSON.stringify(room), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      request.method === "POST" &&
      url.pathname.startsWith("/api/realtime/rooms/") &&
      url.pathname.endsWith("/join")
    ) {
      const roomId = url.pathname.split("/")[4];
      const body = (await request.json()) as {
        chittyId: string;
        metadata?: any;
      };
      const { chittyId, metadata } = body;

      const validation = await validateChittyId(chittyId, env);
      if (!validation.valid) {
        return new Response(JSON.stringify({ error: "Invalid ChittyID" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const result = await realtimeService.joinRoom(roomId, chittyId, {
          ...metadata,
          chittyId,
          joinedAt: new Date().toISOString(),
        });

        await env.SESSIONS.put(
          `participant:${roomId}:${chittyId}`,
          JSON.stringify(result.participant),
          {
            expirationTtl: 3600,
          },
        );

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (
      request.method === "DELETE" &&
      url.pathname.startsWith("/api/realtime/rooms/") &&
      url.pathname.includes("/leave")
    ) {
      const pathParts = url.pathname.split("/");
      const roomId = pathParts[4];
      const chittyId = pathParts[6];

      await realtimeService.leaveRoom(roomId, chittyId);
      await env.SESSIONS.delete(`participant:${roomId}:${chittyId}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/realtime/rooms/")
    ) {
      const roomId = url.pathname.split("/")[4];
      const room = realtimeService.getRoomInfo(roomId);

      if (!room) {
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(room), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/ws/realtime") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }

      const [client, server] = Object.values(new WebSocketPair());

      server.accept();

      const chittyId = url.searchParams.get("chittyId");
      const roomId = url.searchParams.get("roomId");
      const token = url.searchParams.get("token");

      if (!chittyId || !roomId || !token) {
        server.send(JSON.stringify({ error: "Missing required parameters" }));
        server.close();
        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      }

      const validation = await validateChittyId(chittyId, env);
      if (!validation.valid) {
        server.send(JSON.stringify({ error: "Invalid ChittyID" }));
        server.close();
        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      }

      try {
        const tokenData = realtimeService.validateToken(token);
        if (tokenData.roomId !== roomId || tokenData.userId !== chittyId) {
          throw new Error("Token mismatch");
        }
      } catch (error) {
        server.send(JSON.stringify({ error: "Invalid token" }));
        server.close();
        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      }

      const wsData: WebSocketData = {
        userId: chittyId,
        roomId,
        token,
        chittyId,
      };

      handleWebSocket(server, wsData, env);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

function handleWebSocket(ws: WebSocket, data: WebSocketData, env: Env) {
  const { userId, roomId, chittyId } = data;

  realtimeService.sendToParticipant = (targetUserId: string, message: any) => {
    if (targetUserId === userId) {
      ws.send(JSON.stringify(message));
    }
  };

  ws.addEventListener("message", async (event) => {
    try {
      const message = JSON.parse(event.data.toString());

      switch (message.type) {
        case "publish-track":
          await realtimeService.publishTrack(
            roomId,
            userId,
            message.trackType,
            message.track,
          );
          break;

        case "unpublish-track":
          await realtimeService.unpublishTrack(
            roomId,
            userId,
            message.trackType,
          );
          break;

        case "mute-track":
          await realtimeService.muteTrack(
            roomId,
            userId,
            message.trackType,
            message.muted,
          );
          break;

        case "ice-candidate":
        case "offer":
        case "answer":
          realtimeService.broadcastToRoom(
            roomId,
            {
              ...message,
              from: userId,
            },
            userId,
          );
          break;

        case "chat":
          const chatMessage = {
            type: "chat",
            from: userId,
            chittyId,
            message: message.text,
            timestamp: new Date().toISOString(),
          };
          realtimeService.broadcastToRoom(roomId, chatMessage);

          await env.SESSIONS.put(
            `chat:${roomId}:${Date.now()}`,
            JSON.stringify(chatMessage),
            {
              expirationTtl: 86400,
            },
          );
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      ws.send(JSON.stringify({ error: "Invalid message format" }));
    }
  });

  ws.addEventListener("close", async () => {
    await realtimeService.leaveRoom(roomId, userId);
    await env.SESSIONS.delete(`participant:${roomId}:${userId}`);
  });

  ws.send(
    JSON.stringify({
      type: "connected",
      roomId,
      userId,
      chittyId,
      participants: realtimeService.getRoomParticipants(roomId),
    }),
  );

  realtimeService.broadcastToRoom(
    roomId,
    {
      type: "participant-joined",
      userId,
      chittyId,
      timestamp: new Date().toISOString(),
    },
    userId,
  );
}

async function validateChittyId(
  chittyId: string,
  env: Env,
): Promise<{ valid: boolean; details?: any }> {
  const cached = await env.AUTH_CACHE.get(`valid:${chittyId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  const pattern =
    /^(\d{2})-(\d)-([A-Z]{3})-(\d{4})-([PLTE])-(\d{2,3})-([0-5])-(\d{2})$/;
  const match = chittyId.match(pattern);

  if (!match) {
    return { valid: false };
  }

  const [
    _,
    version,
    region,
    jurisdiction,
    sequential,
    entityType,
    yearMonth,
    trustLevel,
    checksum,
  ] = match;

  const calculatedChecksum = calculateChecksum(chittyId.slice(0, -3));
  if (calculatedChecksum !== checksum) {
    return { valid: false };
  }

  const result = {
    valid: true,
    details: {
      version,
      region,
      jurisdiction,
      sequential,
      entityType,
      yearMonth,
      trustLevel,
      checksum,
    },
  };

  await env.AUTH_CACHE.put(`valid:${chittyId}`, JSON.stringify(result), {
    expirationTtl: 3600,
  });

  return result;
}

function calculateChecksum(input: string): string {
  const asciiSum = input
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const remainder = asciiSum % 97;
  return remainder.toString().padStart(2, "0");
}
