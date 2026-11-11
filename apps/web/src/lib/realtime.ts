import type { PresenceUser, RealtimeEvent } from '@kanban/shared';
import { useEffect, useRef, useState } from 'react';
import { fetchWsTicket } from './api';
import { WS_URL } from './config';

export function useBoardRealtime(
  boardId: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
  onResync: () => void,
) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const eventRef = useRef(onEvent);
  const resyncRef = useRef(onResync);
  const seqRef = useRef(0);

  useEffect(() => {
    eventRef.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    resyncRef.current = onResync;
  }, [onResync]);

  useEffect(() => {
    if (!boardId) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let pingTimer: number | undefined;
    let reconnectTimer: number | undefined;

    const scheduleReconnect = () => {
      if (closed) return;
      const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 400;
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const connect = async () => {
      if (closed) return;
      try {
        const { ticket } = await fetchWsTicket(boardId);
        if (closed) return;
        const url = `${WS_URL}/v1/boards/${boardId}/ws?ticket=${encodeURIComponent(ticket)}`;
        socket = new WebSocket(url);

        socket.onopen = () => {
          if (closed) return;
          attempt = 0;
          setConnected(true);
          socket?.send(
            JSON.stringify({ type: 'hello', since_seq: seqRef.current, board_id: boardId }),
          );
          pingTimer = window.setInterval(() => {
            try {
              socket?.send(JSON.stringify({ type: 'presence.ping' }));
            } catch {
              // socket will close and reconnect
            }
          }, 20_000);
        };

        socket.onmessage = (message) => {
          let payload: any;
          try {
            payload = JSON.parse(message.data as string);
          } catch {
            return;
          }
          if (payload.type === 'presence.state') {
            setPresence((payload.users ?? []) as PresenceUser[]);
            return;
          }
          if (payload.type === 'hello.ok') {
            if (payload.resync_required) {
              seqRef.current = 0;
              resyncRef.current();
            } else if (typeof payload.latest_seq === 'number') {
              seqRef.current = payload.latest_seq;
            }
            return;
          }
          if (payload.type === 'error') {
            console.warn('realtime error', payload.code, payload.message);
            return;
          }
          if (typeof payload.seq === 'number') {
            if (payload.seq <= seqRef.current) return;
            seqRef.current = payload.seq;
          }
          eventRef.current(payload as RealtimeEvent);
        };

        socket.onclose = () => {
          setConnected(false);
          setPresence([]);
          if (pingTimer) window.clearInterval(pingTimer);
          scheduleReconnect();
        };
        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      closed = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [boardId]);

  return { connected, presence };
}
