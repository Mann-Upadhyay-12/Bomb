"""Swap a newly trained model (and confidence cutoff) into an HTML that already has the captcha module.
usage: python swap_model.py spec.json 0.7 captcha_module.html out.html"""
import sys, os, re
spec_path, thresh, html_in, html_out = sys.argv[1:5]
h = open(html_in, encoding='utf-8').read()
spec = open(spec_path).read().strip()
spec_tag_match = re.search(r'<script\s+[^>]*id=["\']captchaSpecData["\'][^>]*>', h)
if spec_tag_match:
    a = spec_tag_match.end()
    b = h.index('</script>', a)
    h = h[:a] + spec + h[b:]
elif 'const SPEC = ' in h:
    a = h.index('const SPEC = ') + len('const SPEC = ')
    b = h.index(';\nconst SIZES=', a)
    h = h[:a] + spec + h[b:]
else:
    raise ValueError('Neither captchaSpecData script tag nor const SPEC found in HTML')

h, n = re.subn(r'THRESH\s*:\s*[0-9.]+\s*\}', 'THRESH:%s}' % thresh, h)
assert n >= 1, 'THRESH not found'
out_dir = os.path.dirname(os.path.abspath(html_out))
if out_dir:
    os.makedirs(out_dir, exist_ok=True)
open(html_out, 'w', encoding='utf-8').write(h)
print('written', html_out, round(len(h) / 1e6, 2), 'MB')
