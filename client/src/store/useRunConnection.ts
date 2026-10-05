import { useEffect } from 'react'
import { api, wsUrl } from '../lib/api'
import type { Frame } from '../lib/types'
import type { RunStore } from './runStore'

/**
 * Live runs stream over a WebSocket; finished runs are loaded from MongoDB and replayed locally.
 * Frames arriving in a burst are batched per animation frame so React renders once.
 */
export function useRunConnection(maybeStore: RunStore | null) {
  useEffect(() => {
    if (!maybeStore) return
    const store = maybeStore
    const { runId } = store.getState()
    let ws: WebSocket | null = null
    let closed = false
    let buffer: Frame[] = []
    let raf = 0

    const flush = () => {
      raf = 0
      const fs = buffer
      buffer = []
      store.getState().pushFrames(fs)
    }
    const queue = (f: Frame) => {
      buffer.push(f)
      if (!raf) raf = requestAnimationFrame(flush)
    }

    async function loadReplay() {
      store.setState({ mode: 'replay' })
      const init = await api.init(runId)
      store.getState().setInit(init)
      let from = 0
      for (;;) {
        const chunk = await api.frames(runId, from, 1000)
        if (closed || !chunk.length) break
        store.getState().pushFrames(chunk)
        if (from === 0) store.setState({ view: 0 })
        from = chunk[chunk.length - 1].i + 1
        if (chunk.length < 1000) break
      }
      store.setState({ ended: true })
    }

    function connect() {
      ws = new WebSocket(wsUrl(runId))
      store.setState({
        sender: (cmd) => {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd))
          else api.control(runId, cmd).catch(() => {})
        },
      })
      ws.onopen = () => store.setState({ connected: true, error: null })
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        const s = store.getState()
        if (msg.type === 'snapshot') {
          if (msg.run) s.setMeta(msg.run)
          if (msg.init) s.setInit(msg.init)
          if (msg.frames?.length) s.pushFrames(msg.frames)
          if (msg.run?.status === 'ended') store.setState({ ended: true })
        } else if (msg.type === 'init') {
          s.setInit(msg)
        } else if (msg.type === 'frame') {
          // Frames only advance while the run plays (e.g. a race released by the server after starting paused).
          const lastTick = s.frames[s.frames.length - 1]?.tick ?? -1
          if (s.paused && msg.tick > lastTick && !msg.focus && !msg.events.some((e: { t: string }) => e.t === 'inject')) store.setState({ paused: false })
          queue(msg)
        } else if (msg.type === 'ended') {
          store.setState({ ended: true, meta: s.meta ? { ...s.meta, status: 'ended', summary: msg.summary } : s.meta })
        } else if (msg.type === 'error') {
          if (/not found|no longer live/.test(msg.error)) {
            ws?.close()
            loadReplay().catch((e) => store.setState({ error: String(e.message || e) }))
          } else {
            store.setState({ error: msg.error })
          }
        }
      }
      ws.onclose = () => {
        store.setState({ connected: false })
        const s = store.getState()
        if (!closed && s.mode === 'live' && !s.ended) setTimeout(() => !closed && connect(), 1500)
      }
    }

    api.run(runId)
      .then((meta) => {
        if (closed) return
        store.getState().setMeta(meta)
        if (meta.live && meta.status !== 'ended' && meta.status !== 'failed') connect()
        else return loadReplay()
      })
      .catch((e) => store.setState({ error: String(e.message || e) }))

    return () => {
      closed = true
      if (raf) cancelAnimationFrame(raf)
      ws?.close()
    }
  }, [maybeStore])
}

/** Local playback for replays: advance the view index at ~10 frames per second times the speed factor. */
export function useReplayTicker(store: RunStore | null) {
  useEffect(() => {
    if (!store) return
    let last = performance.now()
    let acc = 0
    let raf = requestAnimationFrame(function loop(now) {
      const s = store.getState()
      const dt = (now - last) / 1000
      last = now
      if (s.mode === 'replay' && s.replayPlaying && s.frames.length) {
        acc += dt * 10 * Math.max(s.speed / 60, 0.25)
        const step = Math.floor(acc)
        if (step > 0) {
          acc -= step
          const v = Math.min((s.view ?? 0) + step, s.frames.length - 1)
          store.setState({ view: v, replayPlaying: v < s.frames.length - 1 })
        }
      }
      raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
  }, [store])
}
