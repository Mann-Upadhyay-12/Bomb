// SIMD kernels for the Heist captcha reader (CaptchaVision in heistCore.js).
//
// Same maths as the JavaScript forward pass (forwardCTC), in float32 like the TensorFlow model
// it was trained as, using 128-bit SIMD. JavaScript still drives the network layer by layer and
// does the CTC decode; these functions only do the heavy loops. If WebAssembly SIMD is missing,
// heistCore.js falls back to its plain-JS forward pass.
//
// Build (needs clang with the wasm32 target): npm run build:captcha-wasm
// That rewrites captchaKernelWasm.js, which embeds the .wasm bytes as base64.
//
// Layouts (all row-major float32):
//   linear weights  w[i*nout + o]   (nin x nout, as stored in SPEC before the JS transpose)
//   conv weights    w[((ky*k + kx)*cin + ci)*cout + c]
//   images / maps   x[(y*W + x)*C + c]

#include <wasm_simd128.h>

#define EXPORT(name) __attribute__((export_name(name)))

typedef float f32;

// y[t, :] = b + x[t, :] · W   for T rows. Vectorised over outputs, 4 rows × 8 outputs at a time,
// so each weight vector is loaded once per 4 rows. nout must be a multiple of 4.
EXPORT("linear")
void linear(const f32 *x, int T, int nin, const f32 *w, const f32 *b, int nout, f32 *y) {
  int t = 0;
  for (; t + 4 <= T; t += 4) {
    const f32 *x0 = x + t * nin, *x1 = x0 + nin, *x2 = x1 + nin, *x3 = x2 + nin;
    f32 *y0 = y + t * nout, *y1 = y0 + nout, *y2 = y1 + nout, *y3 = y2 + nout;
    int o = 0;
    for (; o + 8 <= nout; o += 8) {
      v128_t bA = wasm_v128_load(b + o), bB = wasm_v128_load(b + o + 4);
      v128_t a0 = bA, a1 = bA, a2 = bA, a3 = bA, c0 = bB, c1 = bB, c2 = bB, c3 = bB;
      const f32 *wp = w + o;
      for (int i = 0; i < nin; i++, wp += nout) {
        v128_t wA = wasm_v128_load(wp), wB = wasm_v128_load(wp + 4);
        v128_t s0 = wasm_f32x4_splat(x0[i]), s1 = wasm_f32x4_splat(x1[i]);
        v128_t s2 = wasm_f32x4_splat(x2[i]), s3 = wasm_f32x4_splat(x3[i]);
        a0 = wasm_f32x4_add(a0, wasm_f32x4_mul(s0, wA)); c0 = wasm_f32x4_add(c0, wasm_f32x4_mul(s0, wB));
        a1 = wasm_f32x4_add(a1, wasm_f32x4_mul(s1, wA)); c1 = wasm_f32x4_add(c1, wasm_f32x4_mul(s1, wB));
        a2 = wasm_f32x4_add(a2, wasm_f32x4_mul(s2, wA)); c2 = wasm_f32x4_add(c2, wasm_f32x4_mul(s2, wB));
        a3 = wasm_f32x4_add(a3, wasm_f32x4_mul(s3, wA)); c3 = wasm_f32x4_add(c3, wasm_f32x4_mul(s3, wB));
      }
      wasm_v128_store(y0 + o, a0); wasm_v128_store(y0 + o + 4, c0);
      wasm_v128_store(y1 + o, a1); wasm_v128_store(y1 + o + 4, c1);
      wasm_v128_store(y2 + o, a2); wasm_v128_store(y2 + o + 4, c2);
      wasm_v128_store(y3 + o, a3); wasm_v128_store(y3 + o + 4, c3);
    }
    for (; o < nout; o += 4) {
      v128_t bA = wasm_v128_load(b + o), a0 = bA, a1 = bA, a2 = bA, a3 = bA;
      const f32 *wp = w + o;
      for (int i = 0; i < nin; i++, wp += nout) {
        v128_t wA = wasm_v128_load(wp);
        a0 = wasm_f32x4_add(a0, wasm_f32x4_mul(wasm_f32x4_splat(x0[i]), wA));
        a1 = wasm_f32x4_add(a1, wasm_f32x4_mul(wasm_f32x4_splat(x1[i]), wA));
        a2 = wasm_f32x4_add(a2, wasm_f32x4_mul(wasm_f32x4_splat(x2[i]), wA));
        a3 = wasm_f32x4_add(a3, wasm_f32x4_mul(wasm_f32x4_splat(x3[i]), wA));
      }
      wasm_v128_store(y0 + o, a0); wasm_v128_store(y1 + o, a1);
      wasm_v128_store(y2 + o, a2); wasm_v128_store(y3 + o, a3);
    }
  }
  for (; t < T; t++) {
    const f32 *xr = x + t * nin;
    f32 *yr = y + t * nout;
    for (int o = 0; o < nout; o += 4) {
      v128_t a = wasm_v128_load(b + o);
      const f32 *wp = w + o;
      for (int i = 0; i < nin; i++, wp += nout) a = wasm_f32x4_add(a, wasm_f32x4_mul(wasm_f32x4_splat(xr[i]), wasm_v128_load(wp)));
      wasm_v128_store(yr + o, a);
    }
  }
}

