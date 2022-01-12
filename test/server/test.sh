#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -e

# kill the server when this script exits
trap "kill -9 0" INT TERM
trap 'kill $(jobs -p)' EXIT

$DIR/../../pkg/esbuild-dev.bin.js $@ $DIR/run.ts &

max_retry=5
counter=0

set +e
until curl -s localhost:8080 | grep "Hello"
do
   sleep 1
   [[ counter -eq $max_retry ]] && echo "Failed!" && exit 1
   echo "Trying again. Try #$counter"
   ((counter++))
done

echo "Made request to server"

exit 0