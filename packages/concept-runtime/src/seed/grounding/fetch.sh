#!/bin/sh
# Download the three dumps the grounding layers are built from (README.md beside this).
# Sizes are the Content-Length the servers reported on 2026-09-23. Not run by the build or
# the tests; run it by hand once the licenses are accepted.
set -eu
DUMPS="$(dirname "$0")/../../../data/grounding/dumps"
mkdir -p "$DUMPS"
cd "$DUMPS"

# NGSL 1.2 stats (lemma list in rank order). CC BY-SA 4.0. 62,566 bytes.
curl -fL -o NGSL_1.2_stats.csv \
  https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv

# Open English WordNet 2024, WN-LMF XML. CC BY 4.0. 12,912,118 bytes gzipped.
curl -fL -o english-wordnet-2024.xml.gz \
  https://en-word.net/downloads/english-wordnet-2024.xml.gz

# ConceptNet 5.7.0 assertions. CC BY-SA 4.0. 497,963,447 bytes gzipped (about 10 GB raw;
# the build streams it and never unpacks it to disk).
curl -fL -o conceptnet-assertions-5.7.0.csv.gz \
  https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz

ls -l
