import os, time, random, numpy as np, cv2, gen, gen2

def generate_chunk(k, rng, chunk_dir='chunks', batch_size=500):
    os.makedirs(chunk_dir, exist_ok=True)
    N = (4, 6, 8)[k % 3]
    X, T = [], []
    for _ in range(batch_size):
        t = gen.rand_text(N, rng)
        X.append(gen2.render(t, rng, rng.uniform(0.35, 1.0)))
        T.append(t)
    tmp_path = os.path.join(chunk_dir, f'c{k:06d}_tmp')
    out_path = os.path.join(chunk_dir, f'c{k:06d}.npz')
    np.savez(tmp_path, X=np.stack(X), T=np.array(T))
    os.rename(tmp_path + '.npz', out_path)
    return out_path

if __name__ == '__main__':
    os.makedirs('chunks', exist_ok=True)
    rng = random.Random(12345)
    k = 0
    while True:
        pending = [f for f in os.listdir('chunks') if f.endswith('.npz') and not f.endswith('_tmp.npz')]
        if len(pending) >= 8:
            time.sleep(2)
            continue
        generate_chunk(k, rng, 'chunks', 500)
        k += 1
