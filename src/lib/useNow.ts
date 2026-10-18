import { useEffect, useState } from 'react'

// The current time, refreshed every minute: for "running for 2 h 10 min" displays
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
