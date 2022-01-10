#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -e

cp $DIR/run.ts $DIR/run-scratch.ts

# kill the server when this script exits
trap "kill -9 0" INT TERM
trap 'kill $(jobs -p)' EXIT

# run a server in the background
$DIR/../../pkg/esbuild-dev.bin.js $@ --supervise --commands $DIR/run-scratch.ts &

max_retry=5
counter=0

set +e 
until curl -s localhost:8080 | grep "World"
do
   sleep 1
   [[ counter -eq $max_retry ]] && echo "Failed!" && exit 1
   echo "Trying again. Try #$counter"
   ((counter++))
done

echo "Made initial request to server"

# modify it and expect it to start serving the new contents
sed -i 's/Hello, World/Hey, Pluto/g' $DIR/run-scratch.ts

counter=0
until curl -s localhost:8080 | grep "Pluto"
do
   sleep 1
   [[ counter -eq $max_retry ]] && echo "Failed!" && exit 1
   echo "Trying again. Try #$counter"
   ((counter++))
done

echo "Made new request to reloaded server"

exit 0