#!/bin/sh
# DailyDialog (Li et al., 2017), CC BY-NC-SA 4.0: 11,118 conversations with act and emotion
# labels, read by the Reply Concept (packs/dialogue.ncon). About 2 MB. Run from
# packages/concept-runtime; it lands in data/dialog, which is gitignored.
set -e
mkdir -p data/dialog/dumps
cd data/dialog/dumps
curl -sL -o train.zip "https://huggingface.co/datasets/roskoN/dailydialog/resolve/main/train.zip"
unzip -o -q train.zip
echo "DailyDialog in data/dialog/dumps/train"