// im2col for a SAME-padded conv: col[(oy*oW + ox), (ky*k + kx)*C + ci], zero outside the image.
// Then conv = linear(col, oH*oW, k*k*C, w, b, cout, y) followed by relu.
EXPORT("im2col")
void im2col(const f32 *x, int H, int W, int C, int k, int sy, int sx, int padY, int padX, int oH, int oW, f32 *col) {
  const int K = k * k * C;
  for (int oy = 0; oy < oH; oy++) {
    for (int ox = 0; ox < oW; ox++) {
      f32 *row = col + (oy * oW + ox) * K;
      for (int ky = 0; ky < k; ky++) {
        const int iy = oy * sy + ky - padY;
        for (int kx = 0; kx < k; kx++) {
          const int ix = ox * sx + kx - padX;
          f32 *dst = row + (ky * k + kx) * C;
          if (iy < 0 || iy >= H || ix < 0 || ix >= W) {
            for (int c = 0; c < C; c++) dst[c] = 0.f;
          } else {
            const f32 *src = x + (iy * W + ix) * C;
            for (int c = 0; c < C; c++) dst[c] = src[c];
          }
        }
      }
    }
  }
}

EXPORT("relu")
void relu(f32 *x, int n) {
  const v128_t z = wasm_f32x4_splat(0.f);
  int i = 0;
  for (; i + 4 <= n; i += 4) wasm_v128_store(x + i, wasm_f32x4_max(wasm_v128_load(x + i), z));
  for (; i < n; i++) x[i] = x[i] > 0.f ? x[i] : 0.f;
}

// a += b
EXPORT("add")
void add(f32 *a, const f32 *b, int n) {
  int i = 0;
  for (; i + 4 <= n; i += 4) wasm_v128_store(a + i, wasm_f32x4_add(wasm_v128_load(a + i), wasm_v128_load(b + i)));
  for (; i < n; i++) a[i] += b[i];
}

// Per-row layer norm over D (eps 1e-5), y may alias x.
EXPORT("layernorm")
void layernorm(const f32 *x, int T, int D, const f32 *gamma, const f32 *beta, f32 *y) {
  for (int t = 0; t < T; t++) {
    const f32 *r = x + t * D;
    f32 *o = y + t * D;
    float mean = 0.f;
    for (int i = 0; i < D; i++) mean += r[i];
    mean /= (float)D;
    float var = 0.f;
    for (int i = 0; i < D; i++) { const float d = r[i] - mean; var += d * d; }
    const float inv = 1.f / __builtin_sqrtf(var / (float)D + 1e-5f);
    for (int i = 0; i < D; i++) o[i] = (r[i] - mean) * inv * gamma[i] + beta[i];
  }
}

