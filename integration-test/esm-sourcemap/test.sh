#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -ex

$DIR/../../pkg/wds.bin.js $DIR/run.ts 2>&1 | tee /dev/stderr | grep "sourcemap/utils.ts:7"
echo "Found correct source location"