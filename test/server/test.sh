#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -ex

# kill the server when this script exits
trap "exit" INT TERM
trap "kill 0" EXIT

$DIR/../../pkg/esbuild-dev.bin.js --commands $DIR/run.ts &

max_retry=5
counter=0
until curl localhost:8080 | grep "Hello"
do
   sleep 1
   [[ counter -eq $max_retry ]] && echo "Failed!" && exit 1
   echo "Trying again. Try #$counter"
   ((counter++))
done

exit 0