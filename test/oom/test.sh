#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -ex

$DIR/../../pkg/esbuild-dev.bin.js --max-old-space-size=50 $DIR/run.ts