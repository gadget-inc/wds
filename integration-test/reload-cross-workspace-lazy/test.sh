#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
set -e


# kill the server when this script exits
trap "kill -9 0" INT TERM
trap 'kill $(jobs -p)' EXIT

# setup the pnpm workspace with multiple packages
cd $DIR
pnpm install

# make a copy of the run.ts file in the side package for us to modify
cp $DIR/side/run.ts $DIR/side/run-scratch.ts

# run a server in the main package in the background
$DIR/../../pkg/wds.bin.js $@ --watch --commands $DIR/main/run.ts &

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

# modify the file in the side package and expect the main script to reload
sed -i 's/Hello, World/Hey, Pluto/g' $DIR/side/run-scratch.ts

echo "Made change to side package"

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
