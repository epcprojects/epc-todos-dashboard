'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * A grid thumbnail that only loads while it is near the screen. Videos are removed again once they scroll far away,
 * so fast scrolling through hundreds of files never keeps hundreds of video decoders running.
 */
export function LazyThumb({ url, video, alt = '' }: { url: string; video: boolean; alt?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setNear(e.isIntersecting);
        if (e.isIntersecting) setSeen(true);
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} className="absolute inset-0 block">
      {video ? (
        near ? <video src={url + '#t=0.1'} preload="metadata" muted playsInline /> : null
      ) : seen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" decoding="async" />
      ) : null}
    </span>
  );
}
