#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -ex

$DIR/../../pkg/esbuild-dev.bin.js $DIR/run.ts 2>&1 | grep "sourcemap/utils.ts:7"
echo "Found correct source location"