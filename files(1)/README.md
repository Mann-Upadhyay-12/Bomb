# Captcha training v2 (CTC + Transformer)

pip install tensorflow-cpu opencv-python-headless pillow numpy      (use `tensorflow` + a GPU if you have one: ~10-30x faster)
Run everything from this folder. Real images: set CAPTCHA_DIR=/path/to/folder (files named answer.png / answer-DIFF.png).
Fonts: gen.py -> FONTS (Linux paths). Image size must be the game's native 360/434/542 x 210 (= 4/6/8 characters).

## Character set (gen.py CHARSET, 27 chars)
234579  ADEGHMNQRT  abdefhimnrt      -- everything else can only appear as a *decoy* in the background.
load_real() now SKIPS (and prints) any file whose answer has another character, or whose size does not
match its length. NOTE: 5 of the first 82 files had Y or C in the name (4EmYfm3R-HARD, CANQDf, GYeh-EASY,
QYfmM5-MID, eY4AQY-MID). If those are typos, rename them. If Y/C really occur, add them back to CHARSET.

## New model: CTC + Transformer  (model_ctc.py / train_ctc.py)
CNN stem -> 4 Transformer encoder blocks -> CTC head (blank = class 27). Decoding uses fixed_len(): the best path
that emits exactly N characters (N comes from the image width). `--arch crnn` gives a BiGRU variant instead.

  python producer.py &                                     # fake captchas into chunks/  (keep running)
  python train_ctc.py pretrain --minutes 90 --steps 12000 --stem bb_synth.weights.h5
        # bb_synth.weights.h5 (included) warm-starts the conv stem; stem stays frozen for the first 300 steps.
        # Plain CTC from scratch sat on the "all blanks" plateau for me, so keep --stem. Watch the REAL line:
        # exact / of / perchar should start rising within the first ~1-2k steps.
  python train_ctc.py cv --steps 800 --folds 5             # honest held-out accuracy -> cvstats_ctc_fold*.json
  python calibrate.py cvstats_ctc_fold                     # auto-copy cutoff
  python train_ctc.py final --steps 800                    # all real images -> ctc_final.weights.h5

Compare the CV line (`CV exact x/y`) with the old slot model's CV on the SAME images before switching:
  python train2.py 40 5000            # slot model from scratch (CHARSET changed, so old hd_synth no longer loads)
  python finetune.py cv 300           # old slot-model CV  (cvstats_fold*.json)

## Not done yet
The HTML page still runs the old slot model. A JS inference port of the Transformer (attention, LayerNorm, GELU,
fixed-length decode) plus an exporter for ctc_final.weights.h5 is still to be written -- do that only if the
CTC CV number beats the slot model.

## Old pipeline (still here)
train2.py / finetune.py / export2.py / swap_model.py / patch_html.py = the slot model that is inside the shipped HTML.
