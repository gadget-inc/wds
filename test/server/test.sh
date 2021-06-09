#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -ex

$DIR/../../pkg/esbuild-dev.bin.js --supervise --commands $DIR/run.ts