// exp for float32 (Cephes expf: ~1 ulp). Arguments here are <= ~20, results only feed sums.
static inline float expf_(float x) {
  if (x < -87.3f) return 0.f;
  if (x > 88.7f) x = 88.7f;
  const float fx = __builtin_floorf(x * 1.44269504088896341f + 0.5f);
  x = x - fx * 0.693359375f + fx * 2.12194440e-4f;
  float y = 1.9875691500e-4f;
  y = y * x + 1.3981999507e-3f;
  y = y * x + 8.3334519073e-3f;
  y = y * x + 4.1665795894e-2f;
  y = y * x + 1.6666665459e-1f;
  y = y * x + 5.0000001201e-1f;
  y = y * x * x + x + 1.f;
  union { float f; int i; } u;
  u.i = ((int)fx + 127) << 23;
  return y * u.f;
}

// Multi-head self-attention core: out = softmax(Q·Kᵀ/√dk) · V per head, for one sequence of T rows.
// scores needs T floats.
EXPORT("attention")
void attention(const f32 *Q, const f32 *K, const f32 *V, int T, int D, int heads, f32 *out, f32 *scores) {
  const int dk = D / heads;
  const float scale = 1.f / __builtin_sqrtf((float)dk);
  for (int h = 0; h < heads; h++) {
    const int off = h * dk;
    for (int i = 0; i < T; i++) {
      const f32 *q = Q + i * D + off;
      float mx = -3.4e38f;
      for (int j = 0; j < T; j++) {
        const f32 *kr = K + j * D + off;
        v128_t acc = wasm_f32x4_splat(0.f);
        int d = 0;
        for (; d + 4 <= dk; d += 4) acc = wasm_f32x4_add(acc, wasm_f32x4_mul(wasm_v128_load(q + d), wasm_v128_load(kr + d)));
        float dot = wasm_f32x4_extract_lane(acc, 0) + wasm_f32x4_extract_lane(acc, 1) +
                    wasm_f32x4_extract_lane(acc, 2) + wasm_f32x4_extract_lane(acc, 3);
        for (; d < dk; d++) dot += q[d] * kr[d];
        const float s = dot * scale;
        scores[j] = s;
        if (s > mx) mx = s;
      }
      float sum = 0.f;
      for (int j = 0; j < T; j++) { const float e = expf_(scores[j] - mx); scores[j] = e; sum += e; }
      const float inv = 1.f / sum;
      f32 *o = out + i * D + off;
      int d = 0;
      for (; d + 4 <= dk; d += 4) {
        v128_t acc = wasm_f32x4_splat(0.f);
        for (int j = 0; j < T; j++) acc = wasm_f32x4_add(acc, wasm_f32x4_mul(wasm_f32x4_splat(scores[j] * inv), wasm_v128_load(V + j * D + off + d)));
        wasm_v128_store(o + d, acc);
      }
      for (; d < dk; d++) {
        float acc = 0.f;
        for (int j = 0; j < T; j++) acc += scores[j] * inv * V[j * D + off + d];
        o[d] = acc;
      }
    }
  }
}

// Exact-erf GELU, with the same Abramowitz–Stegun erf (7.1.26) as the JS path.
EXPORT("gelu")
void gelu(f32 *x, int n) {
  for (int i = 0; i < n; i++) {
    const float v = x[i], z = v * 0.70710678118654752f;
    const float az = z < 0.f ? -z : z;
    const float t = 1.f / (1.f + 0.3275911f * az);
    const float poly = ((((1.061405429f * t - 1.453152027f) * t + 1.421413741f) * t - 0.284496736f) * t + 0.254829592f) * t;
    float e = 1.f - poly * expf_(-az * az);
    if (z < 0.f) e = -e;
    x[i] = 0.5f * v * (1.f + e);
  }
}
