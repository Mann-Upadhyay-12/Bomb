// Otsu's thresholding algorithm for binarizing 8-bit luminance arrays

export function computeOtsuThreshold(lumArray) {
  const histogram = new Int32Array(256);
  const total = lumArray.length;
  for (let i = 0; i < total; i++) {
    histogram[lumArray[i]]++;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }
  let sumB = 0, wB = 0, wF = 0;
  let maxVar = -1, threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }
  return threshold;
}
