'use strict';

// Glidende vindue i hukommelsen: nok til én instans. Skal API'et køre på flere maskiner, flyttes den her til databasen.
function createLimiter() {
  const hits = new Map();    // nøgle -> [tidsstempler]
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600e3) hits.delete(k);
  }, 60e3);
  sweep.unref();

  function prune(key, windowMs, now) {
    const a = hits.get(key) || [];
    while (a.length && now - a[0] > windowMs) a.shift();
    hits.set(key, a);
    return a;
  }
  return {
    // Tæller et forsøg. Returnerer 0 hvis det er ok, ellers antal sekunder til der er plads igen.
    hit(key, max, windowMs) {
      const now = Date.now(), a = prune(key, windowMs, now);
      if (a.length >= max) return Math.max(1, Math.ceil((a[0] + windowMs - now) / 1000));
      a.push(now); return 0;
    },
    // Tæller kun hvis man skal. Bruges til mislykkede logins.
    peek(key, max, windowMs) {
      const now = Date.now(), a = prune(key, windowMs, now);
      return a.length >= max ? Math.max(1, Math.ceil((a[0] + windowMs - now) / 1000)) : 0;
    },
    add(key, windowMs) { const now = Date.now(); prune(key, windowMs, now).push(now); },
    clear(key) { hits.delete(key); },
    stop() { clearInterval(sweep); }
  };
}

module.exports = { createLimiter };
