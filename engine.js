// BTC 15m 均值回归信号引擎：与 btc_mine.py / btc_rev.py 的 pandas 计算逐项对应。
(function (root) {
  const ZWIN = 2880, ZMIN = 672;

  function rollSum(x, w) {
    const out = new Array(x.length).fill(NaN);
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      s += x[i];
      if (i >= w) s -= x[i - w];
      if (i >= w - 1) out[i] = s;
    }
    return out;
  }

  function rollExtreme(x, w, isMax) {
    const out = new Array(x.length).fill(NaN);
    for (let i = w - 1; i < x.length; i++) {
      let m = x[i];
      for (let j = i - w + 1; j < i; j++) m = isMax ? Math.max(m, x[j]) : Math.min(m, x[j]);
      out[i] = m;
    }
    return out;
  }

  // pandas rolling(w, min_periods).mean()/.std()（ddof=1），NaN 不计数
  function rollMeanStd(x, w, minp) {
    const n = x.length, mean = new Array(n).fill(NaN), std = new Array(n).fill(NaN);
    let cnt = 0, s = 0, ss = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i];
      if (!Number.isNaN(a)) { cnt++; s += a; ss += a * a; }
      if (i >= w) {
        const b = x[i - w];
        if (!Number.isNaN(b)) { cnt--; s -= b; ss -= b * b; }
      }
      if (cnt >= minp) {
        const m = s / cnt;
        mean[i] = m;
        if (cnt > 1) std[i] = Math.sqrt(Math.max(0, (ss - cnt * m * m) / (cnt - 1)));
      }
    }
    return { mean, std };
  }

  function ewm(x, alpha, minp) {
    const out = new Array(x.length).fill(NaN);
    let y = NaN;
    for (let i = 0; i < x.length; i++) {
      y = Number.isNaN(y) ? x[i] : (1 - alpha) * y + alpha * x[i];
      if (i >= minp - 1) out[i] = y;
    }
    return out;
  }

  const fin = (v) => (Number.isFinite(v) ? v : NaN);

  function zscore(x) {
    const { mean, std } = rollMeanStd(x, ZWIN, ZMIN);
    return x.map((v, i) => fin((v - mean[i]) / std[i]));
  }

  // bars: [{t, o, h, l, c, v, tb}]，全部为已收盘 K 线，按时间升序
  function compute(bars) {
    const n = bars.length;
    const o = bars.map(b => b.o), h = bars.map(b => b.h), l = bars.map(b => b.l);
    const c = bars.map(b => b.c), v = bars.map(b => b.v), tb = bars.map(b => b.tb);
    const tr = c.map((_, i) => i === 0 ? h[0] - l[0]
      : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    const atr = ewm(tr, 1 / 14, 14);
    const emaC = ewm(c, 2 / 97, 1);
    const cv = rollSum(c.map((x, i) => x * v[i]), 96), v96 = rollSum(v, 96);
    const tb4 = rollSum(tb, 4), v4 = rollSum(v, 4);
    const lo96 = rollExtreme(l, 96, false), hi96 = rollExtreme(h, 96, true);
    const lag = (k, i) => (i >= k ? Math.log(c[i] / c[i - k]) : NaN);

    const f = {
      r1: c.map((_, i) => lag(1, i)),
      mom4: c.map((_, i) => lag(4, i)),
      mom16: c.map((_, i) => lag(16, i)),
      close_loc: c.map((x, i) => (h[i] - l[i] === 0 ? NaN : (x - l[i]) / (h[i] - l[i]))),
      taker_imb4: c.map((_, i) => fin(2 * tb4[i] / v4[i] - 1)),
      donchian: c.map((x, i) => fin((x - lo96[i]) / (hi96[i] - lo96[i]))),
      vwap_dev: c.map((x, i) => fin((x - cv[i] / v96[i]) / atr[i])),
      ema_dev: c.map((x, i) => fin((x - emaC[i]) / atr[i])),
    };
    const zs = Object.values(f).map(zscore);
    const raw = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      let s = 0, k = 0;
      for (const z of zs) if (!Number.isNaN(z[i])) { s += Math.max(-4, Math.min(4, z[i])); k++; }
      if (k) raw[i] = -s / k;
    }
    const S = zscore(raw);
    return { S, atr };
  }

  root.BTCEngine = { compute, ZWIN, ZMIN };
  if (typeof module !== "undefined") module.exports = root.BTCEngine;
})(typeof window !== "undefined" ? window : globalThis);
