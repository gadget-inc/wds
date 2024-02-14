#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -ex

$DIR/../../pkg/wds.bin.js $@ --max-old-space-size=50 $DIR/run.ts 2>&1 | grep "ReportOOMFailure"

echo "found OOM failure"