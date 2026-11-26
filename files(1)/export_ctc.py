#!/usr/bin/env python3
"""
export_ctc.py — trained CTC Transformer weights (model_ctc.py) → spec_ctc.json, the JSON the app runs
(src/heist/captcha/captchaSpec.js). The work is done by spec_io.model_to_spec.

    python export_ctc.py [weights.h5] [out.json] [--weights fp16|int8_channel|int8_tensor|int4_g32]
"""
import os, sys, json, argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)


def export_ctc_spec(weights_path, out_json_path, thresh=0.85, cfg=None, scheme='fp16'):
    from model_ctc import build, CFG
    from spec_io import model_to_spec
    if cfg is None:
        p = os.path.join(SCRIPT_DIR, 'ctc_cfg.json')
        cfg = json.load(open(p)) if os.path.exists(p) else dict(CFG)
    model = build(**cfg); model.load_weights(weights_path)
    spec = model_to_spec(model, cfg, thresh, scheme)
    out_dir = os.path.dirname(os.path.abspath(out_json_path))
    os.makedirs(out_dir, exist_ok=True)
    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump(spec, f)
    print(f'Exported CTC Transformer model spec to {out_json_path} '
          f'({os.path.getsize(out_json_path) / 1048576:.2f} MB, {scheme} weights)')
    return spec


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('weights', nargs='?', default=os.path.join(SCRIPT_DIR, 'ctc_final.weights.h5'))
    ap.add_argument('out', nargs='?', default=os.path.join(SCRIPT_DIR, '..', 'build', 'spec_ctc.json'))
    ap.add_argument('--thresh', type=float, default=0.85)
    ap.add_argument('--weights', default='fp16', dest='scheme')
    a = ap.parse_args()
    export_ctc_spec(a.weights, a.out, a.thresh, scheme=a.scheme)
