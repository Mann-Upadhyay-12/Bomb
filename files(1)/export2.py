import sys, json, base64, numpy as np, tensorflow as tf
from train2 import backbone, head
from gen import CHARSET
bbp, hdp, out = sys.argv[1:4]
bb = backbone(); bb.load_weights(bbp); hd = head(); hd.load_weights(hdp)
def b64(a): return base64.b64encode(np.asarray(a, np.float16).tobytes()).decode()
L = bb.layers
convs = [l for l in L if isinstance(l, tf.keras.layers.Conv2D)]
bns = [l for l in L if isinstance(l, tf.keras.layers.BatchNormalization)]
strides = [(2, 2), (2, 2), (2, 1), (2, 1)]
spec = {"charset": CHARSET, "conv2d": [], "dense": [], "conv1d": [], "head": []}
for c, bn, st in zip(convs, bns, strides):
    w = c.get_weights()[0]; g, be, mu, var = bn.get_weights()
    sc = g / np.sqrt(var + bn.epsilon)
    spec["conv2d"].append({"k": w.shape[0], "cin": w.shape[2], "cout": w.shape[3], "sy": st[0], "sx": st[1], "w": b64(w * sc[None, None, None, :]), "b": b64(be - mu * sc)})
for d in [l for l in L if isinstance(l, tf.keras.layers.Dense)]:
    w, b = d.get_weights(); spec["dense"].append({"nin": w.shape[0], "nout": w.shape[1], "w": b64(w), "b": b64(b)})
for c in [l for l in L if isinstance(l, tf.keras.layers.Conv1D)]:
    w, b = c.get_weights(); spec["conv1d"].append({"k": w.shape[0], "cin": w.shape[1], "cout": w.shape[2], "w": b64(w), "b": b64(b)})
for d in [l for l in hd.layers if isinstance(l, tf.keras.layers.Dense)]:
    w, b = d.get_weights(); spec["head"].append({"nin": w.shape[0], "nout": w.shape[1], "w": b64(w), "b": b64(b)})
json.dump(spec, open(out, "w"))
print("exported", len(json.dumps(spec)) / 1e6, "MB; head layers", [(h["nin"], h["nout"]) for h in spec["head"]])
